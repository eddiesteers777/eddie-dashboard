/* ==========================================
   Southbound — session plans (sessionPlans/{coachUid}_{key}_{date})

   A practice plan the coach attaches to one session so the people booked
   on it can see what's coming. Model: js/sessionPlanModel.js. Rules:
   firestore.rules (validSessionPlan).
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { cleanPlan, validPlan, planId } from "./sessionPlanModel.js";

// Coach: every plan they attached. Client: every plan for a session they are booked on.
export async function listMyPlans(role = "coach") {
    const user = await waitForUser();
    if (!user) return [];
    const q = role === "client"
        ? query(collection(db, "sessionPlans"), where("clientUids", "array-contains", user.uid))
        : query(collection(db, "sessionPlans"), where("coachUid", "==", user.uid));
    return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function savePlan(input) {
    const user = await waitForUser();
    const plan = cleanPlan(input);
    const problem = validPlan(plan);
    if (problem) throw new Error(problem);
    const id = planId(user.uid, plan.key, plan.date);
    await setDoc(doc(db, "sessionPlans", id), { coachUid: user.uid, ...plan, updatedAt: serverTimestamp() });
    return { id, coachUid: user.uid, ...plan };
}

export async function deletePlan(key, date) {
    const user = await waitForUser();
    await deleteDoc(doc(db, "sessionPlans", planId(user.uid, key, date)));
}

// ---- The coach's wrap-up working copy (sessionWraps, coach only) ----

export async function getWrap(key, date) {
    const user = await waitForUser();
    if (!user) return null;
    const snap = await getDoc(doc(db, "sessionWraps", planId(user.uid, key, date)));
    return snap.exists() ? snap.data() : null;
}

export async function saveWrap(key, date, wrap, { sent = false } = {}) {
    const user = await waitForUser();
    const data = { coachUid: user.uid, key, date, missed: wrap.missed || [], parts: wrap.parts || [], summary: wrap.summary || "", lines: wrap.lines || {}, updatedAt: serverTimestamp() };
    if (sent) data.sentAt = serverTimestamp();
    else if (wrap.sentAt) data.sentAt = wrap.sentAt;
    await setDoc(doc(db, "sessionWraps", planId(user.uid, key, date)), data);
}

// ---- The coach's private notes per part (sessionPlanNotes, coach only) ----

export async function getPlanNotes(key, date) {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDoc(doc(db, "sessionPlanNotes", planId(user.uid, key, date)));
    const notes = snap.exists() ? snap.data().notes : [];
    return Array.isArray(notes) ? notes.map(n => String(n ?? "")) : [];
}

export async function savePlanNotes(key, date, notes = []) {
    const user = await waitForUser();
    const list = (Array.isArray(notes) ? notes : []).slice(0, 12).map(n => String(n ?? "").slice(0, 300));
    const ref = doc(db, "sessionPlanNotes", planId(user.uid, key, date));
    if (!list.some(Boolean)) { await deleteDoc(ref).catch(() => {}); return; }
    await setDoc(ref, { coachUid: user.uid, key, date, notes: list, updatedAt: serverTimestamp() });
}
