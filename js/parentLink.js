/* ==========================================
   Southbound — the parent link (pure part + data)

   A coach shares one private address per player. It opens a small snapshot
   (parentLinks/{token}): the player's first name, the last session summary and
   the open homework. No sign-in, no email, no private notes. Switching it off
   deletes the snapshot. Rules: firestore.rules (parentLinks). Pure parts are
   unit-tested in tests/parentLink.test.mjs; the page is parent.html.
========================================== */

import { summaries } from "./sessionSummaries.js";
import { progress } from "./homeworkModel.js";

const text = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const firstOf = name => text(name, 80).split(" ")[0].slice(0, 40);

// 32 random hex characters: long enough that the address can't be guessed.
export function newToken(bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16))) {
    if (!bytes) throw new Error("no-random");
    return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const isToken = t => /^[A-Za-z0-9]{24,64}$/.test(String(t || ""));
export const parentUrl = (token, base = "") => `${base}parent.html?t=${encodeURIComponent(token)}`;

// What the parent page may hold. `summary` is one item of summaries(); `homework` is [{ title, label }].
export function buildSnapshot({ clientUid, coachUid, playerName, coachName, summary = null, homework = [] } = {}) {
    return {
        coachUid, clientUid,
        firstName: firstOf(playerName) || "Your player",
        coachFirst: firstOf(coachName) || "Coach",
        last: summary ? {
            date: text(summary.date, 10),
            focus: text(summary.log?.focus || summary.focus, 120),
            workedOn: text(summary.workedOn, 800),
            nextTime: text(summary.nextTime, 400)
        } : null,
        homework: (homework || []).slice(0, 8).map(h => `${text(h.title, 80).replace(/\|/g, "/")}|${text(h.label, 40).replace(/\|/g, "/")}`).join("\n").slice(0, 900)
    };
}

// The snapshot for one player from what the coach already loaded. requests carry their session logs.
export function snapshotForPlayer({ clientUid, coachUid, playerName, coachName, requests = [], homework = [], today = "" } = {}) {
    const mine = (requests || []).filter(r => r.clientUid === clientUid);
    const summary = summaries(mine, today)[0] || null;
    const open = (homework || [])
        .filter(h => h.clientUid === clientUid && h.status !== "archived")
        .map(h => ({ title: h.title, p: progress(h, today) }))
        .filter(x => !x.p.complete)
        .map(x => ({ title: x.title, label: x.p.label }));
    return buildSnapshot({ clientUid, coachUid, playerName, coachName, summary, homework: open });
}

export function homeworkLines(snapshot) {
    return String(snapshot?.homework || "").split("\n").filter(Boolean).map(line => { const [title, label = ""] = line.split("|"); return { title, label }; });
}

// "Hi, here is Ava's latest soccer update: <link>" for a text or email.
export function shareMessage(snapshot, url) {
    return `Here is ${snapshot.firstName}'s latest soccer update from ${snapshot.coachFirst}: ${url}`;
}

// ---- data (loaded on demand so the pure part stays testable) ----

const fs = () => Promise.all([import("./firebase.js"), import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")]).then(([f, m]) => ({ db: f.db, ...m }));

// Public read by exact address. null when missing or switched off.
export async function readParentLink(token) {
    if (!isToken(token)) return null;
    const { db, doc, getDoc } = await fs();
    const snap = await getDoc(doc(db, "parentLinks", token));
    return snap.exists() ? snap.data() : null;
}

// The signed-in coach's links, as { token, ...snapshot }.
export async function listMyParentLinks(coachUid) {
    const { db, collection, query, where, getDocs } = await fs();
    const snap = await getDocs(query(collection(db, "parentLinks"), where("coachUid", "==", coachUid)));
    return snap.docs.map(d => ({ token: d.id, ...d.data() }));
}

export async function saveParentLink(token, snapshot) {
    const { db, doc, setDoc, serverTimestamp } = await fs();
    await setDoc(doc(db, "parentLinks", token), { ...snapshot, updatedAt: serverTimestamp() });
}

export async function deleteParentLink(token) {
    const { db, doc, deleteDoc } = await fs();
    await deleteDoc(doc(db, "parentLinks", token));
}
