// The Strength page's workouts as set-by-set steps (js/strengthRunSteps.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planRunSteps, runnerStep, lastTimeLine } from "../js/strengthRunSteps.js";

const set = (id, weight, reps, extra = {}) => ({ id, weight, reps, ...extra });
const DAY = {
    exercises: [
        { id: "sq", name: "Back Squat", restSeconds: 120, sets: [set("a", 135, 5, { type: "warmup" }), set("b", 225, 5), set("c", 225, 5, { done: true })] },
        { id: "pu", name: "Pull-up", equipment: "Bodyweight", groupId: "g1", groupType: "superset", restSeconds: 90, sets: [set("d", 0, 8), set("e", 0, 8)] },
        { id: "dp", name: "Dip", equipment: "Bodyweight", groupId: "g1", groupType: "superset", restSeconds: 60, sets: [set("f", 25, 10)] },
        { id: "pl", name: "Plank", mode: "time", restSeconds: 0, sets: [{ id: "g", duration: 45 }] },
        { id: "cu", name: "Curl", restSeconds: 60, sets: [set("h", 30, 12, { repsMax: 15 }), set("i", 20, 12, { type: "drop" })] }
    ]
};

test("steps follow the workout: singles in order, a superset round by round", () => {
    const steps = planRunSteps(DAY);
    assert.deepEqual(steps.map(s => `${s.label}:${s.name}:${s.setNo}`), [
        "1:Back Squat:1", "1:Back Squat:2", "1:Back Squat:3",
        "2A:Pull-up:1", "2B:Dip:1", "2A:Pull-up:2",
        "3:Plank:1",
        "4:Curl:1", "4:Curl:2"
    ]);
    assert.equal(steps[2].done, true, "a set already ticked stays done (a reload picks up after it)");
});

test("rest: the builder's own, none between superset members, none before a drop set, none at the end", () => {
    const rest = planRunSteps(DAY).map(s => s.restAfter);
    assert.deepEqual(rest, [120, 120, 120, 0, 60, 90, 0, 0, 0]);
});

test("what the screen shows, in lb or kg; weights stay pounds underneath", () => {
    const steps = planRunSteps(DAY);
    const warm = runnerStep(steps[0], { unit: "lb" });
    assert.equal(warm.phase, "1 · Set 1 of 3 · Warm-up set");
    assert.equal(warm.target, "5 reps @ 135 lb");
    assert.deepEqual(warm.inputs.map(i => [i.key, i.label, i.value]), [["weight", "Weight (lb)", 135], ["reps", "Reps", 5]]);
    assert.equal(warm.carry, "sq");
    assert.equal(warm.plates, true);
    const kg = runnerStep(steps[1], { unit: "kg" });
    assert.equal(kg.inputs[0].label, "Weight (kg)");
    assert.equal(kg.inputs[0].value, 102.1);
    const bw = runnerStep(steps[3], { unit: "lb" });
    assert.equal(bw.target, "8 reps · bodyweight");
    assert.equal(bw.inputs[0].label, "Added (lb)");
    assert.equal(bw.inputs[0].placeholder, "BW");
    assert.equal(bw.plates, false, "no plates for a bodyweight lift");
    assert.equal(runnerStep(steps[4]).target, "10 reps @ BW + 25 lb");
    const hold = runnerStep(steps[6]);
    assert.equal(hold.target, "45 sec");
    assert.deepEqual(hold.inputs.map(i => i.key), ["duration"]);
    assert.equal(hold.carry, "");
    assert.equal(runnerStep(steps[7]).target, "12–15 reps @ 30 lb");
    assert.match(runnerStep(steps[8]).phase, /Drop set$/);
    assert.equal(runnerStep({ ...steps[1], rpe: 8 }, { effort: "rir" }).target, "5 reps @ 225 lb · 2 RIR");
});

test("Last time in the Strength unit", () => {
    const lift = { date: "2026-10-09", mode: "reps", top: { weight: 180, reps: 5 }, sets: 3 };
    assert.equal(lastTimeLine(lift, "lb"), "Last time · Oct 9: 180 × 5 (3 sets)");
    assert.equal(lastTimeLine(lift, "kg"), "Last time · Oct 9: 81.6 kg × 5 (3 sets)");
    assert.equal(lastTimeLine(null), "");
});

test("an empty workout has no steps", () => {
    assert.deepEqual(planRunSteps({ exercises: [] }), []);
    assert.deepEqual(planRunSteps(null), []);
});
