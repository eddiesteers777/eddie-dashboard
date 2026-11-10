/* ==========================================
   Southbound — the marathon engine (pure)

   Builds a whole marathon plan from a runner's answers, by the rules in
   docs/MARATHON_RULES.md (Eddie's rulebook, 2026-11-10). Every number the
   plan uses is in RULES below, so it can be read and changed in one place.

     checkSettings(settings)        -> problems that stop a plan ([] when fine)
     fitnessFrom(settings)          -> where the paces come from, and the goal check
     pacesFrom(fitness)             -> pace ranges per effort (per mile) or null
     generateMarathonPlan(settings) -> { settings, fitness, paces, weeks, benchmarks, warnings, summary }

   The rules, in short:
     - 4-week blocks, one stimulus each; the last week of a block is a down week
     - the last block is the peak week plus the taper (the taper is its down week)
     - mileage comes from what the runner does now and their ramp, never from the goal
     - a speed workout early in the week and/or a long run workout on the weekend
     - long run: 20 miles or 3 hours, whichever comes first
     - the same 800s session early and late, to measure progress
     - race week: 3 x 1 mile at race pace, about five days out
   Days use the coach plan's own shape ({ date, day, type, miles, session,
   workout }) and workouts are js/runWorkout.js workouts, so a later step
   can hand a plan straight to the plan editor.

   This file only drafts a plan. Nothing here saves or publishes one.
   Unit-tested in tests/marathonEngine.test.mjs.
========================================== */

import { vdotFromRace, timeForVdot, velocityAtVo2 } from "./vdot.js";
import { sanitizeWorkout } from "./runWorkout.js";
import { addDays, mondayOf } from "./coachingPlanModel.js";

export const ENGINE_VERSION = "0.1.0";
export const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const METERS_PER_MILE = 1609.344;

// The two race distances (docs/MARATHON_RULES.md, "Half marathon"). The marathon numbers are the originals.
export const DISTANCES = Object.freeze({
    MARATHON: { key: "MARATHON", label: "marathon", meters: 42195, miles: 26.2, effort: "marathon", longCapMiles: 20, longCapMinutes: 180, capText: "3-hour",
        minWeeks: 8, maxWeeks: 30, typical: 16, quick: 12, taperWeeks: 3, taperShort: 12, taperMiles: [0.8, 0.6], taperLong: [0.65, 0.45], minLongTarget: 8, tiers: {} },
    HALF: { key: "HALF", label: "half marathon", meters: 21097.5, miles: 13.1, effort: "half marathon", longCapMiles: 10, longCapMinutes: 150, capText: "2:30",
        minWeeks: 8, maxWeeks: 20, typical: 12, quick: 10, taperWeeks: 3, taperShort: 10, taperMiles: [0.75, 0.55], taperLong: [0.85, 0.7], minLongTarget: 5,
        tiers: { CAREFUL: { floor: 22, ceiling: 28 }, NORMAL: { floor: 26, ceiling: 40 }, EXPERIENCED: { floor: 30, ceiling: 60 } } },
    // 5K and 10K: five levels (RULES.shortTiers), a second quality day, a lower long-run share.
    "10K": { key: "10K", label: "10K", meters: 10000, miles: 6.2, effort: "10K", short: true, longCapMiles: 14, longCapMinutes: 110, capText: "110-minute",
        minWeeks: 8, maxWeeks: 24, typical: 10, quick: 10, taperWeeks: 3, taperShort: 10, taperMiles: [0.8, 0.6], taperLong: [0.7, 0.5], minLongTarget: 4,
        longShare: { 3: 0.4, 4: 0.35, 5: 0.3, 6: 0.3, 7: 0.3 },
        tiers: { BEGINNER: { ceiling: 30 }, INTERMEDIATE: { ceiling: 45 }, ADVANCED: { ceiling: 60 }, COMPETITIVE: { ceiling: 75 } } },
    "5K": { key: "5K", label: "5K", meters: 5000, miles: 3.1, effort: "5K", short: true, longCapMiles: 12, longCapMinutes: 100, capText: "100-minute",
        minWeeks: 8, maxWeeks: 24, typical: 10, quick: 10, taperWeeks: 3, taperShort: 10, taperMiles: [0.8, 0.6], taperLong: [0.7, 0.5], minLongTarget: 4,
        longShare: { 3: 0.4, 4: 0.35, 5: 0.3, 6: 0.3, 7: 0.3 }, tiers: {} }
});
const distanceOf = input => DISTANCES[[input?.distance, input?.raceType].find(k => DISTANCES[k]) || "MARATHON"];
const tierSet = D => (D.short ? RULES.shortTiers : RULES.tiers);
const tierFor = (s, D) => ({ ...tierSet(D)[s.tier], ...(D.tiers[s.tier] || {}) });
const SHORT_ORDER = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "COMPETITIVE", "ELITE"];
const shortLevel = miles => (miles < 15 ? "BEGINNER" : miles < 30 ? "INTERMEDIATE" : miles < 50 ? "ADVANCED" : miles < 65 ? "COMPETITIVE" : "ELITE");

export const RULES = Object.freeze({
    minWeeks: 8,
    maxWeeks: 30,
    blockWeeks: 4,
    taperWeeks: 3,                      // 2 when the plan is under 12 weeks
    taperMiles: [0.8, 0.6],             // share of the biggest week (race week is set by its own days)
    taperLong: [0.65, 0.45],            // share of the longest long run
    longCapMiles: 20,
    longCapMinutes: 180,
    longShare: { 3: 0.5, 4: 0.5, 5: 0.45, 6: 0.4, 7: 0.4 },   // most of the week the long run may be
    downLong: 0.7,                      // a down week's long run
    downReps: 2 / 3,                    // a down week's speed session
    stepMin: 1,                         // miles: the least and most one up week adds
    stepMax: 5,
    minEasy: 2,                         // an easy run shorter than this is a rest day
    goalStretch: 0.03,                  // goal faster than fitness by more than this: paces follow fitness
    benchmarkGapWeeks: 6,
    bothFromMiles: 25,                  // under this a week: one key session a week               // the two 800s days are at least this far apart
    tiers: {
        CAREFUL: { label: "Careful", ramp: 0.06, pattern: ["up", "hold", "up"], down: 0.25, peakFactor: 1.4, floor: 32, ceiling: 40, longStep: 1, mpShare: 0.35, reps800: 8, rest800: 120, key: "ALTERNATE", easyCap: 8, warm: 1, cool: 1 },
        NORMAL: { label: "Normal", ramp: 0.08, pattern: ["up", "up", "up"], down: 0.2, peakFactor: 1.5, floor: 36, ceiling: 60, longStep: 1.5, mpShare: 0.5, reps800: 8, rest800: 90, key: "BOTH", easyCap: 10, warm: 1.5, cool: 1 },
        EXPERIENCED: { label: "Experienced", ramp: 0.1, pattern: ["up", "up", "up"], down: 0.15, peakFactor: 1.35, floor: 40, ceiling: 90, longStep: 2, mpShare: 0.6, reps800: 10, rest800: 90, key: "BOTH", easyCap: 12, warm: 2, cool: 1.5 }
    },
    // The five levels for the 5K and 10K (docs/MARATHON_RULES.md, "5K and 10K"). `second` = a second quality day each week.
    shortTiers: {
        BEGINNER: { label: "Beginner", ramp: 0.06, pattern: ["up", "hold", "up"], down: 0.25, peakFactor: 1.4, floor: 20, ceiling: 25, mpShare: 0.3, reps800: 6, rest800: 120, key: "ALTERNATE", second: false, easyCap: 5, warm: 1, cool: 1 },
        INTERMEDIATE: { label: "Intermediate", ramp: 0.08, pattern: ["up", "up", "up"], down: 0.2, peakFactor: 1.45, floor: 28, ceiling: 40, mpShare: 0.3, reps800: 8, rest800: 120, key: "ALTERNATE", second: false, easyCap: 6, warm: 1, cool: 1 },
        ADVANCED: { label: "Advanced", ramp: 0.09, pattern: ["up", "up", "up"], down: 0.2, peakFactor: 1.4, floor: 40, ceiling: 55, mpShare: 0.3, reps800: 8, rest800: 90, key: "BOTH", second: true, easyCap: 8, warm: 1.5, cool: 1 },
        COMPETITIVE: { label: "Competitive", ramp: 0.1, pattern: ["up", "up", "up"], down: 0.15, peakFactor: 1.3, floor: 55, ceiling: 70, mpShare: 0.3, reps800: 10, rest800: 90, key: "BOTH", second: true, easyCap: 9, warm: 1.5, cool: 1.5 },
        ELITE: { label: "Elite high school", ramp: 0.1, pattern: ["up", "up", "up"], down: 0.15, peakFactor: 1.25, floor: 70, ceiling: 85, mpShare: 0.3, reps800: 10, rest800: 90, key: "BOTH", second: true, easyCap: 10, warm: 2, cool: 1.5 }
    }
});

