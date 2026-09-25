/* ==========================================
   Southbound — coach-prescribed strength sessions (pure)

   A coach plan day may carry `strength`:
     {
       title, minutes, goal, notes,          "Lower Strength", 45, "Strength + running support"
       exercises: [{
         name, sets, reps,                   "Trap Bar Deadlift", 3, "5" ("8/leg", "30 sec")
         weight,                             185 (lb) or null
         rpe, rir,                           7 / 3 or null
         restSec,                            150
         superset,                           true = paired with the exercise above
         note, video                         coach note; https demo link
       }]
     }
   On a day of type "strength" it is that day's session; on any other
   day it's an extra session that day. The client's log of what they
   lifted is a workoutResults doc (kind "strength", js/workoutResults.js)
   with exercises: [{ name, sets: [{ weight, reps }] }].

   Here: cleaning, readable text, the set-by-set order for the guided
   session (supersets alternate), and planned vs actual. No DOM or
   storage. Unit-tested in tests/strengthWorkout.test.mjs.
========================================== */

export const MAX_EXERCISES = 20;
export const MAX_SETS = 20;

const num = v => (v === "" || v === null || v === undefined ? NaN : Number(v));
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const intIn = (v, lo, hi) => { const n = Math.round(num(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const numIn = (v, lo, hi) => { const n = num(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };

export function safeVideoUrl(value) {
    const text = str(value, 300);
    if (!text) return "";
    try {
        const url = new URL(text);
        return url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

function cleanExercise(raw) {
    const name = str(raw?.name, 80);
    if (!name) return null;
    return {
        name,
        sets: intIn(raw.sets, 1, MAX_SETS) ?? 3,
        reps: str(raw.reps, 12) || "10",
        weight: numIn(raw.weight, 0, 2000) || null,
        rpe: numIn(raw.rpe, 1, 10),
        rir: intIn(raw.rir, 0, 10),
        restSec: intIn(raw.restSec, 0, 900) ?? 90,
        superset: Boolean(raw.superset),
        note: str(raw.note, 200),
        video: safeVideoUrl(raw.video)
    };
}

// The stored shape, or null when there's nothing to prescribe.
export function sanitizeStrength(raw) {
    if (!raw || typeof raw !== "object") return null;
    const exercises = (Array.isArray(raw.exercises) ? raw.exercises : []).map(cleanExercise).filter(Boolean).slice(0, MAX_EXERCISES);
    if (!exercises.length) return null;
    exercises[0].superset = false;
    return {
        title: str(raw.title, 80) || "Strength",
        minutes: intIn(raw.minutes, 0, 240),
        goal: str(raw.goal, 120),
        notes: str(raw.notes, 400),
        exercises
    };
}

// "1", "2", "3A", "3B": exercises paired with the one above share a number.
export function exerciseLabels(exercises) {
    const labels = [];
    let n = 0;
    let letter = 0;
    (exercises || []).forEach((ex, i) => {
        const next = exercises[i + 1];
        if (ex.superset && i > 0) {
            letter++;
            labels.push(`${n}${String.fromCharCode(65 + letter)}`);
        } else {
            n++;
            letter = 0;
            labels.push(next?.superset ? `${n}A` : `${n}`);
        }
    });
    return labels;
}

// Consecutive exercises joined by `superset`: [[0], [1], [2, 3]].
export function exerciseGroups(exercises) {
    const groups = [];
    (exercises || []).forEach((ex, i) => {
        if (ex.superset && groups.length) groups[groups.length - 1].push(i);
        else groups.push([i]);
    });
    return groups;
}

export function restText(seconds) {
    const s = Number(seconds) || 0;
    if (!s) return "";
    if (s < 60) return `${s} sec`;
    return s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s / 60} min`;
}

const isTimed = reps => /s(ec)?\b|min/i.test(String(reps));

// "3 × 5 @ 185 lb" / "3 × 8/leg" / "2 × 30 sec"
export function setsText(ex) {
    return `${ex.sets} × ${ex.reps}${ex.weight ? ` @ ${ex.weight} lb` : ""}`;
}

// "RPE 7 · rest 2:30"
export function targetText(ex) {
    return [ex.rpe ? `RPE ${ex.rpe}` : "", Number.isInteger(ex.rir) ? `${ex.rir} in reserve` : "", ex.restSec ? `rest ${restText(ex.restSec)}` : ""].filter(Boolean).join(" · ");
}

// "Lower Strength · 5 exercises · 45 min"
export function strengthSummary(clean) {
    if (!clean) return "";
    const n = clean.exercises.length;
    return [clean.title, `${n} exercise${n === 1 ? "" : "s"}`, clean.minutes ? `${clean.minutes} min` : ""].filter(Boolean).join(" · ");
}

// Short, complete text for the plan's change list: a weight change shows.
export function strengthDetailText(clean) {
    if (!clean) return "";
    return `${clean.title}: ${clean.exercises.map(ex => `${ex.name} ${setsText(ex)}`).join(", ")}`;
}

/**
 * Every set in the order it's done. A superset alternates (A1, B1, A2,
 * B2...); rest comes after the last exercise of the round.
 *   [{ ex, set (1-based), of, label, restAfter }]
 */
export function sessionSteps(clean) {
    if (!clean) return [];
    const labels = exerciseLabels(clean.exercises);
    const steps = [];
    for (const group of exerciseGroups(clean.exercises)) {
        const rounds = Math.max(...group.map(i => clean.exercises[i].sets));
        for (let r = 1; r <= rounds; r++) {
            const inRound = group.filter(i => clean.exercises[i].sets >= r);
            inRound.forEach((i, k) => {
                const last = k === inRound.length - 1;
                steps.push({ ex: i, set: r, of: clean.exercises[i].sets, label: labels[i], restAfter: last ? clean.exercises[inRound[inRound.length - 1]].restSec : 0 });
            });
        }
    }
    // No rest after the very last set.
    if (steps.length) steps[steps.length - 1].restAfter = 0;
    return steps;
}

// Leading number of "8", "8/leg", "30 sec" -> 8 / 30; else null.
export function repsNumber(reps) {
    const m = String(reps ?? "").match(/\d+/);
    return m ? Number(m[0]) : null;
}

// A log to start from: every set as prescribed, not yet done.
export function blankActual(clean) {
    return (clean?.exercises || []).map(ex => ({
        name: ex.name,
        sets: Array.from({ length: ex.sets }, () => ({ weight: ex.weight ?? null, reps: repsNumber(ex.reps), done: false }))
    }));
}

// What gets saved: done sets only, numbers bounded.
export function sanitizeActual(exercises) {
    return (Array.isArray(exercises) ? exercises : []).slice(0, MAX_EXERCISES).map(ex => ({
        name: str(ex?.name, 80),
        sets: (Array.isArray(ex?.sets) ? ex.sets : [])
            .filter(s => s && s.done !== false)
            .slice(0, MAX_SETS)
            .map(s => ({ weight: numIn(s.weight, 0, 2000), reps: intIn(s.reps, 0, 1000) }))
    })).filter(ex => ex.name);
}

// "185 × 5, 185 × 5, 195 × 5" / "5, 5, 5" / "—"
export function actualSetsText(sets) {
    if (!sets?.length) return "—";
    return sets.map(s => (s.weight ? `${s.weight} × ${s.reps ?? "?"}` : `${s.reps ?? "?"}`)).join(", ");
}

/**
 * Planned vs actual, per exercise (matched by position, then name).
 *   { plannedSets, doneSets, pct, rows: [{ label, name, planned, actual,
 *     setsDone, setsPlanned, topWeight, plannedWeight, change }], highlights }
 * change: "heavier" | "lighter" | "same" | "" (no weight planned or lifted)
 */
export function compareStrength(clean, actualExercises) {
    const exercises = clean?.exercises || [];
    const actual = Array.isArray(actualExercises) ? actualExercises : [];
    const labels = exerciseLabels(exercises);
    const used = new Set();
    const rows = exercises.map((ex, i) => {
        let a = actual[i] && actual[i].name === ex.name && !used.has(i) ? actual[i] : null;
        let at = a ? i : -1;
        if (!a) {
            at = actual.findIndex((x, j) => !used.has(j) && x.name === ex.name);
            a = at >= 0 ? actual[at] : null;
        }
        if (at >= 0) used.add(at);
        const sets = a?.sets || [];
        const top = sets.reduce((m, s) => Math.max(m, Number(s.weight) || 0), 0) || null;
        const change = !ex.weight || !top ? "" : top > ex.weight ? "heavier" : top < ex.weight ? "lighter" : "same";
        return {
            label: labels[i], name: ex.name,
            planned: setsText(ex), actual: actualSetsText(sets),
            setsPlanned: ex.sets, setsDone: sets.length,
            topWeight: top, plannedWeight: ex.weight, change
        };
    });
    // Anything they did that wasn't planned (a swap, an extra).
    actual.forEach((a, j) => {
        if (used.has(j) || !a?.sets?.length) return;
        rows.push({ label: "+", name: a.name, planned: "—", actual: actualSetsText(a.sets), setsPlanned: 0, setsDone: a.sets.length, topWeight: null, plannedWeight: null, change: "" });
    });
    const plannedSets = exercises.reduce((s, ex) => s + ex.sets, 0);
    const doneSets = rows.filter(r => r.setsPlanned).reduce((s, r) => s + Math.min(r.setsDone, r.setsPlanned), 0);
    const pct = plannedSets ? Math.round((doneSets / plannedSets) * 100) : 0;
    const highlights = [];
    if (plannedSets) highlights.push(pct >= 100 ? "Every planned set done" : `${doneSets} of ${plannedSets} planned sets done`);
    for (const r of rows) {
        if (r.change === "heavier") highlights.push(`${r.name}: top set ${r.topWeight} lb (planned ${r.plannedWeight})`);
        if (r.change === "lighter") highlights.push(`${r.name}: lighter, top set ${r.topWeight} lb (planned ${r.plannedWeight})`);
    }
    const missed = rows.filter(r => r.setsPlanned && !r.setsDone).map(r => r.name);
    if (missed.length) highlights.push(`Not done: ${missed.join(", ")}`);
    return { plannedSets, doneSets, pct, rows, highlights };
}

export { isTimed };
