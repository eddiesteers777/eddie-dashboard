// Unit tests for the shared habit lists and check-offs (js/habitDefaults.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_HABITS, CLIENT_HABITS, habitList, dayKey, toggleEntry, doneOn } from "../js/habitDefaults.js";

test("starting lists: the coach's h1-h10, clients' c1-c5; a saved list always wins", () => {
    assert.deepEqual(habitList(null, true).map(h => h.id), COACH_HABITS.map(h => h.id));
    assert.equal(habitList(undefined, false)[0].id, "c1");
    assert.equal(CLIENT_HABITS.length, 5);
    const saved = [{ id: "x", name: "Mine" }];
    assert.equal(habitList(saved, true), saved);
    assert.deepEqual(habitList([], false), [], "an emptied list stays empty");
    const copy = habitList(null, false); copy[0].name = "changed";
    assert.equal(CLIENT_HABITS[0].name, "Training Complete", "callers get copies");
});

test("the day key is the phone's local calendar day", () => {
    assert.equal(dayKey(new Date(2026, 9, 14, 23, 59)), "2026-10-14");
    assert.equal(dayKey(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
});

test("toggling adds, removes, drops an emptied day and never changes the input", () => {
    const start = { "2026-10-13": { c1: true } };
    const on = toggleEntry(start, "2026-10-14", "c2");
    assert.deepEqual(on, { "2026-10-13": { c1: true }, "2026-10-14": { c2: true } });
    assert.deepEqual(start, { "2026-10-13": { c1: true } });
    const off = toggleEntry(on, "2026-10-14", "c2");
    assert.deepEqual(off, { "2026-10-13": { c1: true } });
    assert.deepEqual(toggleEntry(null, "2026-10-14", "c1"), { "2026-10-14": { c1: true } });
});

test("done count only counts habits still on the list", () => {
    const habits = [{ id: "c1" }, { id: "c2" }];
    assert.equal(doneOn({ "2026-10-14": { c1: true, gone: true } }, "2026-10-14", habits), 1);
    assert.equal(doneOn({}, "2026-10-14", habits), 0);
});
