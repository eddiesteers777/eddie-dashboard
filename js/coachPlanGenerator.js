/* ==========================================
   Southbound — the coach's plan generator (pure)

   Builds a whole coach plan (runs + strength) from a few settings the
   Client Hub fills in from the client's profile, and regenerates any
   part of it later without losing work.

     settingsFromProfile(record, today)  -> settings (the form's defaults)
     generateCoachPlan(settings, { now }) -> { plan, warnings, summary }
     regeneratePlan(current, settings, { from, to, scope, replaceEdits, today, done, now })
        -> { plan, changes, keptEdited, keptDone }

   Weeks, phases, weekly miles, long runs, cutbacks, taper and each day's
   run come from js/planShape.js (plain coaching rules that hold for any
   settings, with warnings when a request can't be met safely). On top:
     - quality days get a structured workout (warm-up, reps, recoveries,
       cool-down, why + cue) sized to the day's miles, with pace ranges
       when there's a goal time (otherwise effort words)
     - strength sessions come from the Southbound library
       (js/strengthLibraryData.js), matched to the client's experience,
       equipment and the training phase (lighter in taper / cutback weeks),
       placed on easy or rest days they can train, never the day before a
       long run or within 3 days of a race
     - cross-training goes on free days they can train
   plan.generator = { v, settings, madeAt, prints: { date: [runHash, strengthHash] } }
   remembers what was generated, so a day the coach changed afterwards
   (either part) is recognized and kept when regenerating unless asked.
   Unit-tested in tests/coachPlanGenerator.test.mjs.
========================================== */

import { shapePlan, RACE_INFO } from "./planShape.js";
import { shapeRunWalk, isRunWalk, sessionDays, RUN_WALK_RACES } from "./runWalk.js";
import { sanitizeWorkout, workoutSummary } from "./runWorkout.js";
import { sanitizeStrength } from "./strengthWorkout.js";
import { BUILT_IN_WORKOUTS } from "./strengthLibraryData.js";
import { recalcPlannedMiles, diffPlans, addDays, mondayOf } from "./coachingPlanModel.js";

export const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
export const RACES = [["5K", "5K"], ["10K", "10K"], ["HALF", "Half marathon"], ["MARATHON", "Marathon"], ["50K", "50K"], ["50_MILE", "50 mile"]];
export const TRAINING_GOALS = [
    ["BASE_BUILD", "Build a running base"], ["SPEED", "Get faster"], ["RUN_STRENGTH", "Running strength (hills)"],
    ["RUN_MAINTENANCE", "Keep running fitness"], ["STRENGTH", "Strength focus, running maintained"],
    ["HYPERTROPHY", "Build muscle"], ["ATHLETIC", "Athletic / field sport"]
];
export const EXPERIENCE = [["NEW", "New to running"], ["RECREATIONAL", "Recreational"], ["INTERMEDIATE", "Experienced"], ["ADVANCED", "Advanced"]];
export const EQUIPMENT = [["gym", "Full gym"], ["dumbbells", "Dumbbells at home"], ["bands", "Bands / bodyweight"], ["bodyweight", "Bodyweight only"]];
export const STRENGTH_LEVELS = [["none", "New to strength"], ["some", "Some experience"], ["experienced", "Experienced"]];
const MIN_PEAK = { "5K": 18, "10K": 22, HALF: 28, MARATHON: 38, "50K": 42, "50_MILE": 48 };
const RACE_MILES = { "5K": 3.107, "10K": 6.214, HALF: 13.109, MARATHON: 26.219, "50K": 31.069, "50_MILE": 50 };

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const roundHalf = n => Math.max(0, Math.round(n * 2) / 2);
const pad = n => String(n).padStart(2, "0");
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const codeOf = date => CODES[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];
const circ = (a, b) => { const d = Math.abs(CODES.indexOf(a) - CODES.indexOf(b)); return Math.min(d, 7 - d); };

// ---------- settings ----------

/** The Monday a new plan starts: today when it's Monday, else next Monday. */
export function nextMonday(today) {
    return codeOf(today) === "MON" ? today : addDays(mondayOf(today), 7);
}

function raceFromText(text) {
    const t = String(text || "").toLowerCase();
    if (/50\s*(mi|mile)/.test(t)) return "50_MILE";
    if (/50\s*k/.test(t)) return "50K";
    if (/half/.test(t) || /13\.1/.test(t)) return "HALF";
    if (/marathon|26\.2/.test(t)) return "MARATHON";
    if (/10\s*k/.test(t)) return "10K";
    if (/5\s*k/.test(t)) return "5K";
    return null;
}

/**
 * The Generate form's starting values from the client profile
 * (clientRecords fields: primarySport, weeklyMileage, strengthExperience,
 * availabilityDays, primaryGoal, targetEvent, targetDate).
 */
