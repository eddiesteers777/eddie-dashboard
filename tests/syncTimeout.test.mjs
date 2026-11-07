import test from "node:test";
import assert from "node:assert/strict";
import { withTimeout, parseSyncDocRest } from "../js/syncTimeout.js";

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
