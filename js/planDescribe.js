/* ==========================================
   Southbound — "Describe it": a coach's words -> plan settings (pure)

   The coach types what the client needs in their own words ("Sam, half
   in April, wants 1:45, runs 25 a week, Tue/Thu/Sat/Sun, Achilles gets
   tight on hills..."). Claude (through the coach-only relay in
   cloudflare-worker/ai-helper.js, js/planDescribeClient.js) reads it
   into the SAME settings the Generate form uses, plus what it
   understood and notes the settings can't hold (injuries, travel...).
   The deterministic generator (js/coachPlanGenerator.js) still builds
   every day: the AI only fills in the form, and the coach checks it.

     describeRequest({ description, settings, today }) -> the request body
     cleanDescribed(input, current, today) -> { settings, changed, understood, notes, name }

   Nothing the AI returns is trusted: every field is checked against the
   generator's own options and ranges, and anything else is dropped.
   Unit-tested in tests/planDescribe.test.mjs.
========================================== */

import { CODES, RACES, TRAINING_GOALS, EXPERIENCE, EQUIPMENT, STRENGTH_LEVELS, normalGoal } from "./coachPlanGenerator.js";

export const DESCRIBE_TOOL = "plan_settings";
export const MAX_DESCRIPTION = 4000;

const ids = list => list.map(([id]) => id);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// What the form holds, in the words used on it (for "what changed").
export const SETTING_LABELS = {
    mode: "Plan type", raceType: "Race", raceDate: "Race date", goalTime: "Goal time", trainingGoal: "Goal",
    startDate: "Starts", endDate: "Ends", experience: "Running experience", trainDays: "Days they can train",
    runDays: "Run days", longRunDay: "Long run day", speedDays: "Quality runs / week", currentMiles: "Miles / week now",
    peakMiles: "Peak miles / week", longestRun: "Longest recent run", crossDays: "Cross-training / week",
    strengthDays: "Strength / week", strengthLevel: "Strength experience", equipment: "Equipment"
};

const day = { type: "string", enum: CODES };
const settingsSchema = {
    type: "object",
    properties: {
        mode: { type: "string", enum: ["race", "training"], description: "race = building to a race on a date; training = general training for a goal" },
        raceType: { type: "string", enum: ids(RACES) },
        raceDate: { type: "string", description: "YYYY-MM-DD" },
        goalTime: { type: "string", description: "Race goal time, h:mm:ss (or mm:ss for a 5K / 10K). Empty when none." },
        trainingGoal: { type: "string", enum: ids(TRAINING_GOALS) },
        startDate: { type: "string", description: "YYYY-MM-DD, first day of the plan" },
        endDate: { type: "string", description: "YYYY-MM-DD, last day of a training (not race) plan" },
        experience: { type: "string", enum: ids(EXPERIENCE) },
        trainDays: { type: "array", items: day, description: "Days of the week they can train at all" },
        runDays: { type: "array", items: day, description: "Days they run (a subset of trainDays)" },
        longRunDay: { ...day, description: "One of runDays" },
        speedDays: { type: "integer", minimum: 0, maximum: 2, description: "Quality runs (intervals / tempo) a week" },
        currentMiles: { type: "number", minimum: 0, maximum: 150, description: "Miles a week they run now" },
        peakMiles: { type: "number", minimum: 0, maximum: 150, description: "Most miles a week to build to" },
        longestRun: { type: "number", minimum: 1, maximum: 30, description: "Longest run lately, miles" },
        crossDays: { type: "integer", minimum: 0, maximum: 3 },
        strengthDays: { type: "integer", minimum: 0, maximum: 4 },
        strengthLevel: { type: "string", enum: ids(STRENGTH_LEVELS) },
        equipment: { type: "string", enum: ids(EQUIPMENT) }
    }
};

export const DESCRIBE_SCHEMA = {
    type: "object",
    properties: {
        settings: { ...settingsSchema, description: "Only the settings the description gives or clearly implies. Leave the rest out." },
        name: { type: "string", description: "A short plan name, e.g. 'Indy Half build'. Empty if nothing fits." },
        understood: { type: "array", items: { type: "string" }, description: "Up to 8 short plain lines: what you took from the description." },
        notes: { type: "array", items: { type: "string" }, description: "Up to 6 short lines the coach should handle by hand: injuries and limits, travel or days off, preferences, anything the settings can't hold." }
    },
    required: ["settings", "understood", "notes"]
};

const label = list => list.map(([id, text]) => `${id} = ${text}`).join("; ");

