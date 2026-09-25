/* ==========================================
   Southbound — Private coach notes + client updates

   Two deliberately separate collections, so a private note can never
   end up in front of a client by mistake:

     coachNotes/{id}     PRIVATE. Only the coach who wrote it can read it
                         (firestore.rules has no client clause at all).
                         { coachUid, clientUid, text, pinned, createdAt, updatedAt }

     clientUpdates/{id}  SHARED. The coach writes it; the client reads it
                         and can only mark it read.
                         { coachUid, coachName, clientUid, text, createdAt, readAt }

   Coach side: the Client Hub's Notes tab (js/clientHub.js).
   Client side: updates.html + the Today coach card.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { sendCoachUpdateEmail } from "./emailNotify.js";

const byNewest = (a, b) => millis(b.createdAt) - millis(a.createdAt);

function millis(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    return 0;
}

async function me() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    return user;
}

// ---- Private notes (coach only) ----

export async function listPrivateNotes(clientUid) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "coachNotes"),
        where("coachUid", "==", user.uid), where("clientUid", "==", clientUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.pinned === true) - (a.pinned === true) || byNewest(a, b));
}

export async function addPrivateNote(clientUid, text, pinned = false) {
    const user = await me();
    const note = {
        coachUid: user.uid,
        clientUid,
        text: String(text || "").trim().slice(0, 4000),
        pinned: Boolean(pinned),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "coachNotes"), note);
    return { id: ref.id, ...note, createdAt: Date.now(), updatedAt: Date.now() };
}

export async function updatePrivateNote(noteId, { text, pinned }) {
    await updateDoc(doc(db, "coachNotes", noteId), {
        text: String(text || "").trim().slice(0, 4000),
        pinned: Boolean(pinned),
        updatedAt: serverTimestamp()
    });
}

export async function deletePrivateNote(noteId) {
    await deleteDoc(doc(db, "coachNotes", noteId));
}

// ---- Client updates (coach writes, client reads) ----

export async function listUpdatesForClient(clientUid) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "clientUpdates"),
        where("coachUid", "==", user.uid), where("clientUid", "==", clientUid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewest);
}

// Sends an update the client sees in their app, and emails them the
// usual "your coach sent you something, open the app" note.
export async function sendClientUpdate(clientUid, text, { clientName, clientEmail } = {}) {
    const user = await me();
    const update = {
        coachUid: user.uid,
        coachName: (user.displayName || "Your coach").slice(0, 100),
        clientUid,
        text: String(text || "").trim().slice(0, 2000),
        createdAt: serverTimestamp(),
        readAt: null
    };
    const ref = await addDoc(collection(db, "clientUpdates"), update);
    sendCoachUpdateEmail({ clientEmail, clientName, coachName: update.coachName, text: update.text });
    return { id: ref.id, ...update, createdAt: Date.now() };
}

export async function deleteClientUpdate(updateId) {
    await deleteDoc(doc(db, "clientUpdates", updateId));
}

// Client side: every update sent to me, newest first.
export async function listMyUpdates() {
    const user = await me();
    const snap = await getDocs(query(collection(db, "clientUpdates"), where("clientUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byNewest);
}

export async function markUpdatesRead(updates) {
    await Promise.all((updates || []).filter(u => !u.readAt).map(u =>
        updateDoc(doc(db, "clientUpdates", u.id), { readAt: serverTimestamp() }).catch(() => {})));
}