// ---------- small helpers ----------

const roundHalf = n => Math.round(n * 2) / 2;
const floorHalf = n => Math.floor(n * 2 + 1e-9) / 2;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const mmss = sec => { const s = Math.round(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const dayGap = (a, b) => { const d = Math.abs(CODES.indexOf(a) - CODES.indexOf(b)); return Math.min(d, 7 - d); };

/** "3:30:00" or "3:30" (hours:minutes) -> seconds; junk -> 0. */
export function clockSeconds(text) {
    const m = String(text || "").trim().match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : 0;
}

// ---------- settings ----------

/** Fills in what wasn't given, by the rules. Never throws. */
export function normalize(input = {}) {
    const s = { ...input };
    s.runDays = CODES.filter(c => (input.runDays || []).includes(c));
    s.currentMiles = Math.max(0, Number(input.currentMiles) || 0);
    s.longestRun = Math.max(0, Number(input.longestRun) || 0);
    s.injuryHistory = Boolean(input.injuryHistory);
    const D = distanceOf(input);
    s.distance = D.key;
    const asked = tierSet(D)[input.tier] ? input.tier : null;
    if (D.short) {
        // Five levels by weekly miles; injury history steps one level down.
        const level = asked || shortLevel(s.currentMiles);
        s.tier = s.injuryHistory ? SHORT_ORDER[Math.max(0, SHORT_ORDER.indexOf(level) - 1)] : level;
    } else {
        s.tier = s.injuryHistory ? "CAREFUL" : asked || (s.currentMiles >= 45 ? "EXPERIENCED" : "NORMAL");
    }
    s.firstMarathon = Boolean(input.firstMarathon);
    const tier = tierFor(s, D);
    s.longRunDay = s.runDays.includes(input.longRunDay) ? input.longRunDay
        : s.runDays.includes("SUN") ? "SUN" : s.runDays.includes("SAT") ? "SAT" : s.runDays.at(-1) || "SUN";
    s.speedDay = pickSpeedDay(s.runDays, s.longRunDay, input.speedDay);
    // Newer and low-mileage runners get one key session a week unless the coach says otherwise.
    s.keySessions = ["BOTH", "ALTERNATE"].includes(input.keySessions) ? input.keySessions
        : D.short ? tier.key
        : s.firstMarathon || s.currentMiles < RULES.bothFromMiles ? "ALTERNATE" : tier.key;
    s.secondDay = D.short && tier.second && s.keySessions === "BOTH" ? pickSecondDay(s.runDays, s.longRunDay, s.speedDay) : null;
    s.timeTrial = input.timeTrial === "MILE" || input.timeTrial === "3200" ? input.timeTrial : "";
    s.tuneUps = (Array.isArray(input.tuneUps) ? input.tuneUps : []).filter(d => ISO.test(String(d))).map(String).sort();
    s.reps800 = clamp(Math.round(Number(input.reps800) || tier.reps800), 4, 12);
    s.rest800 = clamp(Math.round((Number(input.rest800) || tier.rest800) / 30) * 30, 60, 180);
    // The coach's peak: the most miles in one week the plan builds to, and the long run it ends on.
    s.peakMiles = Number(input.peakMiles) > 0 ? clamp(Math.round(Number(input.peakMiles)), 10, 120) : 0;
    // Not set by the coach: the marathon and half aim for their cap; a 5K or 10K runner for what their level calls for.
    const autoLong = D.short ? Math.min(D.longCapMiles, { BEGINNER: 6, INTERMEDIATE: 8, ADVANCED: 10, COMPETITIVE: 12, ELITE: 12 }[s.tier] + (D.key === "10K" ? 2 : 0)) : D.longCapMiles;
    s.longAsked = Number(input.longTarget) > 0;
    s.longTarget = Number(input.longTarget) > 0 ? clamp(Math.round(Number(input.longTarget) * 2) / 2, D.minLongTarget, D.longCapMiles) : autoLong;
    return s;
}

// The second quality day: a run day as far as it can be from the speed day and the long run.
function pickSecondDay(runDays, longDay, speedDay) {
    const open = runDays.filter(c => c !== longDay && c !== speedDay);
    if (!open.length || !speedDay) return null;
    const score = c => Math.min(dayGap(c, speedDay), dayGap(c, longDay));
    const order = ["THU", "FRI", "WED", "SAT", "MON", "TUE", "SUN"];
    return open.slice().sort((a, b) => score(b) - score(a) || order.indexOf(a) - order.indexOf(b))[0];
}

// The speed day: early in the week, never next to the long run when there's a choice.
function pickSpeedDay(runDays, longDay, asked) {
    const open = runDays.filter(c => c !== longDay);
    if (open.includes(asked)) return asked;
    const clear = open.filter(c => dayGap(c, longDay) >= 2);
    const order = ["TUE", "WED", "MON", "THU", "FRI", "SAT", "SUN"];
    return order.find(c => clear.includes(c)) || order.find(c => open.includes(c)) || null;
}

/** Problems that stop a plan, in plain words ([] when fine). */
export function checkSettings(input = {}) {
    const out = [];
    const s = normalize(input);
    if (!ISO.test(s.startDate || "")) out.push("Pick a start date.");
    if (!ISO.test(s.raceDate || "")) out.push("Pick the race date.");
    if (s.runDays.length < 3) out.push("Pick at least three run days.");
    if (!(s.currentMiles > 0)) out.push("Enter the miles they run in a week now.");
    if (ISO.test(s.startDate || "") && ISO.test(s.raceDate || "")) {
        const D = DISTANCES[s.distance];
        const weeks = Math.floor(daysBetween(mondayOf(s.startDate), mondayOf(s.raceDate)) / 7) + 1;
        if (weeks < D.minWeeks) out.push(`A ${D.label} plan needs at least ${D.minWeeks} weeks. This one has ${Math.max(0, weeks)}.`);
        if (weeks > D.maxWeeks) out.push(`The plan can be at most ${D.maxWeeks} weeks. Start it later, or build a base first.`);
    }
    if (s.recentRace && !(Number(s.recentRace.meters) >= 1500 && Number(s.recentRace.seconds) > 0)) out.push("The recent race needs a distance and a time.");
    return out;
}

/** A goal time in seconds. "3:30" is hours:minutes for a marathon or half, minutes:seconds for a 5K or 10K. */
export function goalSecondsFor(distance, text) {
    const D = typeof distance === "string" ? (DISTANCES[distance] || DISTANCES.MARATHON) : distance;
    const parts = String(text || "").trim().split(":");
    if (D.short && parts.length === 2 && parts.every(x => /^\d{1,2}$/.test(x)) && Number(parts[1]) < 60) return Number(parts[0]) * 60 + Number(parts[1]);
    return clockSeconds(text);
}

// ---------- fitness and paces ----------

/**
 * Where the paces come from. A recent race wins over a goal time; the goal
 * is checked against it. -> { vdot, source, predictedSec, goalSec, gap, mpSec, mpFrom }
 * gap > 0 means the goal is faster than the recent race suggests.
 */
export function fitnessFrom(input = {}) {
    const D = distanceOf(input);
    const goalSec = goalSecondsFor(D, input.goalTime);
    const race = input.recentRace && Number(input.recentRace.meters) >= 1500 && Number(input.recentRace.seconds) > 0 ? input.recentRace : null;
    if (race) {
        const vdot = vdotFromRace(Number(race.meters), Number(race.seconds));
        const predictedSec = timeForVdot(vdot, D.meters);
        const gap = goalSec ? (predictedSec - goalSec) / predictedSec : 0;
        const useGoal = goalSec > 0 && gap <= RULES.goalStretch;
        return { vdot, source: "recent race", predictedSec, goalSec, gap, raceMeters: D.meters, mpSec: (useGoal ? goalSec : predictedSec) / D.miles, mpFrom: useGoal ? "goal" : "fitness" };
    }
    if (goalSec) {
        return { vdot: vdotFromRace(D.meters, goalSec), source: "goal time", predictedSec: 0, goalSec, gap: 0, raceMeters: D.meters, mpSec: goalSec / D.miles, mpFrom: "goal" };
    }
    return { vdot: 0, source: null, predictedSec: 0, goalSec: 0, gap: 0, raceMeters: D.meters, mpSec: 0, mpFrom: null };
}

// Seconds per mile at each effort (one number each, plus the easy range).
function paceSeconds(fitness) {
    const { vdot } = fitness;
    if (!vdot) return null;
    const racePace = meters => timeForVdot(vdot, meters) / (meters / METERS_PER_MILE);
    // The plan's own distance runs at its race pace (goal-aware); the others come from fitness.
    const at = meters => (fitness.raceMeters === meters && fitness.mpSec ? fitness.mpSec : racePace(meters));
    // Threshold: the pace of a race that lasts an hour.
    let lo = 5000, hi = 30000;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (timeForVdot(vdot, mid) < 3600) lo = mid; else hi = mid; }
    const easyAt = share => METERS_PER_MILE / velocityAtVo2(vdot * share) * 60;
    return {
        easyFast: easyAt(0.72), easySlow: easyAt(0.62),
        // mpSec is the race pace of the plan's own distance; the other one comes from fitness.
        marathon: at(42195), half: at(21097.5), threshold: 3600 / (lo / METERS_PER_MILE),
        tenK: at(10000), fiveK: at(5000), threeK: racePace(3000), mile: racePace(METERS_PER_MILE)
    };
}

/** Pace ranges per effort, per mile ("7:05-7:15"), or null with nothing to go on. */
export function pacesFrom(fitness) {
    const p = paceSeconds(fitness);
    if (!p) return null;
    const around = sec => `${mmss(sec - 5)}-${mmss(sec + 5)}`;
    return {
        easy: `${mmss(p.easyFast)}-${mmss(p.easySlow)}`,
        steady: `${mmss(p.marathon + 15)}-${mmss(p.marathon + 30)}`,
        marathon: around(p.marathon),
        "half marathon": around(p.half),
        threshold: around(p.threshold),
        "10K": around(p.tenK),
        "5K": around(p.fiveK),
        "3K": around(p.threeK),
        mile: around(p.mile),
        "800s": `${mmss(p.fiveK)}-${mmss(p.tenK)}`
    };
}

// Minutes per mile for sizing a timed step (a guess when there are no paces).
const DEFAULT_MIN_PER_MILE = { easy: 10, steady: 9, marathon: 8.5, "half marathon": 8, threshold: 7.75, "10K": 7.5, "5K": 7.25, "3K": 7, mile: 6.5, "800s": 7.25 };
function minutesPerMile(effort, p) {
    if (p) {
        const sec = { easy: (p.easyFast + p.easySlow) / 2, steady: p.marathon + 22, marathon: p.marathon, "half marathon": p.half, threshold: p.threshold, "10K": p.tenK, "5K": p.fiveK, "3K": p.threeK, mile: p.mile, "800s": (p.fiveK + p.tenK) / 2 }[effort];
        if (sec) return sec / 60;
    }
    return DEFAULT_MIN_PER_MILE[effort] || 8.5;
}

// ---------- the workout library ----------

const W = (repeat, amount, unit, effort, recovery = null) => ({ repeat, amount, unit, effort, recovery });
const REC = (amount, unit, note = "easy jog") => ({ amount, unit, note });
const S = (name, why, cue, sets) => ({ name, why, cue, sets });

const STRIDES = "Easy run + 6 strides";

/**
 * One stimulus per block. `speed` is the early-week session for weeks 1-3
 * (the down week runs a lighter week-1 session); `long` is what the long
 * run carries each week: "easy", ["steady", miles], ["finish", miles] or
 * ["mp", repeat, miles].
 */
export const STIMULI = Object.freeze({
    BASE: {
        name: "Base",
        speed: [
            S("Fartlek", "Easy speed while the base builds.", "Surges are strong, not all-out.", [W(8, 1, "min", "10K", REC(1, "min"))]),
            S("Fartlek", "A little longer at a strong effort.", "Smooth on, relaxed off.", [W(6, 2, "min", "10K", REC(1.5, "min"))]),
            S("Fartlek", "The longest surges of the block.", "Hold the same effort on every one.", [W(5, 3, "min", "10K", REC(2, "min"))])
        ],
        long: ["easy", "easy", "easy"]
    },
    HILLS: {
        name: "Hills",
        speed: [
            S("Hills", "Strength for the legs with less pounding.", "Drive the arms, short quick steps.", [W(8, 0.75, "min", "strong uphill", REC(1.5, "min", "jog back down"))]),
            S("Hills", "Longer climbs, same strong effort.", "Strong and steady, not a sprint.", [W(8, 1, "min", "strong uphill", REC(2, "min", "jog back down"))]),
            S("Hills", "The biggest hill day of the block.", "The last one should look like the first.", [W(10, 1, "min", "strong uphill", REC(2, "min", "jog back down"))])
        ],
        long: ["easy", "easy", "easy"]
    },
    SPEED: {
        name: "Speed",
        speed: [
            S("400s", "Leg speed and running economy.", "Quick feet, tall posture.", [W(10, 400, "m", "5K", REC(1, "min"))]),
            S("1K repeats", "Comfort running fast for longer.", "Even splits; relax your shoulders.", [W(5, 1000, "m", "5K", REC(2, "min"))]),
            S("1200s", "The longest fast reps of the block.", "Lock into the pace by the second lap.", [W(4, 1200, "m", "5K", REC(2.5, "min"))])
        ],
        long: ["easy", "easy", ["steady", 2]]
    },
    THRESHOLD: {
        name: "Threshold",
        speed: [
            S("Mile repeats", "Raises the pace you can hold.", "Controlled. Even splits.", [W(4, 1, "mi", "threshold", REC(1.5, "min"))]),
            S("Cruise intervals", "More time at threshold with short breaks.", "Even effort on every rep.", [W(3, 10, "min", "threshold", REC(2, "min"))]),
            S("Tempo reps", "Long stretches at threshold.", "Settle in; don't start too fast.", [W(2, 15, "min", "threshold", REC(3, "min"))])
        ],
        long: [["steady", 2], ["steady", 3], ["steady", 4]]
    },
    THRESHOLD_2: {
        name: "Threshold strength",
        speed: [
            S("Mile repeats, short rest", "Threshold with shorter breaks.", "Stay smooth as the breaks get short.", [W(5, 1, "mi", "threshold", REC(1, "min"))]),
            S("2-mile repeats", "Longer reps at threshold.", "Patient on the first, strong on the last.", [W(3, 2, "mi", "threshold", REC(2, "min"))]),
            S("Tempo run", "One long steady push.", "Half marathon effort, relaxed.", [W(1, 30, "min", "half marathon")])
        ],
        long: [["finish", 2], ["finish", 3], ["finish", 4]]
    },
    SPECIFIC: {
        name: "Marathon specific",
        speed: [
            S("Half-marathon pace", "Makes marathon pace feel easier.", "Relaxed and even.", [W(3, 2, "mi", "half marathon", REC(2, "min"))]),
            S("Marathon pace run", "A steady block at race pace.", "Lock in the rhythm. Fuel like race day.", [W(1, 6, "mi", "marathon")]),
            S("Half-marathon pace", "Strength just above race pace.", "Controlled on the first, hold on the second.", [W(2, 3, "mi", "half marathon", REC(3, "min"))])
        ],
        long: [["mp", 2, 3], ["mp", 2, 4], ["mp", 3, 3]]
    }
});

// The half marathon's last block: the same idea, with half-marathon pace as the race pace.
const HALF_SPECIFIC = {
    name: "Half-marathon specific",
    speed: [
        S("Half-marathon pace", "Makes race pace feel easier.", "Relaxed and even.", [W(2, 2, "mi", "half marathon", REC(2, "min"))]),
        S("Half-marathon pace", "More time at race pace.", "Controlled. Lock in the rhythm.", [W(3, 2, "mi", "half marathon", REC(2.5, "min"))]),
        S("Half-marathon pace", "Strength at race pace.", "Hold the second one as well as the first.", [W(2, 3, "mi", "half marathon", REC(3, "min"))])
    ],
    long: [["mp", 1, 2], ["mp", 1, 3], ["mp", 1, 3]]
};
// ---- 5K and 10K blocks: Base, Hills, Strength (threshold), VO2max, Race-specific ----
// `second` is the second quality day (threshold work beside the main session); `long` as above.
const TEMPO = (min, effort = "threshold") => S("Tempo run", "One steady push at threshold.", "Settle in; don't start too fast.", [W(1, min, "min", effort)]);
const CRUISE = [
    S("Cruise intervals", "Raises the pace you can hold.", "Even effort on every rep.", [W(4, 1, "mi", "threshold", REC(1, "min"))]),
    S("Cruise intervals", "More time at threshold with short breaks.", "Even effort on every rep.", [W(3, 10, "min", "threshold", REC(2, "min"))]),
    S("Cruise intervals", "Longer reps at threshold.", "Patient on the first, strong on the last.", [W(2, 15, "min", "threshold", REC(3, "min"))])
];
const HILL_SPRINTS = [6, 8, 10].map(n => S("Hill sprints", "Builds power and running economy with little pounding.", "Fast and tall, walk back down. Full rest.", [W(n, 0.3, "min", "hill sprint", REC(1.5, "min", "walk back down"))]));
const SHORT_BASE = { name: "Base", speed: STIMULI.BASE.speed, second: [20, 25, 30].map(m => S("Steady run", "Builds aerobic strength.", "Comfortable but purposeful.", [W(1, m, "min", "steady")])), long: ["easy", "easy", "easy"] };
const SHORT_HILLS = { name: "Hills", speed: STIMULI.HILLS.speed, second: [15, 20, 20].map(m => TEMPO(m)), long: ["easy", "easy", "easy"] };
const SHORT_VO2 = {
    name: "VO2max",
    speed: [
        S("800s", "Builds your top aerobic speed.", "Smooth and fast, not a sprint.", [W(6, 800, "m", "3K", REC(2, "min"))]),
        S("1K repeats", "Longer reps at VO2max.", "Even splits. Relax your shoulders.", [W(5, 1000, "m", "5K", REC(2.5, "min"))]),
        S("1200s", "The longest reps of the block.", "Lock into the pace by the second lap.", [W(4, 1200, "m", "5K", REC(2.5, "min"))])
    ],
    second: CRUISE, long: ["easy", "easy", ["steady", 2]]
};
const SHORT_STIMULI = {
    "5K": {
        BASE: SHORT_BASE, HILLS: SHORT_HILLS, VO2: SHORT_VO2,
        STRENGTH: { name: "Strength", speed: [CRUISE[0], S("Cruise intervals", "Longer reps at threshold.", "Even effort on every rep.", [W(3, 2000, "m", "threshold", REC(1.5, "min"))]), TEMPO(20)], second: HILL_SPRINTS, long: ["easy", "easy", ["steady", 2]] },
        SPECIFIC: {
            name: "5K specific",
            speed: [
                S("5K pace reps", "Makes 5K pace feel controlled.", "Even splits, relaxed shoulders.", [W(5, 1000, "m", "5K", REC(2, "min"))]),
                S("Mile-pace 400s", "Sharpens speed above race pace.", "Quick and smooth.", [W(8, 400, "m", "mile", REC(1.5, "min"))]),
                S("1600s", "The biggest 5K-pace day of the block.", "Hold the same pace on the last one.", [W(3, 1600, "m", "5K", REC(3, "min"))])
            ],
            second: [TEMPO(20), CRUISE[1], TEMPO(15)], long: [["steady", 2], ["steady", 3], ["steady", 3]]
        }
    },
    "10K": {
        BASE: SHORT_BASE, HILLS: SHORT_HILLS, VO2: { ...SHORT_VO2, long: ["easy", ["steady", 2], ["steady", 3]] },
        STRENGTH: { name: "Strength", speed: [TEMPO(25), S("2-mile repeats", "Longer reps at threshold.", "Patient on the first, strong on the last.", [W(3, 2, "mi", "threshold", REC(2, "min"))]), TEMPO(30)], second: HILL_SPRINTS, long: [["steady", 2], ["steady", 3], ["steady", 4]] },
        SPECIFIC: {
            name: "10K specific",
            speed: [
                S("10K pace reps", "Makes 10K pace feel controlled.", "Even splits. Stay patient early.", [W(4, 1, "mi", "10K", REC(1.5, "min"))]),
                S("2K repeats", "More time at 10K pace.", "Lock in the rhythm.", [W(5, 2000, "m", "10K", REC(2, "min"))]),
                S("2-mile repeats", "The biggest 10K-pace day of the block.", "Hold the same pace on the last one.", [W(3, 2, "mi", "10K", REC(2.5, "min"))])
            ],
            second: [TEMPO(20), TEMPO(25), TEMPO(20)], long: [["finish", 2], ["finish", 3], ["finish", 3]]
        }
    }
};
const stimuliFor = D => (D.short ? SHORT_STIMULI[D.key] : D.key === "HALF" ? { ...STIMULI, SPECIFIC: HALF_SPECIFIC } : STIMULI);
// What the peak week, the taper and race week use for each distance.
const RACE_LIB = {
    "5K": {
        peakSpeed: S("5K pace reps", "The last big race-pace day.", "Controlled. Even splits.", [W(4, 1200, "m", "5K", REC(2.5, "min"))]), peakLong: ["steady", 3], peakSecond: TEMPO(20),
        tapers: [S("800s", "Keeps the legs sharp as the miles come down.", "Quick and relaxed. Finish wanting more.", [W(5, 800, "m", "5K", REC(2, "min"))]), S("400s", "A last touch of race pace.", "It should feel easy.", [W(6, 400, "m", "5K", REC(1.5, "min"))])],
        raceWeek: S("5K pace", "The last look at race pace.", "Relaxed. This should feel easy.", [W(4, 600, "m", "5K", REC(2, "min"))])
    },
    "10K": {
        peakSpeed: S("10K pace run", "The biggest race-pace day.", "Settle into the rhythm.", [W(1, 6, "mi", "10K")]), peakLong: ["finish", 3], peakSecond: TEMPO(20),
        tapers: [S("1K repeats", "Keeps the legs sharp as the miles come down.", "Quick and relaxed. Finish wanting more.", [W(4, 1000, "m", "10K", REC(2, "min"))]), S("10K pace", "Keeps race pace familiar.", "It should feel easy.", [W(2, 1, "mi", "10K", REC(0.5, "mi"))])],
        raceWeek: S("10K pace", "The last look at race pace.", "Relaxed. This should feel easy.", [W(3, 1, "mi", "10K", REC(2, "min"))])
    }
};
const timeTrialTemplate = s => (s.timeTrial === "MILE"
    ? S("Mile time trial", "A clean benchmark, the same early and late.", "Even effort. The fastest mile you can hold.", [W(1, 1, "mi", "mile")])
    : S("3200 time trial", "A clean benchmark, the same early and late.", "Even effort. The fastest 3200 you can hold.", [W(1, 3200, "m", "3K")]));

// Blocks before the peak, first to last, by how many full blocks the plan has.
const ORDER = {
    0: [],
    1: ["SPECIFIC"],
    2: ["THRESHOLD", "SPECIFIC"],
    3: ["SPEED", "THRESHOLD", "SPECIFIC"],
    4: ["BASE", "SPEED", "THRESHOLD", "SPECIFIC"],
    5: ["BASE", "HILLS", "SPEED", "THRESHOLD", "SPECIFIC"],
    6: ["BASE", "HILLS", "SPEED", "THRESHOLD", "THRESHOLD_2", "SPECIFIC"]
};

const PEAK_SPEED = S("Mile repeats", "One more threshold day before the taper.", "Controlled. Even splits.", [W(4, 1, "mi", "threshold", REC(1.5, "min"))]);
const TAPER_SPEED = [
    S("1K repeats", "Keeps the legs sharp as the miles come down.", "Quick and relaxed. Finish wanting more.", [W(4, 1000, "m", "10K", REC(2, "min"))]),
    S("Marathon pace", "Keeps race pace familiar.", "It should feel easy.", [W(2, 2, "mi", "marathon", REC(0.5, "mi"))])
];
const PEAK_SPEED_HALF = S("Half-marathon pace", "The biggest race-pace day of the plan.", "Controlled. Even splits.", [W(3, 3, "mi", "half marathon", REC(2, "min"))]);
const TAPER_SPEED_HALF = [
    S("1K repeats", "Keeps the legs sharp as the miles come down.", "Quick and relaxed. Finish wanting more.", [W(4, 1000, "m", "10K", REC(2, "min"))]),
    S("Half-marathon pace", "Keeps race pace familiar.", "It should feel easy.", [W(2, 1, "mi", "half marathon", REC(0.5, "mi"))])
];
const RACE_WEEK_HALF = S("Race pace", "The last look at race pace.", "Relaxed. This should feel easy.", [W(3, 1, "mi", "half marathon", REC(2, "min"))]);
const RACE_WEEK = S("Race pace", "The last look at race pace.", "Relaxed. This should feel easy.", [W(3, 1, "mi", "marathon", REC(2, "min"))]);
const benchmark = s => S("800s test", "The same session early and late in the plan, to see the progress.",
    "Even splits. The fastest pace you can hold for every rep.", [W(s.reps800, 800, "m", "800s", REC(s.rest800 / 60, "min"))]);

// Marathon-pace long runs, smallest to biggest: [repeat, miles each].
const MP_LADDER = [[1, 2], [1, 3], [2, 2], [2, 3], [2, 4], [3, 3], [2, 5], [3, 4]];
const PEAK_LONG = ["mp", 3, 4];
const PEAK_LONG_HALF = ["mp", 1, 3];

// ---------- sizing a workout ----------

const stepMiles = (amount, unit, effort, p) => unit === "mi" ? amount : unit === "m" ? amount / METERS_PER_MILE : unit === "km" ? amount * 0.621371 : amount / minutesPerMile(effort, p);
const recoveryMiles = (r, p) => (!r ? 0 : r.unit === "min" ? r.amount / minutesPerMile("easy", p) / 1.1 : stepMiles(r.amount, r.unit, "easy", p));
const workMiles = (sets, p) => sets.reduce((t, x) => t + x.repeat * stepMiles(x.amount, x.unit, x.effort, p) + Math.max(0, x.repeat - 1) * recoveryMiles(x.recovery, p), 0);
const copy = sets => sets.map(x => ({ ...x, recovery: x.recovery ? { ...x.recovery } : null }));

/**
 * A speed session as a day: { miles, session, workout }. `scale` shrinks it
 * (down weeks); `cap` is the most miles the day may be (reps come off to
 * fit, never below two). Fixed sessions (the 800s, race week) pass no cap.
 */
function speedDay(template, { tier, paces, p, scale = 1, cap = 0 }) {
    const sets = copy(template.sets);
    for (const x of sets) {
        if (scale < 1) {
            if (x.repeat > 1) x.repeat = Math.max(2, Math.ceil(x.repeat * scale));
            else x.amount = x.unit === "mi" ? Math.max(1, roundHalf(x.amount * scale)) : Math.max(5, Math.round(x.amount * scale));
        }
    }
    const around = tier.warm + tier.cool;
    if (cap) {
        for (const x of sets) while (x.repeat > 2 && around + workMiles(sets, p) > cap) x.repeat--;
        for (const x of sets) {
            while (x.repeat === 1 && around + workMiles(sets, p) > cap && ((x.unit === "mi" && x.amount > 2) || (x.unit === "min" && x.amount > 10))) x.amount -= x.unit === "mi" ? 1 : 5;
        }
    }
    for (const x of sets) if (paces?.[x.effort]) x.pace = paces[x.effort];
    const workout = sanitizeWorkout({
        warmup: { amount: tier.warm, unit: "mi", note: "easy" }, sets,
        cooldown: { amount: tier.cool, unit: "mi", note: "easy" }, why: template.why, cue: template.cue
    });
    const main = sets[0], amount = main.unit === "min" && main.amount < 1 ? `${Math.round(main.amount * 60)} sec` : `${main.amount} ${main.unit}`;
    const session = `${template.name}: ${main.repeat > 1 ? `${main.repeat} × ` : ""}${amount}`;
    return { miles: Math.max(3, roundHalf(around + workMiles(sets, p))), session, workout };
}

/** A long run as a day, with its workout when the week calls for one. */
function longDay(kind, miles, { tier, paces, D }) {
    const fuel = "Practice your race-day fueling.";
    if (!Array.isArray(kind) || miles < (D.short ? 6 : 8)) return { miles, session: "Long run, easy", workout: null };
    const [type, a, b] = kind;
    if (type === "steady" || type === "finish") {
        const last = Math.min(a, Math.max(1, Math.floor(miles * 0.3)));
        const effort = type === "steady" ? "steady" : D.effort;
        const workout = sanitizeWorkout({
            warmup: { amount: miles - last, unit: "mi", note: "easy" },
            sets: [{ ...W(1, last, "mi", effort), pace: paces?.[effort] || "" }],
            why: type === "steady" ? "Teaches you to pick it up on tired legs." : "Finishing at race pace on tired legs.",
            cue: "Easy until the last part. Then smooth, not a race.", fuel
        });
        return { miles, session: `Long run, last ${last} mi ${type === "steady" ? "steady" : "at race pace"}`, workout, key: true };
    }
    // Marathon-pace blocks: the asked-for one, or the biggest that fits this runner's long run.
    const allowed = miles * tier.mpShare;
    const asked = MP_LADDER.findIndex(([r, m]) => r === a && m === b);
    let pick = asked;
    while (pick > 0 && MP_LADDER[pick][0] * MP_LADDER[pick][1] > allowed) pick--;
    const [repeat, each] = MP_LADDER[Math.max(0, pick)];
    const between = repeat > 1 ? 1 : 0;
    const used = repeat * each + (repeat - 1) * between + 1;
    const workout = sanitizeWorkout({
        warmup: { amount: Math.max(1, miles - used), unit: "mi", note: "easy" },
        sets: [{ ...W(repeat, each, "mi", D.effort, between ? REC(1, "mi", "easy") : null), pace: paces?.[D.effort] || "" }],
        cooldown: { amount: 1, unit: "mi", note: "easy" },
        why: `Race pace inside a long run: the most ${D.label}-like day there is.`,
        cue: "Relaxed at pace. Fuel on schedule.", fuel
    });
    return { miles, session: `Long run with ${repeat} × ${each} mi at race pace`, workout, key: true };
}

// ---------- the calendar ----------

/**
 * Each week's place in the plan:
 * { kind: "leadin" | "build" | "down" | "peak" | "taper" | "race", block, blockWeek, stimulus }
 */
const ORDER_SHORT = {
    0: [], 1: ["SPECIFIC"], 2: ["STRENGTH", "SPECIFIC"], 3: ["STRENGTH", "VO2", "SPECIFIC"], 4: ["BASE", "STRENGTH", "VO2", "SPECIFIC"], 5: ["BASE", "HILLS", "STRENGTH", "VO2", "SPECIFIC"]
};

export function planCalendar(weeks, distance = "MARATHON") {
    const D = DISTANCES[distance] || DISTANCES.MARATHON;
    const taper = weeks < D.taperShort ? D.taperWeeks - 1 : D.taperWeeks;
    const peakAt = weeks - 1 - taper;
    const full = Math.min(D.short ? 5 : 6, Math.floor(peakAt / RULES.blockWeeks));
    const lead = peakAt - full * RULES.blockWeeks;
    const order = (D.short ? ORDER_SHORT : ORDER)[full];
    const out = [];
    for (let i = 0; i < weeks; i++) {
        if (i < lead) out.push({ kind: "leadin", block: 0, blockWeek: i + 1, stimulus: "SETTLE" });
        else if (i < peakAt) {
            const n = i - lead, block = Math.floor(n / 4), blockWeek = n % 4 + 1;
            out.push({ kind: blockWeek === 4 ? "down" : "build", block: block + 1, blockWeek, stimulus: order[block] });
        } else if (i === peakAt) out.push({ kind: "peak", block: full + 1, blockWeek: 1, stimulus: "PEAK" });
        else if (i === weeks - 1) out.push({ kind: "race", block: full + 1, blockWeek: i - peakAt + 1, stimulus: "PEAK" });
        else out.push({ kind: "taper", block: full + 1, blockWeek: i - peakAt + 1, stimulus: "PEAK", taperIndex: i - peakAt - 1 });
    }
    return out;
}

const STIMULUS_NAME = (key, D) => (key === "SETTLE" ? "Settle in" : key === "PEAK" ? "Peak and taper" : stimuliFor(D)[key].name);

// Weekly miles and long runs, before any day is laid out.
function planLevels(s, cal, p, D) {
    const tier = tierFor(s, D);
    const start = s.currentMiles;
    // The most the plan builds to: a share above where they are now. A low
    // base may double, up to the tier's floor, or the long run never gets long.
    const reach = Math.max(start * tier.peakFactor, Math.min(start * 2, tier.floor));
    const peak = Math.max(start, s.peakMiles || Math.min(reach, Math.max(tier.ceiling, start)));
    const longWanted = s.longTarget;
    const share = (D.longShare || RULES.longShare)[clamp(s.runDays.length, 3, 7)];
    const capByTime = p ? floorHalf(D.longCapMinutes / (((p.easyFast + p.easySlow) / 2) / 60)) : D.longCapMiles;
    const longCap = Math.min(D.longCapMiles, capByTime);

    // The weekly miles for a ramp speed (1 = the tier's full ramp). The plan
    // climbs just fast enough to arrive at the peak in the peak week, never
    // faster than the tier's ramp, so a peak far away is reached gradually.
    const simulate = speed => {
        let high = start, first = true;
        const totals = cal.map(w => {
            if (w.kind === "leadin") { first = false; return start; }
            if (w.kind === "down") return high * (1 - tier.down);
            if (w.kind === "build") {
                const action = first ? "hold" : tier.pattern[w.blockWeek - 1];
                first = false;
                if (action === "up") high = Math.min(peak, high + clamp(high * tier.ramp * speed, RULES.stepMin * Math.min(1, speed), RULES.stepMax * speed));
                return high;
            }
            if (w.kind === "peak") return high;
            if (w.kind === "taper") return high * D.taperMiles[D.taperMiles.length - (cal.filter(x => x.kind === "taper").length) + w.taperIndex];
            return 0;   // race week: set by its own days
        });
        return { totals, high };
    };
    let { totals, high } = simulate(1);
    if (high >= peak - 0.01) {
        // Full speed gets there early: find the slowest ramp that still arrives.
        let lo = 0.05, hi = 1;
        for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (simulate(mid).high >= peak - 0.01) hi = mid; else lo = mid; }
        ({ totals, high } = simulate(hi));
    }

    // The long run climbs evenly across the weeks that aren't down weeks.
    const climbing = cal.map((w, i) => (["leadin", "build", "peak"].includes(w.kind) ? i : -1)).filter(i => i >= 0);
    const startLong = Math.min(longCap, Math.max(3, s.longestRun || roundHalf(start * 0.3)));
    const topLong = Math.max(startLong, Math.min(longCap, longWanted));
    let lastLong = startLong;
    const longs = cal.map((w, i) => {
        const at = climbing.indexOf(i);
        if (at >= 0) {
            const ramp = climbing.length > 1 ? startLong + (topLong - startLong) * at / (climbing.length - 1) : topLong;
            lastLong = Math.max(Math.min(lastLong, floorHalf(share * totals[i])), Math.min(floorHalf(ramp), floorHalf(share * totals[i])));
            return lastLong;
        }
        if (w.kind === "down") return floorHalf(lastLong * RULES.downLong);
        if (w.kind === "taper") return floorHalf(topLong * D.taperLong[D.taperLong.length - cal.filter(x => x.kind === "taper").length + w.taperIndex]);
        return 0;
    });
    return { totals, longs, peak: high, wanted: peak, longCap, capByTime, topLong: Math.max(...longs), longWanted, share };
}