export function settingsFromProfile(record = {}, today) {
    const r = record || {};
    const start = nextMonday(today);
    const train = CODES.filter(c => (r.availabilityDays || []).includes(c.toLowerCase()));
    const trainDays = train.length ? train : ["TUE", "WED", "THU", "SAT", "SUN"];
    const runDays = trainDays.length > 5 ? trainDays.filter(c => c !== "MON" && c !== "FRI").slice(0, 5) : trainDays;
    const longRunDay = runDays.includes("SUN") ? "SUN" : runDays.includes("SAT") ? "SAT" : runDays.at(-1);
    const current = Number(r.weeklyMileage) > 0 ? Math.round(Number(r.weeklyMileage)) : 15;
    const race = raceFromText(`${r.targetEvent || ""} ${r.primaryGoal || ""}`);
    const raceDate = /^\d{4}-\d{2}-\d{2}$/.test(r.targetDate || "") && r.targetDate >= addDays(start, 27) ? r.targetDate : "";
    const goalTime = normalGoal((String(r.primaryGoal || "").match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/) || [])[1] || "", race || "HALF");
    const minPeak = MIN_PEAK[race] || 20;
    const strengthLevel = ["none", "some", "experienced"].includes(r.strengthExperience) ? r.strengthExperience : "some";
    const sport = r.primarySport || "running";
    const goalText = String(r.primaryGoal || "").toLowerCase();
    // Little or no running now: start them on run/walk.
    const aboutText = `${goalText} ${String(r.currentTraining || "").toLowerCase()}`;
    const barelyRuns = sport === "running" && ((r.weeklyMileage !== undefined && r.weeklyMileage !== "" && r.weeklyMileage !== null && Number(r.weeklyMileage) <= 3)
        || /couch|run\s*\/?\s*walk|walk\/run|never (ran|run)|not running|first 5k|beginner|new to running/.test(aboutText));
    const startLevel = barelyRuns ? "RUN1" : "RUNNING";
    return {
        mode: race && raceDate && (!barelyRuns || RUN_WALK_RACES.includes(race)) ? "race" : "training",
        raceType: race || (barelyRuns ? "5K" : "HALF"),
        start: startLevel,
        runWalkGoal: "CONTINUOUS",
        raceDate,
        goalTime,
        trainingGoal: sport === "strength" ? "STRENGTH" : sport === "soccer" ? "ATHLETIC" : /fast|speed|pr\b|pb\b/.test(goalText) ? "SPEED" : "BASE_BUILD",
        startDate: start,
        endDate: addDays(start, 12 * 7 - 1),
        trainDays,
        runDays: barelyRuns ? sessionDays(trainDays, 3) : runDays,
        longRunDay,
        speedDays: runDays.length >= 5 ? 2 : 1,
        strengthDays: sport === "strength" ? 3 : strengthLevel === "none" ? 1 : 2,
        crossDays: 0,
        currentMiles: current,
        peakMiles: Math.round(Math.min(Math.max(current * 1.35, minPeak), Math.max(minPeak, current * 1.6))),
        longestRun: Math.max(3, Math.round(current * 0.3)),
        experience: current >= 55 ? "ADVANCED" : current >= 40 ? "INTERMEDIATE" : current <= 10 ? "NEW" : "RECREATIONAL",
        strengthLevel,
        equipment: "gym"
    };
}

/** Problems that stop generating, in plain words ([] when fine). */
export function checkSettings(s) {
    const out = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate || "")) out.push("Pick a start date.");
    const runWalk = isRunWalk(s);
    if ((s.runDays || []).length < 2) out.push("Pick at least two run days.");
    else if (!runWalk && !(s.runDays || []).includes(s.longRunDay)) out.push("The long run day has to be one of the run days.");
    if (s.mode === "race") {
        if (!RACE_INFO[s.raceType]) out.push("Pick a race distance.");
        else if (runWalk && !RUN_WALK_RACES.includes(s.raceType)) out.push("A run/walk start leads to a 5K or 10K. Pick one of those, or General training.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s.raceDate || "")) out.push("Pick the race date.");
        else if (s.raceDate < addDays(s.startDate, 20)) out.push("The race needs to be at least 3 weeks after the start.");
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(s.endDate || "") || s.endDate < addDays(s.startDate, 6)) out.push("The plan needs to run at least a week.");
    if (runWalk) return out;   // run/walk plans go by minutes, not miles
    if (!(Number(s.peakMiles) >= 3)) out.push("Set the miles a week to build to (3 or more).");
    else if (!(Number(s.peakMiles) >= Number(s.currentMiles))) out.push("Peak miles can't be lower than their current miles.");
    return out;
}

// ---------- paces from a goal time (Riegel), per mile ----------

/** "1:45" for a half is 1 h 45 min, for a 5K "19:30" is minutes: whichever is a real race time. */
export function goalSeconds(text, raceType) {
    const p = String(text || "").trim().split(":").map(Number);
    if (p.some(x => !Number.isFinite(x)) || p.length < 2 || p.length > 3) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    const asMinutes = p[0] * 60 + p[1];
    return asMinutes / (RACE_MILES[raceType] || 3.107) < 180 ? p[0] * 3600 + p[1] * 60 : asMinutes;
}
/** A goal time written the long way ("1:45" -> "1:45:00" for a half), or "" when it isn't one. */
export function normalGoal(text, raceType) {
    const sec = goalSeconds(text, raceType);
    if (!sec) return "";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
}
const mmss = s => `${Math.floor(s / 60)}:${pad(Math.round(s % 60))}`;

