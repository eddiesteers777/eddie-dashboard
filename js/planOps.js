/* ==========================================
   Southbound — the coach's weekly workspace operations (pure)

   What the plan editor (js/planWorkspace.js) does to a plan in one move:
     - move a day's workout to another date (the two days swap, so
       nothing is lost), copy it to another date, copy it to the same
       weekday next week, clear it to rest
     - copy a whole week onto another, clear a week
     - the coach's library: save a day (run, strength, or both) or a
       whole week as a reusable entry, and apply one to a day / week.
       Built-in Southbound run workouts come ready to use.
   A day's prescription is its type, miles, session text, structured run
   (`workout`, js/runWorkout.js) and strength session (`strength`,
   js/strengthWorkout.js). The date and the client's own marks never
   move. No DOM or storage. Unit-tested in tests/planOps.test.mjs.
========================================== */

import { recalcPlannedMiles, typeLabel } from "./coachingPlanModel.js";
import { sanitizeWorkout, workoutSummary, plannedMiles } from "./runWorkout.js";
import { strengthSummary } from "./strengthWorkout.js";

export const PRESCRIPTION_KEYS = ["type", "miles", "session", "workout", "strength"];
export const REST = Object.freeze({ type: "rest", miles: 0, session: "" });

export const RUN_FOLDERS = ["Easy", "Recovery", "Tempo", "Threshold", "Intervals", "Hills", "Long Runs", "Race Specific", "Taper"];
export const STRENGTH_FOLDERS = ["Upper", "Lower", "Full Body", "Runner Strength", "Mobility", "Recovery", "Pre-race", "Post-race"];

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// ---------- One day ----------

export function prescriptionOf(day) {
    const rx = {};
    for (const key of PRESCRIPTION_KEYS) if (day && day[key] !== undefined) rx[key] = clone(day[key]);
    if (!rx.type) rx.type = "rest";
    if (rx.miles === undefined) rx.miles = 0;
    if (rx.session === undefined) rx.session = "";
    return rx;
}

export function applyPrescription(day, rx) {
    for (const key of PRESCRIPTION_KEYS) delete day[key];
    Object.assign(day, clone({ ...REST, ...rx }));
    return day;
}

export const isRest = day => (!day?.type || day.type === "rest") && !day?.strength;

function daysOf(plan) {
    return (plan?.weeks || []).flatMap(w => w.days || []);
}

function dayAt(plan, date) {
    return daysOf(plan).find(d => d.date === date) || null;
}

// "Tue, Sep 29" style label is the caller's; this is the workout itself.
export function prescriptionText(rx) {
    if (!rx || (rx.type === "rest" && !rx.strength)) return "Rest";
    const parts = [];
    if (rx.type && rx.type !== "rest" && !(rx.type === "strength" && rx.strength)) {
        const miles = Number(rx.miles) ? `${Math.round(rx.miles * 10) / 10} mi ` : "";
        const session = String(rx.session || "").trim();
        parts.push(`${miles}${typeLabel(rx.type)}${session && session.toLowerCase() !== rx.type ? ` (${session})` : ""}`);
    }
    if (rx.strength) parts.push(strengthSummary(rx.strength));
    return parts.join(" + ");
}

// Swap two days' workouts. Returns the plan.
export function moveDay(plan, fromDate, toDate) {
    const from = dayAt(plan, fromDate);
    const to = dayAt(plan, toDate);
    if (!from || !to || from === to) return plan;
    const a = prescriptionOf(from);
    applyPrescription(from, prescriptionOf(to));
    applyPrescription(to, a);
    return recalcPlannedMiles(plan);
}

export function copyDay(plan, fromDate, toDate) {
    const from = dayAt(plan, fromDate);
    const to = dayAt(plan, toDate);
    if (!from || !to || from === to) return plan;
    applyPrescription(to, prescriptionOf(from));
    return recalcPlannedMiles(plan);
}

export function clearDay(plan, date) {
    const day = dayAt(plan, date);
    if (day) applyPrescription(day, REST);
    return recalcPlannedMiles(plan);
}

