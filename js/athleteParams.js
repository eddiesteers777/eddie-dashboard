/* ==========================================
   Southbound — the athlete's own numbers (pure)

   Athlete model, layer 2 (docs/PERFORMANCE_ENGINE_PLAN.md 3.2). Each
   value says where it came from and how sure it is:
     hrMax       2nd-highest session max HR on separate days, 18 months
                 (one spike from a bad strap can't set it)
     hrRest      median resting HR of the last 30 days (COROS)
     efforts     best efforts in training: fastest stretches inside Strava
                 watch files, whole runs; confirmed races kept apart so
                 the race lens and the training lens stay independent
     speedCurve  the athlete's own power law T = a·D^b through the best
                 effort in each distance band (Riegel's shape, their slope)
     cs          critical speed + D′: distance = CS·t + D′ over best
                 efforts of 2–20 minutes (Smyth & Muniz-Pumares 2020)
     exponent    the athlete's own distance exponent from pairs of
                 confirmed races, shrunk toward Riegel's 1.06 until there
                 are enough pairs (prior SD 0.03, one pair counts as SD 0.03)
   Everything takes `asOf` and looks only at what happened by then, so
   the backtest can ask "what would we have said before that race?".
   Unit-tested in tests/athleteParams.test.mjs.
========================================== */

import { addDays } from "./athleteLedger.js";

export const PARAMS_VERSION = 1;
export const PRIOR_EXPONENT = 1.06;
export const PRIOR_EXPONENT_SD = 0.03;
const PAIR_SD = 0.03;
const BEST_METERS = [1609.344, 5000, 10000, 21097.5, 42195];   // Strava's "b": mile, 5K, 10K, half, full
const BANDS = [[1300, 2500], [2500, 4500], [4500, 7500], [7500, 12000], [12000, 18000], [18000, 25000], [25000, 35000], [35000, 46000]];

const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const secondsOf = s => s.elapsedSec || s.movingSec || null;
export const isRace = s => s?.race?.status === "race" && s.race.allOut !== false && s.race.timeSec > 0;

/** { value, source, confidence, n } or null. */
export function hrMaxFrom(sessions, asOf, { days = 548 } = {}) {
    const from = addDays(asOf, -days);
    const byDay = new Map();
    for (const s of sessions) {
        const hr = Number(s.maxHr);
        if (!(hr >= 140 && hr <= 230) || s.date < from || s.date > asOf) continue;
        byDay.set(s.date, Math.max(byDay.get(s.date) || 0, hr));
    }
    const peaks = [...byDay.values()].sort((a, b) => b - a);
    if (!peaks.length) return null;
    return { value: peaks[1] ?? peaks[0], source: "your watch", confidence: peaks.length >= 5 ? "moderate" : "low", n: peaks.length };
}

/** Median resting HR of the 30 days to asOf (needs 5 nights). */
export function hrRestFrom(health = {}, asOf, { days = 30 } = {}) {
    const from = addDays(asOf, -(days - 1));
    const vals = Object.entries(health || {}).filter(([d, h]) => d >= from && d <= asOf && Number(h?.rhr) > 25).map(([, h]) => Number(h.rhr));
    if (vals.length < 5) return null;
    return { value: Math.round(median(vals)), source: "COROS resting HR", confidence: vals.length >= 20 ? "high" : "moderate", n: vals.length };
}

/**
 * Best efforts in the `days` to asOf.
 * -> [{ meters, seconds, date, kind: "inside" | "whole" | "race", id }]
 * excludeRaces: leave out confirmed races and everything inside them.
 */
export function effortsFrom(sessions, asOf, { days = 120, excludeRaces = true } = {}) {
    const from = addDays(asOf, -(days - 1));
    const out = [];
    for (const s of sessions) {
        if (s.date < from || s.date > asOf) continue;
        if (isRace(s)) {
            if (!excludeRaces) out.push({ meters: s.race.meters, seconds: s.race.timeSec, date: s.date, kind: "race", id: s.id });
            continue;
        }
        (s.best || []).forEach((sec, i) => { if (sec > 0) out.push({ meters: BEST_METERS[i], seconds: sec, date: s.date, kind: "inside", id: s.id }); });
        const sec = secondsOf(s);
        if (s.distance >= 1300 && sec > 0) out.push({ meters: s.distance, seconds: sec, date: s.date, kind: "whole", id: s.id });
    }
    // Faster than 3:30/mi is a GPS glitch, not an effort.
    return out.filter(e => e.seconds / (e.meters / 1609.344) >= 210);
}