/** effort -> "m:ss-m:ss" per mile from the goal race time, or null without one. */
export function pacesFor(s) {
    const T = s.mode === "race" ? goalSeconds(s.goalTime, s.raceType) : 0;
    const D = RACE_MILES[s.raceType];
    if (!T || !D) return null;
    const time = miles => T * Math.pow(miles / D, 1.06);
    const pace = miles => time(miles) / miles;
    const hour = D * Math.pow(3600 / T, 1 / 1.06);             // the distance of a 1-hour race
    const range = sec => `${mmss(sec - 5)}-${mmss(sec + 5)}`;
    return {
        "mile to 3K": range(pace(1.864)), "5K": range(pace(3.107)), "10K": range(pace(6.214)),
        threshold: range(3600 / hour), tempo: range(3600 / hour + 10),
        "half marathon": range(pace(13.109)), marathon: range(pace(26.219)), race: range(T / D)
    };
}

// ---------- structured quality workouts ----------

const W = (repeat, amount, unit, effort, recovery = null) => ({ repeat, amount, unit, effort, recovery });
const REC = (amount, unit, note = "easy jog") => ({ amount, unit, note });
// Each: [name, why, cue, sets]
const QUALITY = {
    "5K": {
        Foundation: [["Easy + strides", "Keeps leg speed while the base builds.", "Quick and relaxed, not a sprint.", [W(6, 0.5, "min", "fast, relaxed", REC(1, "min", "walk / jog"))]]],
        Build: [["800s", "Builds VO2max and comfort running fast.", "Even splits; relax your shoulders.", [W(6, 800, "m", "5K", REC(400, "m"))]],
            ["400s", "Speed and running economy.", "Quick feet, tall posture.", [W(8, 400, "m", "mile to 3K", REC(200, "m"))]]],
        "Race Specific": [["1K repeats", "Race-pace strength for the 5K.", "Lock into the pace by the second rep.", [W(5, 1000, "m", "5K", REC(400, "m"))]],
            ["Mile repeats", "Threshold work that lifts your 5K ceiling.", "Controlled — the last should match the first.", [W(3, 1, "mi", "threshold", REC(2, "min"))]]],
        Peak: [["Sharp 400s", "Sharpens speed before the taper.", "Fast but smooth.", [W(10, 400, "m", "5K", REC(200, "m"))]]],
        Taper: [["Taper sharpener", "Stays sharp while the legs freshen up.", "It should feel easy.", [W(4, 3, "min", "race", REC(2, "min"))]]]
    },
    "10K": {
        Foundation: [["Fartlek", "Easy speed while the base builds.", "Surges are strong, not all-out.", [W(8, 1, "min", "10K", REC(1, "min"))]]],
        Build: [["1K repeats", "Builds the engine for 10K pace.", "Even effort across every rep.", [W(5, 1000, "m", "10K", REC(2, "min"))]],
            ["Tempo", "Raises the pace you can hold.", "Settle in; don't start too fast.", [W(1, 20, "min", "tempo")]]],
        "Race Specific": [["2K repeats", "Long reps at 10K pace build race rhythm.", "Find the rhythm and hold it.", [W(3, 2000, "m", "10K", REC(3, "min"))]],
            ["Mile repeats", "Threshold strength for the second half of the race.", "Controlled and even.", [W(4, 1, "mi", "threshold", REC(90 / 60, "min"))]]],
        Peak: [["1K repeats", "Race-specific sharpening.", "Smooth and fast.", [W(6, 1000, "m", "10K", REC(2, "min"))]]],
        Taper: [["Taper sharpener", "Stays sharp while the legs freshen up.", "It should feel easy.", [W(4, 3, "min", "race", REC(2, "min"))]]]
    },
    HALF: {
        Foundation: [["Tempo", "Builds strength at a comfortably hard effort.", "Comfortably hard, never straining.", [W(1, 20, "min", "tempo")]]],
        Build: [["Mile repeats", "Raises your threshold, the key to the half.", "The last rep should look like the first.", [W(3, 1, "mi", "threshold", REC(2, "min"))]],
            ["Cruise intervals", "Lots of time at threshold with short breaks.", "Even effort on every rep.", [W(4, 8, "min", "threshold", REC(1.5, "min"))]]],
        "Race Specific": [["Half-pace 2 × 3 mi", "Dials in race pace and fueling.", "Practice your race-day gel.", [W(2, 3, "mi", "half marathon", REC(0.5, "mi"))]],
            ["Half-pace 3 × 2 mi", "Race rhythm with short breaks.", "Relaxed at pace.", [W(3, 2, "mi", "half marathon", REC(0.5, "mi"))]]],
        Peak: [["Half-pace 6 mi", "A long stretch at race pace.", "Patient early, strong late.", [W(1, 6, "mi", "half marathon")]]],
        Taper: [["Half-pace 3 × 1 mi", "Keeps race pace familiar.", "It should feel easy.", [W(3, 1, "mi", "half marathon", REC(2, "min"))]]]
    },
    MARATHON: {
        Foundation: [["Steady 3-minute pickups", "Aerobic strength without the fatigue.", "Steady, not hard.", [W(6, 3, "min", "steady", REC(2, "min"))]]],
        Build: [["Mile repeats", "Raises your threshold.", "Controlled — even splits.", [W(3, 1, "mi", "threshold", REC(2, "min"))]],
            ["Cruise intervals", "Time at threshold with short breaks.", "Even effort on every rep.", [W(4, 8, "min", "threshold", REC(1.5, "min"))]]],
        "Race Specific": [["Marathon pace 3 × 2 mi", "Dials in race pace and fueling.", "Practice your race-day gel on the second rep.", [W(3, 2, "mi", "marathon", REC(0.5, "mi"))]],
            ["Marathon pace 2 × 4 mi", "Longer blocks at race pace.", "Relaxed at pace; fuel on schedule.", [W(2, 4, "mi", "marathon", REC(0.5, "mi"))]]],
        Peak: [["Marathon pace 3 × 3 mi", "The biggest race-pace session.", "Smooth and patient.", [W(3, 3, "mi", "marathon", REC(0.5, "mi"))]]],
        Taper: [["Marathon pace 3 × 1 mi", "Keeps race pace familiar.", "It should feel easy.", [W(3, 1, "mi", "marathon", REC(2, "min"))]]]
    },
    ULTRA: {
        Foundation: [["Hill repeats", "Strength for climbing with less pounding.", "Drive the arms, short quick steps.", [W(8, 2, "min", "strong uphill", REC(2, "min", "jog back down"))]]],
        Build: [["Hill repeats", "Strength for climbing.", "Strong and steady, not a sprint.", [W(8, 2, "min", "strong uphill", REC(2, "min", "jog back down"))]]],
        "Race Specific": [["Steady endurance", "Long steady effort like race day.", "Steady, fuel early.", [W(1, 50, "min", "steady")]]],
        Peak: [["Steady endurance", "Long steady effort like race day.", "Steady, fuel early.", [W(1, 60, "min", "steady")]]],
        Taper: [["Steady 30 min", "Stays sharp without fatigue.", "Easy-steady.", [W(1, 30, "min", "steady")]]]
    }
};
const TRAINING_QUALITY = {
    BASE_BUILD: [["Aerobic fartlek", "Easy speed while building the base.", "Pickups are smooth.", [W(8, 1, "min", "steady-fast", REC(1, "min"))]],
        ["Easy + strides", "Keeps leg speed.", "Quick and relaxed.", [W(6, 0.5, "min", "fast, relaxed", REC(1, "min", "walk / jog"))]]],
    SPEED: [["400s", "Speed and running economy.", "Quick feet, tall posture.", [W(8, 400, "m", "mile to 3K", REC(200, "m"))]],
        ["Tempo", "Raises the pace you can hold.", "Settle in.", [W(1, 20, "min", "threshold")]],
        ["Hill sprints", "Power with less pounding.", "Explosive, full recovery.", [W(8, 0.3, "min", "hard uphill", REC(2, "min", "walk down"))]]],
    RUN_STRENGTH: [["Hill repeats", "Running strength with less pounding.", "Drive the arms.", [W(8, 1, "min", "hard uphill", REC(2, "min", "jog back down"))]],
        ["Tempo", "Threshold strength.", "Controlled.", [W(1, 20, "min", "tempo")]]],
    RUN_MAINTENANCE: [["Steady state", "Holds aerobic fitness.", "Steady, conversational-plus.", [W(1, 20, "min", "steady")]],
        ["Pickups", "A little speed to stay sharp.", "Smooth.", [W(4, 3, "min", "steady-fast", REC(2, "min"))]]],
    STRENGTH: [["Steady state", "Keeps running fitness while lifting.", "Steady.", [W(1, 20, "min", "steady")]]],
    HYPERTROPHY: [["Steady state", "Keeps running fitness while building muscle.", "Steady.", [W(1, 20, "min", "steady")]]],
    ATHLETIC: [["400s", "Repeat-sprint fitness.", "Fast, controlled.", [W(5, 400, "m", "fast", REC(200, "m"))]],
        ["Hill repeats", "Power and acceleration.", "Drive the arms.", [W(6, 0.5, "min", "hard uphill", REC(2, "min", "walk down"))]],
        ["Tempo", "Aerobic base for the sport.", "Controlled.", [W(1, 20, "min", "tempo")]]]
};

