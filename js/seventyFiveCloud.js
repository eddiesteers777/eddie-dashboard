// 75-day tracker: account sync for signed-in people. Guests never touch Firebase here.
// One doc, users/{uid}/sync/seventyfive, in the owner-only sync area the app already uses
// (firestore.rules: match /users/{uid}/sync/{docId}). Who wins is decided by resolveSync()
// in js/seventyFive.js; this file is the browser side (storage, Firestore, status).
import { STORE_KEY, sanitize, resolveSync } from "./seventyFive.js";

export const OWNER_KEY = "sb-75-owner"; // the account this device's challenge is linked to
const FS = "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

export function readLocal() {
    try { return sanitize(JSON.parse(get(STORE_KEY) || "null")); } catch { return null; }
}
export function writeLocal(state) {
    put(STORE_KEY, state ? JSON.stringify(state) : null);
}

let uid = null, fs = null, ref = null, busy = null, onPulled = () => {}, setStatus = () => {};

async function readRemote() {
    try {
        const snap = await fs.getDoc(ref);
        return snap.exists() ? sanitize(JSON.parse(snap.data().state || "null")) : null;
    } catch (e) {
        if (e && e.code === "permission-denied") return null; // your own not-yet-created doc reads as denied
        throw e;
    }
}
const push = state => fs.setDoc(ref, { state: JSON.stringify(state), updatedAt: state.updatedAt });

async function runSync() {
    if (!uid || !fs) return;
    setStatus("syncing");
    try {
        const remote = await readRemote();
        const local = readLocal();
        const linked = get(OWNER_KEY) === uid;
        let plan = resolveSync({ local, remote, linked });
        if (plan === "ask") {
            const { sbChoose } = await import("./ui.js");
            const pick = await sbChoose("This device has a 75-day challenge going, and so does your account. Which one should you keep?", {
                title: "Which challenge do you keep?",
                choices: [
                    { label: "Use my account's", value: "pull", primary: true },
                    { label: "Use this device's", value: "push" }
                ],
                cancelLabel: "Decide later"
            });
            if (!pick) { setStatus("paused"); return; }
            plan = pick;
        }
        if (plan === "pull") { writeLocal(remote); onPulled(remote); }
        else if (plan === "push") await push(local);
        put(OWNER_KEY, uid);
        setStatus("synced");
    } catch (e) {
        console.warn("Southbound 75-day: sync did not finish.", e);
        setStatus("offline");
    }
}

// One run at a time; a request that arrives mid-run runs once more afterwards.
export function syncNow() {
    if (busy) return busy.then(() => runSync());
    busy = runSync().finally(() => { busy = null; });
    return busy;
}

export const isSignedIn = () => Boolean(uid);

export async function startSync({ status, pulled, timeoutMs = 2500 } = {}) {
    if (status) setStatus = status;
    if (pulled) onPulled = pulled;
    setStatus("checking");
    let auth;
    try { auth = await import("./auth.js"); } catch { setStatus("guest"); return; }
    let user = null;
    try { user = await auth.waitForUser(); } catch { user = null; }
    if (!user) { setStatus("guest"); return; }
    uid = user.uid;
    if (get(OWNER_KEY) && get(OWNER_KEY) !== uid) { put(OWNER_KEY, null); put(STORE_KEY, null); }
    try {
        const [{ db }, mod] = await Promise.all([import("./firebase.js"), import(FS)]);
        fs = mod; ref = mod.doc(db, "users", uid, "sync", "seventyfive");
    } catch { setStatus("offline"); return; }
    await Promise.race([syncNow(), new Promise(r => setTimeout(r, timeoutMs))]);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNow(); });
    window.addEventListener("online", () => syncNow());
}

export async function signIn() {
    const auth = await import("./auth.js");
    if (await auth.login()) location.reload();
}
