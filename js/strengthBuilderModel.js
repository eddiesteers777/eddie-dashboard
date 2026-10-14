// Strength builder helpers (pure, no DOM, no storage): tests/strengthBuilderModel.test.mjs.
// Used by js/strength.js (the builder) and js/strengthWorkoutMode.js (the live session).

export const DEFAULT_REST = 90;

// 0 = "No rest" (straight into the next set, e.g. inside a circuit).
export const REST_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

// The kinds of set, in the order a tap cycles through them (Hevy's W / D / F).
export const SET_TYPES = ["working", "warmup", "drop", "failure"];
export const SET_TYPE_BADGE = { warmup: "W", drop: "D", failure: "F" };
export const SET_TYPE_WORDS = {
    working: "Working set",
    warmup: "Warm-up set",
    drop: "Drop set",
    failure: "To failure"
};

export function setType(set) {
    return SET_TYPES.includes(set?.type) ? set.type : "working";
}

export function nextSetType(type) {
    const now = SET_TYPES.includes(type) ? type : "working";
    return SET_TYPES[(SET_TYPES.indexOf(now) + 1) % SET_TYPES.length];
}

// Rest as saved: a real 0 stays 0 (No rest); missing or nonsense falls back to the default.
export function restValue(raw) {
    if (raw === 0 || raw === "0") return 0;
    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 900) : DEFAULT_REST;
}

export function restLabel(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return "No rest";
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes}:${String(rest).padStart(2, "0")}` : `${minutes} min`;
}

// The rest to start after ticking a set: none before a drop set (Hevy does the same),
// none after the last set of an exercise inside a superset / circuit until the round ends.
export function restAfterSet(exercise, setIndex) {
    const rest = restValue(exercise?.restSeconds);
    const next = exercise?.sets?.[setIndex + 1];
    if (next && setType(next) === "drop") return 0;
    return rest;
}

// Optional rep range: reps = the low end (what every older reader uses), repsMax = the top.
export function repsMaxValue(reps, repsMax) {
    const low = Number(reps) || 0;
    const high = Math.round(Number(repsMax) || 0);
    return high > low ? high : null;
}

export function repsText(set) {
    const low = Number(set?.reps) || 0;
    const high = repsMaxValue(low, set?.repsMax);
    return high ? `${low}–${high}` : String(low);
}

// About how long the workout takes: each set's work (reps × 4 s, or its seconds) plus the
// rest after it, and a minute per exercise to set up. Inside a superset / circuit the rest
// comes once per round, after its last exercise.
export function estimateMinutes(day) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    let seconds = 0;
    exercises.forEach((exercise, index) => {
        const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
        const inGroup = Boolean(exercise.groupId);
        const lastOfGroup = inGroup && exercises[index + 1]?.groupId !== exercise.groupId;
        const rest = restValue(exercise.restSeconds);
        seconds += 60;
        sets.forEach((set, i) => {
            const work = exercise.mode === "time"
                ? Number(set.duration) || 30
                : Math.max(1, Number(set.repsMax) || Number(set.reps) || 8) * 4;
            seconds += work;
            const isLast = i === sets.length - 1;
            if (inGroup) {
                if (lastOfGroup && !isLast) seconds += rest;
            } else if (!isLast) {
                seconds += restAfterSet(exercise, i);
            }
        });
    });
    if (!seconds) return 0;
    return Math.max(1, Math.round(seconds / 60));
}

// Move one exercise up or down without breaking a superset / circuit apart: inside a group
// it swaps with its group neighbour; on its own it jumps over a whole group.
// Returns a new array (or the same one when nothing can move).
export function moveInList(exercises, id, delta) {
    const list = Array.isArray(exercises) ? exercises : [];
    const index = list.findIndex(ex => ex.id === id);
    if (index < 0 || !delta) return list;
    const item = list[index];
    const step = delta < 0 ? -1 : 1;

    if (item.groupId) {
        const target = index + step;
        if (list[target]?.groupId !== item.groupId) return list;
        const out = list.slice();
        [out[index], out[target]] = [out[target], out[index]];
        return out;
    }

    let target = index + step;
    if (target < 0 || target >= list.length) return list;
    const neighbour = list[target];
    if (neighbour.groupId) {
        while (list[target + step]?.groupId === neighbour.groupId) target += step;
    }
    const out = list.slice();
    out.splice(index, 1);
    out.splice(target, 0, item);  // after removing it, "target" is just past the group either way
    return out;
}

// Can this exercise move up / down at all (for disabling the buttons)?
export function canMove(exercises, id, delta) {
    return moveInList(exercises, id, delta) !== exercises;
}

// A workout name: trimmed, one line, at most 60 characters; empty keeps the old one.
export function cleanWorkoutName(value, fallback = "New Workout") {
    const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    return name || fallback;
}

// "New Workout", then "New Workout 2", 3... so a list of new days can be told apart.
export function uniqueWorkoutName(base, existing = []) {
    const names = new Set(existing.map(n => String(n).trim().toLowerCase()));
    if (!names.has(base.toLowerCase())) return base;
    let n = 2;
    while (names.has(`${base} ${n}`.toLowerCase())) n++;
    return `${base} ${n}`;
}

// A custom exercise named from what was typed in search ("db row" -> "Db Row").
export function exerciseFromQuery(query) {
    const name = String(query ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) return null;
    return name.replace(/(^|\s)(\p{Ll})/gu, (m, s, c) => s + c.toUpperCase());
}
