/* ==========================================
   Southbound — change requests (Firestore)

   The client doesn't edit the coach's plan; they ask:
   changeRequests/{id}
     { clientUid, clientName, coachUid, planId|null, date|null,
       reason: work | fatigue | travel | pain | event | other,
       message, status: "open" | "resolved",
       coachReply, createdAt, resolvedAt }
   The coach answers (and usually adjusts + publishes the plan), which
   resolves it. The client can withdraw one that hasn't been answered.
   Reasons and labels: js/feedbackModel.js.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, doc, addDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { reasonLabel } from "./feedbackModel.js";
import { sendChangeRequestEmail, sendChangeReplyEmail } from "./emailNotify.js";
import { shortDay } from "./coachingPlanModel.js";

const withId = snap => ({ id: snap.id, ...snap.data() });
const newestFirst = (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);

async function me() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    return user;
}

// ---------- Client ----------

export async function askForChange({ coachUid, planId = null, date = null, reason, message }) {
    const user = await me();
    const data = {
        clientUid: user.uid,
        clientName: String(user.displayName || "Client").slice(0, 120),
        coachUid,
        planId: planId || null,
        date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : null,
        reason,
        message: String(message || "").trim().slice(0, 1000),
        status: "open",
        coachReply: "",
        createdAt: serverTimestamp(),
        resolvedAt: null
    };
    const ref = await addDoc(collection(db, "changeRequests"), data);
    sendChangeRequestEmail({ clientName: data.clientName, reasonLabel: reasonLabel(reason).toLowerCase(), date: data.date ? shortDay(data.date) : "", message: data.message });
    return { id: ref.id, ...data, createdAt: null };
}

export async function listMyChangeRequests() {
    const user = await me();
    const snap = await getDocs(query(collection(db, "changeRequests"), where("clientUid", "==", user.uid)));
    return snap.docs.map(withId).sort(newestFirst);
}

export async function withdrawChangeRequest(id) {
    await deleteDoc(doc(db, "changeRequests", id));
}

// ---------- Coach ----------

export async function listChangeRequestsForCoach(clientUid = null) {
    const user = await me();
    const filters = [where("coachUid", "==", user.uid)];
    if (clientUid) filters.push(where("clientUid", "==", clientUid));
    const snap = await getDocs(query(collection(db, "changeRequests"), ...filters));
    return snap.docs.map(withId).sort(newestFirst);
}

// Reply and mark it resolved (resolve: false keeps it open with a reply).
export async function answerChangeRequest(request, reply, { resolve = true, clientEmail = "", coachName = "" } = {}) {
    const text = String(reply || "").trim().slice(0, 1000);
    await updateDoc(doc(db, "changeRequests", request.id), {
        coachReply: text,
        status: resolve ? "resolved" : "open",
        resolvedAt: resolve ? serverTimestamp() : null
    });
    if (text && clientEmail) sendChangeReplyEmail({ clientEmail, clientName: request.clientName, coachName, text });
    return { ...request, coachReply: text, status: resolve ? "resolved" : "open", resolvedAt: resolve ? Date.now() : null };
}
