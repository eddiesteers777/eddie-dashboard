/* ==========================================
   Southbound — Model check: race predictions against real races (pure)

   Docs: docs/PERFORMANCE_ENGINE_PLAN.md, Phase 4. For every confirmed,
   all-out race, each method predicts it using ONLY what happened before
   the race day (sessions, races, COROS numbers dated earlier), as if it
   had been asked then. Nothing later leaks back.
     riegel    Riegel 1.06 from the most recent earlier race (12 months)
     vdot      Daniels VDOT from that same race
     last      the athlete's last time at that distance (2 years)
     races     Southbound's race lens alone (own exponent, aging)
     training  Southbound's training-speed lens alone
     coros     COROS's own prediction (marathon only), as COROS gives it
     southbound  the whole Southbound combination, with its 80% range
     prep      Southbound with the preparation trim applied (half and
               marathon; the 0.1.0 way, COROS untouched)
     corosPrep COROS with the same trim on top (what 0.1.0 did to COROS)
   prep / corosPrep answer the audit's open question on the athlete's own
   races: does taking preparation off the time make predictions better?
   Error = (predicted − actual) / actual: negative = too fast (optimistic).
   With few races the comparison can't separate methods, and the result
   says so instead of crowning a winner.
   Unit-tested in tests/raceBacktest.test.mjs.
========================================== */

import { addDays } from "./athleteLedger.js";
import { isRace } from "./athleteParams.js";
import { predictRace, RACE_MODEL_VERSION } from "./raceCapability.js";
import { vdotEquivalent } from "./vdot.js";

export const METHODS = Object.freeze([
    { key: "southbound", label: "Southbound" },
    { key: "riegel", label: "Riegel (1.06)" },
    { key: "vdot", label: "VDOT" },
    { key: "races", label: "Southbound: races only" },
    { key: "training", label: "Southbound: training only" },
    { key: "coros", label: "COROS (its own number)" },
    { key: "prep", label: "Southbound + preparation trim" },
    { key: "corosPrep", label: "COROS + preparation trim" },
    { key: "last", label: "Your last time" }
]);

const MAX_PRIOR_DAYS = 365;
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
const near = (a, b) => Math.abs(a - b) / b < 0.03;

/** One race, predicted every way from what came before it. */
export function predictOne(race, sessions, { health = {}, fitness = {} } = {}) {
    const asOf = addDays(race.date, -1);
    const before = sessions.filter(s => s.date <= asOf);
    const meters = race.race.meters, actual = race.race.timeSec;
    const prior = before.filter(s => isRace(s) && daysBetween(s.date, race.date) <= MAX_PRIOR_DAYS).sort((a, b) => b.date.localeCompare(a.date));
    const out = {};
    if (prior[0]) {
        const p = prior[0].race;
        out.riegel = p.timeSec * Math.pow(meters / p.meters, 1.06);
        out.vdot = vdotEquivalent(p.meters, p.timeSec, meters);
    }
    const last = before.filter(s => isRace(s) && near(s.race.meters, meters) && daysBetween(s.date, race.date) <= 730).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last) out.last = last.race.timeSec;
    const sb = predictRace({ meters, asOf, sessions: before, health: pickBefore(health, asOf), fitness: pickBefore(fitness, asOf) });
    if (sb.sec) {
        out.southbound = sb.sec;
        for (const l of sb.lenses) out[l.key] = l.sec;
        // Half and marathon: the same prediction with the preparation trim, and COROS with it.
        if (sb.durability) {
            const withPrep = predictRace({ meters, asOf, sessions: before, health: pickBefore(health, asOf), fitness: pickBefore(fitness, asOf), applyPreparation: true });
            if (withPrep.sec) out.prep = withPrep.sec;
            if (out.coros != null) out.corosPrep = out.coros * (1 + sb.durability.deficit);
        }
    }
    const errors = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, (v - actual) / actual]));
    return {
        id: race.id, date: race.date, name: race.race.name || race.name, meters, actual,
        predictions: out, errors,
        range: sb.sec ? { lo: sb.lo, hi: sb.hi, inside: actual >= sb.lo && actual <= sb.hi, confidence: sb.confidence } : null
    };
}

