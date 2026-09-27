/* ==========================================
   Southbound — the saved COROS run history (pure)

   COROS answers run queries a week at a time (7-day windows), so a
   year of runs is ~52 calls. Instead of asking for the last 4 weeks
   on every refresh, runs are kept in "coros-run-history" (cloud-synced,
   compact) and only what's missing is fetched:
     - the recent end: from a few days before the newest covered day to
       today (late watch syncs show up), every refresh
     - the old end: a week at a time back to a year ago, in the
       background, resumable (coverage is saved after each week)
   Fitness numbers (training load, recovery, VO2 max, marathon
   prediction) are kept by day in "coros-fitness-history" so they
   become trend lines.
   Unit-tested in tests/corosHistory.test.mjs.
========================================== */

import { normalizeActivity } from "./corosParse.js";
import { readLoad, readRecovery, readFitness, replyText } from "./corosMetrics.js";

export const HISTORY_KEY = "coros-run-history";
export const FITNESS_KEY = "coros-fitness-history";
export const HISTORY_DAYS = 365;
const KEEP_DAYS = 400;

// ---------- dates (local yyyy-mm-dd) ----------
const pad = n => String(n).padStart(2, "0");
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(date, n) {
    const [y, m, d] = date.split("-").map(Number);
    return isoDate(new Date(y, m - 1, d + n));
}
const dayDiff = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);

export function emptyHistory() {
    return { version: 1, runs: {}, coveredFrom: null, coveredTo: null, updatedAt: 0 };
}

// A normalized COROS activity -> what's kept (small: ~200 bytes a run).
export function compactRun(a) {
    const n = normalizeActivity(a) || {};
    const out = {
        labelId: n.labelId, sportType: n.sportType, sport: n.sport, name: n.name,
        startTime: n.startTime, date: n.date,
        distance: n.distance, duration: n.duration,
        pace_seconds_per_mile: n.pace_seconds_per_mile, avgHr: n.avgHr, calories: n.calories
    };
    for (const k of Object.keys(out)) if (out[k] == null || out[k] === "" || Number.isNaN(out[k])) delete out[k];
    return out;
}

const runKey = r => r.labelId || `${r.date}|${Math.round(Number(r.distance) || 0)}`;

/** history + fetched runs -> { history (new object), added }. Old runs beyond ~400 days drop off. */
export function mergeRuns(history, runs, today) {
    const next = { ...(history || emptyHistory()), runs: { ...(history?.runs || {}) } };
    let added = 0;
    for (const raw of runs || []) {
        const r = compactRun(raw);
        if (!r.date) continue;
        const key = runKey(r);
        if (!next.runs[key]) added++;
        next.runs[key] = { ...next.runs[key], ...r };
    }
    if (today) for (const [k, r] of Object.entries(next.runs)) if (dayDiff(today, r.date) > KEEP_DAYS) delete next.runs[k];
    return { history: next, added };
}

/** Record that [start, end] was fetched (coverage stays one continuous range). */
export function markCovered(history, start, end) {
    const h = { ...history };
    h.coveredFrom = !h.coveredFrom || start < h.coveredFrom ? start : h.coveredFrom;
    h.coveredTo = !h.coveredTo || end > h.coveredTo ? end : h.coveredTo;
    h.updatedAt = Date.now();
    return h;
}

// [from, to] -> 7-day windows, newest first.
function windows(from, to) {
    const out = [];
    for (let end = to; end >= from; end = addDays(end, -7)) {
        const start = addDays(end, -6) < from ? from : addDays(end, -6);
        out.push({ start, end });
    }
    return out;
}

/**
 * What to fetch next -> { recent: [windows], backfill: [windows] }.
 * recent: from 3 days before the newest covered day (or a week ago) to today.
 * backfill: from the day before the oldest covered day back to a year ago.
 */
export function windowsToFetch(history, today, { days = HISTORY_DAYS, overlap = 3 } = {}) {
    const horizon = addDays(today, -(days - 1));
    const h = history || emptyHistory();
    if (!h.coveredTo || !h.coveredFrom || h.coveredTo < horizon) {
        const all = windows(horizon, today);
        return { recent: all.slice(0, 1), backfill: all.slice(1) };
    }
    const recentFrom = addDays(h.coveredTo, -overlap) < horizon ? horizon : addDays(h.coveredTo, -overlap);
    const recent = windows(recentFrom, today);
    const backfill = h.coveredFrom > horizon ? windows(horizon, addDays(h.coveredFrom, -1)) : [];
    return { recent, backfill };
}

/** Runs between two dates (inclusive), newest first, ready for every page (normalized). */
export function runsBetween(history, from, to) {
    return Object.values(history?.runs || {})
        .filter(r => r.date >= from && r.date <= to)
        .sort((a, b) => String(b.startTime || b.date).localeCompare(String(a.startTime || a.date)))
        .map(normalizeActivity);
}

/** "312 runs saved, back to Sep 28, 2025" / progress while filling in. */
export function historyStatus(history, today, { days = HISTORY_DAYS } = {}) {
    const count = Object.keys(history?.runs || {}).length;
    if (!history?.coveredFrom) return "";
    const horizon = addDays(today, -(days - 1));
    const since = new Date(`${history.coveredFrom}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const weeksLeft = history.coveredFrom > horizon ? Math.ceil(dayDiff(history.coveredFrom, horizon) / 7) : 0;
    return `${count} ${count === 1 ? "run" : "runs"} saved, back to ${since}${weeksLeft ? ` · loading older runs (${weeksLeft} ${weeksLeft === 1 ? "week" : "weeks"} to go)` : ""}`;
}

// ---------- fitness by day ----------

/** Today's fitness numbers from the three COROS replies (+ per-day training load when the reply lists days). */
export function fitnessDays(today, { trainingLoad, recovery, fitness }) {
    const days = {};
    // A training-load reply that lists days: each dated block is that day's load.
    const text = replyText(trainingLoad);
    const re = /\b(20\d{2})-?(\d{2})-?(\d{2})\b/g;
    const hits = [];
    let m;
    while ((m = re.exec(text))) hits.push({ at: m.index, date: `${m[1]}-${m[2]}-${m[3]}` });
    hits.forEach((h, i) => {
        const block = text.slice(h.at, hits[i + 1]?.at ?? text.length);
        const load = readLoad(block);
        if (load.short != null || load.ratio != null) days[h.date] = { ...days[h.date], load: { short: load.short, long: load.long, ratio: load.ratio } };
    });
    const load = readLoad(trainingLoad);
    const rec = readRecovery(recovery);
    const fit = readFitness(fitness);
    const t = { ...days[today] };
    if (load.short != null || load.ratio != null) t.load = { short: load.short, long: load.long, ratio: load.ratio };
    if (rec.percent != null || rec.status) t.recovery = { percent: rec.percent, status: rec.status || "", hours: rec.hours };
    if (fit.vo2 != null) t.vo2 = fit.vo2;
    if (fit.marathon) t.marathon = fit.marathon;
    if (fit.threshold) t.threshold = fit.threshold;
    if (Object.keys(t).length) days[today] = t;
    return days;
}

/** Merge a day map into the saved one; keeps ~400 days. */
export function mergeFitness(saved, days, today) {
    const out = { ...(saved || {}) };
    for (const [date, entry] of Object.entries(days || {})) out[date] = { ...out[date], ...entry };
    if (today) for (const date of Object.keys(out)) if (dayDiff(today, date) > KEEP_DAYS) delete out[date];
    return out;
}
