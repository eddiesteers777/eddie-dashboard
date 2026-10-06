/* ==========================================
   Southbound — where the Athlete State's inputs come from

   Weekly planning P1 (docs/WEEKLY_PLANNING_AUDIT.md, section 7). The
   pure Athlete State (js/athleteState.js) reads one inputs object; this
   gathers it from the same places the existing cards read, so the state
   and the cards can never disagree:

   selfInputs(today)          Eddie's own: the ledger with his marathon
                              plan (js/athleteData.js loadModelInputs),
                              the morning numbers and check-ins
                              (js/readinessData.js inputs), the laps saved
                              for key workouts, the plan's next 7 / 14 days
                              (js/weeklyDecisionData.js planDaysFrom, the
                              same days This week reads), last week's
                              decision level and his logged choices
                              ("athlete-model"), his planner's busy days
                              (the category only) and strength days
   selfState(today)           -> { inputs, core, state }, built once per
                              page and day, forgotten when an answer, new
                              COROS runs or a Strava import arrive
   clientSourceInputs(data, { clientUid, firstName, today })
                              a client's, from what the Client Hub already
                              loaded (js/clientDirectory.js loadClientRecord):
                              shared runs / nights / mornings, logged plan
                              workouts, the published plan, the profile,
                              weekly check-ins, change requests, booked
                              sessions, and the coach's own race answers and
                              choices for them ("coach-athlete-model")
   Nothing here is stored: the state is worked out on the coach's device.
========================================== */

import { athleteCore, athleteState } from "./athleteState.js";
import { addDays } from "./athleteLedger.js";

const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); return addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7)); };
const MILE = 1609.344;

// ---------- Eddie's own ----------

/** Every date a strength session was logged (strength-history is kept per exercise). */
function strengthDates() {
    const history = read("strength-history", {}) || {};
    const out = new Set();
    for (const entries of Object.values(history)) for (const e of Array.isArray(entries) ? entries : []) if (/^\d{4}-\d{2}-\d{2}$/.test(e?.date || "")) out.add(e.date);
    return [...out].sort();
}

export async function selfInputs(today) {
    const [athleteData, readinessData, decisionData, md, trends, planner] = await Promise.all([
        import("./athleteData.js"), import("./readinessData.js"), import("./weeklyDecisionData.js"),
        import("./marathonData.js"), import("./trendsData.js"), import("./plannerEvents.js")
    ]);
    const model = await athleteData.loadModelInputs(today);
    const morning = readinessData.inputs();
    const [nextDays, upcoming, todayRow] = await Promise.all([
        decisionData.planDaysFrom(addDays(today, 1), 7),
        decisionData.planDaysFrom(addDays(today, 1), 14),
        decisionData.planDaysFrom(today, 1)
    ]);
    let keyWork = [];
    try { keyWork = trends.keyWorkouts(today, { days: 42 }); } catch { keyWork = []; }
    // Last week's level, exactly as the This week card reads it (the second-Ease rule).
    const weekOf = mondayOf(today);
    const earlier = decisionData.snapshots().filter(s => s.weekOf < weekOf).sort((a, b) => b.weekOf.localeCompare(a.weekOf));
    const previous = earlier[0]?.weekOf === addDays(weekOf, -7) ? earlier[0].level : null;
    const week = todayRow[0]?.week || upcoming[0]?.week || null;
    const w = week ? md.WEEKS[week - 1] : null;
    const race = athleteData.planRace(model.planDays);
    return {
        who: "self", today, now: Date.now(),
        sessions: model.sessions, health: morning.health, fitness: morning.fitness,
        checkins: morning.checkins, settings: morning.settings,
        laps: athleteData.loadLaps(), keyWork, nextDays, upcoming,
        policy: decisionData.loadPolicy(), previous,
        plan: {
            source: "marathon plan", name: race?.name || "Marathon plan",
            week, totalWeeks: md.WEEKS.length,
            phase: w ? (md.PHASES[w.phase]?.label || w.phase) : "", phaseKey: w?.phase || "",
            purpose: w?.purpose || "", race
        },
        decisions: decisionData.decisionLog(),
        busyDays: planner.loadPlannerEvents().map(e => ({ date: e.date, category: e.category || "personal" })),
        strengthDates: strengthDates()
    };
}

