/* ==========================================
   Southbound — the athlete model for a client (coach side, pure)

   Athlete model step 7 (docs/PERFORMANCE_ENGINE_PLAN.md). The same
   engines that run on Eddie's own data, run on a client's:
     sessions  the client's shared history (js/athleteShare.js, when they
               share the athlete model) plus their logged plan workouts
               (workoutResults, which the coach can always read): a logged
               run gives its effort to that day's watch run, and stands in
               for a run on a day with no watch run (distance, time, effort)
     races     the coach's own race answers for this client
               ("coach-athlete-model", js/clientModelTab.js) on top of any
               the client gave
   -> load (js/sessionDose.js + js/loadState.js), how they're responding
   (js/trainingResponse.js), readiness v2 (js/readinessV2.js, only with
   shared nights), race capability (js/raceCapability.js) and the weekly
   decision (js/weeklyDecision.js) on the next 7 days of the coach's plan,
   all run once by athleteCore() in js/athleteState.js (weekly planning
   P1); clientInputs() is the client's input for the Athlete State.

   applyDecisionToPlan turns the decision's changes into edits of the
   coach's plan (structured workouts included), for the plan workspace to
   take in as unpublished changes with Undo; the client sees nothing
   until the coach publishes.

   Unit-tested in tests/clientModel.test.mjs.
========================================== */

import { addDays, raceCandidates, confirmedRaces } from "./athleteLedger.js";
import { toCr10, logScale } from "./effortScale.js";
import { fillPlanEfforts, effortsFromResults } from "./athleteShare.js";
import { recentWords } from "./loadState.js";
import { mondayOf, DEFAULT_POLICY } from "./weeklyDecision.js";
import { athleteCore, targetMeters } from "./athleteState.js";
import { workoutSummary, plannedMiles } from "./runWorkout.js";

export { targetMeters };

const MILE = 1609.344;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const clone = v => JSON.parse(JSON.stringify(v));

// ---------- sessions ----------

/** A logged plan run (workoutResults) as a session, for days with no watch run. */
function fromResult(r) {
    const miles = Number(r.distance) || 0;
    return {
        id: `p:${String(r.id || `${r.date}`).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`,
        aliases: [], sources: ["plan"], date: r.date, start: null,
        name: r.title || "Plan workout", otherName: "",
        distance: miles * MILE, movingSec: Number(r.durationSec) || null, elapsedSec: null,
        avgHr: null, maxHr: null, climb: null, best: null, indoor: false, trail: false,
        rpe: toCr10(r.rpe, logScale(r.updatedAt || r.createdAt || `${r.date}T12:00:00Z`)),
        rpeAnswered: Number.isInteger(Number(r.rpe)) && r.rpe >= 1,
        race: null
    };
}

/**
 * The client's sessions, oldest first.
 *   shared   decodeShare(...) or null
 *   results  their workoutResults (any plan)
 *   races    { sessionId: race record } the coach confirmed
 */
export function clientSessions({ shared = null, results = [], races = {} } = {}) {
    const sessions = (shared?.sessions || []).map(s => ({ ...s }));
    fillPlanEfforts(sessions, effortsFromResults(results));
    const watchDates = new Set(sessions.map(s => s.date));
    for (const r of results || []) {
        if (r?.kind === "strength" || r?.status !== "completed" || !r.date || !(Number(r.distance) > 0)) continue;
        if (watchDates.has(r.date)) continue;
        sessions.push(fromResult(r));
    }
    for (const s of sessions) {
        const answer = races[s.id];
        if (answer) s.race = answer;
    }
    return sessions.sort((a, b) => String(a.start || `${a.date}T12`).localeCompare(String(b.start || `${b.date}T12`)));
}

// ---------- the plan's next days ----------

const KIND = { workout: "quality", tempo: "quality", long: "long", easy: "easy", recovery: "easy", race: "race" };

/**
 * The coach plan's days from `from` for `n` days, in the shape the weekly
 * decision reads ([{ date, week, index, dayName, session, miles, pace, kind, phase, race }]).
 * The session text spells reps "6 x" so the decision can count them.
 */
