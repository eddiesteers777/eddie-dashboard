import test from "node:test";
import assert from "node:assert/strict";
import { hasPulled, syncStatusLine, NOT_PULLED_ERROR, UNREACHABLE_ERROR } from "../js/syncGuard.js";

const ago = ts => (ts ? "just now" : "never synced on this device");

test("a device that never read the cloud may not push", () => {
    assert.equal(hasPulled({ pulledUid: null, uid: "u1", ownerUid: "u1", lastSyncedAt: null }), false);
    assert.equal(hasPulled({ pulledUid: null, uid: null, ownerUid: null, lastSyncedAt: 5 }), false);
});
test("a finished pull for this account allows pushing; another account's does not", () => {
    assert.equal(hasPulled({ pulledUid: "u1", uid: "u1" }), true);
    assert.equal(hasPulled({ pulledUid: "u2", uid: "u1", ownerUid: "u1", lastSyncedAt: 5 }), false);
});
test("a device from before the flag counts as pulled only when it synced for the same owner", () => {
    assert.equal(hasPulled({ pulledUid: null, uid: "u1", ownerUid: "u1", lastSyncedAt: 5 }), true);
    assert.equal(hasPulled({ pulledUid: null, uid: "u1", ownerUid: "u2", lastSyncedAt: 5 }), false);
});
test("never-synced device says its data has not loaded", () => {
    const l = syncStatusLine({ lastSyncedAt: null, lastError: null }, true, ago);
    assert.equal(l.error, true);
    assert.match(l.text, /hasn't loaded/);
    assert.doesNotMatch(l.text, /Synced never/);
});
test("specific errors get their own words", () => {
    assert.match(syncStatusLine({ lastError: NOT_PULLED_ERROR }, true, ago).text, /hasn't loaded/);
    assert.match(syncStatusLine({ lastError: UNREACHABLE_ERROR, lastSyncedAt: 1 }, true, ago).text, /Can't reach/);
    assert.match(syncStatusLine({ lastError: "unavailable", lastSyncedAt: 1 }, true, ago).text, /Sync error/);
});
test("healthy and offline lines", () => {
    assert.deepEqual(syncStatusLine({ lastSyncedAt: 1, lastError: null }, true, ago), { text: "Synced just now", error: false });
    assert.match(syncStatusLine({ lastSyncedAt: 1, lastError: "x" }, false, ago).text, /^Offline/);
    assert.equal(syncStatusLine({ lastSyncedAt: 1, lastError: "not-signed-in" }, true, ago).error, false);
});