const pickBefore = (byDay, asOf) => Object.fromEntries(Object.entries(byDay || {}).filter(([d]) => d <= asOf));

function summarize(rows, key) {
    const errs = rows.filter(r => r.errors[key] != null);
    if (!errs.length) return { n: 0 };
    const e = errs.map(r => r.errors[key]);
    const mins = errs.map(r => Math.abs(r.predictions[key] - r.actual) / 60);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    return {
        n: errs.length,
        maeMin: mean(mins),
        maePct: mean(e.map(Math.abs)),
        rmsePct: Math.sqrt(mean(e.map(x => x * x))),
        biasPct: mean(e)
    };
}

// A small seeded random number generator, so the check gives the same answer every time.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

/** Southbound vs another method on the races both predicted: mean |error| difference with a bootstrap 95% CI. */
export function compare(rows, other = "riegel", { draws = 2000, seed = 7 } = {}) {
    const both = rows.filter(r => r.errors.southbound != null && r.errors[other] != null);
    const n = both.length;
    if (n < 2) return { n, verdict: "not enough races" };
    const d = both.map(r => Math.abs(r.errors.southbound) - Math.abs(r.errors[other]));
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const rand = rng(seed);
    const boots = Array.from({ length: draws }, () => mean(Array.from({ length: n }, () => d[Math.floor(rand() * n)]))).sort((a, b) => a - b);
    const lo = boots[Math.floor(draws * 0.025)], hi = boots[Math.floor(draws * 0.975)];
    const verdict = n < 5 ? "not enough races" : hi < 0 ? "better" : lo > 0 ? "worse" : "not yet distinguishable";
    return { n, meanDiffPct: mean(d), lo, hi, verdict };
}

/**
 * The whole check: every confirmed all-out race that had something before it.
 * -> { version, rows (newest first), summary: { method: stats }, coverage, vsRiegel, vsVdot, skipped }
 */
export function backtest(sessions, { health = {}, fitness = {} } = {}) {
    const races = sessions.filter(isRace).sort((a, b) => a.date.localeCompare(b.date));
    const rows = [], skipped = [];
    for (const r of races) {
        const row = predictOne(r, sessions, { health, fitness });
        if (Object.keys(row.predictions).length) rows.push(row);
        else skipped.push({ date: r.date, meters: r.race.meters, reason: "Nothing before it to predict from" });
    }
    const summary = Object.fromEntries(METHODS.map(m => [m.key, summarize(rows, m.key)]));
    const ranged = rows.filter(r => r.range);
    return {
        version: RACE_MODEL_VERSION,
        rows: rows.slice().reverse(),
        summary,
        coverage: ranged.length ? { n: ranged.length, inside: ranged.filter(r => r.range.inside).length } : { n: 0, inside: 0 },
        vsRiegel: compare(rows, "riegel"),
        vsVdot: compare(rows, "vdot"),
        vsPrep: compare(rows, "prep"),
        skipped
    };
}

/** What "Copy results" gives: times and errors only (no names of places, no routes). */
export function exportable(result) {
    return {
        model: "southbound-race", version: result.version,
        races: result.rows.map(r => ({ date: r.date, meters: r.meters, actual: r.actual, predictions: Object.fromEntries(Object.entries(r.predictions).map(([k, v]) => [k, Math.round(v)])), range: r.range ? [Math.round(r.range.lo), Math.round(r.range.hi)] : null })),
        summary: result.summary, coverage: result.coverage, vsRiegel: result.vsRiegel, vsVdot: result.vsVdot, vsPrep: result.vsPrep
    };
}
