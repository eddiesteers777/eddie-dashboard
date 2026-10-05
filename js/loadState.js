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
     loadTotals     this week's days, 16 weeks and 12 months: runs, miles,
                    the external load (js/sessionDose.js 0.3.0), effort load (minutes × effort), how
                    many runs are rated, monotony / strain, your usual week,
                    and the week so far against the same day of your last
                    8 weeks (weekToDate, audit A5: comparing a Tuesday with
                    a whole week read every normal week as "behind")
     corosComparison  our base / recent next to COROS's Base Fitness /
                    Load Impact, and how closely they move together
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

// ---------- totals by day, week and month (Weekly Review, Analytics) ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One period's runs -> its totals. effortLoad = Σ minutes × effort 1–10 (session RPE, Foster) over the rated runs. */
function sumPeriod(list) {
    const rated = list.filter(d => d.rpe != null && d.minutes);
    return {
        runs: list.length,
        miles: r1(list.reduce((t, d) => t + (d.miles || 0), 0)),
        minutes: Math.round(list.reduce((t, d) => t + (d.minutes || 0), 0)),
        load: r1(list.reduce((t, d) => t + (d.dose || 0), 0)),
        effortLoad: Math.round(rated.reduce((t, d) => t + d.minutes * d.rpe, 0)),
        rated: rated.length,
        unrated: list.filter(d => d.rpe == null && d.minutes && d.source !== "miles").length,
        domains: {
            easy: r1(list.reduce((t, d) => t + (d.domains?.easy || 0), 0)),
            threshold: r1(list.reduce((t, d) => t + (d.domains?.threshold || 0), 0)),
            hard: r1(list.reduce((t, d) => t + (d.domains?.hard || 0), 0))
        }
    };
}

/**
 * Totals for the days of this week, the last `weeks` Monday–Sunday weeks
 * and the last `months` calendar months, from the doses (one external load
 * per run). -> { days, weeks, months, thisWeek, usualWeek, strainUsual, toDate }
 *   usualWeek    the median of the 4 full weeks before this one
 *   strainUsual  the median strain of the full weeks shown
 *   toDate       the week so far against the same weekday of the last 8 (weekToDate)
 */
export function loadTotals(doses, today, { weeks = 16, months = 12 } = {}) {
    const usable = doses.filter(d => d.dose != null && d.date <= today);
    const monday = mondayOf(today);
    const between = (a, b) => usable.filter(d => d.date >= a && d.date <= b);
    const days = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const list = between(date, date);
        return { date, future: date > today, ...sumPeriod(list), list };
    });
    const daily = dailyDoses(usable, today);
    const strainByWeek = new Map(weeklyTotals(daily, today, { weeks }).map(w => [w.start, w]));
    const weekRows = Array.from({ length: weeks }, (_, i) => {
        const start = addDays(monday, -7 * (weeks - 1 - i));
        const w = strainByWeek.get(start);
        return { start, end: addDays(start, 6), current: start === monday, ...sumPeriod(between(start, addDays(start, 6))), monotony: w?.monotony ?? null, strain: w?.strain ?? null };
    });
    const [ty, tm] = today.split("-").map(Number);
    const monthRows = Array.from({ length: months }, (_, i) => {
        const back = months - 1 - i;
        const idx = ty * 12 + (tm - 1) - back;
        const y = Math.floor(idx / 12), m = idx % 12;
        const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
        const end = `${y}-${String(m + 1).padStart(2, "0")}-31`;
        return { start, label: `${MONTHS[m]} ${y}`, current: back === 0, ...sumPeriod(between(start, end)) };
    });
    const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const before = weekRows.filter(w => !w.current).slice(-4).filter(w => w.runs);
    const strains = weekRows.filter(w => !w.current && w.strain != null && w.runs).map(w => w.strain);
    return {
        days, weeks: weekRows, months: monthRows,
        thisWeek: weekRows.at(-1),
        usualWeek: before.length >= 2 ? { load: r1(median(before.map(w => w.load))), miles: r1(median(before.map(w => w.miles))), effortLoad: Math.round(median(before.map(w => w.effortLoad))), n: before.length } : null,
        strainUsual: strains.length >= 4 ? Math.round(median(strains)) : null,
        toDate: weekToDate(doses, today)
    };
}

// ---------- this week so far, against the same point in your usual weeks ----------

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const medianOf = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

