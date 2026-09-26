/* ==========================================
   Southbound — the coach's workout library

   Days and weeks the coach saved from a plan (js/planOps.js entries),
   plus the built-in Southbound run workouts and strength sessions, for
   "Insert from library" in the plan editor. Saved in the coach's own
   app data (localStorage "coach-workout-library", cloud-synced to their
   private sync doc), so it follows them to every device and no client
   can see it.
========================================== */

import { BUILT_IN_RUNS, RUN_FOLDERS, STRENGTH_FOLDERS } from "./planOps.js";
import { BUILT_IN_WORKOUTS } from "./strengthLibraryData.js";
import { fromTemplate } from "./strengthBuilder.js";
import { sanitizeStrength } from "./strengthWorkout.js";

const KEY = "coach-workout-library";
const MAX_ENTRIES = 300;

export { RUN_FOLDERS, STRENGTH_FOLDERS };

export function loadSaved() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function store(list) {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

export function saveEntry(entry) {
    const list = loadSaved().filter(e => e.id !== entry.id);
    list.unshift(entry);
    store(list);
    return entry;
}

export function deleteEntry(id) {
    store(loadSaved().filter(e => e.id !== id));
}

let builtInStrength = null;
function southboundStrength() {
    if (!builtInStrength) {
        builtInStrength = BUILT_IN_WORKOUTS.map(w => {
            const strength = sanitizeStrength(fromTemplate(w.id, { notes: "" }));
            return strength && {
                id: `sbs-${w.id}`, name: w.name, folder: "Southbound strength", kind: "strength", builtIn: true,
                rx: { type: "strength", miles: 0, session: w.name, strength }
            };
        }).filter(Boolean);
    }
    return builtInStrength;
}

// Everything that can go on a day: the coach's own first, then Southbound's.
export function dayEntries() {
    return [...loadSaved().filter(e => e.kind !== "week"), ...BUILT_IN_RUNS, ...southboundStrength()];
}

export function weekEntries() {
    return loadSaved().filter(e => e.kind === "week");
}