// One week's days: the long run and the speed day first, easy runs share the rest.
function layoutWeek({ start, s, tier, total, long, speed, second, notBefore }) {
    const days = CODES.map((day, i) => ({ date: addDays(start, i), day, type: "rest", miles: 0, session: "Rest" }));
    const open = days.filter(d => s.runDays.includes(d.day) && d.date >= notBefore);
    const set = (d, fields) => Object.assign(d, fields);
    let left = total;
    const longAt = open.find(d => d.day === s.longRunDay);
    if (longAt && long) { set(longAt, { type: "long", ...long }); left -= long.miles; }
    const speedAt = open.find(d => d.day === s.speedDay);
    if (speedAt && speed) { set(speedAt, speed); left -= speed.miles; }
    const secondAt = second && open.find(d => d.day === s.secondDay && d.type === "rest");
    if (secondAt) { set(secondAt, second); left -= second.miles; }
    // Easy days, lightest first to drop when the week can't hold them all.
    const weight = d => (dayGap(d.day, s.longRunDay) === 1 ? (CODES.indexOf(d.day) === (CODES.indexOf(s.longRunDay) + 1) % 7 ? 0.7 : 0.8) : 1);
    let easy = open.filter(d => d.type === "rest");
    while (easy.length && left / easy.length < RULES.minEasy) easy = easy.slice().sort((a, b) => weight(a) - weight(b)).slice(1);
    const sum = easy.reduce((t, d) => t + weight(d), 0);
    for (const d of easy) {
        const afterLong = CODES.indexOf(d.day) === (CODES.indexOf(s.longRunDay) + 1) % 7;
        const miles = clamp(roundHalf(left * weight(d) / sum), RULES.minEasy, tier.easyCap);
        set(d, afterLong && s.runDays.length >= 5 ? { type: "recovery", miles, session: "Recovery run" } : { type: "easy", miles, session: "Easy run" });
    }
    // Rounding: the biggest easy day takes what's left over.
    const laid = easy.reduce((t, d) => t + d.miles, 0);
    const fixer = easy.slice().sort((a, b) => b.miles - a.miles)[0];
    if (fixer) fixer.miles = clamp(roundHalf(fixer.miles + (left - laid)), RULES.minEasy, tier.easyCap);
    return days;
}