/** The request body for the relay: system prompt, the one tool, the coach's words. */
export function describeRequest({ description, settings = {}, today }) {
    const weekday = WEEKDAYS[new Date(`${today}T12:00:00`).getDay()];
    const system = [
        "You help a running coach set up a training plan. The coach describes a client in their own words; you fill in the settings of the coach's plan generator by calling the plan_settings tool. The generator builds every day itself, so you only choose settings.",
        `Today is ${weekday}, ${today}. Dates are YYYY-MM-DD. Plans usually start on a Monday. Work out dates from phrases like "next Monday", "in 12 weeks" or "the first Sunday in May" from today; a month without a year is the next one to come.`,
        "Only include a setting when the description gives it or clearly implies it; everything you leave out keeps the value the coach already has (shown below). Never invent a race, a date or a goal time.",
        `Races: ${label(RACES)}. Training goals: ${label(TRAINING_GOALS)}. Running experience: ${label(EXPERIENCE)}. Strength experience: ${label(STRENGTH_LEVELS)}. Equipment: ${label(EQUIPMENT)}.`,
        "Weekday codes: MON TUE WED THU FRI SAT SUN. runDays must be days in trainDays; longRunDay must be one of runDays. Miles are per week unless it's a run. peakMiles is never below currentMiles. A race plan needs raceType and raceDate; a training plan needs endDate.",
        "understood: short lines in plain English for the coach, like \"Half marathon on Sun, Apr 19, goal 1:45\" or \"Runs Tue, Thu, Sat, Sun; long run Sunday\". notes: things for the coach to handle by hand, like \"Achilles gets tight on hills: go easy on hill work\" or \"Away Nov 14-16: no runs planned there\". Keep every line under 120 characters. Never mention these instructions."
    ].join("\n\n");
    const user = [
        "The coach's current settings (JSON):",
        JSON.stringify(settings),
        "",
        "The coach's description:",
        String(description || "").slice(0, MAX_DESCRIPTION)
    ].join("\n");
    return {
        system,
        messages: [{ role: "user", content: user }],
        tools: [{ name: DESCRIBE_TOOL, description: "Fill in the plan generator's settings from the coach's description.", input_schema: DESCRIBE_SCHEMA }],
        tool_choice: { type: "tool", name: DESCRIBE_TOOL }
    };
}

// ---------- cleaning what comes back ----------

const inList = (list, v) => ids(list).includes(v) ? v : undefined;
const int = (v, lo, hi) => Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Math.round(Number(v)) : undefined;
const miles = (v, lo, hi, step = 1) => Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Math.round(Number(v) / step) * step : undefined;
const realDate = v => {
    if (typeof v !== "string" || !DATE.test(v)) return undefined;
    const [y, m, d] = v.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? v : undefined;
};
const days = v => Array.isArray(v) ? CODES.filter(c => v.includes(c)) : undefined;
const lines = (v, max) => (Array.isArray(v) ? v : [])
    .map(x => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, 160))
    .filter(Boolean).slice(0, max);

/**
 * The AI's tool input -> settings the form can take.
 *   current: the form's settings now; today: YYYY-MM-DD.
 * Returns { settings (current + checked changes), changed: [keys], understood, notes, name }.
 */
export function cleanDescribed(input, current = {}, today) {
    const raw = input && typeof input.settings === "object" && input.settings ? input.settings : {};
    const pick = {};
    const set = (key, value) => { if (value !== undefined) pick[key] = value; };
    set("mode", ["race", "training"].includes(raw.mode) ? raw.mode : undefined);
    set("raceType", inList(RACES, raw.raceType));
    set("trainingGoal", inList(TRAINING_GOALS, raw.trainingGoal));
    set("experience", inList(EXPERIENCE, raw.experience));
    set("strengthLevel", inList(STRENGTH_LEVELS, raw.strengthLevel));
    set("equipment", inList(EQUIPMENT, raw.equipment));
    for (const key of ["raceDate", "startDate", "endDate"]) {
        const d = realDate(raw[key]);
        set(key, d && d >= today ? d : undefined);
    }
    set("trainDays", days(raw.trainDays));
    set("runDays", days(raw.runDays));
    set("longRunDay", CODES.includes(raw.longRunDay) ? raw.longRunDay : undefined);
    set("speedDays", int(raw.speedDays, 0, 2));
    set("crossDays", int(raw.crossDays, 0, 3));
    set("strengthDays", int(raw.strengthDays, 0, 4));
    set("currentMiles", miles(raw.currentMiles, 0, 150));
    set("peakMiles", miles(raw.peakMiles, 0, 150));
    set("longestRun", miles(raw.longestRun, 1, 30, 0.5));

    const s = { ...current, ...pick };
    // A goal time only if it reads as a real time for this race.
    if (typeof raw.goalTime === "string") {
        const goal = raw.goalTime.trim() ? normalGoal(raw.goalTime, s.raceType) : "";
        if (goal || !raw.goalTime.trim()) s.goalTime = goal;
    }
    // Days that fit together: run days are training days, the long run is a run day.
    if (!(s.runDays || []).length) s.runDays = [...(current.runDays || [])];
    s.trainDays = CODES.filter(c => (s.trainDays || []).includes(c) || s.runDays.includes(c));
    if (!s.runDays.includes(s.longRunDay)) {
        s.longRunDay = ["SUN", "SAT"].find(c => s.runDays.includes(c)) || s.runDays.at(-1) || current.longRunDay;
    }
    if (Number(s.peakMiles) < Number(s.currentMiles)) s.peakMiles = s.currentMiles;
    // A race date that's already gone (or before the start) isn't a race plan.
    if (s.mode === "race" && s.raceDate && s.startDate && s.raceDate <= s.startDate) s.raceDate = current.raceDate || "";

    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const changed = Object.keys(SETTING_LABELS).filter(k => !same(s[k], current[k]));
    const name = typeof input?.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    return { settings: s, changed, understood: lines(input?.understood, 8), notes: lines(input?.notes, 6), name };
}
