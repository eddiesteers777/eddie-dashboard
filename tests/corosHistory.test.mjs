// Unit tests for the saved COROS run history (js/corosHistory.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHistory, compactRun, mergeRuns, markCovered, windowsToFetch, runsBetween, historyStatus, fitnessDays, mergeFitness, addDays } from "../js/corosHistory.js";

const TODAY = "2026-09-27";
// A run the way COROS's text reply gives it (js/corosParse.js reads it into these keys).
const raw = (id, date, km) => ({ labelid: id, sporttype: "100", title: "Outdoor Run", location: "Pelham Run", date, duration: "50:00", distance: `${km} km`, average_pace: "5:00 /km", avg_hr: "140 bpm", calories: "600 kcal" });

test("a run is kept small but complete", () => {
    const r = compactRun(raw("a1", "2026-09-26", 10));
    assert.deepEqual(Object.keys(r).sort(), ["avgHr", "calories", "date", "distance", "duration", "labelId", "name", "pace_seconds_per_mile", "sport", "sportType", "startTime"].sort());
    assert.equal(r.distance, 10000);
    assert.equal(r.duration, 3000);
    assert.ok(JSON.stringify(r).length < 300);
});

test("merging: new runs added once, updates kept, old runs drop off after ~400 days", () => {
    let { history, added } = mergeRuns(emptyHistory(), [raw("a1", "2026-09-26", 10), raw("a2", "2026-09-25", 5)], TODAY);
    assert.equal(added, 2);
    ({ history, added } = mergeRuns(history, [raw("a1", "2026-09-26", 10.5), raw("a3", "2025-08-01", 8)], TODAY));
    assert.equal(added, 1, "a1 again is an update, a3 is new but too old to keep");
    assert.equal(Object.keys(history.runs).length, 2);
    assert.equal(history.runs.a1.distance, 10500);
});

test("what to fetch: first time a year newest-first; later only the recent end and what's left of the year", () => {
    const first = windowsToFetch(emptyHistory(), TODAY);
    assert.deepEqual(first.recent, [{ start: "2026-09-21", end: TODAY }]);
    assert.equal(first.backfill.length, 52);
    assert.equal(first.backfill[0].end, "2026-09-20", "backfill picks up the day before the recent week");
    assert.equal(first.backfill.at(-1).start, addDays(TODAY, -364), "reaches exactly a year back");
    // Covered the last 5 weeks, last refreshed 3 days ago.
    let h = markCovered(emptyHistory(), "2026-08-20", "2026-09-24");
    const later = windowsToFetch(h, TODAY);
    assert.deepEqual(later.recent, [{ start: "2026-09-21", end: TODAY }], "recent end re-checks a few days (late watch syncs)");
    assert.equal(later.backfill[0].end, "2026-08-19");
    assert.equal(later.backfill.at(-1).start, addDays(TODAY, -364));
    // Fully covered: nothing to backfill.
    h = markCovered(h, addDays(TODAY, -364), TODAY);
    assert.deepEqual(windowsToFetch(h, TODAY).backfill, []);
    // Coverage that ended over a year ago starts over.
    assert.equal(windowsToFetch(markCovered(emptyHistory(), "2025-01-01", "2025-02-01"), TODAY).backfill.length, 52);
});

test("reading runs back: a date range, newest first, ready for every page", () => {
    const { history } = mergeRuns(emptyHistory(), [raw("a1", "2026-09-20", 10), raw("a2", "2026-09-26", 5), raw("a3", "2026-08-01", 8)], TODAY);
    const runs = runsBetween(history, "2026-09-01", TODAY);
    assert.deepEqual(runs.map(r => r.labelId), ["a2", "a1"]);
    assert.equal(runs[0].distanceMeters, 5000);
    assert.equal(runs[0].name, "Pelham Run");
});

test("status line while it fills in, and when done", () => {
    let { history } = mergeRuns(emptyHistory(), [raw("a1", "2026-09-26", 10)], TODAY);
    history = markCovered(history, "2026-09-21", TODAY);
    assert.equal(historyStatus(history, TODAY), "1 run saved, back to Sep 21, 2026 · loading older runs (52 weeks to go)");
    history = markCovered(history, addDays(TODAY, -364), TODAY);
    assert.equal(historyStatus(history, TODAY), "1 run saved, back to Sep 28, 2025");
    assert.equal(historyStatus(emptyHistory(), TODAY), "");
});

test("fitness by day: today's numbers, plus each day a training-load reply lists", () => {
    const days = fitnessDays(TODAY, {
        trainingLoad: "Training Load\n1. 2026-09-27\n Short-term Load: 912 | Long-term Load: 760 | Load Ratio: 1.20\n2. 2026-09-26\n Short-term Load: 880 | Long-term Load: 755 | Load Ratio: 1.17",
        recovery: "Recovery: 86% | Status: Recovered",
        fitness: "VO2max: 58.4\nMarathon: 2:58:31\nThreshold Pace: 3:52 /km"
    });
    assert.deepEqual(days[TODAY], { load: { short: 912, long: 760, ratio: 1.2 }, recovery: { percent: 86, status: "Recovered", hours: null }, vo2: 58.4, marathon: "2:58:31", threshold: "6:13/mi" });
    assert.deepEqual(days["2026-09-26"], { load: { short: 880, long: 755, ratio: 1.17 } });
    const saved = mergeFitness({ "2025-01-01": { vo2: 55 }, "2026-09-26": { vo2: 58.1 } }, days, TODAY);
    assert.deepEqual(Object.keys(saved).sort(), ["2026-09-26", TODAY]);
    assert.deepEqual(saved["2026-09-26"], { vo2: 58.1, load: { short: 880, long: 755, ratio: 1.17 } });
    assert.deepEqual(fitnessDays(TODAY, {}), {});
});
