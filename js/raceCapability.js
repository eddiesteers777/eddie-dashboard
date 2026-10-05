/* ==========================================
   Southbound — race capability: lenses, not an average (pure)

   Athlete model, layer 7 (docs/PERFORMANCE_ENGINE_PLAN.md 3.7). What
   could the athlete run at a distance, as of a date, with a range and
   the reason the evidence disagrees. Independent lenses only:
     R  races      confirmed all-out races in the last 12 months, each
                   moved to the target distance with the athlete's own
                   exponent; uncertainty grows with time since the race
                   and with how far the distance is stretched
     S  training   the fastest best effort of 1 mile to 10K in the last
                   120 days (inside Strava watch files, or whole runs),
                   moved to the target the same way. Training bests are
                   rarely all-out, so this lens is wider
     A  device     COROS's marathon prediction (marathon only), wide, used
                   exactly as COROS gives it: COROS's predictor already reads
                   the athlete's training, so nothing of Southbound's is
                   applied to it (an independent opinion, and its own errors
                   show in the backtest)
   (Riegel and VDOT are two curve shapes on the same race, so they are
   not two lenses; VDOT is used in the backtest as a comparison.)
     P  preparation  half and marathon only: is the training the distance
                   needs there? Weekly miles, long runs and the longest run
                   of the last 12 weeks against what the predicted time
                   usually takes (Runalyze's "marathon shape" idea; Vickers
                   & Vertosick: volume predicts the marathon beyond a
                   shorter race). Since 0.2.0 it is SHOWN, not applied: the
                   personal exponent from the athlete's own race pairs already
                   carries how they fade with distance, and whether a thinner
                   block costs this athlete time is not known until their own
                   races say so (docs/ATHLETE_MODEL_AUDIT.md, R1–R3). The old
                   trim (on S and shorter races) runs only with
                   applyPreparation: true, which the backtest compares.
   Track record: the athlete's earlier races at the same kind of distance
   against what this model said the day before each (no later data);
   the average miss, shrunk toward none, adjusts the result.
   Combining: precision-weighted mean of log-times (weights 1/σ²); when
   the lenses disagree more than their σ allow, the range widens
   (σ × √(χ²/df)). 80% range = ±1.28σ. Every number here is a starting
   assumption to be checked by js/raceBacktest.js on real races.
   Unit-tested in tests/raceCapability.test.mjs.
========================================== */

import { addDays, RACE_DISTANCES } from "./athleteLedger.js";
import { athleteParams, isRace, envelope } from "./athleteParams.js";

export const RACE_MODEL_VERSION = "0.2.0";
const MILE = 1609.344;
const Z80 = 1.2816;

export const ASSUMPTIONS = Object.freeze([
    "Race lens σ 3% + 0.5% per month since the race + 1.5% per unit of ln(distance ratio)",
    "Training lens σ 5%: training bests from the mile to 10K in the last 120 days, times your own race-vs-training factor (prior 0.97, worth 2 races)",
    "COROS lens σ 6%, marathon only, its newest prediction within 30 days, used as COROS gives it",
    "Preparation (half and marathon): weekly miles, long runs and longest run in 12 weeks against a typical plan for the predicted time. Shown, not applied to the time, until your own races show whether a thinner block slows you; the backtest checks both ways (a typical effect would be up to 8% for the marathon, 3% for the half)",
    "Distance exponent: your race pairs shrunk toward Riegel's 1.06 (prior SD 0.03)",
    "Track record: your earlier races at this kind of distance (3 years) against what the model said the day before each; shrunk toward no adjustment as if 2 races had matched"
]);

const DURABILITY = {
    marathon: { maxPenalty: 0.08, longMiles: 18, longCount: 4, longest: 20, volumeScale: 1 },
    half: { maxPenalty: 0.03, longMiles: 10, longCount: 4, longest: 12, volumeScale: 0.7 }
};

