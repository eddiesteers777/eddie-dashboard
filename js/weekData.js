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
