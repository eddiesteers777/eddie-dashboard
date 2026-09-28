/* ==========================================
   Southbound — run/walk plans for people starting from little or no running (pure)

   One ladder instead of a program per length: each rung is a session
   (a brisk-walk warm-up, `reps` x run / walk, a walk cool-down), and a
   plan of any length climbs from where the person starts to where the
   goal needs them, spread evenly over the weeks (a longer plan repeats
   rungs, a shorter one skips ahead: at most two rungs a week while there
   are walk breaks, one once the running is non-stop).
     start   WALK   walking, not running yet    -> 30 s runs
             RUN1   can run about 1 minute
             RUN5   can run about 5 minutes
             RUN10  can run 10-15 minutes
             RUN20  can run 20 minutes
     goal    CONTINUOUS  build to running non-stop (30-35 min for a 5K,
                         50-60 for a 10K, 30 for general fitness)
             INTERVALS   keep walk breaks for good: build to 4 min run /
                         1 min walk for 35 (5K), 60 (10K) or 40 min
   Sessions go on the coach's run days, at most four a week and never two
   days in a row when the week allows it. A race week has two shorter
   sessions and no run the day before. Miles are an estimate (about 12
   min a mile running, 17 walking) so week totals still read sensibly.
   shapeRunWalk() returns the same shape as shapePlan() in js/planShape.js,
   with each session's structured `workout` (js/runWorkout.js) and text.
   Unit-tested in tests/runWalk.test.mjs.
========================================== */

import { planWeeks, RACE_INFO } from "./planShape.js";

const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const START_LEVELS = [
    ["RUNNING", "Running regularly"],
    ["WALK", "Walking, not running yet"],
    ["RUN1", "Can run about 1 minute"],
    ["RUN5", "Can run about 5 minutes"],
    ["RUN10", "Can run 10–15 minutes"],
    ["RUN20", "Can run 20 minutes"]
];
export const RUN_WALK_GOALS = [
    ["CONTINUOUS", "Running non-stop"],
    ["INTERVALS", "Run/walk for good (4 min run, 1 min walk)"]
];
export const RUN_WALK_RACES = ["5K", "10K"];

export const isRunWalk = s => Boolean(s?.start) && s.start !== "RUNNING";

// rung = [run min, walk min, reps]; reps 1 = one continuous run.
const SHARED = [
    [0.5, 1.5, 10], [1, 1.5, 8], [1.5, 1.5, 7], [2, 1.5, 6], [3, 1.5, 5], [4, 1.5, 4]
];
const LADDER = {
    CONTINUOUS: [...SHARED,
        [5, 2, 3], [8, 2, 3], [12, 1.5, 2], [15, 1.5, 2],
        [20, 0, 1], [23, 0, 1], [26, 0, 1], [30, 0, 1], [35, 0, 1],
        [40, 0, 1], [45, 0, 1], [50, 0, 1], [55, 0, 1], [60, 0, 1]],
    INTERVALS: [...SHARED,
        [4, 1, 5], [4, 1, 6], [4, 1, 7], [4, 1, 8], [4, 1, 9], [4, 1, 10], [4, 1, 11], [4, 1, 12]]
};
const START_RUNG = { WALK: 0, RUN1: 1, RUN5: 6, RUN10: 8, RUN20: 10 };
// Where the goal needs them: [least, best] rung.
function goalRungs(s) {
    const ladder = LADDER[s.runWalkGoal === "INTERVALS" ? "INTERVALS" : "CONTINUOUS"];
    const at = (run, reps) => ladder.findIndex(r => r[0] === run && r[2] === reps);
    if (s.runWalkGoal === "INTERVALS") {
        if (s.mode === "race" && s.raceType === "10K") return [at(4, 12), at(4, 12)];
        if (s.mode === "race") return [at(4, 7), at(4, 7)];
        return [at(4, 8), at(4, 8)];
    }
    if (s.mode === "race" && s.raceType === "10K") return [at(50, 1), at(60, 1)];
    if (s.mode === "race") return [at(30, 1), at(35, 1)];
    return [at(30, 1), at(30, 1)];
}
const MAX_STEP = 2;
const WARM = 5, COOL = 5;

const circ = (a, b) => { const d = Math.abs(CODES.indexOf(a) - CODES.indexOf(b)); return Math.min(d, 7 - d); };
const minText = m => (m < 1 ? `${Math.round(m * 60)} sec` : m % 1 ? `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}` : `${m} min`);