export function coachPlanDays(plan, from, n = 7) {
    const to = addDays(from, n);
    const out = [];
    (plan?.weeks || []).forEach((week, wi) => {
        (week.days || []).forEach((day, di) => {
            if (!day?.date || day.date < from || day.date >= to) return;
            const text = day.workout ? workoutSummary(day.workout) || day.session || "" : day.session || "";
            out.push({
                date: day.date, week: wi, index: di, dayName: DAY_NAMES[(new Date(`${day.date}T12:00:00`).getDay() + 6) % 7],
                session: text.replace(/×/g, "x") || (day.type ? day.type[0].toUpperCase() + day.type.slice(1) : ""),
                miles: Number(day.miles) || 0, pace: "", kind: KIND[day.type] || "rest",
                phase: String(week.phase || "").toLowerCase(), race: day.type === "race",
                done: Boolean(day.completed || day.skipped)
            });
        });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The active plan holding `today` (or starting soonest after it), from the coach's published plans. */
export function currentPlan(plans = [], today) {
    const active = (plans || []).filter(h => h?.status === "active" && h.plan?.weeks?.length);
    const range = h => {
        const dates = h.plan.weeks.flatMap(w => (w.days || []).map(d => d.date)).filter(Boolean).sort();
        return { from: dates[0], to: dates.at(-1) };
    };
    return active.find(h => { const r = range(h); return r.from <= today && r.to >= today; })
        || active.filter(h => range(h).from > today).sort((a, b) => range(a).from.localeCompare(range(b).from))[0]
        || null;
}

// ---------- writing a decision into the plan ----------

const roundTo = (x, step) => Math.round(x / step) * step;

/** Scales every distance and time in a structured workout (reps stay). */
function scaleWorkout(w, factor) {
    const out = clone(w);
    const scale = step => {
        if (!step?.amount) return;
        if (step.unit === "min") step.amount = Math.max(1, Math.round(step.amount * factor));
        else if (step.unit === "mi") step.amount = Math.max(0.25, roundTo(step.amount * factor, 0.25));
        else if (step.unit === "km") step.amount = Math.max(0.5, roundTo(step.amount * factor, 0.5));
        else step.amount = Math.max(100, roundTo(step.amount * factor, 100));
    };
    scale(out.warmup);
    scale(out.cooldown);
    for (const set of out.sets || []) if (!set.parts?.length) scale(set);
    return out;
}

const repsIn = text => Number(String(text || "").match(/(\d+)\s*x/i)?.[1]) || null;
/** "1.5 mi warm-up · 6 × 1 mi @ 7:40–7:50/mi (…) · …" -> "6 × 1 mi"; else the text, short. */
export function workoutLabel(text) {
    const t = String(text || "").replace(/ x /g, " × ");
    const reps = t.match(/\d+\s*×\s*[\d.]+\s*(mi|km|m|min)\b/);
    return reps ? reps[0] : t.length > 40 ? `${t.slice(0, 38).trim()}…` : t || "workout";
}
const SLOW_CUE = "This week: the slower end of the pace range.";

/**
 * Applies a weekly decision's changes to a copy of the plan.
 * -> { plan, lines: ["Tue: 6 × 1 mi → 4 × 1 mi", …] }
 */
export function applyDecisionToPlan(plan, decision) {
    const out = clone(plan);
    const lines = [];
    const byDate = new Map(out.weeks.flatMap(w => w.days || []).map(d => [d.date, d]));
    for (const c of decision?.changes || []) {
        const day = byDate.get(c.date);
        if (!day || day.completed || day.skipped) continue;
        // Already changed (by hand, or this decision applied once before): leave it.
        if (Number(day.miles) !== Number(c.before.miles)) continue;
        const before = { session: day.session, miles: day.miles };
        const toEasy = /^Easy run \(was:/.test(c.after.session);
        const slow = /slower end of the pace range/.test(c.after.session) && !/slower end/.test(c.before.session);
        if (toEasy) {
            delete day.workout;
            day.type = "easy";
            day.session = `Easy run (was: ${workoutLabel(before.session)})`.slice(0, 300);
            day.miles = c.after.miles;
        } else if (day.workout) {
            const w = day.workout;
            const from = repsIn(c.before.session), to = repsIn(c.after.session);
            if (from && to && to < from) {
                const set = (w.sets || []).find(s => s.repeat === from) || (w.sets || []).find(s => s.repeat > 1);
                if (set) set.repeat = Math.max(1, to);
            } else if (slow) {
                w.cue = (w.cue ? `${SLOW_CUE} ${w.cue}` : SLOW_CUE).slice(0, 200);
            } else if (c.after.miles < c.before.miles && c.before.miles > 0) {
                day.workout = scaleWorkout(w, c.after.miles / c.before.miles);
            }
            const summary = workoutSummary(day.workout);
            if (summary) day.session = summary.slice(0, 300);
            const pm = plannedMiles(day.workout);
            day.miles = pm.exact && pm.miles ? Math.min(pm.miles, before.miles || pm.miles) : Math.min(c.after.miles, before.miles || c.after.miles);
            if (slow) day.session = `${day.session} (slower end of the pace range)`.slice(0, 300);
        } else {
            day.session = String(c.after.session || "").slice(0, 300);
            day.miles = c.after.miles;
        }
        if (day.session === before.session && day.miles === before.miles) continue;
        lines.push(`${c.dayName}: ${before.session !== day.session ? `${before.session || "—"} → ${day.session}` : ""}${before.session !== day.session && before.miles !== day.miles ? ", " : ""}${before.miles !== day.miles ? `${before.miles} → ${day.miles} mi` : ""}`);
    }
    return { plan: out, lines };
}

// ---------- the whole picture ----------

/**
 * A client's shared laps (decodeShare(...).laps) lined up with the plan:
 * each structured day that has a run's laps becomes a key workout, so the
 * engines (executionSummary) and the hub rebuild it rep by rep.
 * -> { keyWork: [{ id, date, title, kind, sets, workout, run: { labelId } }], laps: { labelId: { laps, kind } } }
 */
export function sharedKeyWork(plan, lapRuns = [], today, { days = 42, planId = "plan" } = {}) {
    const from = addDays(today, -(days - 1));
    const byDate = new Map();
    for (const week of plan?.weeks || []) for (const day of week.days || []) if (day?.date && day.workout?.sets?.length) byDate.set(day.date, day);
    const keyWork = [], laps = {};
    for (const r of lapRuns || []) {
        const day = byDate.get(r.date);
        if (!day || r.date < from || r.date > today || !r.laps?.length) continue;
        const labelId = String(r.id || "").replace(/^c:/, "") || r.date;
        laps[labelId] = { laps: r.laps, kind: r.kind, date: r.date };
        keyWork.push({
            id: `${planId}|${r.date}`, date: r.date, title: day.workout ? workoutSummary(day.workout) || day.session || "Workout" : day.session || "Workout",
            kind: KIND[day.type] || "quality", sets: day.workout.sets, workout: day.workout, run: { labelId }
        });
    }
    return { keyWork: keyWork.sort((a, b) => b.date.localeCompare(a.date)), laps };
}

/**
 * A client's inputs for the Athlete State (js/athleteState.js), pure.
 *   shared   decodeShare(...) or null; results, races, plan (the coach's whole plan)
 *   record   the client profile; previous last week's level (the second-Ease rule)
 * Everything else the hub knows (check-ins, requests, bookings...) can be passed through `extra`.
 */
export function clientInputs({ shared = null, results = [], races = {}, plan = null, record = null, today, meters = null, previous = null, policy = DEFAULT_POLICY, extra = {} } = {}) {
    const sessions = clientSessions({ shared, results, races });
    const key = sharedKeyWork(plan, shared?.laps || [], today);
    return {
        who: "client", today, sessions,
        health: shared?.health || {}, fitness: shared?.fitness || {}, checkins: shared?.checkins || {},
        settings: {}, laps: key.laps, keyWork: key.keyWork,
        nextDays: plan ? coachPlanDays(plan, addDays(today, 1), 7).filter(d => !d.done) : [],
        target: meters || targetMeters(record) || 10000,
        policy, previous, profile: record, results,
        tier: shared ? "shared" : sessions.length ? "plan-logs" : "none",
        through: shared?.through || null,
        ...extra
    };
}

/**
 * Everything the Model tab shows: the Athlete State's engines (athleteCore) for one client.
 *   shared   decodeShare(...) or null; results, races, plan (the coach's whole plan)
 *   record   the client profile; previous last week's level (the second-Ease rule)
 */
export function clientModel(args = {}) {
    const inputs = clientInputs(args);
    const { today, sessions } = inputs;
    const core = athleteCore(inputs);
    const results = args.results || [];
    return {
        today, tier: inputs.tier, sessions, watchRuns: sessions.filter(s => s.sources[0] !== "plan").length, through: inputs.through,
        counts: {
            runs: sessions.length, recent: sessions.filter(s => s.date >= addDays(today, -27)).length,
            answered: sessions.filter(s => s.date >= addDays(today, -27) && s.rpeAnswered).length,
            nights: Object.keys(inputs.health).length, mornings: Object.keys(inputs.checkins).length,
            planLogs: results.filter(r => r?.kind !== "strength" && r?.status === "completed").length
        },
        load: core.load, loadWords: recentWords(core.load.today?.percentile), scale: core.dose.scale, anchors: core.dose.anchors,
        response: { efficiency: core.eff.signal, effort: core.effort.signal, reading: core.reading, effortRows: core.effort.rows.slice(-5) },
        readiness: core.readinessV2, race: core.race, target: core.meters,
        candidates: raceCandidates(sessions).slice(0, 4),
        confirmed: confirmedRaces(sessions),
        planDays: inputs.nextDays, decision: core.decision, weekOf: mondayOf(today),
        core, inputs
    };
}
