import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientProgressModel, formatMiles } from "../js/clientProgress.js";

test("formatMiles keeps client progress compact", () => {
    assert.equal(formatMiles(12.34), "12.3");
    assert.equal(formatMiles(0), "0");
    assert.equal(formatMiles("bad"), "0");
});

test("client progress model keeps the six most recent weeks", () => {
    const progress = {
        hasActivity: true,
        activity: { completedWorkouts: 9, runMiles: 31.25 },
        trend: { recentMiles: 18, priorMiles: 15, milesChangePct: 20 },
        trainingTrends: {
            weeks: Array.from({ length: 8 }, (_, i) => ({
                start: `2026-08-${String(i + 1).padStart(2, "0")}`,
                runMiles: i + 1,
                completedWorkouts: i,
                skippedWorkouts: i % 2
            }))
        }
    };

    const model = buildClientProgressModel(progress);
    assert.equal(model.completedWorkouts, 9);
    assert.equal(model.runMiles, 31.25);
    assert.equal(model.milesChangePct, 20);
    assert.equal(model.weeks.length, 6);
    assert.equal(model.weeks[0].runMiles, 3);
    assert.equal(model.weeks.at(-1).runMiles, 8);
    assert.equal(model.hasData, true);
});

test("client progress model stays empty when no tracked activity exists", () => {
    const model = buildClientProgressModel({
        activity: { completedWorkouts: 0, runMiles: 0 },
        trainingTrends: { weeks: [] }
    });
    assert.equal(model.hasData, false);
    assert.deepEqual(model.weeks, []);
});
