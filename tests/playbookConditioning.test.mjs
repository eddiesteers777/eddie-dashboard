import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/playbook/conditioningModel.js";

test("an exercise needs a name and a work time", () => {
    assert.equal(C.cleanExercise({ name: "", work: 30 }), null);
    assert.equal(C.cleanExercise({ name: "Shuttles", work: 0 }), null);
    assert.deepEqual(C.cleanExercise({ name: " Shuttles ", work: "30", rest: "15", rounds: "4" }), { name: "Shuttles", rounds: 4, work: 30, rest: 15 });
    assert.deepEqual(C.cleanExercise({ name: "Plank", work: 45 }), { name: "Plank", rounds: 1, work: 45, rest: 0 });
});

test("limits are enforced", () => {
    assert.equal(C.cleanExercise({ name: "x", work: 9999, rounds: 99, rest: 9999 }).work, 600);
    assert.equal(C.cleanExercise({ name: "x", work: 9999, rounds: 99, rest: 9999 }).rounds, 30);
    assert.equal(C.cleanBlock(Array.from({ length: 20 }, (_, i) => ({ name: "e" + i, work: 10 }))).length, C.MAX_EXERCISES);
    assert.deepEqual(C.cleanBlock("nope"), []);
});

test("phases alternate work and rest, and skip the rest after the very last round", () => {
    const ph = C.phases([{ name: "A", work: 30, rest: 10, rounds: 2 }, { name: "B", work: 20, rest: 5, rounds: 1 }]);
    assert.deepEqual(ph.map(p => `${p.kind}:${p.seconds}`), ["work:30", "rest:10", "work:30", "rest:10", "work:20"]);
    assert.equal(C.totalSeconds([{ name: "A", work: 30, rest: 10, rounds: 2 }, { name: "B", work: 20, rest: 5, rounds: 1 }]), 100);
    assert.deepEqual(C.phases([]), []);
});

test("position in time", () => {
    const ph = C.phases([{ name: "A", work: 30, rest: 10, rounds: 2 }]);
    assert.equal(C.at(0, ph).phase.kind, "work");
    assert.equal(C.at(0, ph).left, 30);
    assert.equal(C.at(29.5, ph).left, 1);
    assert.equal(C.at(30, ph).phase.kind, "rest");
    assert.equal(C.at(40, ph).phase.round, 2);
    assert.equal(C.at(70, ph).done, true);
    assert.equal(C.clock(75), "1:15");
});

test("save and load round trip; junk is empty", () => {
    const b = [{ name: "A", work: 30, rest: 10, rounds: 2 }];
    assert.deepEqual(C.parse(C.serialize(b)), b);
    assert.deepEqual(C.parse("x"), []);
});

test("Day 1 pack lists the chosen tests and no standards", () => {
    const names = C.DAY_ONE_ITEMS.map(i => i.name.toLowerCase()).join(" ");
    assert.match(names, /1 mile/);
    assert.match(names, /beep test/);
    assert.ok(C.DAY_ONE_ITEMS.every(i => i.minutes > 0 && i.minutes <= 90));
    assert.ok(!/pass|fail|standard|minimum/.test(JSON.stringify(C.DAY_ONE_ITEMS).toLowerCase()));
});
