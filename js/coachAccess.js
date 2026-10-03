/* ==========================================
   Southbound — Coach / Client Plan Access

   Lets a coach (any signed-in account) get edit access to a
   client's Training Plans and Race/Running Plans only -- never
   their nutrition, strength, gear, or other private data. Two
   pieces make that possible:

   1. coachLinks/{coachUid}_{clientUid} -- the relationship between
      one coach and one client. It can be created directly by an
      approved coach for an active client account, or through the
      legacy one-time client invite-code flow.
   2. sharedPlans/{clientUid} -- a mirror of just the client's
      training-programs and running-programs localStorage keys,
      plus coach notes. The client's device keeps this mirror
      current on every regular cloud sync; a linked coach reads
      and writes it directly. Firestore Security Rules (see
      firestore.rules in the repo root) are the actual gatekeeper
      -- this module just calls the SDK, it grants no access by
      itself.
========================================== */

import { db } from "./firebase.js";
import { waitForUser, getCurrentUser } from "./auth.js";
import {
    doc, getDoc, setDoc, deleteDoc, writeBatch,
    collection, query, where, getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { setLocalCoachNotes, getLocalCoachNotes } from "./coachNotesLocal.js";

export { getLocalCoachNotes };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches the 7-day limit in firestore.rules

function randomCode(len = 6) {
    let out = "";
    for (let i = 0; i < len; i++) out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return out;
}

function sharedPlanDoc(clientUid) {
    return doc(db, "sharedPlans", clientUid);
}

function wearableShareDoc(coachUid, clientUid) {
    return doc(db, "wearableShares", coachUid + "_" + clientUid);
}

export async function readWearableShare(coachUid, clientUid) {
    if (!coachUid || !clientUid) return null;
    const snap = await getDoc(wearableShareDoc(coachUid, clientUid));
    return snap.exists() ? snap.data() : null;
}

export async function listMyWearableShares() {
    const coaches = await listMyCoaches();
    return Promise.all(coaches.map(async link => ({
        link,
        share: await readWearableShare(link.coachUid, link.clientUid)
    })));
}

export async function saveWearableShare(coachUid, permissions = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const clean = {
        activity: permissions.activity === true,
        performance: permissions.performance === true,
        recovery: permissions.recovery === true
    };
    const active = clean.activity || clean.performance || clean.recovery;
    const ref = wearableShareDoc(coachUid, user.uid);
    // A share that doesn't exist yet can't be read (the rule reads the
    // stored doc), so a refused read means "first time": every first share
    // failed before this (2026-10-03).
    const exists = await getDoc(ref).then(snap => snap.exists(), error => {
        if (error?.code === "permission-denied") return false;
        throw error;
    });
    const payload = {
        version: 1,
        coachUid,
        clientUid: user.uid,
        status: active ? "active" : "revoked",
        permissions: clean,
        updatedAt: serverTimestamp()
    };
    if (!exists) payload.createdAt = serverTimestamp();
    await setDoc(ref, payload, { merge: true });
    return { ...payload, active };
}

function sharedWearableActivityDoc(coachUid, clientUid) {
    return doc(db, "sharedWearableActivity", coachUid + "_" + clientUid);
}

export async function readSharedWearableActivity(coachUid, clientUid) {
    if (!coachUid || !clientUid) return null;
    const snap = await getDoc(sharedWearableActivityDoc(coachUid, clientUid));
    return snap.exists() ? snap.data() : null;
}

export async function writeSharedWearableActivity(coachUid, payload = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const recentRuns = Array.isArray(payload.recentRuns)
        ? payload.recentRuns.slice(0, 8).map(run => ({
            date: String(run?.date || ""),
            startTime: String(run?.startTime || ""),
            distanceMiles: Number(run?.distanceMiles) || 0,
            durationSeconds: Math.max(0, Math.round(Number(run?.durationSeconds) || 0))
        }))
        : [];

    const clean = {
        version: 1,
        source: "coros",
        coachUid,
        clientUid: user.uid,
        windowFrom: String(payload.windowFrom || ""),
        windowTo: String(payload.windowTo || ""),
        summary: {
            runCount: Math.max(0, Math.round(Number(payload.summary?.runCount) || 0)),
            distanceMiles: Math.max(0, Number(payload.summary?.distanceMiles) || 0),
            durationSeconds: Math.max(0, Math.round(Number(payload.summary?.durationSeconds) || 0))
        },
        recentRuns,
        updatedAt: serverTimestamp()
    };

    await setDoc(sharedWearableActivityDoc(coachUid, user.uid), clean);
    return clean;
}

export async function deleteSharedWearableActivity(coachUid, clientUid) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (clientUid !== user.uid) throw new Error("not-your-shared-activity");
    await deleteDoc(sharedWearableActivityDoc(coachUid, clientUid));
}

