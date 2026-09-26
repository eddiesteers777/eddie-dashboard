// Unit tests for the coach's weekly workspace operations (js/planOps.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    moveDay, copyDay, clearDay, nextWeekDate, copyWeek, clearWeek, dayEntry, weekEntry,
    applyEntryToDay, applyWeekEntry, prescriptionText, BUILT_IN_RUNS, RUN_FOLDERS, isRest
} from "../js/planOps.js";
import { blankPlan, diffPlans, changeLines } from "../js/coachingPlanModel.js";

const lift = { title: "Lower", minutes: 40, goal: "", notes: "", exercises: [{ name: "Squat", sets: 3, reps: "5", weight: 135, rpe: null, rir: null, restSec: 120, superset: false, note: "", video: "" }] };

// Two weeks from Mon 2026-09-28: Tue tempo 6 (structured), Wed strength, Sat long 12; client marks on Tue.
function plan() {
    const p = blankPlan("2026-09-28", 2);
    const d = p.weeks[0].days;
    Object.assign(d[1], { type: "workout", miles: 6, session: "3 × 1 mi", workout: { warmup: { amount: 1.5, unit: "mi", note: "easy" }, sets: [], cooldown: null, why: "", cue: "" }, completed: true, resultId: "r1" });
    Object.assign(d[2], { type: "strength", session: "Lower", strength: lift });
    Object.assign(d[5], { type: "long", miles: 12, session: "" });
    p.weeks[0].phase = "Build";
    return p;
}
const day = (p, date) => p.weeks.flatMap(w => w.days).find(d => d.date === date);

test("move swaps two days; dates and the client's marks stay put", () => {
    const p = moveDay(plan(), "2026-09-29", "2026-10-01");
    assert.equal(day(p, "2026-10-01").type, "workout");
    assert.equal(day(p, "2026-10-01").workout.warmup.amount, 1.5, "the structured run moves with it");
    assert.equal(day(p, "2026-09-29").type, "rest");
    assert.equal(day(p, "2026-09-29").completed, true, "a mark belongs to the date");
    assert.equal(day(p, "2026-09-29").workout, undefined);
    // Moving onto a busy day swaps rather than overwrites.
    moveDay(p, "2026-10-01", "2026-10-03");
    assert.equal(day(p, "2026-10-03").type, "workout");
    assert.equal(day(p, "2026-10-01").type, "long");
    assert.equal(p.weeks[0].plannedMiles, 18);
});

test("copy a day, to next week, and clear it", () => {
    const p = plan();
    copyDay(p, "2026-09-30", "2026-10-02");
    assert.deepEqual(day(p, "2026-10-02").strength, lift);
    day(p, "2026-10-02").strength.exercises[0].weight = 185;
    assert.equal(day(p, "2026-09-30").strength.exercises[0].weight, 135, "copies don't share objects");
    assert.equal(nextWeekDate(p, "2026-09-29"), "2026-10-06");
    assert.equal(nextWeekDate(p, "2026-10-06"), null, "no week after the last");
    copyDay(p, "2026-09-29", nextWeekDate(p, "2026-09-29"));
    assert.equal(day(p, "2026-10-06").miles, 6);
    assert.equal(day(p, "2026-10-06").completed, undefined, "marks never copy");
    clearDay(p, "2026-09-29");
    assert.ok(isRest(day(p, "2026-09-29")));
    assert.equal(p.weeks[1].plannedMiles, 6);
});

test("copy and clear whole weeks", () => {
    const p = copyWeek(plan(), 0, 1);
    assert.deepEqual(p.weeks[1].days.map(d => d.type), ["rest", "workout", "strength", "rest", "rest", "long", "rest"]);
    assert.equal(p.weeks[1].plannedMiles, 18);
    assert.equal(p.weeks[1].phase, "Build");
    assert.equal(p.weeks[1].days[1].date, "2026-10-06");
    clearWeek(p, 0);
    assert.ok(p.weeks[0].days.every(isRest));
    assert.equal(p.weeks[0].plannedMiles, 0);
    // The change list reads it like a coach would.
    const lines = changeLines(diffPlans(plan(), copyWeek(plan(), 0, 1)));
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^Tue, Oct 6: Rest → 6 mi Workout/);
});

test("library: save a day or a week, apply it elsewhere", () => {
    const p = plan();
    const tempo = dayEntry(day(p, "2026-09-29"), { name: "Tempo 3 × 1 mi", folder: "Tempo", now: 1 });
    assert.equal(tempo.kind, "run");
    assert.equal(tempo.rx.completed, undefined, "no client marks in the library");
    const lower = dayEntry(day(p, "2026-09-30"), { folder: "Lower", now: 2 });
    assert.equal(lower.kind, "strength");
    assert.equal(lower.name, "Lower · 1 exercise · 40 min");
    applyEntryToDay(p, "2026-10-07", tempo);
    assert.equal(day(p, "2026-10-07").session, "3 × 1 mi");
    // A strength entry on a run day adds the lift to the run.
    applyEntryToDay(p, "2026-10-07", lower);
    assert.equal(day(p, "2026-10-07").type, "workout");
    assert.equal(day(p, "2026-10-07").strength.title, "Lower");
    assert.equal(prescriptionText(day(p, "2026-10-07")), "6 mi Workout (3 × 1 mi) + Lower · 1 exercise · 40 min");
    // ...and on a rest day it becomes the day.
    applyEntryToDay(p, "2026-10-08", lower);
    assert.equal(day(p, "2026-10-08").type, "strength");
    const wk = weekEntry(p.weeks[0], { name: "Build week", now: 3 });
    assert.equal(wk.days.length, 7);
    assert.equal(wk.miles, 18);
    applyWeekEntry(p, 1, wk);
    assert.deepEqual(p.weeks[1].days.map(d => d.type), ["rest", "workout", "strength", "rest", "rest", "long", "rest"]);
});

test("built-in Southbound run workouts are ready to insert", () => {
    assert.ok(BUILT_IN_RUNS.length >= 10);
    for (const b of BUILT_IN_RUNS) {
        assert.ok(RUN_FOLDERS.includes(b.folder), b.name);
        assert.ok(b.rx.miles > 0 && b.rx.session, b.name);
        assert.ok(!/effort effort/.test(b.rx.session), b.name);
    }
    const p = plan();
    applyEntryToDay(p, "2026-10-01", BUILT_IN_RUNS.find(b => b.id === "sb-int-800s"));
    assert.equal(day(p, "2026-10-01").workout.sets[0].amount, 800);
    assert.equal(day(p, "2026-10-01").type, "workout");
});