/** Running minutes and total minutes of a rung. */
export function rungTime([run, walk, reps]) {
    const running = run * reps;
    return { running, total: WARM + COOL + running + walk * Math.max(0, reps - 1) };
}

// About 12 min a mile running and 17 walking, to half a mile (at least 0.5).
function estMiles([run, walk, reps]) {
    const walking = WARM + COOL + walk * Math.max(0, reps - 1);
    return Math.max(0.5, Math.round((run * reps / 12 + walking / 17) * 2) / 2);
}

/** One session: the structured workout (js/runWorkout.js shape) and its line of text. */
export function session(rung, { raceWeek = false } = {}) {
    const [run, walk, reps] = rung;
    const { total } = rungTime(rung);
    const continuous = reps === 1;
    const workout = {
        warmup: { amount: WARM, unit: "min", note: "brisk walk" },
        sets: [{
            repeat: reps, amount: run, unit: "min", pace: "", effort: "easy",
            recovery: continuous ? null : { amount: walk, unit: "min", note: "walk" }
        }],
        cooldown: { amount: COOL, unit: "min", note: "walk" },
        why: raceWeek ? "Keeps the legs moving while they freshen up for race day."
            : continuous ? "Time on your feet at an easy effort builds the engine for race day."
            : "Short runs with walk breaks build your heart, legs and joints together without overdoing it.",
        cue: continuous ? "Slow enough to talk the whole way. Slower is fine." : "Run slow enough to talk. The walk breaks are part of the plan.",
        fuel: ""
    };
    const text = continuous
        ? `Easy run ${run} min (${WARM} min walk before and after)`
        : `Run/walk about ${Math.round(total)} min: ${reps} × ${minText(run)} run, ${minText(walk)} walk`;
    return { workout, session: text, miles: estMiles(rung) };
}

// Up to `n` run days, spread out: never two in a row when the week allows it.
export function sessionDays(runDays, n) {
    const pool = CODES.filter(c => runDays.includes(c));
    if (pool.length <= n) return pool;
    let best = null;
    const walk = (from, chosen) => {
        if (chosen.length === n) {
            let gap = 7;
            for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) gap = Math.min(gap, circ(chosen[i], chosen[j]));
            const spread = chosen.reduce((t, c, i) => t + (i ? CODES.indexOf(c) - CODES.indexOf(chosen[i - 1]) : 0), 0);
            const score = gap * 10 + spread;
            if (!best || score > best.score) best = { chosen: [...chosen], score };
            return;
        }
        for (let i = from; i < pool.length; i++) walk(i + 1, [...chosen, pool[i]]);
    };
    walk(0, []);
    return best.chosen;
}

// Walk breaks can move up two rungs a week; non-stop running only one.
const stepCap = (ladder, rung) => (ladder[rung]?.[2] === 1 ? 1 : MAX_STEP);
function reach(ladder, rung, weeks, goal) {
    for (let k = 0; k < weeks && rung < goal; k++) rung = Math.min(goal, rung + stepCap(ladder, rung));
    return rung;
}

/**
 * Which rung each building week is on: from the start, evenly up to the goal
 * (a longer plan repeats rungs), moving sooner rather than later when the
 * one-rung weeks of non-stop running need the time.
 */
export function rungPlan(start, goal, weeks, ladder = LADDER.CONTINUOUS) {
    if (weeks <= 0) return [];
    const out = [start];
    let cur = start;
    for (let i = 1; i < weeks; i++) {
        const even = Math.floor(start + ((goal - start) * i) / (weeks - 1) + 1e-9);
        const cap = stepCap(ladder, cur);
        let step = Math.min(cap, Math.max(0, even - cur));
        while (step < cap && reach(ladder, cur + step, weeks - 1 - i, goal) < goal) step++;
        cur = Math.min(goal, cur + step);
        out.push(cur);
    }
    return out;
}

/**
 * settings -> { weeks: [{ startDate, phase, cutback, days: [{ date, day, type, miles, session?, workout? }] }], warnings }
 * settings: startDate, mode race|training, raceType 5K|10K, raceDate / endDate,
 *           runDays, start (START_LEVELS), runWalkGoal (RUN_WALK_GOALS)
 */
