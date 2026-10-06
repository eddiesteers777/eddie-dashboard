/* ==========================================
   Southbound — a client's key workouts and their COROS laps

   Structured workouts step 4 (docs/WORKOUT_EXECUTION_PLAN.md). On the
   client's own device: the days of their coach's plans that carry a
   structured workout, each with the COROS run done that day, so the
   workout page can rebuild it rep by rep (js/workoutExecution.js), and
   the athlete-model share can send those laps to the coach
   (js/athleteShare.js, only with Athlete model sharing on).

   planKeyItems(today, { days })  structured coach-plan days (newest first)
                                   with the day's COROS run (the longest)
   corosRunOn(date)                that run, or null
   lapEntry(run)                   the saved laps ({ laps, kind }) or null
   ensureLaps(items, { max })      asks COROS for the laps not saved yet
                                   (js/trendsData.js fetchLaps: once per run,
                                   kept in coros-laps, the client's own data)
   shareLapRuns(items)             [{ id: "c:<labelId>", date, kind, laps }]
========================================== */

import { loadCoachPlans } from "./coachPlanStore.js";
import { HISTORY_KEY, runsBetween, emptyHistory, addDays } from "./corosHistory.js";
import { inferLapKind } from "./workoutExecution.js";

const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};

/** The day's COROS run (the longest when there were several), or null. */
export function corosRunOn(date) {
    const runs = runsBetween(read(HISTORY_KEY, null) || emptyHistory(), date, date);
    return runs.filter(r => r.labelId && Number(r.distance) > 0).sort((a, b) => b.distance - a.distance)[0] || null;
}

export function lapEntry(run) {
    const saved = read("coros-laps", {})[run?.labelId];
    return saved?.laps?.length ? saved : null;
}

/** The structured days of the client's active coach plans in the last `days` days, with that day's run. */
export function planKeyItems(today, { days = 42 } = {}) {
    const from = addDays(today, -(days - 1));
    const out = [];
    for (const p of loadCoachPlans()) {
        if (p?.status && p.status !== "active") continue;
        for (const week of p?.generatedPlan?.weeks || []) {
            for (const day of week.days || []) {
                if (!day?.date || day.date < from || day.date > today || !day.workout?.sets?.length) continue;
                const run = corosRunOn(day.date);
                if (!run) continue;
                out.push({ id: `${p.coachPlanId || p.id}|${day.date}`, date: day.date, title: day.session || "Workout", workout: day.workout, sets: day.workout.sets, run, runMiles: run.distance / 1609.344 });
            }
        }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Fetches laps COROS hasn't given yet (at most `max` a call). Resolves true when any came in. */
export async function ensureLaps(items, { max = 6 } = {}) {
    const todo = (items || []).filter(i => i.run?.labelId && !lapEntry(i.run));
    if (!todo.length) return false;
    const { fetchLaps } = await import("./trendsData.js");
    return fetchLaps(todo, { max });
}

/** What the athlete-model share sends: each key workout run's laps and which kind they are. */
export function shareLapRuns(items) {
    return (items || []).map(i => {
        const entry = lapEntry(i.run);
        return entry ? { id: `c:${i.run.labelId}`, date: i.date, kind: inferLapKind(entry), laps: entry.laps } : null;
    }).filter(Boolean);
}
