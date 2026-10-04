/* ==========================================
   Southbound — training response (pure)

   Athlete model, layer 5 (docs/PERFORMANCE_ENGINE_PLAN.md 3.5). Each
   qualifying session is a small test, read against the athlete's own
   recent baseline so it works at any fitness level:
     efficiency   steady easy runs: HR = a + b × speed fitted (Theil–Sen,
                  slope blended with a prior) on the 8 weeks before, the
                  last 7 days left out; each run's residual = its HR minus
                  the expected HR. A 14-day weighted mean says "3 bpm lower
                  at the same pace", called only past 2 bpm and 2 standard
                  errors. Weekly: pace at the athlete's usual easy HR
                  (replaces the old 140-bpm Aerobic fitness).
     effort       reported RPE − expected for that kind of session (the
                  athlete's own average per class, shrunk toward defaults
                  until they have several, plus a duration term). Last 5:
                  +1.0 = "costing more than usual".
     quality HR   heart rate on quality reps (laps) against the athlete's
                  own reps at that speed over the 8 weeks before.
     execution    planned reps on target / too fast / too slow (checkWorkout).
     decoupling   long runs with laps: efficiency, second half vs first.
   Reading: the combination, not a single index, including the ambiguous
   rows (HR down + effort up can be deep fatigue). And the dose test
   (4.3): which load measure best tracks these responses.
   Unit-tested in tests/trainingResponse.test.mjs.
========================================== */

import { addDays } from "./athleteLedger.js";
import { loadState } from "./loadState.js";
import { checkWorkout } from "./trends.js";

export const RESPONSE_VERSION = "0.1.0";
const MILE = 1609.344;
const DAY = 864e5;

export const RESPONSE_ASSUMPTIONS = Object.freeze([
    "Easy runs that count for efficiency: 30–100 minutes, easy intensity (under 85% of your 1-hour race speed), not hilly (under 15 m of climb per km), with heart rate, not a treadmill or a race.",
    "Expected heart rate comes from your own easy runs of the 8 weeks before, leaving out the last 7 days, so a change shows against your recent normal.",
    "A change in easy-run heart rate is only called when it's more than 2 bpm and twice its own uncertainty. Heat raises heart rate: summer readings carry a note.",
    "Expected effort: your own average for that kind of run (easy 3, steady 5, long 5, tempo 6, threshold 7, intervals 8, race 9 until you have a few of each), plus about 0.8 for every extra hour.",
    "Heart rate on quality reps: reps of 2+ minutes at 85%+ of your 1-hour speed, against your own reps of the 8 weeks before at the same speed."
]);

const EASY_MAX_IF = 0.85;
const HILLY = 0.015;                // 15 m per km
const PRIOR_SLOPE = 30;             // bpm per m/s (easy running, about 20 bpm from 8:30 to 7:00 /mi)
const SLOPE_WEIGHT = 8;             // the prior counts as 8 runs
const BASE_FROM = 63, BASE_TO = 8;  // baseline window: days before the run
export const EFFORT_DEFAULTS = Object.freeze({ easy: 3, steady: 5, long: 5, tempo: 6, threshold: 7, intervals: 8, race: 9 });
const DEFAULT_MINUTES = { easy: 50, steady: 60, long: 120, tempo: 50, threshold: 60, intervals: 60 };
const EFFORT_SHRINK = 4;            // the default counts as 4 sessions of that class
const PER_HOUR = 0.8;

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1)) : 0; };
const ageDays = (date, today) => Math.round((new Date(`${today}T12:00:00`) - new Date(`${date}T12:00:00`)) / DAY);
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
const r1 = n => Math.round(n * 10) / 10;

// ---------- the HR–speed line ----------

/**
 * HR = a + b × speed through the points ({ v: m/s, hr }). Theil–Sen slope
 * (median of pairwise slopes, robust to a bad strap), blended with the
 * prior so a narrow spread of speeds can't swing it; a = median(hr − b v).
 */
export function fitHrSpeed(points, { prior = PRIOR_SLOPE, weight = SLOPE_WEIGHT } = {}) {
    if (!points.length) return null;
    const slopes = [];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
        const dv = points[j].v - points[i].v;
        if (Math.abs(dv) >= 0.05) slopes.push((points[j].hr - points[i].hr) / dv);
    }
    const own = slopes.length >= 3 ? median(slopes) : null;
    const n = points.length;
    const b = Math.max(10, Math.min(60, own == null ? prior : (n * own + weight * prior) / (n + weight)));
    const a = median(points.map(p => p.hr - b * p.v));
    return { a, b, n, own };
}
const hrAt = (fit, v) => fit.a + fit.b * v;
const speedAt = (fit, hr) => (hr - fit.a) / fit.b;

