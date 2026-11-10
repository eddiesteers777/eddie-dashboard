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
const MARATHON_M = 42195;
const MARATHON_MI = 26.2;

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
    const asked = RULES.tiers[input.tier] ? input.tier : null;
    s.tier = s.injuryHistory ? "CAREFUL"
        : asked || (s.currentMiles >= 45 ? "EXPERIENCED" : "NORMAL");
    s.firstMarathon = Boolean(input.firstMarathon);
    const tier = RULES.tiers[s.tier];
    s.longRunDay = s.runDays.includes(input.longRunDay) ? input.longRunDay
        : s.runDays.includes("SUN") ? "SUN" : s.runDays.includes("SAT") ? "SAT" : s.runDays.at(-1) || "SUN";
    s.speedDay = pickSpeedDay(s.runDays, s.longRunDay, input.speedDay);
    // Newer and low-mileage runners get one key session a week unless the coach says otherwise.
    s.keySessions = ["BOTH", "ALTERNATE"].includes(input.keySessions) ? input.keySessions
        : s.firstMarathon || s.currentMiles < RULES.bothFromMiles ? "ALTERNATE" : tier.key;
    s.reps800 = clamp(Math.round(Number(input.reps800) || tier.reps800), 4, 12);
    s.rest800 = clamp(Math.round((Number(input.rest800) || tier.rest800) / 30) * 30, 60, 180);
    s.peakMiles = Number(input.peakMiles) > 0 ? Number(input.peakMiles) : 0;
    return s;
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
        const weeks = Math.floor(daysBetween(mondayOf(s.startDate), mondayOf(s.raceDate)) / 7) + 1;
        if (weeks < RULES.minWeeks) out.push(`A marathon plan needs at least ${RULES.minWeeks} weeks. This one has ${Math.max(0, weeks)}.`);
        if (weeks > RULES.maxWeeks) out.push(`The plan can be at most ${RULES.maxWeeks} weeks. Start it later, or build a base first.`);
    }
    if (s.recentRace && !(Number(s.recentRace.meters) >= 1500 && Number(s.recentRace.seconds) > 0)) out.push("The recent race needs a distance and a time.");
    return out;
}

// ---------- fitness and paces ----------

/**
 * Where the paces come from. A recent race wins over a goal time; the goal
 * is checked against it. -> { vdot, source, predictedSec, goalSec, gap, mpSec, mpFrom }
 * gap > 0 means the goal is faster than the recent race suggests.
 */
export function fitnessFrom(input = {}) {
    const goalSec = clockSeconds(input.goalTime);
    const race = input.recentRace && Number(input.recentRace.meters) >= 1500 && Number(input.recentRace.seconds) > 0 ? input.recentRace : null;
    if (race) {
        const vdot = vdotFromRace(Number(race.meters), Number(race.seconds));
        const predictedSec = timeForVdot(vdot, MARATHON_M);
        const gap = goalSec ? (predictedSec - goalSec) / predictedSec : 0;
        const useGoal = goalSec > 0 && gap <= RULES.goalStretch;
        return { vdot, source: "recent race", predictedSec, goalSec, gap, mpSec: (useGoal ? goalSec : predictedSec) / MARATHON_MI, mpFrom: useGoal ? "goal" : "fitness" };
    }
    if (goalSec) {
        return { vdot: vdotFromRace(MARATHON_M, goalSec), source: "goal time", predictedSec: 0, goalSec, gap: 0, mpSec: goalSec / MARATHON_MI, mpFrom: "goal" };
    }
    return { vdot: 0, source: null, predictedSec: 0, goalSec: 0, gap: 0, mpSec: 0, mpFrom: null };
}

// Seconds per mile at each effort (one number each, plus the easy range).
function paceSeconds(fitness) {
    const { vdot } = fitness;
    if (!vdot) return null;
    const racePace = meters => timeForVdot(vdot, meters) / (meters / METERS_PER_MILE);
    // Threshold: the pace of a race that lasts an hour.
    let lo = 5000, hi = 30000;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (timeForVdot(vdot, mid) < 3600) lo = mid; else hi = mid; }
    const easyAt = share => METERS_PER_MILE / velocityAtVo2(vdot * share) * 60;
    return {
        easyFast: easyAt(0.72), easySlow: easyAt(0.62),
        marathon: fitness.mpSec, half: racePace(21097.5), threshold: 3600 / (lo / METERS_PER_MILE),
        tenK: racePace(10000), fiveK: racePace(5000)
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
        "800s": `${mmss(p.fiveK)}-${mmss(p.tenK)}`
    };
}