function sharedWearablePerformanceDoc(coachUid, clientUid) {
    return doc(db, "sharedWearablePerformance", coachUid + "_" + clientUid);
}

export async function readSharedWearablePerformance(coachUid, clientUid) {
    if (!coachUid || !clientUid) return null;
    const snap = await getDoc(sharedWearablePerformanceDoc(coachUid, clientUid));
    return snap.exists() ? snap.data() : null;
}

export async function writeSharedWearablePerformance(coachUid, payload = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const recentRuns = Array.isArray(payload.recentRuns)
        ? payload.recentRuns.slice(0, 8).map(run => ({
            date: String(run?.date || ""),
            startTime: String(run?.startTime || ""),
            distanceMiles: Number(run?.distanceMiles) || 0,
            durationSeconds: Math.max(0, Math.round(Number(run?.durationSeconds) || 0)),
            paceSecondsPerMile: Math.max(0, Math.round(Number(run?.paceSecondsPerMile) || 0)),
            avgHeartRate: Math.max(0, Math.round(Number(run?.avgHeartRate) || 0))
        }))
        : [];

    const summary = payload.summary || {};
    const clean = {
        version: 1,
        source: "coros",
        coachUid,
        clientUid: user.uid,
        windowFrom: String(payload.windowFrom || ""),
        windowTo: String(payload.windowTo || ""),
        summary: {
            runCount: Math.max(0, Math.round(Number(summary.runCount) || 0)),
            averagePaceSecondsPerMile: positivePerformanceNumber(summary.averagePaceSecondsPerMile),
            averageHeartRate: positivePerformanceNumber(summary.averageHeartRate),
            bestPaceSecondsPerMile: positivePerformanceNumber(summary.bestPaceSecondsPerMile),
            bestPaceDistanceMiles: positivePerformanceNumber(summary.bestPaceDistanceMiles),
            vo2Max: positivePerformanceNumber(summary.vo2Max),
            thresholdPaceSecondsPerMile: positivePerformanceNumber(summary.thresholdPaceSecondsPerMile),
            marathonPrediction: String(summary.marathonPrediction || ""),
            trainingLoadRatio: positivePerformanceNumber(summary.trainingLoadRatio),
            shortTermLoad: positivePerformanceNumber(summary.shortTermLoad),
            longTermLoad: positivePerformanceNumber(summary.longTermLoad)
        },
        recentRuns,
        updatedAt: serverTimestamp()
    };

    await setDoc(sharedWearablePerformanceDoc(coachUid, user.uid), clean);
    return clean;
}

function positivePerformanceNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export async function deleteSharedWearablePerformance(coachUid, clientUid) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (clientUid !== user.uid) throw new Error("not-your-shared-performance");
    await deleteDoc(sharedWearablePerformanceDoc(coachUid, clientUid));
}

function sharedWearableRecoveryDoc(coachUid, clientUid) {
    return doc(db, "sharedWearableRecovery", coachUid + "_" + clientUid);
}

export async function readSharedWearableRecovery(coachUid, clientUid) {
    if (!coachUid || !clientUid) return null;
    const snap = await getDoc(sharedWearableRecoveryDoc(coachUid, clientUid));
    return snap.exists() ? snap.data() : null;
}