const EFFORT_MIN_PER_MI = { "mile to 3K": 6.5, "5K": 7, "10K": 7.3, threshold: 7.5, tempo: 7.7, "half marathon": 7.8, marathon: 8.2, race: 7.5, fast: 7, "hard uphill": 9, "strong uphill": 9.5, steady: 8.5, "steady-fast": 8, "fast, relaxed": 7 };
const stepMiles = (amount, unit, effort) => unit === "mi" ? amount : unit === "m" ? amount / 1609.344 : unit === "km" ? amount * 0.621 : amount / (EFFORT_MIN_PER_MI[effort] || 8.5);
const recMiles = r => (!r ? 0 : r.unit === "min" ? r.amount / 10 : stepMiles(r.amount, r.unit));
const workMiles = sets => sets.reduce((t, s) => t + s.repeat * stepMiles(s.amount, s.unit, s.effort) + Math.max(0, s.repeat - 1) * recMiles(s.recovery), 0);

/** A quality day's structured workout, sized so warm-up + work + cool-down fits `miles`. */
export function qualityWorkout(s, phase, index, miles) {
    const table = s.mode === "race" ? (QUALITY[s.raceType] || QUALITY[["50K", "50_MILE"].includes(s.raceType) ? "ULTRA" : "HALF"]) : null;
    const options = table ? (table[phase] || table.Build) : (TRAINING_QUALITY[s.trainingGoal] || TRAINING_QUALITY.BASE_BUILD);
    const [name, why, cue, template] = options[index % options.length];
    const sets = clone(template);
    // Fewer reps when the day is short (keep at least a mile of warm-up + cool-down),
    // then shorter reps if even one is too long for the day.
    const room = Math.max(1, miles - 1.5);
    for (const set of sets) {
        while (set.repeat > 2 && workMiles(sets) > room) set.repeat--;
    }
    for (const set of sets) {
        while (set.repeat > 1 && workMiles(sets) > room && ["mi", "km", "min"].includes(set.unit)) set.repeat--;
    }
    if (workMiles(sets) > room) {
        const scale = room / workMiles(sets);
        for (const set of sets) {
            if (set.unit === "mi" || set.unit === "km") set.amount = Math.max(0.5, Math.floor(set.amount * scale * 2) / 2);
            else if (set.unit === "min") set.amount = Math.max(1, Math.floor(set.amount * scale));
            else if (set.unit === "m") set.amount = Math.max(200, Math.floor(set.amount * scale / 100) * 100);
            if (set.recovery?.unit === "mi") set.recovery.amount = Math.max(0.25, Math.floor(set.recovery.amount * scale * 4) / 4);
        }
    }
    const paces = pacesFor(s);
    for (const set of sets) if (paces?.[set.effort]) set.pace = paces[set.effort];
    const left = Math.max(1, miles - workMiles(sets));
    const warm = Math.max(0.5, Math.min(3, roundHalf(left * 0.55)));
    const cool = Math.max(0.5, roundHalf(left - warm));
    const workout = sanitizeWorkout({ warmup: { amount: warm, unit: "mi", note: "easy" }, sets, cooldown: { amount: cool, unit: "mi", note: "easy" }, why, cue });
    return { name, workout };
}