const weekMiles = days => days.reduce((t, d) => t + (d.type === "race" ? 0 : d.miles), 0);

/**
 * The whole plan.
 * -> { engine, settings, fitness, paces, weeks, benchmarks, warnings, summary }
 * weeks: [{ index, startDate, kind, down, block, blockWeek, stimulus, targetMiles, miles, days }]
 */
export function generateMarathonPlan(input = {}) {
    const problems = checkSettings(input);
    if (problems.length) return { engine: ENGINE_VERSION, problems, weeks: [], benchmarks: [], warnings: [], summary: null };
    const s = normalize(input);
    const D = DISTANCES[s.distance];
    const tier = tierFor(s, D);
    const fitness = fitnessFrom(s);
    const paces = pacesFrom(fitness);
    const p = paceSeconds(fitness);
    const first = mondayOf(s.startDate);
    const count = Math.floor(daysBetween(first, mondayOf(s.raceDate)) / 7) + 1;
    const cal = planCalendar(count, D.key);
    const levels = planLevels(s, cal, p, D);
    const warnings = [];
    const ctx = { tier, paces, p, D };
    const half = D.key === "HALF";
    const STIM = stimuliFor(D);
    const lib = RACE_LIB[D.key] || (half
        ? { peakSpeed: PEAK_SPEED_HALF, peakLong: PEAK_LONG_HALF, tapers: TAPER_SPEED_HALF, raceWeek: RACE_WEEK_HALF }
        : { peakSpeed: PEAK_SPEED, peakLong: PEAK_LONG, tapers: TAPER_SPEED, raceWeek: RACE_WEEK });
    const TAPERS = lib.tapers;

    // The two 800s days: plan week 2 and the peak week, when they're far enough apart.
    const peakAt = cal.findIndex(w => w.kind === "peak");
    const testWeeks = s.speedDay ? [1, peakAt].filter((w, i, all) => cal[w] && cal[w].kind !== "down" && (i === 0 || w - all[0] >= RULES.benchmarkGapWeeks)) : [];

    let turn = 0;   // alternates the key session for one-key-a-week runners
    const weeks = cal.map((w, i) => {
        const start = addDays(first, i * 7);
        const total = levels.totals[i];
        const isTest = testWeeks.includes(i);
        const stim = STIM[w.stimulus];
        let speedTemplate = null, longKind = "easy", scale = 1, secondTemplate = null;
        if (w.kind === "build") { speedTemplate = stim.speed[w.blockWeek - 1]; longKind = stim.long[w.blockWeek - 1]; secondTemplate = stim.second?.[w.blockWeek - 1] || null; }
        else if (w.kind === "down") { speedTemplate = stim.speed[0]; scale = RULES.downReps; secondTemplate = stim.second?.[0] || null; }
        else if (w.kind === "peak") { speedTemplate = lib.peakSpeed; longKind = lib.peakLong; secondTemplate = lib.peakSecond || null; }
        else if (w.kind === "taper") speedTemplate = TAPERS[TAPERS.length - cal.filter(x => x.kind === "taper").length + w.taperIndex];

        // One key session a week: speed and the long run workout take turns.
        if (s.keySessions === "ALTERNATE" && ["build", "peak"].includes(w.kind)) {
            const longHasWork = Array.isArray(longKind);
            const speedTurn = isTest || !longHasWork || turn % 2 === 0;
            if (longHasWork || isTest) turn++;
            if (speedTurn) longKind = "easy"; else speedTemplate = null;
        }
        if (isTest) longKind = s.keySessions === "ALTERNATE" ? "easy" : longKind;

        let speed = null;
        if (w.kind !== "race" && s.speedDay) {
            if (isTest) speed = { type: "workout", key: true, benchmark: true, ...speedDay(benchmark(s), ctx) };
            else if (speedTemplate) speed = { type: "workout", key: w.kind !== "down", ...speedDay(speedTemplate, { ...ctx, scale, cap: Math.max(5, total * 0.25) }) };
            else if (w.kind !== "race") speed = { type: "easy", miles: clamp(roundHalf(total * 0.18), 3, tier.easyCap), session: STRIDES };
        }
        let second = null;
        if (s.secondDay && (["build", "down", "peak"].includes(w.kind) || (w.kind === "leadin" && isTest && s.timeTrial))) {
            if (isTest && s.timeTrial) second = { type: "workout", key: true, timeTrial: true, ...speedDay(timeTrialTemplate(s), ctx) };
            else if (secondTemplate) second = { type: "workout", key: w.kind !== "down", ...speedDay(secondTemplate, { ...ctx, scale, cap: Math.max(4, total * 0.18) }) };
        }
        const long = w.kind === "race" ? null : longDay(w.kind === "down" || w.kind === "taper" ? "easy" : longKind, levels.longs[i], ctx);
        const days = w.kind === "race"
            ? raceWeekDays({ start, s, tier, D })
            : layoutWeek({ start, s, tier, total, long, speed, second, notBefore: s.startDate });
        return {
            index: i + 1, startDate: start, kind: w.kind, down: w.kind === "down", block: w.block, blockWeek: w.blockWeek,
            stimulus: STIMULUS_NAME(w.stimulus, D), targetMiles: roundHalf(total), miles: 0, days
        };
    });

    placeRacePaceDay(weeks, s, ctx, lib.raceWeek);
    const dropped = placeTuneUps(weeks, s, ctx, D);
    for (const w of weeks) w.miles = roundHalf(weekMiles(w.days));

    // ---------- what the coach should look at ----------
    const all = weeks.flatMap(w => w.days);
    const benchmarks = all.filter(d => d.benchmark).map(d => d.date);
    const longest = Math.max(0, ...all.filter(d => d.type === "long").map(d => d.miles));
    const biggest = Math.max(...weeks.map(w => w.miles));
    if (!fitness.source) warnings.push("No recent race or goal time, so workouts use effort words, not paces. The first 800s day will give real numbers.");
    if (fitness.source === "goal time") warnings.push("Paces come from the goal time alone. A recent race, or the first 800s day, would show whether the goal fits.");
    if (fitness.source === "recent race" && fitness.goalSec && fitness.gap > RULES.goalStretch) {
        warnings.push(`The goal is about ${Math.round(fitness.gap * 100)}% faster than the recent race suggests (${clock(fitness.predictedSec)}). Race-pace work uses current fitness until you change it.`);
    }
    if (fitness.source === "recent race" && fitness.goalSec && fitness.gap < -RULES.goalStretch) {
        warnings.push(`The recent race points to about ${clock(fitness.predictedSec)}, faster than the goal. Race-pace work follows the goal; raise it if you agree.`);
    }
    if (levels.capByTime < D.longCapMiles) warnings.push(`The ${D.capText} rule caps the long run at ${levels.capByTime} miles for this runner.`);
    if (longest < levels.longWanted && longest < levels.capByTime && (!D.short || s.longAsked)) {
        const needed = Math.ceil(levels.longWanted / levels.share);
        warnings.push(`The long run reaches ${longest} miles, short of the ${levels.longWanted} asked for. A ${levels.longWanted}-mile long run needs about ${needed} miles in the peak week on ${s.runDays.length} run days.`);
    }
    if (levels.peak < levels.wanted - 1 && s.peakMiles) warnings.push(`Building safely from ${s.currentMiles} miles a week reaches about ${Math.round(levels.peak)}, not the ${s.peakMiles} asked for.`);
    if (count < D.quick) warnings.push(`This is a ${count}-week plan. Most ${D.label} builds take ${D.typical} or more, so it moves quickly and has a short taper.`);
    if (testWeeks.length < 2) warnings.push("The plan is too short for two 800s days far enough apart, so there is one.");
    for (const d of dropped) warnings.push(d);
    if (s.timeTrial && !s.secondDay) warnings.push("The time trial needs a second quality day (Advanced level and up, with a free run day), so it was left out.");
    if (!s.speedDay) warnings.push("There is no run day free for a speed session.");
    else if (dayGap(s.speedDay, s.longRunDay) < 2) warnings.push("The speed day sits next to the long run. Another run day would space them out.");
    const test = all.find(d => d.benchmark);
    if (test && test.miles > weeks[1].targetMiles * 0.35) warnings.push(`The 800s test is a big day (${test.miles} miles) for ${Math.round(weeks[1].targetMiles)} miles a week. Fewer reps would fit better.`);
    const short = weeks.filter(w => ["build", "peak"].includes(w.kind) && w.miles < w.targetMiles - 2).length;
    if (short) warnings.push(`${s.runDays.length} run days can't hold the planned miles in ${short} week${short === 1 ? "" : "s"}. Another run day closes the gap.`);

    // One-tap fixes for the warnings that have one: { id, label, patch }.
    const fixes = [];
    if (longest < levels.longWanted && longest < levels.capByTime && (!D.short || s.longAsked)) {
        const needed = Math.ceil(levels.longWanted / levels.share);
        if (needed > (s.peakMiles || levels.peak) && needed <= tier.ceiling + 15) fixes.push({ id: "peak", label: `Set peak to ${needed} miles`, patch: { peakMiles: needed } });
    }
    if (fitness.source === "recent race" && fitness.goalSec && fitness.gap > RULES.goalStretch) {
        const rounded = Math.ceil(fitness.predictedSec / 60) * 60;
        fixes.push({ id: "goal", label: `Use ${clock(rounded)} as the goal`, patch: { goalTime: clock(rounded) } });
    }

    const blocks = [];
    for (const w of weeks) {
        const last = blocks.at(-1);
        if (last && last.block === w.block) last.to = w.index; else blocks.push({ block: w.block, name: w.stimulus, from: w.index, to: w.index });
    }
    return {
        engine: ENGINE_VERSION, problems: [], settings: s, fitness, paces, weeks, benchmarks, warnings, fixes,
        summary: {
            weeks: count, tier: tier.label, keySessions: s.keySessions, startMiles: weeks[0].miles, peakMiles: biggest, longestRun: longest,
            longCap: levels.longCap, blocks, raceDate: s.raceDate, racePace: paces?.[D.effort] || "", distance: D.key,
            predicted: fitness.predictedSec ? clock(fitness.predictedSec) : ""
        }
    };
}

