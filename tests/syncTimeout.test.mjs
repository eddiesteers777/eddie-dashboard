import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout, parseSyncDocRest, mergeIntoCloud, buildSyncCommitBody } from "../js/syncTimeout.js";

test("a read that never answers is cut off with its own code", async () => {
    await assert.rejects(withTimeout(new Promise(() => {}), 20, "pull-timeout"), { code: "pull-timeout" });
});
test("a read that answers in time passes through", async () => {
    assert.equal(await withTimeout(Promise.resolve(7), 50), 7);
});
test("the REST sync doc becomes the same shape the pull reads", () => {
    const doc = { fields: {
        data: { mapValue: { fields: { habits: { stringValue: "{\"a\":1}" }, bad: { integerValue: "3" } } } },
        keyUpdatedAt: { mapValue: { fields: { habits: { integerValue: "1793000000000" } } } },
        updatedAt: { timestampValue: "2026-11-07T19:02:05.428Z" }
    } };
    const p = parseSyncDocRest(doc);
    assert.deepEqual(p.data, { habits: "{\"a\":1}" });
    assert.equal(p.keyUpdatedAt.habits, 1793000000000);
    assert.equal(p.updatedAtMs, Date.parse("2026-11-07T19:02:05.428Z"));
    assert.equal(p.exists, true);
});
test("a missing doc reads as not existing", () => {
    assert.equal(parseSyncDocRest({}).exists, false);
});

test("the HTTPS save keeps the newer copy of each key, same as the normal save", () => {
    const r = mergeIntoCloud({
        existing: { data: { a: "cloud-a", b: "cloud-b" }, keyUpdatedAt: { a: 100, b: 500 } },
        localData: { a: "local-a", b: "local-b", c: "local-c" },
        localTimes: { a: 200, b: 300, c: 400 }
    });
    assert.deepEqual(r.data, { a: "local-a", b: "cloud-b", c: "local-c" });
    assert.deepEqual(r.times, { a: 200, b: 500, c: 400 });
});
test("the HTTPS commit body saves both docs, stamps the time, and guards against a racing save", () => {
    const body = buildSyncCommitBody({ docsRoot: "projects/p/databases/(default)/documents", uid: "u1", data: { k: "v" }, times: { k: 12 }, version: "ver", updateTime: "2026-11-16T00:00:00Z" });
    const [sync, meta] = body.writes;
    assert.equal(sync.update.name, "projects/p/databases/(default)/documents/users/u1/sync/localStorage");
    assert.deepEqual(sync.update.fields.data.mapValue.fields.k, { stringValue: "v" });
    assert.deepEqual(sync.update.fields.keyUpdatedAt.mapValue.fields.k, { integerValue: "12" });
    assert.deepEqual(sync.currentDocument, { updateTime: "2026-11-16T00:00:00Z" });
    assert.equal(meta.update.fields.v.stringValue, "ver");
    assert.equal(buildSyncCommitBody({ docsRoot: "r", uid: "u", data: {}, times: {}, version: "v", updateTime: null }).writes[0].currentDocument.exists, false);
    // what the pull reads back
    const back = parseSyncDocRest({ fields: sync.update.fields });
    assert.deepEqual(back.data, { k: "v" });
    assert.deepEqual(back.keyUpdatedAt, { k: 12 });
});
