/* ==========================================
   Southbound — race capability: lenses, not an average (pure)

   Athlete model, layer 7 (docs/PERFORMANCE_ENGINE_PLAN.md 3.7). What
   could the athlete run at a distance, as of a date, with a range and
   the reason the evidence disagrees. Independent lenses only:
     R  races      confirmed all-out races in the last 12 months, each
                   moved to the target distance with the athlete's own
                   exponent; uncertainty grows with time since the race
                   and with how far the distance is stretched. Since
                   0.3.0 (audit B1) the races are not treated as
                   independent: they share the exponent's error and the
                   athlete's current form, so the lens σ keeps a shared
                   part (correlation 0.1) and stops shrinking toward zero
                   with every race added
     S  training   the fastest best effort of 1 mile to 10K in the last
                   120 days (inside Strava watch files, or whole runs),
                   moved to the target the same way, times how the
                   athlete's races have compared with their training.
                   Since 0.3.0 (B3) that factor is per distance band
                   (to 12 km / half / marathon), each shrunk toward the
                   athlete's pooled factor
     A  device     COROS's marathon prediction (marathon only), used
                   exactly as COROS gives it: its predictor already reads
                   the training, so nothing of Southbound's is applied.
                   σ 6% until 3+ marathons had a COROS number before
                   them; then COROS's own misses set it (B2)
   (Riegel and VDOT are two curve shapes on the same race, so they are
   not two lenses; VDOT is used in the backtest as a comparison.)
     P  preparation  half and marathon: weekly miles, runs of 18+ (10+)
                   miles and the longest run of the last 12 weeks against
                   the athlete's OWN usual block (the median of the 12
                   weeks before their earlier races of that kind; a
                   typical plan until there are 2). Since 0.3.0 (B4) its
                   effect is learned from the athlete's own races, once:
                   how much slower than the model they ran after thinner
                   blocks (β, prior 0 ± 8% marathon / ± 3% half, shrunk
                   toward 0). With nothing learned it's shown, not applied.
                   "trim" mode is the 0.1.0 fixed trim, kept for the backtest.
   Track record: the athlete's earlier races at the same kind of distance
   against what this model said the day before each (no later data),
   fitted together with preparation's β; the average miss, shrunk toward
   none, adjusts the result.
   Combining: precision-weighted mean of log-times (weights 1/σ²); when
   the lenses disagree more than their σ allow, the range widens
   (σ × √(χ²/df)). Since 0.3.0 (B2) the range also learns from the
   athlete's own misses at that kind of distance: σ² = (3 σ_model² +
   n σ_own²) / (3 + n), σ_own from the 80th percentile of the misses.
   80% range = ±1.28σ. Every number here is checked by
   js/raceBacktest.js on real races.
   Unit-tested in tests/raceCapability.test.mjs.
========================================== */

import { addDays, RACE_DISTANCES } from "./athleteLedger.js";
import { athleteParams, isRace, envelope } from "./athleteParams.js";

export const RACE_MODEL_VERSION = "0.3.0";
const MILE = 1609.344;
const Z80 = 1.2816;

export const ASSUMPTIONS = Object.freeze([
    "Race lens σ 3% + 0.5% per month since the race + 1.5% per unit of ln(distance ratio); several races share an error (correlation 0.1), so more races narrow it only so far",
    "Training lens σ 5%: training bests from the mile to 10K in the last 120 days, times your own race-vs-training factor for that kind of distance (to 12 km / half / marathon), shrunk toward your overall factor (prior 0.97, worth 2 races)",
    "COROS lens σ 6%, marathon only, its newest prediction within 30 days, used as COROS gives it; once 3 of your marathons had a COROS number before them, COROS's own misses set its σ",
    "Preparation (half and marathon): weekly miles, long runs and longest run in 12 weeks against your own usual block before that kind of race (a typical plan until you have 2). Its effect is learned from your races (prior 0, ± 8% marathon / ± 3% half), never assumed",
    "Distance exponent: your race pairs shrunk toward Riegel's 1.06 (prior SD 0.03)",
    "Track record: your earlier races at this kind of distance (3 years) against what the model said the day before each; shrunk toward no adjustment as if 2 races had matched",
    "Range: the model's σ blended with your own misses at this kind of distance (the model counts as 3 races)"
]);

