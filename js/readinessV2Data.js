/* ==========================================
   Southbound — what readiness v2 needs beyond the morning's numbers

   The training response (js/trainingResponse.js) and the load state
   (js/loadState.js) come from the athlete model's session list, which
   only the coach's own app builds for now (clients come with step 7 of
   docs/PERFORMANCE_ENGINE_PLAN.md). Built once per page and kept.
========================================== */

let cached = null;

/**
 * -> { response: { effRuns, effortRows }, loadSeries, quality, doses, planDays, execution } (or null when it can't be built).
 * planDays + execution (each key workout's laps against its targets, a year) are what the
 * readiness check and the decision replay judge outcomes on.
 */
export function athleteInputs(today) {
    if (cached?.today === today) return cached.promise;
    const promise = (async () => {
        try {
            const [{ loadModelInputs, loadLaps }, { sessionDoses }, { loadState }, tr] = await Promise.all([
                import("./athleteData.js"), import("./sessionDose.js"), import("./loadState.js"), import("./trainingResponse.js")
            ]);
            const inputs = await loadModelInputs(today);
            const lapStore = loadLaps();
            const dr = sessionDoses(inputs.sessions, today, { laps: lapStore, health: inputs.health, fitness: inputs.fitness });
            const lapsById = Object.fromEntries(Object.entries(lapStore).map(([label, v]) => [`c:${label}`, v?.laps || []]));
            let execution = [];
            try {
                const [{ keyWorkouts }, { executionSummary }] = [await import("./trendsData.js"), tr];
                execution = executionSummary(keyWorkouts(today, { days: 400 }), lapStore, today, { days: 400 }).rows;
            } catch { execution = []; }
            return {
                planDays: inputs.planDays || [],
                execution,
                response: { effRuns: tr.efficiency(inputs.sessions, dr.doses, today).runs, effortRows: tr.effortResponse(inputs.sessions, dr.doses, today).rows },
                loadSeries: loadState(dr.doses, today).series,
                quality: tr.qualityHr(dr.doses, lapsById, dr.anchors, today).sessions,
                doses: dr.doses
            };
        } catch (error) {
            console.warn("Southbound: readiness v2 couldn't build the training inputs.", error);
            return null;
        }
    })();
    cached = { today, promise };
    return promise;
}

/** Forget the cache (a new effort answer, new runs). */
export function resetAthleteInputs() { cached = null; }
