/* ==========================================
   Southbound — Applications (applications/{id})

   Saved by the open Apply form (apply.html, no account needed) and read
   only by approved coaches: the Coach Dashboard lists them, and My
   Clients → Pending ties each one to the account it belongs to. The
   fields and their rules are in js/applicationForm.js / firestore.rules.
========================================== */

import { db } from "./firebase.js";
import {
    doc, addDoc, updateDoc, collection, query, orderBy, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { cleanApplication } from "./applicationForm.js";

// Anyone: send an application. `uid` only when they happen to be signed in.
export async function sendApplication(answers, uid = "") {
    const data = { ...cleanApplication(answers), status: "new", createdAt: serverTimestamp() };
    if (uid) data.uid = uid;
    return addDoc(collection(db, "applications"), data);
}

// Coach only (rules): newest first.
export async function listApplications() {
    const snap = await getDocs(query(collection(db, "applications"), orderBy("createdAt", "desc"), limit(200)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setApplicationHandled(id, handled) {
    await updateDoc(doc(db, "applications", id), {
        status: handled ? "handled" : "new",
        handledAt: handled ? serverTimestamp() : null
    });
}

// Coach: this application belongs to that account (or none: uid = null).
export async function matchApplicationTo(id, uid) {
    await updateDoc(doc(db, "applications", id), {
        matchedUid: uid || null,
        matchedAt: uid ? serverTimestamp() : null
    });
}
