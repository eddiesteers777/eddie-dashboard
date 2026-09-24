/* ==========================================
   Southbound — Weekly Coaching Cycle

   A client submits one short check-in per week (how it went + a
   1-5 rating) for a coach they're already linked to; the coach
   reviews it and leaves feedback. This is deliberately just a
   thin layer on top of existing pieces (coachLinks for trust, the
   plan editor in clients.html for actually changing the plan) --
   the check-in itself is the trigger that pulls a coach's
   attention back to a specific client every week.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    doc, getDoc, setDoc, updateDoc,
    collection, query, where, getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Monday-start week key (YYYY-MM-DD of that week's Monday) so every
// day within the same week maps to one check-in document per client,
// and resubmitting mid-week edits it instead of creating a duplicate.
export function weekKeyFor(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun..6=Sat
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function checkinRef(clientUid, weekOf) {
    return doc(db, "checkins", `${clientUid}_${weekOf}`);
}

// weekOf defaults to the current week; a client only ever has one
// document per week, so resubmitting overwrites rating/notes and
// puts it back in the coach's review queue (status -> "submitted").
export async function submitCheckin({ coachUid, coachName, rating, notes, weekOf }) {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    if (!coachUid) throw new Error("no-coach");

    const week = weekOf || weekKeyFor();
    const ref = checkinRef(user.uid, week);
    const existing = await getDoc(ref);

    const payload = {
        clientUid: user.uid,
        clientName: user.displayName || "Client",
        clientEmail: user.email || "",
        coachUid,
        coachName: coachName || "Coach",
        weekOf: week,
        rating: rating || 0,
        notes: notes || "",
        status: "submitted",
        reviewedAt: null,
        submittedAt: serverTimestamp()
    };
    // Only stamp coachFeedback on first creation -- Firestore rules
    // require it stay untouched (equal to the existing value) on any
    // update the client themselves makes, so it's simplest to just
    // never include it here on a resubmit and let merge:true leave
    // whatever the coach last wrote in place.
    if (!existing.exists()) payload.coachFeedback = "";

    await setDoc(ref, payload, { merge: true });
    return { id: ref.id, ...payload };
}

export async function listMyCheckins() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "checkins"), where("clientUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.weekOf || "").localeCompare(a.weekOf || ""));
}

export async function listCheckinsForMyClients() {
    const user = await waitForUser();
    if (!user) return [];
    const snap = await getDocs(query(collection(db, "checkins"), where("coachUid", "==", user.uid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.weekOf || "").localeCompare(a.weekOf || ""));
}

// Coach-only: writes feedback and marks it reviewed. Uses a partial
// update (not a full-document setDoc) so it's structurally
// impossible for this to touch the client's own rating/notes --
// matches the firestore.rules coach-review branch exactly.
export async function reviewCheckin(checkinId, feedback) {
    await updateDoc(doc(db, "checkins", checkinId), {
        coachFeedback: feedback || "",
        status: "reviewed",
        reviewedAt: serverTimestamp()
    });
}
