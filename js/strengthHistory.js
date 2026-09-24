/* ==========================================
   Southbound Strength History

   Tracks what was actually lifted, session by
   session, separate from the plan itself (which
   only holds current/target values). This is
   what "previous performance" in Workout Mode
   reads from.
========================================== */

const HISTORY_KEY = "strength-history";
const MAX_ENTRIES_PER_EXERCISE = 20;

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
    const meaningfulSets = (exercise.sets || []).filter(set =>
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
        date: new Date().toISOString().slice(0, 10),
        mode: exercise.mode,
        sets: meaningfulSets.map(set => ({
            weight: Number(set.weight) || 0,
            reps: Number(set.reps) || 0,
            duration: Number(set.duration) || 0
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

    const today = new Date().toISOString().slice(0, 10);
    const previous = entries.find(entry => entry.date !== today) || null;

    return previous;
}
