import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSharedActivity } from "../js/wearableActivity.js";

const run = (date, miles, minutes, extra = {}) => ({
    labelId: date + "-" + miles,
    date,
    startTime: date + "T07:00:00.000Z",
    distance: miles * 1609.344,
    duration: minutes * 60,
    avgHr: extra.avgHr,
    pace_seconds_per_mile: extra.pace
});

test("buildSharedActivity keeps only the 28-day Training activity window", () => {
    const history = {
        runs: {
            old: run("2026-08-31", 9, 90),
            inside: run("2026-09-04", 5, 45),
            today: run("2026-09-30", 3.25, 30)
        }
    };

    const shared = buildSharedActivity(history, "2026-09-30");

    assert.equal(shared.windowFrom, "2026-09-03");
    assert.equal(shared.windowTo, "2026-09-30");
    assert.equal(shared.summary.runCount, 2);
    assert.equal(shared.summary.distanceMiles, 8.3);
    assert.equal(shared.summary.durationSeconds, 4500);
});

test("recent runs are newest first and expose only activity fields", () => {
    const history = {
        runs: {
            a: run("2026-09-28", 4.04, 36, { avgHr: 152, pace: 535 }),
            b: run("2026-09-29", 6, 54, { avgHr: 160, pace: 540 })
        }
    };

    const shared = buildSharedActivity(history, "2026-09-30");
    assert.deepEqual(shared.recentRuns.map(r => r.date), ["2026-09-29", "2026-09-28"]);
    assert.deepEqual(Object.keys(shared.recentRuns[0]).sort(), [
        "date", "distanceMiles", "durationSeconds", "startTime"
    ]);
    assert.equal("avgHr" in shared.recentRuns[0], false);
    assert.equal("pace_seconds_per_mile" in shared.recentRuns[0], false);
});

test("the projection is compact and empty when there are no recent runs", () => {
    const shared = buildSharedActivity({ runs: {} }, "2026-09-30");
    assert.deepEqual(shared.summary, {
        runCount: 0,
        distanceMiles: 0,
        durationSeconds: 0
    });
    assert.deepEqual(shared.recentRuns, []);
});

test("distance is rounded to one decimal mile and duration is whole seconds", () => {
    const history = {
        runs: {
            one: {
                date: "2026-09-30",
                startTime: "2026-09-30T08:00:00.000Z",
                distance: 1609.344 * 5.06,
                duration: 61.6
            }
        }
    };
    const shared = buildSharedActivity(history, "2026-09-30");
    assert.equal(shared.summary.distanceMiles, 5.1);
    assert.equal(shared.summary.durationSeconds, 62);
});

test("the projection does not copy calories or other raw COROS fields", () => {
    const history = {
        runs: {
            one: {
                date: "2026-09-30",
                distance: 1609.344,
                duration: 600,
                calories: 812,
                trainingLoad: 91,
                recovery: 88,
                sleep: "8h"
            }
        }
    };
    const shared = buildSharedActivity(history, "2026-09-30");
    assert.equal(shared.recentRuns[0].date, "2026-09-30");
    assert.equal(typeof shared.recentRuns[0].startTime, "string");
    assert.equal(shared.recentRuns[0].distanceMiles, 1);
    assert.equal(shared.recentRuns[0].durationSeconds, 600);
    assert.deepEqual(Object.keys(shared.recentRuns[0]).sort(), [
        "date", "distanceMiles", "durationSeconds", "startTime"
    ]);
});
