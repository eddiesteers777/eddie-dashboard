/* ==========================================
   Southbound — one dose per session (pure)

   Athlete model, layer 3 (docs/PERFORMANCE_ENGINE_PLAN.md 3.3). Three
   estimates of what a run imposed, each when its data exists:
     pace load    hours × IF² × 100, IF = (climb-adjusted) speed ÷ the
                  athlete's 1-hour race speed (v60) at the time; lap by lap
                  when COROS laps are saved. 1 hour at 1-hour race pace = 100.
     HR load      Banister TRIMP from average HR (lap by lap when laps have
                  HR): minutes × HRr × 0.64 e^(1.92 HRr), HRr = heart-rate
                  reserve fraction. Male constant; the per-athlete scale
                  below absorbs most of the difference.
     effort load  minutes × RPE (session RPE, Foster).
   They are never added up (that would count one run three times). Since
   0.2.0 the dose BLENDS them: HR and effort are put on the pace scale by
   the athlete's own ratio (median over paired sessions, shrunk toward a
   default until there are plenty), then the dose is their weighted
   geometric mean, each weighted by how far it can be trusted on that run
   (`blendWeights`: pace less without laps, on hills or a trail with no
   climb data, none on a treadmill; heart rate less on short runs; HR and
   effort less while their scale is still the default). A run with one
   measure is scored by it alone (→ miles for a hand-logged run with no
   time). The gaps between the measures are still step 4's response
   signals.
   Intensity domains: each lap's time goes to easy (IF < 0.80), threshold
   (0.80–1.00, marathon pace included) or hard (> 1.00). Without laps the
   whole run's IF decides (flagged). Mechanical: miles, climb, long runs.
   Unit-tested in tests/sessionDose.test.mjs.
========================================== */

import { addDays } from "./athleteLedger.js";
import { effortsFrom, envelope, personalExponent, hrMaxFrom, hrRestFrom, isRace } from "./athleteParams.js";

export const DOSE_VERSION = "0.2.0";
const MILE = 1609.344;

/** Plain-language assumptions, shown with the load chart. */
export const DOSE_ASSUMPTIONS = Object.freeze([
    "Pace load: 1 hour at your 1-hour race pace = 100 points; the same hour at 80% of that speed = 64.",
    "Your 1-hour race pace comes from your races of the last 6 months and your fastest training efforts of the last 4 months (training efforts counted 3% slower than a race), with your own distance exponent.",
    "Hills: each meter climbed counts as 6 meters of flat running (total climb only, when Strava has it).",
    "Heart-rate load (TRIMP) and effort load (minutes × effort 1–10) are put on the pace scale with your own ratio from the last year's runs that have both, blended with a default that counts as 10 runs, so yours takes over as they add up.",
    "Each run's load blends every measure it has (pace, heart rate, your effort), weighted by how far each can be trusted on that run: pace counts fully with laps, less without them, on big hills or a trail, not at all on a treadmill; heart rate counts less on runs under 20 minutes; heart rate and effort count less until your own ratio is known. They're averaged on one scale, never added, so a run isn't counted three times.",
    "Treadmill runs and runs with no usable pace are scored by heart rate, then by effort. Until your watch has recorded a max heart rate, 190 is assumed.",
    "Hand-logged runs with only miles count as easy running at your easy pace (lowest quality)."
]);

// Intensity domains by IF (speed ÷ 1-hour race speed).
export const DOMAINS = Object.freeze([
    { key: "easy", label: "Easy", max: 0.80 },
    { key: "threshold", label: "Steady / threshold", max: 1.00 },
    { key: "hard", label: "Hard", max: Infinity }
]);
export const domainOf = intensity => DOMAINS.find(d => intensity < d.max).key;
// The same split by heart-rate reserve and by effort, when pace can't say.
const domainOfHr = hrr => (hrr < 0.75 ? "easy" : hrr <= 0.88 ? "threshold" : "hard");
const domainOfRpe = rpe => (rpe <= 4 ? "easy" : rpe <= 7 ? "threshold" : "hard");

