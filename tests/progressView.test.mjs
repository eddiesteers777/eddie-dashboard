// Unit tests for what a client's progress shows (js/progressView.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { progressHighlights, progressSections, habitStreak } from "../js/progressView.js";
import { accessFromProfile } from "../js/navAccess.js";
import { summarizeProgress } from "../js/clientSummary.js";

const who = (services, hasCoachPlan = false) => accessFromProfile({ status: "active", services }, { hasCoachPlan });
const TODAY = "2026-10-03";
const results = [
    { date: "2026-09-29", status: "completed", distance: 5, rpe: 5 },
    { date: "2026-10-01", status: "completed", distance: 6.2, rpe: 6 },
    { date: "2026-09-30", status: "completed", kind: "strength", exercises: [{ name: "Squat", sets: [{}, {}, {}] }] },
    { date: "2026-09-25", status: "skipped" }
];
const checkins = [{ weekOf: "2026-09-28", rating: 4 }, { weekOf: "2026-09-21", rating: 5 }];
const progress = summarizeProgress({ results, checkins, today: TODAY });
const keys = list => list.map(m => m.key);

test("a running client sees miles, strength they did, workouts, check-ins, streak", () => {
    const items = progressHighlights({ progress, access: who(["running"]), streak: 4 });
    assert.deepEqual(keys(items), ["miles", "strength", "workouts", "checkins", "streak"]);
    assert.equal(items[0].value, "11.2");
    assert.match(items[0].detail, /^2 runs logged/);
    assert.equal(items.find(m => m.key === "strength").detail, "3 sets logged");
    assert.equal(items.find(m => m.key === "workouts").detail, "1 skipped");
    assert.equal(items.find(m => m.key === "checkins").detail, "Average 4.5/5");
});

test("miles and strength follow what they've logged; workouts always for a plan", () => {
    const runOnly = summarizeProgress({ results: results.filter(r => r.kind !== "strength"), today: TODAY });
    assert.deepEqual(keys(progressHighlights({ progress: runOnly, access: who(["running"]) })), ["miles", "workouts", "checkins"]);
    const none = summarizeProgress({ results: [], today: TODAY });
    assert.deepEqual(keys(progressHighlights({ progress: none, access: who(["strength"]) })), ["workouts", "checkins"]);
});

test("a soccer client sees sessions attended and the streak, nothing about running", () => {
    const items = progressHighlights({ progress, access: who(["soccer_1on1"]), attendance: { completed: 3, counted: 4 }, streak: 2 });
    assert.deepEqual(keys(items), ["sessions", "streak"]);
    assert.equal(items[0].value, "3 of 4");
    assert.deepEqual(keys(progressHighlights({ progress, access: who(["soccer_1on1"], true), attendance: { completed: 0, counted: 0 } })),
        ["workouts", "sessions", "checkins"], "with a plan from the coach: workouts and check-ins too");
});

test("sections follow what they do", () => {
    assert.deepEqual(progressSections(who(["running"])), { week: true, trend: true, plan: true, sessions: false, checkins: true });
    assert.deepEqual(progressSections(who(["soccer_group"])), { week: false, trend: false, plan: false, sessions: true, checkins: false });
    assert.deepEqual(progressSections(who(["running", "soccer_1on1"])), { week: true, trend: true, plan: true, sessions: true, checkins: true });
});

test("habit streak counts local days and forgives an unchecked today", () => {
    const day = d => ({ [d]: { h1: true } });
    const entries = { ...day("2026-10-01"), ...day("2026-10-02"), "2026-09-30": { h1: false }, ...day("2026-09-29") };
    assert.equal(habitStreak(entries, new Date(2026, 9, 3, 7)), 2, "today not checked yet: counts from yesterday");
    assert.equal(habitStreak({ ...entries, ...day("2026-10-03") }, new Date(2026, 9, 3, 23)), 3, "late evening still the same day");
    assert.equal(habitStreak({}, new Date(2026, 9, 3)), 0);
});
