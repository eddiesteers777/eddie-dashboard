/* ==========================================
   Southbound Training Plans — Program Store

   Single source for the training-programs localStorage
   structure. Kept separate from running-programs: a
   Training Plan has no race date or taper/peak/race phase
   model, so it doesn't fit that schema -- this is a
   different kind of record, not a duplicate of it.
========================================== */

const PROGRAMS_KEY = "training-programs";

export function loadTrainingPrograms() {
    try {
        const raw = localStorage.getItem(PROGRAMS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.plans)) return parsed.plans;
    } catch (error) {
        console.warn("Southbound training-programs storage could not be read:", error);
    }
    return [];
}

export async function saveTrainingPrograms(programs) {
    localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));

    try {
        const { pushToCloud } = await import("./cloudSync.js");
        await pushToCloud();
    } catch (error) {
        console.warn("Training-programs cloud sync could not be completed:", error);
    }
}
