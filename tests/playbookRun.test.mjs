import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/playbook/runModel.js";

const plan = [{ name: "Warm-up", minutes: 10 }, { name: "Rondo", minutes: 12 }, { name: "Squares", minutes: 15 }];
const M = 60000;

test("a new run starts ready on the first activity with its full time", () => {
    const r = R.newRun(plan, "Tue", 1000);
    assert.equal(r.active, 0); assert.equal(r.status, "ready");
    assert.equal(R.remaining(r, 5000), 10 * M);
});
test("the timer is a deadline: time keeps passing while the page is closed", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    assert.equal(R.remaining(r, 3 * M), 7 * M);
    const back = R.parseRun(R.serializeRun(r));
    assert.equal(R.remaining(back, 9 * M), 1 * M);
});
test("pause freezes the time and resume continues from it", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    r = R.pause(r, 4 * M);
    assert.equal(R.remaining(r, 99 * M), 6 * M);
    r = R.resume(r, 100 * M);
    assert.equal(R.remaining(r, 101 * M), 5 * M);
});
test("Done checks the activity off and starts the next one with its own time", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    r = R.complete(r, 8 * M);
    assert.deepEqual(r.done, [true, false, false]);
    assert.equal(r.active, 1); assert.equal(r.status, "running");
    assert.equal(R.remaining(r, 8 * M), 12 * M);
});
test("finishing the last activity ends the run", () => {
    let r = R.start(R.newRun([{ name: "A", minutes: 5 }], "t", 0), 0);
    r = R.complete(r, M);
    assert.ok(R.isFinished(r)); assert.equal(r.status, "finished"); assert.equal(R.remaining(r, 2 * M), 0);
});
test("+1 min adds time whether running or paused, and over time shows negative", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    r = R.addMinute(r, M);
    assert.equal(R.remaining(r, M), 10 * M);
    assert.equal(R.clock(R.remaining(r, 11 * M + 20000)), "-0:20");
    const p = R.addMinute(R.pause(r, 2 * M), 2 * M);
    assert.equal(R.remaining(p, 50 * M), 10 * M);
});
test("skip is not a check: the activity stays unchecked and is not stacked later", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    r = R.skip(r, M);
    assert.equal(r.done[0], false); assert.equal(r.skipped[0], true); assert.equal(r.active, 1);
    r = R.complete(R.complete(r, 2 * M), 3 * M);
    assert.ok(R.isFinished(r)); assert.equal(R.doneCount(r), 2);
});
test("Back and Next move between open activities without checking anything", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    r = R.step(r, 1, M);
    assert.equal(r.active, 1); assert.equal(r.done.some(Boolean), false);
    r = R.step(r, -1, 2 * M);
    assert.equal(r.active, 0);
    assert.equal(R.step(r, -1, 3 * M).active, 0);
});
test("undo ticks a finished activity back open", () => {
    let r = R.complete(R.start(R.newRun([{ name: "A", minutes: 5 }], "t", 0), 0), M);
    r = R.undo(r, 0, 2 * M);
    assert.equal(r.done[0], false); assert.equal(r.active, 0);
});
test("restarting resets the active activity", () => {
    let r = R.start(R.newRun(plan, "t", 0), 0);
    r = R.restartActive(R.addMinute(r, M), 5 * M);
    assert.equal(r.status, "ready"); assert.equal(R.remaining(r, 6 * M), 10 * M);
});
test("clock formats minutes and seconds", () => {
    assert.equal(R.clock(9 * M + 42000), "9:42"); assert.equal(R.clock(0), "0:00"); assert.equal(R.clock(15 * M), "15:00");
});
test("used() runs 0 to 1 for the ring", () => {
    const r = R.start(R.newRun(plan, "t", 0), 0);
    assert.equal(R.used(r, 0), 0); assert.equal(R.used(r, 5 * M), 0.5); assert.equal(R.used(r, 99 * M), 1);
});
test("parseRun rejects junk and repairs bad numbers", () => {
    assert.equal(R.parseRun("nope"), null); assert.equal(R.parseRun(JSON.stringify({ v: 2 })), null);
    const r = R.parseRun(JSON.stringify({ v: 1, title: "x", items: [{ name: "A", minutes: 99999 }, { name: 5 }], done: [false], active: 7 }));
    assert.equal(r.items.length, 1); assert.equal(r.items[0].minutes, 90); assert.equal(r.active, 0);
});
test("empty plan makes an empty run that is not 'finished'", () => {
    const r = R.newRun([], "t", 0);
    assert.equal(R.isFinished(r), false); assert.equal(r.active, -1);
});
