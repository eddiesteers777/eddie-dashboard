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
    doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { sanitizeClientRecord, isIntakeComplete } from "./clientRecordSchema.js";

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
export async function saveClientRecord(clientUid, values, existing = null) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");

    const fields = sanitizeClientRecord(values);
    const complete = isIntakeComplete(fields);
    const payload = {
        ...fields,
        clientUid,
        intakeComplete: complete,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
    };
    if (complete && !existing?.intakeCompletedAt) payload.intakeCompletedAt = serverTimestamp();

    await setDoc(recordDoc(clientUid), payload, { merge: true });
    return { ...(existing || {}), ...payload, updatedAt: Date.now(), intakeCompletedAt: existing?.intakeCompletedAt || (complete ? Date.now() : undefined) };
}