export async function writeSharedWearableRecovery(coachUid, payload = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const summary = payload.summary || {};
    const recentDays = Array.isArray(payload.recentDays)
        ? payload.recentDays.slice(0, 8).map(day => ({
            date: String(day?.date || ""),
            sleepScore: numberOrNull(day?.sleepScore),
            asleepMinutes: numberOrNull(day?.asleepMinutes),
            hrvAvg: numberOrNull(day?.hrvAvg),
            hrvStatus: String(day?.hrvStatus || ""),
            restingHeartRate: numberOrNull(day?.restingHeartRate),
            stressAvg: numberOrNull(day?.stressAvg),
            stressLevel: String(day?.stressLevel || ""),
            recoveryPercent: numberOrNull(day?.recoveryPercent),
            recoveryStatus: String(day?.recoveryStatus || ""),
            recoveryHours: numberOrNull(day?.recoveryHours)
        }))
        : [];

    const clean = {
        version: 1,
        source: "coros",
        coachUid,
        clientUid: user.uid,
        windowFrom: String(payload.windowFrom || ""),
        windowTo: String(payload.windowTo || ""),
        summary: {
            daysWithData: Math.max(0, Math.round(Number(summary.daysWithData) || 0)),
            averageSleepScore: numberOrNull(summary.averageSleepScore),
            averageAsleepMinutes: numberOrNull(summary.averageAsleepMinutes),
            averageHrv: numberOrNull(summary.averageHrv),
            averageRestingHeartRate: numberOrNull(summary.averageRestingHeartRate),
            averageStress: numberOrNull(summary.averageStress),
            averageRecoveryPercent: numberOrNull(summary.averageRecoveryPercent),
            latestSleepScore: numberOrNull(summary.latestSleepScore),
            latestAsleepMinutes: numberOrNull(summary.latestAsleepMinutes),
            latestHrv: numberOrNull(summary.latestHrv),
            latestRestingHeartRate: numberOrNull(summary.latestRestingHeartRate),
            latestRecoveryPercent: numberOrNull(summary.latestRecoveryPercent),
            latestRecoveryStatus: String(summary.latestRecoveryStatus || ""),
            latestRecoveryHours: numberOrNull(summary.latestRecoveryHours)
        },
        recentDays,
        updatedAt: serverTimestamp()
    };

    await setDoc(sharedWearableRecoveryDoc(coachUid, user.uid), clean);
    return clean;
}

function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function deleteSharedWearableRecovery(coachUid, clientUid) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (clientUid !== user.uid) throw new Error("not-your-shared-recovery");
    await deleteDoc(sharedWearableRecoveryDoc(coachUid, clientUid));
}
// Firestore doesn't guarantee a nested map's field order survives a
// round trip, so comparing plain JSON.stringify() output before vs.
// after a pull can report "changed" even when nothing actually is --
// which previously caused loadHeader.js's "reload once if this pull
// applied anything" logic to reload on every single load, forever.
// Sorting keys before stringifying makes the comparison immune to
// that reordering.
function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

// ---- Invite / link lifecycle ----

export async function createInviteCode() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const code = randomCode();
    await setDoc(doc(db, "inviteCodes", code), {
        clientUid: user.uid,
        clientName: user.displayName || "Runner",
        clientEmail: user.email || "",
        createdAt: serverTimestamp()
    });
    return code;
}

// ---- Applying = standing invite ----
// Applying to train (apply.html) is the client's request to be coached,
// so the apply flow leaves an invite code with a predictable id. When
// the coach approves the account, clients.js links it in the same step
// through linkWithCode() -- the exact rules-checked batch a typed code
// uses (code must exist, belong to that client, be under 7 days old,
// and is burned by the link). The client's app keeps it fresh while the
// account is pending (js/loadHeader.js, js/apply.js).
export function applyCodeFor(uid) {
    return `APPLY-${uid}`;
}

const APPLY_CODE_REFRESH_MS = 5 * 24 * 60 * 60 * 1000;

export async function ensureApplyCode() {
    const user = await waitForUser();
    if (!user) return;

    const ref = doc(db, "inviteCodes", applyCodeFor(user.uid));
    let snap = null;
    try {
        snap = await getDoc(ref);
    } catch {
        // A code that doesn't exist reads as permission-denied for the
        // client (firestore.rules only lets them read their own codes).
        snap = null;
    }

    if (snap?.exists()) {
        const createdMs = snap.data().createdAt?.toMillis?.() ?? 0;
        if (createdMs && Date.now() - createdMs < APPLY_CODE_REFRESH_MS) return;
        await deleteDoc(ref); // codes can't be updated, only replaced
    }

    await setDoc(ref, {
        clientUid: user.uid,
        clientName: user.displayName || "Client",
        clientEmail: user.email || "",
        createdAt: serverTimestamp()
    });
}

