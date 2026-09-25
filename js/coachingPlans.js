/* ==========================================
   Southbound — Coaching plans (Firestore)

   The coach owns the prescription:
     coachingPlanDrafts/{planId}           coach's work in progress (coach only)
     coachingPlans/{planId}                the published plan's header
     coachingPlans/{planId}/versions/{n}   each published version, never changed

   Publishing writes version n+1 and bumps the header in one batch
   (firestore.rules checks they match), then clears the draft. The
   client's app copies the newest version onto the device
   (js/coachPlanSync.js) and records "viewed" / "got it" on the header.

   Plan shape and change lists: js/coachingPlanModel.js.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { stripRuntime, recalcPlannedMiles, planDateRange, diffPlans, changeLines } from "./coachingPlanModel.js";
import { sendPlanPublishedEmail } from "./emailNotify.js";

const withId = snap => ({ id: snap.id, ...snap.data() });

async function me() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    return user;
}

export function newPlanId() {
    return doc(collection(db, "coachingPlans")).id;
}

// ---------- Coach ----------

export async function listPlansForClient(clientUid) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "coachingPlans"),
        where("coachUid", "==", user.uid), where("clientUid", "==", clientUid)));
    return snap.docs.map(withId);
}

export async function listDraftsForClient(clientUid) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "coachingPlanDrafts"),
        where("coachUid", "==", user.uid), where("clientUid", "==", clientUid)));
    return snap.docs.map(withId);
}

export async function saveDraft(planId, { clientUid, name, kind, plan, basedOnVersion = 0, adoptedFrom = null, isNew = false }) {
    const user = await me();
    const draft = {
        coachUid: user.uid,
        clientUid,
        name: String(name || "Training plan").slice(0, 120),
        kind,
        plan: recalcPlannedMiles(stripRuntime(plan)),
        basedOnVersion,
        adoptedFrom: adoptedFrom || null,
        updatedAt: serverTimestamp()
    };
    if (isNew) draft.createdAt = serverTimestamp();
    await setDoc(doc(db, "coachingPlanDrafts", planId), draft, { merge: true });
    return { id: planId, ...draft, updatedAt: Date.now() };
}

export async function deleteDraft(planId) {
    await deleteDoc(doc(db, "coachingPlanDrafts", planId));
}

export async function getVersion(planId, version) {
    const snap = await getDoc(doc(db, "coachingPlans", planId, "versions", String(version)));
    return snap.exists() ? withId(snap) : null;
}

// Every published version of a plan, newest first.
export async function listVersions(planId, { asClient = false } = {}) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "coachingPlans", planId, "versions"),
        where(asClient ? "clientUid" : "coachUid", "==", user.uid)));
    return snap.docs.map(withId).sort((a, b) => b.version - a.version);
}

// What publishing this draft would change for the client.
export function previewChanges(previousPlan, nextPlan) {
    return previousPlan ? diffPlans(stripRuntime(previousPlan), stripRuntime(nextPlan)) : [];
}

/**
 * Publish a draft to the client.
 *   header        the current coachingPlans header (null on first publish)
 *   previousPlan  the plan in the current published version (null on first)
 * Returns the updated header.
 */
export async function publishPlan({ planId, clientUid, clientName, clientEmail, name, kind, plan, coachNote = "", header = null, previousPlan = null, adoptedFrom = null }) {
    const user = await me();
    const clean = recalcPlannedMiles(stripRuntime(plan));
    const nextVersion = (header?.version || 0) + 1;
    const lines = header ? changeLines(previewChanges(previousPlan, clean), { limit: 30 }) : [];
    if (header && header.name && header.name !== name) lines.unshift(`Renamed to "${name}"`);
    const { startDate, endDate } = planDateRange(clean);
    const coachName = String(user.displayName || "Your coach").slice(0, 100);
    const note = String(coachNote || "").trim().slice(0, 2000);

    const batch = writeBatch(db);
    batch.set(doc(db, "coachingPlans", planId, "versions", String(nextVersion)), {
        coachUid: user.uid,
        clientUid,
        planId,
        version: nextVersion,
        name,
        kind,
        plan: clean,
        changes: lines,
        coachNote: note,
        publishedAt: serverTimestamp()
    });
    const common = {
        name, kind, status: "active", version: nextVersion, publishedAt: serverTimestamp(),
        coachNote: note, changes: lines, startDate, endDate, updatedAt: serverTimestamp(), coachName
    };
    if (header) {
        batch.update(doc(db, "coachingPlans", planId), common);
    } else {
        batch.set(doc(db, "coachingPlans", planId), {
            ...common,
            coachUid: user.uid,
            clientUid,
            createdAt: serverTimestamp(),
            viewedVersion: 0, viewedAt: null,
            ackVersion: 0, ackAt: null,
            adoptedFrom: adoptedFrom || null
        });
    }
    await batch.commit();
    await deleteDraft(planId).catch(() => {});

    sendPlanPublishedEmail({ clientEmail, clientName, coachName, planName: name, firstVersion: !header });

    return {
        ...(header || { id: planId, coachUid: user.uid, clientUid, viewedVersion: 0, ackVersion: 0, adoptedFrom }),
        ...common,
        id: planId,
        publishedAt: Date.now(),
        updatedAt: Date.now()
    };
}

export async function setPlanArchived(planId, archived) {
    const user = await me();
    const snap = await getDoc(doc(db, "coachingPlans", planId));
    if (!snap.exists()) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "coachingPlans", planId), {
        status: archived ? "archived" : "active",
        updatedAt: serverTimestamp(),
        coachName: String(user.displayName || snap.data().coachName || "Your coach").slice(0, 100)
    });
    await batch.commit();
}

// ---------- Client ----------

export async function listMyPlans() {
    const user = await me();
    const snap = await getDocs(query(collection(db, "coachingPlans"), where("clientUid", "==", user.uid)));
    return snap.docs.map(withId);
}

export async function markPlanViewed(plan) {
    if (!plan || (plan.viewedVersion || 0) >= plan.version) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "coachingPlans", plan.id), { viewedVersion: plan.version, viewedAt: serverTimestamp() });
    await batch.commit();
}

export async function acknowledgePlan(plan) {
    if (!plan || (plan.ackVersion || 0) >= plan.version) return;
    const patch = { ackVersion: plan.version, ackAt: serverTimestamp() };
    if ((plan.viewedVersion || 0) < plan.version) Object.assign(patch, { viewedVersion: plan.version, viewedAt: serverTimestamp() });
    const batch = writeBatch(db);
    batch.update(doc(db, "coachingPlans", plan.id), patch);
    await batch.commit();
}