// ---------- strength from the library ----------

const byId = Object.fromEntries(BUILT_IN_WORKOUTS.map(w => [w.id, w]));
const RUNNER_MAIN = ["marathon-strength-a", "marathon-strength-b", "single-leg-foundation", "glute-posterior", "lower-body-25", "full-body-30", "beginner-foundation", "minimal-full-body", "dumbbell-only-30", "bands-only-25", "bodyweight-full-body"];
// New runners (run/walk plans): whole-body basics, no marathon sessions.
const NEW_RUNNER_MAIN = ["beginner-foundation", "bodyweight-full-body", "single-leg-foundation", "minimal-full-body", "lower-body-25", "full-body-30", "dumbbell-only-30", "bands-only-25"];
const NEW_RUNNER_LIGHT = ["runner-core-stability", "core-20", "calves-feet-15", "mobility-strength-20", "bodyweight-circuit-20"];
const RUNNER_LIGHT = ["marathon-strength-light", "marathon-maintenance-25", "runner-core-stability", "pre-long-run-support", "core-20", "calves-feet-15", "mobility-strength-20", "bodyweight-circuit-20"];
const GOAL_MAIN = {
    STRENGTH: ["lower-strength-a", "upper-strength-a", "full-body-45", "full-body-60", "push-day", "pull-day", "beginner-foundation", "dumbbell-only-30", "bands-only-25", "bodyweight-full-body"],
    HYPERTROPHY: ["lower-hypertrophy", "upper-hypertrophy", "upper-superset", "lower-superset", "full-body-45", "beginner-foundation", "dumbbell-only-30", "bands-only-25", "bodyweight-full-body"],
    ATHLETIC: ["athletic-foundation", "field-athlete", "power-primer-20", "full-body-45", "beginner-foundation", "dumbbell-only-30", "bands-only-25", "bodyweight-full-body"]
};
const EQUIPMENT_OK = {
    gym: () => true,
    dumbbells: e => /dumbbell|band|bodyweight|kettlebell/i.test(e),
    bands: e => /band|bodyweight/i.test(e),
    bodyweight: e => /bodyweight/i.test(e)
};
const LEVEL_OK = { none: l => l !== "Intermediate", some: () => true, experienced: () => true };

/** The library sessions this client can do, main and light, in rotation order. */
export function strengthPool(s) {
    const fits = id => {
        const w = byId[id];
        return w && (EQUIPMENT_OK[s.equipment] || EQUIPMENT_OK.gym)(w.equipment || "") && (LEVEL_OK[s.strengthLevel] || LEVEL_OK.some)(w.level || "");
    };
    const runWalk = isRunWalk(s);
    const mainIds = runWalk ? NEW_RUNNER_MAIN : (s.mode === "training" && GOAL_MAIN[s.trainingGoal]) || RUNNER_MAIN;
    let main = mainIds.filter(fits);
    if (s.strengthLevel === "experienced") main = [...main.filter(id => byId[id].level === "Intermediate"), ...main.filter(id => byId[id].level !== "Intermediate")];
    const light = (runWalk ? NEW_RUNNER_LIGHT : RUNNER_LIGHT).filter(fits);
    return { main: main.length ? main : light, light: light.length ? light : main };
}