const RACE_CORRELATION = 0.1;     // B1: races share the exponent's error and current form (0.1: 0.5 made 80% ranges hold 88–96% in the audit's simulation)
const EMPIRICAL_WEIGHT = 3;       // B2: the model's own σ counts as 3 races
const SIGMA_FLOOR = 0.01;
const COROS_SIGMA = 0.06, COROS_SIGMA_WEIGHT = 2, COROS_SIGMA_MIN = 3;
const RACE_NOISE = 0.025;         // a race's own day-to-day noise, for the track record / β fit
const TRACK_WEIGHT = 2;           // shrink toward "no adjustment" as if 2 races had matched exactly

const PREP = {
    marathon: { priorSd: 0.08, longMiles: 18, longCount: 4, longest: 20, volumeScale: 1 },
    half: { priorSd: 0.03, longMiles: 10, longCount: 4, longest: 12, volumeScale: 0.7 }
};
const prepKind = m => (m >= 40000 ? "marathon" : m >= 20000 ? "half" : null);

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
const median = a => { const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * q; const lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const round1 = x => Math.round(x * 10) / 10;

/** The 12 weeks up to `end`: weekly miles, runs of cfg.longMiles+, the longest run. */
function blockStats(sessions, end, cfg) {
    const from = addDays(end, -83);
    const miles = sessions.filter(s => s.date >= from && s.date <= end).map(s => s.distance / MILE);
    return {
        weekly: miles.reduce((a, b) => a + b, 0) / 12,
        longRuns: miles.filter(m => m >= cfg.longMiles - 0.2).length,   // GPS and rounding: an "18" is 17.9-something
        longest: miles.length ? Math.max(...miles) : 0
    };
}

/**
 * Preparation (half and up; null below): this 12-week block against the
 * athlete's own usual block before their earlier races of that kind (the
 * median of 2+ such blocks in 4 years), else a typical plan for the
 * predicted time. -> { kind, readiness, gap, basis, blocks, parts,
 *   typicalReadiness, deficit (the 0.1.0 trim, from the typical plan) }
 */
export function durability(sessions, asOf, meters, predictedSec) {
    const kind = prepKind(meters);
    if (!kind) return null;
    const cfg = PREP[kind];
    const now = blockStats(sessions, asOf, cfg);
    const marathonMin = (kind === "marathon" ? predictedSec : predictedSec * 2.1) / 60;
    const typical = { weekly: typicalWeeklyMiles(marathonMin) * cfg.volumeScale, longRuns: cfg.longCount, longest: cfg.longest };
    const earlier = sessions.filter(s => isRace(s) && prepKind(s.race.meters) === kind && s.date <= asOf && s.date >= addDays(asOf, -1461));
    const blocks = earlier.map(r => blockStats(sessions, addDays(r.date, -1), cfg)).filter(b => b.weekly > 0);
    const yours = blocks.length >= 2;
    const usual = yours
        ? { weekly: median(blocks.map(b => b.weekly)), longRuns: Math.max(1, median(blocks.map(b => b.longRuns))), longest: median(blocks.map(b => b.longest)) }
        : typical;
    const share = (v, t) => (t > 0 ? Math.min(1, v / t) : 1);
    const score = u => (share(now.weekly, u.weekly) + share(now.longRuns, u.longRuns) + share(now.longest, u.longest)) / 3;
    const readiness = score(usual);
    const typicalReadiness = score(typical);
    return {
        kind, readiness, gap: 1 - readiness, basis: yours ? "yours" : "typical", blocks: blocks.length,
        typicalReadiness, deficit: (1 - typicalReadiness) * cfg.priorSd,
        parts: {
            weekly: { value: round1(now.weekly), target: Math.round(usual.weekly) },
            longRuns: { value: now.longRuns, target: Math.round(usual.longRuns), over: cfg.longMiles },
            longest: { value: round1(now.longest), target: round1(usual.longest) }
        }
    };
}

/** Moves a time to another distance with exponent b. */
const move = (sec, fromMeters, toMeters, b) => sec * Math.pow(toMeters / fromMeters, b);

// Training bests are rarely all-out. Until the athlete's own races say how far
// off they are, assume a race is ~3% faster than the best training effort
// predicts (an assumption, checked by the backtest), counted as 2 races' worth.
export const TRAINING_FACTOR_PRIOR = 0.97;
const TRAINING_FACTOR_WEIGHT = 2;
const TF_BAND_WEIGHT = 6;          // B3: a band's own races count against the pooled factor as if 6 races matched it
// B3: a 5K's race-vs-training ratio isn't a marathon's. Three bands, each shrunk to the pooled factor.
const TF_BANDS = [[0, 12000, "short"], [12000, 30000, "half"], [30000, 1e9, "marathon"]];
const tfBand = m => TF_BANDS.findIndex(([lo, hi]) => m >= lo && m < hi);

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
 * before each one: actual ÷ training lens. Pooled over every race, shrunk
 * toward 0.97; with `meters`, the races of that band (to 12 km / half /
 * marathon) shrunk toward the pooled value.
 * -> { value, n (races behind value), pooled, pooledN, band }
 */
export function trainingFactor(sessions, asOf, { days = 730, meters } = {}) {
    const from = addDays(asOf, -days);
    const ratios = [];
    for (const r of sessions.filter(s => isRace(s) && s.date >= from && s.date <= asOf)) {
        const before = sessions.filter(s => s.date < r.date);
        const est = rawTraining(before, addDays(r.date, -1), r.race.meters);
        if (est) ratios.push({ meters: r.race.meters, ratio: Math.max(0.85, Math.min(1.1, r.race.timeSec / est.sec)) });
    }
    const sum = a => a.reduce((t, x) => t + x.ratio, 0);
    const pooled = (TRAINING_FACTOR_PRIOR * TRAINING_FACTOR_WEIGHT + sum(ratios)) / (TRAINING_FACTOR_WEIGHT + ratios.length);
    if (meters == null) return { value: pooled, n: ratios.length, pooled, pooledN: ratios.length, band: null };
    const band = tfBand(meters);
    const own = ratios.filter(x => tfBand(x.meters) === band);
    const value = (pooled * TF_BAND_WEIGHT + sum(own)) / (TF_BAND_WEIGHT + own.length);
    return { value, n: own.length, pooled, pooledN: ratios.length, band: TF_BANDS[band][2] };
}

// The athlete's own track record at this kind of distance: how their earlier
// races compared with what this model said the day before each one.
const BANDS = [[0, 6000], [6000, 12000], [12000, 30000], [30000, 1e9]];
const bandOf = m => BANDS.findIndex(([lo, hi]) => m >= lo && m < hi);

/**
 * y = ln(actual / the model the day before) for each earlier race at this
 * kind of distance, fitted as y = a + β · gap (gap = 1 − preparation, half
 * and marathon only, β only when preparation is learned), with priors
 * a ~ N(0, noise²/2) (as if 2 races had matched) and β ~ N(0, priorSd²)
 * (B4), so both shrink toward none with few races. The misses left after
 * the fit are the athlete's own error record (B2).
 * -> { value (= e^a, multiplies the time), n, avgMiss, beta, betaVar,
 *      prepN, residuals, sigmaOwn, within }
 */
export function trackRecord(sessions, asOf, meters, { years = 3, preparation = "learned" } = {}) {
    const from = addDays(asOf, -365 * years);
    const band = bandOf(meters);
    const kind = prepKind(meters);
    const learn = preparation === "learned" && kind;
    const rows = [];
    for (const r of sessions.filter(s => isRace(s) && s.date >= from && s.date <= asOf && bandOf(s.race.meters) === band)) {
        const raw = predictRace({ meters: r.race.meters, asOf: addDays(r.date, -1), sessions: sessions.filter(s => s.date < r.date), calibrate: false, preparation: preparation === "trim" ? "trim" : "off" });
        if (!raw.sec) continue;
        const ratio = Math.max(0.9, Math.min(1.12, r.race.timeSec / raw.sec));
        rows.push({ y: Math.log(ratio), ratio, x: learn && raw.durability ? raw.durability.gap : 0 });
    }
    const n = rows.length;
    // 2×2 Bayesian ridge: precision P = XᵀX/s² + prior precisions; mean = P⁻¹ Xᵀy/s².
    const s2 = RACE_NOISE ** 2, pa = TRACK_WEIGHT / s2, pb = learn ? 1 / PREP[kind].priorSd ** 2 : Infinity;
    const Sx = rows.reduce((t, r) => t + r.x, 0), Sxx = rows.reduce((t, r) => t + r.x * r.x, 0);
    const Sy = rows.reduce((t, r) => t + r.y, 0), Sxy = rows.reduce((t, r) => t + r.x * r.y, 0);
    let a, beta = 0, betaVar = 0;
    if (!learn || Sxx < 1e-9) a = Sy / (n + TRACK_WEIGHT);
    else {
        const P11 = n / s2 + pa, P12 = Sx / s2, P22 = Sxx / s2 + pb, det = P11 * P22 - P12 * P12;
        a = (P22 * Sy / s2 - P12 * Sxy / s2) / det;
        beta = (P11 * Sxy / s2 - P12 * Sy / s2) / det;
        betaVar = P11 / det;
    }
    const residuals = rows.map(r => r.y - a - beta * r.x);
    const abs = residuals.map(Math.abs);
    return {
        value: Math.exp(a), n, avgMiss: n ? rows.reduce((t, r) => t + r.ratio, 0) / n - 1 : 0,
        beta, betaVar, prepN: rows.filter(r => r.x > 0.02).length,
        residuals, sigmaOwn: n ? quantile(abs, 0.8) / Z80 : null, within: n ? Math.max(...abs) : null
    };
}

/** COROS's own record: its prediction (≤ 30 days before) against each earlier marathon. -> { n, sigma } */
export function corosRecord(sessions, fitness = {}, asOf) {
    const days = Object.keys(fitness || {}).filter(d => clockSec(fitness[d]?.marathon)).sort();
    const errs = [];
    for (const r of sessions.filter(s => isRace(s) && s.date <= asOf && s.race.meters >= 40000 && s.race.meters <= 44000)) {
        const day = days.filter(d => d < r.date && d >= addDays(r.date, -30)).at(-1);
        if (day) errs.push(Math.log(clockSec(fitness[day].marathon) * (r.race.meters / 42195) / r.race.timeSec));
    }
    const n = errs.length;
    const sigma = n >= COROS_SIGMA_MIN ? Math.sqrt((COROS_SIGMA_WEIGHT * COROS_SIGMA ** 2 + errs.reduce((t, e) => t + e * e, 0)) / (COROS_SIGMA_WEIGHT + n)) : COROS_SIGMA;
    return { n, sigma };
}

/*
 * What the athlete could run at `meters`, as of `asOf`.
 * sessions: the ledger (js/athleteLedger.js); health / fitness: COROS days.
 * Only data dated asOf or earlier is used.
 * preparation: "learned" (default, 0.3.0: its effect learned from the
 *   athlete's own races, applied once to the final time), "off" (shown,
 *   never applied: 0.2.0) or "trim" (the 0.1.0 fixed trim on the training
 *   lens and shorter races, from a typical plan; never COROS). The
 *   backtest runs all three so the athlete's own races can decide.
 *   (applyPreparation: true is the old name for "trim".)
 */
export function predictRace({ meters, asOf, sessions = [], health = {}, fitness = {}, calibrate = true, preparation = "learned", applyPreparation = false }) {
    if (applyPreparation) preparation = "trim";
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
    const tf = speedEsts.length ? trainingFactor(past, asOf, { meters }) : null;
    const speed = speedEsts[0] ? { ...speedEsts[0], sec: speedEsts[0].sec * tf.value } : null;

    // A: COROS's marathon prediction, σ from its own misses once there are enough.
    let device = null;
    if (meters >= 40000 && meters <= 44000) {
        const day = Object.keys(fitness || {}).filter(d => d <= asOf && d >= addDays(asOf, -30) && clockSec(fitness[d]?.marathon)).sort().at(-1);
        if (day) device = { day, sec: clockSec(fitness[day].marathon) * (meters / 42195), record: corosRecord(past, fitness, asOf) };
    }

    // B1: races share an error, so the lens σ keeps a shared part: σ² = (1 − ρ)/Σw + ρ σ̄².
    let raceSigma = null;
    if (raceEsts.length) {
        const W = raceEsts.reduce((t, r) => t + 1 / r.sigma ** 2, 0);
        const mean = raceEsts.reduce((t, r) => t + r.sigma, 0) / raceEsts.length;
        raceSigma = Math.sqrt((1 - RACE_CORRELATION) / W + RACE_CORRELATION * mean ** 2);
    }

    // First pass (no preparation) to size the typical targets.
    const first = [...(raceEsts.length ? [[Math.exp(raceEsts.reduce((t, r) => t + Math.log(r.sec) / r.sigma ** 2, 0) / raceEsts.reduce((t, r) => t + 1 / r.sigma ** 2, 0)), raceSigma]] : []), ...(speed ? [[speed.sec, 0.05]] : []), ...(device ? [[device.sec, device.record.sigma]] : [])];
    if (!first.length) {
        return { version: RACE_MODEL_VERSION, asOf, meters, label: distanceLabel(meters), sec: null, lenses: [], params, durability: null, quality: { grade: "D", flags: ["No confirmed races and no training efforts yet"] }, explanation: ["Not enough to go on yet: confirm a race in Your races, or run with a watch for a few weeks."], assumptions: ASSUMPTIONS };
    }
    const w0 = first.map(([, s]) => 1 / s ** 2);
    const base = Math.exp(first.reduce((t, [sec], i) => t + Math.log(sec) * w0[i], 0) / w0.reduce((a, c) => a + c, 0));
    const dur = durability(past, asOf, meters, base);
    const pen = dur && preparation === "trim" ? 1 + dur.deficit : 1;

    if (raceEsts.length) {
        const ws = raceEsts.map(r => 1 / r.sigma ** 2);
        const lnMean = raceEsts.reduce((t, r, i) => t + Math.log(r.sec * (r.shorter ? pen : 1)) * ws[i], 0) / ws.reduce((a, c) => a + c, 0);
        const newest = races.slice().sort((x, y) => y.date.localeCompare(x.date))[0];
        const rawMean = raceEsts.reduce((t, r, i) => t + Math.log(r.sec) * ws[i], 0) / ws.reduce((a, c) => a + c, 0);
        lenses.push({
            key: "races", label: "Your races", sec: Math.exp(lnMean), raw: Math.exp(rawMean), sigma: raceSigma,
            note: `${races.length === 1 ? "From" : `${races.length} races, newest`} your ${distanceLabel(newest.race.meters)} on ${shortDate(newest.date)} (${clock(newest.race.timeSec)})`,
            adjusted: raceEsts.some(r => r.shorter) && pen > 1
        });
    }
    if (speed) {
        const bandWord = { short: "races up to 10K", half: "half-length races", marathon: "marathon-length races" }[tf.band];
        const said = tf.n
            ? `your ${bandWord} have run ${Math.round(Math.abs(1 - tf.value) * 100)}% ${tf.value < 1 ? "faster" : "slower"} than your training said (${tf.n} ${tf.n === 1 ? "race" : "races"}${tf.pooledN > tf.n ? `, leaning on all ${tf.pooledN}` : ""})`
            : tf.pooledN
                ? `no ${bandWord} to compare yet, so your races overall: ${Math.round(Math.abs(1 - tf.value) * 100)}% ${tf.value < 1 ? "faster" : "slower"} than your training said (${tf.pooledN} ${tf.pooledN === 1 ? "race" : "races"})`
                : "assumes a race is about 3% faster than training";
        lenses.push({
            key: "training", label: "Your training speed", sec: speed.sec * pen, raw: speed.sec, sigma: 0.05,
            note: `Fastest ${distanceLabel(speed.e.meters)} in training (${clock(speed.e.seconds)}, ${shortDate(speed.e.date)})${speed.e.kind === "inside" ? ", inside a longer run" : ""}; ${said}`,
            adjusted: pen > 1
        });
    }
    // COROS exactly as COROS gives it (its predictor already reads the training).
    if (device) {
        const own = device.record.n >= COROS_SIGMA_MIN;
        lenses.push({ key: "coros", label: "COROS", sec: device.sec, raw: device.sec, sigma: device.record.sigma, note: `COROS's own prediction on ${shortDate(device.day)}, used as it is${own ? `; ± from its misses on your ${device.record.n} marathons` : ""}`, adjusted: false });
    }

    const ws = lenses.map(l => 1 / l.sigma ** 2);
    const W = ws.reduce((a, c) => a + c, 0);
    const lnMean = lenses.reduce((t, l, i) => t + Math.log(l.sec) * ws[i], 0) / W;
    let sigma = Math.sqrt(1 / W);
    const chi2 = lenses.reduce((t, l, i) => t + ((Math.log(l.sec) - lnMean) ** 2) * ws[i], 0);
    const df = lenses.length - 1;
    const inflate = df > 0 ? Math.max(1, Math.sqrt(chi2 / df)) : 1;
    sigma *= inflate;
    const modelSigma = sigma;

    const track = calibrate ? trackRecord(past, asOf, meters, { preparation }) : { value: 1, n: 0, avgMiss: 0, beta: 0, betaVar: 0, prepN: 0, residuals: [], sigmaOwn: null, within: null };
    // B4: preparation learned from the athlete's own races, applied once. A thinner
    // block can only cost time (β < 0 would say it makes you faster: noise).
    let prepEffect = 0;
    if (dur) {
        dur.beta = Math.max(0, track.beta);
        dur.learnedFrom = track.prepN;
        prepEffect = preparation === "learned" ? dur.beta * dur.gap : 0;
        dur.applied = preparation === "trim" ? pen > 1 : prepEffect >= 0.002;
        if (preparation === "learned") sigma = Math.sqrt(sigma ** 2 + dur.gap ** 2 * track.betaVar);
    }
    // B2: the range learns from the athlete's own misses at this kind of distance.
    if (track.n) sigma = Math.sqrt((EMPIRICAL_WEIGHT * sigma ** 2 + track.n * track.sigmaOwn ** 2) / (EMPIRICAL_WEIGHT + track.n));
    sigma = Math.max(SIGMA_FLOOR, sigma);

    const adjust = track.value * Math.exp(prepEffect);
    const sec = Math.exp(lnMean) * adjust;
    const lo = Math.exp(lnMean - Z80 * sigma) * adjust, hi = Math.exp(lnMean + Z80 * sigma) * adjust;
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
    const word = { 0: "5K-ish", 1: "10K-ish", 2: "half-length", 3: "marathon-length" }[bandOf(meters)];
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
        const kindWord = dur.kind === "marathon" ? "marathon" : "half";
        const Kind = dur.kind === "marathon" ? "Marathon" : "Half";
        const against = dur.basis === "yours" ? `your usual ${kindWord} block (from your ${dur.blocks} earlier ${dur.blocks === 1 ? kindWord : `${kindWord}s`})` : `a typical plan (fewer than 2 earlier ${kindWord}s of yours to compare with)`;
        const usualWord = dur.basis === "yours" ? "usual" : "typical";
        const facts = `${p.weekly.value} mi/week (${usualWord} ${p.weekly.target}), ${p.longRuns.value} runs of ${p.longRuns.over}+ mi (${usualWord} ${p.longRuns.target}), longest ${p.longest.value} mi (${usualWord} ${p.longest.target}) in 12 weeks`;
        // What a typical-sized effect would cost (the prior's range), in seconds.
        dur.couldCostSec = Math.round(Math.exp(lnMean) * track.value * PREP[dur.kind].priorSd * dur.gap);
        if (dur.applied) dur.effectSec = Math.round(preparation === "trim" ? sec * dur.deficit / (1 + dur.deficit) : sec - sec / Math.exp(prepEffect));
        const mins = s => (s >= 60 ? `about ${Math.round(s / 60)} min` : "under a minute");
        if (dur.gap < 0.001) explanation.push(`${Kind}-specific training is all there against ${against}: ${p.weekly.value} mi/week, ${p.longRuns.value} runs of ${p.longRuns.over}+ mi, longest ${p.longest.value} mi in 12 weeks.`);
        else if (dur.applied && preparation === "trim") explanation.push(`${Kind}-specific training trims ${mins(dur.effectSec)} (the fixed 0.1.0 trim): ${facts}.`);
        else if (dur.applied) explanation.push(`${Kind}-specific training is ${Math.round(dur.readiness * 100)}% of ${against}: ${facts}. Your ${dur.learnedFrom} earlier ${kindWord}s after thinner blocks ran slower than the model said, so this adds ${mins(dur.effectSec)}.`);
        else explanation.push(`${Kind}-specific training is ${Math.round(dur.readiness * 100)}% of ${against}: ${facts}. Not taken off the time: ${dur.learnedFrom ? `your ${dur.learnedFrom} earlier ${kindWord}${dur.learnedFrom === 1 ? "" : "s"} after thinner blocks haven't shown it slows you` : "your own races haven't shown yet whether a thinner block slows you"}. If it does as much as is typical, it could cost ${dur.couldCostSec >= 60 ? `up to ${mins(dur.couldCostSec)}` : "under a minute"}.`);
    }
    if (track.n) {
        explanation.push(Math.abs(track.value - 1) < 0.003
            ? `Your ${track.n} earlier ${word} ${track.n === 1 ? "race" : "races"} came in close to what this model said beforehand, so no adjustment.`
            : `Your ${track.n} earlier ${word} ${track.n === 1 ? "race" : "races"} ran ${Math.round(Math.abs(track.avgMiss) * 1000) / 10}% ${track.avgMiss > 0 ? "slower" : "faster"} than this model said beforehand, so it's adjusted ${Math.round(Math.abs(track.value - 1) * 1000) / 10}% ${track.value > 1 ? "slower" : "faster"} (shrunk toward none while there are few).`);
        explanation.push(`The range uses your own record too: after that, your ${track.n === 1 ? "earlier race" : `${track.n} earlier races`} at this distance landed within ${(track.within * 100).toFixed(1)}% of the model (the model counts as 3 races until you have more).`);
    }
    if (flags.length) explanation.push(`Range widened by: ${flags.join("; ").toLowerCase()}.`);

    return {
        version: RACE_MODEL_VERSION, asOf, meters, label: distanceLabel(meters),
        sec, lo, hi, sigma, modelSigma, confidence, lenses, durability: dur, params,
        exponent: b, track, preparation, quality: { grade, flags }, explanation, assumptions: ASSUMPTIONS
    };
}
