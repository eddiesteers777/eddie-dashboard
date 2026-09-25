/* ==========================================
   Southbound — Coach / Client Plan Access

   Lets a coach (any signed-in account) get edit access to a
   client's Training Plans and Race/Running Plans only -- never
   their nutrition, strength, gear, or other private data. Two
   pieces make that possible:

   1. coachLinks/{coachUid}_{clientUid} -- proof a client
      consented to give a specific coach access. Created only by
      redeeming a one-time invite code the client generated, so a
      coach can never link themselves to an account uninvited.
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
import { waitForUser } from "./auth.js";
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

export async function mirrorPlansToShared(localData, localTimes) {
    const user = await waitForUser();
    if (!user) return;

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

    payload.updatedBy = user.uid;
    await writeSharedPlanMirror(user.uid, payload, keyUpdatedAt);
}

// Returns how many localStorage keys were changed by a shared-plan
// pull, using the same last-write-wins comparison as the main sync
// doc -- a coach edit only "wins" if it's newer than this device's
// own last local change to that same plan.
export async function pullSharedPlanUpdates(localTimes) {
    const user = await waitForUser();
    if (!user) return 0;

    const shared = await readSharedPlanDoc(user.uid);
    if (!shared) return 0;

    const cloudTimes = shared.keyUpdatedAt || {};
    const map = { "training-programs": shared.trainingPrograms, "running-programs": shared.runningPrograms };
    let applied = 0;

    for (const [key, value] of Object.entries(map)) {
        if (value === undefined) continue;
        const ct = Number(cloudTimes[key] || 0);
        const lt = Number(localTimes[key] || 0);
        if (lt > ct) continue;

        const currentRaw = localStorage.getItem(key);
        let currentCanonical = null;
        try { currentCanonical = currentRaw !== null ? stableStringify(JSON.parse(currentRaw)) : null; }
        catch { currentCanonical = null; }
        const changed = currentCanonical !== stableStringify(value);

        if (changed) localStorage.setItem(key, JSON.stringify(value));
        if (ct > 0) localTimes[key] = ct;
        if (changed) applied++;
    }

    setLocalCoachNotes(shared.notes || {});

    return applied;
}
