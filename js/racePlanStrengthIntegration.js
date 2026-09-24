/* ==========================================
   Southbound Running — Race Plan → Strength bridge

   Phase 6:
   - schedules generated strength sessions into the
     existing strength-schedule store
   - never replaces manual Strength schedule items
   - preserves completed race-plan strength history
   - removes only future, uncompleted race-plan-generated
     strength sessions when a plan is paused/archived or regenerated
   - uses the user's existing strength-plan days as the
     workout templates consumed by Strength's scheduler
========================================== */

const STRENGTH_SCHEDULE_KEY = "strength-schedule";
const STRENGTH_PLAN_KEY = "strength-plan";

function uid() {
    return window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `rp-strength-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayKey() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function dateForWeekDay(weekStartDate, dayCode) {
    if (!weekStartDate || !dayCode) return null;
    const codes = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const offset = codes.indexOf(dayCode);
    if (offset < 0) return null;

    const date = new Date(`${weekStartDate}T00:00:00`);
    date.setDate(date.getDate() + offset);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function loadStrengthPlanDays() {
    try {
        const raw = localStorage.getItem(STRENGTH_PLAN_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.days) ? parsed.days : [];
    } catch {
        return [];
    }
}

function loadStrengthSchedule() {
    try {
        const raw = localStorage.getItem(STRENGTH_SCHEDULE_KEY);
        if (!raw) return { version: 1, items: [] };
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) return parsed;
    } catch {
        // Fall through to an empty schedule.
    }
    return { version: 1, items: [] };
}

async function saveStrengthSchedule(data) {
    localStorage.setItem(STRENGTH_SCHEDULE_KEY, JSON.stringify(data));
    try {
        const { pushToCloud } = await import("./cloudSync.js");
        await pushToCloud();
    } catch (error) {
        console.warn("Race-plan strength sync could not be completed:", error);
    }
}

function strengthTemplateForIndex(days, index) {
    if (!days.length) return null;
    return days[index % days.length];
}

function isFriday(dayCode) {
    return dayCode === "FRI";
}

function isDayBeforeLongRun(dayCode, longRunDay) {
    const codes = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const dayIndex = codes.indexOf(dayCode);
    const longIndex = codes.indexOf(longRunDay);
    if (dayIndex < 0 || longIndex < 0) return false;
    return (dayIndex + 1) % 7 === longIndex;
}

function strengthIntensity(entry, week) {
    if (entry.strengthIntensity) return entry.strengthIntensity;
    if (week?.phase === "Taper") return "light";
    if (isFriday(entry.day)) return "light";
    return "support";
}

function strengthNote(plan, entry, week) {
    const intensity = strengthIntensity(entry, week);
    const preLong = isDayBeforeLongRun(entry.day, plan.settings?.longRunDay || "SAT");

    if (intensity === "light") {
        if (preLong) {
            return `Race Plan: ${plan.name} • LIGHT / PRE-LONG-RUN — reduce load and volume; avoid failure.`;
        }
        return `Race Plan: ${plan.name} • LIGHT — protect running quality; reduce load and volume.`;
    }

    return `Race Plan: ${plan.name} • SUPPORTING STRENGTH — keep 1–3 reps in reserve.`;
}

function desiredStrengthSessions(plan) {
    const strengthDays = loadStrengthPlanDays();
    if (!strengthDays.length) {
        return {
            sessions: [],
            unavailable: true,
            message: "No current Strength plan was found. Create a Strength plan before using automatic Strength scheduling."
        };
    }

    const sessions = [];
    let workoutIndex = 0;

    for (const week of plan.generatedPlan?.weeks || []) {
        for (const entry of week.supplemental || []) {
            if (entry.type !== "strength") continue;

            const date = dateForWeekDay(week.startDate, entry.day);
            if (!date) continue;

            const template = strengthTemplateForIndex(strengthDays, workoutIndex);
            workoutIndex += 1;
            if (!template) continue;

            const intensity = strengthIntensity(entry, week);
            sessions.push({
                date,
                dayCode: entry.day,
                workoutId: `plan-${template.id}`,
                workoutName: template.name || "Strength",
                strengthIntensity: intensity,
                note: strengthNote(plan, entry, week),
                phase: week.phase,
                week: week.week
            });
        }
    }

    return { sessions, unavailable: false, message: "" };
}

function findExistingRacePlanItem(items, planId, date, workoutId) {
    return items.find(item =>
        item.source === "race-plan"
        && item.racePlanId === planId
        && item.date === date
        && item.workoutId === workoutId
    ) || null;
}

function hasManualStrengthItem(items, date, planId) {
    return items.some(item =>
        item.date === date
        && !(item.source === "race-plan" && item.racePlanId === planId)
    );
}

/**
 * Reconcile the Strength calendar with one active race plan.
 * Manual Strength schedule items are never deleted or overwritten.
 * Completed race-plan Strength history is retained.
 */
export async function syncRacePlanStrengthSchedule(plan) {
    if (!plan?.id || !plan.generatedPlan || plan.status !== "active") {
        return { scheduled: 0, removed: 0, preserved: 0, skipped: 0, warning: "" };
    }

    const desired = desiredStrengthSessions(plan);
    if (desired.unavailable) {
        return { scheduled: 0, removed: 0, preserved: 0, skipped: 0, warning: desired.message };
    }

    const data = loadStrengthSchedule();
    const originalItems = Array.isArray(data.items) ? data.items : [];
    const today = todayKey();

    // Remove only future, incomplete Strength items generated by this plan.
    const preservedHistory = [];
    const kept = [];
    let removed = 0;

    for (const item of originalItems) {
        if (item.source === "race-plan" && item.racePlanId === plan.id) {
            if (item.completed || item.date < today) {
                kept.push(item);
                preservedHistory.push(item);
            } else {
                removed += 1;
            }
            continue;
        }
        kept.push(item);
    }

    let scheduled = 0;
    let skipped = 0;
    const nextItems = [...kept];
    const newByDate = new Set();

    for (const session of desired.sessions) {
        if (newByDate.has(session.date)) {
            skipped += 1;
            continue;
        }

        const existingGenerated = findExistingRacePlanItem(nextItems, plan.id, session.date, session.workoutId);
        if (existingGenerated) {
            continue;
        }

        const manualConflict = hasManualStrengthItem(nextItems, session.date, plan.id);
        if (manualConflict) {
            skipped += 1;
            continue;
        }

        nextItems.push({
            id: uid(),
            workoutId: session.workoutId,
            workoutName: session.workoutName,
            date: session.date,
            time: session.dayCode === "FRI" ? "17:30" : "18:00",
            note: session.note,
            completed: false,
            createdAt: Date.now(),
            source: "race-plan",
            racePlanId: plan.id,
            racePlanName: plan.name,
            racePlanRevision: Number(plan.revision) || 0,
            strengthIntensity: session.strengthIntensity,
            racePlanWeek: session.week,
            racePlanPhase: session.phase
        });
        newByDate.add(session.date);
        scheduled += 1;
    }

    data.version = Number(data.version) || 1;
    data.items = nextItems;
    await saveStrengthSchedule(data);

    return {
        scheduled,
        removed,
        preserved: preservedHistory.length,
        skipped,
        warning: skipped
            ? `${skipped} race-plan Strength session${skipped === 1 ? " was" : "s were"} not auto-added because an existing Strength session already occupies the date.`
            : ""
    };
}

/**
 * Stop future, incomplete Strength sessions generated by a paused/archived plan.
 * Completed history remains intact.
 */
export async function deactivateRacePlanStrengthSchedule(planId) {
    if (!planId) return { removed: 0 };

    const data = loadStrengthSchedule();
    const today = todayKey();
    const before = data.items.length;

    data.items = data.items.filter(item => {
        if (item.source !== "race-plan" || item.racePlanId !== planId) return true;
        return item.completed || item.date < today;
    });

    const removed = before - data.items.length;
    if (removed) await saveStrengthSchedule(data);

    return { removed };
}

export function getRacePlanStrengthAvailability() {
    const days = loadStrengthPlanDays();
    return {
        available: days.length > 0,
        count: days.length,
        names: days.map(day => day.name || "Strength")
    };
}

export default {
    syncRacePlanStrengthSchedule,
    deactivateRacePlanStrengthSchedule,
    getRacePlanStrengthAvailability
};
