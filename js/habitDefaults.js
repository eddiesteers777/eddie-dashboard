/* ==========================================
   Southbound — habits: the starting lists and the day's check-offs (pure)

   Shared by the Habits page (js/habits.js) and Today's habit row
   (js/todayHabits.js). Data lives where it always has: the habit list
   in "habits", check-offs in "entries" as { "YYYY-MM-DD": { id: true } }
   by the phone's local calendar day. Unit-tested in tests/habitDefaults.test.mjs.
========================================== */

// The coach keeps his own starting list (ids h1-h10: his saved check-offs use them).
export const COACH_HABITS = Object.freeze([
    { id: "h1", name: "Prayer", icon: "hb:pray" },
    { id: "h2", name: "Bible", icon: "hb:bible" },
    { id: "h3", name: "Training Complete", icon: "hb:run" },
    { id: "h4", name: "Strength", icon: "hb:strength" },
    { id: "h5", name: "Stretch / Mobility", icon: "hb:stretch" },
    { id: "h6", name: "Protein Goal", icon: "hb:protein" },
    { id: "h7", name: "Water Goal", icon: "hb:water" },
    { id: "h8", name: "Sleep 7+ hrs", icon: "hb:sleep" },
    { id: "h9", name: "Read 10 Pages", icon: "hb:read" },
    { id: "h10", name: "Time with Wife", icon: "hb:love" }
].map(Object.freeze));

// Clients start with a generic list.
export const CLIENT_HABITS = Object.freeze([
    { id: "c1", name: "Training Complete", icon: "hb:run" },
    { id: "c2", name: "Stretch / Mobility", icon: "hb:stretch" },
    { id: "c3", name: "Protein Goal", icon: "hb:protein" },
    { id: "c4", name: "Water Goal", icon: "hb:water" },
    { id: "c5", name: "Sleep 7+ hrs", icon: "hb:sleep" }
].map(Object.freeze));

/** The list a page shows: what's saved, else the starting list for the account. */
export function habitList(saved, isCoach) {
    if (Array.isArray(saved)) return saved;
    return (isCoach ? COACH_HABITS : CLIENT_HABITS).map(h => ({ ...h }));
}

/** "YYYY-MM-DD" for the phone's local calendar day (the key the Habits page writes). */
export function dayKey(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** New entries with one habit flipped on that day; an emptied day is dropped. */
export function toggleEntry(entries, day, habitId) {
    const next = { ...(entries || {}) };
    const dayEntries = { ...(next[day] || {}) };
    if (dayEntries[habitId]) delete dayEntries[habitId];
    else dayEntries[habitId] = true;
    if (Object.keys(dayEntries).length) next[day] = dayEntries;
    else delete next[day];
    return next;
}

/** How many of the habits are checked off that day. */
export function doneOn(entries, day, habits) {
    const dayEntries = entries?.[day] || {};
    return (habits || []).filter(h => dayEntries[h.id]).length;
}
