/* ==========================================
   Southbound Planner events

   The coach's own calendar (planner.html): classes, deadlines,
   appointments, anything. Events live in this account's private data
   ("planner-events" in localStorage, mirrored to the cloud by
   js/cloudSync.js), never in the site's code -- the old hard-coded
   school/course calendar was removed from the repo on 2026-09-25.

   Event shape: { id, date: "YYYY-MM-DD", title, category, time?, notes? }
========================================== */

const KEY = "planner-events";

export const PLANNER_CATEGORIES = [
    { value: "personal", label: "Personal", color: "var(--cyan)" },
    { value: "school", label: "School", color: "var(--primary)" },
    { value: "class", label: "Class", color: "var(--green)" },
    { value: "deadline", label: "Deadline", color: "var(--red)" },
    { value: "training", label: "Training / Race", color: "var(--orange)" }
];

export function categoryFor(value) {
    return PLANNER_CATEGORIES.find(c => c.value === value) || PLANNER_CATEGORIES[0];
}

export function loadPlannerEvents() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(saved) ? saved.filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.title) : [];
    } catch {
        return [];
    }
}

export function savePlannerEvents(events) {
    localStorage.setItem(KEY, JSON.stringify(events));
    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

export function upsertPlannerEvent(event) {
    const events = loadPlannerEvents();
    const record = { ...event, id: event.id || `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
    const index = events.findIndex(e => e.id === record.id);
    if (index >= 0) events[index] = record;
    else events.push(record);
    savePlannerEvents(events);
    return record;
}

export function deletePlannerEvent(id) {
    savePlannerEvents(loadPlannerEvents().filter(e => e.id !== id));
}

// "17:30" -> "5:30 PM" ("" stays "")
export function formatTime(hhmm) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const byDateThenTime = (a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || ""));

export function eventsOnDate(iso, events = loadPlannerEvents()) {
    return events.filter(e => e.date === iso).sort(byDateThenTime);
}

// Events from today through `daysAhead` days out, soonest first, with
// how many days away each is. Today's screen uses daysAhead = 0.
export function getUpcomingPlannerEvents(daysAhead = 10, events = loadPlannerEvents()) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return events
        .map(e => {
            const [y, m, d] = e.date.split("-").map(Number);
            const date = new Date(y, m - 1, d);
            return { ...e, dateObj: date, daysAway: Math.round((date - today) / 86400000) };
        })
        .filter(e => e.daysAway >= 0 && e.daysAway <= daysAhead)
        .sort(byDateThenTime);
}
