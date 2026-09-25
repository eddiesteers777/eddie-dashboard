// Unit tests for structured run workouts (js/runWorkout.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    paceToSeconds, formatPace, parsePaceRange, paceRangeText, parseDuration, formatDuration,
    sanitizeWorkout, workoutSummary, plannedMiles, executionSteps, compareRun, setText
} from "../js/runWorkout.js";

const tempo = () => sanitizeWorkout({
    warmup: { amount: 1.5, unit: "mi", note: "easy" },
    sets: [{ repeat: 3, amount: 1, unit: "mi", pace: "8:05 - 8:15", recovery: { amount: 2, unit: "min", note: "easy jog" } }],
    cooldown: { amount: 1.5, unit: "mi" },
    why: "Threshold: hold a hard effort without tying up.",
    cue: "Relax your shoulders."
});

test("pace and time parsing", () => {
    assert.equal(paceToSeconds("8:05"), 485);
    assert.equal(paceToSeconds("8:65"), null);
    assert.equal(formatPace(485.4), "8:05");
    assert.deepEqual(parsePaceRange("8:15–8:05"), { lo: 485, hi: 495 });
    assert.deepEqual(parsePaceRange("7:30"), { lo: 450, hi: 450 });
    assert.equal(parsePaceRange("fast"), null);
    assert.equal(paceRangeText("8:05-8:15"), "8:05–8:15/mi");
    assert.equal(parseDuration("45:30"), 2730);
    assert.equal(parseDuration("1:05:00"), 3900);
    assert.equal(parseDuration("50"), 3000);
    assert.equal(parseDuration("5:75"), null);
    assert.equal(formatDuration(3900), "1:05:00");
    assert.equal(formatDuration(2730), "45:30");
});

test("sanitize: clamps, drops empties and junk, keeps the good parts", () => {
    const w = sanitizeWorkout({
        warmup: { amount: 0, unit: "mi" },
        sets: [{ repeat: 99, amount: 800, unit: "m", pace: "nope", effort: "5K", recovery: { amount: 400, unit: "m", note: "jog" } }, { amount: 0 }],
        cooldown: { amount: 1, unit: "furlongs" },
        why: "x".repeat(400)
    });
    assert.equal(w.warmup, null);
    assert.equal(w.sets.length, 1);
    assert.equal(w.sets[0].repeat, 50);
    assert.equal(w.sets[0].pace, "");
    assert.equal(w.sets[0].effort, "5K");
    assert.equal(w.cooldown.unit, "mi", "unknown unit -> miles");
    assert.equal(w.why.length, 300);
    assert.equal(sanitizeWorkout({ sets: [] }), null);
    assert.equal(sanitizeWorkout(null), null);
});

test("summary text reads like a coach wrote it", () => {
    assert.equal(workoutSummary(tempo()), "1.5 mi warm-up · 3 × 1 mi @ 8:05–8:15/mi (2 min easy jog) · 1.5 mi cool-down");
    assert.equal(setText(sanitizeWorkout({ sets: [{ repeat: 5, amount: 800, unit: "m", effort: "5K", recovery: { amount: 400, unit: "m" } }] }).sets[0]),
        "5 × 800 m @ 5K effort (400 m recovery)");
    assert.equal(setText(sanitizeWorkout({ sets: [{ amount: 1.5, unit: "min" }] }).sets[0]), "1:30");
});

test("planned distance: recovery counts between reps only; timed parts make it approximate", () => {
    assert.deepEqual(plannedMiles(tempo()), { miles: 6, exact: false });
    const track = sanitizeWorkout({ warmup: { amount: 1, unit: "mi" }, sets: [{ repeat: 4, amount: 1600, unit: "m", recovery: { amount: 400, unit: "m" } }], cooldown: { amount: 1, unit: "mi" } });
    assert.deepEqual(plannedMiles(track), { miles: 6.7, exact: true });
});

test("workout mode steps", () => {
    const steps = executionSteps(tempo());
    assert.deepEqual(steps.map(s => s.title), ["Warm up", "Rep 1 of 3", "Recover", "Rep 2 of 3", "Recover", "Rep 3 of 3", "Cool down"]);
    assert.equal(steps[1].target, "8:05–8:15/mi");
    assert.equal(steps[2].seconds, 120);
    assert.equal(steps[0].seconds, null);
    assert.deepEqual(executionSteps(null), []);
});

test("planned vs actual", () => {
    const planned = { miles: 6, workout: sanitizeWorkout({ sets: [{ amount: 6, unit: "mi", pace: "8:05-8:15" }] }) };
    const on = compareRun(planned, { distance: 6.1, durationSec: 6.1 * 491 });
    assert.equal(on.distancePct, 102);
    assert.equal(on.pace, "8:11/mi");
    assert.equal(on.paceVsTarget, "on");
    assert.equal(compareRun(planned, { distance: 6, durationSec: 6 * 470 }).paceVsTarget, "faster");
    assert.equal(compareRun(planned, { distance: 6, durationSec: 6 * 520 }).paceVsTarget, "slower");
    const withWarmup = compareRun({ miles: 6, workout: tempo() }, { distance: 6, durationSec: 3000 });
    assert.equal(withWarmup.paceVsTarget, null, "average pace can't be judged against the rep target");
    assert.equal(compareRun({ miles: 5 }, { distance: 0, durationSec: 0 }).pace, "");
});
