// Unit tests for Train's pictures (js/trainShapes.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionShape, miniShapeSvg, actualWeek } from "../js/trainShapes.js";
import { ridgeDays, weekRidgeHtml } from "../js/weekRidge.js";

const MILE = 1609.344;

test("a run with laps is its laps: as wide as the distance, taller the faster", () => {
    const run = { type: "run", run: { meters: 3 * MILE } };
    const parts = sessionShape(run, [{ m: MILE, s: 540 }, { m: MILE, s: 420 }, { m: 2 * MILE, s: 900 }]);
    assert.equal(parts.length, 3);
    assert.ok(parts[1].level > parts[0].level, "a 7:00 mile is taller than a 9:00 mile");
    assert.equal(parts[2].w / parts[0].w, 2, "a 2 mile lap is twice as wide");
});

test("a steady run stays flat: the scale is absolute, not stretched to the run's own range", () => {
    const parts = sessionShape({ type: "run" }, [{ m: MILE, s: 540 }, { m: MILE, s: 550 }, { m: MILE, s: 535 }]);
    const levels = parts.map(p => p.level);
    assert.ok(Math.max(...levels) - Math.min(...levels) < 0.05, `levels ${levels}`);
});

test("a run without laps is one even step at its average pace; with nothing known it sits in the middle", () => {
    const withPace = sessionShape({ type: "run", run: { paceSec: 480 } });
    assert.equal(withPace.length, 1);
    const fromTotals = sessionShape({ type: "run", run: { meters: 4 * MILE, movingSec: 4 * 540 } });
    assert.ok(Math.abs(fromTotals[0].level - 0.6) < 0.01, "9:00 a mile");
    assert.equal(sessionShape({ type: "run", run: {} })[0].level, 0.5);
});

test("a strength workout is a bar per exercise, as tall as its sets", () => {
    const strength = { type: "strength", strength: { exercises: [{ sets: [1, 2, 3] }, { sets: [1, 2, 3, 4, 5] }, { sets: [1] }] } };
    const parts = sessionShape(strength);
    assert.equal(parts.length, 3);
    assert.ok(parts[1].level > parts[0].level && parts[0].level > parts[2].level - 1e-9);
    assert.equal(parts[2].level, 0.25, "even one set gets a visible bar");
    assert.equal(sessionShape({ type: "strength" }).length, 1, "no exercises on file: one plain bar");
});

test("cross-training is one low block", () => {
    assert.deepEqual(sessionShape({ type: "cross", durationSec: 2400 }), [{ w: 1, level: 0.4 }]);
});

test("the small picture is decorative and drawn in the kind's colour", () => {
    const run = miniShapeSvg(sessionShape({ type: "run", run: { paceSec: 480 } }), "run");
    assert.match(run, /^<svg class="mini" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">/);
    assert.ok(run.includes("214,185,142"));
    const lift = miniShapeSvg(sessionShape({ type: "strength", strength: { exercises: [{ sets: [1, 2, 3] }, { sets: [1, 2] }] } }), "strength");
    assert.ok(lift.includes("160,187,156"));
    assert.equal((lift.match(/<rect /g) || []).length, 2, "a bar each");
    assert.equal(miniShapeSvg([], "run"), "");
});

test("the week she did: Monday first, miles run per day, a lift as a low step, empty days on the baseline", () => {
    const feed = [
        { date: "2026-10-12", type: "run", title: "Easy run", run: { meters: 4 * MILE } },
        { date: "2026-10-13", type: "strength", title: "Full Body A" },
        { date: "2026-10-15", type: "run", title: "Tempo", run: { meters: 6 * MILE } },
        { date: "2026-10-15", type: "run", title: "Shakeout", run: { meters: 1 * MILE } },
        { date: "2026-10-04", type: "run", title: "Last week", run: { meters: 9 * MILE } },
    ];
    const week = actualWeek(feed, "2026-10-12", "2026-10-15");
    const days = ridgeDays(week);
    assert.deepEqual(days.map(d => d.miles), [4, 0, 0, 7, 0, 0, 0], "two runs on a day add up; another week's run is left out");
    assert.equal(days[1].kind, "strength");
    assert.equal(days[2].kind, "rest");
    assert.deepEqual(days.map(d => d.status), ["done", "done", "upcoming", "done", "upcoming", "upcoming", "upcoming"]);
});

test("today with nothing yet is marked today; the ridge reads '—', not 'Rest', for a day with nothing logged", () => {
    const week = actualWeek([], "2026-10-12", "2026-10-15");
    assert.equal(ridgeDays(week)[3].status, "today");
    const html = weekRidgeHtml(week, { id: "t", actual: true });
    assert.match(html, /<b>Wed 14<\/b><em>—<\/em>/);
    assert.match(html, /by miles run/);
    assert.match(html, /Wed 14: nothing logged/);
});