const CLIMB_FACTOR = 6;            // meters of flat per meter climbed
const MAX_IF = 1.5;                // faster than this is a GPS glitch
const TRAINING_TO_RACE = 0.97;     // race time ≈ 97% of what the best training effort says (js/raceCapability.js prior)
const MIN_TRAINING_RUNS = 8, MIN_TRAINING_DAYS = 28;
const ASSUMED_HR_MAX = 190;        // until the watch has seen a max (flagged as assumed)
const DEFAULT_RATIO = Object.freeze({ hr: 0.7, effort: 0.3 });
const RATIO_SHRINK = 10;           // the default counts as 10 paired runs
const RATIO_MIN_PAIRS = 3;
const EASY_IF = 0.72;              // a miles-only run is assumed easy running at this IF
export const LONG_RUN = Object.freeze({ miles: 10, minutes: 90 });

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
const r1 = n => Math.round(n * 10) / 10;
// The furthest back any weekly anchor looks (personalExponent's 730 days, with a margin).
const LOOKBACK_DAYS = 740;

// ---------- the athlete's anchors (1-hour speed, HR max / rest) ----------

/** Distance covered in 1 hour by someone who ran `meters` in `seconds`, with exponent b. */
const metersInHour = (meters, seconds, b) => meters * Math.pow(3600 / seconds, 1 / b);

/**
 * The athlete's 1-hour race speed (m/s) as of a date, from what came before.
 * -> { v60, source, date } or null.
 *   races     all-out confirmed races of the last 180 days
 *   training  the fastest training effort (mile–half) of the last 120 days, × 0.97,
 *             once there are 8+ runs over 4+ weeks
 *   coros     COROS threshold pace of the last 30 days (≈ 1-hour pace)
 * The fastest of the first two wins (training bests rarely are all-out, a
 * race may be months old); COROS only when neither exists.
 */
export function v60At(sessions, asOf, { fitness = {} } = {}) {
    const b = personalExponent(sessions, asOf).value;
    const cands = [];
    const from = addDays(asOf, -180);
    for (const s of sessions) {
        if (s.date > asOf || s.date < from || !isRace(s)) continue;
        cands.push({ v60: metersInHour(s.race.meters, s.race.timeSec, b) / 3600, source: "race", date: s.date });
    }
    // Training bests only once there's a month of runs: with a week or two of easy runs the
    // "fastest effort" is an easy run, and every run would look hard against it.
    const from120 = addDays(asOf, -120);
    const recent = sessions.filter(s => s.date <= asOf && s.date >= from120);
    const span = recent.length ? (new Date(`${asOf}T12:00`) - new Date(`${recent.reduce((m, s) => (s.date < m ? s.date : m), asOf)}T12:00`)) / 864e5 : 0;
    if (recent.length >= MIN_TRAINING_RUNS && span >= MIN_TRAINING_DAYS) {
        for (const e of envelope(effortsFrom(sessions, asOf)).filter(e => e.meters <= 25000)) {
            cands.push({ v60: metersInHour(e.meters, e.seconds * TRAINING_TO_RACE, b) / 3600, source: "training", date: e.date });
        }
    }
    if (cands.length) return cands.sort((x, y) => y.v60 - x.v60)[0];
    const from30 = addDays(asOf, -30);
    const day = Object.keys(fitness || {}).filter(d => d <= asOf && d >= from30 && fitness[d]?.threshold).sort().at(-1);
    const m = day && String(fitness[day].threshold).match(/(\d{1,2}):(\d{2})/);
    if (m) return { v60: MILE / (Number(m[1]) * 60 + Number(m[2])), source: "coros", date: day };
    return null;
}

/**
 * The anchors for every week from the first session's Monday to `today`'s,
 * each from what happened before that Monday (so nothing later leaks back).
 * -> Map(monday -> { v60, v60Source, hrMax, hrRest, hrRestSource })
 */
