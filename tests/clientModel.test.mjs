// Unit tests for the athlete model on a client (js/clientModel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientSessions, coachPlanDays, currentPlan, applyDecisionToPlan, targetMeters, clientModel } from "../js/clientModel.js";
import { encodeShare, decodeShare } from "../js/athleteShare.js";
import { suggestChanges } from "../js/weeklyDecision.js";
import { addDays } from "../js/athleteLedger.js";

const TODAY = "2026-10-04";   // a Sunday
const MILE = 1609.344;
const wobble = i => [0, 3, -2, 1, -3, 2, -1][i % 7];

const workout = (reps, unit = "mi") => ({ warmup: { amount: 1.5, unit: "mi" }, sets: [{ repeat: reps, amount: 1, unit, pace: "7:20-7:30", effort: "", recovery: { amount: 2, unit: "min" } }], cooldown: { amount: 1.5, unit: "mi" }, why: "", cue: "Relax your shoulders.", fuel: "" });
function plan() {
    const dates = Array.from({ length: 7 }, (_, i) => addDays("2026-10-05", i));
    return {
        weeks: [{ phase: "Build", days: [
            { date: dates[0], type: "easy", miles: 5, session: "Easy" },
            { date: dates[1], type: "workout", miles: 7, session: "1.5 mi warm-up · 6 × 1 mi @ 7:20–7:30/mi (2 min recovery) · 1.5 mi cool-down", workout: workout(6) },
            { date: dates[2], type: "easy", miles: 6, session: "Easy" },
            { date: dates[3], type: "rest", miles: 0, session: "Rest" },
            { date: dates[4], type: "easy", miles: 5, session: "Run/walk 30 min", workout: { warmup: null, sets: [{ repeat: 1, amount: 30, unit: "min", pace: "", effort: "easy", recovery: null }], cooldown: null, why: "", cue: "", fuel: "" } },
            { date: dates[5], type: "long", miles: 14, session: "Long run" },
            { date: dates[6], type: "easy", miles: 4, session: "Easy", completed: true }
        ] }]
    };
}

test("the plan's next days, in the decision's shape; reps spelled so they can be counted", () => {
    const days = coachPlanDays(plan(), "2026-10-05", 7);
    assert.equal(days.length, 7);
    assert.deepEqual(days.map(d => d.kind), ["easy", "quality", "easy", "rest", "easy", "long", "easy"]);
    assert.match(days[1].session, /6 x 1 mi/);
    assert.equal(days[0].dayName, "Mon");
    assert.equal(days[0].phase, "build");
    assert.equal(days[6].done, true);
    assert.equal(currentPlan([{ status: "active", plan: plan() }], "2026-10-06").plan.weeks.length, 1);
    assert.equal(currentPlan([{ status: "archived", plan: plan() }], "2026-10-06"), null);
});

test("Ease written into the plan: structured reps cut, timed run/walk shortened, never above the plan, done days untouched", () => {
    const p = plan();
    const days = coachPlanDays(p, "2026-10-05", 7);
    const { changes } = suggestChanges("ease", days);
    const { plan: out, lines } = applyDecisionToPlan(p, { changes });
    const d = out.weeks[0].days;
    assert.equal(d[1].workout.sets[0].repeat, 4);
    assert.match(d[1].session, /4 × 1 mi/);
    assert.equal(d[1].miles, 6, "timed recoveries: the suggested miles (7 × 0.875, to the half mile)");
    assert.equal(d[0].miles, 4);
    assert.equal(d[4].workout.sets[0].amount, 24, "30 min → 24 min");
    assert.match(d[4].session, /24 min/);
    assert.equal(d[5].miles, 12);
    assert.equal(d[6].miles, 4);
    assert.ok(d.every((x, i) => x.miles <= p.weeks[0].days[i].miles));
    assert.ok(lines.some(l => /^Tue: .*6 × 1 mi.*→.*4 × 1 mi/.test(l)), lines.join("\n"));
    assert.equal(p.weeks[0].days[1].workout.sets[0].repeat, 6, "the original isn't touched");
    const twice = applyDecisionToPlan(out, { changes });
    assert.deepEqual(twice.lines, [], "applying the same week again changes nothing");
    assert.equal(twice.plan.weeks[0].days[0].miles, 4);
});