const clock = sec => { const t = Math.round(sec); if (t < 3600) return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; return `${Math.floor(t / 3600)}:${String(Math.floor(t % 3600 / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

// Race week: short easy runs, a rest two days out, a shakeout the day before.
function raceWeekDays({ start, s, tier, D }) {
    return CODES.map((day, i) => {
        const date = addDays(start, i);
        const toRace = daysBetween(date, s.raceDate);
        const base = { date, day, type: "rest", miles: 0, session: "Rest" };
        if (toRace === 0) return { ...base, type: "race", miles: D.miles, session: `Race day: ${D.label}` };
        if (toRace < 0) return { ...base, session: `Rest. You ran a ${D.label}.` };
        if (!s.runDays.includes(day) || toRace === 2) return base;
        if (toRace === 1) return { ...base, type: "easy", miles: 2, session: "Shakeout: 2 easy miles" };
        return { ...base, type: "easy", miles: Math.min(4, tier.easyCap), session: "Easy run" };
    });
}

// Eddie's race-week session: 3 x 1 mile at race pace, about five days before the race.
function placeRacePaceDay(weeks, s, ctx, template) {
    const all = weeks.flatMap(w => w.days);
    const window = all.filter(d => { const n = daysBetween(d.date, s.raceDate); return n >= 3 && n <= 6 && s.runDays.includes(d.day); });
    const at = window.find(d => d.day === s.speedDay) || window.sort((a, b) => Math.abs(daysBetween(a.date, s.raceDate) - 5) - Math.abs(daysBetween(b.date, s.raceDate) - 5))[0];
    if (!at) return;
    Object.assign(at, { type: "workout", key: true, raceWeek: true, ...speedDay(template, ctx) });
    delete at.benchmark;
    // Nothing hard within two days either side of it.
    for (const d of all) {
        if (d !== at && d.type === "workout" && Math.abs(daysBetween(d.date, at.date)) <= 2) {
            Object.assign(d, { type: "easy", miles: Math.min(d.miles, 4), session: "Easy run" });
            delete d.workout; delete d.key;
        }
    }
}

// Tune-up races: the race replaces that week's hardest work. Returns what could not be placed, in plain words.
function placeTuneUps(weeks, s, ctx, D) {
    const out = [];
    const all = weeks.flatMap(w => w.days);
    for (const date of s.tuneUps) {
        const at = all.find(d => d.date === date);
        const why = !at ? "is outside the plan"
            : daysBetween(date, s.raceDate) < 10 ? "is too close to the race (it needs 10 days)"
            : at.type === "rest" || !s.runDays.includes(at.day) ? "is not on a run day"
            : at.type === "race" || at.raceWeek ? "is on the race day" : "";
        if (why) { out.push(`The tune-up race on ${date} ${why}, so it was left out.`); continue; }
        const { tier } = ctx;
        const distance = D.short ? D.miles : Math.min(D.miles, 6.2);
        Object.assign(at, {
            type: "workout", key: true, tuneUp: true, miles: roundHalf(distance + 2.5), session: `Tune-up race: ${D.short ? D.label : "a short race"}`,
            workout: sanitizeWorkout({ warmup: { amount: 1.5, unit: "mi", note: "easy" }, sets: [{ ...W(1, D.short ? D.meters : 10000, "m", D.short ? D.effort : "10K"), pace: ctx.paces?.[D.short ? D.effort : "10K"] || "" }], cooldown: { amount: 1, unit: "mi", note: "easy" }, why: "A race counts as that week's hard work.", cue: "Race it, then recover." })
        });
        delete at.benchmark; delete at.timeTrial; delete at.raceWeek;
        for (const d of all) {
            if (d === at) continue;
            const near = Math.abs(daysBetween(d.date, date)) <= 2;
            if (d.type === "workout" && near) { Object.assign(d, { type: "easy", miles: Math.min(d.miles, 4), session: "Easy run" }); delete d.workout; delete d.key; delete d.benchmark; delete d.timeTrial; }
            else if (d.type === "long" && d.workout && near) { Object.assign(d, { session: "Long run, easy" }); delete d.workout; delete d.key; }
        }
    }
    return out;
}

/** The engine's weeks in the shape js/coachPlanGenerator.js lays strength and cross-training onto. */
export function shapeForCoachPlan(settings) {
    const plan = generateMarathonPlan(settings);
    if (plan.problems.length) throw new Error(plan.problems[0]);
    const weeks = plan.weeks.map(w => ({
        startDate: w.startDate, phase: w.stimulus, ...(w.down ? { cutback: true } : {}),
        days: w.days.map(d => ({ date: d.date, day: d.day, type: d.type, miles: d.miles, session: d.session, ...(d.workout ? { workout: d.workout } : {}) }))
    }));
    return { weeks, warnings: plan.warnings, plan };
}

export default { ENGINE_VERSION, RULES, STIMULI, CODES, checkSettings, normalize, fitnessFrom, pacesFrom, planCalendar, generateMarathonPlan, clockSeconds };
