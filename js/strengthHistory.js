/* ==========================================
   Southbound Strength History

   Tracks what was actually lifted, session by
   session, separate from the plan itself (which
   only holds current/target values). This is
   what "previous performance" in Workout Mode
   reads from.
========================================== */

import { isBodyweight } from "./strengthUnits.js";

const HISTORY_KEY = "strength-history";
// Enough for years of progress (Strength → Progress); an entry is ~100 bytes.
const MAX_ENTRIES_PER_EXERCISE = 400;

// The phone's own calendar day (toISOString is UTC, so an evening session was dated tomorrow).
function localDay(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    window.dispatchEvent(new CustomEvent("eddieos:strength-history-updated"));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function historyKeyFor(exercise) {
    // Keyed by name rather than exerciseId -- custom/template
    // exercises (seeded from the marathon plan's strength templates)
    // don't have a dataset exerciseId at all, and name is the one
    // thing every exercise reliably has.
    return exercise.name.trim().toLowerCase();
}

/**
 * Records a snapshot of an exercise's completed sets for today.
 * Only sets with real weight/reps (or duration, for timed
 * exercises) are worth keeping -- an all-zero set is almost
 * always one that was added but never actually logged.
 */
export function logExercise(exercise) {
    // Only the sets ticked off, when any were (a set left unticked wasn't done); otherwise every
    // set with numbers in it, as before.
    const all = exercise.sets || [];
    const ticked = all.filter(set => set.done);
    const meaningfulSets = (ticked.length ? ticked : all).filter(set =>
        exercise.mode === "time"
            ? Number(set.duration) > 0
            : Number(set.weight) > 0 || Number(set.reps) > 0
    );

    if (!meaningfulSets.length) {
        return;
    }

    const history = loadHistory();
    const key = historyKeyFor(exercise);

    if (!Array.isArray(history[key])) {
        history[key] = [];
    }

    history[key].unshift({
        date: localDay(),
        mode: exercise.mode,
        name: String(exercise.name || "").trim().slice(0, 80),
        ...(exercise.mode !== "time" && isBodyweight(exercise) ? { bw: true } : {}),
        sets: meaningfulSets.map(set => ({
            weight: Number(set.weight) || 0,
            reps: Number(set.reps) || 0,
            duration: Number(set.duration) || 0,
            ...(set.type && set.type !== "working" ? { type: set.type } : {})
        }))
    });

    history[key] = history[key].slice(0, MAX_ENTRIES_PER_EXERCISE);

    saveHistory(history);
}

/**
 * Returns the most recent PRIOR session's sets for an exercise
 * (today's own entry, if one was already logged today, is
 * skipped so "previous" never just points at itself).
 */
export function getPreviousPerformance(exercise) {
    const history = loadHistory();
    const entries = history[historyKeyFor(exercise)];

    if (!Array.isArray(entries) || !entries.length) {
        return null;
    }

    const today = localDay();
    const previous = entries.find(entry => entry.date !== today) || null;

    return previous;
}

/* ==========================================
   One finished session at a time (js/completedSessions.js)

   Entries a stored session wrote carry its id (`sid`), so finishing the
   same session again, editing it or deleting it replaces exactly its own
   entries: Progress never counts a workout twice.
========================================== */

function insertByDate(list, entry) {
    // Newest first, as every reader expects.
    const i = list.findIndex(e => String(e.date || "") < entry.date);
    if (i === -1) list.push(entry); else list.splice(i, 0, entry);
}

function dropSession(history, sid) {
    let dropped = 0;
    for (const key of Object.keys(history)) {
        if (!Array.isArray(history[key])) continue;
        const before = history[key].length;
        history[key] = history[key].filter(e => e?.sid !== sid);
        dropped += before - history[key].length;
        if (!history[key].length) delete history[key];
    }
    return dropped;
}

/** Writes (or rewrites) a stored strength session's lifts into strength-history. */
export function logSession(session) {
    if (!session?.id || session.type !== "strength") return;
    const history = loadHistory();
    dropSession(history, session.id);
    for (const ex of session.strength?.exercises || []) {
        const key = String(ex.name || "").trim().toLowerCase();
        if (!key || !ex.sets?.length) continue;
        if (!Array.isArray(history[key])) history[key] = [];
        insertByDate(history[key], {
            date: session.date,
            mode: ex.mode === "time" ? "time" : "reps",
            name: String(ex.name).trim().slice(0, 80),
            sid: session.id,
            ...(ex.bw ? { bw: true } : {}),
            sets: ex.sets.map(s => ({ weight: s.w || 0, reps: s.r || 0, duration: s.d || 0, ...(s.t ? { type: s.t } : {}) }))
        });
        history[key] = history[key].slice(0, MAX_ENTRIES_PER_EXERCISE);
    }
    saveHistory(history);
}

/** Takes a deleted session's lifts back out of strength-history. */
export function removeSessionHistory(sid) {
    const history = loadHistory();
    if (dropSession(history, sid)) saveHistory(history);
}
