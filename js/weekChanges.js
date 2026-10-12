/* ==========================================
   Southbound — changing your own week (pure)

   An athlete can rearrange real life around their training without
   waiting on anyone, for running and strength sessions:
     - Move a workout to another day of the same week (today on).
       A plan's run swaps with whatever that plan had on the new day
       (js/planOps.js moveDay); a Strength schedule workout just moves.
       A workout missed earlier this week can move to a free day, today
       or later (whatever is on a busy day can't swap back into the past).
     - Skip it on purpose, with a reason (a skip is a decision, a
       "missed" is not).
     - "Not feeling 100%": for 1–7 days, every run becomes an easy run,
       a shorter easy run, or a rest day; strength kept or skipped.
       Race days are never changed.

   Who can change what (changeMode):
     "self"  plans they made (Race Plans, Training Plans) and their
             Strength schedule: changed on the spot, with Undo.
     "coach" the coach's plan: its source of truth is the coach's
             published plan, so moves and adjustments become a request
             to the coach in plain words (js/changeRequests.js); a skip
             is logged as "skipped" with the reason (js/workoutResults.js),
             which the coach already sees.

   Items come from js/weekModel.js. No DOM, no storage: the writes are
   js/weekChangeData.js, the dialogs js/weekChangeDialogs.js.
   Unit-tested in tests/weekChanges.test.mjs.
========================================== */

import { shortDay } from "./coachingPlanModel.js";

export const SKIP_REASONS = [
    { value: "busy", label: "Too busy" },
    { value: "tired", label: "Feeling run down" },
    { value: "sore", label: "Sore or hurting" },
    { value: "sick", label: "Sick" },
    { value: "travel", label: "Travel" },
    { value: "weather", label: "Weather" },
    { value: "other", label: "Something else" }
];
export const skipReasonLabel = value => SKIP_REASONS.find(r => r.value === value)?.label || "";

export const FEEL_DAYS = [1, 3, 5, 7];
export const FEEL_MODES = [
    { value: "easy", label: "Easy runs only", hint: "Workouts become easy runs. Long runs drop to about three quarters." },
    { value: "shorter", label: "Shorter, easy runs", hint: "Every run easy, at about 60% of its distance." },
    { value: "rest", label: "Full rest", hint: "Skip every run until you feel better." }
];
export const FEEL_REASON = "Not feeling 100%";

const HARD_TYPES = new Set(["workout", "tempo", "long", "race", "intervals", "threshold"]);
const EASY_TYPES = new Set(["easy", "recovery", "run", "shakeout"]);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const half = n => Math.round(num(n) * 2) / 2;

export const isHard = item => item?.kind === "run" && HARD_TYPES.has(item.dayType);
const weekday = date => shortDay(date).split(",")[0];

// "6 mi Tempo run" / "Upper Body A"
export function itemText(item) {
    if (!item) return "";
    return item.kind === "run" && item.miles ? `${item.miles} mi ${item.title}` : item.title;
}

// "self", "coach" or null (sessions, logged runs, anything else).
export function changeMode(item) {
    if (!item || !["run", "strength"].includes(item.kind)) return null;
    const type = item.source?.type;
    if (!["plan", "plan-strength", "extra", "strength"].includes(type)) return null;
    if (item.fromCoach) return "coach";
    return type === "plan-strength" ? null : "self";
}

// What the ⋮ menu offers for a workout.
export function itemActions(item) {
    const mode = changeMode(item);
    if (!mode || item.done || item.autoDone) return [];
    if (item.state === "skipped") return mode === "self" ? ["unskip"] : [];
    // A coach plan's extra session has no log of its own: ask instead.
    const actions = mode === "coach" && item.source?.type === "extra" ? ["move"] : ["move", "skip"];
    if (mode === "self" && item.adjusted) actions.push("restore");
    return actions;
}

const workoutsOn = day => (day?.items || []).filter(i => i.kind !== "session" && i.source?.type !== "log");

// The item a plan run swaps with on another day: the same plan's day.
export function swapPartner(day, item) {
    if (item?.source?.type !== "plan") return null;
    return workoutsOn(day).find(i => i.source?.type === "plan" && i.source.programId === item.source.programId && !i.source.strength) || null;
}

/**
 * Days this week the workout can go to: today on, not its own day.
 * [{ date, label, there: "Rest" | "4 mi Easy run + …", swap, blocked }]
 */
export function moveTargets(week, item, today) {
    const from = item?.source?.date;
    return (week?.days || [])
        .filter(d => d.date !== from && d.date >= today)
        .map(d => {
            const there = workoutsOn(d);
            const partner = changeMode(item) === "self" ? swapPartner(d, item) : null;
            // A missed workout only moves to a free day: whatever's there
            // can't swap back onto a day that has already gone by.
            const blocked = !partner ? ""
                : partner.done || partner.state === "skipped" ? `${weekday(d.date)}'s ${partner.done ? "workout is already done" : "workout was skipped"}`
                : from < today ? `Already has ${itemText(partner)}. A missed workout can only go to a free day.`
                : "";
            return {
                date: d.date,
                label: shortDay(d.date),
                there: there.length ? there.map(itemText).join(" + ") : "Rest",
                swap: partner && !blocked ? itemText(partner) : "",
                blocked
            };
        });
}