/** A library workout -> a day's strength session (sets trimmed on light weeks). */
export function strengthFromLibrary(id, { light = false } = {}) {
    const w = byId[id];
    if (!w) return null;
    return sanitizeStrength({
        title: w.name,
        minutes: w.minutes,
        goal: w.goal || "",
        notes: light ? "Lighter week: stop 2–3 reps short of hard." : "",
        exercises: (w.exercises || []).map(e => ({
            name: e.name,
            sets: light ? Math.max(2, (e.sets || 3) - 1) : e.sets || 3,
            reps: String(e.reps ?? (e.duration ? `${e.duration} sec` : 8)),
            restSec: e.restSeconds ?? 90
        }))
    });
}

/** Which weekdays get strength: easy run or free days they can train, spread out. */
export function strengthDays(s, week) {
    const count = Math.max(0, Math.min(4, Number(s.strengthDays) || 0));
    if (!count) return [];
    const byCode = Object.fromEntries(week.days.map(d => [d.day, d]));
    const long = week.days.find(d => d.type === "long" || d.type === "race")?.day;
    const preLong = long ? CODES[(CODES.indexOf(long) + 6) % 7] : null;
    const scored = (s.trainDays || CODES).filter(c => byCode[c] && byCode[c].type !== "long" && byCode[c].type !== "race")
        .map(c => {
            const t = byCode[c].type;
            let score = t === "easy" || t === "recovery" ? 20 : t === "rest" ? 12 : t === "workout" ? -10 : 0;
            if (c === preLong) score -= 30;
            return { c, score };
        })
        .sort((a, b) => b.score - a.score || CODES.indexOf(a.c) - CODES.indexOf(b.c));
    const chosen = [];
    for (const gap of [2, 1, 0]) {
        for (const { c } of scored) {
            if (chosen.length >= count) break;
            if (!chosen.includes(c) && chosen.every(x => circ(x, c) >= gap)) chosen.push(c);
        }
    }
    return chosen;
}

// ---------- a day's two parts, and their fingerprints ----------

function stable(v) {
    if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
    if (v && typeof v === "object") return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
    return JSON.stringify(v ?? null);
}
function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
}

/** The run part of a day (anything that isn't strength): a strength-only or rest day's run part is rest. */
export function runPart(day) {
    if (!day || !day.type || day.type === "rest" || day.type === "strength") return { type: "rest", miles: 0, session: "", workout: null };
    return { type: day.type, miles: Number(day.miles) || 0, session: String(day.session || ""), workout: day.workout || null };
}
export const strengthPart = day => (day?.strength ? day.strength : null);
export const runHash = day => hash(stable(runPart(day)));
export const strengthHash = day => hash(stable(strengthPart(day)));

/** Put a day back together from its two parts. */
export function compose(date, run, strength) {
    const day = { date, day: codeOf(date) };
    if (run.type === "rest") {
        if (strength) Object.assign(day, { type: "strength", miles: 0, session: strength.title, strength });
        else Object.assign(day, { type: "rest", miles: 0, session: "" });
    } else {
        Object.assign(day, { type: run.type, miles: run.miles, session: run.session });
        if (run.workout) day.workout = run.workout;
        if (strength) day.strength = strength;
    }
    return day;
}

