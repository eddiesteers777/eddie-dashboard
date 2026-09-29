/* ==========================================
   Southbound — Client profiles (clientRecords/{clientUid})

   Read/save the client profile described in js/clientRecordSchema.js.
   The client writes their own (profile.html); a linked coach can read
   and edit it (Client Hub -> Profile). firestore.rules enforces who
   and what (validClientRecord).
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    doc, getDoc, setDoc, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { sanitizeClientRecord, isIntakeComplete } from "./clientRecordSchema.js";
import { nextConfirmedAt, asksSettledBy, ASK_IDS } from "./profileChecks.js";

const recordDoc = uid => doc(db, "clientRecords", uid);

// The record, or null if there isn't one yet.
export async function getClientRecord(clientUid) {
    const snap = await getDoc(recordDoc(clientUid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getMyClientRecord() {
    const user = await waitForUser();
    if (!user) return null;
    return getClientRecord(user.uid);
}

// Saves the form values over the stored record. `existing` is the record
// as loaded (or null), so the first completion can be timestamped once.
// `confirm`: tracked answers the person just confirmed (js/profileChecks.js);
// any tracked answer that changed is stamped too.
export async function saveClientRecord(clientUid, values, existing = null, { confirm = [] } = {}) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const fields = sanitizeClientRecord(values);
    const complete = isIntakeComplete(fields);
    const now = Date.now();
    const confirmedAt = nextConfirmedAt(existing?.confirmedAt, existing, fields, confirm, now);
    const payload = {
        ...fields,
        clientUid,
        intakeComplete: complete,
        confirmedAt,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
    };
    // A coach's "please update" is settled by answering it (js/profileChecks.js).
    const settled = asksSettledBy(existing, Object.keys(confirmedAt).filter(k => confirmedAt[k] === now));
    if (settled.length) payload.askedAt = Object.fromEntries(settled.map(id => [id, deleteField()]));
    if (complete && !existing?.intakeCompletedAt) payload.intakeCompletedAt = serverTimestamp();

    await setDoc(recordDoc(clientUid), payload, { merge: true });
    return { ...(existing || {}), ...payload, askedAt: withoutAsks(existing?.askedAt, settled), updatedAt: Date.now(), intakeCompletedAt: existing?.intakeCompletedAt || (complete ? Date.now() : undefined) };
}

// "Yes, still right": stamps these answers as confirmed now, changing nothing else.
export async function confirmClientFields(clientUid, keys, existing = null) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const now = Date.now();
    const confirmedAt = { ...(existing?.confirmedAt || {}) };
    for (const key of keys) confirmedAt[key] = now;
    const ref = recordDoc(clientUid);
    const settled = asksSettledBy(existing, keys);
    const payload = { clientUid, confirmedAt, updatedAt: serverTimestamp(), updatedBy: user.uid };
    if (settled.length) payload.askedAt = Object.fromEntries(settled.map(id => [id, deleteField()]));
    const write = setDoc(ref, payload, { merge: true });
    return { write, ref, record: { ...(existing || {}), confirmedAt, askedAt: withoutAsks(existing?.askedAt, settled), updatedAt: now } };
}

const withoutAsks = (asked, ids) => Object.fromEntries(Object.entries(asked || {}).filter(([id]) => !ids.includes(id)));

// Coach: ask the client to check some answers (Client Hub → "Ask … to update").
// They see it on their Today screen; answering clears it.
export async function askClientToUpdate(clientUid, ids, existing = null) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    const now = Date.now();
    const asks = ids.filter(id => ASK_IDS.includes(id));
    const askedAt = Object.fromEntries(asks.map(id => [id, now]));
    await setDoc(recordDoc(clientUid), { clientUid, askedAt, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
    return { ...(existing || {}), askedAt: { ...(existing?.askedAt || {}), ...askedAt } };
}

export const clientRecordRef = uid => recordDoc(uid);
