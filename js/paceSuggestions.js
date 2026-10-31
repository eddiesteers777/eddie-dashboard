/* ==========================================
   Southbound — pace suggestions from the laps a client shares (pure)

   Feeds Pace v2 (js/planRules.js proposePaceV2) with the rep-by-rep
   workouts the coach can already see: the client's shared laps, lined up
   with the published plan by sharedKeyWork (js/clientModel.js) and
   rebuilt by reconstructWorkout (js/workoutExecution.js). No new data and
   no new rules: it only exists while the client shares their athlete
   model. Without sharing, or with fewer than two clean speed sessions,
   nothing shows.

   Context comes from what the client tapped when logging the run
   (js/runConditions.js): hot or humid = heat; windy, rain, snow or cold =
   weather. They explain a slow session; they don't count against easing.

   paceSuggestions({ keyWork, laps, results, weeksToRace, monday })
     -> suggestion rows for the card (js/planSuggestions.js shape)
   Unit-tested in tests/paceSuggestions.test.mjs.
========================================== */

import { reconstructWorkout } from "./workoutExecution.js";
import { proposePaceV2 } from "./planRules.js";

const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const mean = a => a.reduce((t, x) => t + x, 0) / a.length;

// Air temperature the client typed at or above this counts as a hot run (our assumption: Heat v2's curve starts adding time at 80 F).
export const HEAT_TEMP_F = 80;

export function contextFrom(conditions = [], tempF = null) {
    const c = new Set(conditions);
    return {
        heat: c.has("hot") || c.has("humid") || (Number.isFinite(tempF) && tempF >= HEAT_TEMP_F),
        weather: c.has("windy") || c.has("rain") || c.has("snow") || c.has("cold")
    };
}

/** One speed session for Pace v2 from a rebuilt workout, or null when it has no judged reps. */
export function speedSessionFrom(x, { date = "", conditions = [], tempF = null } = {}) {
    const work = (x?.steps || []).filter(s => s.kind === "work" && s.target && Number.isFinite(s.target.lo) && Number.isFinite(s.target.hi));
    if (!work.length) return null;
    const done = work.filter(s => s.status === "done" && Number.isFinite(s.actual?.paceSec));
    if (!done.length) return null;
    const plannedSec = mean(work.map(s => (s.target.lo + s.target.hi) / 2));
    return {
        date, kind: work.length >= 3 ? "interval" : "tempo",
        plannedSec: Math.round(plannedSec),
        avgSec: Math.round(mean(done.map(s => s.actual.paceSec))),
        repsSec: done.map(s => Math.round(s.actual.paceSec)),
        inPlan: true,
        complete: x.completion ? x.completion.done === x.completion.planned : false,
        gpsOk: ["exact", "approximate"].includes(x.matchConfidence),
        context: contextFrom(conditions, tempF)
    };
}

export function paceSuggestions({ keyWork = [], laps = {}, results = [], weeksToRace = null, monday = "" } = {}) {
    const byDate = new Map((results || []).filter(r => r?.kind !== "strength").map(r => [r.date, { conditions: r.conditions || [], tempF: Number.isFinite(r.tempF) ? r.tempF : null }]));
    const sessions = keyWork.map(w => {
        const x = reconstructWorkout(w.workout, laps[w.run.labelId], { plannedWorkoutId: w.id, activityId: `c:${w.run.labelId}` });
        return speedSessionFrom(x, { date: w.date, ...(byDate.get(w.date) || {}) });
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

    // One pace target per kind and 5 s band: a 10K-pace rep and a tempo don't share a trend.
    const groups = new Map();
    for (const s of sessions) {
        const key = `${s.kind}:${Math.round(s.plannedSec / 5) * 5}`;
        (groups.get(key) || groups.set(key, []).get(key)).push(s);
    }
    const out = [];
    for (const [key, list] of groups) {
        const planned = Math.round(mean(list.map(s => s.plannedSec)));
        const r = proposePaceV2(list, planned, { weeksToRace });
        const label = list[0].kind === "interval" ? "Interval" : "Tempo";
        const quiet = r.status === "MONITORING" && !(r.counted >= 2 && (r.trend.beaten || r.trend.missed || r.trend.drift));
        if (quiet) continue;
        const move = r.proposal === "tighten" ? `Tighten ${label.toLowerCase()} pace by ${Math.round(r.from - r.to)} s`
            : r.proposal === "ease" ? `Ease ${label.toLowerCase()} pace by ${Math.round(r.to - r.from)} s`
            : r.status === "COACH_REVIEW" ? `${label} time trial to look at`
            : r.status === "COACH_REEVALUATE" ? `${label} pace changed twice in a row`
            : r.status === "TAPER_HOLD" ? `${label} pace held (taper)`
            : `${label} pace: monitoring`;
        const change = r.proposal === "tighten" || r.proposal === "ease" ? `${mmss(r.from)} → ${mmss(r.to)} per mile` : "";
        out.push({
            id: `pace:${key}:${monday}`, kind: "pace", tone: r.proposal === "hold" && r.status !== "MONITORING" ? "hold" : "call",
            chip: r.status === "PROPOSED" ? `Pace · ${label.toLowerCase()}` : r.status === "MONITORING" ? "Pace · watching" : "Pace · held",
            title: move, text: [change, `From ${r.counted} clean ${label.toLowerCase()} session${r.counted === 1 ? "" : "s"} in the shared laps.`].filter(Boolean).join(" "),
            detail: [r.reason, ...r.notes, r.excluded.length ? `Not counted: ${r.excluded.map(e => e.why).join(" ")}` : "",
                "Tempo and interval targets only. Easy pace stays by effort. The step is 3 s a mile, an assumption not yet checked on real weeks."].filter(Boolean).join(" "),
            proposal: r.proposal, status: r.status, weeksToRace
        });
    }
    return out;
}
