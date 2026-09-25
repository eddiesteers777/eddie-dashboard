// Unit tests for coach-prescribed strength (js/strengthWorkout.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    sanitizeStrength, exerciseLabels, sessionSteps, setsText, targetText, strengthSummary,
    strengthDetailText, blankActual, sanitizeActual, compareStrength, safeVideoUrl, restText, repsNumber
} from "../js/strengthWorkout.js";
import { dayText, diffPlans, stripRuntime, mergeRuntimeByDate, blankPlan } from "../js/coachingPlanModel.js";

const lower = () => sanitizeStrength({
    title: "Lower Strength", minutes: "45", goal: "Strength + running support", notes: "Leave reps in the tank.",
    exercises: [
        { name: "Trap Bar Deadlift", sets: 3, reps: "5", weight: "185", rpe: "7", restSec: 150, note: "Don't chase a max.", video: "https://youtu.be/abc" },
        { name: "Bulgarian Split Squat", sets: 3, reps: "8/leg", weight: 40, restSec: 90 },
        { name: "Hamstring Curl", sets: 3, reps: "10", restSec: 0 },
        { name: "Calf Raise", sets: 3, reps: "12", restSec: 60, superset: true },
        { name: "Single-Leg Calf Iso", sets: 2, reps: "30 sec", restSec: 30 },
        { name: "", sets: 3 }
    ]
});

test("cleaning: blanks dropped, numbers bounded, only https videos", () => {
    const s = lower();
    assert.equal(s.exercises.length, 5);
    assert.equal(s.minutes, 45);
    assert.deepEqual(s.exercises[0], { name: "Trap Bar Deadlift", sets: 3, reps: "5", weight: 185, rpe: 7, rir: null, restSec: 150, superset: false, note: "Don't chase a max.", video: "https://youtu.be/abc" });
    assert.equal(s.exercises[2].weight, null);
    assert.equal(sanitizeStrength({ exercises: [{ name: " " }] }), null, "nothing to prescribe");
    assert.equal(sanitizeStrength({ exercises: [{ name: "Squat", superset: true, sets: 99, rpe: 14 }] }).exercises[0].superset, false, "the first can't be paired");
    assert.equal(sanitizeStrength({ exercises: [{ name: "Squat", sets: 99, rpe: 14 }] }).exercises[0].sets, 3);
    assert.equal(safeVideoUrl("javascript:alert(1)"), "");
    assert.equal(safeVideoUrl("http://example.com/v"), "");
    assert.equal(safeVideoUrl("not a url"), "");
});

test("labels, text and summary read like a coach wrote them", () => {
    const s = lower();
    assert.deepEqual(exerciseLabels(s.exercises), ["1", "2", "3A", "3B", "4"]);
    assert.equal(setsText(s.exercises[0]), "3 × 5 @ 185 lb");
    assert.equal(setsText(s.exercises[1]), "3 × 8/leg @ 40 lb");
    assert.equal(targetText(s.exercises[0]), "RPE 7 · rest 2:30");
    assert.equal(restText(90), "1:30");
    assert.equal(restText(120), "2 min");
    assert.equal(restText(45), "45 sec");
    assert.equal(strengthSummary(s), "Lower Strength · 5 exercises · 45 min");
    assert.match(strengthDetailText(s), /^Lower Strength: Trap Bar Deadlift 3 × 5 @ 185 lb, Bulgarian/);
    assert.equal(repsNumber("8/leg"), 8);
    assert.equal(repsNumber("AMRAP"), null);
});

test("guided order: supersets alternate, rest after the round, none at the end", () => {
    const steps = sessionSteps(lower());
    assert.equal(steps.length, 3 + 3 + 6 + 2);
    assert.deepEqual(steps.slice(0, 3).map(s => [s.label, s.set, s.restAfter]), [["1", 1, 150], ["1", 2, 150], ["1", 3, 150]]);
    assert.deepEqual(steps.slice(6, 12).map(s => `${s.label}.${s.set}:${s.restAfter}`), ["3A.1:0", "3B.1:60", "3A.2:0", "3B.2:60", "3A.3:0", "3B.3:60"]);
    assert.equal(steps.at(-1).restAfter, 0);
});