/** settings -> a whole coach plan. */
export function generateCoachPlan(settings, { now = Date.now() } = {}) {
    const runDays = CODES.filter(c => (settings.runDays || []).includes(c));
    const s = { ...settings, runDays, trainDays: CODES.filter(c => runDays.includes(c) || (settings.trainDays || []).includes(c)) };
    const problems = checkSettings(s);
    if (problems.length) throw new Error(problems[0]);
    // Starting from little or no running: the time-based run/walk ladder (js/runWalk.js).
    const { weeks: shaped, warnings } = isRunWalk(s) ? shapeRunWalk(s) : shapePlan(s);
    const pool = strengthPool(s);
    let quality = 0, mainN = 0, lightN = 0;
    const raceGuard = s.mode === "race" ? addDays(s.raceDate, -3) : null;
    const raceLabel = RACE_INFO[s.raceType]?.label || "race";
    const weeks = shaped.map((w, wi) => {
        const phase = w.phase || "";
        const lightWeek = /taper|cutback/i.test(phase) || w.cutback || (s.mode === "race" && wi === shaped.length - 1);
        const weekMiles = w.days.reduce((t, d) => t + (d.type === "race" ? 0 : Number(d.miles) || 0), 0);
        const runWalk = s.experience === "NEW" && weekMiles < 12;
        const days = w.days.map(d => {
            const type = d.type || "rest";
            const day = { date: d.date, day: d.day, type, miles: type === "race" ? d.miles : roundHalf(Number(d.miles) || 0), session: "" };
            if (d.workout) {
                // Already a full session (run/walk).
                Object.assign(day, { miles: d.miles, session: d.session, workout: clone(d.workout) });
            } else if (type === "race" && d.session) {
                day.session = d.session;
            } else if (type === "workout" && day.miles < 3) {
                // Too short for a session: easy with strides.
                Object.assign(day, { type: "easy", session: "Easy + 4 strides (20 sec quick, relaxed)" });
            } else if (type === "workout") {
                const q = qualityWorkout(s, phase, quality++, day.miles || 5);
                day.workout = q.workout;
                day.session = `${q.name}: ${workoutSummary(q.workout)}`.slice(0, 300);
            } else if (type === "long") day.session = runWalk ? "Long run/walk: easy, walk breaks are fine" : "Long run";
            else if (type === "race") day.session = `Race day — ${raceLabel}`;
            else if (type === "recovery") day.session = "Very easy — slower than you think";
            else if (type === "easy") {
                day.session = d.note === "shakeout" ? "Shakeout: very easy + 4 strides"
                    : d.note === "back-to-back" ? "Back-to-back: easy on tired legs, time on feet"
                    : runWalk ? "Easy run/walk: 1 min run, 1 min walk"
                    : "Easy, conversational";
            }
            return day;
        });
        const week = { week: wi + 1, phase, startDate: w.startDate, days, supplemental: [], ...(w.cutback ? { cutback: true } : {}) };
        // Strength
        const picks = strengthDays(s, week);
        const long = days.find(d => d.type === "long")?.day;
        for (const code of picks) {
            const day = days.find(d => d.day === code);
            if (!day || day.date < s.startDate || (raceGuard && day.date >= raceGuard)) continue;
            const light = lightWeek || code === CODES[(CODES.indexOf(long) + 6) % 7] || (s.strengthLevel === "none" && wi < 2);
            const id = light ? pool.light[lightN++ % pool.light.length] : pool.main[mainN++ % pool.main.length];
            const strength = strengthFromLibrary(id, { light: lightWeek });
            if (!strength) continue;
            day.strength = strength;
            if (day.type === "rest") { day.type = "strength"; day.session = strength.title; }
        }
        // Cross-training on free days they can train
        let cross = Math.max(0, Number(s.crossDays) || 0);
        for (const day of days) {
            if (!cross) break;
            if (day.type === "rest" && day.date >= s.startDate && s.trainDays.includes(day.day) && !(raceGuard && day.date >= raceGuard)) {
                Object.assign(day, { type: "cross", miles: 0, session: "Easy cross-training: bike, swim or elliptical, 30–45 min" });
                cross--;
            }
        }
        return week;
    });
    const plan = recalcPlannedMiles(clone({
        weeks,
        trainingStartDate: s.startDate,
        ...(s.mode === "race" ? { raceDate: s.raceDate } : {}),
        generator: { v: 1, settings: s, madeAt: now, prints: {} }
    }));
    for (const day of weeks.flatMap(w => w.days)) plan.generator.prints[day.date] = [runHash(day), strengthHash(day)];
    const all = plan.weeks.flatMap(w => w.days);
    const summary = {
        weeks: plan.weeks.length,
        miles: Math.round(plan.weeks.reduce((t, w) => t + (w.plannedMiles || 0), 0)),
        peak: Math.max(0, ...plan.weeks.map(w => w.plannedMiles || 0)),
        strength: all.filter(d => d.strength).length,
        workouts: all.filter(d => d.workout).length
    };
    return { plan, warnings, summary };
}

// ---------- regenerate ----------

/** Days whose run or strength part differs from what was generated. */
export function editedParts(plan, date, day) {
    const print = plan?.generator?.prints?.[date];
    const runNow = runPart(day), strNow = strengthPart(day);
    return {
        run: print ? print[0] !== runHash(day) : runNow.type !== "rest",
        strength: print ? print[1] !== strengthHash(day) : Boolean(strNow)
    };
}

/**
 * Regenerate part of a plan with (possibly changed) settings.
 *   from / to    dates (to = null: to the end); nothing before today changes
 *   scope        "all" | "runs" | "strength"
 *   replaceEdits also replace parts the coach changed by hand
 *   done         dates the client marked done (never change)
 * -> { plan, changes (diffPlans), keptEdited: [dates], keptDone: [dates] }
 */
