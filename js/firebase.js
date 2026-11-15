// ==========================================
// Southbound v2.0 - Firebase Initialization
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, memoryLocalCache,
  terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCQcvxYpAofdrvMkjqyfp7FxY4XlYSwCs",
  // Rolled back 2026-10-26: auth.southboundcoaching.com broke Google sign-in.
  authDomain: "eddie-s-dashboard.firebaseapp.com",
  projectId: "eddie-s-dashboard",
  storageBucket: "eddie-s-dashboard.firebasestorage.app",
  messagingSenderId: "262522365804",
  appId: "1:262522365804:web:e45f677d3fb8f80454b549",
  measurementId: "G-VB75B9KPLS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);

// Firestore keeps a copy of what this account has read, and any writes
// not yet sent, on this device (IndexedDB): pages still show the plan,
// check-ins and coach replies they last loaded when the phone is
// offline, and a workout logged offline is sent when the connection
// comes back, even after the app was closed. Reads still go to the
// server whenever it's reachable, so nothing is shown stale while
// online. Only one tab owns the persistent cache; additional tabs fall
// back to memory. This keeps another tab from holding the IndexedDB cache
// open while an account transition clears it. If the browser won't allow
// IndexedDB (private windows, strict tracking protection) the SDK falls
// back to memory, as before. Signing out clears the persistent copy
// (js/auth.js).
// On some iPhones the offline copy itself hangs: every read through it waits for good, and every screen
// that reads Firestore sits empty (coach screens, 2026-11-12 to 11-14). Proven on Eddie's phone with the
// Load check: a connection that keeps nothing on the phone answered in 0.3 s, plain HTTPS answered in 0.2 s,
// phone storage opened fine, and only this connection never answered. js/cloudSync.js leaves a mark
// (__cloudSyncSdkHungAt) when a read hangs. A device that has the mark keeps its data in memory instead
// (this page only, no saved copy; a change made with no signal is not kept if the app is closed first).
// The choice is remembered for 14 days (__fsMemoryCacheAt) so it doesn't flip back to the stuck copy after
// the mark's day is up; then it is tried again, and a hang puts the mark back.
const HUNG_KEY = "__cloudSyncSdkHungAt", MEMORY_KEY = "__fsMemoryCacheAt";
function useMemoryCache() {
  try {
    const now = Date.now();
    const hung = now - Number(localStorage.getItem(HUNG_KEY) || 0) < 24 * 3600 * 1000;
    const since = Number(localStorage.getItem(MEMORY_KEY) || 0);
    if (hung && !(now - since < 14 * 24 * 3600 * 1000)) localStorage.setItem(MEMORY_KEY, String(now));
    return hung || now - since < 14 * 24 * 3600 * 1000;
  } catch { return false; }
}

let db;
const memoryOnly = useMemoryCache();
globalThis.__sbFirestoreCache = memoryOnly ? "memory" : "saved";
try {
  db = initializeFirestore(app, {
    localCache: memoryOnly ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentSingleTabManager() }),
    // Some networks stall the streaming connection with no error (2026-11-07, iPhone Safari): this lets it
    // fall back to plain requests.
    experimentalAutoDetectLongPolling: true
  });
} catch (error) {
  console.warn("Southbound: offline copy unavailable, using memory only.", error);
  db = getFirestore(app);
}

// Auth defaults to IndexedDB-backed persistence, which browsers with
// strict tracking/storage protections (e.g. Edge's Tracking Prevention)
// can abort mid-open -- surfacing as an uncaught AbortError on every
// page load. Plain localStorage persistence sidesteps that entirely.
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Sign-out wipes this device's offline copy of the account's Firestore
// data (js/auth.js). Firestore can't be used again on this page after
// it; every sign-out reloads the page.
async function clearOfflineCopy() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (error) {
    console.warn("Southbound: couldn't clear the offline copy.", error);
  }
}

// Plain HTTPS address for the one read js/cloudSync.js falls back to when the SDK's connection hangs.
const firestoreRestBase = "https://firestore.googleapis.com/v1/projects/eddie-s-dashboard/databases/(default)/documents";

// Export for use in other files
export { app, auth, db, clearOfflineCopy, firestoreRestBase };