/**
 * docs/ATHLETE_MODEL_AUDIT.md 7.9 (A5). The week so far, through the last
 * day that's done (today once there's a run today, else yesterday), against
 * the median of the previous `weeks` full weeks cumulated through the same
 * weekday. "Ahead" / "behind" only when the log ratio is past the 80th
 * percentile of how far those weeks themselves sat from that median (at
 * least 10%), so an ordinary week reads "about usual".
 * -> null (no day done yet this week, or fewer than 4 of those weeks with runs) or
 *    { through, dayIndex, dayName, n, load: { now, usual, ratio, band, status, usualWeek }, miles: {...} }
 *    status: "usual" | "ahead" | "behind"
 */
export function weekToDate(doses, today, { weeks = 8 } = {}) {
    const usable = doses.filter(d => d.dose != null && d.date <= today);
    const monday = mondayOf(today);
    const ranToday = usable.some(d => d.date === today);
    const through = ranToday ? today : addDays(today, -1);
    if (through < monday) return null;
    const dayIndex = toDays(monday, through);
    const sum = (from, to, key) => usable.filter(d => d.date >= from && d.date <= to).reduce((t, d) => t + (Number(d[key]) || 0), 0);
    const past = Array.from({ length: weeks }, (_, i) => addDays(monday, -7 * (i + 1)));
    const withRuns = past.filter(m => usable.some(d => d.date >= m && d.date <= addDays(m, 6)));
    if (withRuns.length < 4) return null;
    const one = key => {
        const now = sum(monday, through, key);
        const cums = past.map(m => sum(m, addDays(m, dayIndex), key));
        const usual = medianOf(cums);
        const usualWeek = medianOf(past.map(m => sum(m, addDays(m, 6), key)));
        if (!(usual > 0)) return { now: r1(now), usual: r1(usual || 0), ratio: null, band: null, status: null, usualWeek: r1(usualWeek || 0) };
        const devs = cums.filter(c => c > 0).map(c => Math.abs(Math.log(c / usual))).sort((a, b) => a - b);
        const band = Math.max(0.1, devs.length ? devs[Math.min(devs.length - 1, Math.ceil(0.8 * devs.length) - 1)] : 0.1);
        const lr = now > 0 ? Math.log(now / usual) : -Infinity;
        return { now: r1(now), usual: r1(usual), ratio: Math.round(now / usual * 100) / 100, band: Math.round(band * 100) / 100, status: lr > band ? "ahead" : lr < -band ? "behind" : "usual", usualWeek: r1(usualWeek) };
    };
    return { through, dayIndex, dayName: DAY_NAMES[dayIndex], n: weeks, load: one("dose"), miles: one("miles") };
}

// ---------- COROS's own numbers next to ours ----------

function pearson(xs, ys) {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/**
 * Our training base / recent load against COROS's Base Fitness (long-term
 * load) and Load Impact (short-term load), on the days COROS gave numbers.
 * The scales differ, so it's how they move together that's compared.
 * -> { n, latest: { date, ours: { base, recent }, coros: { base, impact, ratio } }, rBase, rRecent } or null
 */
export function corosComparison(series = [], fitness = {}, { days = 365 } = {}) {
    const byDate = new Map(series.map(s => [s.date, s]));
    const last = series.at(-1)?.date;
    if (!last) return null;
    const from = addDays(last, -days);
    const pts = Object.entries(fitness || {})
        .filter(([d, f]) => d >= from && d <= last && byDate.has(d) && (Number(f?.load?.long) > 0 || Number(f?.load?.short) > 0))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, f]) => ({ date: d, ours: byDate.get(d), coros: { base: Number(f.load.long) || null, impact: Number(f.load.short) || null, ratio: Number(f.load.ratio) || null } }));
    if (!pts.length) return null;
    const pair = (ourKey, theirKey) => {
        const p = pts.filter(x => x.coros[theirKey] != null);
        return p.length >= 10 ? Math.round(pearson(p.map(x => x.ours[ourKey]), p.map(x => x.coros[theirKey])) * 100) / 100 : null;
    };
    const latest = pts.at(-1);
    return {
        n: pts.length,
        latest: { date: latest.date, ours: { base: r1(latest.ours.base), recent: r1(latest.ours.recent) }, coros: latest.coros },
        rBase: pair("base", "base"),
        rRecent: pair("recent", "impact")
    };
}