test("Absorb adds the slower-end note to the cue; Recover turns quality into an easy run", () => {
    const p = plan();
    const days = coachPlanDays(p, "2026-10-05", 7);
    const a = applyDecisionToPlan(p, suggestChanges("absorb", days)).plan.weeks[0].days;
    assert.match(a[1].workout.cue, /slower end of the pace range/);
    assert.match(a[1].workout.cue, /Relax your shoulders/);
    assert.equal(a[1].workout.sets[0].repeat, 6);
    const r = applyDecisionToPlan(p, suggestChanges("recover", days)).plan.weeks[0].days;
    assert.equal(r[1].type, "easy");
    assert.equal(r[1].workout, undefined);
    assert.match(r[1].session, /^Easy run \(was: /);
});

test("sessions: shared watch runs get the effort from a logged plan workout; a logged run stands in on a day with no watch run", () => {
    const shared = decodeShare(encodeShare({ sessions: [
        { id: "c:1", date: "2026-10-02", start: null, distance: 8000, movingSec: 2700, avgHr: 150, rpeAnswered: false }
    ] }, TODAY));
    const results = [
        { id: "u_p_2026-10-02", date: "2026-10-02", status: "completed", distance: 5, durationSec: 2700, rpe: 6, updatedAt: Date.parse("2026-10-07T09:00:00Z") },
        { id: "u_p_2026-10-03", date: "2026-10-03", status: "completed", distance: 4, durationSec: 2200, rpe: 3 },
        { id: "u_p_2026-10-03_strength", kind: "strength", date: "2026-10-03", status: "completed", rpe: 7 },
        { id: "u_p_2026-10-01", date: "2026-10-01", status: "skipped" }
    ];
    const s = clientSessions({ shared, results, races: { "c:1": { status: "race", meters: 8000, timeSec: 2700, allOut: true } } });
    assert.equal(s.length, 2);
    assert.equal(s[0].id, "c:1");
    assert.equal(s[0].rpe, 6, "a log saved after the switch is already CR-10");
    assert.equal(s[0].race.status, "race");
    assert.equal(s[1].sources[0], "plan");
    assert.equal(Math.round(s[1].distance), Math.round(4 * MILE));
    assert.equal(s[1].rpe, 2, "a log saved before the switch (the first words' 3, \"Easy\") reads as CR-10 2");
});

test("targets from the profile", () => {
    assert.equal(targetMeters({ eventType: "half" }), 21097.5);
    assert.equal(targetMeters({ targetEvent: "Chicago Marathon" }), 42195);
    assert.equal(targetMeters({ targetEvent: "Turkey Trot 5K" }), 5000);
    assert.equal(targetMeters({ eventType: "tournament" }), null);
});

test("the whole picture from a shared year: load, response, readiness, race, and a decision on the plan", () => {
    const sessions = [];
    for (let i = 300; i >= 1; i--) {
        const date = addDays(TODAY, -i);
        if (i % 7 === 3) continue;
        const long = i % 7 === 6;
        const miles = long ? 12 : 6;
        const pace = long ? 540 : 525;   // s/mi
        sessions.push({ id: `c:${1000 + i}`, date, start: `${date}T11:00:00.000Z`, name: "Run", distance: miles * MILE, movingSec: miles * pace, avgHr: 145 + wobble(i), maxHr: 165, climb: 20, rpe: long ? 5 : 3, rpeAnswered: true });
    }
    sessions.push({ id: "c:race", date: "2026-08-22", start: "2026-08-22T12:00:00.000Z", name: "Lakefront 10K", distance: 10050, movingSec: 2580, elapsedSec: 2590, avgHr: 172, maxHr: 186, rpe: 9, rpeAnswered: true, race: { status: "race", meters: 10000, timeSec: 2590, allOut: true } });
    const health = Object.fromEntries(Array.from({ length: 110 }, (_, i) => [addDays(TODAY, -i), { hrv: { avg: i < 7 ? 48 : 62 + wobble(i) }, rhr: 50, sleep: { asleepMin: i < 7 ? 380 : 450 } }]));
    const shared = decodeShare(encodeShare({ sessions, health, checkins: {} }, TODAY));
    const m = clientModel({ shared, results: [], plan: plan(), record: { eventType: "half" }, today: TODAY });
    assert.equal(m.tier, "shared");
    assert.ok(m.counts.runs > 200);
    assert.ok(m.load.today.base > 0);
    assert.equal(m.target, 21097.5);
    assert.ok(m.race.sec > 3600 && m.race.sec < 2 * 3600, String(m.race.sec));
    assert.ok(m.readiness?.score != null);
    assert.ok(["absorb", "ease", "recover"].includes(m.decision.level), m.decision.level);
    assert.ok(m.decision.changes.length > 0);
    assert.equal(m.planDays.length, 6, "the done Sunday is left out");
    // Nothing shared: the plan logs still give a picture (effort-based load).
    const tier1 = clientModel({ results: [{ id: "x", date: "2026-10-01", status: "completed", distance: 5, durationSec: 2600, rpe: 4 }], plan: plan(), today: TODAY });
    assert.equal(tier1.tier, "plan-logs");
    assert.equal(tier1.readiness, null);
    assert.equal(clientModel({ today: TODAY }).tier, "none");
});
