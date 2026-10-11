/* ==========================================
   Southbound — the coach-client message thread (Firestore)

   messages/{id}: { coachUid, clientUid, from: "coach" | "client",
   senderName, text, createdAt, readAt } (firestore.rules "messages":
   either side writes as themselves while linked, the other can only mark
   it read, the sender can unsend it while it's unread).

   One thread per coach + client. Coach side: the Client Hub's Messages
   tab and the dashboard's "Waiting on your reply". Client side:
   messages.html and the Today coach card. The pure parts (sorting, days,
   unread, the attention line, when to email) are js/messageThread.js.
========================================== */

import { db } from "./firebase.js";
import { waitForUser } from "./auth.js";
import {
    collection, query, where, getDocs, setDoc, updateDoc, deleteDoc, doc,
    onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { settleWrite } from "./offlineWrite.js";
import { sortThread, shouldEmail, MAX_MESSAGE } from "./messageThread.js";

const COLLECTION = "messages";

async function me() {
    const user = await waitForUser();
    if (!user) throw new Error("not-signed-in");
    return user;
}

const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));

function threadQuery(role, uid, otherUid) {
    const base = collection(db, COLLECTION);
    return role === "coach"
        ? query(base, where("coachUid", "==", uid), where("clientUid", "==", otherUid))
        : query(base, where("clientUid", "==", uid), where("coachUid", "==", otherUid));
}

/** One thread, oldest first. role is who I am; otherUid the other side. */
export async function listThread(role, otherUid) {
    const user = await me();
    return sortThread(rows(await getDocs(threadQuery(role, user.uid, otherUid))));
}

/**
 * Live thread: calls onChange(messages) now and on every change (a new
 * message, a read receipt). Returns the unsubscribe function. onError
 * gets the error once (e.g. permission-denied before the rules are
 * published).
 */
export function watchThread(role, otherUid, onChange, onError = () => {}) {
    let stop = () => {};
    let cancelled = false;
    me().then(user => {
        if (cancelled) return;
        stop = onSnapshot(threadQuery(role, user.uid, otherUid),
            snap => onChange(sortThread(rows(snap))),
            error => onError(error));
    }).catch(onError);
    return () => { cancelled = true; stop(); };
}

/** Coach: every message with every client (the dashboard's inbox). */
export async function listCoachInbox() {
    const user = await me();
    return sortThread(rows(await getDocs(query(collection(db, COLLECTION), where("coachUid", "==", user.uid)))));
}

/** Client: every message from every coach (Today's card). */
export async function listMyMessages() {
    const user = await me();
    return sortThread(rows(await getDocs(query(collection(db, COLLECTION), where("clientUid", "==", user.uid)))));
}

/**
 * Sends a message. `thread` is the thread as it stood (for the email
 * rule); `email` is called with { first } when the other side should
 * hear about it. Returns { message, queued }.
 */
export async function sendMessage({ role, otherUid, text, senderName, thread = [], email = null }) {
    const user = await me();
    const clean = String(text || "").trim().slice(0, MAX_MESSAGE);
    if (!clean) throw new Error("empty-message");
    const ref = doc(collection(db, COLLECTION));
    const message = {
        coachUid: role === "coach" ? user.uid : otherUid,
        clientUid: role === "coach" ? otherUid : user.uid,
        from: role,
        senderName: String(senderName || user.displayName || (role === "coach" ? "Your coach" : "Your client")).slice(0, 100),
        text: clean,
        createdAt: serverTimestamp(),
        readAt: null
    };
    const first = shouldEmail(thread, role);
    const { queued } = await settleWrite(setDoc(ref, message), "Your message", ref);
    if (first && typeof email === "function") {
        try { email({ text: clean, senderName: message.senderName }); } catch { /* email is a bonus */ }
    }
    return { message: { id: ref.id, ...message, createdAt: Date.now() }, queued };
}

/** Marks the other side's unread messages as read (best effort). */
export async function markRead(messages) {
    await Promise.all((messages || []).filter(m => m?.id && !m.readAt).map(m =>
        updateDoc(doc(db, COLLECTION, m.id), { readAt: serverTimestamp() }).catch(() => {})));
}

/** Takes back a message the other side hasn't read yet. */
export async function unsendMessage(id) {
    await deleteDoc(doc(db, COLLECTION, id));
}
