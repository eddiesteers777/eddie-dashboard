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
   decision (js/weeklyDecision.js) on the next 7 days of the coach's plan.

   applyDecisionToPlan turns the decision's changes into edits of the
   coach's plan (structured workouts included), for the plan workspace to
   take in as unpublished changes with Undo; the client sees nothing
   until the coach publishes.

   Unit-tested in tests/clientModel.test.mjs.
========================================== */

import { addDays, raceCandidates, confirmedRaces } from "./athleteLedger.js";
import { fillPlanEfforts, effortsFromResults } from "./athleteShare.js";
import { sessionDoses } from "./sessionDose.js";
import { loadState, recentWords } from "./loadState.js";
import { efficiency, effortResponse, efficiencySignal, effortSignal, reading } from "./trainingResponse.js";
import { readinessV2 } from "./readinessV2.js";
import { predictRace } from "./raceCapability.js";
import { weekDecision, mondayOf, DEFAULT_POLICY } from "./weeklyDecision.js";
import { workoutSummary, plannedMiles } from "./runWorkout.js";

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
        rpe: Number.isInteger(Number(r.rpe)) && r.rpe >= 1 ? Number(r.rpe) : null,
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

const TARGETS = { "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };
/** The race distance the client is training for (their profile), else null. */
export function targetMeters(record) {
    if (TARGETS[record?.eventType]) return TARGETS[record.eventType];
    const t = String(record?.targetEvent || "").toLowerCase();
    if (/half/.test(t)) return TARGETS.half;
    if (/marathon/.test(t)) return TARGETS.marathon;
    if (/10\s?k/.test(t)) return TARGETS["10k"];
    if (/5\s?k/.test(t)) return TARGETS["5k"];
    return null;
}

/**
 * Everything the Model tab shows.
 *   shared   decodeShare(...) or null; results, races, plan (the coach's whole plan)
 *   record   the client profile; previous last week's level (the second-Ease rule)
 */
export function clientModel({ shared = null, results = [], races = {}, plan = null, record = null, today, meters = null, previous = null, policy = DEFAULT_POLICY } = {}) {
    const sessions = clientSessions({ shared, results, races });
    const health = shared?.health || {}, fitness = shared?.fitness || {}, checkins = shared?.checkins || {};
    const watchRuns = sessions.filter(s => s.sources[0] !== "plan").length;
    const tier = shared ? "shared" : sessions.length ? "plan-logs" : "none";
    const dr = sessionDoses(sessions, today, { laps: {}, health, fitness });
    const load = loadState(dr.doses, today);
    const eff = efficiency(sessions, dr.doses, today);
    const er = effortResponse(sessions, dr.doses, today);
    const response = { effRuns: eff.runs, effortRows: er.rows };
    const effSig = efficiencySignal(eff.runs, today);
    const effortSig = effortSignal(er.rows, today);
    const data = { health, fitness, checkins, settings: {}, response, loadSeries: load.series, quality: [], doses: dr.doses };
    const readiness = Object.keys(health).length ? readinessV2(today, data) : null;
    const target = meters || targetMeters(record) || 10000;
    const race = sessions.length ? predictRace({ meters: target, asOf: today, sessions, health, fitness }) : null;
    const planDays = plan ? coachPlanDays(plan, addDays(today, 1), 7).filter(d => !d.done) : [];
    const decision = weekDecision(today, data, planDays, { policy, previous });
    const answered = sessions.filter(s => s.date >= addDays(today, -27) && s.rpeAnswered).length;
    const recent = sessions.filter(s => s.date >= addDays(today, -27)).length;
    return {
        today, tier, sessions, watchRuns, through: shared?.through || null,
        counts: {
            runs: sessions.length, recent, answered,
            nights: Object.keys(health).length, mornings: Object.keys(checkins).length,
            planLogs: (results || []).filter(r => r?.kind !== "strength" && r?.status === "completed").length
        },
        load, loadWords: recentWords(load.today?.percentile), scale: dr.scale, anchors: dr.anchors,
        response: { efficiency: effSig, effort: effortSig, reading: reading(effSig, effortSig), effortRows: er.rows.slice(-5) },
        readiness, race, target,
        candidates: raceCandidates(sessions).slice(0, 4),
        confirmed: confirmedRaces(sessions),
        planDays, decision, weekOf: mondayOf(today)
    };
}