// Minutes per mile for sizing a timed step (a guess when there are no paces).
const DEFAULT_MIN_PER_MILE = { easy: 10, steady: 9, marathon: 8.5, "half marathon": 8, threshold: 7.75, "10K": 7.5, "5K": 7.25, "800s": 7.25 };
function minutesPerMile(effort, p) {
    if (p) {
        const sec = { easy: (p.easyFast + p.easySlow) / 2, steady: p.marathon + 22, marathon: p.marathon, "half marathon": p.half, threshold: p.threshold, "10K": p.tenK, "5K": p.fiveK, "800s": (p.fiveK + p.tenK) / 2 }[effort];
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
const RACE_WEEK = S("Race pace", "The last look at race pace.", "Relaxed. This should feel easy.", [W(3, 1, "mi", "marathon", REC(2, "min"))]);
const benchmark = s => S("800s test", "The same session early and late in the plan, to see the progress.",
    "Even splits. The fastest pace you can hold for every rep.", [W(s.reps800, 800, "m", "800s", REC(s.rest800 / 60, "min"))]);

// Marathon-pace long runs, smallest to biggest: [repeat, miles each].
const MP_LADDER = [[1, 2], [1, 3], [2, 2], [2, 3], [2, 4], [3, 3], [2, 5], [3, 4]];
const PEAK_LONG = ["mp", 3, 4];

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
function longDay(kind, miles, { tier, paces }) {
    const fuel = "Practice your race-day fueling.";
    if (!Array.isArray(kind) || miles < 8) return { miles, session: "Long run, easy", workout: null };
    const [type, a, b] = kind;
    if (type === "steady" || type === "finish") {
        const last = Math.min(a, Math.max(1, Math.floor(miles * 0.3)));
        const effort = type === "steady" ? "steady" : "marathon";
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
        sets: [{ ...W(repeat, each, "mi", "marathon", between ? REC(1, "mi", "easy") : null), pace: paces?.marathon || "" }],
        cooldown: { amount: 1, unit: "mi", note: "easy" },
        why: "Race pace inside a long run: the most marathon-like day there is.",
        cue: "Relaxed at pace. Fuel on schedule.", fuel
    });
    return { miles, session: `Long run with ${repeat} × ${each} mi at race pace`, workout, key: true };
}

// ---------- the calendar ----------

/**
 * Each week's place in the plan:
 * { kind: "leadin" | "build" | "down" | "peak" | "taper" | "race", block, blockWeek, stimulus }
 */
export function planCalendar(weeks) {
    const taper = weeks < 12 ? 2 : RULES.taperWeeks;
    const peakAt = weeks - 1 - taper;
    const full = Math.min(6, Math.floor(peakAt / RULES.blockWeeks));
    const lead = peakAt - full * RULES.blockWeeks;
    const order = ORDER[full];
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

const STIMULUS_NAME = key => (key === "SETTLE" ? "Settle in" : key === "PEAK" ? "Peak and taper" : STIMULI[key].name);

// Weekly miles and long runs, before any day is laid out.
function planLevels(s, cal, p) {
    const tier = RULES.tiers[s.tier];
    const start = s.currentMiles;
    // The most the plan builds to: a share above where they are now. A low
    // base may double, up to the tier's floor, or the long run never gets long.
    const reach = Math.max(start * tier.peakFactor, Math.min(start * 2, tier.floor));
    const peak = Math.max(start, s.peakMiles || Math.min(reach, Math.max(tier.ceiling, start)));
    const share = RULES.longShare[clamp(s.runDays.length, 3, 7)];
    const capByTime = p ? floorHalf(RULES.longCapMinutes / (((p.easyFast + p.easySlow) / 2) / 60)) : RULES.longCapMiles;
    const longCap = Math.min(RULES.longCapMiles, capByTime);

    let high = start, first = true;
    const totals = cal.map(w => {
        if (w.kind === "leadin") { first = false; return start; }
        if (w.kind === "down") return high * (1 - tier.down);
        if (w.kind === "build") {
            const action = first ? "hold" : tier.pattern[w.blockWeek - 1];
            first = false;
            if (action === "up") high = Math.min(peak, high + clamp(high * tier.ramp, RULES.stepMin, RULES.stepMax));
            return high;
        }
        if (w.kind === "peak") return high;
        if (w.kind === "taper") return high * RULES.taperMiles[RULES.taperMiles.length - (cal.filter(x => x.kind === "taper").length) + w.taperIndex];
        return 0;   // race week: set by its own days
    });

    // The long run climbs evenly across the weeks that aren't down weeks.
    const climbing = cal.map((w, i) => (["leadin", "build", "peak"].includes(w.kind) ? i : -1)).filter(i => i >= 0);
    const startLong = Math.min(longCap, Math.max(3, s.longestRun || roundHalf(start * 0.3)));
    const topLong = Math.max(startLong, Math.min(longCap, startLong + tier.longStep * (climbing.length - 1), floorHalf(share * high)));
    let lastLong = startLong;
    const longs = cal.map((w, i) => {
        const at = climbing.indexOf(i);
        if (at >= 0) {
            const ramp = climbing.length > 1 ? startLong + (topLong - startLong) * at / (climbing.length - 1) : topLong;
            lastLong = Math.max(Math.min(lastLong, floorHalf(share * totals[i])), Math.min(floorHalf(ramp), floorHalf(share * totals[i])));
            return lastLong;
        }
        if (w.kind === "down") return floorHalf(lastLong * RULES.downLong);
        if (w.kind === "taper") return floorHalf(topLong * RULES.taperLong[RULES.taperLong.length - cal.filter(x => x.kind === "taper").length + w.taperIndex]);
        return 0;
    });
    return { totals, longs, peak: high, wanted: peak, longCap, capByTime, topLong: Math.max(...longs) };
}

// One week's days: the long run and the speed day first, easy runs share the rest.
function layoutWeek({ start, s, tier, total, long, speed, notBefore }) {
    const days = CODES.map((day, i) => ({ date: addDays(start, i), day, type: "rest", miles: 0, session: "Rest" }));
    const open = days.filter(d => s.runDays.includes(d.day) && d.date >= notBefore);
    const set = (d, fields) => Object.assign(d, fields);
    let left = total;
    const longAt = open.find(d => d.day === s.longRunDay);
    if (longAt && long) { set(longAt, { type: "long", ...long }); left -= long.miles; }
    const speedAt = open.find(d => d.day === s.speedDay);
    if (speedAt && speed) { set(speedAt, speed); left -= speed.miles; }
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
    const tier = RULES.tiers[s.tier];
    const fitness = fitnessFrom(s);
    const paces = pacesFrom(fitness);
    const p = paceSeconds(fitness);
    const first = mondayOf(s.startDate);
    const count = Math.floor(daysBetween(first, mondayOf(s.raceDate)) / 7) + 1;
    const cal = planCalendar(count);
    const levels = planLevels(s, cal, p);
    const warnings = [];
    const ctx = { tier, paces, p };

    // The two 800s days: plan week 2 and the peak week, when they're far enough apart.
    const peakAt = cal.findIndex(w => w.kind === "peak");
    const testWeeks = s.speedDay ? [1, peakAt].filter((w, i, all) => cal[w] && cal[w].kind !== "down" && (i === 0 || w - all[0] >= RULES.benchmarkGapWeeks)) : [];

    let turn = 0;   // alternates the key session for one-key-a-week runners
    const weeks = cal.map((w, i) => {
        const start = addDays(first, i * 7);
        const total = levels.totals[i];
        const isTest = testWeeks.includes(i);
        const stim = STIMULI[w.stimulus];
        let speedTemplate = null, longKind = "easy", scale = 1;
        if (w.kind === "build") { speedTemplate = stim.speed[w.blockWeek - 1]; longKind = stim.long[w.blockWeek - 1]; }
        else if (w.kind === "down") { speedTemplate = stim.speed[0]; scale = RULES.downReps; }
        else if (w.kind === "peak") { speedTemplate = PEAK_SPEED; longKind = PEAK_LONG; }
        else if (w.kind === "taper") speedTemplate = TAPER_SPEED[TAPER_SPEED.length - cal.filter(x => x.kind === "taper").length + w.taperIndex];

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
        const long = w.kind === "race" ? null : longDay(w.kind === "down" || w.kind === "taper" ? "easy" : longKind, levels.longs[i], ctx);
        const days = w.kind === "race"
            ? raceWeekDays({ start, s, tier })
            : layoutWeek({ start, s, tier, total, long, speed, notBefore: s.startDate });
        return {
            index: i + 1, startDate: start, kind: w.kind, down: w.kind === "down", block: w.block, blockWeek: w.blockWeek,
            stimulus: STIMULUS_NAME(w.stimulus), targetMiles: roundHalf(total), miles: 0, days
        };
    });

    placeRacePaceDay(weeks, s, ctx);
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
    if (levels.capByTime < RULES.longCapMiles) warnings.push(`The 3-hour rule caps the long run at ${levels.capByTime} miles for this runner.`);
    if (longest < 16 && longest < levels.capByTime) warnings.push(`The longest run reaches ${longest} miles. Marathon runners usually build to 16 or more: more weeks, more weekly miles or another run day would get there.`);
    if (levels.peak < levels.wanted - 1 && s.peakMiles) warnings.push(`Building safely from ${s.currentMiles} miles a week reaches about ${Math.round(levels.peak)}, not the ${s.peakMiles} asked for.`);
    if (count < 12) warnings.push(`This is a ${count}-week plan. Most marathon builds take 16 or more, so it moves quickly and has a 2-week taper.`);
    if (testWeeks.length < 2) warnings.push("The plan is too short for two 800s days far enough apart, so there is one.");
    if (!s.speedDay) warnings.push("There is no run day free for a speed session.");
    else if (dayGap(s.speedDay, s.longRunDay) < 2) warnings.push("The speed day sits next to the long run. Another run day would space them out.");
    const test = all.find(d => d.benchmark);
    if (test && test.miles > weeks[1].targetMiles * 0.35) warnings.push(`The 800s test is a big day (${test.miles} miles) for ${Math.round(weeks[1].targetMiles)} miles a week. Fewer reps would fit better.`);
    const short = weeks.filter(w => ["build", "peak"].includes(w.kind) && w.miles < w.targetMiles - 2).length;
    if (short) warnings.push(`${s.runDays.length} run days can't hold the planned miles in ${short} week${short === 1 ? "" : "s"}. Another run day closes the gap.`);

    const blocks = [];
    for (const w of weeks) {
        const last = blocks.at(-1);
        if (last && last.block === w.block) last.to = w.index; else blocks.push({ block: w.block, name: w.stimulus, from: w.index, to: w.index });
    }
    return {
        engine: ENGINE_VERSION, problems: [], settings: s, fitness, paces, weeks, benchmarks, warnings,
        summary: {
            weeks: count, tier: tier.label, keySessions: s.keySessions, startMiles: weeks[0].miles, peakMiles: biggest, longestRun: longest,
            longCap: levels.longCap, blocks, raceDate: s.raceDate, racePace: paces?.marathon || "",
            predicted: fitness.predictedSec ? clock(fitness.predictedSec) : ""
        }
    };
}

const clock = sec => { const t = Math.round(sec); return `${Math.floor(t / 3600)}:${String(Math.floor(t % 3600 / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

// Race week: short easy runs, a rest two days out, a shakeout the day before.
function raceWeekDays({ start, s, tier }) {
    return CODES.map((day, i) => {
        const date = addDays(start, i);
        const toRace = daysBetween(date, s.raceDate);
        const base = { date, day, type: "rest", miles: 0, session: "Rest" };
        if (toRace === 0) return { ...base, type: "race", miles: MARATHON_MI, session: "Race day: marathon" };
        if (toRace < 0) return { ...base, session: "Rest. You ran a marathon." };
        if (!s.runDays.includes(day) || toRace === 2) return base;
        if (toRace === 1) return { ...base, type: "easy", miles: 2, session: "Shakeout: 2 easy miles" };
        return { ...base, type: "easy", miles: Math.min(4, tier.easyCap), session: "Easy run" };
    });
}

// Eddie's race-week session: 3 x 1 mile at race pace, about five days before the race.
function placeRacePaceDay(weeks, s, ctx) {
    const all = weeks.flatMap(w => w.days);
    const window = all.filter(d => { const n = daysBetween(d.date, s.raceDate); return n >= 3 && n <= 6 && s.runDays.includes(d.day); });
    const at = window.find(d => d.day === s.speedDay) || window.sort((a, b) => Math.abs(daysBetween(a.date, s.raceDate) - 5) - Math.abs(daysBetween(b.date, s.raceDate) - 5))[0];
    if (!at) return;
    Object.assign(at, { type: "workout", key: true, raceWeek: true, ...speedDay(RACE_WEEK, ctx) });
    delete at.benchmark;
    // Nothing hard within two days either side of it.
    for (const d of all) {
        if (d !== at && d.type === "workout" && Math.abs(daysBetween(d.date, at.date)) <= 2) {
            Object.assign(d, { type: "easy", miles: Math.min(d.miles, 4), session: "Easy run" });
            delete d.workout; delete d.key;
        }
    }
}

export default { ENGINE_VERSION, RULES, STIMULI, CODES, checkSettings, normalize, fitnessFrom, pacesFrom, planCalendar, generateMarathonPlan, clockSeconds };
