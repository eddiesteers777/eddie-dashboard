/* ==========================================
   Southbound — tailor a plan with any chatbot (pure)

   No AI inside Southbound: the coach uses his own chatbot. This builds
   the prompt and reads the answer back, so nothing is typed in by hand.

   buildPrompt({ firstName, record, notes, plan, from, to, scope, today })
     The athlete (first name only: no email, phone or birth year), the
     coach's notes, the plan as it stands from `from` to `to` in the same
     one-line-a-day format the answer must use, the coaching rules, the
     strength library's session names, and the answer format.
   parseReply(text, { plan, from, to, done, scope })
     The chatbot's answer -> the days it gives, lines it couldn't read,
     and dates it can't change. Tolerant: code fences, markdown tables,
     bullets, a weekday after the date, missing miles.
   applyReply(plan, days) -> a new plan (the client's done marks kept).
   checkPlan(plan, { from, record }) -> plain warnings for "Worth a look":
     big weekly jumps, hard days back to back, a long run that's most of
     the week, very long easy days, no rest day, the race day missing,
     sessions on days the athlete said they can't train.

   The line format (both ways):
     DATE | TYPE | MILES | WORKOUT | STRENGTH | NOTE
     2026-10-06 Tue | workout | 6 | 1.5mi WU; 5x3min @ 5K; 2min jog; 1.5mi CD | none | Builds speed.
   WORKOUT uses the shorthand js/marathonCoros.js already reads for the
   coach's own plan (reps, recoveries, WU / CD, "last 2 @ 8:30", paces or
   effort words). Unit-tested in tests/planPrompt.test.mjs.
========================================== */

import { planDayFromMarathon } from "./marathonCoros.js";
import { sanitizeWorkout, workoutSummary, plannedMiles, timedMinutes } from "./runWorkout.js";
import { sanitizeStrength } from "./strengthWorkout.js";
import { BUILT_IN_WORKOUTS } from "./strengthLibraryData.js";
import { strengthFromLibrary } from "./coachPlanGenerator.js";
import { recalcPlannedMiles, shortDay } from "./coachingPlanModel.js";
import { applyPrescription } from "./planOps.js";
import { START_LEVELS, RUN_WALK_GOALS, isRunWalk } from "./runWalk.js";

const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const RUNS = ["easy", "recovery", "long", "workout", "tempo", "race"];
const HARD = ["workout", "tempo", "long", "race"];
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const round1 = n => Math.round(n * 10) / 10;
const clean = t => String(t ?? "").replace(/\s+/g, " ").trim();
const codeOf = date => CODES[(new Date(`${date}T12:00:00`).getDay() + 6) % 7];
const daysOf = plan => (plan?.weeks || []).flatMap(w => w.days || []);

// ---------- writing a day as a line ----------

const n2 = n => String(Math.round(n * 100) / 100);
function amountShort(step) {
    if (!step) return "";
    if (step.unit === "min") {
        const secs = Math.round(step.amount * 60);
        return secs < 60 || (secs % 60 && secs < 180) ? `${secs}s` : `${n2(step.amount)}min`;
    }
    if (step.unit === "m") return `${Math.round(step.amount)}m`;
    if (step.unit === "km") return `${n2(step.amount)}km`;
    return `${n2(step.amount)}mi`;
}
// "fast, relaxed" -> "fast": a comma would split the shorthand.
const effortWord = e => clean(String(e || "").split(/[,;]/)[0]);
const targetShort = t => (t?.pace ? ` @ ${t.pace}` : t?.effort ? ` @ ${effortWord(t.effort)}` : "");
const recWord = note => (/walk/i.test(note || "") ? "walk" : /float/i.test(note || "") ? "float" : /rest|stand/i.test(note || "") ? "rest" : "jog");

