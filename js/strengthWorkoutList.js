/* ==========================================
   Southbound — the Strength page's workout list (pure)

   What each saved workout's card says, and what deleting one does.

     workoutCards(days, { sessions, schedule, today })
        -> [{ id, name, exercises, sets, minutes, preview: [names],
              more (exercises not named), lastDone (YYYY-MM-DD | null),
              timesDone, next (YYYY-MM-DD | null) }]
           lastDone / timesDone from completed strength sessions started
           from that workout (strength.dayId), deleted ones left out;
           next = the first scheduled day from today that isn't done.
     removeWorkout(days, items, dayId, today)
        -> { days, items, day, index, removedItems }
           drops the workout and its schedule entries from today on that
           aren't done; past and done entries stay (they're history and
           carry the workout's name). Completed sessions are never touched.
     restoreWorkout(days, items, removed)
        -> { days, items }   puts both back exactly (Undo).

   Unit-tested in tests/strengthWorkoutList.test.mjs.
========================================== */

import { estimateMinutes } from "./strengthBuilderModel.js";

const PREVIEW = 3;

export function workoutCards(days, { sessions = [], schedule = [], today = "" } = {}) {
    const done = new Map();
    for (const s of sessions || []) {
        if (!s || s.deleted || s.type !== "strength" || s.status === "deleted") continue;
        const id = s.strength?.dayId;
        if (!id || !s.date) continue;
        const prev = done.get(id) || { last: null, times: 0 };
        prev.times++;
        if (!prev.last || s.date > prev.last) prev.last = s.date;
        done.set(id, prev);
    }
    return (days || []).filter(Boolean).map(day => {
        const exercises = Array.isArray(day.exercises) ? day.exercises : [];
        const names = exercises.map(ex => String(ex?.name || "").trim()).filter(Boolean);
        const sets = exercises.reduce((n, ex) => n + (Array.isArray(ex?.sets) ? ex.sets.length : 0), 0);
        const estimate = exercises.length ? estimateMinutes(day) : 0;
        const next = (schedule || [])
            .filter(i => i && i.workoutId === `plan-${day.id}` && !i.completed && i.date && (!today || i.date >= today))
            .map(i => i.date)
            .sort()[0] || null;
        const d = done.get(String(day.id));
        return {
            id: day.id,
            name: String(day.name || "").trim() || "My Workout",
            exercises: exercises.length,
            sets,
            minutes: Number(day.estimatedMinutes) || estimate || 0,
            preview: names.slice(0, PREVIEW),
            more: Math.max(0, names.length - PREVIEW),
            lastDone: d?.last || null,
            timesDone: d?.times || 0,
            next
        };
    });
}

export function removeWorkout(days, items, dayId, today = "") {
    const list = Array.isArray(days) ? days : [];
    const index = list.findIndex(d => d?.id === dayId);
    const day = index >= 0 ? list[index] : null;
    const removedItems = [];
    const keep = [];
    (Array.isArray(items) ? items : []).forEach((item, at) => {
        const future = !today || !item?.date || item.date >= today;
        if (item?.workoutId === `plan-${dayId}` && !item.completed && future) removedItems.push({ item, at });
        else keep.push(item);
    });
    return {
        days: list.filter(d => d?.id !== dayId),
        items: keep,
        day, index, removedItems
    };
}

export function restoreWorkout(days, items, removed) {
    const outDays = [...(days || [])];
    if (removed?.day && !outDays.some(d => d?.id === removed.day.id)) {
        outDays.splice(Math.min(Math.max(0, removed.index ?? outDays.length), outDays.length), 0, removed.day);
    }
    const outItems = [...(items || [])];
    for (const { item, at } of [...(removed?.removedItems || [])].sort((a, b) => a.at - b.at)) {
        if (outItems.some(i => i?.id && i.id === item?.id)) continue;
        outItems.splice(Math.min(at, outItems.length), 0, item);
    }
    return { days: outDays, items: outItems };
}

/** "Today" / "Yesterday" / "Tue, Oct 13" / "Oct 13, 2025" for a YYYY-MM-DD. */
export function dayWords(date, today) {
    if (!date) return "";
    if (date === today) return "Today";
    const d = new Date(`${date}T12:00:00`);
    if (today) {
        const t = new Date(`${today}T12:00:00`);
        const diff = Math.round((d - t) / 86400000);
        if (diff === -1) return "Yesterday";
        if (diff === 1) return "Tomorrow";
        if (d.getFullYear() !== t.getFullYear()) return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