// Coach: link a just-approved applicant using their standing code.
export async function linkApplicant(clientUid) {
    return linkWithCode(applyCodeFor(clientUid));
}

export async function redeemInviteCode(rawCode) {
    const code = (rawCode || "").trim().toUpperCase();
    if (!code) throw new Error("empty-code");
    return linkWithCode(code);
}

async function linkWithCode(code) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const codeRef = doc(db, "inviteCodes", code);
    let snap;
    try {
        snap = await getDoc(codeRef);
    } catch (error) {
        // Only approved coaches may look codes up (firestore.rules).
        if (error.code === "permission-denied") throw new Error("not-approved-coach");
        throw error;
    }
    if (!snap.exists()) throw new Error("invalid-code");

    const invite = snap.data();
    if (invite.clientUid === user.uid) throw new Error("cannot-link-self");
    const createdMs = invite.createdAt?.toMillis?.() ?? 0;
    if (createdMs && Date.now() - createdMs > INVITE_TTL_MS) throw new Error("expired-code");

    // Creating the link and burning the code in ONE batch is what makes
    // the code single-use: the rules only allow the link when the same
    // commit deletes a valid code from that client, so a second
    // redemption (even a simultaneous one) finds no code and fails.
    const linkId = `${user.uid}_${invite.clientUid}`;
    const batch = writeBatch(db);
    batch.set(doc(db, "coachLinks", linkId), {
        coachUid: user.uid,
        coachName: user.displayName || "Coach",
        coachEmail: user.email || "",
        clientUid: invite.clientUid,
        clientName: invite.clientName || "Client",
        clientEmail: invite.clientEmail || "",
        inviteCode: code,
        linkedAt: serverTimestamp()
    });
    batch.delete(codeRef);
    try {
        await batch.commit();
    } catch (error) {
        if (error.code === "permission-denied") throw new Error("invalid-code");
        throw error;
    }

    return { clientUid: invite.clientUid, clientName: invite.clientName || "Client" };
}

// ---- Direct coach assignment ----
// Approved coaches may find active client accounts and create the same
// coachLinks relationship used by the invite flow. This does not grant
// wearable permissions; wearableShares remains client-controlled.
export async function listAssignableClients() {
    const user = await waitForUser();
    if (!user) return [];

    const [directory, links] = await Promise.all([
        getDocs(query(collection(db, "clientDirectory"), where("status", "==", "active"))),
        listMyClients()
    ]);

    const linked = new Set(links.map(link => link.clientUid));
    return directory.docs
        .map(d => {
            const data = d.data() || {};
            return {
                uid: d.id,
                displayName: String(data.displayName || ""),
                email: String(data.email || ""),
                services: Array.isArray(data.services) ? [...data.services] : []
            };
        })
        .filter(profile => profile.uid !== user.uid && !linked.has(profile.uid))
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
}

