// ==========================================
// Southbound Authentication
// ==========================================

import { auth, clearOfflineCopy } from "./firebase.js";

import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const provider = new GoogleAuthProvider();

// Account-sensitive browser state must not survive an account switch.
// Device-only UI preferences are deliberately not in this list.
const ACCOUNT_LOCAL_STORAGE_KEYS = [
    "sb-nav-access",
    "sb-account-role",
    "__cloudSyncVersion",
    "__cloudSyncFullPullAt",
    "__cloudSyncMeta",
    "__cloudSyncSnapshot",
    "__cloudSyncKeyTimes",
    "strava-history",
    "__eddieos_strava_oauth_v1",
    "__eddieos_strava_data_snapshot_v1",
    "coros-auto-send",
    "coros-auto-noticed",
    "coros-health-fetched",
    "__eddieos_coros_oauth_v2",
    "__eddieos_coros_oauth_token",
    "coros-run-history",
    "coros-fitness-history",
    "coros-health-history",
    "coros-health-backfill",
    "coros-laps",
    "coros-sent",
    "readiness-checkins",
    "readiness-settings",
    "readiness-history",
    "training-progress",
    "training-overrides",
    "habits",
    "entries",
    "user-settings",
    "__eddieos_coros_data_snapshot_v2",
    "strength-plan",
    "strength-exercise-library",
    "strength-workout-library",
    "strength-workout-favorites",
    "strength-schedule",
    "gear-shoes",
    "strength-history",
    "running-log",
    "personal-records",
    "running-programs",
    "training-programs",
    "planner-events",
    "coach-plans",
    "coach-exercise-videos",
    "coach-workout-library",
    "coach-plan-prompts",
    "coach-health-reviewed",
    "coach-queue-done",
    "plan-coach-notes",
    "profile-checks"
];

const ACCOUNT_LOCAL_STORAGE_PREFIXES = [
    "nutrition-",
    "fueling-",
    "cross-training-"
];

const ACCOUNT_SESSION_STORAGE_KEYS = [
    "__eddieos_coros_oauth_pending_v2",
    "__eddieos_coros_oauth_pending",
    "__eddieos_strava_oauth_pending_v1",
    "sb-apply-draft",
    "sb-role-reloaded"
];

// ==========================================
// Login
// ==========================================

export async function login() {

    try {

        await signInWithPopup(auth, provider);

        return true;

    } catch (error) {

        console.error("Login Error:", error);

        return false;

    }

}

// ==========================================
// Logout
// ==========================================

export async function logout() {

    try {

        await signOut(auth);

    } catch (error) {

        console.error("Logout Error:", error);

    }

    // Remove account-sensitive browser state before another account can
    // sign in on this device. Firestore's IndexedDB cache is cleared below;
    // this list covers the localStorage/sessionStorage copies that Firestore
    // cannot clear for us, including COROS OAuth credentials and Strava data.
    for (const key of ACCOUNT_LOCAL_STORAGE_KEYS) {
        try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
    }
    for (const prefix of ACCOUNT_LOCAL_STORAGE_PREFIXES) {
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) localStorage.removeItem(key);
            }
        } catch { /* storage unavailable */ }
    }
    for (const key of ACCOUNT_SESSION_STORAGE_KEYS) {
        try { sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
    }

    await clearOfflineCopy();

}

// ==========================================
// Current User
// ==========================================

export function getCurrentUser() {

    return auth.currentUser;

}

// ==========================================
// Wait for Authentication
// ==========================================

export function waitForUser() {

    return new Promise((resolve) => {

        const unsubscribe = onAuthStateChanged(auth, (user) => {

            unsubscribe();
            resolve(user);

        });

    });

}

// ==========================================
// Protect Pages
// ==========================================

export async function requireLogin() {

    const user = await waitForUser();

    if (!user) {

        window.location.href = "login.html";

        return null;

    }

    return user;

}

// ==========================================
// Listen for Auth Changes
// ==========================================

export function listenForAuth(callback) {

    return onAuthStateChanged(auth, callback);

}

// ==========================================
// Update Header (Optional)
// ==========================================

export function setupHeader() {

    const userName = document.getElementById("user-name");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!userName || !loginBtn || !logoutBtn) return;

    onAuthStateChanged(auth, (user) => {

        if (user) {

            userName.textContent = user.displayName || "Runner";

            loginBtn.style.display = "none";
            logoutBtn.style.display = "inline-block";

        } else {

            userName.textContent = "Guest";

            loginBtn.style.display = "inline-block";
            logoutBtn.style.display = "none";

        }

    });

}
