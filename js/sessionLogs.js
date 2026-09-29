/* ==========================================
   Southbound — session logs (sessionLogs/{bookingId}_{date})

   What happened at one session: the coach marks it completed, no-show,
   cancelled or cancelled late, with what they worked on and what's next
   (the client reads those words). Private thoughts go to the coach's
   private notes (coachNotes), never here. Rules: firestore.rules
   (validSessionLog). The model is js/sessionModel.js.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { logId } from "./sessionModel.js";

const withId = snap => ({ id: snap.id, ...snap.data() });
const clean = (text, max = 1000) => String(text || "").trim().slice(0, max);

// Every log the signed-in account can see: the coach's, or the client's own.
export async function listSessionLogs(role = "coach") {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "sessionLogs"),
        where(role === "client" ? "clientUid" : "coachUid", "==", user.uid)));
    return snap.docs.map(withId);
}

// Coach: save what happened at one session (creates or replaces it).
export async function saveSessionLog({ bookingId, date, clientUid, status, workedOn = "", nextTime = "" }) {
    const user = await waitForUser();
    const id = logId(bookingId, date);
    const ref = doc(db, "sessionLogs", id);
    const existing = await getDoc(ref).catch(() => null);
    const data = {
        coachUid: user.uid, clientUid, bookingId, date, status,
        workedOn: clean(workedOn), nextTime: clean(nextTime),
        createdAt: existing?.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    await setDoc(ref, data);
    return { id, ...data, createdAt: existing?.exists() ? existing.data().createdAt : Date.now(), updatedAt: Date.now() };
}

// Coach: undo a log (the session goes back to "not logged").
export async function deleteSessionLog(bookingId, date) {
    await deleteDoc(doc(db, "sessionLogs", logId(bookingId, date)));
}
