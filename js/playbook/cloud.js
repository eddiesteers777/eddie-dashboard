// Southbound Playbook: cloud sync for signed-in people. Guests never touch Firebase here.
// The work follows the account to other devices through users/{uid}/sync/playbook, the
// owner-only sync area the app already uses (firestore.rules: match /users/{uid}/sync/{docId}).
// Rules are in js/playbook/syncModel.js; this file is the browser side (storage, Firestore, status).
import { KEYS } from "./store.js";
import { SYNC_KEYS, planSync, mergeStates, hasWork, docBytes, MAX_DOC_BYTES } from "./syncModel.js";

const OWNER = "sb-playbook-owner";    // the account this device's work is linked to
const SNAP = "sb-playbook-synced";    // what the cloud held after the last sync
const TIMES = "sb-playbook-times";    // when this device first changed a key since then
const FS = "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } };
const readJson = k => { try { return JSON.parse(get(k) || "{}") || {}; } catch { return {}; } };
const readLocal = () => Object.fromEntries(SYNC_KEYS.map(k => [k, get(k)]));

let uid = null, fs = null, ref = null, busy = null, pageStarted = false, paused = false;
let state = "checking"; // checking | guest | syncing | synced | offline | toobig | paused

function show() {
    const text = { checking: "", guest: "Sign in", syncing: "Syncing…", synced: "Synced to your account", offline: "Offline: will sync", toobig: "Too big to sync", paused: "Sync paused" }[state];
    document.querySelectorAll("[data-pb-sync]").forEach(el => {
        el.textContent = text;
        el.dataset.state = state;
        el.title = state === "guest" ? "Sign in with Google to keep your Playbook on every device" : "";
    });
    document.querySelectorAll("[data-pb-signin]").forEach(el => { el.hidden = state !== "guest"; });
    document.querySelectorAll("[data-pb-sync]").forEach(el => { el.hidden = state === "checking"; });
    document.querySelectorAll("[data-pb-signedin]").forEach(el => { el.hidden = state === "guest"; });
}
const setState = s => { state = s; show(); };

function banner() {
    if (document.getElementById("pbRefresh")) return;
    const b = document.createElement("div");
    b.id = "pbRefresh"; b.className = "pb-refresh"; b.setAttribute("role", "status");
    b.innerHTML = '<span>Newer Playbook work arrived from your account.</span><button type="button" class="pb-tab">Refresh</button>';
    b.querySelector("button").addEventListener("click", () => location.reload());
    document.body.appendChild(b);
}

function applyKeys(map) {
    let n = 0;
    for (const [k, v] of Object.entries(map)) { put(k, v); n++; }
    if (n && pageStarted) banner();
}

async function readRemote() {
    try {
        const snap = await fs.getDoc(ref);
        return snap.exists() ? snap.data().keys || {} : {};
    } catch (e) {
        if (e && e.code === "permission-denied") return {}; // your own not-yet-created doc reads as denied
        throw e;
    }
}

async function pushKeys(changes, remote) {
    const now = Date.now();
    const keys = {};
    for (const [k, v] of Object.entries(changes)) keys[k] = { v, at: now };
    const after = { ...remote, ...keys };
    if (docBytes(after) > MAX_DOC_BYTES) return false;
    await fs.setDoc(ref, { keys, updatedAt: now }, { merge: true });
    return true;
}

