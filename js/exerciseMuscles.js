/* ==========================================
   Southbound — which muscles an exercise works (pure)

   The How to sheet's "Works" line uses the 17 names of the
   exercise database the Strength search already uses (free-exercise-db,
   js/exerciseSearch.js): an exercise picked from search carries its own
   primaryMuscles / secondaryMuscles. Southbound's library exercises
   (js/strengthLibraryData.js) and the demos (js/exerciseDemos.js) get
   theirs here and there.

   musclesFor(name, { primary, secondary })  { primary: [], secondary: [] }
       what the exercise brought with it wins, then a demo, then this table.
========================================== */

import { demoFor, normalizeName } from "./exerciseDemos.js";

export const MUSCLES = ["abdominals", "abductors", "adductors", "biceps", "calves", "chest", "forearms", "glutes", "hamstrings", "lats", "lower back", "middle back", "neck", "quadriceps", "shoulders", "traps", "triceps"];

export const MUSCLE_LABELS = {
    abdominals: "Abs", abductors: "Outer hips", adductors: "Inner thighs", biceps: "Biceps", calves: "Calves", chest: "Chest",
    forearms: "Forearms", glutes: "Glutes", hamstrings: "Hamstrings", lats: "Lats", "lower back": "Lower back",
    "middle back": "Upper back", neck: "Neck", quadriceps: "Quads", shoulders: "Shoulders", traps: "Traps", triceps: "Triceps"
};

const T = (primary, secondary = []) => ({ primary, secondary });

// The Southbound library's exercises (2026-10-12), plus a few common names.
const TABLE = {
    "band chest press": T(["chest"], ["triceps", "shoulders"]),
    "band face pull": T(["shoulders", "middle back"], ["traps"]),
    "face pull": T(["shoulders", "middle back"], ["traps"]),
    "band romanian deadlift": T(["hamstrings", "glutes"], ["lower back"]),
    "band row": T(["middle back", "lats"], ["biceps"]),
    "band squat": T(["quadriceps", "glutes"], ["hamstrings"]),
    "barbell back squat": T(["quadriceps", "glutes"], ["hamstrings", "lower back", "abdominals"]),
    "back squat": T(["quadriceps", "glutes"], ["hamstrings", "lower back", "abdominals"]),
    "barbell bench press": T(["chest"], ["triceps", "shoulders"]),
    "bench press": T(["chest"], ["triceps", "shoulders"]),
    "barbell row": T(["middle back", "lats"], ["biceps", "lower back", "forearms"]),
    "bodyweight squat jump": T(["quadriceps", "glutes"], ["calves", "hamstrings"]),
    "squat jump": T(["quadriceps", "glutes"], ["calves", "hamstrings"]),
    "bulgarian split squat": T(["quadriceps", "glutes"], ["hamstrings", "adductors"]),
    "cable row": T(["middle back", "lats"], ["biceps", "forearms"]),
    "seated cable row": T(["middle back", "lats"], ["biceps", "forearms"]),
    "cable triceps pushdown": T(["triceps"]),
    "triceps pushdown": T(["triceps"]),
    "close grip push up": T(["triceps", "chest"], ["shoulders"]),
    "copenhagen plank": T(["adductors"], ["abdominals"]),
    "dumbbell bench press": T(["chest"], ["triceps", "shoulders"]),
    "dumbbell curl": T(["biceps"], ["forearms"]),
    "dumbbell floor press": T(["chest", "triceps"], ["shoulders"]),
    "dumbbell lateral raise": T(["shoulders"], ["traps"]),
    "lateral raise": T(["shoulders"], ["traps"]),
    "dumbbell shoulder press": T(["shoulders"], ["triceps", "traps"]),
    "standing dumbbell press": T(["shoulders"], ["triceps", "abdominals"]),
    "farmer carry": T(["forearms", "traps"], ["abdominals", "shoulders"]),
    "suitcase carry": T(["abdominals", "forearms"], ["traps", "glutes"]),
    "hammer curl": T(["biceps", "forearms"]),
    "hip thrust": T(["glutes"], ["hamstrings", "quadriceps"]),
    "incline dumbbell bench press": T(["chest", "shoulders"], ["triceps"]),
    "kettlebell swing": T(["glutes", "hamstrings"], ["lower back", "shoulders", "forearms"]),
    "lat pulldown": T(["lats"], ["biceps", "middle back"]),
    "lateral band walk": T(["abductors", "glutes"]),
    "leg curl": T(["hamstrings"], ["calves"]),
    "leg extension": T(["quadriceps"]),
    "leg press": T(["quadriceps", "glutes"], ["hamstrings", "calves"]),
    "overhead triceps extension": T(["triceps"]),
    "pallof press": T(["abdominals"], ["shoulders"]),
    "seated calf raise": T(["calves"]),
    "side plank": T(["abdominals"], ["abductors", "shoulders"]),
    "single leg balance": T(["calves", "glutes"], ["abductors"]),
    "single leg rdl": T(["hamstrings", "glutes"], ["lower back", "abductors"]),
    "step up": T(["quadriceps", "glutes"], ["hamstrings", "calves"]),
    "tibialis raise": T(["calves"]),
    "trap bar deadlift": T(["quadriceps", "glutes", "hamstrings"], ["lower back", "traps", "forearms"]),
    "deadlift": T(["hamstrings", "glutes", "lower back"], ["quadriceps", "traps", "forearms"]),
    "walking lunge": T(["quadriceps", "glutes"], ["hamstrings", "adductors", "calves"]),
    "pull up": T(["lats"], ["biceps", "middle back"]),
    "chin up": T(["lats", "biceps"], ["middle back"])
};

const clean = list => [...new Set((Array.isArray(list) ? list : []).map(m => String(m).toLowerCase().trim()).filter(m => MUSCLES.includes(m)))];

/** The muscles for an exercise: what it carries, else its demo, else the table. */
export function musclesFor(name, given = {}) {
    const own = { primary: clean(given.primary || given.primaryMuscles), secondary: clean(given.secondary || given.secondaryMuscles) };
    if (own.primary.length) return { primary: own.primary, secondary: own.secondary.filter(m => !own.primary.includes(m)) };
    const demo = demoFor(name);
    const row = demo?.muscles || TABLE[normalizeName(name)] || null;
    if (!row) return { primary: [], secondary: [] };
    const primary = clean(row.primary);
    return { primary, secondary: clean(row.secondary).filter(m => !primary.includes(m)) };
}

/** Is there a demo to show for this exercise? (The How to sheet is the moving figure.) */
export function hasHowTo(name) {
    return Boolean(demoFor(name));
}

/** "Quads, Glutes" */
export const muscleWords = list => (list || []).map(m => MUSCLE_LABELS[m] || m).join(", ");
