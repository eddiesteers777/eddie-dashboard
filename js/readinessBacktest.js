/* ==========================================
   Southbound — the readiness check (pure)

   docs/PERFORMANCE_ENGINE_PLAN.md 4.4, rebuilt in 0.2.0 after the audit
   (docs/ATHLETE_MODEL_AUDIT.md D2, A4), which found the first version
   flattering: its outcome came from the same response signals readiness
   v2 then scored, it had no "nothing new" baseline, and it resampled
   days as if they were independent.

   The outcome is a bad training day, decided before looking and from
   things the morning number doesn't contain (trainingOutcomes):
     skipped   a planned run not done, or under 70% of its miles (unless
               it was moved to the day before or after)
     slow      a key workout with half or more of its work laps too slow
     rough     a run worse than the athlete's own usual by more than
               1 SD: effort above what that kind of run usually costs,
               heart rate above the usual at that pace (easy runs), or
               on quality reps (js/trainingResponse.js, only what came
               before each run). Readiness 0.2.0 no longer scores these,
               so they're fair to predict.
     hurt      pain or sickness reported in the next 2 days, when none
               was reported that morning
   For every training day (a planned run or a run done), each method's
   morning number that day (or the morning before when that day has
   none) against whether the day went badly: AUC (0.5 = a coin flip,
   1 = always lower before a bad day). Methods: Classic (v1), New (v2),
   COROS recovery, HRV alone, the check-in alone, yesterday's load, and
   the honest baseline: **what you already knew that morning**
   (yesterday went badly, or you'd reported pain / sickness), because
   bad days come in runs and a score that only echoes that adds nothing.
   95% ranges from a block bootstrap (whole Monday–Sunday weeks drawn
   with replacement, seeded), and paired comparisons (New vs Classic,
   each against the baseline) on the same draws.
   Unit-tested in tests/readinessV2.test.mjs.
========================================== */

import { computeReadiness } from "./readiness.js";
import { readinessV2, autonomic, feelDomain } from "./readinessV2.js";

export const READINESS_CHECK_VERSION = "0.2.0";
export const READINESS_METHODS = Object.freeze([
    { key: "v2", label: "New readiness (v2)" },
    { key: "v1", label: "Classic readiness" },
    { key: "coros", label: "COROS recovery %" },
    { key: "hrv", label: "HRV alone" },
    { key: "feel", label: "Morning check-in alone" },
    { key: "load", label: "Yesterday's load" },
    { key: "persist", label: "What you already knew (yesterday, pain / sick)" }
]);
export const OUTCOME_KINDS = Object.freeze({
    skipped: "planned run skipped or cut short",
    slow: "key workout off its targets (too slow)",
    rough: "run felt harder or heart rate higher than usual",
    hurt: "pain or sickness in the next 2 days"
});

const MILE = 1609.344;
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1)) : 0; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
const reported = c => Boolean(c && (c.sick || c.pain));

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

/**
 * Each training day's outcome, from data the morning numbers don't contain.
 * data: { planDays: [{ date, miles, race }], doses: [{ date, miles }], execution: [{ date, work, slow }],
 *         checkins, response: { effRuns, effortRows }, quality }
 * kinds: which outcome kinds count (the decision replay leaves "rough" out: its response domain is made of it).
 * -> Map(date -> { bad, kinds: [...] }) for days from `from` to two days before `today` (so "the next 2 days" are known).
 */