async function firstLink(local, remote) {
    const remoteVals = Object.fromEntries(SYNC_KEYS.map(k => [k, remote[k] ? remote[k].v : null]));
    const both = hasWork(local) && hasWork(remoteVals);
    let result;
    if (!both) result = hasWork(remoteVals) ? remoteVals : local;
    else if (SYNC_KEYS.every(k => (local[k] ?? null) === (remoteVals[k] ?? null))) result = local;
    else {
        const { sbChoose } = await import("../ui.js");
        const pick = await sbChoose("This device already has Playbook work, and so does your account. What should happen?", {
            title: "Combine your Playbook work?",
            choices: [
                { label: "Combine both", value: "merge", primary: true },
                { label: "Use my account's copy", value: "account" },
                { label: "Use this device's copy", value: "device" }
            ],
            cancelLabel: "Decide later"
        });
        if (!pick) { paused = true; setState("paused"); return false; }
        result = pick === "merge" ? mergeStates(local, remoteVals) : pick === "account" ? remoteVals : local;
    }
    const changes = {}, apply = {};
    for (const k of SYNC_KEYS) {
        const want = result[k] ?? null;
        if (want !== (local[k] ?? null)) apply[k] = want;
        if (want !== (remoteVals[k] ?? null)) changes[k] = want;
    }
    applyKeys(apply);
    if (Object.keys(changes).length && !(await pushKeys(changes, remote))) { setState("toobig"); return false; }
    put(OWNER, uid);
    put(SNAP, JSON.stringify(readLocal()));
    put(TIMES, "{}");
    return true;
}

async function runSync() {
    if (!uid || !fs || paused) return;
    setState("syncing");
    try {
        const remote = await readRemote();
        const local = readLocal();
        if (get(OWNER) !== uid) {
            if (!(await firstLink(local, remote))) return;
            setState("synced");
            return;
        }
        const snapshot = readJson(SNAP), times = readJson(TIMES);
        const now = Date.now();
        for (const k of SYNC_KEYS) if ((local[k] ?? null) !== (snapshot[k] ?? null) && !times[k]) times[k] = now;
        const plan = planSync({ local, snapshot, remote, localTimes: times });
        applyKeys(plan.apply);
        let ok = !plan.tooBig.length;
        if (Object.keys(plan.push).length) ok = (await pushKeys(plan.push, remote)) && ok;
        const next = readLocal();
        for (const k of plan.tooBig) next[k] = snapshot[k] ?? null; // retry, and keep saying so
        const stillBig = plan.tooBig.length || !ok;
        // Keys the cloud now agrees with are in sync; anything unsent stays marked as changed.
        put(SNAP, JSON.stringify(next));
        put(TIMES, JSON.stringify(Object.fromEntries(Object.entries(times).filter(([k]) => (next[k] ?? null) !== (readLocal()[k] ?? null)))));
        setState(stillBig ? "toobig" : "synced");
    } catch (e) {
        console.warn("Southbound Playbook: sync did not finish.", e);
        setState("offline");
    }
}

// One run at a time; a request that arrives mid-run runs once more afterwards.
export function syncNow() {
    if (busy) return busy.then(() => runSync());
    busy = runSync().finally(() => { busy = null; });
    return busy;
}

// Clear everything on this device. Signed in, the account's copy is cleared too (the missing
// keys sync up as removals).
export async function afterClear() {
    if (uid && get(OWNER) === uid) await syncNow();
}

export const isSignedIn = () => Boolean(uid);

export async function startSync({ timeoutMs = 2500 } = {}) {
    show();
    let auth;
    try { auth = await import("../auth.js"); } catch { setState("guest"); return; }
    document.querySelectorAll("[data-pb-signin],button[data-pb-sync]").forEach(el => el.addEventListener("click", async () => {
        if (state !== "guest") return;
        el.disabled = true;
        const ok = await auth.login();
        el.disabled = false;
        if (ok) location.reload();
    }));
    let user = null;
    try { user = await auth.waitForUser(); } catch { user = null; }
    if (!user) { setState("guest"); return; }
    uid = user.uid;
    if (get(OWNER) && get(OWNER) !== uid) { for (const k of [...SYNC_KEYS, OWNER, SNAP, TIMES]) put(k, null); }
    try {
        const [{ db }, mod] = await Promise.all([import("../firebase.js"), import(FS)]);
        fs = mod; ref = mod.doc(db, "users", uid, "sync", "playbook");
    } catch { setState("offline"); return; }
    const first = syncNow();
    await Promise.race([first, new Promise(r => setTimeout(r, timeoutMs))]);
    pageStarted = true;
    setInterval(() => { if (!document.hidden) syncNow(); }, 20000);
    document.addEventListener("visibilitychange", () => syncNow());
    window.addEventListener("pagehide", () => { syncNow(); });
    window.addEventListener("online", () => syncNow());
}
