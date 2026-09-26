/* ==========================================
   Southbound — the coach's own marathon plan as COROS workouts (pure)

   Eddie's plan (js/marathonData.js) writes each day as text plus a
   pace label: "Mile repeats: 6x1mi @ Threshold, 90s jog" / 8 mi /
   "Threshold". This turns a day into the structured workout shape of
   js/runWorkout.js (warm-up, sets, cool-down), which js/corosWorkout.js
   already sends to COROS:
     - reps ("6x1mi", "5x1000m", "6x5min", "8x45s") with their recovery
       ("90s jog", "2min jog", "1min float"; 90s jog when unsaid)
     - a block inside a run ("4mi @ Marathon Pace", "Long run w/ 3mi @
       Threshold", "20-mile long run w/ 10-12mi continuous MP")
     - a finish ("last 3mi @ Steady", "last 3mi hard / toward MP")
     - races (10K / half tune-ups with warm-up + cool-down; race day)
   Quality parts get the plan's own pace ranges (PACES, e.g. marathon
   pace 6:58-7:05); easy parts go by heart-rate zone; efforts with no
   pace (hills, fartlek surges) go by COROS zone. Anything it can't
   read runs as one section by the day's pace label, so nothing breaks.
   Unit-tested in tests/marathonCoros.test.mjs.
========================================== */

import { courseFromDay } from "./corosWorkout.js";

// Plan pace table label -> "6:58-7:05" (per mile), from PACES.
function paceTable(paces) {
    const out = {};
    for (const [label, range] of paces || []) {
        const m = String(range).match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
        if (m) out[label.toLowerCase()] = `${m[1]}-${m[2]}`;
    }
    return out;
}

// Words -> which pace (or effort) a hard part runs at. First match wins.
const TARGETS = [
    [/marathon pace|\bmp\b|race pace/i, "marathon pace"],
    [/half/i, "half"],
    [/threshold|tempo|cruise/i, "threshold"],
    [/10k/i, "10k pace"],
    [/5k|vo2/i, "5k / vo₂max"],
    [/steady|progress|toward/i, "steady"],
    [/hill|strong/i, "@hill"],
    [/surge|fartlek|hard|fast/i, "@hard"]
];

function target(text, table) {
    const hit = TARGETS.find(([re]) => re.test(text));
    if (!hit) return null;
    const key = hit[1];
    if (key.startsWith("@")) return { effort: key.slice(1) };
    if (key === "half") {
        // Half-marathon pace: between threshold and marathon pace.
        const t = table.threshold, mp = table["marathon pace"];
        if (t && mp) return { pace: `${t.split("-")[1]}-${mp.split("-")[0]}` };
        return { effort: "half marathon" };
    }
    if (key === "threshold") return table.threshold ? { pace: table.threshold } : table["cruise intervals"] ? { pace: table["cruise intervals"] } : { effort: "threshold" };
    return table[key] ? { pace: table[key] } : { effort: key };
}

const round1 = n => Math.round(n * 10) / 10;
const MI = { mi: 1, mile: 1, miles: 1, km: 0.621371, k: 0.621371, m: 0.000621371 };

// "1mi" / "1K" / "1000m" / "5min" / "45s" -> a runWorkout step amount.
function amount(n, unit) {
    const u = unit.toLowerCase();
    if (/^s(ec)?$/.test(u)) return { amount: Number(n) / 60, unit: "min" };
    if (/^min/.test(u)) return { amount: Number(n), unit: "min" };
    if (u === "k") return { amount: Number(n), unit: "km" };
    if (/^mi/.test(u)) return { amount: Number(n), unit: "mi" };
    return { amount: Number(n), unit: u === "m" ? "m" : "km" };
}

// Rough miles of a step, to leave the right warm-up / cool-down.
function stepMiles(step, paceSecs) {
    if (!step) return 0;
    if (step.unit === "min") return (step.amount * 60) / paceSecs;
    return step.amount * (step.unit === "mi" ? 1 : step.unit === "km" ? MI.km : MI.m);
}

const easy = (miles, note = "easy") => ({ amount: round1(miles), unit: "mi", note });

function repeats(session, miles, table) {
    const m = session.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(mi(?:les?)?|k|km|m|min|s|sec)\b([^,/]*)/i);
    if (!m) return null;
    const [, reps, n, unit, after] = m;
    const work = amount(n, unit);
    const rest = session.slice(m.index + m[0].length);
    const rec = rest.match(/(\d+)\s*(s|sec|min)\s*(jog|float|walk|easy)?/i);
    const recovery = rec
        ? { ...amount(rec[1], rec[2]), note: rec[3] ? rec[3].toLowerCase() : "jog" }
        : { amount: 1.5, unit: "min", note: "jog" };
    const aim = target(`${after} ${session}`, table) || { effort: "hard" };
    const set = { repeat: Number(reps), ...work, ...aim, recovery };
    const perRep = stepMiles(work, 400) + stepMiles(recovery, 540);
    const around = Math.max(1, miles - perRep * set.repeat);
    return { warmup: easy(Math.max(0.5, around / 2)), sets: [set], cooldown: easy(Math.max(0.5, around / 2)) };
}

