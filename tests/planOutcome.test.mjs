// Unit tests for plan vs actual (weekly planning P4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planOutcome, prescribedDays, outcomeLines, withOutcome } from "../js/planOutcome.js";
import { dayLine } from "../js/planPrompt.js";

const M = 1609.344;
const day = (date, type, miles, session, extra = {}) => ({ date, type, miles, session, ...extra });
const PLAN = [
    day("2026-10-12", "easy", 5, "Easy"), day("2026-10-13", "workout", 8, "Threshold: 2mi WU; 4x1mi @ 6:40-6:50; 2min jog; 2mi CD"),
    day("2026-10-14", "easy", 6, "Easy"), day("2026-10-15", "rest", 0, "Rest"), day("2026-10-16", "easy", 5, "Easy"),
    day("2026-10-17", "long", 14, "Long run"), day("2026-10-18", "easy", 4, "Easy")
];
const cycle = (extra = {}) => ({
    weekOf: "2026-10-12", weekTo: "2026-10-18", status: "approved",
    context: { plan: { lines: PLAN.map(dayLine) } },
    approved: { days: [{ date: "2026-10-17", line: dayLine(day("2026-10-17", "long", 12, "Long run")) }], planRef: { store: "self" } },
    review: [{ date: "2026-10-17", action: "accepted" }, { date: "2026-10-13", action: "kept-mine", reason: "race" }],
    ...extra
});
const run = (id, date, miles) => ({ id, date, distance: miles * M, movingSec: miles * 500 });

test("the plan judged against: the approved answer over the copied plan, the published day over both", () => {
    const days = prescribedDays(cycle());
    assert.equal(days.length, 7);
    assert.deepEqual(days.map(d => d.kind), ["easy", "quality", "easy", "rest", "easy", "long", "easy"]);
    assert.equal(days.find(d => d.date === "2026-10-17").miles, 12, "the approved 12, not the copied 14");
    assert.ok(days.find(d => d.date === "2026-10-13").sets.length, "a workout keeps its sets (for execution)");
    const pub = cycle({ approved: { ...cycle().approved, published: { days: [{ date: "2026-10-17", line: dayLine(day("2026-10-17", "long", 13, "Long run")) }] } } });
    assert.equal(prescribedDays(pub).find(d => d.date === "2026-10-17").miles, 13);
    assert.equal(prescribedDays(cycle({ status: "undone" })).find(d => d.date === "2026-10-17").miles, 14, "undone: back to the plan as copied");
});

