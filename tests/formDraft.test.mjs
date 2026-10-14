import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DRAFT_PREFIX, DRAFT_MAX_AGE_MS, draftKey, saveDraft, loadDraft, clearDraft, clearAllDrafts, sameValues, keepOrForget } from "../js/formDraft.js";

// A stand-in for localStorage.
function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        get length() { return data.size; },
        key: i => [...data.keys()][i] ?? null,
        getItem: k => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => { data.set(k, String(v)); },
        removeItem: k => { data.delete(k); },
        has: k => data.has(k)
    };
}

test("keys are per form and carry the prefix sign-out clears", () => {
    assert.equal(draftKey("checkin", "2026-10-12"), `${DRAFT_PREFIX}checkin:2026-10-12`);
    assert.equal(draftKey("workout-log", "cp1:2026-10-12"), "sb-draft:workout-log:cp1:2026-10-12");
    assert.notEqual(draftKey("checkin", "2026-10-12"), draftKey("checkin", "2026-10-19"), "each week has its own");
    const auth = readFileSync(new URL("../js/auth.js", import.meta.url), "utf8");
    assert.match(auth.match(/ACCOUNT_LOCAL_STORAGE_PREFIXES\s*=\s*\[([\s\S]*?)\]/)[1], /"sb-draft:"/, "sign-out clears drafts");
});

test("a draft round-trips and remembers when", () => {
    const storage = fakeStorage();
    const key = draftKey("checkin", "w1");
    assert.equal(loadDraft(key, { storage }), null, "nothing yet");
    assert.equal(saveDraft(key, { wentWell: "good", rating: 4 }, { storage, now: 1000 }), true);
    assert.deepEqual(loadDraft(key, { storage, now: 2000 }), { wentWell: "good", rating: 4 });
});

test("a draft older than 14 days is forgotten and removed", () => {
    const storage = fakeStorage();
    const key = draftKey("checkin", "w1");
    saveDraft(key, { a: 1 }, { storage, now: 0 });
    assert.deepEqual(loadDraft(key, { storage, now: DRAFT_MAX_AGE_MS }), { a: 1 }, "right at the limit is still kept");
    assert.equal(loadDraft(key, { storage, now: DRAFT_MAX_AGE_MS + 1 }), null);
    assert.equal(storage.has(key), false, "and cleaned up");
});

test("unreadable or foreign data is ignored, never thrown", () => {
    const key = draftKey("checkin", "w1");
    for (const bad of ["not json", "{}", '{"v":2,"at":1,"values":{}}', '{"v":1,"at":"x","values":{}}', '{"v":1,"at":1,"values":5}', "null"]) {
        assert.equal(loadDraft(key, { storage: fakeStorage({ [key]: bad }), now: 5 }), null, bad);
    }
    assert.equal(loadDraft(key, { storage: null }), null, "no storage at all");
    assert.equal(saveDraft(key, { a: 1 }, { storage: null }), false);
    const full = { getItem: () => null, setItem() { throw new Error("QuotaExceededError"); }, removeItem() {} };
    assert.equal(saveDraft(key, { a: 1 }, { storage: full }), false, "a full phone doesn't break the form");
    assert.equal(saveDraft(key, "text", { storage: fakeStorage() }), false, "only objects");
});

test("an enormous draft isn't kept", () => {
    const storage = fakeStorage();
    assert.equal(saveDraft("k", { note: "x".repeat(30000) }, { storage }), false);
    assert.equal(storage.has("k"), false);
});

test("same values whatever the key order", () => {
    assert.equal(sameValues({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true);
    assert.equal(sameValues({ a: 1 }, { a: 2 }), false);
    assert.equal(sameValues({ a: null }, { a: undefined }), true, "empty is empty");
});

test("keepOrForget keeps changes and drops a draft that matches the untouched form", () => {
    const storage = fakeStorage();
    const key = draftKey("checkin", "w1");
    const untouched = { rating: 0, wentWell: "" };
    assert.equal(keepOrForget(key, { rating: 3, wentWell: "" }, untouched, { storage }), true);
    assert.equal(storage.has(key), true);
    assert.equal(keepOrForget(key, { rating: 0, wentWell: "" }, untouched, { storage }), false, "typed back to the start");
    assert.equal(storage.has(key), false, "so nothing is left over");
});

test("clearing one draft leaves the others; clearing all leaves other keys", () => {
    const storage = fakeStorage({ "sb-draft:checkin:w1": "1", "sb-draft:checkin:w2": "1", "nutrition-2026-10-12": "keep", "sb-nav-access": "keep" });
    clearDraft("sb-draft:checkin:w1", { storage });
    assert.equal(storage.has("sb-draft:checkin:w1"), false);
    assert.equal(storage.has("sb-draft:checkin:w2"), true);
    clearAllDrafts({ storage });
    assert.equal(storage.has("sb-draft:checkin:w2"), false);
    assert.equal(storage.has("nutrition-2026-10-12"), true, "other data is untouched");
    assert.equal(storage.has("sb-nav-access"), true);
});

test("drafts are device-only: the cloud sync never takes them", () => {
    const sync = readFileSync(new URL("../js/cloudSync.js", import.meta.url), "utf8");
    assert.ok(!/sb-draft/.test(sync), "cloudSync does not mention drafts");
    const prefixes = sync.match(/KEY_PREFIXES\s*=\s*\[([\s\S]*?)\]/)[1];
    assert.ok(![...prefixes.matchAll(/["']([^"']+)["']/g)].some(m => "sb-draft:".startsWith(m[1])), "no synced prefix covers sb-draft:");
});
