// Unit tests for COROS fitness numbers (js/corosMetrics.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLoad, readRecovery, readFitness, recentRunRows, clockText } from "../js/corosMetrics.js";
import { normalizeActivity } from "../js/corosParse.js";

test("training load from text (newest day wins) or JSON", () => {
    const text = [
        "Training Load Assessment — last 3 days",
        "1. 2026-09-26",
        "   Short-term Load: 912 | Long-term Load: 760 | Load Ratio: 1.20",
        "   Comment: Load is rising quickly; keep easy days easy.",
        "2. 2026-09-25",
        "   Short-term Load: 850 | Long-term Load: 750 | Load Ratio: 1.13"
    ].join("\n");
    assert.deepEqual(readLoad(text), { short: 912, long: 760, ratio: 1.2, comment: "Load is rising quickly; keep easy days easy." });
    // Oldest first: still the newest day.
    const oldestFirst = "2026-09-24\nShort-term Load: 800\n2026-09-26\nShort-term Load: 912";
    assert.equal(readLoad(oldestFirst).short, 912);
    assert.deepEqual(readLoad({ data: { shortTermLoad: 900, longTermLoad: 700, loadRatio: 1.29 } }), { short: 900, long: 700, ratio: 1.29, comment: "" });
    assert.deepEqual(readLoad(null), { short: null, long: null, ratio: null, comment: "" });
});

test("recovery: percent, status, hours", () => {
    const r = readRecovery("Recovery Status\nRecovery: 86% | Status: Recovered\nFull recovery time: 10 h");
    assert.equal(r.percent, 86);
    assert.equal(r.status, "Recovered");
    assert.equal(r.hours, 10);
    assert.equal(readRecovery({ recoveryPercent: 72 }).percent, 72);
    assert.equal(readRecovery("nothing here").percent, null);
});

test("fitness: VO2 max and a marathon prediction (not the half)", () => {
    const f = readFitness("Fitness Overview\nVO2max: 58.4\nThreshold Pace: 3:52 /km\nRace Predictions:\n- 5K: 17:40\n- Half Marathon: 1:24:10\n- Marathon: 2:58:31");
    assert.equal(f.vo2, 58.4);
    assert.equal(f.marathon, "2:58:31");
    assert.equal(f.threshold, "6:13/mi");
    assert.equal(readFitness({ vo2Max: 57, marathonPredictionSeconds: 10800 }).marathon, "3:00:00");
    assert.equal(readFitness("Half Marathon: 1:24:10").marathon, null);
});

test("recent runs: newest first, miles, time, pace, heart rate", () => {
    const runs = [
        { labelid: "a", sporttype: "100", location: "Pelham Run", starttimestamp: "1790243641", duration: "1:19:21", distance: "14.52 km", average_pace: "5:28 /km", avg_hr: "134 bpm" },
        { labelid: "b", sporttype: "100", location: "19 mile long run", starttimestamp: "1790420165", duration: "2:24:52", distance: "30.61 km", average_pace: "4:44 /km", avg_hr: "146 bpm" }
    ].map(normalizeActivity);
    const rows = recentRunRows(runs);
    assert.deepEqual(rows.map(r => r.id), ["b", "a"]);
    assert.equal(rows[0].name, "19 mile long run");
    assert.equal(rows[0].miles, "19.0 mi");
    assert.equal(rows[0].time, "2:24:52");
    assert.equal(rows[0].pace, "7:37/mi");
    assert.equal(rows[0].hr, "146 bpm");
    assert.equal(rows[1].miles, "9.02 mi");
    assert.equal(clockText(457), "7:37");
});
