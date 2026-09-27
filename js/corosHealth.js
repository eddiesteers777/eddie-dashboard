/* ==========================================
   Southbound — COROS sleep, HRV, resting heart rate and stress (pure)

   Reads COROS's daily health replies into one record per day, kept in
   "coros-health-history" (cloud-synced, ~120 bytes a day). The formats
   are COROS's real text replies (Eddie's account, 2026-09-27), e.g.:
     querySleepOverview   2026-09-26 / Sleep Score: 88 / Main Sleep (asleep): 6h 57min
                          / Deep Sleep Ratio: 24% / Main Sleep Window: 2026-09-25 21:47 - 2026-09-26 04:48
     querySleepHrv        2026-09-26: / HRV Avg: 81 ms — Normal / Normal Range: 74 - 88 ms / Baseline: 81 ms
     queryRestingHeartRate  2026-09-26: 49 bpm
     queryStressLevel     2026-09-26: / Average Stress: 38 (Low)
   Every date is the WAKE-UP day: the night that ended on the morning of
   D is filed under D, so "last night" is today's date.
   Unit-tested in tests/corosHealth.test.mjs.
========================================== */

import { replyText } from "./corosMetrics.js";
import { unwrapResult } from "./corosParse.js";

// A tool result (or the text already taken out of one) -> its text.
const textOf = reply => replyText(unwrapResult(reply) ?? reply);

export const HEALTH_KEY = "coros-health-history";
const KEEP_DAYS = 400;
const DATE_LINE = /^\s*(\d{4})-?(\d{2})-?(\d{2}):?\s*$/;

// "6h 57min" / "8h" / "46min" -> minutes.
export function minutes(text) {
    const m = String(text || "").match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?/i);
    if (!m || (!m[1] && !m[2])) return null;
    return (Number(m[1]) || 0) * 60 + (Number(m[2]) || 0);
}

// A reply -> [{ date, lines: ["Key: value", ...] }] split at lines that are just a date.
function dayBlocks(text) {
    const out = [];
    let cur = null;
    for (const line of String(text || "").split(/\r?\n/)) {
        const d = line.match(DATE_LINE);
        if (d) { cur = { date: `${d[1]}-${d[2]}-${d[3]}`, lines: [] }; out.push(cur); continue; }
        if (cur && line.trim()) cur.lines.push(line.trim());
    }
    return out;
}
const field = (lines, re) => { for (const l of lines) { const m = l.match(re); if (m) return m; } return null; };
const num = m => (m ? Number(m[1]) : null);

/** querySleepOverview -> { date: { score, asleepMin, inBedMin, deepPct, lightPct, remPct, awakeMin, bed, wake } } */
export function parseSleep(reply) {
    const days = {};
    for (const b of dayBlocks(textOf(reply))) {
        const window = field(b.lines, /^Main Sleep Window:\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/i);
        const s = {
            score: num(field(b.lines, /^Sleep Score:\s*(\d+)/i)),
            asleepMin: minutes(field(b.lines, /^Main Sleep \(asleep\):\s*(.+)$/i)?.[1]) ?? minutes(field(b.lines, /^Daily Sleep:\s*(.+)$/i)?.[1]),
            inBedMin: minutes(field(b.lines, /^Main Sleep Period[^:]*:\s*(.+)$/i)?.[1]),
            deepPct: num(field(b.lines, /^Deep Sleep Ratio:\s*(\d+)/i)),
            lightPct: num(field(b.lines, /^Light Sleep Ratio:\s*(\d+)/i)),
            remPct: num(field(b.lines, /^REM Ratio:\s*(\d+)/i)),
            awakeMin: minutes(field(b.lines, /^Awake Time:\s*(.+)$/i)?.[1]),
            bed: window ? window[2] : null,
            wake: window ? window[4] : null
        };
        for (const k of Object.keys(s)) if (s[k] == null) delete s[k];
        if (Object.keys(s).length) days[b.date] = s;
    }
    return days;
}

/** querySleepHrv -> { date: { avg, low, high, baseline, status } } (COROS's own assessment, not the raw points). */
export function parseHrv(reply) {
    const text = textOf(reply).split(/Sleep HRV Time Series/i)[0];
    const days = {};
    for (const b of dayBlocks(text)) {
        const avg = field(b.lines, /^HRV Avg:\s*(\d+)\s*ms\s*(?:[—–-]\s*(.+))?$/i);
        if (!avg) continue;
        const range = field(b.lines, /^Normal Range:\s*(\d+)\s*-\s*(\d+)/i);
        days[b.date] = {
            avg: Number(avg[1]),
            status: (avg[2] || "").trim(),
            low: range ? Number(range[1]) : null,
            high: range ? Number(range[2]) : null,
            baseline: num(field(b.lines, /^Baseline:\s*(\d+)/i))
        };
    }
    return days;
}

/** queryRestingHeartRate -> { date: bpm } ("2026-09-26: 49 bpm", one per line). */
export function parseRestingHr(reply) {
    const days = {};
    const re = /(\d{4})-?(\d{2})-?(\d{2}):\s*(\d{2,3})\s*bpm/gi;
    let m;
    while ((m = re.exec(textOf(reply)))) days[`${m[1]}-${m[2]}-${m[3]}`] = Number(m[4]);
    return days;
}

/** queryStressLevel -> { date: { avg, level } }. */
export function parseStress(reply) {
    const days = {};
    for (const b of dayBlocks(textOf(reply))) {
        const m = field(b.lines, /^Average Stress:\s*(\d+)\s*(?:\(([^)]+)\))?/i);
        if (m) days[b.date] = { avg: Number(m[1]), level: m[2] || "" };
    }
    return days;
}

/** The four replies -> { date: { sleep, hrv, rhr, stress } } */
export function healthDays({ sleep, hrv, rhr, stress } = {}) {
    const out = {};
    const put = (date, key, value) => { out[date] = { ...out[date], [key]: value }; };
    for (const [d, v] of Object.entries(parseSleep(sleep))) put(d, "sleep", v);
    for (const [d, v] of Object.entries(parseHrv(hrv))) put(d, "hrv", v);
    for (const [d, v] of Object.entries(parseRestingHr(rhr))) put(d, "rhr", v);
    for (const [d, v] of Object.entries(parseStress(stress))) put(d, "stress", v);
    return out;
}

const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);

/** Merge new days into the saved history (newer values win); keeps ~400 days. */
export function mergeHealth(saved, days, today) {
    const out = { ...(saved || {}) };
    for (const [date, entry] of Object.entries(days || {})) out[date] = { ...out[date], ...entry };
    if (today) for (const date of Object.keys(out)) if (dayDiff(today, date) > KEEP_DAYS) delete out[date];
    return out;
}
