/* ==========================================
   Southbound — workout results (Firestore)

   What the client actually did on a planned day of a coach's plan:
   workoutResults/{clientUid}_{planId}_{date}
     { clientUid, coachUid, planId, planVersion, date, title, plannedMiles,
       status: "completed" | "skipped", distance (mi), durationSec, rpe 1-10,
       pain, painNote, note, createdAt, updatedAt,
       coachComment, coachCommentAt }         <- only the coach writes these
   Kept apart from the prescription (coachingPlans) on purpose: the plan
   says what to do, this says what happened. The client's device copy of
   the plan also gets the done / skipped mark (so Today and My Plan
   agree), via js/coachPlanStore.js.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { loadCoachPlans, saveCoachPlans } from "./coachPlanStore.js";
import { sendPainFlagEmail } from "./emailNotify.js";

const withId = snap => ({ id: snap.id, ...snap.data() });

async function me() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    return user;
}

export const resultId = (clientUid, planId, date) => `${clientUid}_${planId}_${date}`;

const EDITABLE = ["status", "distance", "durationSec", "rpe", "pain", "painNote", "note", "title", "plannedMiles", "planVersion"];

function clean(input) {
    const numOrNull = (v, max) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(max, Number(v))));
    const rpe = Number.isInteger(Number(input.rpe)) && Number(input.rpe) >= 1 && Number(input.rpe) <= 10 ? Number(input.rpe) : null;
    const durationSec = numOrNull(input.durationSec, 172800);
    const skipped = input.status === "skipped";
    return {
        status: skipped ? "skipped" : "completed",
        distance: skipped ? null : (numOrNull(input.distance, 200) === null ? null : Math.round(numOrNull(input.distance, 200) * 100) / 100),
        durationSec: skipped || durationSec === null ? null : Math.round(durationSec),
        rpe: skipped ? null : rpe,
        pain: Boolean(input.pain),
        painNote: input.pain ? String(input.painNote || "").trim().slice(0, 300) : "",
        note: String(input.note || "").trim().slice(0, 1000),
        title: String(input.title || "Workout").slice(0, 120),
        plannedMiles: Math.max(0, Math.min(200, Number(input.plannedMiles) || 0)),
        planVersion: Math.max(1, Number(input.planVersion) || 1)
    };
}

// Client: every result I've logged (optionally for one plan).
export async function listMyResults(planId = null) {
    const user = await me();
    const filters = [where("clientUid", "==", user.uid)];
    if (planId) filters.push(where("planId", "==", planId));
    const snap = await getDocs(query(collection(db, "workoutResults"), ...filters));
    return snap.docs.map(withId);
}

/**
 * Client: save how a planned workout went. `existing` is the result as
 * loaded (or null for a first log). Also marks the day done / skipped on
 * this device's copy of the plan. Returns the saved result.
 */
export async function saveMyResult({ planId, coachUid, date, clientName, coachEmailHint, ...fields }, existing = null) {
    const user = await me();
    const id = resultId(user.uid, planId, date);
    const values = clean(fields);
    if (existing) {
        const patch = Object.fromEntries(EDITABLE.map(k => [k, values[k]]));
        await updateDoc(doc(db, "workoutResults", id), { ...patch, updatedAt: serverTimestamp() });
    } else {
        await setDoc(doc(db, "workoutResults", id), {
            clientUid: user.uid, coachUid, planId, date, ...values,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            coachComment: "", coachCommentAt: null
        });
    }
    await markLocal(planId, date, values.status === "completed"
        ? { completed: true, skipped: false, resultId: id, actualDistance: values.distance, actualDuration: values.durationSec, rpe: values.rpe, pain: values.pain }
        : { completed: false, skipped: true, resultId: id, actualDistance: null, actualDuration: null, rpe: null, pain: values.pain });
    if (values.pain && (!existing?.pain || existing.painNote !== values.painNote)) {
        sendPainFlagEmail({ clientName: clientName || user.displayName, date, title: values.title, painNote: values.painNote });
    }
    return { ...(existing || { id, clientUid: user.uid, coachUid, planId, date, coachComment: "", coachCommentAt: null }), ...values, id, updatedAt: Date.now() };
}

export async function deleteMyResult(result) {
    await deleteDoc(doc(db, "workoutResults", result.id));
    await markLocal(result.planId, result.date, { completed: false, skipped: false, resultId: null, actualDistance: null, actualDuration: null, rpe: null, pain: null });
}

// The day on this device's copy of the coach plan.
async function markLocal(planId, date, patch) {
    const plans = loadCoachPlans();
    const plan = plans.find(p => p.coachPlanId === planId);
    const day = plan?.generatedPlan?.weeks?.flatMap(w => w.days || []).find(d => d.date === date);
    if (!day) return;
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === false) delete day[k]; else day[k] = v;
    }
    if (patch.completed) day.completedAt = new Date().toISOString();
    await saveCoachPlans(plans);
}

// ---------- Coach ----------

export async function listResultsForClient(clientUid) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "workoutResults"),
        where("coachUid", "==", user.uid), where("clientUid", "==", clientUid)));
    return snap.docs.map(withId).sort((a, b) => b.date.localeCompare(a.date));
}

export async function commentOnResult(id, text) {
    await updateDoc(doc(db, "workoutResults", id), {
        coachComment: String(text || "").trim().slice(0, 1000),
        coachCommentAt: serverTimestamp()
    });
}