export function weeklyAnchors(sessions, today, { health = {}, fitness = {} } = {}) {
    const out = new Map();
    if (!sessions.length) return out;
    const sorted = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
    let monday = mondayOf(sorted[0].date);
    const last = mondayOf(today);
    // Everything up to the day before each Monday (a running slice, not refiltered from scratch).
    // v60At and hrMaxFrom look back at most 2 years (the personal exponent's race pairs), so each
    // week reads only that window: the same answers, without rereading ten years 500 times over.
    // After a long break with nothing recent, the last known 1-hour speed carries on, marked older.
    let i = 0, lo = 0, lastV = null;
    while (monday <= last) {
        const asOf = addDays(monday, -1);
        while (i < sorted.length && sorted[i].date <= asOf) i++;
        const from = addDays(asOf, -LOOKBACK_DAYS);
        while (lo < i && sorted[lo].date < from) lo++;
        const recent = sorted.slice(lo, i);
        let v = v60At(recent, asOf, { fitness });
        if (v) lastV = v;
        else if (lastV) v = { ...lastV, source: "older" };
        const hrMax = hrMaxFrom(recent, asOf) || hrMaxFrom(lo ? sorted.slice(0, i) : recent, asOf, { days: 36500 });
        const rest = hrRestFrom(health, asOf);
        out.set(monday, {
            v60: v?.v60 ?? null, v60Source: v?.source ?? null,
            hrMax: hrMax?.value ?? ASSUMED_HR_MAX, hrMaxSource: hrMax ? "your watch" : `assumed ${ASSUMED_HR_MAX}`,
            hrRest: rest?.value ?? 60, hrRestSource: rest ? "COROS" : "assumed 60"
        });
        monday = addDays(monday, 7);
    }
    return out;
}

// ---------- one session ----------

const trimp = (minutes, hrr) => minutes * hrr * 0.64 * Math.exp(1.92 * hrr);

/**
 * The three raw estimates for one session (none of them chosen yet).
 * laps: [{ m, s, hr }] from coros-laps, or null.
 * -> { pace, hr, effort, if, hrr, domainsPace, domainsHr, minutesBy, flags }
 */
export function rawDose(session, anchor, laps = null) {
    const flags = [];
    const sec = num(session.movingSec) ?? num(session.elapsedSec);
    const meters = num(session.distance);
    const minutes = sec ? sec / 60 : null;
    const climb = Number(session.climb) > 0 ? Number(session.climb) : 0;
    const gradeFactor = meters ? 1 + CLIMB_FACTOR * climb / meters : 1;
    const lapRows = Array.isArray(laps) ? laps.filter(l => num(l.m) && num(l.s)) : [];
    const useLaps = lapRows.length >= 2;

    // Pace load.
    let pace = null, intensity = null;
    const domainsPace = { easy: 0, threshold: 0, hard: 0 };
    const minutesBy = { easy: 0, threshold: 0, hard: 0 };
    const v60 = anchor?.v60;
    if (session.indoor) flags.push("Treadmill: pace not used");
    else if (!v60) flags.push("No 1-hour pace yet: pace load not available");
    else if (meters && sec) {
        const parts = useLaps ? lapRows.map(l => ({ m: l.m, s: l.s })) : [{ m: meters, s: sec }];
        let total = 0;
        for (const p of parts) {
            const f = Math.min(MAX_IF, (p.m * gradeFactor / p.s) / v60);
            const load = (p.s / 3600) * f * f * 100;
            total += load;
            const d = domainOf(f);
            domainsPace[d] += load;
            minutesBy[d] += p.s / 60;
        }
        intensity = Math.sqrt(total / 100 / (parts.reduce((t, p) => t + p.s, 0) / 3600));
        pace = total;
        if (!useLaps) flags.push("No laps: the whole run's pace sets its intensity");
        if (session.trail && !climb) flags.push("Trail run with no climb data");
    }

    // HR load.
    let hr = null, hrr = null;
    const domainsHr = { easy: 0, threshold: 0, hard: 0 };
    const max = anchor?.hrMax, rest = anchor?.hrRest ?? 60;
    if (max && max > rest) {
        const parts = useLaps && lapRows.every(l => num(l.hr)) ? lapRows.map(l => ({ s: l.s, hr: l.hr })) : num(session.avgHr) && sec ? [{ s: sec, hr: session.avgHr }] : [];
        if (parts.length) {
            hr = 0;
            for (const p of parts) {
                const x = Math.max(0, Math.min(1, (p.hr - rest) / (max - rest)));
                const load = trimp(p.s / 60, x);
                hr += load;
                domainsHr[domainOfHr(x)] += load;
            }
            const totalS = parts.reduce((t, p) => t + p.s, 0);
            hrr = parts.reduce((t, p) => t + Math.max(0, Math.min(1, (p.hr - rest) / (max - rest))) * p.s, 0) / totalS;
        }
    }

    // Effort load.
    const effort = minutes && Number.isInteger(session.rpe) && session.rpe >= 1 ? minutes * session.rpe : null;

    return { pace, hr, effort, intensity, hrr, domainsPace, domainsHr, minutesBy, flags, laps: useLaps };
}

