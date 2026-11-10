/* ==========================================
   Southbound Running — Planned workouts

   Workouts you plan on a day yourself (easy run, tempo,
   intervals, long run, strength, cross-training). They live
   in their own key, `running-planned`, so a plan never counts
   as miles you ran in the athlete model. Marking a planned run
   done turns it into a normal `running-log` entry.
========================================== */

const PLANNED_KEY = "running-planned";

/** id, label, whether it has miles, and the log type it becomes when done. */
export const PLAN_KINDS = [
    { id: "easy", label: "Easy run", run: true, logType: "Easy" },
    { id: "tempo", label: "Tempo", run: true, logType: "Workout" },
    { id: "intervals", label: "Intervals", run: true, logType: "Workout" },
    { id: "long", label: "Long run", run: true, logType: "Long Run" },
    { id: "strength", label: "Strength", run: false, logType: null },
    { id: "cross", label: "Cross-train", run: false, logType: null }
];

/** Types for a run you already did (the existing Add Run list). */
export const DONE_TYPES = ["Easy", "Recovery", "Long Run", "Workout", "Trail", "Treadmill", "Race", "Other"];

export function kindById(id) {
    return PLAN_KINDS.find(k => k.id === id) || null;
}

/** Clean one planned workout from form values. Returns null if it can't be saved. */
export function makePlanned({ id, date, kind, miles, minutes, notes, time }) {
    const k = kindById(kind);
    if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return null;

    const out = {
        id: id || (globalThis.crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        date,
        kind: k.id,
        time: time || null,
        notes: String(notes || "").trim().slice(0, 200),
        done: false
    };

    if (k.run) {
        const m = Number(miles);
        if (!Number.isFinite(m) || m <= 0) return null;
        out.miles = Math.round(m * 10) / 10;
    } else {
        const min = Number(minutes);
        out.minutes = Number.isFinite(min) && min > 0 ? Math.round(min) : null;
    }
    return out;
}

/** Normalise whatever is in storage into a clean list. */
export function cleanPlanned(raw) {
    const list = Array.isArray(raw?.entries) ? raw.entries : [];
    return list
        .map(e => {
            const clean = e && typeof e === "object" ? makePlanned(e) : null;
            return clean ? { ...clean, done: !!e.done } : null;
        })
        .filter(Boolean);
}

export function plannedForDate(items, dateStr) {
    return items.filter(e => e.date === dateStr);
}

/** The pre-filled run for "Mark done" on a planned run. */
export function logEntryFromPlanned(item) {
    const k = kindById(item?.kind);
    if (!k || !k.run) return null;
    return { date: item.date, time: item.time || null, miles: item.miles, type: k.logType, notes: item.notes || "" };
}

/** Short line for a card: "6.0 mi", "45 min" or "". */
export function plannedAmount(item) {
    if (Number(item.miles) > 0) return `${Number(item.miles).toFixed(1)} mi`;
    if (Number(item.minutes) > 0) return `${item.minutes} min`;
    return "";
}

/* ---- storage (device + cloud sync, like running-log) ---- */

export function loadPlanned() {
    try {
        return cleanPlanned(JSON.parse(localStorage.getItem(PLANNED_KEY) || "null"));
    } catch {
        return [];
    }
}

export function savePlanned(items) {
    localStorage.setItem(PLANNED_KEY, JSON.stringify({ entries: items }));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

export function getPlannedForDate(dateStr) {
    return plannedForDate(loadPlanned(), dateStr);
}
