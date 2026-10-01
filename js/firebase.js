// ==========================================
// Southbound v2.0 - Firebase Initialization
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
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

const FIRESTORE_OPTIONS = {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
};

function createFirestoreDb() {
  try {
    return initializeFirestore(app, FIRESTORE_OPTIONS);
  } catch (error) {
    console.warn("Southbound: offline copy unavailable, using memory only.", error);
    return getFirestore(app);
  }
}

// Firestore keeps a copy of what this account has read, and any writes
// not yet sent, on this device (IndexedDB). That copy must not survive an
// account transition because Firestore's persistence is shared by this app.
// The account-transition cleanup in js/auth.js clears it before another
// account is allowed to use the database.
let db = createFirestoreDb();

// Auth defaults to IndexedDB-backed persistence, which browsers with
// strict tracking/storage protections (e.g. Edge's Tracking Prevention)
// can abort mid-open -- surfacing as an uncaught AbortError on every
// page load. Plain localStorage persistence sidesteps that entirely.
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Wipe this app's Firestore persistence and immediately create a fresh
// Firestore instance for the next account. Older code terminated the
// instance and never rebuilt it, which made a same-page logout/login
// unusable and made account switching harder to reason about.
async function clearOfflineCopy() {
  const oldDb = db;
  let clearError = null;

  try {
    await terminate(oldDb);
  } catch (error) {
    // Termination can already have happened during a prior transition.
    console.warn("Southbound: Firestore termination during account reset:", error);
  }

  try {
    await clearIndexedDbPersistence(oldDb);
  } catch (error) {
    clearError = error;
    console.warn("Southbound: couldn't clear the offline Firestore copy.", error);
  }

  db = createFirestoreDb();
  return !clearError;
}

// Export for use in other files
export { app, auth, db, clearOfflineCopy };