export function regeneratePlan(current, settings, { from, to = null, scope = "all", replaceEdits = false, today, done = new Set(), now = Date.now() } = {}) {
    const fresh = generateCoachPlan(settings, { now }).plan;
    const curDays = new Map((current?.weeks || []).flatMap(w => (w.days || []).map(d => [d.date, d])));
    const newDays = new Map(fresh.weeks.flatMap(w => w.days.map(d => [d.date, d])));
    const curPhase = new Map((current?.weeks || []).flatMap(w => (w.days || []).map(d => [d.date, w.phase || ""])));
    const newPhase = new Map(fresh.weeks.flatMap(w => w.days.map(d => [d.date, w.phase || ""])));
    const oldPrints = current?.generator?.prints || {};
    const prints = {};
    const keptEdited = [], keptDone = [];
    const doRun = scope === "all" || scope === "runs", doStrength = scope === "all" || scope === "strength";
    const out = new Map();
    const phases = new Map();
    const dates = [...new Set([...curDays.keys(), ...newDays.keys()])].sort();
    for (const date of dates) {
        const cur = curDays.get(date) || null;
        const neu = newDays.get(date) || null;
        const inRange = date >= from && (!to || date <= to) && date >= today;
        if (!inRange || !cur && !neu) {
            if (cur) { out.set(date, clone(cur)); phases.set(date, curPhase.get(date)); if (oldPrints[date]) prints[date] = oldPrints[date]; }
            continue;
        }
        if (cur && done.has(date)) {
            out.set(date, clone(cur)); phases.set(date, curPhase.get(date));
            if (oldPrints[date]) prints[date] = oldPrints[date];
            if (neu && (runHash(cur) !== runHash(neu) || strengthHash(cur) !== strengthHash(neu))) keptDone.push(date);
            continue;
        }
        const edited = cur ? editedParts(current, date, cur) : { run: false, strength: false };
        const takeRun = doRun && (!edited.run || replaceEdits);
        const takeStrength = doStrength && (!edited.strength || replaceEdits);
        const run = takeRun ? runPart(neu) : runPart(cur);
        const strength = takeStrength ? strengthPart(neu) : strengthPart(cur);
        if (cur && ((doRun && edited.run && !replaceEdits && runHash(cur) !== runHash(neu)) || (doStrength && edited.strength && !replaceEdits && strengthHash(cur) !== strengthHash(neu)))) keptEdited.push(date);
        // A date the new plan no longer has, with nothing kept: it goes.
        if (!neu && run.type === "rest" && !strength) continue;
        const day = compose(date, clone(run), clone(strength));
        out.set(date, day);
        phases.set(date, neu ? newPhase.get(date) : curPhase.get(date));
        const old = oldPrints[date];
        const fresh1 = neu ? [runHash(neu), strengthHash(neu)] : [runHash(compose(date, runPart(null), null)), strengthHash(null)];
        prints[date] = [takeRun ? fresh1[0] : old?.[0] ?? runHash(cur), takeStrength ? fresh1[1] : old?.[1] ?? strengthHash(cur)];
    }
    // Back into Monday weeks.
    const byWeek = new Map();
    for (const [date, day] of [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const monday = mondayOf(date);
        if (!byWeek.has(monday)) byWeek.set(monday, { startDate: monday, days: [], phase: phases.get(date) || "" });
        byWeek.get(monday).days.push(day);
    }
    const weeks = [...byWeek.values()].map((w, i) => ({ week: i + 1, phase: w.phase, startDate: w.startDate, days: w.days, supplemental: [] }));
    const plan = recalcPlannedMiles(clone({
        ...current,
        weeks,
        trainingStartDate: weeks[0]?.startDate || fresh.trainingStartDate,
        ...(fresh.raceDate ? { raceDate: fresh.raceDate } : {}),
        generator: { v: 1, settings: fresh.generator.settings, madeAt: now, prints }
    }));
    if (!fresh.raceDate) delete plan.raceDate;
    return { plan, changes: diffPlans(current, plan), keptEdited, keptDone };
}

// ---------- what changed on a day, in a few words ----------

const TYPE_WORDS = { rest: "Rest", easy: "Easy", recovery: "Recovery", long: "Long run", workout: "Workout", race: "Race", cross: "Cross-training", strength: "Strength" };
const sessionName = run => (run.type === "workout" ? String(run.session).split(":")[0] : /^Run\/walk/.test(run.session || "") ? "Run/walk" : "") || TYPE_WORDS[run.type] || run.type;
// "Run/walk about 30 min: 6 × 2 min run, 1:30 walk" -> "6 × 2 min run, 1:30 walk"
const gist = text => String(text || "").split(": ").slice(1).join(": ") || String(text || "");
const mi = n => `${Math.round(n * 10) / 10}`;

/** "Workout: 5 → 5.5 mi", "Easy → Rest", "strength: Core 20 → Marathon Strength A" for one date. */
export function compactChange(before, after) {
    const a = runPart(before), b = runPart(after);
    const sa = strengthPart(before), sb = strengthPart(after);
    const parts = [];
    if (a.type !== b.type) parts.push(`${a.type === "rest" ? "Rest" : `${mi(a.miles)} mi ${sessionName(a)}`} → ${b.type === "rest" ? "Rest" : `${mi(b.miles)} mi ${sessionName(b)}`}`);
    else if (b.type !== "rest") {
        const bits = [];
        // Written-out sessions (run/walk, easy days): say what the session became.
        const described = b.type !== "workout" && a.session && b.session && a.session !== b.session;
        if (described) bits.push(`${gist(a.session)} → ${gist(b.session)}`.slice(0, 140));
        else if (sessionName(a) !== sessionName(b)) bits.push(`${sessionName(a)} → ${sessionName(b)}`);
        if (a.miles !== b.miles) bits.push(`${mi(a.miles)} → ${mi(b.miles)} mi`);
        if (!bits.length && (stable(a.workout) !== stable(b.workout) || a.session !== b.session)) bits.push("details changed");
        if (bits.length) parts.push(`${sessionName(b)}: ${bits.join(", ")}`);
    }
    if (!sa && sb) parts.push(`+ strength (${sb.title})`);
    else if (sa && !sb) parts.push(`strength removed (${sa.title})`);
    else if (sa && sb && sa.title !== sb.title) parts.push(`strength: ${sa.title} → ${sb.title}`);
    else if (sa && sb && stable(sa) !== stable(sb)) parts.push(`strength: ${sb.title} adjusted`);
    return parts.join(" · ") || "changed";
}
