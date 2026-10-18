/* ==========================================
   Southbound — soccer homework (data)

   homework/{id}: one assignment from a coach to one linked client (the
   model, js/homeworkModel.js). The coach creates, edits, reviews and
   archives; the client reads and adds one practice at a time. Rules:
   firestore.rules (validHomework).
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, arrayUnion, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { cleanAssignment, cleanLog } from "./homeworkModel.js";
import { settleWrite } from "./offlineWrite.js";

const millis = v => !v ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : typeof v.seconds === "number" ? v.seconds * 1000 : 0;
const shape = snap => { const d = snap.data(); return { id: snap.id, ...d, logs: d.logs || [], createdMs: millis(d.createdAt) }; };
const newestFirst = (a, b) => b.createdMs - a.createdMs;

async function me() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    return user;
}

// Coach: everything assigned to one client.
export async function listHomeworkForClient(clientUid) {
    const user = await me();
    const snap = await getDocs(query(collection(db, "homework"),
        where("coachUid", "==", user.uid), where("clientUid", "==", clientUid)));
    return snap.docs.map(shape).sort(newestFirst);
}

// Coach: everything assigned to anyone (the dashboard's "homework in").
export async function listHomeworkIAssigned() {
    const user = await me();
    const snap = await getDocs(query(collection(db, "homework"), where("coachUid", "==", user.uid)));
    return snap.docs.map(shape).sort(newestFirst);
}

// Client: their own.
export async function listMyHomework() {
    const user = await me();
    const snap = await getDocs(query(collection(db, "homework"), where("clientUid", "==", user.uid)));
    return snap.docs.map(shape).sort(newestFirst);
}

// Coach: assign. `input` is what the form collected (cleaned here).
export async function assignHomework(clientUid, input) {
    const user = await me();
    const a = cleanAssignment(input);
    const data = {
        coachUid: user.uid, clientUid,
        title: a.title, skill: a.skill, note: a.note,
        videoId: a.videoId, startSec: a.startSec, endSec: a.endSec,
        cadence: a.cadence, timesPerWeek: a.timesPerWeek, minutes: a.minutes, goal: a.goal,
        dueDate: a.dueDate, askClip: a.askClip,
        status: "active", logs: [], coachReply: "", reviewedAt: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "homework"), data);
    return { id: ref.id, ...data, createdAt: Date.now(), createdMs: Date.now(), updatedAt: Date.now() };
}

// Coach: change the assignment itself (not the practices).
export async function updateHomework(id, input) {
    const a = cleanAssignment(input);
    const fields = {
        title: a.title, skill: a.skill, note: a.note, videoId: a.videoId, startSec: a.startSec, endSec: a.endSec,
        cadence: a.cadence, timesPerWeek: a.timesPerWeek, minutes: a.minutes, goal: a.goal,
        dueDate: a.dueDate, askClip: a.askClip, updatedAt: serverTimestamp()
    };
    await updateDoc(doc(db, "homework", id), fields);
    return fields;
}

export async function archiveHomework(id, archived = true) {
    await updateDoc(doc(db, "homework", id), { status: archived ? "archived" : "active", updatedAt: serverTimestamp() });
}

export async function replyToHomework(id, text) {
    const coachReply = String(text || "").trim().slice(0, 300);
    await updateDoc(doc(db, "homework", id), { coachReply, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return coachReply;
}

export async function deleteHomework(id) {
    await deleteDoc(doc(db, "homework", id));
}

// Client: one practice. Resolves to { log, queued } (queued = saved on this device, sends when online).
export async function logPractice(id, entry) {
    const log = cleanLog(entry);
    const ref = doc(db, "homework", id);
    const { queued } = await settleWrite(updateDoc(ref, { logs: arrayUnion(log), updatedAt: serverTimestamp() }), "Your practice", ref);
    return { log, queued };
}
