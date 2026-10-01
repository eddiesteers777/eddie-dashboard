// ==========================================
// Southbound v2.0 - Firebase Initialization
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBCQcvxYpAofdrvMkjqyfp7FxY4XlYSwCs",
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
// online. Several open tabs share the one cache. If the browser won't
// allow IndexedDB (private windows, strict tracking protection) the SDK
// falls back to memory, as before. Signing out clears it (js/loadHeader.js).
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
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

// Export for use in other files
export { app, auth, db, clearOfflineCopy };
