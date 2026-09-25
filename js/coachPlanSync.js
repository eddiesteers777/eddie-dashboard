/* ==========================================
   Southbound — bring the coach's published plans onto this device

   Runs for clients on page load (js/loadHeader.js, after cloud sync).
   For every coachingPlans header addressed to this client:
     - a newer published version than the local copy -> download it and
       replace the prescription, keeping what the client recorded
       (completed, pace, notes...) by date (mergeRuntimeByDate);
     - the first time a plan replaces one the client made themselves
       (header.adoptedFrom), retire that plan so it isn't doubled up on
       the calendar, carrying its "done" marks across;
     - archived / restored by the coach -> follow suit.
   Returns { changed, updated: [header...] }. Never throws.
========================================== */

import { listMyPlans, getVersion } from "./coachingPlans.js";
import { mergeRuntimeByDate } from "./coachingPlanModel.js";
import { loadCoachPlans, saveCoachPlans } from "./coachPlanStore.js";
import { loadRunningPrograms, saveRunningPrograms } from "./runningPrograms.js";
import { loadTrainingPrograms, saveTrainingPrograms } from "./trainingPrograms.js";

const STORES = {
    running: [loadRunningPrograms, saveRunningPrograms],
    training: [loadTrainingPrograms, saveTrainingPrograms]
};

// Retires the client's own plan the coach took over; returns its
// generatedPlan so its "done" marks carry over.
async function retireAdopted(adoptedFrom) {
    const pair = STORES[adoptedFrom?.store];
    if (!pair) return null;
    const [load, save] = pair;
    const programs = load();
    const own = programs.find(p => p.id === adoptedFrom.id);
    if (!own) return null;
    if (own.status !== "archived") {
        own.status = "archived";
        own.archivedAt = new Date().toISOString();
        own.replacedByCoachPlan = true;
        await save(programs);
    }
    return own.generatedPlan || null;
}

export async function syncCoachPlans() {
    let headers;
    try {
        headers = await listMyPlans();
    } catch (error) {
        // Rules not published yet, offline, or signed out: keep the copy.
        console.warn("Southbound: coach plans unavailable.", error?.code || error);
        return { changed: false, updated: [] };
    }

    const local = loadCoachPlans();
    const updated = [];
    let changed = false;

    for (const header of headers) {
        let entry = local.find(p => p.coachPlanId === header.id);

        if (header.status === "archived") {
            if (entry && entry.status !== "archived") { entry.status = "archived"; changed = true; }
            continue;
        }

        if (!entry || (entry.coachVersion || 0) < header.version) {
            let version;
            try {
                version = await getVersion(header.id, header.version);
            } catch (error) {
                console.warn("Southbound: couldn't download plan version.", error?.code || error);
                continue;
            }
            if (!version?.plan) continue;
            const seed = entry?.generatedPlan || (header.adoptedFrom ? await retireAdopted(header.adoptedFrom) : null);
            const next = {
                id: `coach-${header.id}`,
                coachPlanId: header.id,
                coachVersion: header.version,
                name: header.name,
                kind: header.kind,
                coachName: header.coachName || "",
                adoptedFromId: header.adoptedFrom?.id || null,
                status: "active",
                source: "coach",
                generatedPlan: mergeRuntimeByDate(seed, version.plan),
                updatedAt: new Date().toISOString()
            };
            if (entry) Object.assign(entry, next); else local.push(next);
            updated.push(header);
            changed = true;
        } else if (entry.status !== "active") {
            entry.status = "active";
            changed = true;
        }
    }

    if (changed) await saveCoachPlans(local);
    return { changed, updated };
}