export function trainingOutcomes(data = {}, today, { from = "0000-00-00", kinds = Object.keys(OUTCOME_KINDS) } = {}) {
    const last = addDays(today, -2);
    const want = new Set(kinds);
    const ran = new Map(), planned = new Map();
    for (const d of data.doses || []) if (d?.date) ran.set(d.date, (ran.get(d.date) || 0) + (Number(d.miles) || 0));
    for (const p of data.planDays || []) if (p?.date && !p.race && Number(p.miles) >= 1) planned.set(p.date, Number(p.miles));
    const rough = want.has("rough") ? roughDays({ effortRows: data.response?.effortRows, effRuns: data.response?.effRuns, quality: data.quality }) : new Map();
    const slow = new Set((data.execution || []).filter(r => r.work > 0 && r.slow >= Math.max(1, r.work / 2)).map(r => r.date));
    const checkins = data.checkins || {};
    const days = new Set([...planned.keys(), ...ran.keys(), ...rough.keys()].filter(d => d >= from && d <= last));
    const out = new Map();
    for (const date of [...days].sort()) {
        const k = [];
        const p = planned.get(date) || 0, r = ran.get(date) || 0;
        if (want.has("skipped") && p && r < 0.7 * p) {
            const moved = [-1, 1].some(n => { const adj = addDays(date, n); return (ran.get(adj) || 0) - (planned.get(adj) || 0) >= 0.7 * p - r; });
            if (!moved) k.push("skipped");
        }
        if (want.has("slow") && slow.has(date)) k.push("slow");
        if (want.has("rough") && rough.get(date)) k.push("rough");
        if (want.has("hurt") && !reported(checkins[date]) && (reported(checkins[addDays(date, 1)]) || reported(checkins[addDays(date, 2)]))) k.push("hurt");
        out.set(date, { bad: k.length > 0, kinds: k });
    }
    return out;
}

/** P(score before a bad day < score before an ordinary day); ties count half. (Ranks: Mann–Whitney.) */
export function auc(pairs) {
    let nPos = 0, nNeg = 0;
    for (const p of pairs) p.rough ? nPos++ : nNeg++;
    if (!nPos || !nNeg) return null;
    const sorted = pairs.slice().sort((a, b) => a.score - b.score);
    let negRanks = 0;
    for (let i = 0; i < sorted.length;) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1].score === sorted[i].score) j++;
        const rank = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) if (!sorted[k].rough) negRanks += rank;
        i = j + 1;
    }
    return (negRanks - nNeg * (nNeg + 1) / 2) / (nPos * nNeg);
}

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/**
 * Whole Monday–Sunday weeks drawn with replacement (bad days come in runs, so days
 * aren't independent): each draw is how many times each week was picked.
 */
function blockDraws(rows, draws, rand) {
    const index = new Map(), blockOf = [];
    for (const r of rows) { const w = mondayOf(r.date); if (!index.has(w)) index.set(w, index.size); blockOf.push(index.get(w)); }
    const nb = index.size, out = [];
    for (let b = 0; b < draws; b++) {
        const w = new Uint16Array(nb);
        for (let i = 0; i < nb; i++) w[Math.floor(rand() * nb)]++;
        out.push(w);
    }
    return { blockOf, draws: out };
}

/**
 * AUC of `key` on the rows `use` keeps, for one draw of week weights: counts per score
 * level, no sorting per draw. (Same as auc() on the resampled list.)
 */
function weightedAuc(rows, key, use, blockOf) {
    const levels = [...new Set(rows.filter(use).map(r => r[key]))].sort((x, y) => x - y);
    const at = new Map(levels.map((v, i) => [v, i]));
    const idx = rows.map(r => (use(r) ? at.get(r[key]) : -1));
    const L = levels.length;
    return weights => {
        const pos = new Float64Array(L), neg = new Float64Array(L);
        let P = 0, N = 0;
        for (let i = 0; i < rows.length; i++) {
            if (idx[i] < 0) continue;
            const w = weights[blockOf[i]];
            if (!w) continue;
            if (rows[i].bad) { pos[idx[i]] += w; P += w; } else { neg[idx[i]] += w; N += w; }
        }
        if (!P || !N) return null;
        let above = N, sum = 0;
        for (let l = 0; l < L; l++) { above -= neg[l]; sum += pos[l] * (above + 0.5 * neg[l]); }
        return sum / (P * N);
    };
}

const r2 = x => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const ci = vals => { vals.sort((x, y) => x - y); return vals.length ? { lo: vals[Math.floor(0.025 * (vals.length - 1))], hi: vals[Math.floor(0.975 * (vals.length - 1))] } : { lo: null, hi: null }; };
const pairsOf = (rows, key) => rows.filter(r => r[key] != null).map(r => ({ rough: r.bad, score: r[key] }));

