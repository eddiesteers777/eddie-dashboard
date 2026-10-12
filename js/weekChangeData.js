/* ==========================================
   Southbound — saving changes to your own week

   The writes behind js/weekChanges.js:
     plans they made   running-programs / training-programs (localStorage,
                       cloud-synced): a move swaps the two days' workouts
                       (js/planOps.js), a skip / an adjustment is marked on
                       the day itself with what it was.
     Strength schedule strength-schedule: a move changes the date; a skip
                       is a mark with its reason.
     the coach's plan  never edited here: a skip is logged as "skipped"
                       (js/workoutResults.js, which the coach sees); moves
                       and adjustments go to the coach as a request.
   Every self change returns an undo() that puts the stores back exactly
   as they were.
========================================== */

import { loadRunningPrograms, saveRunningPrograms } from "./runningPrograms.js";
import { loadTrainingPrograms, saveTrainingPrograms } from "./trainingPrograms.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { moveDay, prescriptionOf, prescriptionText, applyPrescription } from "./planOps.js";
import { recalcPlannedMiles } from "./coachingPlanModel.js";
import { FEEL_REASON, skipReasonLabel, coachSkipNote, changeMode } from "./weekChanges.js";

const SCHEDULE_KEY = "strength-schedule";
const STORE_KEYS = ["running-programs", "training-programs", SCHEDULE_KEY];
const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function push() {
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

function snapshot() {
    return Object.fromEntries(STORE_KEYS.map(k => [k, localStorage.getItem(k)]));
}

// Called once the change is saved: Undo puts the stores back, but only
// while nothing else has changed since (an older Undo can't wipe a newer change).
function undoFrom(before) {
    const after = JSON.stringify(snapshot());
    return async () => {
        if (JSON.stringify(snapshot()) !== after) {
            throw Object.assign(new Error("Your week has changed since. Undo the newer change first."), { code: "stale-undo" });
        }
        for (const [key, value] of Object.entries(before)) {
            if (value !== null) localStorage.setItem(key, value);
        }
        push();
        window.dispatchEvent(new CustomEvent("eddieos:strength-schedule-updated"));
    };
}

function loadSchedule() {
    try {
        const value = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || "null");
        return value && Array.isArray(value.items) ? value : { version: 1, items: [] };
    } catch {
        return { version: 1, items: [] };
    }
}

function saveSchedule(data) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(data));
    push();
    window.dispatchEvent(new CustomEvent("eddieos:strength-schedule-updated"));
}

// The plan they made that holds an item, and how to save it.
function selfPlan(programId) {
    for (const [load, save] of [[loadRunningPrograms, saveRunningPrograms], [loadTrainingPrograms, saveTrainingPrograms]]) {
        const programs = load();
        const program = programs.find(p => p.id === programId);
        if (program?.generatedPlan?.weeks) return { programs, program, save };
    }
    return null;
}

const daysOf = plan => (plan?.weeks || []).flatMap(w => w.days || []);

function supplementalAt(program, date, entryType) {
    for (const week of program.generatedPlan.weeks || []) {
        if (!week.startDate) continue;
        const offset = Math.round((new Date(`${date}T12:00:00`) - new Date(`${week.startDate}T12:00:00`)) / 86400000);
        if (offset < 0 || offset > 6) continue;
        const entry = (week.supplemental || []).find(e => e.day === DAY_CODES[offset] && e.type === entryType);
        if (entry) return { week, entry };
    }
    return null;
}

// The coach's plan behind an item: who to ask, and what to log against.
export function coachFor(item) {
    const plan = loadCoachPlans().find(p => p.id === item?.source?.programId);
    if (!plan) return null;
    return { coachUid: plan.coachUid || "", coachName: plan.coachName || "", coachPlanId: plan.coachPlanId || null, coachVersion: plan.coachVersion || 1 };
}

const fail = message => { throw Object.assign(new Error(message), { code: "not-found" }); };

// ---------- Move ----------