/** The fastest effort in each distance band (by speed). */
export function envelope(efforts) {
    const out = [];
    for (const [lo, hi] of BANDS) {
        const best = efforts.filter(e => e.meters >= lo && e.meters < hi).sort((a, b) => b.meters / b.seconds - a.meters / a.seconds)[0];
        if (best) out.push(best);
    }
    return out;
}

/** Least squares ln T = ln a + b ln D through the points. Needs 2+ points spanning 2× in distance. */
export function fitSpeedCurve(points) {
    if (points.length < 2) return null;
    const ms = points.map(p => p.meters);
    if (Math.max(...ms) / Math.min(...ms) < 2) return null;
    const xs = points.map(p => Math.log(p.meters)), ys = points.map(p => Math.log(p.seconds));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxx = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (ys[i] - my); });
    const rawB = sxy / sxx;
    const b = Math.max(1.0, Math.min(1.2, rawB));
    const lnA = my - b * mx;
    return { a: Math.exp(lnA), b, rawB, n: points.length, minMeters: Math.min(...ms), maxMeters: Math.max(...ms) };
}

export const curveTime = (curve, meters) => curve.a * Math.pow(meters, curve.b);

/** distance = CS·t + D′ over best efforts of 2–20 minutes. Needs 3 points spanning 2.5× in time. */
export function fitCriticalSpeed(efforts) {
    const pts = envelope(efforts.filter(e => e.seconds >= 120 && e.seconds <= 1200));
    if (pts.length < 3) return null;
    const ts = pts.map(p => p.seconds);
    if (Math.max(...ts) / Math.min(...ts) < 2.5) return null;
    const mt = ts.reduce((a, b) => a + b, 0) / ts.length, md = pts.reduce((a, p) => a + p.meters, 0) / pts.length;
    let stt = 0, std = 0, sdd = 0;
    pts.forEach(p => { stt += (p.seconds - mt) ** 2; std += (p.seconds - mt) * (p.meters - md); sdd += (p.meters - md) ** 2; });
    const cs = std / stt, dPrime = md - cs * mt;
    if (!(cs > 0) || !(dPrime > 0)) return null;
    return { cs, dPrime, n: pts.length, r2: (std * std) / (stt * sdd) };
}

/** The athlete's own distance exponent from pairs of confirmed races within `gapDays` of each other. */
export function personalExponent(sessions, asOf, { days = 730, gapDays = 120 } = {}) {
    const from = addDays(asOf, -days);
    const races = sessions.filter(s => isRace(s) && s.date >= from && s.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
    const pairs = [];
    for (let i = 0; i < races.length; i++) for (let j = i + 1; j < races.length; j++) {
        const a = races[i], b = races[j];
        const gap = Math.abs(new Date(`${b.date}T12:00`) - new Date(`${a.date}T12:00`)) / 864e5;
        const ratio = b.race.meters / a.race.meters;
        if (gap > gapDays || Math.abs(Math.log(ratio)) < Math.log(1.5)) continue;
        const e = Math.log(b.race.timeSec / a.race.timeSec) / Math.log(ratio);
        pairs.push(Math.max(0.98, Math.min(1.2, e)));
    }
    const pp = 1 / PRIOR_EXPONENT_SD ** 2, po = 1 / PAIR_SD ** 2;
    const value = (PRIOR_EXPONENT * pp + pairs.reduce((a, b) => a + b, 0) * po) / (pp + pairs.length * po);
    return { value, sd: Math.sqrt(1 / (pp + pairs.length * po)), n: pairs.length, source: pairs.length ? `your races (${pairs.length} ${pairs.length === 1 ? "pair" : "pairs"}), shrunk toward 1.06` : "Riegel's 1.06 (no race pairs yet)" };
}

/** All of the above as of a date. */
export function athleteParams({ sessions = [], health = {}, asOf }) {
    const training = effortsFrom(sessions, asOf);
    return {
        version: PARAMS_VERSION,
        asOf,
        hrMax: hrMaxFrom(sessions, asOf),
        hrRest: hrRestFrom(health, asOf),
        efforts: training,
        speedCurve: fitSpeedCurve(envelope(training)),
        cs: fitCriticalSpeed(training),
        exponent: personalExponent(sessions, asOf)
    };
}
