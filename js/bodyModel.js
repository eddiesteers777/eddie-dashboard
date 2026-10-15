/* ==========================================
   Today's health stats (premium shell): what the watch says about sleep, HRV and
   resting heart rate, and when the card shows at all. Pure: no DOM, no storage,
   so it is unit tested (tests/bodyModel.test.mjs). js/readinessCard.js draws it
   with js/bodyView.js.

   health: { "YYYY-MM-DD": { hrv: { avg, baseline, low, high }, rhr, sleep: { asleepMin } } }
   (js/corosHealth.js, by wake-up day). Nothing here is invented: a measure the
   watch did not report is null, and a line needs at least 3 days of data.
========================================== */

import { hm, DEFAULT_SLEEP_NEED } from "./readiness.js";

const addDays = (date, n) => {
    const [y, m, d] = date.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const num = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);
const mean = list => list.reduce((s, v) => s + v, 0) / list.length;

// Does the card show? Only with a watch behind it (connected, or its data already on this device),
// and only when the person has not turned it off in Settings (on until they do).
export function showHealthStats({ settings = {}, connected = false, hasData = false } = {}) {
    return settings.showOnToday !== false && Boolean(connected || hasData);
}

// The last 7 days of one measure, [{ day: 0..6 (6 = the morning shown), v }]; null with fewer than 3 days.
function trendOf(health, date, pick) {
    const points = [];
    for (let i = 0; i < 7; i++) {
        const v = num(pick(health[addDays(date, i - 6)] || {}));
        if (v != null) points.push({ day: i, v });
    }
    return points.length >= 3 ? points : null;
}

export function bodyMeasures(health = {}, date, { needMin = DEFAULT_SLEEP_NEED } = {}) {
    const day = health[date] || {};

    const sleepMin = num(day.sleep?.asleepMin);
    const short = sleepMin == null ? 0 : needMin - sleepMin;
    const sleep = sleepMin == null ? null : {
        min: Math.round(sleepMin),
        value: hm(sleepMin),
        note: short > 20 ? `${hm(short)} short of ${hm(needMin)}` : `about the ${hm(needMin)} you need`,
        trend: trendOf(health, date, d => d.sleep?.asleepMin)
    };

    const ms = num(day.hrv?.avg);
    const baseline = num(day.hrv?.baseline);
    const lo = num(day.hrv?.low) ?? (baseline ? baseline * 0.9 : null);
    const hi = num(day.hrv?.high) ?? (baseline ? baseline * 1.1 : null);
    const hrv = ms == null ? null : {
        ms: Math.round(ms),
        value: `${Math.round(ms)}`,
        band: lo != null && hi != null ? [Math.round(lo), Math.round(hi)] : null,
        note: lo == null || hi == null ? "from your watch" : ms > hi ? "above your normal" : ms < lo ? "below your normal" : "normal for you",
        trend: trendOf(health, date, d => d.hrv?.avg)
    };

    const bpm = num(day.rhr);
    const before = Array.from({ length: 30 }, (_, i) => num(health[addDays(date, -(i + 1))]?.rhr)).filter(v => v != null);
    const usual = before.length >= 3 ? mean(before) : null;
    const diff = usual == null || bpm == null ? 0 : Math.round(bpm - usual);
    const rhr = bpm == null ? null : {
        bpm: Math.round(bpm),
        value: `${Math.round(bpm)}`,
        note: usual == null ? "building your average" : diff === 0 ? `your usual is ${Math.round(usual)}` : `${Math.abs(diff)} ${diff > 0 ? "above" : "below"} your usual`,
        trend: trendOf(health, date, d => d.rhr)
    };

    return { sleep, hrv, rhr };
}