export async function moveItem(item, toDate) {
    if (changeMode(item) !== "self") fail("Only your own workouts move here.");
    const before = snapshot();
    const src = item.source;
    if (src.type === "strength") {
        const data = loadSchedule();
        const entry = data.items.find(i => i.id === src.itemId) || fail("That workout isn't on your schedule any more.");
        entry.date = toDate;
        delete entry.skipped; delete entry.skipReason;
        saveSchedule(data);
    } else if (src.type === "plan") {
        const found = selfPlan(src.programId) || fail("That plan isn't on this phone any more.");
        moveDay(found.program.generatedPlan, src.date, toDate);
        // The marks stay with their dates; a missed workout that moved on is no longer "skipped" there.
        found.program.updatedAt = new Date().toISOString();
        await found.save(found.programs);
    } else if (src.type === "extra") {
        const found = selfPlan(src.programId) || fail("That plan isn't on this phone any more.");
        const at = supplementalAt(found.program, src.date, src.entryType) || fail("That session isn't in your plan any more.");
        const offset = Math.round((new Date(`${toDate}T12:00:00`) - new Date(`${at.week.startDate}T12:00:00`)) / 86400000);
        if (offset < 0 || offset > 6) fail("It can only move within its week.");
        at.entry.day = DAY_CODES[offset];
        delete at.entry.skipped; delete at.entry.skipReason;
        found.program.updatedAt = new Date().toISOString();
        await found.save(found.programs);
    } else fail("That can't be moved.");
    return undoFrom(before);
}

// ---------- Skip ----------

function reasonText(reason, note) {
    return [skipReasonLabel(reason), String(note || "").trim()].filter(Boolean).join(" — ").slice(0, 200);
}

/**
 * Skip on purpose. Self: marks it (returns undo). Coach: logs it as
 * skipped with the reason (returns { result }).
 */
export async function skipItem(item, { reason = "", note = "" } = {}) {
    const mode = changeMode(item);
    const src = item.source;
    if (mode === "coach") {
        const coach = coachFor(item) || fail("That plan isn't on this phone any more.");
        const { saveMyResult, listMyResults } = await import("./workoutResults.js");
        const strength = item.kind === "strength" && src.strength;
        const existing = (await listMyResults(coach.coachPlanId).catch(() => []))
            .find(r => r.date === src.date && Boolean(r.kind === "strength") === Boolean(strength)) || null;
        const result = await saveMyResult({
            planId: coach.coachPlanId,
            coachUid: coach.coachUid,
            date: src.date,
            kind: strength ? "strength" : "run",
            planVersion: coach.coachVersion,
            title: item.title,
            plannedMiles: item.miles || 0,
            status: "skipped",
            note: coachSkipNote(reason, note)
        }, existing);
        return { result };
    }
    if (mode !== "self") fail("That can't be skipped here.");
    const before = snapshot();
    const why = reasonText(reason, note);
    if (src.type === "strength") {
        const data = loadSchedule();
        const entry = data.items.find(i => i.id === src.itemId) || fail("That workout isn't on your schedule any more.");
        entry.skipped = true; entry.skipReason = why; entry.completed = false;
        saveSchedule(data);
    } else if (src.type === "plan") {
        const found = selfPlan(src.programId) || fail("That plan isn't on this phone any more.");
        const day = daysOf(found.program.generatedPlan).find(d => d.date === src.date) || fail("That day isn't in your plan any more.");
        day.skipped = true; day.skipReason = why; delete day.completed;
        found.program.updatedAt = new Date().toISOString();
        await found.save(found.programs);
    } else if (src.type === "extra") {
        const found = selfPlan(src.programId) || fail("That plan isn't on this phone any more.");
        const at = supplementalAt(found.program, src.date, src.entryType) || fail("That session isn't in your plan any more.");
        at.entry.skipped = true; at.entry.skipReason = why; delete at.entry.completed;
        await found.save(found.programs);
    }
    return { undo: undoFrom(before) };
}

