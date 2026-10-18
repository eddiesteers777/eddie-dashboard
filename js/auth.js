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
    "session-rpe",
    "race-results",
    "athlete-model",
    "coach-athlete-model",
    "sb-athlete-share-at",
    "sb-athlete-sharing",
    "coros-sent",
    "readiness-checkins",
    "readiness-settings",
    "readiness-history",
    "training-progress",
    "training-overrides",
    "featured-training-categories",
    "habits",
    "entries",
    "user-settings",
    "sb-guest-fueling-stash",   // fueling work a guest left, waiting to join the account (js/guestFuel.js): cleared on sign-out
    "__eddieos_coros_data_snapshot_v2",
    "strength-plan",
    "strength-exercise-library",
    "strength-workout-library",
    "strength-workout-favorites",
    "strength-schedule",
    "strength-settings",
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
    "coach-pinned-chats",
    "plan-coach-notes",
    "profile-checks",
    "workout-shares",
    "sb-email-outbox",
    "sb-plan-release-day"
];

const ACCOUNT_LOCAL_STORAGE_PREFIXES = [
    "nutrition-",
    "fueling-",
    "cross-training-",
    "workout-session-",
    "sb-draft:"   // unsent check-in / workout-log words (js/formDraft.js): device-only
];

const ACCOUNT_SESSION_STORAGE_KEYS = [
    "__eddieos_coros_oauth_pending_v2",
    "__eddieos_coros_oauth_pending",
    "__eddieos_strava_oauth_pending_v1",
    "sb-apply-draft",
    "sb-profile-updated",
    "sb-role-reloaded"
];

const ACCOUNT_STORAGE_OWNER_KEY = "sb-account-storage-owner";
let preparedAccountUid;
let accountPreparation = Promise.resolve();
let accountReloadRequested = false;

function getStorageOwner() {
    try { return localStorage.getItem(ACCOUNT_STORAGE_OWNER_KEY); } catch { return null; }
}

function setStorageOwner(uid) {
    try {
        if (uid) localStorage.setItem(ACCOUNT_STORAGE_OWNER_KEY, uid);
        else localStorage.removeItem(ACCOUNT_STORAGE_OWNER_KEY);
    } catch { /* storage unavailable */ }
}

function hasLegacyAccountState() {
    try {
        for (const key of ACCOUNT_LOCAL_STORAGE_KEYS) {
            if (localStorage.getItem(key) !== null) return true;
        }
        for (const prefix of ACCOUNT_LOCAL_STORAGE_PREFIXES) {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) return true;
            }
        }
        for (const key of ACCOUNT_SESSION_STORAGE_KEYS) {
            if (sessionStorage.getItem(key) !== null) return true;
        }
    } catch { /* storage unavailable */ }
    return false;
}

export function clearAccountSensitiveBrowserState() {
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
}

// The Fueling calculator works without an account (js/guestFuel.js). A guest who used it and then
// signs in would lose that work to the clear below, so their "fueling-" keys are set aside first,
// tied to the account that signed in; the Fueling page offers to add them. Only from a device with
// no account on it (no owner) that was used as a guest for fueling (the mark).
const GUEST_FUEL_MARK = "sb-guest-fueling";
const GUEST_FUEL_STASH = "sb-guest-fueling-stash";
function takeGuestFueling() {
    try {
        if (localStorage.getItem(GUEST_FUEL_MARK) !== "1") return null;
        const keys = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith("fueling-")) keys[key] = localStorage.getItem(key);
        }
        return Object.keys(keys).length ? keys : null;
    } catch { return null; }
}

async function prepareAccountState(user) {
    const nextUid = user?.uid || null;
    const owner = getStorageOwner();
    const firstPreparation = preparedAccountUid === undefined;
    const uidChanged = !firstPreparation && preparedAccountUid !== nextUid;
    const ownerMismatch = nextUid && owner && owner !== nextUid;
    const signedOutOwner = !nextUid && owner;
    const legacyAccountState = nextUid && !owner && hasLegacyAccountState();
    const changed = Boolean(uidChanged || ownerMismatch || signedOutOwner || legacyAccountState);
    const guestFueling = nextUid && !owner ? takeGuestFueling() : null;

    if (changed) {
        clearAccountSensitiveBrowserState();
        setStorageOwner(null);
        await clearOfflineCopy();
    }

    if (nextUid) {
        try {
            localStorage.removeItem(GUEST_FUEL_MARK);
            if (guestFueling) localStorage.setItem(GUEST_FUEL_STASH, JSON.stringify({ uid: nextUid, at: Date.now(), keys: guestFueling }));
        } catch { /* storage unavailable: the guest's work is lost, as before */ }
    }

    setStorageOwner(nextUid);
    preparedAccountUid = nextUid;
    return { changed };
}

function reloadAfterAccountTransition(changed) {
    if (!changed || accountReloadRequested || typeof window === "undefined") return;
    accountReloadRequested = true;
    window.location.reload();
}

function queueAccountPreparation(user) {
    accountPreparation = accountPreparation
        .catch(() => {})
        .then(() => prepareAccountState(user));
    return accountPreparation;
}

// A single auth-state watcher is installed as soon as this module loads.
// Every caller below waits for its cleanup work, so a changed Firebase user
// cannot immediately inherit the prior account's browser/Firestore state.
onAuthStateChanged(auth, (user) => {
    queueAccountPreparation(user).then(async result => {
        // Seed/repair the account profile and its minimal client directory
        // before an account-transition reload. This removes the race where
        // the old auth flow could reload before page bootstrap repaired an
        // existing active client account.
        if (user) {
            try {
                const { ensureProfile } = await import("./userProfile.js");
                await ensureProfile();
            } catch (error) {
                // A temporary Firestore failure must not make sign-in fail.
                // The normal page bootstrap will retry on the next load.
                console.warn("Southbound: signed-in account bootstrap failed.", error);
            }
        }
        reloadAfterAccountTransition(result.changed);
    });
});

export function waitForAccountIsolation() {
    return accountPreparation;
}

// ==========================================
// Login
// ==========================================

export async function login() {

    try {

        await signInWithPopup(auth, provider);
        await waitForAccountIsolation();

        return true;

    } catch (error) {

        console.error("Login Error:", error);

        // Say why, unless the person just closed the Google window themselves.
        // Imported when needed so sign-in code carries no UI on its own.
        try {
            const [{ signInFailureMessage }, { toast }] = await Promise.all([
                import("./signInErrors.js"),
                import("./ui.js")
            ]);
            const message = signInFailureMessage(error);
            if (message) toast(message, { type: "error" });
        } catch { /* the message is a courtesy; failing to show it changes nothing */ }

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

    // The auth-state watcher also performs this cleanup for passive
    // account transitions in other tabs. Do it here too so an explicit
    // logout does not depend on callback timing.
    clearAccountSensitiveBrowserState();
    setStorageOwner(null);
    await clearOfflineCopy();
    preparedAccountUid = null;

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
            queueAccountPreparation(user).then(result => {
                reloadAfterAccountTransition(result.changed);
                resolve(user);
            });

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

    return onAuthStateChanged(auth, (user) => {

        queueAccountPreparation(user).then(result => {
            reloadAfterAccountTransition(result.changed);
            callback(user);
        });

    });

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

        queueAccountPreparation(user).then(() => {

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

    });

}
