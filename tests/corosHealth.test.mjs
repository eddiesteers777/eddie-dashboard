// Unit tests for COROS sleep / HRV / resting HR / stress (js/corosHealth.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { minutes, parseSleep, parseHrv, parseRestingHr, parseStress, healthDays, mergeHealth } from "../js/corosHealth.js";
import { readRecovery } from "../js/corosMetrics.js";

// COROS's real replies (Eddie's account, 2026-09-27), trimmed; each is a JSON string in the text item.
const wrap = text => ({ content: [{ type: "text", text: JSON.stringify(text) }] });
const SLEEP = wrap("Sleep Overview\n========================\nNote: each record below is dated by its wake-up day.\n\n2026-09-25\nSleep Score: 85\nDaily Sleep: 6h 53min (incl. naps)\nMain Sleep (asleep): 6h 53min\nMain Sleep Period (incl. awake): 7h 1min\nSleep metrics scope: daily\nDeep Sleep Ratio: 24%\nLight Sleep Ratio: 63%\nREM Ratio: 11%\nAwake Ratio: 2%\nAwake Time: 8 min\nAwake Count (>5 min): 0\nMain Sleep Window: 2026-09-24 21:39 - 2026-09-25 04:40\nNaps Total: 0 min\n\n2026-09-26\nSleep Score: 88\nDaily Sleep: 6h 57min (incl. naps)\nMain Sleep (asleep): 6h 57min\nMain Sleep Period (incl. awake): 7h 1min\nSleep metrics scope: daily\nDeep Sleep Ratio: 24%\nLight Sleep Ratio: 48%\nREM Ratio: 27%\nAwake Ratio: 1%\nAwake Time: 4 min\nAwake Count (>5 min): 0\nMain Sleep Window: 2026-09-25 21:47 - 2026-09-26 04:48\nNaps Total: 0 min");
const HRV = wrap("Sleep HRV — 2026-09-20 to 2026-09-26\n========================\nNote: dates are wake-up days (each value comes from the night that ended that morning).\n\nHRV Assessment — Last 7 days\n========================\n\n2026-09-26:\n  HRV Avg: 81 ms — Normal\n  Normal Range: 74 - 88 ms\n  Baseline: 81 ms\n2026-09-23:\n  HRV Avg: 91 ms — Above normal\n  Normal Range: 74 - 88 ms\n  Baseline: 81 ms\n2026-09-20:\n  HRV Avg: 68 ms — Low\n  Normal Range: 75 - 87 ms\n  Baseline: 81 ms\n\nSleep HRV Time Series — Last 7 days\n========================\n\n2026-09-20:\n  timestamp=1789880690, timezone=-20, hrv=44 ms, status=4, confidence=100000\n  timestamp=1789881290, timezone=-20, hrv=89 ms, status=4, confidence=100000");
const RHR = wrap("Resting Heart Rate — Last 7 days\n========================\n\n2026-09-26: 49 bpm\n2026-09-25: 47 bpm\n2026-09-20: 53 bpm");
const STRESS = wrap("Stress Level — Last 7 days\n========================\n\n2026-09-26:\nAverage Stress: 38 (Low)\nRelaxed: No data\n\n2026-09-25:\nAverage Stress: 25 (Relaxed)\nRelaxed: No data");
const RECOVERY = wrap("Recovery Status\n========================\n\nRecovery: 76%\nLevel: Moderate training recommended\nEstimated Full Recovery: 34h");

test("sleep: score, time asleep, stages, bed and wake time, by wake-up day", () => {
    assert.equal(minutes("6h 57min"), 417);
    assert.equal(minutes("46min"), 46);
    assert.equal(minutes("8h"), 480);
    assert.equal(minutes(""), null);
    const s = parseSleep(SLEEP);
    assert.deepEqual(Object.keys(s), ["2026-09-25", "2026-09-26"]);
    assert.deepEqual(s["2026-09-26"], { score: 88, asleepMin: 417, inBedMin: 421, deepPct: 24, lightPct: 48, remPct: 27, awakeMin: 4, bed: "21:47", wake: "04:48" });
});

test("HRV: COROS's own assessment per night (not the raw points)", () => {
    const h = parseHrv(HRV);
    assert.deepEqual(Object.keys(h).sort(), ["2026-09-20", "2026-09-23", "2026-09-26"]);
    assert.deepEqual(h["2026-09-26"], { avg: 81, status: "Normal", low: 74, high: 88, baseline: 81 });
    assert.equal(h["2026-09-23"].status, "Above normal");
    assert.deepEqual(h["2026-09-20"], { avg: 68, status: "Low", low: 75, high: 87, baseline: 81 });
});

test("resting heart rate, stress, recovery hours", () => {
    assert.deepEqual(parseRestingHr(RHR), { "2026-09-26": 49, "2026-09-25": 47, "2026-09-20": 53 });
    assert.deepEqual(parseStress(STRESS), { "2026-09-26": { avg: 38, level: "Low" }, "2026-09-25": { avg: 25, level: "Relaxed" } });
    assert.deepEqual(readRecovery(RECOVERY), { percent: 76, status: "Moderate training recommended", hours: 34 });
});

test("one record per day, merged and trimmed", () => {
    const d = healthDays({ sleep: SLEEP, hrv: HRV, rhr: RHR, stress: STRESS });
    assert.deepEqual(Object.keys(d["2026-09-26"]).sort(), ["hrv", "rhr", "sleep", "stress"]);
    assert.equal(d["2026-09-20"].rhr, 53);
    const saved = mergeHealth({ "2025-01-01": { rhr: 60 }, "2026-09-26": { rhr: 50, note: "kept" } }, d, "2026-09-27");
    assert.equal(saved["2026-09-26"].rhr, 49);
    assert.equal(saved["2026-09-26"].note, "kept");
    assert.equal(saved["2025-01-01"], undefined);
    assert.deepEqual(healthDays({}), {});
});
