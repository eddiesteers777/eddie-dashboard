// Unit tests for Analytics trends (js/trends.js) and charts (js/svgCharts.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { planVsActual, longRuns, aerobicTrend, loadTrend, parseLaps, checkWorkout, bodyTrend, bodySummary, predictionTrend, mondayOf, addDays, mmss, clock } from "../js/trends.js";
import { barsHtml, lineSvg } from "../js/svgCharts.js";

const M = 1609.344;
const run = (date, mi, paceSec, hr, name = "Run") => ({ date, distance: mi * M, duration: mi * paceSec, avgHr: hr, name });

test("plan vs actual by week; this week so far; last 4 weeks", () => {
    const weeks = [0, 1, 2, 3, 4, 5].map(i => ({ week: i + 1, start: addDays("2026-08-31", 7 * i), planned: 50 }));
    const runs = [run("2026-09-01", 10, 480, 140), run("2026-09-03", 30, 480, 140), run("2026-09-09", 45, 480, 140), run("2026-09-16", 50, 480, 140), run("2026-09-23", 55, 480, 140), run("2026-10-05", 8, 480, 140), run("2026-10-06", 6, 480, 140)];
    const r = planVsActual(weeks, runs, "2026-10-06");
    assert.deepEqual(r.rows.map(x => x.actual), [40, 45, 50, 55, 0, 14]);
    assert.equal(r.thisWeek.week, 6);
    assert.equal(r.thisWeek.runs, 2);
    assert.deepEqual(r.last4, { weeks: 4, planned: 200, actual: 150, pct: 75 });
    assert.equal(r.rows[5].isCurrent, true);
    assert.equal(planVsActual(weeks, runs, "2026-08-20").rows[0].isFuture, true);
});

test("long runs: each week's longest 10+ miler", () => {
    const lr = longRuns([run("2026-09-19", 16, 460, 145, "Long"), run("2026-09-17", 11, 450, 150), run("2026-09-26", 19, 457, 146, "19 mile long run"), run("2026-09-24", 9, 490, 134)]);
    assert.deepEqual(lr.map(x => [x.date, x.miles, x.hr]), [["2026-09-19", 16, 145], ["2026-09-26", 19, 146]]);
    assert.equal(mmss(lr[1].pace), "7:37");
});

test("aerobic fitness: easy pace at 140 bpm, and how it changed", () => {
    const runs = [];
    // 8 weeks of easy runs: the same heart rate, a bit faster each week.
    for (let w = 0; w < 8; w++) for (const d of [0, 2, 4]) runs.push(run(addDays("2026-08-03", 7 * w + d), 6, 540 - w * 3, 140));
    runs.push(run("2026-09-26", 19, 457, 160));   // too hard to count
    const t = aerobicTrend(runs);
    assert.equal(t.points.length, 8);
    assert.equal(t.points[0].paceAt140, 540);
    assert.equal(t.points[7].paceAt140, 519);
    assert.equal(t.change, 12, "about 12 s/mi faster over 4 weeks");
    assert.equal(aerobicTrend([]).change, null);
});

test("load: weekly miles and this week vs. the usual (acute : chronic)", () => {
    const runs = [];
    for (let i = 0; i < 28; i++) if (i % 7 !== 6) runs.push(run(addDays("2026-09-27", -i), 8, 480, 140));
    const l = loadTrend(runs, "2026-09-27", { weeks: 6 });
    assert.equal(l.bars.length, 6);
    assert.equal(l.bars.at(-1).start, "2026-09-21");
    assert.equal(l.ratio, 1);
    assert.equal(l.status, "safe");
    const spike = loadTrend([...runs, run("2026-09-26", 30, 480, 150)], "2026-09-27");
    assert.equal(spike.status, "caution");
    assert.equal(loadTrend([], "2026-09-27").status, "none");
});

// COROS's real lap reply for the 19-miler (first laps), JSON inside the text item.
const LAPS = { content: [{ type: "text", text: JSON.stringify({ source: "activityDetail", labelId: "480614647400005733", sportType: 100, lapGroups: [{ type: 10, lapDistance: 160934, laps: [
    { lapIndex: 1, distance: 160934, time: 500.94, avgHr: 125 }, { lapIndex: 2, distance: 160934, time: 503.24, avgHr: 129 },
    { lapIndex: 9, distance: 160934, time: 446.34, avgHr: 151 }, { lapIndex: 10, distance: 160934, time: 433.09, avgHr: 152 }, { lapIndex: 11, distance: 160934, time: 435.58, avgHr: 150 }] }] }) }] };

