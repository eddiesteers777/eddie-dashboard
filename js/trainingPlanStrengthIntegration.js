/* ==========================================
   EddieOS Training Plans — Strength bridge

   Mirrors js/racePlanStrengthIntegration.js: schedules
   generated lift sessions into the existing strength-schedule
   store, tagged with source:"training-plan" so it never
   touches manual items or Race-Plan-generated ones (which are
   tagged source:"race-plan"). Same reconciliation rules:
   completed/past sessions are preserved, only future
   incomplete ones are replaced or removed.
========================================== */

const STRENGTH_SCHEDULE_KEY = "strength-schedule";
const STRENGTH_PLAN_KEY = "strength-plan";

function uid() {
    return window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `tp-strength-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
        console.warn("Training-plan strength sync could not be completed:", error);
    }
}

function strengthTemplateForIndex(days, index) {
    if (!days.length) return null;
    return days[index % days.length];
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

            const focusLabel = entry.session || "Strength";
            const guidance = entry.strengthIntensity === "light"
                ? `${focusLabel} — LIGHT load; protect running quality and keep reps in reserve.`
                : entry.repScheme
                    ? `${focusLabel} — ${entry.repScheme}.`
                    : `${focusLabel}.`;

            sessions.push({
                date,
                dayCode: entry.day,
                workoutId: `plan-${template.id}`,
                workoutName: template.name || "Strength",
                strengthIntensity: entry.strengthIntensity || "support",
                note: `Training Plan: ${plan.name} • ${guidance}`,
                phase: week.phase,
                week: week.week
            });
        }
    }

    return { sessions, unavailable: false, message: "" };
}

function findExistingTrainingPlanItem(items, planId, date, workoutId) {
    return items.find(item =>
        item.source === "training-plan"
        && item.trainingPlanId === planId
        && item.date === date
        && item.workoutId === workoutId
    ) || null;
}

function hasOtherStrengthItem(items, date, planId) {
    return items.some(item =>
        item.date === date
        && !(item.source === "training-plan" && item.trainingPlanId === planId)
    );
}

/**
 * Reconcile the Strength calendar with one active Training Plan.
 * Manual and Race-Plan-generated Strength items are never touched.
 */
export async function syncTrainingPlanStrengthSchedule(plan) {
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

    const preservedHistory = [];
    const kept = [];
    let removed = 0;

    for (const item of originalItems) {
        if (item.source === "training-plan" && item.trainingPlanId === plan.id) {
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

        const existingGenerated = findExistingTrainingPlanItem(nextItems, plan.id, session.date, session.workoutId);
        if (existingGenerated) continue;

        if (hasOtherStrengthItem(nextItems, session.date, plan.id)) {
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
            source: "training-plan",
            trainingPlanId: plan.id,
            trainingPlanName: plan.name,
            strengthIntensity: session.strengthIntensity,
            trainingPlanWeek: session.week,
            trainingPlanPhase: session.phase
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
            ? `${skipped} training-plan Strength session${skipped === 1 ? " was" : "s were"} not auto-added because an existing Strength session already occupies the date.`
            : ""
    };
}

export async function deactivateTrainingPlanStrengthSchedule(planId) {
    if (!planId) return { removed: 0 };

    const data = loadStrengthSchedule();
    const today = todayKey();
    const before = data.items.length;

    data.items = data.items.filter(item => {
        if (item.source !== "training-plan" || item.trainingPlanId !== planId) return true;
        return item.completed || item.date < today;
    });

    const removed = before - data.items.length;
    if (removed) await saveStrengthSchedule(data);

    return { removed };
}

export default {
    syncTrainingPlanStrengthSchedule,
    deactivateTrainingPlanStrengthSchedule
};
