import test from "node:test";
import assert from "node:assert/strict";
import { buildWeek } from "../js/weekModel.js";
import { sportRows, totalsText, monthGrid, stepMonth, mondayOf, trainingItems, filterItems } from "../js/trainingGrid.js";

const day = (date, code, type, miles = 0, extra = {}) => ({ date, day: code, type, miles, session: type === "cross" ? "Easy bike" : "", ...extra });
const plan = {
    id: "p1", name: "Recovery", source: "race-plan",
    generatedPlan: { weeks: [{ week: 1, startDate: "2026-11-09", days: [
        day("2026-11-09", "MON", "cross", 0, { completed: true }), day("2026-11-10", "TUE", "rest"),
        day("2026-11-11", "WED", "cross", 0, { completed: true }), day("2026-11-12", "THU", "easy", 3),
        day("2026-11-13", "FRI", "rest"), day("2026-11-14", "SAT", "easy", 3.5), day("2026-11-15", "SUN", "rest")
    ], supplemental: [] }] }
};
const inputs = {
    plans: [plan],
    strength: [{ id: "s1", date: "2026-11-10", workoutName: "Lift A", completed: true }, { id: "s2", date: "2026-11-13", workoutName: "Lift B" }],
    sessions: [{ date: "2026-11-12", startTime: "16:00", title: "Soccer" }], runLog: [], planned: []
};
const today = "2026-11-12";

test("the card has one row per sport and counts every sport", () => {
    const week = buildWeek("2026-11-09", inputs, today);
    const g = sportRows(week);
    assert.deepEqual(g.rows.map(r => r.kind), ["run", "strength", "cross"]);
    assert.equal(g.rows[0].cells[3].miles, 3);
    assert.equal(g.rows[0].cells[3].state, "today");
    assert.equal(g.rows[0].cells[0], null);
    assert.equal(g.rows[1].cells[1].done, true);
    assert.equal(g.rows[1].cells[4].done, false);
    assert.equal(g.rows[2].cells[0].done, true);
    assert.deepEqual(g.totals, { miles: 6.5, milesDone: 0, runs: 2, strength: 2, cross: 2, planned: 6, done: 3 });
    assert.equal(totalsText(g.totals), "6.5 mi · 2 lifts · 2 cross");
    assert.equal(g.days[3].isToday, true);
});
test("a booked session is not training; an unplanned finished session is added once", () => {
    const week = buildWeek("2026-11-09", inputs, today);
    const completed = [
        { id: "ct-1", type: "cross", date: "2026-11-15", title: "Swim" },
        { id: "st-1", type: "strength", date: "2026-11-10", title: "Lift A" }, // already on the schedule
        { id: "ct-2", type: "cross", date: "2026-11-15", deleted: true }
    ];
    const g = sportRows(week, completed);
    assert.equal(g.totals.cross, 3);
    assert.equal(g.totals.strength, 2);
    assert.equal(g.rows[2].cells[6].done, true);
    assert.ok(trainingItems(week.days[3]).every(i => i.kind !== "session"));
});
test("an empty week has no totals", () => {
    const g = sportRows(buildWeek("2026-11-09", { plans: [], strength: [], sessions: [], runLog: [], planned: [] }, today));
    assert.equal(g.totals.planned, 0);
    assert.equal(totalsText(g.totals), "");
});
test("the month is whole Monday-first weeks and marks days outside it", () => {
    const m = monthGrid(2026, 11, inputs, today);
    assert.equal(m.weeks[0][0].date, "2026-10-26");
    assert.equal(m.weeks.at(-1)[6].date, "2026-12-06");
    assert.equal(m.weeks.length, 6);
    assert.ok(m.weeks.every(w => w.length === 7));
    assert.equal(m.weeks[0][0].inMonth, false);
    assert.equal(m.weeks[2][3].isToday, true);
    assert.equal(m.weeks[2][3].items[0].kind, "run");
    assert.equal(m.count, 6);
    assert.equal(filterItems(m.weeks[2][3].items, "strength").length, 0);
    assert.equal(filterItems(m.weeks[2][3].items, "all").length, 1);
});
test("month steps across a year; Monday of a Sunday is six days back", () => {
    assert.deepEqual(stepMonth(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(stepMonth(2026, 1, -1), { year: 2025, month: 12 });
    assert.equal(mondayOf("2026-11-15"), "2026-11-09");
    assert.equal(monthGrid(2027, 2, inputs, today).weeks.length, 4);
});