// ---------- efficiency ----------

/** Easy runs that count: steady, easy, flat, with HR, 30–100 min. */
export function easyRuns(sessions, doses) {
    const byId = new Map(doses.map(d => [d.id, d]));
    const out = [];
    for (const s of sessions) {
        const d = byId.get(s.id);
        const sec = num(s.movingSec) ?? num(s.elapsedSec);
        const hr = num(s.avgHr), m = num(s.distance);
        if (!d || !sec || !hr || !m || s.indoor || s.race?.status === "race") continue;
        if (sec < 1800 || sec > 6000) continue;
        if (d.intensity != null ? d.intensity >= EASY_MAX_IF : (d.hrr ?? 1) >= 0.8) continue;
        const climb = Number(s.climb) > 0 ? Number(s.climb) : 0;
        if (climb / m > HILLY) continue;
        out.push({ id: s.id, date: s.date, v: m / sec, hr, minutes: sec / 60 });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * -> { version, refHr, runs: [{ id, date, v, hr, expected, residual }], weeks: [{ week, pace, n }],
 *      signal: { verdict: lower|higher|none|few, bpm, se, n, paceSec, from, to }, summer, slope }
 */
export function efficiency(sessions, doses, today, { weeks = 16 } = {}) {
    const runs = easyRuns(sessions.filter(s => s.date <= today), doses);
    const yearRuns = runs.filter(r => ageDays(r.date, today) < 365);
    const refHr = yearRuns.length ? Math.round(median(yearRuns.map(r => r.hr))) : null;

    // Each run against the 8 weeks before it (leaving out its last 7 days).
    const scored = [];
    let lo = 0;
    for (const r of runs) {
        const from = addDays(r.date, -BASE_FROM), to = addDays(r.date, -BASE_TO);
        while (lo < runs.length && runs[lo].date < from) lo++;
        const base = [];
        for (let i = lo; i < runs.length && runs[i].date <= to; i++) base.push(runs[i]);
        if (base.length < 6) continue;
        const fit = fitHrSpeed(base);
        const expected = hrAt(fit, r.v);
        scored.push({ ...r, expected, residual: r.hr - expected, slope: fit.b });
    }

    // Weekly: pace at the usual easy HR from the 28 days to each week's end.
    const lastMonday = mondayOf(today);
    const series = Array.from({ length: weeks }, (_, i) => {
        const week = addDays(lastMonday, -7 * (weeks - 1 - i));
        const end = i === weeks - 1 ? today : addDays(week, 6);
        const pts = runs.filter(r => r.date <= end && r.date > addDays(end, -28));
        if (pts.length < 5 || refHr == null) return { week, pace: null, n: pts.length };
        const fit = fitHrSpeed(pts);
        const v = speedAt(fit, refHr);
        return { week, pace: v > 0.5 ? Math.round(MILE / v) : null, n: pts.length };
    });

    const signal = efficiencySignal(scored, today);
    const month = Number(today.slice(5, 7));
    return { version: RESPONSE_VERSION, refHr, runs: scored, weeks: series, signal, summer: month >= 6 && month <= 8, count: runs.length };
}

/**
 * The efficiency signal as of a morning: the runs of the 14 days to `asOf`
 * (residuals already against their own earlier baselines), weighted toward
 * the newest (τ 7 days). -> { verdict: lower|higher|none|few, bpm, se, n, paceSec, from, to }
 */
export function efficiencySignal(scored, asOf) {
    const recent = scored.filter(r => r.date <= asOf && ageDays(r.date, asOf) <= 13);
    if (recent.length < 3) return { verdict: "few", n: recent.length };
    const w = recent.map(r => Math.exp(-ageDays(r.date, asOf) / 7));
    const sw = w.reduce((a, b) => a + b, 0);
    const m = recent.reduce((t, r, i) => t + r.residual * w[i], 0) / sw;
    const nEff = sw * sw / w.reduce((t, x) => t + x * x, 0);
    const se = sd(recent.map(r => r.residual)) / Math.sqrt(nEff);
    const slope = median(recent.map(r => r.slope));
    const vRef = mean(recent.map(r => r.v));
    const dv = -m / slope;
    const verdict = Math.abs(m) > 2 && Math.abs(m) > 2 * se ? (m < 0 ? "lower" : "higher") : "none";
    return {
        verdict, bpm: r1(m), se: r1(se), n: recent.length,
        paceSec: Math.round(MILE / vRef - MILE / (vRef + dv)),     // + = faster at the same HR
        from: addDays(asOf, -BASE_FROM), to: addDays(asOf, -BASE_TO)
    };
}

// ---------- effort vs expected ----------

/** The effort signal as of a morning: the last `last` answered runs of the `days` to asOf. */
export function effortSignal(rows, asOf, { last = 5, days = 21 } = {}) {
    const recent = rows.filter(r => r.date <= asOf && ageDays(r.date, asOf) < days).slice(-last);
    const m = recent.length ? mean(recent.map(r => r.residual)) : null;
    return recent.length < 3 ? { verdict: "few", n: recent.length }
        : { verdict: m >= 1 ? "costlier" : m <= -1 ? "easier" : "usual", mean: r1(m), n: recent.length };
}

/** What kind of session it was, from its dose. */
export function sessionClass(dose, session) {
    if (session?.race?.status === "race") return "race";
    const i = dose.intensity;
    const hard = dose.dose > 0 ? dose.domains.hard / dose.dose : 0;
    if (dose.long && (i == null || i < 0.88)) return "long";
    if (hard >= 0.15) return "intervals";
    if (i == null) {
        const h = dose.hrr;
        if (h == null) return dose.long ? "long" : "easy";
        return h >= 0.88 ? "threshold" : h >= 0.82 ? "tempo" : h >= 0.75 ? "steady" : "easy";
    }
    return i >= 0.92 ? "threshold" : i >= 0.86 ? "tempo" : i >= 0.80 ? "steady" : "easy";
}

/**
 * -> { rows: [{ id, date, cls, rpe, expected, residual, minutes }] (oldest first),
 *      signal: { verdict: costlier|easier|usual|few, mean, n }, answered, recentRuns }
 */
export function effortResponse(sessions, doses, today, { last = 5, days = 21 } = {}) {
    const sById = new Map(sessions.map(s => [s.id, s]));
    const answered = doses.filter(d => d.date <= today && Number.isInteger(d.rpe) && d.minutes > 0)
        .map(d => ({ d, cls: sessionClass(d, sById.get(d.id)) }));
    const rows = [];
    const seen = {};
    for (const { d, cls } of answered) {
        const prior = seen[cls] || [];
        const def = EFFORT_DEFAULTS[cls];
        const own = mean(prior.map(p => p.rpe));
        const base = own == null ? def : (prior.length * own + EFFORT_SHRINK * def) / (prior.length + EFFORT_SHRINK);
        const usualMin = prior.length >= 3 ? mean(prior.map(p => p.minutes)) : DEFAULT_MINUTES[cls];
        const expected = Math.max(1, Math.min(10, base + (cls === "race" ? 0 : PER_HOUR * (d.minutes - usualMin) / 60)));
        rows.push({ id: d.id, date: d.date, cls, rpe: d.rpe, expected: r1(expected), residual: r1(d.rpe - expected), minutes: Math.round(d.minutes) });
        (seen[cls] ||= []).push({ rpe: d.rpe, minutes: d.minutes });
    }
    const signal = effortSignal(rows, today, { last, days });
    const recentRuns = doses.filter(d => ageDays(d.date, today) < 14 && d.date <= today).length;
    return { rows, signal, answered: rows.filter(r => ageDays(r.date, today) < 14).length, recentRuns };
}

// ---------- heart rate on quality reps ----------

/**
 * laps: { sessionId: [{ m, s, hr }] }; anchors: Map(monday -> { v60 }).
 * -> { sessions: [{ id, date, reps, residual }], signal: { verdict, bpm, n } }
 */
export function qualityHr(doses, laps, anchors, today) {
    const reps = [];
    for (const d of doses.filter(x => x.date <= today)) {
        const ls = laps[d.id];
        const v60 = anchors.get(mondayOf(d.date))?.v60;
        if (!Array.isArray(ls) || !v60) continue;
        ls.slice(1).forEach(l => {
            const v = num(l.m) && num(l.s) ? l.m / l.s : null;
            if (v && l.s >= 120 && num(l.hr) && v / v60 >= 0.85) reps.push({ id: d.id, date: d.date, v, hr: l.hr });
        });
    }
    const out = [];
    for (const id of [...new Set(reps.map(r => r.id))]) {
        const mine = reps.filter(r => r.id === id);
        const date = mine[0].date;
        const base = reps.filter(r => r.date < date && r.date >= addDays(date, -56));
        if (base.length < 8) continue;
        const fit = fitHrSpeed(base, { prior: 25 });
        out.push({ id, date, reps: mine.length, residual: r1(mean(mine.map(r => r.hr - hrAt(fit, r.v)))) });
    }
    const recent = out.filter(x => ageDays(x.date, today) < 28).slice(-3);
    const m = recent.length ? mean(recent.map(x => x.residual)) : null;
    return {
        sessions: out,
        signal: recent.length < 2 ? { verdict: "few", n: recent.length } : { verdict: m >= 3 ? "higher" : m <= -3 ? "lower" : "usual", bpm: r1(m), n: recent.length }
    };
}

// ---------- execution and long-run drift ----------

/** keyWork: [{ date, title, kind, sets, run: { labelId } }]; laps by labelId. */
export function executionSummary(keyWork, lapsByLabel, today, { days = 42 } = {}) {
    const rows = [];
    for (const w of keyWork || []) {
        if (ageDays(w.date, today) >= days || w.date > today) continue;
        const ls = w.run?.labelId != null ? lapsByLabel?.[w.run.labelId]?.laps : null;
        if (!ls?.length) continue;
        const c = checkWorkout(w.sets, ls);
        if (c.target && c.work) rows.push({ date: w.date, title: w.title, work: c.work, onTarget: c.onTarget, fast: c.fast, slow: c.slow });
    }
    const t = k => rows.reduce((s, r) => s + r[k], 0);
    return { sessions: rows.length, work: t("work"), onTarget: t("onTarget"), fast: t("fast"), slow: t("slow"), rows };
}

/** Long runs (75+ min) with laps: efficiency (speed per beat), second half vs first, as % lost. */
export function decoupling(doses, laps, today, { days = 56 } = {}) {
    const out = [];
    for (const d of doses) {
        if (!d.long || (d.minutes || 0) < 75 || ageDays(d.date, today) >= days || d.date > today) continue;
        const ls = (laps[d.id] || []).filter(l => num(l.m) && num(l.s) && num(l.hr));
        if (ls.length < 4) continue;
        const total = ls.reduce((t, l) => t + l.s, 0);
        let acc = 0;
        const half = [[], []];
        for (const l of ls) { half[acc + l.s / 2 < total / 2 ? 0 : 1].push(l); acc += l.s; }
        if (!half[0].length || !half[1].length) continue;
        const ef = h => (h.reduce((t, l) => t + l.m, 0) / h.reduce((t, l) => t + l.s, 0)) / (h.reduce((t, l) => t + l.hr * l.s, 0) / h.reduce((t, l) => t + l.s, 0));
        out.push({ id: d.id, date: d.date, miles: r1(d.miles), drift: r1((ef(half[0]) - ef(half[1])) / ef(half[0]) * 100) });
    }
    return out.slice(-4);
}

// ---------- reading them together ----------

export const READINGS = Object.freeze({
    adaptation: { title: "Adapting", text: "The same easy pace is costing less heart rate, without feeling harder. This is what training is for." },
    steady: { title: "Steady", text: "Heart rate at your easy pace and how runs feel are both where they've been." },
    fatigue: { title: "Tired, hot or getting sick?", text: "Heart rate is up at the same pace and runs feel harder. Check sleep, HRV and how you feel before the next hard day." },
    hrOnly: { title: "Heart rate up, effort normal", text: "Higher heart rate at the same pace without feeling harder: often heat, dehydration or the start of a cold. Worth watching for a few days." },
    deep: { title: "Possible deeper fatigue", text: "Heart rate is lower at the same pace, yet runs feel harder. Heart rate can drop when you're overreached: look for a second sign (HRV, sleep, legs) before reading it as fitness." },
    costlier: { title: "Feeling harder than usual", text: "Heart rate at your easy pace hasn't moved, but runs feel harder than usual for you. Often stress, poor sleep or early fatigue: look at the check-in." },
    easier: { title: "Feeling easier", text: "Runs feel easier than usual for you, with heart rate where it's been." },
    partial: { title: "Not enough to read yet", text: "" }
});

/** eff.signal + effort.signal -> { key, title, text } */
export function reading(effSignal, effortSignal) {
    const hr = effSignal?.verdict, eff = effortSignal?.verdict;
    const missing = [];
    if (!hr || hr === "few") missing.push("a few more easy runs with heart rate");
    if (!eff || eff === "few") missing.push("an effort answer after at least 3 runs");
    if (missing.length === 2) return { key: "partial", ...READINGS.partial, text: `Needs ${missing.join(" and ")} in the last 2–3 weeks.` };
    const harder = eff === "costlier", easier = eff === "easier";
    let key;
    if (hr === "higher") key = harder ? "fatigue" : "hrOnly";
    else if (hr === "lower") key = harder ? "deep" : "adaptation";
    else if (hr === "none") key = harder ? "costlier" : easier ? "easier" : "steady";
    else key = harder ? "costlier" : easier ? "easier" : "steady";
    const r = { key, ...READINGS[key] };
    if (missing.length) r.note = `Read from one signal only: needs ${missing[0]} for the other.`;
    return r;
}

// ---------- the dose test (4.3) ----------

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function pearson(xs, ys) {
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

export const DOSE_VARIANTS = Object.freeze([
    { key: "primary", label: "Southbound's dose" },
    { key: "pace", label: "Pace load" },
    { key: "hr", label: "Heart-rate load" },
    { key: "effort", label: "Effort load" },
    { key: "miles", label: "Last 7 days' miles" }
]);

/**
 * How well each load measure tracks the response probes that follow:
 * recent load above base the day before -> a higher easy-run HR residual,
 * a higher effort residual. Pearson r per measure, a seeded bootstrap 95%
 * CI, and each against Southbound's dose on the same resamples.
 */
export function doseBacktest(doseResult, probes, { draws = 1000, seed = 11, minProbes = 20 } = {}) {
    const doses = doseResult.doses;
    const s = doseResult.scale;
    const pick = {
        primary: d => d.dose,
        pace: d => d.raw.pace ?? d.dose,
        hr: d => (d.raw.hr != null ? d.raw.hr * s.hr.ratio : d.dose),
        effort: d => (d.raw.effort != null ? d.raw.effort * s.effort.ratio : d.dose)
    };
    const last = probes.reduce((m, p) => (p.date > m ? p.date : m), "0000");
    const feature = {};
    for (const [key, f] of Object.entries(pick)) {
        const st = loadState(doses.map(d => ({ ...d, dose: f(d), domains: { easy: f(d) ?? 0, threshold: 0, hard: 0 } })), last);
        const byDate = new Map(st.series.map(x => [x.date, x.recent - x.base]));
        feature[key] = p => byDate.get(addDays(p.date, -1));
    }
    const milesByDate = new Map();
    for (const d of doses) milesByDate.set(d.date, (milesByDate.get(d.date) || 0) + d.miles);
    feature.miles = p => { let t = 0; for (let i = 1; i <= 7; i++) t += milesByDate.get(addDays(p.date, -i)) || 0; return t; };

    const usable = probes.filter(p => DOSE_VARIANTS.every(v => feature[v.key](p) != null));
    const n = usable.length;
    if (n < minProbes) return { n, verdict: "few", variants: [] };
    const ys = usable.map(p => p.residual);
    const xs = Object.fromEntries(DOSE_VARIANTS.map(v => [v.key, usable.map(p => feature[v.key](p))]));
    const rand = rng(seed);
    const boots = Object.fromEntries(DOSE_VARIANTS.map(v => [v.key, []]));
    const diffs = Object.fromEntries(DOSE_VARIANTS.map(v => [v.key, []]));
    for (let b = 0; b < draws; b++) {
        const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
        const y = idx.map(i => ys[i]);
        const rp = pearson(idx.map(i => xs.primary[i]), y);
        for (const v of DOSE_VARIANTS) {
            const r = v.key === "primary" ? rp : pearson(idx.map(i => xs[v.key][i]), y);
            boots[v.key].push(r);
            diffs[v.key].push(r - rp);
        }
    }
    const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
    const variants = DOSE_VARIANTS.map(v => {
        const vs = v.key === "primary" ? null : { lo: q(diffs[v.key], 0.025), hi: q(diffs[v.key], 0.975) };
        return {
            key: v.key, label: v.label, r: Math.round(pearson(xs[v.key], ys) * 100) / 100,
            lo: Math.round(q(boots[v.key], 0.025) * 100) / 100, hi: Math.round(q(boots[v.key], 0.975) * 100) / 100,
            vsPrimary: vs ? (vs.lo > 0 ? "better" : vs.hi < 0 ? "worse" : "same") : null
        };
    });
    const better = variants.filter(v => v.vsPrimary === "better");
    // Is there an expected link at all (more recent load -> a higher residual)?
    const link = variants.some(v => v.lo > 0);
    return { n, verdict: better.length ? "other" : "keep", better: better.map(v => v.key), link, variants };
}

/** Week-to-week wobble of two weekly pace series (s/mi): lower is steadier at equal sensitivity. */
export function seriesNoise(paces) {
    const p = paces.filter(x => x != null);
    if (p.length < 4) return null;
    const diffs = p.slice(1).map((x, i) => x - p[i]);
    return { weeks: p.length, sd: r1(sd(diffs)) };
}
