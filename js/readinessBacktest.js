/* ==========================================
   Southbound — the readiness check (pure)

   docs/PERFORMANCE_ENGINE_PLAN.md 4.4. The outcome is defined before
   looking: a "rough session" is a run that went worse than the
   athlete's own usual by more than 1 SD on any measure there is for it:
   effort above what that kind of run usually costs (effort vs expected),
   heart rate above the usual at that pace (easy runs), or heart rate on
   quality reps above the usual at that speed. Each measure only uses what
   came before the run (js/trainingResponse.js), so nothing leaks.
   For every day with a scored run, each method's morning number on that
   day and the day before is compared: does a low number come before a
   rough session? AUC (0.5 = no better than a coin, 1 = always lower
   before a rough one), a seeded bootstrap 95% range, and Classic vs New
   on the same days. Methods: Classic (v1), New (v2), COROS recovery,
   HRV alone, the check-in alone, and yesterday's load (the simple way).
   Unit-tested in tests/readinessV2.test.mjs.
========================================== */

import { computeReadiness } from "./readiness.js";
import { readinessV2, autonomic, feelDomain } from "./readinessV2.js";

export const READINESS_CHECK_VERSION = "0.1.0";
export const READINESS_METHODS = Object.freeze([
    { key: "v2", label: "New readiness (v2)" },
    { key: "v1", label: "Classic readiness" },
    { key: "coros", label: "COROS recovery %" },
    { key: "hrv", label: "HRV alone" },
    { key: "feel", label: "Morning check-in alone" },
    { key: "load", label: "Yesterday's load (the simple way)" }
]);

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1)) : 0; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

/**
 * Rough sessions by date, from the response measures.
 * -> Map(date -> boolean) for every date that has at least one measured run.
 */
export function roughDays({ effortRows = [], effRuns = [], quality = [] } = {}) {
    const days = new Map();
    const mark = (rows, key) => {
        const vals = rows.map(r => r[key]).filter(Number.isFinite);
        if (vals.length < 8) return;
        const cut = mean(vals) + sd(vals);
        for (const r of rows) if (Number.isFinite(r[key])) days.set(r.date, (days.get(r.date) || false) || r[key] > cut);
    };
    mark(effortRows, "residual");
    mark(effRuns, "residual");
    mark(quality, "residual");
    return days;
}

/** P(score before a rough day < score before an ordinary day); ties count half. */
export function auc(pairs) {
    const pos = pairs.filter(p => p.rough).map(p => p.score), neg = pairs.filter(p => !p.rough).map(p => p.score);
    if (!pos.length || !neg.length) return null;
    let wins = 0;
    for (const a of pos) for (const b of neg) wins += a < b ? 1 : a === b ? 0.5 : 0;
    return wins / (pos.length * neg.length);
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/**
 * data: { health, fitness, checkins, settings, response: { effRuns, effortRows }, loadSeries, quality, doses }
 * -> { version, n, rough, methods: [{ key, label, n, auc, lo, hi }], v2vsV1: { n, diff, lo, hi, verdict } | null, verdict }
 */
export function readinessCheck(data, today, { days = 365, draws = 1000, seed = 5, minEach = 5 } = {}) {
    const rough = roughDays({ effortRows: data.response?.effortRows, effRuns: data.response?.effRuns, quality: data.quality });
    const from = addDays(today, -days);
    const dates = [...rough.keys()].filter(d => d >= from && d <= today).sort();
    const dosesByDate = new Map();
    for (const d of data.doses || []) if (d.dose != null) dosesByDate.set(d.date, (dosesByDate.get(d.date) || 0) + d.dose);
    const cache = new Map();
    const morning = date => {
        if (cache.has(date)) return cache.get(date);
        const v1 = computeReadiness(date, data).score;
        const v2 = readinessV2(date, data).score;
        const a = autonomic(date, data.health || {});
        const f = feelDomain(date, data.checkins || {});
        const rec = data.fitness?.[date]?.recovery?.percent;
        const out = {
            v1, v2,
            coros: Number.isFinite(rec) ? rec : null,
            hrv: a?.hrv?.score ?? null,
            feel: f?.score ?? null,
            load: -(dosesByDate.get(addDays(date, -1)) || 0)
        };
        cache.set(date, out);
        return out;
    };
    // The number that morning, or the morning before when that day has none.
    const rows = dates.map(date => {
        const m = morning(date), y = morning(addDays(date, -1));
        const pick = k => (m[k] != null ? m[k] : y[k]);
        return { date, rough: rough.get(date), ...Object.fromEntries(READINESS_METHODS.map(x => [x.key, pick(x.key)])) };
    });
    const nRough = rows.filter(r => r.rough).length;
    const enough = list => list.filter(r => r.rough).length >= minEach && list.filter(r => !r.rough).length >= minEach;
    const rand = rng(seed);
    const boot = list => {
        const vals = [];
        for (let b = 0; b < draws; b++) {
            const s = Array.from({ length: list.length }, () => list[Math.floor(rand() * list.length)]);
            const a = auc(s);
            if (a != null) vals.push(a);
        }
        vals.sort((x, y) => x - y);
        return vals.length ? { lo: vals[Math.floor(0.025 * (vals.length - 1))], hi: vals[Math.floor(0.975 * (vals.length - 1))] } : { lo: null, hi: null };
    };
    const r2 = x => (x == null ? null : Math.round(x * 100) / 100);
    const methods = READINESS_METHODS.map(m => {
        const pairs = rows.filter(r => r[m.key] != null).map(r => ({ rough: r.rough, score: r[m.key] }));
        if (!enough(pairs)) return { key: m.key, label: m.label, n: pairs.length, auc: null };
        const ci = boot(pairs);
        return { key: m.key, label: m.label, n: pairs.length, auc: r2(auc(pairs)), lo: r2(ci.lo), hi: r2(ci.hi) };
    });
    // Classic vs New on the days both have a number, same resamples.
    const both = rows.filter(r => r.v1 != null && r.v2 != null);
    let v2vsV1 = null;
    if (enough(both)) {
        const diffs = [];
        for (let b = 0; b < draws; b++) {
            const s = Array.from({ length: both.length }, () => both[Math.floor(rand() * both.length)]);
            const a2 = auc(s.map(r => ({ rough: r.rough, score: r.v2 }))), a1 = auc(s.map(r => ({ rough: r.rough, score: r.v1 })));
            if (a2 != null && a1 != null) diffs.push(a2 - a1);
        }
        diffs.sort((x, y) => x - y);
        const lo = diffs[Math.floor(0.025 * (diffs.length - 1))], hi = diffs[Math.floor(0.975 * (diffs.length - 1))];
        const diff = auc(both.map(r => ({ rough: r.rough, score: r.v2 }))) - auc(both.map(r => ({ rough: r.rough, score: r.v1 })));
        v2vsV1 = { n: both.length, diff: r2(diff), lo: r2(lo), hi: r2(hi), verdict: lo > 0 ? "better" : hi < 0 ? "worse" : "same" };
    }
    return {
        version: READINESS_CHECK_VERSION, n: rows.length, rough: nRough, methods, v2vsV1,
        verdict: !v2vsV1 ? "few" : v2vsV1.verdict
    };
}
