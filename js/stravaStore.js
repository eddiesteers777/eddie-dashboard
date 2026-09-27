/* ==========================================
   Southbound — where imported Strava history is kept

   On the device in "strava-history" (js/stravaHistory.js format) and on the
   person's own account in users/{uid}/sync/strava (+ strava-1, strava-2…
   parts, so years of activities never hit Firestore's 1 MB-per-document
   limit or crowd the main sync document). The existing rule for
   users/{uid}/sync/{docId} covers it: only the owner can read or write.
   Firebase is loaded only when needed, so Analytics still draws offline.
========================================== */

import { STRAVA_KEY, emptyStrava } from "./stravaHistory.js";

const PART = 400000;                          // characters per part document
export const STRAVA_EVENT = "sb:strava-updated";

export function loadStrava() {
    try { return JSON.parse(localStorage.getItem(STRAVA_KEY) || "null") || emptyStrava(); } catch { return emptyStrava(); }
}
function saveLocal(store) { localStorage.setItem(STRAVA_KEY, JSON.stringify(store)); }

async function cloud() {
    const [{ db }, { waitForUser }, fs] = await Promise.all([
        import("./firebase.js"), import("./auth.js"),
        import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js")
    ]);
    const user = await waitForUser();
    if (!user) return null;
    const ref = id => fs.doc(db, "users", user.uid, "sync", id);
    return { db, fs, ref };
}

/** Sends the stored history to the account. Resolves true when saved there. */
export async function pushStrava(store = loadStrava()) {
    try {
        const c = await cloud();
        if (!c) return false;
        const head = await c.fs.getDoc(c.ref("strava"));
        const oldParts = head.exists() ? Number(head.data().parts) || 0 : 0;
        const json = JSON.stringify(store);
        const parts = [];
        for (let i = 0; i < json.length; i += PART) parts.push(json.slice(i, i + PART));
        const batch = c.fs.writeBatch(c.db);
        parts.forEach((data, i) => batch.set(c.ref(`strava-${i + 1}`), { data }));
        for (let i = parts.length + 1; i <= oldParts; i++) batch.delete(c.ref(`strava-${i}`));
        batch.set(c.ref("strava"), { updatedAt: store.updatedAt || 0, parts: parts.length, count: Object.keys(store.acts || {}).length });
        await batch.commit();
        return true;
    } catch (error) {
        console.warn("Strava history not saved to the account yet:", error?.message || error);
        return false;
    }
}

/**
 * Brings the account's copy in when it's newer than this device's (imported
 * on another device); sends this device's when it's newer (imported offline).
 * Resolves true (and sends sb:strava-updated) when this device's copy changed.
 */
export async function syncStrava() {
    try {
        const c = await cloud();
        if (!c) return false;
        const head = await c.fs.getDoc(c.ref("strava"));
        const local = loadStrava();
        const cloudAt = head.exists() ? Number(head.data().updatedAt) || 0 : 0;
        if ((local.updatedAt || 0) > cloudAt) { await pushStrava(local); return false; }
        if (cloudAt <= (local.updatedAt || 0)) return false;
        const n = Number(head.data().parts) || 0;
        const docs = await Promise.all(Array.from({ length: n }, (_, i) => c.fs.getDoc(c.ref(`strava-${i + 1}`))));
        const store = JSON.parse(docs.map(d => d.data()?.data || "").join(""));
        if (!store?.acts) return false;
        saveLocal(store);
        window.dispatchEvent(new CustomEvent(STRAVA_EVENT));
        return true;
    } catch {
        return false;
    }
}

/** Saves an updated history here and on the account; tells the page. */
export async function saveStrava(store) {
    saveLocal(store);
    window.dispatchEvent(new CustomEvent(STRAVA_EVENT));
    return pushStrava(store);
}

/**
 * Removes the imported history here and on the account. It's saved as an
 * empty, newer history (not deleted), so other devices clear theirs too.
 */
export function clearStrava() {
    return saveStrava({ ...emptyStrava(), updatedAt: Date.now() });
}