export async function unskipItem(item) {
    if (changeMode(item) !== "self") fail("Only your own workouts.");
    const before = snapshot();
    const src = item.source;
    if (src.type === "strength") {
        const data = loadSchedule();
        const entry = data.items.find(i => i.id === src.itemId) || fail("That workout isn't on your schedule any more.");
        delete entry.skipped; delete entry.skipReason;
        saveSchedule(data);
    } else {
        const found = selfPlan(src.programId) || fail("That plan isn't on this phone any more.");
        const target = src.type === "extra"
            ? supplementalAt(found.program, src.date, src.entryType)?.entry
            : daysOf(found.program.generatedPlan).find(d => d.date === src.date);
        if (!target) fail("That day isn't in your plan any more.");
        delete target.skipped; delete target.skipReason;
        await found.save(found.programs);
    }
    return undoFrom(before);
}

// ---------- Not feeling 100% / put it back ----------

// Easy run in place of whatever the day had, remembering what it was.
function easeDay(day, miles) {
    const was = prescriptionOf(day);
    applyPrescription(day, { type: "easy", miles, session: "" });
    day.adjusted = { was: prescriptionText(was), rx: was, reason: FEEL_REASON, at: Date.now() };
}

/**
 * Applies the self changes from feelChanges(). `itemsById` resolves each
 * change's item. Returns { undo, applied }.
 */
export async function applyFeelChanges(changes, itemsById) {
    const before = snapshot();
    const mine = (changes || []).filter(c => c.mode === "self" && c.action !== "keep");
    // Each store loaded once, so two plans in one store don't overwrite each other.
    const stores = [[loadRunningPrograms, saveRunningPrograms], [loadTrainingPrograms, saveTrainingPrograms]]
        .map(([load, save]) => ({ programs: load(), save, dirty: false }));
    const find = id => {
        for (const store of stores) {
            const program = store.programs.find(p => p.id === id);
            if (program?.generatedPlan?.weeks) return { store, program };
        }
        return null;
    };
    let schedule = null;
    for (const change of mine) {
        const item = itemsById.get(change.itemId);
        const src = item?.source;
        if (!src) continue;
        if (src.type === "strength") {
            schedule = schedule || loadSchedule();
            const entry = schedule.items.find(i => i.id === src.itemId);
            if (entry) { entry.skipped = true; entry.skipReason = FEEL_REASON; entry.completed = false; }
            continue;
        }
        const found = find(src.programId);
        if (!found) continue;
        found.store.dirty = true;
        found.program.updatedAt = new Date().toISOString();
        if (src.type === "extra") {
            const at = supplementalAt(found.program, src.date, src.entryType);
            if (at) { at.entry.skipped = true; at.entry.skipReason = FEEL_REASON; }
            continue;
        }
        const day = daysOf(found.program.generatedPlan).find(d => d.date === src.date);
        if (!day) continue;
        if (change.action === "skip") { day.skipped = true; day.skipReason = FEEL_REASON; delete day.completed; }
        else if (change.action === "easy") { easeDay(day, change.miles); recalcPlannedMiles(found.program.generatedPlan); }
    }
    for (const store of stores) if (store.dirty) await store.save(store.programs);
    if (schedule) saveSchedule(schedule);
    return { undo: undoFrom(before), applied: mine.length };
}

// "Put the original back" on an adjusted day.
export async function restoreItem(item) {
    if (changeMode(item) !== "self" || item.source?.type !== "plan") fail("Only your own plan's days.");
    const before = snapshot();
    const found = selfPlan(item.source.programId) || fail("That plan isn't on this phone any more.");
    const day = daysOf(found.program.generatedPlan).find(d => d.date === item.source.date);
    if (!day?.adjusted?.rx) fail("Nothing to put back.");
    applyPrescription(day, day.adjusted.rx);
    delete day.adjusted;
    recalcPlannedMiles(found.program.generatedPlan);
    found.program.updatedAt = new Date().toISOString();
    await found.save(found.programs);
    return undoFrom(before);
}