export function shapeRunWalk(s) {
    const goalKey = s.runWalkGoal === "INTERVALS" ? "INTERVALS" : "CONTINUOUS";
    const ladder = LADDER[goalKey];
    const race = s.mode === "race";
    const weeks = planWeeks(s);
    const warnings = [];
    const perWeek = Math.min(4, (s.runDays || []).length);
    const days = sessionDays(s.runDays || [], perWeek);
    const start = START_RUNG[s.start] ?? 1;
    const [least, best] = goalRungs(s);
    const building = race ? weeks.length - 1 : weeks.length;
    // Aim for the best rung when there's time for it without jumps, else the least.
    const goal = Math.max(start, reach(ladder, start, building - 1, best) >= best ? best : least);
    const rungs = rungPlan(start, goal, building, ladder);
    const reached = rungs.length ? rungs[rungs.length - 1] : start;

    const label = RACE_INFO[s.raceType]?.label || "race";
    const nonStop = ladder[reached]?.[2] === 1;
    const raceText = nonStop
        ? `Race day — ${label}: start slower than feels right. Walk breaks are fine if you need them.`
        : `Race day — ${label}: run/walk, 4 min run, 1 min walk from the start. Start slower than feels right.`;
    const out = weeks.map((w, wi) => {
        const raceWeek = race && wi === weeks.length - 1;
        const rungIndex = raceWeek ? Math.max(0, reached - 2) : rungs[wi];
        const rung = ladder[rungIndex];
        const open = w.days.filter(d => d.date >= s.startDate && days.includes(d.day) && (!raceWeek || d.date < s.raceDate));
        let chosen = open.map(d => d.day);
        if (raceWeek) {
            const dayBefore = CODES[(CODES.indexOf(w.days.find(d => d.date === s.raceDate)?.day || "SUN") + 6) % 7];
            chosen = chosen.filter(c => c !== dayBefore).slice(-2);
        }
        const phase = raceWeek ? "Taper" : rung[2] === 1 ? "Build" : "Foundation";
        return {
            startDate: w.startDate, phase, cutback: false, rung: rungIndex,
            days: w.days.map(d => {
                if (race && d.date === s.raceDate) return { date: d.date, day: d.day, type: "race", miles: RACE_INFO[s.raceType]?.miles || 3.1, session: raceText };
                if (!chosen.includes(d.day)) return { date: d.date, day: d.day, type: "rest", miles: 0 };
                const sess = session(rung, { raceWeek });
                return { date: d.date, day: d.day, type: "easy", miles: sess.miles, session: sess.session, workout: sess.workout };
            })
        };
    });

    const [run, walk, reps] = ladder[reached] || ladder[0];
    const finalText = reps === 1 ? `${run} minutes of easy running without stopping` : `${reps} × ${minText(run)} run / ${minText(walk)} walk`;
    if (reached < least) {
        warnings.push(race
            ? `${building} week${building === 1 ? "" : "s"} of building reaches ${finalText}, so race day is run/walk (that's fine: 4 min run, 1 min walk works well). More weeks would get them further.`
            : `${building} week${building === 1 ? "" : "s"} reaches ${finalText}. More weeks would get them further.`);
    } else if (race) {
        warnings.push(`Builds to ${finalText} before the ${label}${goalKey === "INTERVALS" ? ", with walk breaks on race day too" : ""}.`);
    }
    if (building <= 7 && rungs.filter((r, i) => i && r - rungs[i - 1] > 1).length >= 3) warnings.push("A quick build: some weeks move up two steps. If a session feels too hard, repeat the week before.");
    if (perWeek < 3) warnings.push("Two sessions a week works, but three builds faster and more safely.");
    if ((s.runDays || []).length > 4) warnings.push("Run/walk plans use four days at most; the other days stay free for rest, walking or cross-training.");
    // Four days can't all be spread out; fewer can, so say so when they aren't.
    if (days.length > 1 && days.length <= 3 && days.some((c, i) => days.slice(i + 1).some(o => circ(c, o) < 2))) {
        warnings.push("Some sessions fall on back-to-back days. A day off between them helps new runners recover.");
    }
    if (race && !RUN_WALK_RACES.includes(s.raceType)) warnings.push("Run/walk plans lead to a 5K or 10K.");
    return { weeks: out, warnings };
}

/** Estimated running minutes per session, week by week (for a quick look in tests and previews). */
export function rungSummary(s) {
    const ladder = LADDER[s.runWalkGoal === "INTERVALS" ? "INTERVALS" : "CONTINUOUS"];
    return shapeRunWalk(s).weeks.map(w => ({ phase: w.phase, rung: ladder[w.rung], ...rungTime(ladder[w.rung]) }));
}