/**
 * The athlete's own scale between the three: pace ÷ HR and pace ÷ effort,
 * median over runs that have both, shrunk toward the defaults (in logs).
 * raws: [{ pace, hr, effort }] -> { hr: { ratio, n, own }, effort: { … } }
 */
export function calibrate(raws) {
    const out = {};
    for (const key of ["hr", "effort"]) {
        const logs = raws.filter(r => r.pace > 0 && r[key] > 0).map(r => Math.log(r.pace / r[key]));
        const n = logs.length;
        const own = n >= RATIO_MIN_PAIRS ? median(logs) : null;
        const ln = own == null ? Math.log(DEFAULT_RATIO[key]) : (n * own + RATIO_SHRINK * Math.log(DEFAULT_RATIO[key])) / (n + RATIO_SHRINK);
        out[key] = { ratio: Math.exp(ln), n, own: own == null ? null : Math.exp(own), default: DEFAULT_RATIO[key] };
    }
    return out;
}

/** Splits a load into domains in proportion to the given weights. */
function split(load, weights) {
    const t = weights.easy + weights.threshold + weights.hard;
    if (!(t > 0)) return { easy: load, threshold: 0, hard: 0 };
    return { easy: load * weights.easy / t, threshold: load * weights.threshold / t, hard: load * weights.hard / t };
}

/**
 * How far each measure can be trusted on this run (0 = not used).
 * -> { pace, hr, effort }
 */
export function blendWeights(session, raw, scale) {
    const sec = num(session.movingSec) ?? num(session.elapsedSec);
    const meters = num(session.distance);
    const climbPerKm = meters ? (Number(session.climb) || 0) / (meters / 1000) : 0;
    let pace = raw.pace > 0 ? 1 : 0;
    if (pace) {
        if (!raw.laps) pace *= 0.8;                          // the whole run's pace hides intervals
        if (session.trail && !(Number(session.climb) > 0)) pace *= 0.5;
        else if (climbPerKm > 20) pace *= 0.7;              // the climb adjustment is only approximate
    }
    let hr = raw.hr > 0 ? 0.8 : 0;
    if (hr && sec && sec < 20 * 60) hr *= 0.5;               // heart rate lags on short runs
    if (hr && !scale?.hr?.own) hr *= 0.6;
    let effort = raw.effort > 0 ? 0.8 : 0;
    if (effort && !scale?.effort?.own) effort *= 0.6;
    return { pace, hr, effort };
}

/**
 * One dose for one session: the trusted measures blended on the pace scale.
 * -> { id, date, dose, source: blend|pace|hr|effort|miles|none, parts, domains, miles, minutes, climb, long, raw, flags }
 */
export function chooseDose(session, raw, scale, anchor) {
    const miles = (Number(session.distance) || 0) / MILE;
    const sec = num(session.movingSec) ?? num(session.elapsedSec);
    const minutes = sec ? sec / 60 : null;
    let dose = null, source = "none", domains = { easy: 0, threshold: 0, hard: 0 };
    const flags = raw.flags.slice();
    const w = blendWeights(session, raw, scale);
    const values = { pace: raw.pace, hr: raw.hr != null ? raw.hr * scale.hr.ratio : null, effort: raw.effort != null ? raw.effort * scale.effort.ratio : null };
    const used = ["pace", "hr", "effort"].filter(k => w[k] > 0 && values[k] > 0);
    const parts = {};
    if (used.length) {
        const W = used.reduce((t, k) => t + w[k], 0);
        dose = used.length === 1 ? values[used[0]] : Math.exp(used.reduce((t, k) => t + w[k] * Math.log(values[k]), 0) / W);
        source = used.length > 1 ? "blend" : used[0];
        for (const k of used) parts[k] = { load: r1(values[k]), weight: Math.round(w[k] / W * 100) };
        // The intensity split: pace when it's there (lap by lap), else heart rate, else effort.
        const shape = raw.pace != null ? raw.domainsPace : raw.hr != null ? raw.domainsHr : { easy: 0, threshold: 0, hard: 0, [domainOfRpe(session.rpe)]: 1 };
        domains = split(dose, shape);
    } else if (miles > 0 && anchor?.v60) {
        // Miles only (hand-logged): easy running at EASY_IF of the 1-hour speed.
        const hours = miles * MILE / (anchor.v60 * EASY_IF) / 3600;
        dose = hours * EASY_IF * EASY_IF * 100; source = "miles"; domains = { easy: dose, threshold: 0, hard: 0 };
        flags.push("Miles only: counted as easy running");
    }
    return {
        id: session.id, date: session.date, name: session.name || "",
        dose, source, parts, domains,
        miles, minutes, climb: Number(session.climb) > 0 ? Number(session.climb) : 0,
        long: miles >= LONG_RUN.miles || (minutes || 0) >= LONG_RUN.minutes,
        intensity: raw.intensity, hrr: raw.hrr, rpe: Number.isInteger(session.rpe) ? session.rpe : null,
        raw: { pace: raw.pace, hr: raw.hr, effort: raw.effort },
        laps: raw.laps, flags
    };
}

