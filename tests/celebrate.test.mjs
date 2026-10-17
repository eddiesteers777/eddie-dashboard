// Unit tests for what the completion moment says (js/celebrate.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { celebrationFor, celebrateRun, celebrateHabit } from "../js/celebrate.js";

test("a run shows its miles; other workouts say what they were", () => {
    assert.deepEqual(celebrationFor({ kind: "run", title: "Easy run", miles: 5 }), { kicker: "Run done", title: "Easy run", detail: "5 mi" });
    assert.equal(celebrationFor({ kind: "run", miles: 6.25 }).detail, "6.3 mi");
    assert.equal(celebrationFor({ kind: "run", miles: 0 }).detail, "", "no miles, no detail");
    assert.equal(celebrationFor({ kind: "strength", title: "Lower body", miles: 3 }).detail, "", "miles only on runs");
    assert.equal(celebrationFor({ kind: "strength" }).kicker, "Strength done");
    assert.equal(celebrationFor({ kind: "session" }).kicker, "Session done");
    assert.equal(celebrationFor({ kind: "other" }).kicker, "Workout done");
    assert.equal(celebrationFor().kicker, "Run done");
});

test("a long title is cut to fit one display line", () => {
    const { title } = celebrationFor({ title: "Long run with marathon pace finish and strides" });
    assert.ok(title.length <= 28);
    assert.ok(title.endsWith("…"));
});

test("without a page it does nothing and still resolves", async () => {
    await celebrateRun({ kind: "run" });
    assert.equal(celebrateHabit(null), undefined);
});