test("planned vs actual: sets done, heavier/lighter, unplanned extras", () => {
    const s = lower();
    const actual = blankActual(s);
    assert.deepEqual(actual[0].sets[0], { weight: 185, reps: 5, done: false });
    actual[0].sets = [{ weight: 185, reps: 5 }, { weight: 185, reps: 5 }, { weight: 195, reps: 5 }];
    actual[1].sets = [{ weight: 35, reps: 8 }, { weight: 35, reps: 8 }, { weight: 35, reps: 8 }];
    actual[2].sets = [{ reps: 10 }, { reps: 10 }, { reps: 10 }];
    actual[3].sets = [{ reps: 12 }, { reps: 12 }, { reps: 12 }];
    actual[4].sets = [];
    actual.push({ name: "Plank", sets: [{ reps: 60 }] });
    const cmp = compareStrength(s, actual);
    assert.equal(cmp.plannedSets, 14);
    assert.equal(cmp.doneSets, 12);
    assert.equal(cmp.pct, 86);
    assert.equal(cmp.rows[0].actual, "185 × 5, 185 × 5, 195 × 5");
    assert.equal(cmp.rows[0].change, "heavier");
    assert.equal(cmp.rows[1].change, "lighter");
    assert.equal(cmp.rows[2].change, "");
    assert.equal(cmp.rows.at(-1).name, "Plank");
    assert.deepEqual(cmp.highlights, [
        "12 of 14 planned sets done",
        "Trap Bar Deadlift: top set 195 lb (planned 185)",
        "Bulgarian Split Squat: lighter, top set 35 lb (planned 40)",
        "Not done: Single-Leg Calf Iso"
    ]);
    assert.deepEqual(sanitizeActual([{ name: "Squat", sets: [{ weight: "135", reps: "5", done: true }, { weight: 135, reps: 5, done: false }, { weight: -4, reps: 9999 }] }]),
        [{ name: "Squat", sets: [{ weight: 135, reps: 5 }, { weight: null, reps: null }] }]);
});

test("in the plan: day text, the change list sees a weight change, runtime kept apart", () => {
    const plan = blankPlan("2026-09-28", 1);
    plan.weeks[0].days[2] = { ...plan.weeks[0].days[2], type: "strength", session: "Lower Strength", strength: lower() };
    plan.weeks[0].days[1] = { ...plan.weeks[0].days[1], type: "easy", miles: 5, strength: sanitizeStrength({ title: "Core", exercises: [{ name: "Dead Bug", sets: 2, reps: "10" }] }) };
    assert.match(dayText(plan.weeks[0].days[2]), /^Strength \(Lower Strength: Trap Bar Deadlift 3 × 5 @ 185 lb/);
    assert.equal(dayText(plan.weeks[0].days[1]), "5 mi Easy + Strength (Core: Dead Bug 2 × 10)");
    const next = JSON.parse(JSON.stringify(plan));
    next.weeks[0].days[2].strength.exercises[0].weight = 195;
    const changes = diffPlans(plan, next);
    assert.equal(changes.length, 1);
    assert.match(changes[0].after, /3 × 5 @ 195 lb/);
    // The client's marks on the strength session survive a new version.
    const local = JSON.parse(JSON.stringify(plan));
    Object.assign(local.weeks[0].days[1], { strengthCompleted: true, strengthResultId: "r1", completed: true });
    const merged = mergeRuntimeByDate(local, stripRuntime(next));
    assert.equal(merged.weeks[0].days[1].strengthCompleted, true);
    assert.equal(merged.weeks[0].days[1].strengthResultId, "r1");
    assert.equal(stripRuntime(local).weeks[0].days[1].strengthCompleted, undefined, "never published");
});