/**
 * Every session's dose. `laps`: the coros-laps store { labelId: { laps } }.
 * -> { version, doses (oldest first), scale, anchors, counts: { blend, pace, hr, effort, miles, none } }
 */
export function sessionDoses(sessions, today, { laps = {}, health = {}, fitness = {} } = {}) {
    const past = sessions.filter(s => s.date <= today);
    const anchors = weeklyAnchors(past, today, { health, fitness });
    const lapsFor = s => {
        const id = String(s.id || "");
        return id.startsWith("c:") ? laps?.[id.slice(2)]?.laps || null : null;
    };
    const raws = past.map(s => ({ s, a: anchors.get(mondayOf(s.date)) || null }))
        .map(x => ({ ...x, raw: rawDose(x.s, x.a, lapsFor(x.s)) }));
    // The scale comes from the last year (fitness, and so the pace scale, moves over the years).
    const yearAgo = addDays(today, -365);
    const lastYear = raws.filter(x => x.s.date > yearAgo).map(x => x.raw);
    const scale = calibrate(lastYear.filter(r => r.pace > 0 && (r.hr > 0 || r.effort > 0)).length >= RATIO_MIN_PAIRS ? lastYear : raws.map(x => x.raw));
    const doses = raws.map(x => chooseDose(x.s, x.raw, scale, x.a))
        .sort((a, b) => a.date.localeCompare(b.date));
    const counts = { blend: 0, pace: 0, hr: 0, effort: 0, miles: 0, none: 0 };
    for (const d of doses) counts[d.source]++;
    return { version: DOSE_VERSION, doses, scale, anchors, counts };
}

/**
 * How the three measures agree, on runs that have two of them (the dose
 * comparison in Model check). For each pair: n, the median ratio, the
 * spread (half the middle 50% of log ratios, as ±%), and the correlation
 * of their logs. Plus how many runs each could score in the last year.
 */
export function doseAgreement(result, today, { days = 365 } = {}) {
    const from = addDays(today, -days);
    const recent = result.doses.filter(d => d.date >= from && d.date <= today);
    const pair = key => {
        const pts = recent.filter(d => d.raw.pace > 0 && d.raw[key] > 0).map(d => [Math.log(d.raw.pace), Math.log(d.raw[key])]);
        if (pts.length < RATIO_MIN_PAIRS) return { n: pts.length };
        const lr = pts.map(([p, o]) => p - o).sort((a, b) => a - b);
        const q = f => lr[Math.min(lr.length - 1, Math.floor(f * lr.length))];
        const mx = pts.reduce((t, p) => t + p[0], 0) / pts.length, my = pts.reduce((t, p) => t + p[1], 0) / pts.length;
        let sxy = 0, sxx = 0, syy = 0;
        for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
        return { n: pts.length, ratio: Math.exp(median(lr)), spreadPct: Math.round((Math.exp((q(0.75) - q(0.25)) / 2) - 1) * 100), r: sxx && syy ? Math.round(sxy / Math.sqrt(sxx * syy) * 100) / 100 : null };
    };
    const cover = key => recent.filter(d => d.raw[key] != null).length;
    return {
        runs: recent.length,
        coverage: { pace: cover("pace"), hr: cover("hr"), effort: cover("effort") },
        hr: pair("hr"),
        effort: pair("effort"),
        primary: { ...result.counts }
    };
}

export const roundDose = d => (d == null ? null : r1(d));