export async function assignClient(clientUid) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (!clientUid || clientUid === user.uid) throw new Error("cannot-link-self");

    const directorySnap = await getDoc(doc(db, "clientDirectory", clientUid));
    if (!directorySnap.exists()) throw new Error("client-not-found");

    const client = directorySnap.data() || {};
    if (client.status !== "active") throw new Error("client-not-assignable");

    // No "does the link exist?" read first: the coachLinks rule reads the
    // stored doc, so reading a link that doesn't exist yet is refused
    // (permission-denied, not "missing"), which made every assignment fail.
    // Writing over an existing link is refused too (links are never
    // updated), so an already-linked client is told apart after the fact.
    const linkRef = doc(db, "coachLinks", user.uid + "_" + clientUid);
    try {
        await setDoc(linkRef, {
            coachUid: user.uid,
            coachName: user.displayName || "Coach",
            coachEmail: user.email || "",
            clientUid,
            // The rules require the name and email exactly as on their
            // profile (which the directory copies), so no "Client" stand-in.
            clientName: String(client.displayName || ""),
            clientEmail: String(client.email || ""),
            inviteCode: "",
            linkedAt: serverTimestamp()
        });
    } catch (error) {
        if (error?.code === "permission-denied") {
            const links = await listMyClients().catch(() => []);
            if (links.some(link => link.clientUid === clientUid)) throw new Error("already-linked");
        }
        throw error;
    }

    return { clientUid, clientName: client.displayName || "Client" };
}
export async function listMyClients() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "coachLinks"), where("coachUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listMyCoaches() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "coachLinks"), where("clientUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function removeLink(linkId) {
    await deleteDoc(doc(db, "coachLinks", linkId));
}

// ---- Coach reading/editing a client's plans ----

export async function readSharedPlanDoc(clientUid) {
    const snap = await getDoc(sharedPlanDoc(clientUid));
    return snap.exists() ? snap.data() : null;
}

export async function writeSharedPlanMirror(clientUid, payload, keyUpdatedAtPatch) {
    const existing = await readSharedPlanDoc(clientUid) || {};
    const keyUpdatedAt = { ...(existing.keyUpdatedAt || {}), ...(keyUpdatedAtPatch || {}) };
    await setDoc(sharedPlanDoc(clientUid), { ...payload, keyUpdatedAt, updatedAt: serverTimestamp() }, { merge: true });
}

// Coaches don't edit this mirror any more: a coached plan is published
// from coachingPlans (js/coachingPlans.js) and the client's app copies
// it down (js/coachPlanSync.js). The mirror is read-only context for the
// coach (their own plans, done marks).

// ---- Client-side mirror sync (called from cloudSync.js) ----

export async function mirrorPlansToShared(localData, localTimes, expectedUid = null) {
    const user = await waitForUser();
    if (!user || (expectedUid && user.uid !== expectedUid)) return;
    const payload = {};
    const keyUpdatedAt = {};
    if ("training-programs" in localData) {
        try { payload.trainingPrograms = JSON.parse(localData["training-programs"] || "[]"); } catch { payload.trainingPrograms = []; }
        keyUpdatedAt["training-programs"] = Number(localTimes["training-programs"] || Date.now());
    }
    if ("running-programs" in localData) {
        try { payload.runningPrograms = JSON.parse(localData["running-programs"] || "[]"); } catch { payload.runningPrograms = []; }
        keyUpdatedAt["running-programs"] = Number(localTimes["running-programs"] || Date.now());
    }
    if ("coach-plans" in localData) {
        try { payload.coachPlans = JSON.parse(localData["coach-plans"] || "[]"); } catch { payload.coachPlans = []; }
        keyUpdatedAt["coach-plans"] = Number(localTimes["coach-plans"] || Date.now());
    }
    if (!Object.keys(payload).length) return;

    if (getCurrentUser()?.uid !== user.uid || (expectedUid && user.uid !== expectedUid)) return;
    payload.updatedBy = user.uid;
    await writeSharedPlanMirror(user.uid, payload, keyUpdatedAt);
}

// Returns how many localStorage keys were changed by a shared-plan
// pull, using the same last-write-wins comparison as the main sync
// doc -- a coach edit only "wins" if it's newer than this device's
// own last local change to that same plan.
export async function pullSharedPlanUpdates(localTimes, expectedUid = null) {
    const user = await waitForUser();
    if (!user || (expectedUid && user.uid !== expectedUid)) return 0;

    const shared = await readSharedPlanDoc(user.uid);
    if (!shared || getCurrentUser()?.uid !== user.uid) return 0;

    if (getCurrentUser()?.uid !== user.uid || (expectedUid && user.uid !== expectedUid)) return 0;
    const cloudTimes = shared.keyUpdatedAt || {};
    const map = { "training-programs": shared.trainingPrograms, "running-programs": shared.runningPrograms };
    let applied = 0;

    for (const [key, value] of Object.entries(map)) {
        if (value === undefined) continue;
        const ct = Number(cloudTimes[key] || 0);
        const lt = Number(localTimes[key] || 0);
        if (lt > ct) continue;

        if (getCurrentUser()?.uid !== user.uid || (expectedUid && user.uid !== expectedUid)) return applied;
        const currentRaw = localStorage.getItem(key);
        let currentCanonical = null;
        try { currentCanonical = currentRaw !== null ? stableStringify(JSON.parse(currentRaw)) : null; }
        catch { currentCanonical = null; }
        const changed = currentCanonical !== stableStringify(value);

        if (changed) localStorage.setItem(key, JSON.stringify(value));
        if (ct > 0) localTimes[key] = ct;
        if (changed) applied++;
    }

    if (getCurrentUser()?.uid !== user.uid || (expectedUid && user.uid !== expectedUid)) return applied;
    setLocalCoachNotes(shared.notes || {});

    return applied;
}
