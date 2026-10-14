/* ==========================================
   Southbound — which picture a run gets (pure, unit-tested)

   One rule for every place a run can be shared (Today's Featured Runs,
   Train → Recent Workouts, Analytics, the workout page):
   1. a planned workout with targets (pace, rep time, an effort word or a
      mixed repeat) and the watch's laps: rep by rep against the plan
      (js/workoutExecution.js), as long as something could be measured;
   2. otherwise laps: the splits card (every mile / lap with its pace).
      Laps the watch made itself (a watch workout or lap presses) only get
      rep by rep when they fit the plan exactly; otherwise the watch's own
      laps are the truer picture;
   3. otherwise the plain run card (distance, time, pace).
   Nothing is estimated: no laps, no splits.
========================================== */

import { reconstructWorkout, inferLapKind } from "./workoutExecution.js";
import { shareCardModel, splitsCardModel } from "./executionShare.js";

/** Does a planned workout have something to check a lap against? */
export function hasTargets(workout) {
    return Boolean(workout?.sets?.some(s => s.pace || s.repTime || s.parts || (s.effort && s.effort !== "easy" && s.effort !== "recovery")));
}

/**
 * { run, workout?, entry?, id?, meta? } -> { kind: "execution" | "splits" | "plain", model, x? }
 * run: { labelId?, source?, distance (m), duration (s), avgHr?, date }
 * entry: the run's saved laps ({ laps, kind }) or null
 * meta: { date, name, category, plannedMiles }
 */
export function runCardModel({ run, workout = null, entry = null, id = null, meta = {} }) {
    const base = { date: meta.date || run?.date, name: meta.name || "", category: meta.category || null, runMeters: run?.distance, runSec: run?.duration, avgHr: run?.avgHr };
    const lapsOk = entry?.laps?.length && run?.source !== "strava";
    if (lapsOk && hasTargets(workout)) {
        const x = reconstructWorkout(workout, entry, { plannedWorkoutId: id || `run|${run?.labelId || base.date}`, activityId: run?.labelId ? `c:${run.labelId}` : null });
        // Laps that line up with nothing in the plan say nothing about it: show the splits instead.
        // Laps the watch made itself (a watch workout, lap presses) are the run's own
        // structure: only an exact fit with the plan earns rep by rep. Anything less
        // (the plan says 13 + 4 + 3, the watch ran 6 + 4 + 3 + 4 + 3) shows the watch's laps.
        const fits = inferLapKind(entry) === "laps" ? x.matchConfidence === "exact" : x.matchConfidence !== "unmatched";
        if (x.completion?.pct != null && fits) return { kind: "execution", x, model: shareCardModel(x, base) };
    }
    if (lapsOk) {
        const model = splitsCardModel(entry, base);
        if (model) return { kind: "splits", model };
    }
    return { kind: "plain", model: shareCardModel(null, { ...base, runSummary: true, plannedMiles: meta.plannedMiles || null }) };
}
