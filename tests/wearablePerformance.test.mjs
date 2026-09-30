import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSharedPerformance } from "../js/wearablePerformance.js";

const run = (date, miles, minutes, pace, hr) => ({
    labelId: date + "-" + miles,
    date,
    startTime: date + "T07:00:00.000Z",
    distance: miles * 1609.344,
    duration: minutes * 60,
    pace_seconds_per_mile: pace,
    avgHr: hr
});

test("performance summary uses the 28-day window and weighted pace/heart rate", () => {
    const history = {
        runs: {
            old: run("2026-08-31", 10, 100, 600, 150),
            easy: run("2026-09-20", 5, 50, 600, 150),
            quality: run("2026-09-29", 3, 27, 540, 160)
        }
    };
    const fitness = {
        "2026-09-29": {
            vo2: 55.2,
            threshold: "7:30/mi",
            marathon: "3:10:00",
            load: { short: 410, long: 385, ratio: 1.12 }
        }
    };

    const shared = buildSharedPerformance(history, fitness, "2026-09-30");

    assert.equal(shared.windowFrom, "2026-09-03");
    assert.equal(shared.windowTo, "2026-09-30");
    assert.equal(shared.summary.runCount, 2);
    assert.equal(shared.summary.averagePaceSecondsPerMile, 578);
    assert.equal(shared.summary.averageHeartRate, 154);
    assert.equal(shared.summary.bestPaceSecondsPerMile, 540);
    assert.equal(shared.summary.bestPaceDistanceMiles, 3);
    assert.equal(shared.summary.vo2Max, 55.2);
    assert.equal(shared.summary.thresholdPaceSecondsPerMile, 450);
    assert.equal(shared.summary.marathonPrediction, "3:10:00");
    assert.equal(shared.summary.trainingLoadRatio, 1.12);
    assert.equal(shared.summary.shortTermLoad, 410);
    assert.equal(shared.summary.longTermLoad, 385);
});

test("recent performance rows expose only approved performance fields", () => {
    const shared = buildSharedPerformance({
        runs: {
            one: {
                date: "2026-09-30",
                startTime: "2026-09-30T08:00:00.000Z",
                distance: 1609.344 * 4,
                duration: 2400,
                pace_seconds_per_mile: 600,
                avgHr: 155,
                calories: 700,
                recovery: 81,
                sleep: "8h"
            }
        }
    }, {}, "2026-09-30");

    assert.deepEqual(Object.keys(shared.recentRuns[0]).sort(), [
        "avgHeartRate", "date", "distanceMiles", "durationSeconds",
        "paceSecondsPerMile", "startTime"
    ]);
    assert.equal("calories" in shared.recentRuns[0], false);
    assert.equal("recovery" in shared.recentRuns[0], false);
    assert.equal("sleep" in shared.recentRuns[0], false);
});

test("fitness indicators use the latest entry inside the shared window", () => {
    const fitness = {
        "2026-09-10": { vo2: 52, threshold: "7:45/mi", marathon: "3:20:00" },
        "2026-09-28": { vo2: 54, threshold: "7:20/mi", marathon: "3:12:00" },
        "2026-10-01": { vo2: 60, threshold: "7:00/mi", marathon: "3:00:00" }
    };

    const shared = buildSharedPerformance(
        { runs: { one: run("2026-09-28", 5, 40, 480, 150) } },
        fitness,
        "2026-09-30"
    );

    assert.equal(shared.summary.vo2Max, 54);
    assert.equal(shared.summary.thresholdPaceSecondsPerMile, 440);
    assert.equal(shared.summary.marathonPrediction, "3:12:00");
});

test("empty performance data stays compact", () => {
    const shared = buildSharedPerformance({ runs: {} }, {}, "2026-09-30");
    assert.equal(shared.summary.runCount, 0);
    assert.equal(shared.summary.averagePaceSecondsPerMile, null);
    assert.equal(shared.summary.averageHeartRate, null);
    assert.equal(shared.summary.bestPaceSecondsPerMile, null);
    assert.deepEqual(shared.recentRuns, []);
});