// "last 3mi @ Steady" / "last 3mi hard" / "last 3mi toward MP"
function finish(session, miles, table) {
    const m = session.match(/last\s+(\d+(?:\.\d+)?)\s*mi(?:les?)?\s*(.*)$/i);
    if (!m) return null;
    const block = Number(m[1]);
    const aim = target(m[2], table) || { effort: "steady" };
    return { warmup: easy(Math.max(0.5, miles - block), "easy, comfortable"), sets: [{ repeat: 1, amount: block, unit: "mi", ...aim, recovery: null }], cooldown: null };
}

// "4mi @ Marathon Pace" / "w/ 10-12mi continuous Marathon Pace" / "2mi @ Steady"
function block(session, miles, table, longRun) {
    // The first "N mi @ X" smaller than the whole run ("19mi w/ 7-8mi MP" -> 7 mi).
    const found = [...session.matchAll(/(?:w\/\s*|,\s*|^)(\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*mi(?:les?)?\s*(?:@\s*|continuous\s+)?((?:(?!w\/)[^,])*)/gi)]
        .map(m => ({ size: Number(m[1]), aim: target(m[2], table) }))
        .find(x => x.size < miles && x.aim);
    if (!found) return null;
    const { size, aim } = found;
    const left = miles - size;
    const cool = longRun ? Math.min(2, Math.max(1, left / 4)) : Math.min(1.5, left / 2);
    return {
        warmup: easy(Math.max(0.5, left - cool)),
        sets: [{ repeat: 1, amount: size, unit: "mi", ...aim, recovery: null }],
        cooldown: easy(Math.max(0.5, cool))
    };
}

function race(session, miles, table, isRace) {
    if (!isRace) return null;
    const dist = /marathon/i.test(session) && !/half/i.test(session) ? 26.2 : /half/i.test(session) ? 13.1 : /10k/i.test(session) ? 6.2 : /5k/i.test(session) ? 3.1 : null;
    if (!dist) return null;
    const aim = target(dist === 26.2 ? "marathon pace" : dist === 13.1 ? "half" : dist === 6.2 ? "10k" : "5k", table);
    const set = { repeat: 1, amount: dist, unit: "mi", ...aim, recovery: null };
    const around = round1(miles - dist);
    if (around < 1) return { sets: [set] };
    return { warmup: easy(Math.max(0.5, around * 0.6), "easy + strides"), sets: [set], cooldown: easy(Math.max(0.5, around * 0.4)) };
}

const TYPE_OF = { recovery: "recovery", easy: "easy", "long run": "long", race: "race" };

/**
 * A marathon plan day ({ session, miles, pace, race }) + the plan's PACES
 * -> a Southbound plan day { type, miles, session, workout }.
 */
export function planDayFromMarathon(day, paces) {
    if (!day) return null;
    const miles = Number(day.miles) || 0;
    const session = String(day.session || "").trim();
    const label = String(day.pace || "").toLowerCase();
    const table = paceTable(paces);
    const type = TYPE_OF[label] || (day.race ? "race" : /long run/i.test(session) ? "long" : "workout");
    if (!miles) return { type: "rest", miles: 0, session };

    const longRun = /long run|long\b|\d{2}\s*mi\s*w\//i.test(session) || miles >= 12;
    const isRace = Boolean(day.race) || label === "race" || /^race\b/i.test(session);
    const workout = race(session, miles, table, isRace)
        || repeats(session, miles, table)
        || finish(session, miles, table)
        || block(session, miles, table, longRun)
        || (type === "workout" && miles >= 5 && target(`${label} ${session}`, table)
            ? { warmup: easy(1.5), sets: [{ repeat: 1, amount: round1(miles - 3), unit: "mi", ...target(`${label} ${session}`, table), recovery: null }], cooldown: easy(1.5) }
            : null);
    return { type, miles, session, workout };
}

// "Mile repeats: 6x1mi @ Threshold" -> "Mile repeats"; "RACE: 10K Tune-Up (Sun Sep 13)"
// -> "10K Tune-Up"; "PEAK: 20-mile long run w/ ..." -> "20-mile long run".
export function marathonTitle(session, miles = 0) {
    let text = String(session || "").trim();
    const colon = text.match(/^([^:]{1,30}):\s*(.+)$/);
    if (colon) text = /^[A-Z0-9 ]+$/.test(colon[1]) ? colon[2] : colon[1];
    text = text.split(/\s+\(|\s+[-–—]\s+|\s+w\/\s|\s*\+\s*|,\s*/)[0].trim();
    if (/^\d+(?:\.\d+)?\s*mi$/i.test(text)) text = miles >= 12 ? "Long run" : "Run";  // "19mi w/ ..." -> "Long run"
    return (text || "Run").slice(0, 60);
}

/** A marathon plan day -> the COROS course, or null (rest days). */
export function marathonCourse(day, paces) {
    const planDay = planDayFromMarathon(day, paces);
    if (!planDay || !planDay.miles) return null;
    const course = courseFromDay(planDay, { title: marathonTitle(day.session, planDay.miles), coachName: "" });
    if (!course) return null;
    // Eddie's own plan: the day as he wrote it first, signed as his plan.
    course.courseDescription = [String(day.session || "").trim(), course.courseDescription]
        .filter(Boolean).join("\n\n")
        .replace("the paces your coach set", "your plan's paces")
        .replace(/From your coach · Southbound Coaching$/, "Southbound Coaching · marathon plan")
        .slice(0, 2000);
    return course;
}