// Plain warnings for a move (hard days back to back).
export function moveWarnings(week, item, toDate) {
    const from = item?.source?.date;
    const target = (week?.days || []).find(d => d.date === toDate);
    const partner = changeMode(item) === "self" ? swapPartner(target, item) : null;
    const hardOn = new Map();
    for (const day of week?.days || []) {
        for (const i of workoutsOn(day)) {
            if (i === item || i === partner || i.id === item?.id || (partner && i.id === partner.id)) continue;
            if (isHard(i)) hardOn.set(day.date, i);
        }
    }
    if (isHard(item)) hardOn.set(toDate, item);
    if (partner && isHard(partner) && from) hardOn.set(from, partner);
    const warnings = [];
    const check = date => {
        const here = hardOn.get(date);
        if (!here) return;
        for (const next of [addDay(date, -1), addDay(date, 1)]) {
            const other = hardOn.get(next);
            if (other && other !== here) warnings.push(`${weekday(date)}'s ${itemText(here).toLowerCase()} would sit next to ${weekday(next)}'s ${itemText(other).toLowerCase()}: two hard days in a row.`);
        }
    };
    if (isHard(item)) check(toDate);
    if (partner && isHard(partner) && from) check(from);
    return [...new Set(warnings)].slice(0, 2);
}

function addDay(iso, n) {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Not feeling 100% ----------

// What one run becomes. null = nothing to change.
export function adjustRun(item, mode) {
    if (item?.kind !== "run") return null;
    if (item.dayType === "race") return { action: "keep", after: "Race day: not changed" };
    const miles = num(item.miles);
    if (mode === "rest") return { action: "skip", after: "Rest" };
    if (mode === "shorter") {
        let next = half(miles * 0.6);
        if (next < 2) next = Math.min(miles, 2);
        if (next >= miles && EASY_TYPES.has(item.dayType)) return null;
        return { action: "easy", miles: Math.min(next, miles), after: `${Math.min(next, miles)} mi Easy run` };
    }
    // easy
    if (EASY_TYPES.has(item.dayType) || !item.dayType) return null;
    const next = item.dayType === "long" ? Math.max(Math.min(miles, 2), half(miles * 0.75)) : miles;
    return { action: "easy", miles: next, after: `${next} mi Easy run` };
}

/**
 * The changes for "Not feeling 100%" over some days.
 *   days     buildDay() results for the dates covered
 *   mode     "easy" | "shorter" | "rest"
 *   strength "keep" | "skip"
 * → [{ itemId, date, kind, mode: "self"|"coach", action: "easy"|"skip"|"keep", miles?, before, after }]
 */
export function feelChanges(days, { mode = "easy", strength = "keep" } = {}) {
    const changes = [];
    for (const day of days || []) {
        for (const item of day.items || []) {
            const who = changeMode(item);
            if (!who || item.done || item.state === "skipped") continue;
            let change = null;
            if (item.kind === "run") change = adjustRun(item, mode);
            else if (item.kind === "strength" && strength === "skip") change = { action: "skip", after: "Skip" };
            if (!change) continue;
            changes.push({ itemId: item.id, date: day.date, kind: item.kind, mode: who, before: itemText(item), ...change });
        }
    }
    return changes;
}

// ---------- In words, for the coach ----------

export function coachMoveMessage(item, toDate) {
    const from = item?.source?.date;
    return `Could ${weekday(from)}'s ${itemText(item).toLowerCase()} move to ${shortDay(toDate)}?`;
}

export function coachSkipNote(reason, note = "") {
    const label = skipReasonLabel(reason) || "Skipped";
    return [`Skipped: ${label}`, String(note || "").trim()].filter(Boolean).join(" — ").slice(0, 1000);
}

export function coachFeelMessage(changes, { from, to, mode, note = "" } = {}) {
    const modeLabel = FEEL_MODES.find(m => m.value === mode)?.label.toLowerCase() || "an easier few days";
    const span = from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`;
    const lines = (changes || []).filter(c => c.mode === "coach" && c.action !== "keep")
        .map(c => `• ${shortDay(c.date)}: ${c.before} → ${c.action === "skip" ? "rest" : c.after}`);
    const text = [
        `I'm not feeling 100% (${span}). Could we switch to ${modeLabel}?`,
        ...(lines.length ? [lines.join("\n")] : []),
        String(note || "").trim()
    ].filter(Boolean).join("\n\n");
    return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}