/**
 * data: { health, fitness, checkins, settings, response: { effRuns, effortRows }, quality, doses, planDays, execution }
 * -> { version, n, bad, kinds: { skipped, slow, rough, hurt }, methods: [{ key, label, n, auc, lo, hi }],
 *      v2vsV1, v2vsPersist, v1vsPersist: { n, diff, lo, hi, verdict: better|worse|same } | null, verdict }
 */
export function readinessCheck(data, today, { days = 365, draws = 1000, seed = 5, minEach = 5 } = {}) {
    const outcomes = trainingOutcomes(data, today, { from: addDays(today, -days) });
    const dates = [...outcomes.keys()];
    const dosesByDate = new Map();
    for (const d of data.doses || []) if (d.dose != null) dosesByDate.set(d.date, (dosesByDate.get(d.date) || 0) + d.dose);
    const checkins = data.checkins || {};
    const cache = new Map();
    const morning = date => {
        if (cache.has(date)) return cache.get(date);
        const v1 = computeReadiness(date, data).score;
        const v2 = readinessV2(date, data).score;
        const a = autonomic(date, data.health || {});
        const f = feelDomain(date, checkins);
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
    // What was already known that morning: the last training day before (within 3 days) went
    // badly in a way that shows by then (skipped / slow / rough), or pain / sickness reported
    // yesterday or this morning. 0 = warned, 1 = nothing.
    const persist = date => {
        if (reported(checkins[date]) || reported(checkins[addDays(date, -1)])) return 0;
        for (let i = 1; i <= 3; i++) {
            const o = outcomes.get(addDays(date, -i));
            if (o) return o.kinds.some(k => k !== "hurt") ? 0 : 1;
        }
        return null;
    };
    const rows = dates.map(date => {
        const m = morning(date), y = morning(addDays(date, -1));
        const pick = k => (m[k] != null ? m[k] : y[k]);
        const row = { date, bad: outcomes.get(date).bad };
        for (const x of READINESS_METHODS) row[x.key] = x.key === "persist" ? persist(date) : pick(x.key);
        return row;
    });
    const kinds = Object.fromEntries(Object.keys(OUTCOME_KINDS).map(k => [k, [...outcomes.values()].filter(o => o.kinds.includes(k)).length]));
    const enough = list => list.filter(r => r.rough).length >= minEach && list.filter(r => !r.rough).length >= minEach;
    const { blockOf, draws: samples } = blockDraws(rows, draws, rng(seed));
    const methods = READINESS_METHODS.map(m => {
        const pairs = pairsOf(rows, m.key);
        if (!enough(pairs)) return { key: m.key, label: m.label, n: pairs.length, auc: null };
        const f = weightedAuc(rows, m.key, r => r[m.key] != null, blockOf);
        const c = ci(samples.map(f).filter(a => a != null));
        return { key: m.key, label: m.label, n: pairs.length, auc: r2(auc(pairs)), lo: r2(c.lo), hi: r2(c.hi) };
    });
    // a vs b on the days both have a number, the same week draws.
    const compare = (a, b) => {
        const use = r => r[a] != null && r[b] != null;
        const both = rows.filter(use);
        if (!enough(both.map(r => ({ rough: r.bad })))) return null;
        const fa = weightedAuc(rows, a, use, blockOf), fb = weightedAuc(rows, b, use, blockOf);
        const diffs = [];
        for (const w of samples) {
            const da = fa(w), db = fb(w);
            if (da != null && db != null) diffs.push(da - db);
        }
        const c = ci(diffs);
        const diff = auc(pairsOf(both, a)) - auc(pairsOf(both, b));
        return { n: both.length, diff: r2(diff), lo: r2(c.lo), hi: r2(c.hi), verdict: c.lo > 0 ? "better" : c.hi < 0 ? "worse" : "same" };
    };
    const v2vsV1 = compare("v2", "v1");
    return {
        version: READINESS_CHECK_VERSION, n: rows.length, bad: rows.filter(r => r.bad).length, kinds, methods,
        v2vsV1, v2vsPersist: compare("v2", "persist"), v1vsPersist: compare("v1", "persist"),
        verdict: !v2vsV1 ? "few" : v2vsV1.verdict
    };
}
