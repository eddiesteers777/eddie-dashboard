/* ==========================================
   Southbound — Account-local browser storage

   The site predates account switching, so much of the app's client
   data lives in localStorage under stable keys instead of being
   namespaced by UID. These lists define the privacy boundary for an
   account transition.

   DO NOT put device-only UI preferences here unless they can carry
   account data. When a user signs out or another account takes over,
   account-local data is cleared before the new account's cloud data
   is allowed to populate it.
========================================== */

export const CLOUD_SYNC_EXACT_KEYS = [
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
    "coros-sent",
    "coros-auto-send",
    "coros-run-history",
    "coros-fitness-history",
    "coros-health-history",
    "coros-health-backfill",
    "coros-laps",
    "readiness-checkins",
    "readiness-settings",
    "readiness-history",
    "profile-checks",
    "coach-health-reviewed",
    "coach-queue-done"
];

export const CLOUD_SYNC_PREFIXES = [
    "nutrition-",
    "fueling-",
    "cross-training-"
];

// These stores deliberately sync outside the main users/{uid}/sync/localStorage
// document, but are still account-local and must be cleared on account change.
export const SPECIAL_ACCOUNT_LOCAL_KEYS = [
    "strava-history",
    "__eddieos_strava_data_snapshot_v1",
    "__eddieos_coros_oauth_v2",
    "__eddieos_coros_oauth_token",
    "__eddieos_strava_oauth_v1",
    "plan-coach-notes",
    "sb-email-outbox",
    "coros-health-fetched",
    "coros-health-error",
    "coros-auto-noticed",
    "sb-plan-release-day",
    "sb-coach-queue-view"
];

// Cached role/navigation is account-dependent even though it is device-only.
export const SYNC_BOOKKEEPING_KEYS = [
    "__cloudSyncMeta",
    "__cloudSyncSnapshot",
    "__cloudSyncKeyTimes",
    "__cloudSyncVersion",
    "__cloudSyncFullPullAt"
];

export const ACCOUNT_UI_KEYS = [
    "sb-account-role",
    "sb-nav-access"
];

export const ACCOUNT_LOCAL_EXACT_KEYS = [
    ...CLOUD_SYNC_EXACT_KEYS,
    ...SPECIAL_ACCOUNT_LOCAL_KEYS,
    ...SYNC_BOOKKEEPING_KEYS,
    ...ACCOUNT_UI_KEYS
];

export const ACCOUNT_LOCAL_PREFIXES = [...CLOUD_SYNC_PREFIXES];

// Session storage is ephemeral tab state. Clearing the whole tab store during
// an account transition removes OAuth PKCE state, profile drafts, role reload
// flags, and other state that must never follow another account.
export function clearAccountLocalData(storage = globalThis.localStorage) {
    if (!storage) return 0;

    const keys = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && isAccountLocalKey(key)) keys.push(key);
    }

    for (const key of keys) {
        try { storage.removeItem(key); } catch { /* best effort */ }
    }

    // The marker itself is always removed by a transition so it can never
    // become evidence that the next account owns the old browser data.
    return keys.length;
}

export function clearAccountSessionData(storage = globalThis.sessionStorage) {
    if (!storage) return 0;
    let count = 0;
    for (let i = storage.length - 1; i >= 0; i--) {
        try {
            storage.removeItem(storage.key(i));
            count++;
        } catch { /* best effort */ }
    }
    return count;
}

export function isAccountLocalKey(key) {
    return ACCOUNT_LOCAL_EXACT_KEYS.includes(key)
        || ACCOUNT_LOCAL_PREFIXES.some(prefix => String(key).startsWith(prefix));
}

export function getActiveAccountUid(storage = globalThis.localStorage) {
    try {
        return storage?.getItem("sb-active-account-uid") || null;
    } catch {
        return null;
    }
}

export function setActiveAccountUid(uid, storage = globalThis.localStorage) {
    try {
        if (uid) storage?.setItem("sb-active-account-uid", uid);
        else storage?.removeItem("sb-active-account-uid");
    } catch {
        // Storage blocked: auth still works; cloud data is the source of truth.
    }
}

export function accountIdentityChanged(previousUid, nextUid) {
    return Boolean(nextUid) && previousUid !== nextUid;
}
