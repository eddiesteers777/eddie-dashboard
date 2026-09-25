// Unit tests for the coaching plan model (js/coachingPlanModel.js).
// Run with: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    stripRuntime, recalcPlannedMiles, planDateRange, blankPlan, addWeeks,
    diffPlans, changeLines, mergeRuntimeByDate, planWeekFor, dayText, mondayOf
} from "../js/coachingPlanModel.js";

// Week of Mon 2026-09-28.
function week(overrides = {}) {
    const plan = blankPlan("2026-09-30", 1);
    const days = plan.weeks[0].days;
    days[0] = { ...days[0], type: "easy", miles: 5 };
    days[1] = { ...days[1], type: "workout", miles: 6, session: "3 x 1 mi @ tempo" };
    days[3] = { ...days[3], type: "easy", miles: 4 };
    days[5] = { ...days[5], type: "long", miles: 12 };
    for (const [i, patch] of Object.entries(overrides)) days[i] = { ...days[i], ...patch };
    return recalcPlannedMiles(plan);
}

test("blank plan starts on the Monday and has 7 rest days a week", () => {
    const plan = blankPlan("2026-09-30", 3);
    assert.equal(plan.weeks.length, 3);
    assert.equal(plan.weeks[0].startDate, "2026-09-28");
    assert.deepEqual(plan.weeks[0].days.map(d => d.day), ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    assert.ok(plan.weeks.every(w => w.days.every(d => d.type === "rest")));
    assert.deepEqual(planDateRange(plan), { startDate: "2026-09-28", endDate: "2026-10-18" });
    assert.equal(mondayOf("2026-10-04"), "2026-09-28");
    const longer = addWeeks(plan, 2);
    assert.equal(longer.weeks.length, 5);
    assert.equal(longer.weeks[4].startDate, "2026-10-26");
    assert.equal(plan.weeks.length, 3, "addWeeks doesn't change the original");
});

test("planned miles follow the days", () => {
    assert.equal(week().weeks[0].plannedMiles, 27);
});

test("stripRuntime keeps the prescription and drops what the athlete recorded", () => {
    const plan = week({ 0: { completed: true, actualPace: "8:10", notes: "felt good" } });
    const clean = stripRuntime(plan);
    assert.equal(clean.weeks[0].days[0].miles, 5);
    assert.equal("completed" in clean.weeks[0].days[0], false);
    assert.equal("notes" in clean.weeks[0].days[0], false);
    assert.equal(plan.weeks[0].days[0].completed, true, "original untouched");
});

test("diff lists changed, added and removed days in date order", () => {
    const before = week();
    const after = week({ 1: { miles: 7 }, 3: { type: "rest", miles: 0 } });
    const lines = changeLines(diffPlans(before, after));
    assert.deepEqual(lines, [
        "Tue, Sep 29: 6 mi Workout (3 x 1 mi @ tempo) → 7 mi Workout (3 x 1 mi @ tempo)",
        "Thu, Oct 1: 4 mi Easy → Rest"
    ]);
    const longer = recalcPlannedMiles(addWeeks(before, 1));
    longer.weeks[1].days[0] = { ...longer.weeks[1].days[0], type: "easy", miles: 3 };
    const added = diffPlans(before, longer);
    assert.ok(added.some(c => c.kind === "added" && c.date === "2026-10-05" && c.after === "3 mi Easy"));
    assert.deepEqual(diffPlans(before, before), []);
});

test("a workout moved within the week reads as a move", () => {
    const before = week();
    const after = week({ 5: { type: "rest", miles: 0 }, 6: { type: "long", miles: 12 } });
    assert.deepEqual(changeLines(diffPlans(before, after)), ["12 mi Long run moved from Sat, Oct 3 to Sun, Oct 4"]);
});

test("change list is capped with a count of the rest", () => {
    const before = blankPlan("2026-09-28", 3);
    const after = blankPlan("2026-09-28", 3);
    after.weeks.forEach(w => w.days.forEach(d => { d.type = "easy"; d.miles = 3; }));
    const lines = changeLines(diffPlans(before, after), { limit: 5 });
    assert.equal(lines.length, 6);
    assert.equal(lines[5], "…and 16 more");
});

test("the athlete's records carry over to a new version by date", () => {
    const local = week({ 0: { completed: true, actualPace: "8:05" }, 1: { completed: true } });
    const next = stripRuntime(week({ 1: { miles: 7 }, 2: { type: "easy", miles: 3 } }));
    const merged = mergeRuntimeByDate(local, next);
    assert.equal(merged.weeks[0].days[0].completed, true);
    assert.equal(merged.weeks[0].days[0].actualPace, "8:05");
    assert.equal(merged.weeks[0].days[1].completed, true, "done stays done even though the coach changed the miles");
    assert.equal(merged.weeks[0].days[1].miles, 7, "but the prescription is the coach's");
    assert.equal(merged.weeks[0].days[2].completed, undefined);
    assert.equal(mergeRuntimeByDate(null, next).weeks[0].days[0].completed, undefined);
});

test("where the athlete is in the plan", () => {
    const plan = blankPlan("2026-09-28", 4);
    assert.equal(planWeekFor(plan, "2026-10-07").index, 1);
    assert.equal(planWeekFor(plan, "2026-10-07").state, "current");
    assert.equal(planWeekFor(plan, "2026-09-01").state, "upcoming");
    assert.equal(planWeekFor(plan, "2026-12-01").state, "finished");
});

test("day text", () => {
    assert.equal(dayText({ type: "rest" }), "Rest");
    assert.equal(dayText({ type: "easy", miles: 5, session: "easy" }), "5 mi Easy");
    assert.equal(dayText({ type: "strength", miles: 0, session: "Lower body" }), "Strength (Lower body)");
});