// The same weekday one week later, if the plan has it.
export function nextWeekDate(plan, date) {
    const days = daysOf(plan);
    const i = days.findIndex(d => d.date === date);
    return i >= 0 && days[i + 7] ? days[i + 7].date : null;
}

// ---------- Whole weeks ----------

export function copyWeek(plan, fromIndex, toIndex) {
    const from = plan?.weeks?.[fromIndex];
    const to = plan?.weeks?.[toIndex];
    if (!from || !to || from === to) return plan;
    (to.days || []).forEach((day, i) => {
        const src = from.days?.[i];
        applyPrescription(day, src ? prescriptionOf(src) : REST);
    });
    to.supplemental = clone(from.supplemental || []);
    if (!to.phase && from.phase) to.phase = from.phase;
    return recalcPlannedMiles(plan);
}

export function clearWeek(plan, index) {
    const week = plan?.weeks?.[index];
    if (!week) return plan;
    (week.days || []).forEach(day => applyPrescription(day, REST));
    week.supplemental = [];
    return recalcPlannedMiles(plan);
}

// ---------- Library ----------

export function kindOfPrescription(rx) {
    const run = rx.type && !["rest", "strength", "cross"].includes(rx.type);
    if (run && rx.strength) return "run+strength";
    if (run) return "run";
    if (rx.strength || rx.type === "strength") return "strength";
    if (rx.type === "cross") return "cross";
    return "rest";
}

/** A library entry from a day: { id, name, folder, kind, rx, updatedAt }. */
export function dayEntry(day, { name, folder = "", id, now = Date.now() } = {}) {
    const rx = prescriptionOf(day);
    return {
        id: id || `lib-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(name || prescriptionText(rx)).trim().slice(0, 80),
        folder: String(folder || "").slice(0, 40),
        kind: kindOfPrescription(rx),
        rx,
        updatedAt: now
    };
}

/** A week template: the seven days, Monday first. */
export function weekEntry(week, { name, id, now = Date.now() } = {}) {
    return {
        id: id || `wk-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(name || "Week").trim().slice(0, 80),
        folder: "Weeks",
        kind: "week",
        days: (week.days || []).map(prescriptionOf),
        miles: Math.round((week.days || []).reduce((s, d) => s + (Number(d.miles) || 0), 0) * 10) / 10,
        updatedAt: now
    };
}

// A library day onto a plan day. A strength-only entry dropped on a run
// day adds the session to the run instead of replacing it.
export function applyEntryToDay(plan, date, entry) {
    const day = dayAt(plan, date);
    if (!day || !entry?.rx) return plan;
    const runDay = day.type && !["rest", "strength", "cross"].includes(day.type);
    if (entry.kind === "strength" && runDay) {
        day.strength = clone(entry.rx.strength);
    } else {
        applyPrescription(day, entry.rx);
    }
    return recalcPlannedMiles(plan);
}

export function applyWeekEntry(plan, index, entry) {
    const week = plan?.weeks?.[index];
    if (!week || !Array.isArray(entry?.days)) return plan;
    (week.days || []).forEach((day, i) => applyPrescription(day, entry.days[i] || REST));
    return recalcPlannedMiles(plan);
}

// ---------- Built-in Southbound run workouts ----------

function builtIn(id, folder, name, type, workout, extra = {}) {
    const clean = sanitizeWorkout(workout);
    const { miles } = plannedMiles(clean);
    return {
        id: `sb-${id}`, name, folder, kind: "run", builtIn: true,
        rx: { type, miles: extra.miles ?? miles, session: (extra.session ?? workoutSummary(clean)).slice(0, 300), ...(clean ? { workout: clean } : {}) }
    };
}

const easy = (amount, note = "easy") => ({ amount, unit: "mi", note });