/** A structured workout -> "1.5mi WU; 3x1mi @ 7:00-7:10; 2min jog; 1.5mi CD". */
export function workoutShorthand(workout) {
    if (!workout) return "";
    const parts = [];
    if (workout.warmup) parts.push(`${amountShort(workout.warmup)} WU`);
    for (const set of workout.sets || []) {
        if (set.parts?.length) {
            parts.push(`${set.repeat}x(${set.parts.map(p => (p.recovery ? `${amountShort(p)} ${recWord(p.note)}` : `${amountShort(p)}${targetShort(p)}`)).join(", ")})`);
            continue;
        }
        parts.push(`${set.repeat > 1 ? `${set.repeat}x` : ""}${amountShort(set)}${targetShort(set)}`);
        if (set.recovery && set.repeat > 1) parts.push(`${amountShort(set.recovery)} ${recWord(set.recovery.note)}`);
    }
    if (workout.cooldown) parts.push(`${amountShort(workout.cooldown)} CD`);
    return parts.join("; ");
}

const isRunWalkDay = day => Boolean(day?.workout) && /^Run\/walk|^Easy run \d+ min/.test(day.session || "") && timedMinutes(day.workout) !== null;
const label = day => {
    if (!day?.session) return "";
    const m = String(day.session).match(/^([^:]{2,40}):\s/);
    return m ? m[1] : "";
};

/** One plan day -> its line. */
export function dayLine(day) {
    const date = `${day.date} ${WEEKDAY[day.day || codeOf(day.date)]}`;
    const t = day.type || "rest";
    const strength = day.strength ? day.strength.title : "none";
    const why = clean(day.workout?.why || "");
    if (t === "rest" && !day.strength) return `${date} | rest |  |  | none | `;
    if (t === "strength" || (t === "rest" && day.strength)) return `${date} | strength |  |  | ${strength} | `;
    if (t === "cross") return `${date} | cross |  | ${clean(day.session) || "Cross-training"} | ${strength} | `;
    if (isRunWalkDay(day)) return `${date} | run/walk |  | ${workoutShorthand(day.workout)} | ${strength} | ${why}`;
    const type = t === "tempo" ? "workout" : t;
    const text = day.workout ? `${label(day) ? `${label(day)}: ` : ""}${workoutShorthand(day.workout)}` : clean(day.session);
    return `${date} | ${type} | ${Number(day.miles) || ""} | ${text} | ${strength} | ${why}`;
}

// ---------- the prompt ----------

const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const START_TEXT = Object.fromEntries(START_LEVELS);
const GOAL_TEXT = Object.fromEntries(RUN_WALK_GOALS);

function athleteLines(firstName, r = {}, today) {
    const year = Number(String(today || "").slice(0, 4)) || new Date().getFullYear();
    const lines = [`- Name: ${firstName || "the athlete"} (first name only)`];
    if (r.whoTrains === "child") lines.push("- A young athlete (a parent manages the account)");
    if (Number(r.birthYear) > 1900) lines.push(`- Age: about ${year - Number(r.birthYear)}`);
    const add = (label, value) => { if (clean(value)) lines.push(`- ${label}: ${clean(value)}`); };
    add("Main sport", r.primarySport);
    add("Team / level", r.teamOrLevel);
    add("Main goal", r.primaryGoal);
    add("Other goals", r.secondaryGoals);
    if (r.targetEvent || r.targetDate) add("Aiming for", `${r.targetEvent || "an event"}${r.targetDate ? ` on ${shortDay(r.targetDate)}, ${r.targetDate.slice(0, 4)}` : ""}`);
    add("Training right now", r.currentTraining);
    if (r.weeklyMileage !== undefined && r.weeklyMileage !== null && r.weeklyMileage !== "") add("Miles per week right now", r.weeklyMileage);
    add("Strength experience", r.strengthExperience);
    if ((r.availabilityDays || []).length) add("Days they can train", r.availabilityDays.map(d => DAY_NAMES[d] || d).join(", "));
    add("Schedule notes", r.availabilityNotes);
    add("Injuries / limits", r.injuries);
    add("What has worked", r.workedBefore);
    add("What hasn't worked", r.notWorked);
    add("What they want from a coach", r.coachingWants);
    return lines;
}

