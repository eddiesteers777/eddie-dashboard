// Unit tests for Strava history (js/stravaHistory.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeActivities, sameRun, combineRuns, yearStats, fastestEfforts, otherCounts, stravaSummary, emptyStrava } from "../js/stravaHistory.js";

const M = 1609.344;
const t = iso => Date.parse(iso) / 1000;
const act = (k, d, time, miles, secs, extra = {}) => ({ k, src: "fit", d, t: t(time), y: "run", m: Math.round(miles * M), s: secs, e: secs, h: 140, n: "Run", ...extra });
const coros = (date, time, miles, secs) => ({ labelId: "c" + date, date, startTime: time, distance: Math.round(miles * M), duration: secs, avgHr: 140, name: "Run" });

test("merging imports: new, unchanged, a csv row after its file only adds the name", () => {
    const a = act("f1", "2026-09-26", "2026-09-26T10:56:05Z", 19, 8692, { b: [405, 1282, null, null, null] });
    let r = mergeActivities(emptyStrava(), [a], 5);
    assert.deepEqual([r.added, r.updated, r.store.updatedAt], [1, 0, 5]);
    r = mergeActivities(r.store, [a], 6);
    assert.deepEqual([r.added, r.updated], [0, 0]);
    const csvRow = { k: "f1", a: "15001", src: "csv", d: "2026-09-26", t: t("2026-09-26T10:56:00Z"), y: "run", m: 30600, s: 8700, e: 8850, n: "19 mile long run" };
    r = mergeActivities(r.store, [csvRow], 7);
    assert.deepEqual(r.store.acts.f1, { ...a, n: "19 mile long run", a: "15001" });
    // A file read on its own (no csv row, so no name) after a csv-only import replaces the csv numbers.
    const r2 = mergeActivities(mergeActivities(emptyStrava(), [csvRow]).store, [{ ...a, n: "" }]);
    assert.equal(r2.store.acts.f1.src, "fit");
    assert.equal(r2.store.acts.f1.n, "19 mile long run");
    assert.equal(r2.store.acts.f1.a, "15001");
});

test("the same run on COROS and Strava is counted once", () => {
    const c = coros("2026-09-26", "2026-09-26T10:56:05.000Z", 19.02, 8692);
    assert.equal(sameRun(c, act("f1", "2026-09-26", "2026-09-26T10:56:05Z", 19.02, 8692)), true, "same start");
    assert.equal(sameRun(c, act("f2", "2026-09-26", "2026-09-26T11:03:00Z", 0.5, 150)), false, "a separate cool-down minutes later");
    assert.equal(sameRun({ ...c, startTime: null }, act("f3", "2026-09-26", "2026-09-26T15:56:05Z", 19.0, 8800)), true, "no start time: same day, distance and time");
    assert.equal(sameRun({ ...c, startTime: null }, act("f4", "2026-09-26", "2026-09-26T15:56:05Z", 12, 5400)), false);
});

test("combining: COROS first, Strava fills the rest, overlap counted", () => {
    const corosRuns = [coros("2026-09-25", "2026-09-25T10:13:54.000Z", 4.02, 2120), coros("2026-09-26", "2026-09-26T10:56:05.000Z", 19.02, 8692)];
    const acts = {
        f1: act("f1", "2026-09-26", "2026-09-26T10:56:05Z", 19.02, 8692),
        f2: act("f2", "2026-09-25", "2026-09-25T10:13:54Z", 4.02, 2120),
        f3: act("f3", "2025-04-21", "2025-04-21T13:42:00Z", 26.3, 11300, { n: "Boston Marathon" }),
        r1: { ...act("r1", "2025-06-01", "2025-06-01T15:00:00Z", 18, 3500), y: "ride" }
    };
    const { runs, overlap } = combineRuns(corosRuns, acts);
    assert.equal(overlap, 2);
    assert.deepEqual(runs.map(r => [r.date, r.source || "coros"]), [["2025-04-21", "strava"], ["2026-09-25", "coros"], ["2026-09-26", "coros"]]);
    assert.equal(runs[0].name, "Boston Marathon");
    assert.equal(runs[0].startTime, "2025-04-21T13:42:00.000Z");
});

test("all-time numbers: years (with empty ones), this year vs last by today, records", () => {
    const run = (date, miles, name = "Run") => ({ date, distance: miles * M, name });
    const runs = [run("2022-03-01", 10), run("2024-03-01", 8), run("2024-11-30", 20), run("2025-01-06", 12), run("2025-01-07", 13), run("2025-10-02", 5), run("2026-01-05", 26.2, "Houston Marathon"), run("2026-09-20", 6)];
    const s = yearStats(runs, "2026-09-27");
    assert.deepEqual(s.years.map(y => [y.year, y.miles, y.runs]), [[2022, 10, 1], [2023, 0, 0], [2024, 28, 2], [2025, 30, 3], [2026, 32.2, 2]]);
    assert.deepEqual(s.ytd, { miles: 32.2, lastYear: 25 });
    assert.deepEqual(s.longest, { date: "2026-01-05", miles: 26.2, name: "Houston Marathon" });
    assert.deepEqual(s.biggestWeek, { start: "2026-01-05", miles: 26.2 });
    assert.deepEqual(s.biggestMonth, { month: "2026-01", miles: 26.2 });
    assert.deepEqual(s.total, { runs: 8, miles: 100, since: "2022-03-01" });
    assert.equal(yearStats([], "2026-09-27"), null);
});

test("fastest efforts, other activities, summary", () => {
    const acts = {
        a: act("a", "2025-10-03", "2025-10-03T10:00:00Z", 6, 2400, { b: [332, 1110, null, null, null], n: "Track" }),
        b: act("b", "2026-09-26", "2026-09-26T10:56:05Z", 19, 8692, { b: [405, 1282, 2696, 5958, null] }),
        c: act("c", "2024-01-01", "2024-01-01T10:00:00Z", 3, 900, { b: [150, null, null, null, null] }),   // a bad reading: 2:30 mile
        r: { ...act("r", "2025-06-01", "2025-06-01T15:00:00Z", 18, 3500), y: "ride", b: [100, 100, 100, 100, 100] },
        w: { ...act("w", "2025-06-02", "2025-06-02T15:00:00Z", 2, 1800), y: "walk" }
    };
    const f = fastestEfforts(acts);
    assert.deepEqual(f.mile, { sec: 332, date: "2025-10-03", name: "Track" });
    assert.equal(f.k5.sec, 1110);
    assert.equal(f.half.sec, 5958);
    assert.equal(f.full, null);
    assert.deepEqual(otherCounts(acts), { ride: 1, walk: 1 });
    assert.deepEqual(stravaSummary({ acts }), { count: 5, runs: 3, from: "2024-01-01", to: "2026-09-26" });
    assert.deepEqual(stravaSummary(emptyStrava()), { count: 0, runs: 0, from: null, to: null });
});