test("each day: completed / modified (short or easy instead) / missed / extra / rest; the week; the three lines", () => {
    const planDays = prescribedDays(cycle());
    const sessions = [run("a", "2026-10-12", 5), run("b", "2026-10-13", 8), run("c", "2026-10-14", 3), run("x", "2026-10-15", 3), run("d", "2026-10-17", 12.2), run("e", "2026-10-18", 4)];
    const o = planOutcome({
        planDays, sessions, from: "2026-10-12", to: "2026-10-18", today: "2026-10-20",
        doses: [{ id: "b", intensity: 0.74 }], effortRows: [{ id: "d", rpe: 6, expected: 4.5, residual: 1.5, minutes: 100 }, { id: "a", rpe: 2, expected: 2, residual: 0, minutes: 40 }],
        effRuns: [{ id: "a", residual: 3.4 }], execution: [],
        checkins: { "2026-10-16": { pain: "left calf words", sick: false } },
        accepted: ["2026-10-17"], kept: ["2026-10-13"]
    });
    const by = Object.fromEntries(o.days.map(d => [d.date, d]));
    assert.equal(by["2026-10-12"].status, "completed");
    assert.equal(by["2026-10-12"].actual.hrResidual, 3.4);
    assert.equal(by["2026-10-13"].status, "modified");
    assert.equal(by["2026-10-13"].why, "ran easy instead of the workout");
    assert.equal(by["2026-10-14"].status, "modified");
    assert.equal(by["2026-10-14"].why, "3 of 6 mi");
    assert.equal(by["2026-10-15"].status, "extra");
    assert.equal(by["2026-10-16"].status, "missed");
    assert.equal(by["2026-10-17"].status, "completed");
    assert.equal(by["2026-10-17"].from, "answer");
    assert.match(by["2026-10-17"].line, /^Sat long run: prescribed Long run → 12.2 of 12 mi, effort 6 \(usual 4.5\)$/);
    assert.match(by["2026-10-13"].line, /prescribed Threshold.*→ 8 of 8 mi, ran easy instead of the workout/);
    const w = o.week;
    assert.deepEqual([w.runDays, w.completed, w.modified, w.missed, w.extra, w.keyPlanned, w.keyDone], [6, 3, 2, 1, 1, 2, 1]);
    assert.equal(w.plannedMiles, 40);
    assert.equal(w.doneMiles, 35.2);
    assert.equal(w.adherence, 50);
    assert.deepEqual(w.effort, { n: 2, mean: 0.8 });
    assert.deepEqual(w.flags, [{ date: "2026-10-16", kind: "pain" }]);
    assert.deepEqual(w.answer, { n: 1, done: 1 });
    assert.deepEqual(w.kept, { n: 1, done: 0 });
    assert.equal(o.done, true);
    assert.equal(o.lines.length, 3);
    assert.match(o.lines[0], /^Last planned week \(Oct 12 – Oct 18\): 35.2 of 40 planned miles; 3 of 6 run days as planned, 2 changed, 1 missed; key sessions 1 of 2\.$/);
    assert.match(o.lines[1], /Tue workout changed \(ran easy instead of the workout\); Wed easy run changed \(3 of 6 mi\); Fri easy run missed/);
    assert.match(o.lines[2], /^2 rated runs felt 0.8 harder than usual on average; days taken from the chatbot's answer: 1 of 1 done as planned; pain reported Oct 16\.$/);
    assert.ok(!JSON.stringify(o).includes("calf"), "pain is a dated yes, never the words");
    assert.ok(JSON.stringify(withOutcome({ id: "x" }, o)).length < 40000, "fits the cycle's outcome cap");
});

test("execution from laps, a skipped log, a week still under way", () => {
    const planDays = prescribedDays(cycle());
    const o = planOutcome({
        planDays, sessions: [run("b", "2026-10-13", 8)], from: "2026-10-12", to: "2026-10-18", today: "2026-10-15",
        execution: [{ date: "2026-10-13", work: 4, onTarget: 3, fast: 1, slow: 0 }], skipped: ["2026-10-12"], doses: [{ id: "b", intensity: 0.95 }]
    });
    const by = Object.fromEntries(o.days.map(d => [d.date, d]));
    assert.equal(by["2026-10-12"].status, "missed");
    assert.equal(by["2026-10-12"].why, "logged as skipped");
    assert.match(by["2026-10-13"].line, /8 of 8 mi, 3 of 4 reps on target, 1 fast$/);
    assert.equal(by["2026-10-15"].status, "upcoming", "today isn't judged yet");
    assert.equal(o.through, "2026-10-14");
    assert.equal(o.done, false);
    assert.match(o.lines[0], /\(so far\)\.$/);
    assert.match(o.lines[1], /Mon easy run missed \(skipped\); Wed easy run missed/);
});

test("a week with nothing planned, and one done as written", () => {
    const none = planOutcome({ planDays: [], sessions: [run("a", "2026-10-12", 4)], from: "2026-10-12", to: "2026-10-18", today: "2026-10-25" });
    assert.match(none.lines[0], /4 mi run, no runs were planned/);
    const all = planOutcome({ planDays: prescribedDays(cycle()), sessions: PLAN.filter(d => d.miles).map((d, i) => run(`r${i}`, d.date, d.date === "2026-10-17" ? 12 : d.miles)), from: "2026-10-12", to: "2026-10-18", today: "2026-10-25" });
    assert.equal(all.week.adherence, 100);
    assert.equal(outcomeLines(all)[1], "Every planned run was done as written.");
});