let cached = null;
const forget = () => { cached = null; };
/** Forget today's state now (a page that redraws on the same events calls this first, so it never redraws the old one). */
export const forgetSelfState = forget;
if (typeof window !== "undefined") {
    for (const name of ["sb:athlete-answers", "eddieos:coros-history-updated", "sb:strava-updated"]) window.addEventListener(name, forget);
}

/** Eddie's Athlete State for today: { inputs, core, state }, once per page and day. */
export function selfState(today) {
    if (cached?.today === today) return cached.promise;
    const promise = selfInputs(today).then(inputs => {
        const core = athleteCore(inputs);
        return { inputs, core, state: athleteState(inputs, { core }) };
    });
    promise.catch(forget);
    cached = { today, promise };
    return promise;
}

// ---------- a client's ----------

/** The coach plan's meta for the state: week, phase, race, settings (the whole plan, from the master). */
export function planMeta(header, today) {
    const plan = header?.plan;
    if (!plan?.weeks?.length) return null;
    const wi = plan.weeks.findIndex(w => (w.days || []).some(d => d.date === today));
    const week = wi >= 0 ? plan.weeks[wi] : null;
    const days = plan.weeks.flatMap(w => w.days || []);
    const raceDay = plan.raceDate ? days.find(d => d.date === plan.raceDate) : days.find(d => d.type === "race");
    const miles = Number(raceDay?.miles) || 0;
    const meters = miles >= 26 ? 42195 : miles >= 13 ? 21097.5 : miles > 0 ? Math.round(miles * MILE) : null;
    return {
        source: "coach plan", name: header.name || "Plan", version: header.version ?? null,
        week: wi >= 0 ? wi + 1 : null, totalWeeks: plan.window?.totalWeeks || plan.weeks.length,
        phase: week?.phase || "", cutback: Boolean(week?.cutback), purpose: "",
        race: raceDay ? { name: header.name || "Race day", date: raceDay.date, meters, goalSec: null } : null,
        settings: plan.generator?.settings || null
    };
}

/**
 * A client's inputs, from the hub's record (loadClientRecord). Pure apart
 * from reading the coach's own "coach-athlete-model" entry for this client.
 */
export async function clientSourceInputs(data, { clientUid, firstName = "", today }) {
    const [{ clientInputs, currentPlan, coachPlanDays }, { decodeShare }] = await Promise.all([import("./clientModel.js"), import("./athleteShare.js")]);
    const entry = (read("coach-athlete-model", {}) || {})[clientUid] || {};
    const header = currentPlan(data.coachingPlans || [], today);
    const plan = header?.plan || null;
    const lastWeek = (entry.snapshots || []).find(s => s.weekOf === addDays(mondayOf(today), -7));
    const booked = (data.requests || []).filter(r => r.status === "approved").flatMap(r => r.dates || []);
    return clientInputs({
        shared: data.sharedAthleteModel ? decodeShare(data.sharedAthleteModel) : null,
        results: data.results || [], races: entry.races || {}, plan, record: data.record || null,
        today, previous: lastWeek?.level || null,
        extra: {
            now: Date.now(), firstName,
            upcoming: plan ? coachPlanDays(plan, addDays(today, 1), 14) : [],
            plan: planMeta(header, today),
            weeklyCheckins: data.checkins || [], changeRequests: data.changes || [], booked,
            decisions: entry.decisions || [],
            strengthDates: (data.results || []).filter(r => r?.kind === "strength" && r.status === "completed").map(r => r.date)
        }
    });
}

/** A client's Athlete State: { inputs, core, state }. */
export async function clientState(data, opts) {
    const inputs = await clientSourceInputs(data, opts);
    const core = athleteCore(inputs);
    return { inputs, core, state: athleteState(inputs, { core }) };
}
