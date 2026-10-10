import { test } from "node:test";
import assert from "node:assert/strict";
import {
    restValue, restLabel, restAfterSet, REST_OPTIONS, DEFAULT_REST,
    nextSetType, setType, repsText, repsMaxValue, estimateMinutes,
    moveInList, canMove, cleanWorkoutName, uniqueWorkoutName, exerciseFromQuery
} from "../js/strengthBuilderModel.js";

test("rest: a real 0 is No rest, missing falls back to the default", () => {
    assert.equal(restValue(0), 0);
    assert.equal(restValue("0"), 0);
    assert.equal(restValue(undefined), DEFAULT_REST);
    assert.equal(restValue(""), DEFAULT_REST);
    assert.equal(restValue("abc"), DEFAULT_REST);
    assert.equal(restValue(45), 45);
    assert.equal(restValue(5000), 900);
    assert.ok(REST_OPTIONS.includes(0) && REST_OPTIONS.includes(90));
    assert.equal(restLabel(0), "No rest");
    assert.equal(restLabel(45), "45s");
    assert.equal(restLabel(90), "1:30");
    assert.equal(restLabel(120), "2 min");
});

test("set kinds cycle working → W → D → F → working; unknown reads as working", () => {
    assert.equal(nextSetType("working"), "warmup");
    assert.equal(nextSetType("warmup"), "drop");
    assert.equal(nextSetType("drop"), "failure");
    assert.equal(nextSetType("failure"), "working");
    assert.equal(nextSetType(undefined), "warmup");
    assert.equal(setType({ type: "weird" }), "working");
});

test("no rest timer before a drop set", () => {
    const ex = { restSeconds: 90, sets: [{ type: "working" }, { type: "drop" }, { type: "working" }] };
    assert.equal(restAfterSet(ex, 0), 0);
    assert.equal(restAfterSet(ex, 1), 90);
    assert.equal(restAfterSet({ restSeconds: 0, sets: [{}, {}] }, 0), 0);
});

test("rep ranges: reps stays the low end, repsMax only when higher", () => {
    assert.equal(repsText({ reps: 8, repsMax: 10 }), "8–10");
    assert.equal(repsText({ reps: 8, repsMax: 8 }), "8");
    assert.equal(repsText({ reps: 8, repsMax: 6 }), "8");
    assert.equal(repsText({ reps: 8 }), "8");
    assert.equal(repsMaxValue(8, ""), null);
    assert.equal(repsMaxValue(8, 12), 12);
});

test("estimated minutes count sets, rest and supersets", () => {
    const straight = { exercises: [{ id: "a", mode: "reps", restSeconds: 90, sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }] }] };
    // 60 setup + 3×32 work + 2×90 rest = 336 s ≈ 6 min
    assert.equal(estimateMinutes(straight), 6);
    const superset = { exercises: [
        { id: "a", groupId: "g", mode: "reps", restSeconds: 90, sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] },
        { id: "b", groupId: "g", mode: "reps", restSeconds: 90, sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] }
    ] };
    const apart = { exercises: superset.exercises.map(e => ({ ...e, groupId: null })) };
    assert.ok(estimateMinutes(superset) < estimateMinutes(apart));
    const noRest = { exercises: [{ ...straight.exercises[0], restSeconds: 0 }] };
    assert.ok(estimateMinutes(noRest) < estimateMinutes(straight));
    assert.equal(estimateMinutes({ exercises: [] }), 0);
});

test("moving keeps supersets together", () => {
    const list = [{ id: "A" }, { id: "g1", groupId: "g" }, { id: "g2", groupId: "g" }, { id: "B" }];
    const ids = l => l.map(x => x.id).join(",");
    assert.equal(ids(moveInList(list, "A", 1)), "g1,g2,A,B");
    assert.equal(ids(moveInList(list, "B", -1)), "A,B,g1,g2");
    assert.equal(ids(moveInList(list, "g1", 1)), "A,g2,g1,B");
    assert.equal(moveInList(list, "g1", -1), list, "a group member can't leave its group");
    assert.equal(moveInList(list, "A", -1), list);
    assert.equal(canMove(list, "B", 1), false);
    assert.equal(canMove(list, "B", -1), true);
    assert.equal(ids(moveInList([{ id: "x" }, { id: "y" }, { id: "z" }], "z", -1)), "x,z,y");
});

test("names", () => {
    assert.equal(cleanWorkoutName("  Upper   body \n A "), "Upper body A");
    assert.equal(cleanWorkoutName("   ", "Old"), "Old");
    assert.equal(cleanWorkoutName("x".repeat(80)).length, 60);
    assert.equal(uniqueWorkoutName("New Workout", ["Leg Day"]), "New Workout");
    assert.equal(uniqueWorkoutName("New Workout", ["new workout", "New Workout 2"]), "New Workout 3");
    assert.equal(exerciseFromQuery("  db   row "), "Db Row");
    assert.equal(exerciseFromQuery(""), null);
});
