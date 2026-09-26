/* ==========================================
   Southbound — gathering a client's week (device + Firestore)

   Collects what js/weekModel.js needs from where it lives today:
     plans     active plans on this device (coach plans first) --
               js/activeProgramSources.js
     strength  the Strength schedule (localStorage "strength-schedule")
     runLog    logged runs (js/runningLog.js)
     sessions  approved sessions booked with the coach (Firestore; async,
               optional -- the week renders without them first)
   ...and marks a workout done / not done in the right store.
========================================== */

import {
    getActiveRunningPrograms, toggleRunningProgramDayCompleted, toggleProgramSupplementalCompleted
} from "./activeProgramSources.js";
import { getAllEntries } from "./runningLog.js";
import { SESSION_TYPES, listMyBookingRequests } from "./scheduling.js";
import { loadCoachPlans, saveCoachPlans } from "./coachPlanStore.js";
import { fuelForRun, profileFromPlans } from "./workoutFuel.js";

const SCHEDULE_KEY = "strength-schedule";

function loadStrengthSchedule() {
    try {
        const value = JSON.parse(localStorage.getItem(SCHEDULE_KEY) || "null");
        return value && Array.isArray(value.items) ? value : { version: 1, items: [] };
    } catch {
        return { version: 1, items: [] };
    }
}

export function weekInputs(sessions = []) {
    let runLog = [];
    try { runLog = getAllEntries(); } catch { runLog = []; }
    return {
        plans: getActiveRunningPrograms(),
        strength: loadStrengthSchedule().items,
        sessions,
        runLog
    };
}

// Approved sessions, one entry per date.
export async function loadSessions() {
    try {
        const requests = await listMyBookingRequests();
        return requests
            .filter(r => r.status === "approved")
            .flatMap(r => (r.dates || []).map(date => ({
                id: `${r.id}:${date}`,
                date,
                startTime: r.startTime,
                endTime: r.endTime,
                title: `${SESSION_TYPES.find(t => t.value === r.sessionType)?.label || "Session"}${r.label ? ` · ${r.label}` : ""}`,
                detail: r.coachName ? `with ${r.coachName}` : ""
            })));
    } catch {
        return [];
    }
}

// Flips a workout's done mark; resolves to the new value (or null).
export async function toggleDone(item) {
    const src = item.source || {};
    if (src.type === "plan") return toggleRunningProgramDayCompleted(src.programId, src.date);
    if (src.type === "plan-strength") {
        // A coach's strength session added to a run day: its own mark.
        const plans = loadCoachPlans();
        const day = plans.find(p => p.id === src.programId)?.generatedPlan?.weeks?.flatMap(w => w.days || []).find(d => d.date === src.date);
        if (!day) return null;
        if (day.strengthCompleted) { delete day.strengthCompleted; delete day.strengthCompletedAt; }
        else { day.strengthCompleted = true; day.strengthCompletedAt = new Date().toISOString(); }
        await saveCoachPlans(plans);
        return Boolean(day.strengthCompleted);
    }
    if (src.type === "extra") return toggleProgramSupplementalCompleted(src.programId, src.date, item.kind === "strength" ? "strength" : "cross");
    if (src.type === "strength") {
        const data = loadStrengthSchedule();
        const entry = data.items.find(i => i.id === src.itemId);
        if (!entry) return null;
        entry.completed = !entry.completed;
        localStorage.setItem(SCHEDULE_KEY, JSON.stringify(data));
        import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
        return entry.completed;
    }
    return null;
}

// Where "Start" / "Open" goes for a workout.
export function workoutLink(item) {
    if (item.kind === "strength" && item.source?.strength) {
        return { href: `workout.html?program=${encodeURIComponent(item.source.programId)}&date=${item.source.date}&kind=strength`, label: !item.done && !item.skipped ? (item.coachPlanId ? "Start" : "Open") : "Open" };
    }
    if (item.kind === "strength") {
        const dayId = item.workoutId?.startsWith("plan-") ? item.workoutId.slice(5) : null;
        try {
            const plan = JSON.parse(localStorage.getItem("strength-plan") || "null");
            if (dayId && (plan?.days || []).some(d => d.id === dayId)) return { href: `strength.html?startWorkout=${dayId}`, label: "Start" };
        } catch {}
        return { href: "strength.html", label: "Open" };
    }
    if (item.kind === "run" && item.source?.type === "plan") {
        return { href: `workout.html?program=${encodeURIComponent(item.source.programId)}&date=${item.source.date}`, label: item.structured && !item.done ? "Start" : item.coachPlanId && !item.done ? "Log it" : "Open" };
    }
    if (item.kind === "cross") return { href: "cross-training.html", label: "Open" };
    if (item.kind === "session") return { href: "schedule.html", label: "Details" };
    return { href: "running.html", label: "Open" };
}

// ---------- Fuel ----------

// What js/workoutFuel.js needs from this device: the athlete's Fueling
// Library (their gels) and the inputs on their last saved fueling plan.
export function fuelContext() {
    const read = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
    };
    const plans = read("fueling-plans", []);
    return { library: read("fueling-library", []), profile: profileFromPlans(Array.isArray(plans) ? plans : []), hasProfile: Array.isArray(plans) && plans.some(p => p?.session) };
}

// A plan run's fuel plan (null for anything that isn't a planned run).
export function fuelForItem(item, context = fuelContext()) {
    if (item?.kind !== "run" || item.source?.type !== "plan" || !item.miles) return null;
    return fuelForRun({ type: item.dayType, miles: item.miles, coachNote: item.fuelNote }, context);
}
