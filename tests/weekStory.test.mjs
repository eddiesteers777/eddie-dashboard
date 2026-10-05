// Unit tests for the Weekly Review story (js/weekStory.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekGlance, weekSentence, modelReading, responseWeek, nextWeek, recoveryWord } from "../js/weekStory.js";

const M = 1609.344;
const PLAN = [
    { date: "2026-10-05", dayName: "Mon", session: "Rest", miles: 0, kind: "rest" },
    { date: "2026-10-06", dayName: "Tue", session: "6x1mi @ T", miles: 9, kind: "quality" },
    { date: "2026-10-07", dayName: "Wed", session: "Easy", miles: 7, kind: "easy" },
    { date: "2026-10-08", dayName: "Thu", session: "Easy", miles: 8, kind: "easy" },
    { date: "2026-10-09", dayName: "Fri", session: "MP 8", miles: 12, kind: "quality" },
    { date: "2026-10-10", dayName: "Sat", session: "Easy", miles: 6, kind: "easy" },
    { date: "2026-10-11", dayName: "Sun", session: "Long", miles: 20, kind: "long" }
];
const run = (date, miles, id = `c:${date}`) => ({ id, date, distance: miles * M });

test("week at a glance: planned vs done by day, key workouts marked, totals so far", () => {
    const g = weekGlance({ planDays: PLAN, runs: [run("2026-10-06", 9.2), run("2026-10-07", 4), run("2026-10-09", 12.1), run("2026-10-05", 3)], today: "2026-10-09" });
    assert.deepEqual(g.days.map(d => d.state), ["extra", "done", "partial", "missed", "done", "upcoming", "upcoming"]);
    assert.deepEqual(g.days.filter(d => d.key).map(d => d.dayName), ["Tue", "Fri", "Sun"]);
    assert.equal(g.plannedMiles, 62);
    assert.equal(g.plannedToDate, 36);
    assert.equal(g.doneMiles, 28.3);
    assert.equal(g.keyToDate, 2);
    assert.equal(g.keyDone, 2);
    const today = weekGlance({ planDays: PLAN, runs: [], today: "2026-10-06" });
    assert.equal(today.days[1].state, "today", "a planned run today with nothing yet isn't missed");
    assert.equal(today.keyToDate, 0);
});

test("the week in one sentence, ending in the decision", () => {
    const g = weekGlance({ planDays: PLAN, runs: [run("2026-10-06", 9.2), run("2026-10-07", 7), run("2026-10-08", 8), run("2026-10-09", 12.1)], today: "2026-10-09" });
    const decision = { label: "Proceed", domains: [{ key: "autonomic", severity: 0 }, { key: "sleep", severity: 0 }] };
    assert.equal(weekSentence({ weekNumber: 12, glance: g, reading: { key: "hrOnly" }, decision }),
        "Week 12: 36.3 of 62 planned miles (36 planned through today), both key workouts done, easy runs costing a little more heart rate than usual; recovery normal → Proceed.");
    assert.equal(weekSentence({ glance: null, reading: { key: "partial" }, decision: null }), "This week: nothing logged yet.");
    assert.equal(recoveryWord([{ key: "sleep", severity: 2 }, { key: "load", severity: 3 }]), "recovery off");
    assert.equal(recoveryWord([{ key: "load", severity: 3 }]), null);
});

test("one reading for the week", () => {
    assert.equal(modelReading({ reading: { key: "steady" }, decision: { level: "ease", domains: [{}] } }).title, "Accumulating fatigue");
    assert.equal(modelReading({ reading: { key: "fatigue" }, decision: { level: "absorb", domains: [{}] } }).title, "Unusual response");
    assert.equal(modelReading({ reading: { key: "adaptation" }, decision: { level: "proceed", domains: [{}] } }).title, "Adapting");
    assert.equal(modelReading({ reading: { key: "steady" }, decision: { level: "proceed", domains: [{}] } }).title, "Steady");
    const none = modelReading({ reading: { key: "partial", text: "Needs a few more easy runs with heart rate." }, decision: { level: "proceed", domains: [] } });
    assert.equal(none.title, "Not enough evidence");
    assert.match(none.text, /Needs a few more easy runs/);
    assert.match(modelReading({ reading: null, decision: { level: "checkin", reason: "pain reported", domains: [] } }).text, /pain reported/);
});

test("this week's responses: rated N of M, the runs that stood out, execution", () => {
    const rows = [
        { date: "2026-10-06", cls: "threshold", rpe: 8, expected: 6, residual: 2 },
        { date: "2026-10-07", cls: "easy", rpe: 2, expected: 2.2, residual: -0.2 },
        { date: "2026-10-01", cls: "easy", rpe: 6, expected: 2, residual: 4 }   // last week
    ];
    const r = responseWeek({ effortRows: rows, execution: [{ date: "2026-10-06", title: "6x1mi", work: 6, onTarget: 5 }], runs: [run("2026-10-06", 9), run("2026-10-07", 7), run("2026-10-08", 8), { id: "l:1", date: "2026-10-08", distance: 0 }], from: "2026-10-05", to: "2026-10-11" });
    assert.equal(r.rated, 2);
    assert.equal(r.of, 3, "watch runs only");
    assert.equal(r.mean, 0.9);
    assert.equal(r.stoodOut.length, 1);
    assert.match(r.stoodOut[0].text, /threshold run felt 2 harder than it usually costs you \(8, expected 6\)/);
    assert.equal(r.execution.length, 1);
});

test("next week: the plan's days with the decision's changes inline, and one thing to watch", () => {
    const decision = { level: "ease", changes: [{ date: "2026-10-07", text: "Easy 7 → 5.5 mi" }], domains: [{ key: "sleep", label: "Sleep", severity: 2, text: "6h short over the last 7 nights" }, { key: "load", label: "Load", severity: 1, text: "x" }] };
    const n = nextWeek({ planDays: PLAN.slice(1), decision });
    assert.equal(n.days.length, 6);
    assert.equal(n.days[1].change, "Easy 7 → 5.5 mi");
    assert.equal(n.changed, 1);
    assert.equal(n.watch, "Watch sleep: 6h short over the last 7 nights.");
    assert.match(nextWeek({ planDays: PLAN, decision: { level: "proceed", changes: [], domains: [{ severity: 0 }] } }).watch, /Nothing in particular/);
    assert.equal(nextWeek({ planDays: PLAN, decision: { level: "checkin", reason: "pain: knee", changes: [], domains: [] } }).watch, "Before anything hard: pain: knee.");
});

test("recovery as changes from usual: last 7 nights against the 28 before, sleep against the need", async () => {
    const { recoveryWeek } = await import("../js/weekStory.js");
    const health = {};
    for (let i = 0; i < 35; i++) {
        const d = new Date(2026, 9, 9 - i); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        health[k] = { hrv: { avg: i < 7 ? 70 : 80 }, rhr: i < 7 ? 52 : 48, sleep: { asleepMin: i < 7 ? 400 : 450 } };
    }
    const r = recoveryWeek({ health, checkins: { "2026-10-09": { energy: 3 }, "2026-10-01": {} }, today: "2026-10-09", needMin: 450 });
    assert.deepEqual(r.hrv, { week: 70, usual: 80, n: 7 });
    assert.deepEqual(r.rhr, { week: 52, usual: 48, n: 7 });
    assert.deepEqual(r.sleep, { avgMin: 400, needMin: 450, n: 7 });
    assert.equal(r.checkins, 1);
    assert.equal(recoveryWeek({ health: {}, today: "2026-10-09" }).hrv.week, null);
});
