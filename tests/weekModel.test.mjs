// Unit tests for the unified week (js/weekModel.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDay, buildWeek, nextWorkout, planContext } from "../js/weekModel.js";
import { blankPlan } from "../js/coachingPlanModel.js";

// Coach plan, week of Mon 2026-09-28 (+ one more week).
function coachPlan() {
    const plan = blankPlan("2026-09-28", 2);
    const d = plan.weeks[0].days;
    d[0] = { ...d[0], type: "easy", miles: 5, session: "easy", completed: true };
    d[1] = { ...d[1], type: "workout", miles: 6, session: "3 x 1 mi @ tempo" };
    d[2] = { ...d[2], type: "strength", session: "Lower body A" };
    d[5] = { ...d[5], type: "long", miles: 12 };
    plan.weeks[0].supplemental = [{ day: "THU", type: "strength", session: "Core" }];
    plan.weeks[1].days[1] = { ...plan.weeks[1].days[1], type: "easy", miles: 4 };
    return { id: "coach-p1", name: "Fall 10K", source: "coach", generatedPlan: plan };
}

test("a week combines plan runs, strength days, extras, schedule, sessions and logs", () => {
    const inputs = {
        plans: [coachPlan()],
        strength: [{ id: "s1", date: "2026-10-02", workoutName: "Upper body", time: "18:00", completed: false }],
        sessions: [{ id: "b1", date: "2026-10-03", startTime: "09:00", title: "1-on-1 soccer" }],
        runLog: [{ date: "2026-09-28", miles: 5.2 }, { date: "2026-10-04", miles: 3 }]
    };
    const week = buildWeek("2026-09-28", inputs, "2026-09-30");
    const [mon, tue, wed, thu, fri, sat, sun] = week.days;
    assert.deepEqual(mon.items.map(i => [i.kind, i.title, i.miles, i.state, i.logged]), [["run", "Easy run", 5, "done", 5.2]]);
    assert.equal(tue.items[0].title, "Workout");
    assert.equal(tue.items[0].detail, "3 x 1 mi @ tempo");
    assert.equal(tue.items[0].state, "missed");
    assert.equal(wed.items[0].kind, "strength");
    assert.equal(wed.items[0].title, "Lower body A");
    assert.equal(wed.items[0].state, "today");
    assert.equal(wed.isToday, true);
    assert.deepEqual(thu.items.map(i => i.title), ["Core"]);
    assert.deepEqual(fri.items.map(i => [i.title, i.detail]), [["Upper body", "6:00 PM"]]);
    assert.deepEqual(sat.items.map(i => i.kind), ["run", "session"]);
    assert.equal(sat.items[1].detail, "9:00 AM");
    assert.deepEqual(sun.items.map(i => [i.title, i.done]), [["Logged run", true]]);
    assert.equal(week.summary.planned, 6);
    assert.equal(week.summary.done, 1);
    assert.equal(week.summary.missed, 1);
    assert.equal(week.summary.miles, 23);
    assert.equal(week.summary.milesDone, 5);
    assert.equal(week.summary.loggedMiles, 8.2);
    assert.deepEqual(week.summary.strength, { planned: 3, done: 0 });
    assert.equal(week.summary.sessions, 1);
    assert.deepEqual(week.context, { planId: "coach-p1", planName: "Fall 10K", weekNumber: 1, totalWeeks: 2, phase: "" });
});

test("a plan's strength session copied onto the Strength schedule shows once", () => {
    const race = { id: "rp1", name: "Half", source: "race-plan", generatedPlan: blankPlan("2026-09-28", 1) };
    race.generatedPlan.weeks[0].supplemental = [{ day: "WED", type: "strength", session: "Maintenance" }];
    const strength = [{ id: "s9", date: "2026-09-30", workoutName: "Maintenance lift", racePlanId: "rp1", completed: true }];
    const day = buildDay("2026-09-30", { plans: [race], strength }, "2026-10-01");
    assert.deepEqual(day.items.map(i => [i.title, i.done, i.source.type]), [["Maintenance lift", true, "strength"]]);
    // A coach plan that took over rp1 is matched through adoptedFromId.
    const coach = { ...race, id: "coach-p2", source: "coach", adoptedFromId: "rp1" };
    assert.equal(buildDay("2026-09-30", { plans: [coach], strength }, "2026-10-01").items.length, 1);
});

test("logging most of a planned run counts as done; a short log doesn't", () => {
    const plans = [coachPlan()];
    const tue = runLog => buildDay("2026-09-29", { plans, runLog }, "2026-10-01").items[0];
    assert.equal(tue([{ date: "2026-09-29", miles: 5 }]).done, true, "5 of 6 mi");
    assert.equal(tue([{ date: "2026-09-29", miles: 5 }]).autoDone, true);
    assert.equal(tue([{ date: "2026-09-29", miles: 5 }]).state, "done");
    assert.equal(tue([{ date: "2026-09-29", miles: 3 }]).done, false, "3 of 6 mi");
    assert.equal(tue([{ date: "2026-09-29", miles: 3 }]).state, "missed");
    assert.equal(tue([{ date: "2026-09-30", miles: 6 }]).state, "missed", "logged on another day");
});

test("day status: rest, done, missed, upcoming; sessions are never missed", () => {
    const inputs = { plans: [coachPlan()], sessions: [{ date: "2026-09-29", startTime: "17:00" }] };
    assert.equal(buildDay("2026-10-01", inputs, "2026-10-05").status, "missed", "Thursday's core extra wasn't done");
    assert.equal(buildDay("2026-09-28", inputs, "2026-10-05").status, "done");
    assert.equal(buildDay("2026-10-02", inputs, "2026-10-05").status, "rest");
    assert.equal(buildDay("2026-10-03", inputs, "2026-09-29").status, "upcoming");
    const skippedPlan = coachPlan();
    skippedPlan.generatedPlan.weeks[0].days[1].skipped = true;
    const tueSkipped = buildDay("2026-09-29", { plans: [skippedPlan] }, "2026-10-05");
    assert.equal(tueSkipped.items[0].state, "skipped", "skipped, not missed");
    assert.equal(tueSkipped.status, "skipped");
    const onlySession = buildDay("2026-09-29", { sessions: inputs.sessions }, "2026-10-05");
    assert.equal(onlySession.items[0].state, "done");
    assert.equal(onlySession.status, "done");
});

test("next workout after a rest day, and the plan week a date falls in", () => {
    const inputs = { plans: [coachPlan()] };
    const next = nextWorkout(inputs, "2026-10-02");
    assert.equal(next.date, "2026-10-03");
    assert.equal(next.item.title, "Long run");
    assert.equal(nextWorkout(inputs, "2026-10-05").date, "2026-10-06", "crosses into next week");
    assert.equal(nextWorkout(inputs, "2026-10-06"), null, "nothing after the plan ends");
    assert.equal(planContext(inputs.plans, "2026-10-07").weekNumber, 2);
    assert.equal(planContext(inputs.plans, "2027-01-01"), null);
    assert.equal(nextWorkout({ plans: [] }, "2026-10-02"), null);
});
