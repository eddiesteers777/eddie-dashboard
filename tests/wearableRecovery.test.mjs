import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSharedRecovery } from "../js/wearableRecovery.js";

test("recovery summary combines the 28-day health and recovery window", () => {
    const health = {
        "2026-09-20": {
            sleep: { score: 82, asleepMin: 420 },
            hrv: { avg: 72, status: "Normal" },
            rhr: 50,
            stress: { avg: 31, level: "Low" }
        },
        "2026-09-29": {
            sleep: { score: 88, asleepMin: 450 },
            hrv: { avg: 81, status: "Normal" },
            rhr: 48,
            stress: { avg: 25, level: "Relaxed" }
        }
    };
    const fitness = {
        "2026-09-29": {
            recovery: { percent: 76, status: "Moderate training recommended", hours: 34 }
        }
    };

    const shared = buildSharedRecovery(health, fitness, "2026-09-30");

    assert.equal(shared.windowFrom, "2026-09-03");
    assert.equal(shared.windowTo, "2026-09-30");
    assert.equal(shared.summary.daysWithData, 2);
    assert.equal(shared.summary.averageSleepScore, 85);
    assert.equal(shared.summary.averageAsleepMinutes, 435);
    assert.equal(shared.summary.averageHrv, 77);
    assert.equal(shared.summary.averageRestingHeartRate, 49);
    assert.equal(shared.summary.averageStress, 28);
    assert.equal(shared.summary.averageRecoveryPercent, 76);
    assert.equal(shared.summary.latestSleepScore, 88);
    assert.equal(shared.summary.latestAsleepMinutes, 450);
    assert.equal(shared.summary.latestHrv, 81);
    assert.equal(shared.summary.latestRestingHeartRate, 48);
    assert.equal(shared.summary.latestRecoveryPercent, 76);
    assert.equal(shared.summary.latestRecoveryStatus, "Moderate training recommended");
    assert.equal(shared.summary.latestRecoveryHours, 34);
    assert.equal(shared.recentDays[0].date, "2026-09-29");
});

test("recovery projection never copies readiness or unrelated private fields", () => {
    const shared = buildSharedRecovery({
        "2026-09-30": {
            sleep: { score: 90, asleepMin: 480, deepPct: 25, bed: "21:30" },
            hrv: { avg: 82, baseline: 80, status: "Normal" },
            rhr: 47,
            stress: { avg: 22, level: "Relaxed" },
            readiness: { score: 92 },
            checkin: { energy: 5 }
        }
    }, {
        "2026-09-30": {
            recovery: { percent: 88, status: "Good", hours: 10 },
            vo2: 55,
            threshold: "7:30/mi",
            marathon: "3:10:00"
        }
    }, "2026-09-30");

    assert.deepEqual(Object.keys(shared.recentDays[0]).sort(), [
        "asleepMinutes", "date", "hrvAvg", "hrvStatus", "recoveryHours",
        "recoveryPercent", "recoveryStatus", "restingHeartRate",
        "sleepScore", "stressAvg", "stressLevel"
    ]);
    assert.equal("readiness" in shared.recentDays[0], false);
    assert.equal("checkin" in shared.recentDays[0], false);
    assert.equal("vo2" in shared.summary, false);
    assert.equal("threshold" in shared.summary, false);
});

test("recovery projection is newest first and capped at eight days", () => {
    const health = {};
    for (let i = 0; i < 12; i++) {
        const d = String(30 - i).padStart(2, "0");
        health[`2026-09-${d}`] = { rhr: 50 + i };
    }

    const shared = buildSharedRecovery(health, {}, "2026-09-30");
    assert.equal(shared.recentDays.length, 8);
    assert.deepEqual(
        shared.recentDays.map(d => d.date),
        [
            "2026-09-30", "2026-09-29", "2026-09-28", "2026-09-27",
            "2026-09-26", "2026-09-25", "2026-09-24", "2026-09-23"
        ]
    );
});

test("empty recovery history stays compact", () => {
    const shared = buildSharedRecovery({}, {}, "2026-09-30");
    assert.equal(shared.summary.daysWithData, 0);
    assert.equal(shared.summary.averageSleepScore, null);
    assert.equal(shared.summary.averageHrv, null);
    assert.equal(shared.summary.averageRecoveryPercent, null);
    assert.deepEqual(shared.recentDays, []);
});