// Weekly miles a marathon of this time usually takes (typical plans' peak-block averages).
const VOLUME = [[150, 70], [180, 55], [210, 45], [240, 38], [300, 30], [360, 25]];
export function typicalWeeklyMiles(marathonMinutes) {
    if (marathonMinutes <= VOLUME[0][0]) return VOLUME[0][1];
    for (let i = 1; i < VOLUME.length; i++) {
        const [t1, v1] = VOLUME[i - 1], [t2, v2] = VOLUME[i];
        if (marathonMinutes <= t2) return v1 + (v2 - v1) * (marathonMinutes - t1) / (t2 - t1);
    }
    return VOLUME.at(-1)[1];
}

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);
export const clock = sec => { const s = Math.round(sec); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const shortDate = d => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const distanceLabel = meters => RACE_DISTANCES.find(d => Math.abs(d.m - meters) / d.m < 0.01)?.label || `${Math.round(meters / MILE * 10) / 10} mi`;
const clockSec = t => { const m = String(t || "").match(/^(\d{1,2}):(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null; };

/** Is the training the distance needs there? null below the half. */
export function durability(sessions, asOf, meters, predictedSec) {
    const kind = meters >= 40000 ? "marathon" : meters >= 20000 ? "half" : null;
    if (!kind) return null;
    const cfg = DURABILITY[kind];
    const from = addDays(asOf, -83);
    const runs = sessions.filter(s => s.date >= from && s.date <= asOf);
    const miles = runs.map(s => s.distance / MILE);
    const weekly = miles.reduce((a, b) => a + b, 0) / 12;
    const longRuns = miles.filter(m => m >= cfg.longMiles - 0.2).length;   // GPS and rounding: an "18" is 17.9-something
    const longest = miles.length ? Math.max(...miles) : 0;
    const marathonMin = (kind === "marathon" ? predictedSec : predictedSec * 2.1) / 60;
    const targetWeekly = typicalWeeklyMiles(marathonMin) * cfg.volumeScale;
    const parts = {
        weekly: { value: Math.round(weekly * 10) / 10, target: Math.round(targetWeekly) },
        longRuns: { value: longRuns, target: cfg.longCount, over: cfg.longMiles },
        longest: { value: Math.round(longest * 10) / 10, target: cfg.longest }
    };
    const readiness = (Math.min(1, weekly / targetWeekly) + Math.min(1, longRuns / cfg.longCount) + Math.min(1, longest / cfg.longest)) / 3;
    const deficit = (1 - readiness) * cfg.maxPenalty;
    return { kind, readiness, deficit, parts };
}

/** Moves a time to another distance with exponent b. */
const move = (sec, fromMeters, toMeters, b) => sec * Math.pow(toMeters / fromMeters, b);

// Training bests are rarely all-out. Until the athlete's own races say how far
// off they are, assume a race is ~3% faster than the best training effort
// predicts (an assumption, checked by the backtest), counted as 2 races' worth.
export const TRAINING_FACTOR_PRIOR = 0.97;
const TRAINING_FACTOR_WEIGHT = 2;

/** The raw training lens: the fastest mile-to-10K training effort, moved to `meters`. */
function rawTraining(sessions, asOf, meters) {
    const params = athleteParams({ sessions, asOf });
    const b = params.exponent.value;
    const best = envelope(params.efforts).filter(e => e.meters <= 12000)
        .map(e => ({ e, sec: move(e.seconds, e.meters, meters, b) })).sort((x, y) => x.sec - y.sec)[0];
    return best || null;
}

/**
 * How the athlete's races have compared with what their training said just
 * before each one: actual ÷ training lens, shrunk toward 0.97. -> { value, n }
 */
export function trainingFactor(sessions, asOf, { days = 730 } = {}) {
    const from = addDays(asOf, -days);
    const ratios = [];
    for (const r of sessions.filter(s => isRace(s) && s.date >= from && s.date <= asOf)) {
        const before = sessions.filter(s => s.date < r.date);
        const est = rawTraining(before, addDays(r.date, -1), r.race.meters);
        if (est) ratios.push(Math.max(0.85, Math.min(1.1, r.race.timeSec / est.sec)));
    }
    const value = (TRAINING_FACTOR_PRIOR * TRAINING_FACTOR_WEIGHT + ratios.reduce((a, b) => a + b, 0)) / (TRAINING_FACTOR_WEIGHT + ratios.length);
    return { value, n: ratios.length };
}

/**
 * What the athlete could run at `meters`, as of `asOf`.
 * sessions: the ledger (js/athleteLedger.js); health / fitness: COROS days.
 * Only data dated asOf or earlier is used.
 */
// The athlete's own track record at this kind of distance: how their earlier
// races compared with what this model said the day before each one.
const BANDS = [[0, 6000], [6000, 12000], [12000, 30000], [30000, 1e9]];
const bandOf = m => BANDS.findIndex(([lo, hi]) => m >= lo && m < hi);
const TRACK_WEIGHT = 2;     // shrink toward "no adjustment" as if 2 races had matched exactly

/** -> { value, n, avgMiss } (value multiplies the time; 1 = no adjustment). */
export function trackRecord(sessions, asOf, meters, { years = 3, applyPreparation = false } = {}) {
    const from = addDays(asOf, -365 * years);
    const band = bandOf(meters);
    const ratios = [];
    for (const r of sessions.filter(s => isRace(s) && s.date >= from && s.date <= asOf && bandOf(s.race.meters) === band)) {
        const raw = predictRace({ meters: r.race.meters, asOf: addDays(r.date, -1), sessions: sessions.filter(s => s.date < r.date), calibrate: false, applyPreparation });
        if (raw.sec) ratios.push(Math.max(0.9, Math.min(1.12, r.race.timeSec / raw.sec)));
    }
    const value = (TRACK_WEIGHT + ratios.reduce((a, b) => a + b, 0)) / (TRACK_WEIGHT + ratios.length);
    return { value, n: ratios.length, avgMiss: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length - 1 : 0 };
}

/*
 * applyPreparation: false (the default since 0.2.0) shows the preparation
 * check without changing the time; true applies the old trim to the
 * training lens and to races shorter than the target (never to COROS).
 * The backtest runs both so the athlete's own races can decide.
 */
export function predictRace({ meters, asOf, sessions = [], health = {}, fitness = {}, calibrate = true, applyPreparation = false }) {
    const past = sessions.filter(s => s.date <= asOf);
    const params = athleteParams({ sessions: past, health, asOf });
    const b = params.exponent.value;
    const lenses = [];

    // R: races of the last 12 months.
    const from = addDays(asOf, -365);
    const races = past.filter(s => isRace(s) && s.date >= from);
    const raceEsts = races.map(s => {
        const months = daysBetween(s.date, asOf) / 30.4;
        const stretch = Math.abs(Math.log(meters / s.race.meters));
        return { s, sec: move(s.race.timeSec, s.race.meters, meters, b), sigma: 0.03 + 0.005 * months + 0.015 * stretch, shorter: s.race.meters < meters * 0.9 };
    });

    // S: the fastest training effort from the mile to 10K, moved to the target.
    const speedPoints = envelope(params.efforts).filter(e => e.meters <= 12000);
    const speedEsts = speedPoints.map(e => ({ e, sec: move(e.seconds, e.meters, meters, b) })).sort((x, y) => x.sec - y.sec);
    const tf = speedEsts.length ? trainingFactor(past, asOf) : null;
    const speed = speedEsts[0] ? { ...speedEsts[0], sec: speedEsts[0].sec * tf.value } : null;

    // A: COROS's marathon prediction.
    let device = null;
    if (meters >= 40000 && meters <= 44000) {
        const day = Object.keys(fitness || {}).filter(d => d <= asOf && d >= addDays(asOf, -30) && clockSec(fitness[d]?.marathon)).sort().at(-1);
        if (day) device = { day, sec: clockSec(fitness[day].marathon) * (meters / 42195) };
    }

    // First pass (no durability) to size the durability targets.
    const first = [...raceEsts.map(r => [r.sec, r.sigma]), ...(speed ? [[speed.sec, 0.05]] : []), ...(device ? [[device.sec, 0.06]] : [])];
    if (!first.length) {
        return { version: RACE_MODEL_VERSION, asOf, meters, label: distanceLabel(meters), sec: null, lenses: [], params, durability: null, quality: { grade: "D", flags: ["No confirmed races and no training efforts yet"] }, explanation: ["Not enough to go on yet: confirm a race in Your races, or run with a watch for a few weeks."], assumptions: ASSUMPTIONS };
    }
    const w0 = first.map(([, s]) => 1 / s ** 2);
    const base = Math.exp(first.reduce((t, [sec], i) => t + Math.log(sec) * w0[i], 0) / w0.reduce((a, c) => a + c, 0));
    const dur = durability(past, asOf, meters, base);
    const pen = dur && applyPreparation ? 1 + dur.deficit : 1;
    if (dur) dur.applied = pen > 1;

    if (raceEsts.length) {
        const ws = raceEsts.map(r => 1 / r.sigma ** 2);
        const lnMean = raceEsts.reduce((t, r, i) => t + Math.log(r.sec * (r.shorter ? pen : 1)) * ws[i], 0) / ws.reduce((a, c) => a + c, 0);
        const sigma = Math.sqrt(1 / ws.reduce((a, c) => a + c, 0));
        const newest = races.slice().sort((x, y) => y.date.localeCompare(x.date))[0];
        const rawMean = raceEsts.reduce((t, r, i) => t + Math.log(r.sec) * ws[i], 0) / ws.reduce((a, c) => a + c, 0);
        lenses.push({
            key: "races", label: "Your races", sec: Math.exp(lnMean), raw: Math.exp(rawMean), sigma,
            note: `${races.length === 1 ? "From" : `${races.length} races, newest`} your ${distanceLabel(newest.race.meters)} on ${shortDate(newest.date)} (${clock(newest.race.timeSec)})`,
            adjusted: raceEsts.some(r => r.shorter) && pen > 1
        });
    }
    if (speed) {
        lenses.push({
            key: "training", label: "Your training speed", sec: speed.sec * pen, raw: speed.sec, sigma: 0.05,
            note: `Fastest ${distanceLabel(speed.e.meters)} in training (${clock(speed.e.seconds)}, ${shortDate(speed.e.date)})${speed.e.kind === "inside" ? ", inside a longer run" : ""}; ${tf.n ? `your races have run ${Math.round(Math.abs(1 - tf.value) * 100)}% ${tf.value < 1 ? "faster" : "slower"} than your training said (${tf.n} ${tf.n === 1 ? "race" : "races"})` : "assumes a race is about 3% faster than training"}`,
            adjusted: pen > 1
        });
    }
    // COROS exactly as COROS gives it (its predictor already reads the training).
    if (device) lenses.push({ key: "coros", label: "COROS", sec: device.sec, raw: device.sec, sigma: 0.06, note: `COROS's own prediction on ${shortDate(device.day)}, used as it is`, adjusted: false });

    const ws = lenses.map(l => 1 / l.sigma ** 2);
    const W = ws.reduce((a, c) => a + c, 0);
    const lnMean = lenses.reduce((t, l, i) => t + Math.log(l.sec) * ws[i], 0) / W;
    let sigma = Math.sqrt(1 / W);
    const chi2 = lenses.reduce((t, l, i) => t + ((Math.log(l.sec) - lnMean) ** 2) * ws[i], 0);
    const df = lenses.length - 1;
    const inflate = df > 0 ? Math.max(1, Math.sqrt(chi2 / df)) : 1;
    sigma *= inflate;
    const track = calibrate ? trackRecord(past, asOf, meters, { applyPreparation }) : { value: 1, n: 0, avgMiss: 0 };
    const sec = Math.exp(lnMean) * track.value;
    const lo = Math.exp(lnMean - Z80 * sigma) * track.value, hi = Math.exp(lnMean + Z80 * sigma) * track.value;
    const halfWidth = (hi - lo) / 2 / sec;
    // 80% range within ±2.5% = High, ±5% (about ±9 min on a 3-hour marathon) = Moderate.
    const confidence = halfWidth <= 0.025 ? "High" : halfWidth <= 0.05 ? "Moderate" : "Low";

    // Data quality.
    const flags = [];
    const newestRace = races.map(s => s.date).sort().at(-1);
    if (!races.length) flags.push("No confirmed race in the last 12 months");
    else if (daysBetween(newestRace, asOf) > 120) flags.push(`Newest race is ${Math.round(daysBetween(newestRace, asOf) / 30.4)} months old`);
    if (!speed) flags.push("No training efforts from the mile to 10K in 120 days");
    if (params.exponent.n === 0) flags.push("Distance exponent is Riegel's default (no race pairs yet)");
    const grade = races.length && speed && newestRace && daysBetween(newestRace, asOf) <= 120 ? "A" : lenses.length >= 2 ? "B" : "C";

    // Plain explanation.
    const explanation = [];
    if (lenses.length >= 2) {
        const sorted = lenses.slice().sort((x, y) => x.sec - y.sec);
        const spread = sorted.at(-1).sec / sorted[0].sec - 1;
        explanation.push(spread <= 0.02
            ? `The evidence agrees: ${lenses.map(l => `${l.key === "coros" ? l.label : l.label.toLowerCase()} ${clock(l.sec)}`).join(", ")}.`
            : `${sorted[0].label} say${sorted[0].key === "races" ? "" : "s"} ${clock(sorted[0].sec)}; ${sorted.at(-1).key === "coros" ? sorted.at(-1).label : sorted.at(-1).label.toLowerCase()} say${sorted.at(-1).key === "races" ? "" : "s"} ${clock(sorted.at(-1).sec)} (${Math.round(spread * 100)}% apart)${inflate > 1.05 ? ", so the range is wider" : ""}.`);
    } else explanation.push(`Only one kind of evidence so far (${lenses[0].label.toLowerCase()}), so the range is wide.`);
    if (dur) {
        const p = dur.parts;
        const Kind = dur.kind === "marathon" ? "Marathon" : "Half";
        // What a typical-sized effect would be worth (the old trim), in minutes.
        const mins = Math.round((dur.applied ? sec * dur.deficit / (1 + dur.deficit) : sec * dur.deficit) / 60);
        dur.couldCostSec = Math.round(dur.applied ? sec * dur.deficit / (1 + dur.deficit) : sec * dur.deficit);
        const facts = `${p.weekly.value} mi/week (typical ${p.weekly.target}), ${p.longRuns.value} runs of ${p.longRuns.over}+ mi (typical ${p.longRuns.target}), longest ${p.longest.value} mi (typical ${p.longest.target}) in 12 weeks`;
        explanation.push(dur.deficit < 0.001
            ? `${Kind}-specific training looks complete: ${p.weekly.value} mi/week, ${p.longRuns.value} runs of ${p.longRuns.over}+ mi, longest ${p.longest.value} mi in 12 weeks.`
            : dur.applied
                ? `${Kind}-specific training trims ${mins >= 1 ? `about ${mins} min` : "under a minute"}: ${facts}.`
                : `${Kind}-specific training is ${Math.round(dur.readiness * 100)}% of a typical plan: ${facts}. Not taken off the time: your own races haven't shown yet whether a thinner block slows you. If it does as much as is typical, it could cost ${mins >= 1 ? `up to about ${mins} min` : "under a minute"}.`);
    }
    if (track.n) {
        const word = { 0: "5K-ish", 1: "10K-ish", 2: "half-length", 3: "marathon-length" }[bandOf(meters)];
        explanation.push(Math.abs(track.value - 1) < 0.003
            ? `Your ${track.n} earlier ${word} ${track.n === 1 ? "race" : "races"} came in close to what this model said beforehand, so no adjustment.`
            : `Your ${track.n} earlier ${word} ${track.n === 1 ? "race" : "races"} ran ${Math.round(Math.abs(track.avgMiss) * 1000) / 10}% ${track.avgMiss > 0 ? "slower" : "faster"} than this model said beforehand, so it's adjusted ${Math.round(Math.abs(track.value - 1) * 1000) / 10}% ${track.value > 1 ? "slower" : "faster"} (shrunk toward none while there are few).`);
    }
    if (flags.length) explanation.push(`Range widened by: ${flags.join("; ").toLowerCase()}.`);

    return {
        version: RACE_MODEL_VERSION, asOf, meters, label: distanceLabel(meters),
        sec, lo, hi, sigma, confidence, lenses, durability: dur, params,
        exponent: b, track, quality: { grade, flags }, explanation, assumptions: ASSUMPTIONS
    };
}