function settingsLine(s) {
    if (!s) return "";
    const bits = [];
    if (s.mode === "race") bits.push(`${s.raceType} race on ${shortDay(s.raceDate)}`);
    else bits.push("general training");
    if (isRunWalk(s)) bits.push(`run/walk start ("${START_TEXT[s.start] || s.start}"), building to ${String(GOAL_TEXT[s.runWalkGoal] || "running non-stop").toLowerCase()}`);
    else {
        if (s.currentMiles) bits.push(`${s.currentMiles} miles a week now, building to ${s.peakMiles}`);
        if (s.longestRun) bits.push(`longest recent run ${s.longestRun} mi`);
        if (s.goalTime) bits.push(`goal time ${s.goalTime}`);
    }
    if ((s.runDays || []).length) bits.push(`run days ${s.runDays.map(c => WEEKDAY[c]).join(", ")}`);
    if (s.strengthDays) bits.push(`${s.strengthDays} strength session${s.strengthDays === 1 ? "" : "s"} a week (${s.equipment || "gym"})`);
    return bits.join("; ");
}

/** The whole prompt, ready to paste into a chatbot. */
export function buildPrompt({ firstName = "", record = {}, notes = "", plan, from, to = null, scope = "all", today = "" }) {
    const days = daysOf(plan);
    const last = to || days.at(-1)?.date || from;
    const inRange = d => d.date >= from && d.date <= last;
    const weekLines = [];
    (plan?.weeks || []).forEach((w, i) => {
        const shown = (w.days || []).filter(inRange);
        if (!shown.length) return;
        const miles = round1(shown.reduce((t, d) => t + (RUNS.includes(d.type) ? Number(d.miles) || 0 : 0), 0));
        weekLines.push(`# Week ${w.week ?? i + 1}${w.phase ? ` (${w.phase})` : ""} · ${shortDay(shown[0].date)} to ${shortDay(shown.at(-1).date)} · ${miles} mi`);
        for (const d of shown) weekLines.push(dayLine(d));
    });
    const settings = settingsLine(plan?.generator?.settings);
    const race = plan?.raceDate ? days.find(d => d.date === plan.raceDate) : null;
    const library = BUILT_IN_WORKOUTS.map(w => `${w.name} (${w.minutes} min, ${String(w.level || "all levels").toLowerCase()})`).join("; ");
    const runsOnly = scope === "runs";

    return [
        "You're helping me, a running and strength coach, tailor a training plan for one of my clients. I'll paste your answer straight back into my coaching app, which reads it line by line, so please follow the answer format at the end exactly.",
        "",
        "## The athlete",
        ...athleteLines(firstName, record, today),
        "",
        "## My notes about them (the reason for this request)",
        clean(notes) ? String(notes).trim() : "(none: just check the plan and make it fit the athlete above)",
        "",
        "## The plan as it stands",
        settings ? `My app made it with safe progression rules from these settings: ${settings}.` : "I wrote this plan myself.",
        race ? `Race day: ${race.date} (${shortDay(race.date)}). Keep it on that date.` : "",
        "Same format as your answer (lines starting with # are week headings):",
        "```",
        ...weekLines,
        "```",
        "",
        "## Your job",
        `Rewrite every day from ${from} to ${last} for this athlete, following my notes. Keep the plan's overall shape and weekly build unless my notes give a reason to change it. Change only what needs changing; copy the other days as they are.`,
        runsOnly ? "Only change running and cross-training. Copy the STRENGTH column exactly as it is on every line." : "",
        "Coaching rules:",
        "- Weekly running goes up by no more than about 10% (or 3 miles) a week, with an easier week every 3 to 4 weeks.",
        "- Never put two hard days (workouts, long runs, races) back to back.",
        "- At least one full rest day a week. Respect injuries, limits and the days they can't train.",
        "- Easy days are truly easy. The long run is no more than about half the week's miles.",
        "- The last 7 to 10 days before a race get lighter; the day before a race is rest or a very short shakeout.",
        "- For someone who barely runs yet, use run/walk sessions (timed, with walk breaks) and build slowly.",
        "- Strength: 1 to 3 sessions a week, not the day before a long run or a race, lighter in race week.",
        "",
        "## Answer format (important)",
        `Put one line per day, for every date from ${from} to ${last} in date order, inside a single code block, with nothing else inside it. Lines starting with # are ignored, so you can keep the week headings.`,
        "Each line: DATE | TYPE | MILES | WORKOUT | STRENGTH | NOTE",
        "- DATE: YYYY-MM-DD, exactly the dates above (the weekday after it is fine).",
        "- TYPE: one of rest, easy, recovery, long, workout, run/walk, race, cross, strength.",
        "- MILES: the day's total miles as a number, warm-up and cool-down included. Leave it empty for rest, cross, strength and run/walk.",
        "- WORKOUT: how to do it, in this shorthand, parts separated by semicolons:",
        "    warm-up / cool-down: 1.5mi WU, 1mi CD, 5min WU (walking warm-ups on run/walk days)",
        "    reps with a target and the recovery after them: 6x800m @ 5K; 400m jog   or   4x8min @ threshold; 90s jog   or   5x1mi @ 7:05-7:15; 2min jog",
        "    a steady block: 20min @ tempo   or   3mi @ 8:10   ·   a fast finish: last 2mi @ 8:30",
        "    run/walk: 5min WU; 8x1min @ easy; 90s walk; 5min CD   ·   continuous: 5min WU; 25min @ easy; 5min CD",
        "    strides: 4x20s @ strides; 60s walk",
        "    effort words: easy, recovery, steady, marathon pace, half, threshold, tempo, 10K, 5K, hills, strides, hard. Or exact paces per mile (7:05 or 7:05-7:15).",
        "    Plain easy and long runs can just say how they feel: Easy, conversational.",
        "    Cross-training: what and how long, e.g. Bike 40min easy.",
        runsOnly
            ? "- STRENGTH: copy it exactly as it is."
            : "- STRENGTH: none, a session name from my library below, or your own as Title: 3x8 Goblet squat @ 25 lb; 3x10 Push-up; 3x30s Plank.",
        "- NOTE (optional): one short sentence to the athlete about why this session matters.",
        "",
        "Examples:",
        "```",
        "2026-10-05 Mon | rest |  |  | none | ",
        "2026-10-06 Tue | workout | 8 | Cruise intervals: 1.5mi WU; 4x8min @ threshold; 90s jog; 1.5mi CD | none | Builds the pace you can hold for longer.",
        "2026-10-07 Wed | easy | 4 | Easy, conversational | Core 20 | ",
        "2026-10-08 Thu | run/walk |  | 5min WU; 6x2min @ easy; 90s walk; 5min CD | none | Walk breaks are part of the plan.",
        "2026-10-10 Sat | long | 9 | Long run, last 2mi @ 8:30 | none | Finish strong but controlled.",
        "2026-10-11 Sun | cross |  | Bike 40min easy | Beginner Strength Foundation | ",
        "```",
        "After the code block, add a few lines for me (not the athlete) on what you changed and why.",
        "",
        runsOnly ? "" : `My strength library: ${library}.`
    ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n").trim() + "\n";
}

// ---------- reading the answer ----------

const TYPE_WORDS = [
    [/^(rest|off|rest day|day off|none)$/, "rest"],
    [/^(run\s*[/-]?\s*walk|walk\s*[/-]\s*run|runwalk)/, "runwalk"],
    [/^recovery/, "recovery"],
    [/^long/, "long"],
    [/^(easy|aerobic|base|shakeout|run)\b/, "easy"],
    [/^(workout|quality|tempo|interval|speed|threshold|hills?|fartlek|track|progression)/, "workout"],
    [/^race/, "race"],
    [/^(cross|bike|cycl|swim|elliptical|row|hike|walk|yoga|mobility)/, "cross"],
    [/^(strength|gym|lift|weights)/, "strength"]
];
const typeOf = word => TYPE_WORDS.find(([re]) => re.test(clean(word).toLowerCase()))?.[1] || null;

const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;
function dateOf(text) {
    const iso = text.match(/^(\d{4}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const us = text.match(US_DATE);
    return us ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}` : null;
}

const norm = t => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const LIBRARY = BUILT_IN_WORKOUTS.map(w => ({ id: w.id, key: norm(w.name) }));

// "3x8 Goblet squat @ 25 lb" / "3x30s Plank" / "2x10/side Split squat"
const EXERCISE = /^(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?\s*(?:s|sec|secs|seconds|min)?(?:\s*(?:\/\s*side|each(?:\s+side)?|per\s+side))?)\s+(.+?)(?:\s*@\s*(\d+(?:\.\d+)?)\s*(lb|lbs|kg)?)?$/i;

/** The STRENGTH column -> undefined (keep as is), null (none) or a session. */
export function readStrength(text) {
    const t = clean(text);
    if (!t || /^(keep|same|as is|unchanged|-+|—)$/i.test(t)) return { value: undefined };
    if (/^(none|no|rest|n\/a|na|off|0)$/i.test(t)) return { value: null };
    const full = norm(t);
    const exact = LIBRARY.find(l => l.key === full || l.key === norm(t.replace(/\((.*?)\)/g, " ")) && !/\blight(er)?\b/i.test(t.replace(/^[^(]*/, "")));
    if (exact) return { value: strengthFromLibrary(exact.id) };
    // "Core 20 (lighter)" / "Full Body 30 light": the session, a set fewer.
    const light = /\blight(er)?\b/i.test(t);
    const key = norm(t.replace(/\((.*?)\)/g, " ").replace(/\blight(er)?\b/gi, " "));
    const hit = LIBRARY.find(l => l.key === key) || LIBRARY.find(l => key.startsWith(l.key) || (key.length >= 6 && l.key.startsWith(key)));
    if (hit) return { value: strengthFromLibrary(hit.id, { light }) };
    const colon = t.match(/^([^:]{2,60}):\s*(.+)$/);
    const title = colon ? colon[1] : "Strength";
    const exercises = [];
    for (const part of (colon ? colon[2] : t).split(/\s*[;,]\s*/)) {
        const m = part.match(EXERCISE);
        if (!m) continue;
        const kg = /kg/i.test(m[5] || "");
        exercises.push({ name: m[3].slice(0, 80), sets: Number(m[1]), reps: m[2].replace(/\s+/g, " ").slice(0, 12), weight: m[4] ? Math.round(Number(m[4]) * (kg ? 2.20462 : 1)) : null, restSec: 90 });
    }
    const custom = sanitizeStrength({ title, minutes: exercises.length * 6 || null, exercises });
    return custom ? { value: custom } : { value: undefined, problem: `strength "${t}" wasn't understood, so it was left as it was` };
}

const minText = m => (m < 1 ? `${Math.round(m * 60)} sec` : m % 1 ? `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}` : `${m} min`);
function runWalkText(workout) {
    const set = workout.sets?.[0];
    const total = timedMinutes(workout);
    if (!set) return "Run/walk";
    if (set.repeat === 1 && workout.sets.length === 1) return `Easy run ${set.amount} min (${workout.warmup ? `${workout.warmup.amount} min walk before` : ""}${workout.warmup && workout.cooldown ? " and " : ""}${workout.cooldown ? `${workout.cooldown.amount} min walk after` : ""})`.replace(" ()", "");
    return `Run/walk about ${total ?? ""} min: ${set.repeat} × ${minText(set.amount)} run${set.recovery ? `, ${minText(set.recovery.amount)} walk` : ""}`;
}
// About 12 min a mile running, 17 walking (as the run/walk plans estimate).
function timedMiles(workout) {
    let run = 0, walk = 0;
    const add = (step, times, walking) => { if (step?.unit === "min") (walking ? (walk += step.amount * times) : (run += step.amount * times)); };
    add(workout.warmup, 1, /walk/i.test(workout.warmup?.note || "walk"));
    for (const s of workout.sets || []) { add(s, s.repeat, false); add(s.recovery, Math.max(0, s.repeat - 1), /walk/i.test(s.recovery?.note || "")); }
    add(workout.cooldown, 1, /walk/i.test(workout.cooldown?.note || "walk"));
    return Math.max(0.5, Math.round((run / 12 + walk / 17) * 2) / 2);
}

/** One line -> a day's new prescription, or { problem }. */
export function readLine(line) {
    let text = clean(line).replace(/\*\*|__|`/g, "").replace(/^[-*•>]+\s*/, "").replace(/^\|\s*/, "").replace(/\s*\|$/, "")
        .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(?=\d)/i, "");
    const date = dateOf(text);
    if (!date) return null;
    const cols = text.split("|").map(c => clean(c));
    // First column: the date (and maybe the weekday).
    cols.shift();
    let [typeWord = "", milesText = "", workoutText = "", strengthText, note = ""] = cols;
    // Miles left out and the workout moved over: shift back.
    if (milesText && !/^\d+(\.\d+)?\s*(mi|miles?)?$/i.test(milesText) && cols.length <= 4) {
        [milesText, workoutText, strengthText, note] = ["", milesText, workoutText, strengthText || ""];
    }
    const kind = typeOf(typeWord);
    if (!kind) return { date, problem: `"${typeWord || "(empty)"}" isn't a day type` };
    const miles = Number(String(milesText).replace(/[^\d.]/g, "")) || 0;
    const problems = [];
    const strength = readStrength(strengthText);
    if (strength.problem) problems.push(strength.problem);
    const rx = { type: "rest", miles: 0, session: "" };
    let workout = null;

    if (kind === "rest") { /* nothing */ }
    else if (kind === "strength") Object.assign(rx, { type: "strength", miles: 0 });
    else if (kind === "cross") Object.assign(rx, { type: "cross", miles: 0, session: workoutText || "Cross-training" });
    else if (kind === "race") {
        if (!miles) problems.push("no race distance given");
        Object.assign(rx, { type: "race", miles: miles || 0, session: workoutText || "Race day" });
    } else if (kind === "runwalk") {
        // "4 strides" would read as 4 miles: make it reps.
        const body = workoutText.replace(/\b(\d+)\s*(?:x\s*)?strides?\b(?!\s*@)/gi, "$1x20s @ strides");
        const read = planDayFromMarathon({ session: body, miles: 3, pace: "easy" }, []);
        workout = read.workout;
        if (!workout || timedMinutes(workout) === null) {
            problems.push("the run/walk wasn't in minutes (e.g. 5min WU; 8x1min @ easy; 90s walk; 5min CD)");
            if (!workout) workout = null;
        }
        if (workout) {
            if (workout.warmup) workout.warmup.note = "brisk walk";
            if (workout.cooldown) workout.cooldown.note = "walk";
            for (const s of workout.sets || []) { s.effort = s.effort && s.effort !== "hard" ? s.effort : "easy"; if (s.recovery) s.recovery.note = "walk"; }
        }
        Object.assign(rx, { type: "easy", miles: miles || (workout ? timedMiles(workout) : 2) });
        rx.session = workout && timedMinutes(workout) !== null ? runWalkText(workout) : workoutText || "Run/walk";
        for (const u of read.unread || []) problems.push(`"${u}" wasn't understood`);
    } else {
        if (!miles) problems.push("no miles given");
        const body = workoutText.replace(/\b(\d+)\s*(?:x\s*)?strides?\b(?!\s*@)/gi, "$1x20s @ strides");
        const labelWord = { easy: "easy", recovery: "recovery", long: "long run" }[kind] || "";
        const read = planDayFromMarathon({ session: body || (kind === "long" ? "Long run" : kind), miles: miles || 1, pace: labelWord }, []);
        workout = read.workout;
        for (const u of read.unread || []) problems.push(`"${u}" wasn't understood`);
        const off = (read.notes || []).length && miles ? read.notes[0].match(/about ([\d.]+) mi/) : null;
        if (off && Math.abs(Number(off[1]) - miles) >= 1) problems.push(`the parts add up to about ${off[1]} mi, not ${miles}`);
        const lab = (workoutText.match(/^([^:]{2,40}):\s/) || [])[1];
        rx.type = kind;
        rx.miles = miles;
        rx.session = workout && kind === "workout"
            ? `${lab ? `${lab}: ` : ""}${workoutSummary(sanitizeWorkout(workout))}`
            : workoutText || { easy: "Easy, conversational", recovery: "Very easy", long: "Long run" }[kind] || "";
    }
    if (workout) {
        workout.why = clean(note).slice(0, 300);
        workout = sanitizeWorkout(workout);
        if (workout && !rx.miles && plannedMiles(workout).exact) rx.miles = plannedMiles(workout).miles;
        if (workout) rx.workout = workout;
    } else if (clean(note) && rx.type !== "rest") {
        rx.session = `${rx.session}${rx.session ? " — " : ""}${clean(note)}`;
    }
    rx.session = String(rx.session).slice(0, 300);
    return { date, rx, strength: strength.value, problems };
}

// A line compared by what it says, not how it's spaced or decorated.
function lineKey(line) {
    const text = clean(line).replace(/\*\*|__|`/g, "").replace(/^[-*•>]+\s*/, "").replace(/^\|\s*/, "").replace(/\s*\|$/, "")
        .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(?=\d)/i, "");
    const cols = text.split("|").map(c => clean(c).toLowerCase());
    cols[0] = dateOf(cols[0]) || cols[0];
    while (cols.length < 6) cols.push("");
    if (/^\d+(\.\d+)?$/.test(cols[2])) cols[2] = String(Number(cols[2]));
    return cols.slice(0, 6).join("|");
}

/**
 * The chatbot's whole answer ->
 *   { days: [{ date, rx, strength }], unread: [{ line, why }], skipped: [{ date, why }], problems: [{ date, why }],
 *     same: how many days came back exactly as they were (left untouched) }
 */
export function parseReply(text, { plan, from, to = null, done = new Set(), scope = "all" } = {}) {
    const byDate = new Map(daysOf(plan).map(d => [d.date, d]));
    const out = { days: [], unread: [], skipped: [], problems: [], same: 0 };
    const seen = new Set();
    for (const raw of String(text || "").split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("```") || /^\|?\s*:?-{3,}/.test(line)) continue;
        const read = readLine(line);
        if (!read) {
            // A line that looks like a plan line but has no date we can read.
            if (/\|/.test(line) && /\b(rest|easy|long|workout|run\/walk|race|cross|strength)\b/i.test(line) && !/^\|?\s*date\b/i.test(line)) out.unread.push({ line, why: "no date (YYYY-MM-DD) at the start" });
            continue;
        }
        if (read.problem) { out.unread.push({ line, why: read.problem }); continue; }
        if (!byDate.has(read.date)) { out.skipped.push({ date: read.date, why: "not a date in this plan" }); continue; }
        if (read.date < from || (to && read.date > to)) { out.skipped.push({ date: read.date, why: read.date < from ? "before the dates you asked about" : "after the dates you asked about" }); continue; }
        if (done.has(read.date)) { out.skipped.push({ date: read.date, why: "marked done by the client" }); continue; }
        if (seen.has(read.date)) { out.problems.push({ date: read.date, why: "listed twice; the first one was used" }); continue; }
        seen.add(read.date);
        // Copied back as it was: the day stays exactly as it is (cue, fuel note and all).
        if (lineKey(line) === lineKey(dayLine(byDate.get(read.date)))) { out.same++; continue; }
        for (const why of read.problems) out.problems.push({ date: read.date, why });
        out.days.push({ date: read.date, rx: read.rx, strength: scope === "runs" ? undefined : read.strength });
    }
    return out;
}

/** The days read from the answer, applied to a copy of the plan. */
export function applyReply(plan, days) {
    const next = clone(plan);
    const byDate = new Map(daysOf(next).map(d => [d.date, d]));
    for (const { date, rx, strength } of days) {
        const day = byDate.get(date);
        if (!day) continue;
        const keep = strength === undefined ? clone(day.strength) : strength;
        const fresh = { ...rx };
        if (keep) fresh.strength = keep;
        if (fresh.type === "strength") {
            if (keep) fresh.session = keep.title;
            else { fresh.type = "rest"; fresh.session = ""; }
        }
        if (fresh.type === "rest" && keep) { fresh.type = "strength"; fresh.session = keep.title; }
        applyPrescription(day, fresh);
    }
    return recalcPlannedMiles(next);
}

// ---------- safety checks ----------

/** Plain warnings about the plan from `from` on. */
export function checkPlan(plan, { from = "", record = null } = {}) {
    const out = [];
    const weeks = (plan?.weeks || []).map((w, i) => ({ i, w, days: (w.days || []) }));
    const runMiles = days => round1(days.reduce((t, d) => t + (RUNS.includes(d.type) && d.type !== "race" ? Number(d.miles) || 0 : 0), 0));
    // Weekly jumps (full weeks only, from the week holding `from`).
    for (let k = 1; k < weeks.length; k++) {
        const a = weeks[k - 1], b = weeks[k];
        if (b.days.at(-1)?.date < from || b.days.length < 7 || a.days.length < 7) continue;
        if (b.days.some(d => d.type === "race")) continue;
        // Against the bigger of the last two weeks: coming back after an easier week is fine.
        const ma = Math.max(runMiles(a.days), k >= 2 && weeks[k - 2].days.length === 7 ? runMiles(weeks[k - 2].days) : 0);
        const mb = runMiles(b.days);
        if (ma > 0 && mb > ma * 1.15 && mb - ma > 3) out.push(`Week ${b.w.week ?? b.i + 1} jumps from ${ma} to ${mb} miles (+${Math.round((mb / ma - 1) * 100)}%).`);
    }
    const all = weeks.flatMap(x => x.days).filter(d => d.date >= from);
    // Hard days back to back.
    const pairs = [];
    for (let k = 1; k < all.length; k++) if (HARD.includes(all[k].type) && HARD.includes(all[k - 1].type)) pairs.push(`${shortDay(all[k - 1].date)} and ${shortDay(all[k].date)}`);
    if (pairs.length) out.push(`Hard days back to back: ${pairs.slice(0, 3).join("; ")}${pairs.length > 3 ? ` and ${pairs.length - 3} more` : ""}.`);
    for (const { w, i, days } of weeks) {
        if (days.at(-1)?.date < from) continue;
        const total = runMiles(days);
        const runs = days.filter(d => RUNS.includes(d.type) && d.type !== "race");
        const long = Math.max(0, ...days.filter(d => d.type === "long").map(d => Number(d.miles) || 0));
        if (runs.length >= 3 && long > total * 0.55 && long >= 6) out.push(`Week ${w.week ?? i + 1}: the long run (${long} mi) is ${Math.round((long / total) * 100)}% of the week.`);
        if (days.length === 7 && days.every(d => d.type !== "rest")) out.push(`Week ${w.week ?? i + 1} has no rest day.`);
    }
    const bigEasy = all.filter(d => ["easy", "recovery"].includes(d.type) && Number(d.miles) > 12);
    if (bigEasy.length) out.push(`Very long easy days: ${bigEasy.slice(0, 3).map(d => `${shortDay(d.date)} (${d.miles} mi)`).join(", ")}.`);
    if (plan?.raceDate && plan.raceDate >= from) {
        const race = all.find(d => d.date === plan.raceDate);
        if (race && race.type !== "race") out.push(`Race day (${shortDay(plan.raceDate)}) isn't a race any more.`);
        const before = all.find(d => d.date === addDaysIso(plan.raceDate, -1));
        if (before && HARD.includes(before.type)) out.push(`The day before the race (${shortDay(before.date)}) is a hard day.`);
    }
    const can = (record?.availabilityDays || []).map(d => String(d).toUpperCase());
    if (can.length) {
        const off = all.filter(d => d.type !== "rest" && !can.includes(d.day || codeOf(d.date)));
        if (off.length) out.push(`Sessions on days they said they can't train: ${off.slice(0, 4).map(d => shortDay(d.date)).join(", ")}${off.length > 4 ? ` and ${off.length - 4} more` : ""}.`);
    }
    return out;
}
function addDaysIso(date, n) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

