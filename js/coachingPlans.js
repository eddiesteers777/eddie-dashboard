/* ==========================================
   Southbound — Coaching plans (Firestore)

   The coach owns the prescription:
     coachingPlanDrafts/{planId}           coach's work in progress (coach only)
     coachingPlanMasters/{planId}          the whole published plan (coach only)
     coachingPlans/{planId}                the published plan's header
     coachingPlans/{planId}/versions/{n}   each published version, never changed

   Publishing writes version n+1, bumps the header and saves the whole
   plan as the master in one batch (firestore.rules checks they match),
   then clears the draft. A version holds only what the client may see:
   this week and next (js/planWindow.js), unless the coach shows the
   whole plan (header.showAll). Each week the coach's app opens the next
   week (releasePlan, run by js/planRelease.js): another version, no
   email, no "updated" notice (header.noticeVersion stays).
   The client's app copies the newest version onto the device
   (js/coachPlanSync.js) and records "viewed" / "got it" on the header.

   Plan shape and change lists: js/coachingPlanModel.js.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { stripRuntime, recalcPlannedMiles, planDateRange, diffPlans, changeLines, isoDate } from "./coachingPlanModel.js";
import { releaseThrough, windowPlan, visibleChanges, noticeVersionOf, awaitingAck, awaitingView } from "./planWindow.js";
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

// Every plan this coach has published, for every client (js/planRelease.js).
export async function listMyCoachPlans() {
    const user = await me();
    const snap = await getDocs(query(collection(db, "coachingPlans"), where("coachUid", "==", user.uid)));
    return snap.docs.map(withId);
}

// The whole published plan, weeks the client can't see yet included.
// null for plans published before masters existed (their versions are whole).
export async function getMaster(planId) {
    const snap = await getDoc(doc(db, "coachingPlanMasters", planId));
    return snap.exists() ? withId(snap) : null;
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
 * What publishing would show the client:
 *   { through, lines (what they'll see changed), hidden (changes in weeks
 *     they can't see yet), notice (email + "updated" card) }
 */
export function publishPreview({ header = null, previousPlan = null, plan, name, coachNote = "", showAll = false, today = isoDate(new Date()) }) {
    const clean = recalcPlannedMiles(stripRuntime(plan));
    const { endDate } = planDateRange(clean);
    const through = showAll ? (endDate || null) : releaseThrough(clean, today);
    const all = header ? previewChanges(previousPlan, clean) : [];
    const seen = visibleChanges(all, showAll ? null : through);
    const lines = changeLines(seen, { limit: 30 });
    if (header && header.name && name && header.name !== name) lines.unshift(`Renamed to "${name}"`);
    const note = String(coachNote || "").trim().slice(0, 2000);
    return { clean, through, lines, hidden: all.length - seen.length, note, notice: !header || lines.length > 0 || note.length > 0 };
}

/**
 * Publish a draft to the client.
 *   header        the current coachingPlans header (null on first publish)
 *   previousPlan  the whole plan last published (the master; null on first)
 *   showAll       show the whole plan instead of this week and next
 * Returns the updated header (with notice: whether the client was told).
 */
export async function publishPlan({ planId, clientUid, clientName, clientEmail, name, kind, plan, coachNote = "", header = null, previousPlan = null, adoptedFrom = null, showAll = false, today = isoDate(new Date()) }) {
    const user = await me();
    // The header as it is now: the coach's app may have opened a week since the hub loaded.
    let current = header;
    if (header) {
        const snap = await getDoc(doc(db, "coachingPlans", planId));
        if (snap.exists()) current = { ...header, ...withId(snap) };
    }
    const { clean, through, lines, note, notice } = publishPreview({ header: current, previousPlan, plan, name, coachNote, showAll, today });
    const nextVersion = (current?.version || 0) + 1;
    const { startDate, endDate } = planDateRange(clean);
    const coachName = String(user.displayName || "Your coach").slice(0, 100);

    const batch = writeBatch(db);
    batch.set(doc(db, "coachingPlans", planId, "versions", String(nextVersion)), {
        coachUid: user.uid,
        clientUid,
        planId,
        version: nextVersion,
        name,
        kind,
        plan: windowPlan(clean, showAll ? null : through),
        changes: notice ? lines : [],
        coachNote: notice ? note : "",
        publishedAt: serverTimestamp(),
        releasedThrough: through,
        auto: false
    });
    const common = {
        name, kind, status: "active", version: nextVersion, publishedAt: serverTimestamp(),
        startDate, endDate, updatedAt: serverTimestamp(), coachName,
        releasedThrough: through, showAll: Boolean(showAll),
        noticeVersion: notice ? nextVersion : Math.min(noticeVersionOf(current) || nextVersion, nextVersion),
        // Nothing they can see changed: keep the last update's note and list.
        ...(notice ? { coachNote: note, changes: lines } : {})
    };
    if (current) {
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
    batch.set(doc(db, "coachingPlanMasters", planId), {
        coachUid: user.uid, clientUid, plan: clean, version: nextVersion, updatedAt: serverTimestamp()
    });
    await batch.commit();
    await deleteDraft(planId).catch(() => {});

    if (notice) sendPlanPublishedEmail({ clientEmail, clientName, coachName, planName: name, firstVersion: !current });

    return {
        ...(current || { id: planId, coachUid: user.uid, clientUid, viewedVersion: 0, ackVersion: 0, adoptedFrom }),
        ...common,
        ...(notice ? {} : { coachNote: current?.coachNote || "", changes: current?.changes || [] }),
        id: planId,
        plan: clean,
        notice,
        publishedAt: Date.now(),
        updatedAt: Date.now()
    };
}

/**
 * Open the client's next week(s): a new version cut from the whole plan
 * through `through`. No email, no notice, the publish date stays.
 */
export async function releasePlan(header, masterPlan, through) {
    const user = await me();
    const nextVersion = (header.version || 0) + 1;
    const batch = writeBatch(db);
    batch.set(doc(db, "coachingPlans", header.id, "versions", String(nextVersion)), {
        coachUid: user.uid,
        clientUid: header.clientUid,
        planId: header.id,
        version: nextVersion,
        name: header.name,
        kind: header.kind,
        plan: windowPlan(recalcPlannedMiles(stripRuntime(masterPlan)), through),
        changes: [],
        coachNote: "",
        publishedAt: serverTimestamp(),
        releasedThrough: through,
        auto: true
    });
    batch.update(doc(db, "coachingPlans", header.id), {
        version: nextVersion, releasedThrough: through, updatedAt: serverTimestamp()
    });
    await batch.commit();
    return { ...header, version: nextVersion, releasedThrough: through };
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

// Only real updates count (opening the next week isn't one): see js/planWindow.js.
export async function markPlanViewed(plan) {
    if (!plan || !awaitingView(plan)) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "coachingPlans", plan.id), { viewedVersion: plan.version, viewedAt: serverTimestamp() });
    await batch.commit();
}

export async function acknowledgePlan(plan) {
    if (!plan || !awaitingAck(plan)) return;
    const patch = { ackVersion: plan.version, ackAt: serverTimestamp() };
    if ((plan.viewedVersion || 0) < plan.version) Object.assign(patch, { viewedVersion: plan.version, viewedAt: serverTimestamp() });
    const batch = writeBatch(db);
    batch.update(doc(db, "coachingPlans", plan.id), patch);
    await batch.commit();
}