// Effort-based targets: the coach adds the client's paces after inserting.
export const BUILT_IN_RUNS = [
    builtIn("easy-5", "Easy", "Easy run", "easy", null, { miles: 5, session: "Easy, conversational" }),
    builtIn("easy-strides", "Easy", "Easy + strides", "easy",
        { warmup: easy(4), sets: [{ repeat: 6, amount: 0.5, unit: "min", effort: "fast, relaxed", recovery: { amount: 1, unit: "min", note: "walk / jog" } }], why: "Keeps leg speed in an easy week without adding fatigue.", cue: "Smooth and tall, not a sprint." }, { miles: 4.5 }),
    builtIn("recovery-3", "Recovery", "Recovery jog", "recovery", null, { miles: 3, session: "Very easy -- slower than you think" }),
    builtIn("tempo-3x1", "Tempo", "Tempo 3 × 1 mi", "workout",
        { warmup: easy(1.5), sets: [{ repeat: 3, amount: 1, unit: "mi", effort: "tempo", recovery: { amount: 2, unit: "min", note: "easy jog" } }], cooldown: easy(1.5), why: "Raises the pace you can hold before fatigue builds.", cue: "Controlled -- the last rep should look like the first." }),
    builtIn("tempo-cont", "Tempo", "Continuous tempo 20 min", "workout",
        { warmup: easy(2), sets: [{ repeat: 1, amount: 20, unit: "min", effort: "tempo" }], cooldown: easy(1.5), why: "Practice holding a strong, steady effort.", cue: "Settle in; don't start too fast." }, { miles: 6 }),
    builtIn("threshold-cruise", "Threshold", "Cruise intervals 4 × 8 min", "workout",
        { warmup: easy(2), sets: [{ repeat: 4, amount: 8, unit: "min", effort: "threshold", recovery: { amount: 1.5, unit: "min", note: "easy jog" } }], cooldown: easy(1.5), why: "Lots of time at threshold with short breaks keeps it controlled.", cue: "Even effort on every rep." }, { miles: 7.5 }),
    builtIn("int-800s", "Intervals", "6 × 800 m", "workout",
        { warmup: easy(2), sets: [{ repeat: 6, amount: 800, unit: "m", effort: "5K", recovery: { amount: 400, unit: "m", note: "easy jog" } }], cooldown: easy(1.5), why: "Builds VO2max and comfort running fast.", cue: "Relax your shoulders and hands; run the last one fastest." }),
    builtIn("int-400s", "Intervals", "10 × 400 m", "workout",
        { warmup: easy(2), sets: [{ repeat: 10, amount: 400, unit: "m", effort: "mile to 3K", recovery: { amount: 200, unit: "m", note: "easy jog" } }], cooldown: easy(1.5), why: "Speed and running economy.", cue: "Quick feet, tall posture." }),
    builtIn("hills-60", "Hills", "Hill repeats 8 × 1 min", "workout",
        { warmup: easy(2), sets: [{ repeat: 8, amount: 1, unit: "min", effort: "hard uphill", recovery: { amount: 2, unit: "min", note: "jog back down" } }], cooldown: easy(1.5), why: "Strength and power with less pounding than flat speed work.", cue: "Drive the arms, short quick steps, eyes up the hill." }, { miles: 5.5 }),
    builtIn("long-easy", "Long Runs", "Long run", "long", null, { miles: 12, session: "Easy and steady" }),
    builtIn("long-ff", "Long Runs", "Long run, fast finish", "long",
        { sets: [{ repeat: 1, amount: 10, unit: "mi", effort: "easy" }, { repeat: 1, amount: 2, unit: "mi", effort: "marathon" }], why: "Practice finishing strong on tired legs.", cue: "Patience early; earn the fast finish." }),
    builtIn("mp-3x2", "Race Specific", "Marathon pace 3 × 2 mi", "workout",
        { warmup: easy(2), sets: [{ repeat: 3, amount: 2, unit: "mi", effort: "marathon", recovery: { amount: 0.5, unit: "mi", note: "easy jog" } }], cooldown: easy(1), why: "Dial in race pace and fueling.", cue: "Practice your race-day gel on the second rep." }),
    builtIn("taper-sharpener", "Taper", "Taper sharpener", "workout",
        { warmup: easy(2), sets: [{ repeat: 4, amount: 3, unit: "min", effort: "race", recovery: { amount: 2, unit: "min", note: "easy jog" } }], cooldown: easy(1), why: "Keeps you sharp while the legs freshen up.", cue: "It should feel easy. Save it for race day." }, { miles: 5 })
];
