/* ==========================================
   Southbound — load state (pure)

   Athlete model, layer 4 (docs/PERFORMANCE_ENGINE_PLAN.md 3.4), from the
   daily doses of js/sessionDose.js:
     training base  exponentially weighted daily load, τ = 42 days
     recent load    the same, τ = 7 days
     load balance   base − recent (negative = recent load above the base)
     per domain     easy / threshold / hard bases (τ 42)
     recent vs your normal   where today's recent load sits among your
                    own last 12 months (a percentile), and how the base
                    moved this week. Observational words only: no ratio
                    "safe zone" (the ACWR evidence doesn't support one).
     long runs      count and longest in the last 8 weeks
     weeks          per Monday–Sunday week: total, by domain, miles, and
                    Foster's monotony (mean ÷ SD of the 7 days) and strain
                    (total × monotony), for the weekly review
   L_t = L_{t−1} + (dose_t − L_{t−1}) × (1 − e^(−1/τ)), started at the
   average daily dose of the first 6 weeks so year one doesn't begin at 0.
   Unit-tested in tests/loadState.test.mjs.
========================================== */

import { addDays } from "./athleteLedger.js";
import { DOSE_VERSION } from "./sessionDose.js";

export const LOAD_VERSION = "0.1.0";
export const TAU = Object.freeze({ base: 42, recent: 7 });
const DAY_MS = 864e5;

const k = tau => 1 - Math.exp(-1 / tau);
const r1 = n => Math.round(n * 10) / 10;
const toDays = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / DAY_MS);
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };

/** Doses -> one row per day from the first dose to `today`: { date, dose, easy, threshold, hard, miles, long }. */
export function dailyDoses(doses, today) {
    const usable = doses.filter(d => d.dose != null && d.date <= today);
    if (!usable.length) return [];
    const first = usable.reduce((m, d) => (d.date < m ? d.date : m), usable[0].date);
    const n = toDays(first, today) + 1;
    const rows = Array.from({ length: n }, (_, i) => ({ date: addDays(first, i), dose: 0, easy: 0, threshold: 0, hard: 0, miles: 0, longest: 0 }));
    for (const d of usable) {
        const r = rows[toDays(first, d.date)];
        r.dose += d.dose;
        r.easy += d.domains.easy; r.threshold += d.domains.threshold; r.hard += d.domains.hard;
        r.miles += d.miles;
        if (d.long) r.longest = Math.max(r.longest, d.miles);
    }
    return rows;
}

/**
 * The load state through `today`.
 * -> { version, series: [{ date, dose, base, recent, balance, easy, threshold, hard }], today: { … }, weeks, longRuns }
 */
export function loadState(doses, today, { seedDays = 42 } = {}) {
    const days = dailyDoses(doses, today);
    if (!days.length) return { version: LOAD_VERSION, doseVersion: DOSE_VERSION, series: [], today: null, weeks: [], longRuns: { count: 0, longest: 0 } };
    const seedRows = days.slice(0, seedDays);
    const seed = key => seedRows.reduce((t, r) => t + r[key], 0) / seedRows.length;
    let base = seed("dose"), recent = seed("dose");
    const dom = { easy: seed("easy"), threshold: seed("threshold"), hard: seed("hard") };
    const kb = k(TAU.base), kr = k(TAU.recent);
    const series = days.map(r => {
        base += (r.dose - base) * kb;
        recent += (r.dose - recent) * kr;
        for (const key of ["easy", "threshold", "hard"]) dom[key] += (r[key] - dom[key]) * kb;
        return { date: r.date, dose: r.dose, miles: r.miles, base, recent, balance: base - recent, easy: dom.easy, threshold: dom.threshold, hard: dom.hard };
    });

    const now = series.at(-1);
    const yearAgo = addDays(today, -365);
    const year = series.filter(s => s.date > yearAgo);
    const below = year.filter(s => s.recent < now.recent).length;
    const percentile = year.length >= 28 ? Math.round(below / year.length * 100) : null;
    const weekAgo = series.find(s => s.date === addDays(today, -7));
    const from8 = addDays(today, -55);
    const longs = days.filter(r => r.date >= from8 && r.longest > 0);

    return {
        version: LOAD_VERSION, doseVersion: DOSE_VERSION,
        series,
        today: {
            date: now.date,
            base: r1(now.base), recent: r1(now.recent), balance: r1(now.balance),
            domains: { easy: r1(now.easy), threshold: r1(now.threshold), hard: r1(now.hard) },
            percentile, yearDays: year.length,
            baseChange: weekAgo ? r1(now.base - weekAgo.base) : null,
            yearHigh: r1(Math.max(...year.map(s => s.recent))),
            yearLow: r1(Math.min(...year.map(s => s.recent)))
        },
        weeks: weeklyTotals(days, today),
        longRuns: { count: longs.length, longest: r1(Math.max(0, ...longs.map(r => r.longest))) }
    };
}

/** Monday–Sunday weeks with totals, domains, miles, monotony and strain (Foster). */
export function weeklyTotals(days, today, { weeks = 16 } = {}) {
    const lastMonday = mondayOf(today);
    const byDate = new Map(days.map(r => [r.date, r]));
    return Array.from({ length: weeks }, (_, i) => {
        const start = addDays(lastMonday, -7 * (weeks - 1 - i));
        const week = Array.from({ length: 7 }, (_, j) => byDate.get(addDays(start, j)) || { dose: 0, easy: 0, threshold: 0, hard: 0, miles: 0 });
        const elapsed = start === lastMonday ? toDays(start, today) + 1 : 7;
        const loads = week.map(r => r.dose);
        const total = loads.reduce((a, b) => a + b, 0);
        const mean = total / 7;
        const sd = Math.sqrt(loads.reduce((t, x) => t + (x - mean) ** 2, 0) / 7);
        const monotony = elapsed === 7 && sd > 0 ? Math.round(mean / sd * 100) / 100 : null;
        return {
            start, current: start === lastMonday, daysIn: elapsed,
            total: r1(total),
            easy: r1(week.reduce((t, r) => t + r.easy, 0)),
            threshold: r1(week.reduce((t, r) => t + r.threshold, 0)),
            hard: r1(week.reduce((t, r) => t + r.hard, 0)),
            miles: r1(week.reduce((t, r) => t + r.miles, 0)),
            monotony, strain: monotony == null ? null : Math.round(total * monotony)
        };
    });
}

/**
 * Plain words for where recent load sits against the athlete's own year
 * (observational, never "safe" / "risky").
 */
export function recentWords(percentile) {
    if (percentile == null) return null;
    if (percentile >= 95) return "in your top 5% of the last year";
    if (percentile >= 80) return `higher than ${percentile}% of your last year`;
    if (percentile >= 60) return "a bit above your usual for the last year";
    if (percentile >= 40) return "about your usual for the last year";
    if (percentile >= 20) return "on the low side for your last year";
    return "in your lowest 20% of the last year";
}
