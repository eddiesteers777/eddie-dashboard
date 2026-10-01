import assert from "node:assert/strict";
import test from "node:test";

import {
    ACCOUNT_LOCAL_EXACT_KEYS,
    ACCOUNT_LOCAL_PREFIXES,
    ACCOUNT_UI_KEYS,
    CLOUD_SYNC_EXACT_KEYS,
    SPECIAL_ACCOUNT_LOCAL_KEYS,
    accountIdentityChanged,
    clearAccountLocalData,
    clearAccountSessionData,
    getActiveAccountUid,
    isAccountLocalKey,
    setActiveAccountUid
} from "../js/accountStorage.js";

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        get length() { return map.size; },
        key(index) { return [...map.keys()][index] ?? null; },
        getItem(key) { return map.has(key) ? map.get(key) : null; },
        setItem(key, value) { map.set(String(key), String(value)); },
        removeItem(key) { map.delete(String(key)); },
        snapshot() { return Object.fromEntries(map); }
    };
}

test("account-local key audit includes cloud, special, OAuth, and account UI data", () => {
    const required = [
        "training-progress",
        "training-programs",
        "strava-history",
        "__eddieos_strava_data_snapshot_v1",
        "__eddieos_coros_oauth_v2",
        "__eddieos_strava_oauth_v1",
        "plan-coach-notes",
        "sb-email-outbox",
        "__cloudSyncSnapshot",
        "__cloudSyncKeyTimes",
        "coros-health-fetched",
        "coros-health-error",
        "coros-auto-noticed",
        "sb-account-role",
        "sb-nav-access"
    ];

    for (const key of required) {
        assert.equal(isAccountLocalKey(key), true, key);
    }

    assert.equal(isAccountLocalKey("nutrition-2026-10-01"), true);
    assert.equal(isAccountLocalKey("fueling-schedule"), true);
    assert.equal(isAccountLocalKey("cross-training-library"), true);
    assert.equal(isAccountLocalKey("programs-tab"), false);
    assert.equal(isAccountLocalKey("eddieos-splash-shown"), false);
});

test("cleanup removes account data but preserves device UI preferences", () => {
    const storage = memoryStorage({
        "training-programs": "A",
        "coros-run-history": "A",
        "nutrition-2026-10-01": "A",
        "strava-history": "A",
        "__eddieos_coros_oauth_v2": "token-A",
        "plan-coach-notes": "A",
        "sb-email-outbox": "A",
        "sb-account-role": "coach",
        "sb-nav-access": "A",
        "programs-tab": "training",
        "eddieos-splash-shown": "1"
    });

    const removed = clearAccountLocalData(storage);

    assert.equal(removed, 9);
    assert.deepEqual(storage.snapshot(), {
        "programs-tab": "training",
        "eddieos-splash-shown": "1"
    });
});

test("session cleanup removes OAuth/profile transition state", () => {
    const storage = memoryStorage({
        "__eddieos_coros_oauth_pending_v2": "pkce-A",
        "__eddieos_strava_oauth_pending_v1": "state-A",
        "sb-apply-draft": "draft-A",
        "sb-role-reloaded": "1"
    });

    assert.equal(clearAccountSessionData(storage), 4);
    assert.deepEqual(storage.snapshot(), {});
});

test("active account marker identifies transitions without becoming account data", () => {
    const storage = memoryStorage();

    assert.equal(getActiveAccountUid(storage), null);
    setActiveAccountUid("account-a", storage);
    assert.equal(getActiveAccountUid(storage), "account-a");

    assert.equal(accountIdentityChanged("account-a", "account-b"), true);
    assert.equal(accountIdentityChanged("account-a", "account-a"), false);
    assert.equal(accountIdentityChanged(null, "account-a"), true);
    assert.equal(accountIdentityChanged("account-a", null), false);

    setActiveAccountUid(null, storage);
    assert.equal(getActiveAccountUid(storage), null);
});

test("the central lists stay internally consistent", () => {
    assert.ok(CLOUD_SYNC_EXACT_KEYS.length > 20);
    assert.ok(SPECIAL_ACCOUNT_LOCAL_KEYS.length >= 10);
    assert.equal(ACCOUNT_LOCAL_EXACT_KEYS.includes("__cloudSyncSnapshot"), true);
    assert.equal(ACCOUNT_LOCAL_EXACT_KEYS.includes("__cloudSyncKeyTimes"), true);
    assert.equal(ACCOUNT_LOCAL_EXACT_KEYS.includes("__cloudSyncVersion"), true);
    assert.ok(ACCOUNT_UI_KEYS.every(key => ACCOUNT_LOCAL_EXACT_KEYS.includes(key)));
    assert.equal(new Set(ACCOUNT_LOCAL_EXACT_KEYS).size, ACCOUNT_LOCAL_EXACT_KEYS.length);
    assert.equal(ACCOUNT_LOCAL_PREFIXES.length, 3);
});
