/* ==========================================
   Southbound — Strava history (pure)

   What an imported Strava archive becomes (js/stravaArchive.js reads it):
   compact activities in "strava-history" { version, updatedAt, acts: { key: a } }
     a = { k, a (Strava activity id), src "fit"|"csv", d local date, t start (Unix s),
           y type (run / ride / walk / strength…), m meters, s moving s, e elapsed s,
           h avg HR, x max HR, g climb m, n name, b [mile, 5K, 10K, half, full] fastest s }
   COROS stays the source for the runs it has; a Strava run that matches
   one (same start, or same day + distance + time) is left out, so runs
   uploaded to both never count twice. Unit-tested in tests/stravaHistory.test.mjs.
========================================== */

import { mondayOf } from "./trends.js";

export const STRAVA_KEY = "strava-history";
export const emptyStrava = () => ({ version: 1, updatedAt: 0, acts: {} });
const MILE = 1609.344;
const round1 = n => Math.round(n * 10) / 10;

/**
 * Adds newly read activities. A file-read activity keeps its exact times
 * when only its csv row comes in later (the row still adds the name).
 * -> { store, added, updated }
 */
export function mergeActivities(store, incoming, now = Date.now()) {
    const acts = { ...(store?.acts || {}) };
    let added = 0, updated = 0;
    for (const a of incoming) {
        const old = acts[a.k];
        if (!old) { acts[a.k] = a; added++; continue; }
        const next = old.src === "fit" && a.src === "csv"
            ? { ...old, n: a.n || old.n, ...(a.a ? { a: a.a } : {}) }
            : { ...a, n: a.n || old.n, ...(old.a && !a.a ? { a: old.a } : {}) };
        if (JSON.stringify(next) !== JSON.stringify(old)) { acts[a.k] = next; updated++; }
    }
    return { store: { version: 1, updatedAt: now, acts }, added, updated };
}

/** A stored run -> the run shape the Analytics trends read. */
export const toRun = a => ({
    key: a.k, source: "strava", date: a.d, startTime: a.t ? new Date(a.t * 1000).toISOString() : null,
    name: a.n || "Run", distance: a.m, duration: a.s ?? a.e, avgHr: a.h
});

/** Is this Strava run the same run as this COROS one? */
export function sameRun(coros, strava) {
    const cd = Number(coros.distance) || 0, sd = Number(strava.m) || 0;
    const close = (tol, floor) => Math.abs(cd - sd) <= Math.max(tol * Math.max(cd, sd), floor);
    const cs = Date.parse(coros.startTime) / 1000;
    if (Number.isFinite(cs) && strava.t && Math.abs(cs - strava.t) <= 15 * 60) return close(0.05, 200);
    const cDur = Number(coros.duration) || 0;
    const timeOk = [strava.s, strava.e].some(v => v && cDur && Math.abs(v - cDur) <= 0.1 * cDur);
    return coros.date === strava.d && close(0.03, 150) && timeOk;
}

const dayShift = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };

/**
 * COROS runs + the Strava runs COROS doesn't have.
 * -> { runs (COROS first, then Strava-only, by date), overlap: Strava runs already in COROS }
 */
export function combineRuns(corosRuns, acts) {
    const byDate = new Map();
    for (const r of corosRuns || []) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
    const extra = [];
    let overlap = 0;
    for (const a of Object.values(acts || {})) {
        if (a.y !== "run" || !a.m) continue;
        const near = [-1, 0, 1].flatMap(n => byDate.get(dayShift(a.d, n)) || []);
        if (near.some(c => sameRun(c, a))) { overlap++; continue; }
        extra.push(toRun(a));
    }
    return { runs: [...(corosRuns || []), ...extra].sort((x, y) => x.date.localeCompare(y.date)), overlap };
}

/**
 * All-time numbers from every run (COROS + Strava):
 * { total: { runs, miles, since }, years: [{ year, miles, runs }], ytd: { miles, lastYear },
 *   longest: { date, miles, name }, biggestWeek: { start, miles }, biggestMonth: { month, miles } }
 */
export function yearStats(runs, today) {
    const list = (runs || []).filter(r => r.date && Number(r.distance) > 0);
    if (!list.length) return null;
    const mi = r => Number(r.distance) / MILE;
    const sum = rs => rs.reduce((t, r) => t + mi(r), 0);
    const years = new Map(), weeks = new Map(), months = new Map();
    for (const r of list) {
        const y = Number(r.date.slice(0, 4));
        if (!years.has(y)) years.set(y, []);
        years.get(y).push(r);
        const w = mondayOf(r.date); weeks.set(w, (weeks.get(w) || 0) + mi(r));
        const m = r.date.slice(0, 7); months.set(m, (months.get(m) || 0) + mi(r));
    }
    const first = list.reduce((a, r) => (r.date < a ? r.date : a), list[0].date);
    const thisYear = Number(today.slice(0, 4));
    const yearRows = [];
    for (let y = Number(first.slice(0, 4)); y <= thisYear; y++) {
        const rs = years.get(y) || [];
        yearRows.push({ year: y, miles: round1(sum(rs)), runs: rs.length });
    }
    const md = today.slice(5);
    const top = map => [...map.entries()].reduce((a, e) => (e[1] > a[1] ? e : a), ["", 0]);
    const longest = list.reduce((a, r) => (mi(r) > mi(a) ? r : a), list[0]);
    const [wk, wkMi] = top(weeks), [mo, moMi] = top(months);
    return {
        total: { runs: list.length, miles: Math.round(sum(list)), since: first },
        years: yearRows,
        ytd: {
            miles: round1(sum(years.get(thisYear) || [])),
            lastYear: round1(sum((years.get(thisYear - 1) || []).filter(r => r.date.slice(5) <= md)))
        },
        longest: { date: longest.date, miles: round1(mi(longest)), name: longest.name || "" },
        biggestWeek: { start: wk, miles: round1(wkMi) },
        biggestMonth: { month: mo, miles: round1(moMi) }
    };
}

export const EFFORT_LABELS = [["mile", "Mile", 1], ["k5", "5K", 5000 / MILE], ["k10", "10K", 10000 / MILE], ["half", "Half marathon", 13.1094], ["full", "Marathon", 26.2188]];
const FLOOR = 210;   // s per mile (3:30): anything faster is a bad reading

/** The fastest mile / 5K / 10K / half / marathon found inside any run's watch file. */
export function fastestEfforts(acts) {
    const out = {};
    EFFORT_LABELS.forEach(([key, , miles], i) => {
        let best = null;
        for (const a of Object.values(acts || {})) {
            const s = a.y === "run" ? a.b?.[i] : null;
            if (!s || s < FLOOR * miles) continue;
            if (!best || s < best.sec) best = { sec: s, date: a.d, name: a.n || "" };
        }
        out[key] = best;
    });
    return out;
}

/** How many of each non-run activity were imported: { ride: 12, walk: 3, … }. */
export function otherCounts(acts) {
    const out = {};
    for (const a of Object.values(acts || {})) if (a.y !== "run") out[a.y] = (out[a.y] || 0) + 1;
    return out;
}

/** { count, runs, from, to } of what's stored. */
export function stravaSummary(store) {
    const list = Object.values(store?.acts || {});
    if (!list.length) return { count: 0, runs: 0, from: null, to: null };
    const dates = list.map(a => a.d).sort();
    return { count: list.length, runs: list.filter(a => a.y === "run").length, from: dates[0], to: dates.at(-1) };
}