test("laps: COROS's lap reply -> meters, seconds, heart rate; workout laps preferred over auto miles", () => {
    const laps = parseLaps(LAPS);
    assert.deepEqual(laps[0], { i: 1, m: 1609, s: 500.9, hr: 125 });
    assert.equal(mmss(laps[0].s / (laps[0].m / M)), "8:21");
    const twoGroups = { content: [{ type: "text", text: JSON.stringify({ lapGroups: [{ type: 10, laps: [{ lapIndex: 1, distance: 160934, time: 480, avgHr: 140 }] }, { type: 2, laps: [{ lapIndex: 1, distance: 80000, time: 175, avgHr: 170 }, { lapIndex: 2, distance: 40000, time: 150, avgHr: 150 }] }] }) }] };
    assert.deepEqual(parseLaps(twoGroups).map(l => l.m), [800, 400]);
    assert.deepEqual(parseLaps({ content: [{ type: "text", text: "not json" }] }), []);
});

test("key workout check: reps against the target pace", () => {
    const reps = [];
    for (let i = 1; i <= 6; i++) { reps.push({ i: 2 * i - 1, m: 1609, s: 400 + (i === 6 ? 25 : i % 2), hr: 165 }); reps.push({ i: 2 * i, m: 250, s: 90, hr: 130 }); }
    const c = checkWorkout([{ repeat: 6, amount: 1, unit: "mi", pace: "6:35-6:50", recovery: { amount: 1.5, unit: "min" } }], reps);
    assert.equal(c.target, "6:35–6:50/mi");
    assert.equal(c.work, 6);
    assert.equal(c.onTarget, 5, "the last rep was 7:05, over the range");
    assert.deepEqual([c.fast, c.slow], [0, 1]);
    // Marathon pace run too fast: every rep at 6:40-6:41 is under 6:58-7:05.
    const quick = checkWorkout([{ repeat: 6, amount: 1, unit: "mi", pace: "6:58-7:05" }], reps);
    assert.deepEqual([quick.onTarget, quick.fast, quick.slow], [1, 5, 0]);
    assert.equal(mmss(c.avgPace), "6:45");
    assert.equal(c.avgHr, 165);
    // Mixed repeats and a long run's marathon-pace block work the same way.
    assert.equal(checkWorkout([{ repeat: 4, parts: [{ amount: 1, unit: "mi", pace: "6:58-7:05" }, { amount: 1, unit: "mi", pace: "6:35-6:50" }] }], reps).target, "6:35–7:05/mi");
    assert.equal(checkWorkout([{ effort: "hill" }], reps).target, null, "effort-only: no pace check");
});

test("body trend rows, summaries, prediction trend", () => {
    const health = { "2026-09-26": { hrv: { avg: 81, low: 74, high: 88 }, rhr: 49, sleep: { asleepMin: 417 } }, "2026-09-20": { hrv: { avg: 68, low: 75, high: 87 }, rhr: 53 } };
    const rows = bodyTrend(health, { "2026-09-26": { score: 80 } }, "2026-09-27", { days: 8 });
    assert.equal(rows.length, 8);
    assert.deepEqual(rows[6], { date: "2026-09-26", hrv: 81, low: 74, high: 88, rhr: 49, sleep: 7, readiness: 80 });
    assert.deepEqual(bodySummary(rows, "rhr"), { recent: 49, before: 53 });
    const p = predictionTrend({ "2026-09-26": { marathon: "2:58:31", vo2: 58.4 }, "2026-09-27": { load: {} } });
    assert.deepEqual(p, [{ date: "2026-09-26", marathon: 10711, vo2: 58.4 }]);
    assert.equal(clock(11100), "3:05:00");
    assert.equal(mondayOf("2026-09-27"), "2026-09-21");
});

test("charts: bars with planned behind actual; a line with gaps, band and goal", () => {
    const html = barsHtml([{ label: "W1", value: 40, planned: 50 }, { label: "W2", value: 55, planned: 50, current: true }]);
    assert.match(html, /tr-bar is-current/);
    assert.match(html, /tr-bar-plan" style="height:90.91%"/);
    assert.match(html, /tr-bar-fill is-met" style="height:100%"/);
    assert.match(html, /aria-label="W1: 40 of 50 mi, W2: 55 of 50 mi"/);
    const svg = lineSvg([80, null, 82, 84], { band: { lo: 74, hi: 88 }, goal: 81 });
    assert.equal((svg.match(/<polyline/g) || []).length, 1, "the gap splits the line");
    assert.equal((svg.match(/class="tr-path"/g) || []).length, 2);
    assert.match(svg, /class="tr-band"/);
    assert.match(svg, /class="tr-goal"/);
    assert.match(lineSvg([], {}), /<svg[^>]*><\/svg>/);
    // Pace: lower is better, so it draws higher.
    const pace = lineSvg([540, 520], { invert: true, min: 500, max: 560 });
    assert.match(pace, /points="0,66.67 100,33.33"/);
});
