/* ==========================================
   Southbound — a run's share picture, from this device's data

   runCardForSession(session, { fetch })  the card for a completed run
       (js/completedSessions.js shape): the COROS run, its laps (asked
       of COROS once when not saved yet), and the planned workout that day
       (the coach's marathon plan, or a client's coach plan), through the
       one rule in js/runCard.js.
   cardKindFor(session)    "reps" | "splits" | null, for Recent Workouts' tags
   prefetchRecentLaps()    asks COROS for the laps of the last 14 days' runs
                           not saved yet (a few a visit, at most every 10
                           minutes per device), so the cards are ready
                           without opening Analytics; fires sb:laps-updated.
========================================== */

import { runCardModel, hasTargets } from "./runCard.js";
import { HISTORY_KEY, runsBetween, emptyHistory, addDays } from "./corosHistory.js";

const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};
const PREFETCH_KEY = "sb-laps-prefetch-at";
const MILE = 1609.344;

export const lapsOf = labelId => {
    const e = read("coros-laps", {})[labelId];
    return e?.laps?.length ? e : null;
};

function corosRun(labelId, date) {
    const runs = runsBetween(read(HISTORY_KEY, null) || emptyHistory(), date, date);
    return runs.find(r => String(r.labelId) === String(labelId)) || null;
}

// The planned workout on a day: the coach's own marathon plan, else a client's coach plan.
let marathonDays = null;
async function planOn(date) {
    const { showsPersonalPlan } = await import("./role.js");
    if (showsPersonalPlan()) {
        if (!marathonDays) {
            marathonDays = new Map();
            try {
                const [{ WEEKS, getAdjustedWeekDays, PACES, weekStart }, { planDayFromMarathon, marathonTitle }, { autoCategory }] = await Promise.all([
                    import("./marathonData.js"), import("./marathonCoros.js"), import("./featuredTrainingModel.js")
                ]);
                WEEKS.forEach((_, wi) => getAdjustedWeekDays(wi + 1).forEach((day, di) => {
                    if (!day?.miles) return;
                    // Plan days carry no date: Monday of the week + the day's place.
                    const d = new Date(weekStart(wi + 1)); d.setDate(d.getDate() + di);
                    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    const planDay = planDayFromMarathon(day, PACES);
                    marathonDays.set(date, { workout: planDay?.workout || null, title: marathonTitle(day.session, Number(day.miles) || 0), miles: Number(day.miles) || 0, category: autoCategory(day, planDay) });
                }));
            } catch { /* no plan on this device */ }
        }
        return marathonDays.get(date) || null;
    }
    try {
        const { loadCoachPlans } = await import("./coachPlanStore.js");
        for (const p of loadCoachPlans()) {
            for (const week of p?.generatedPlan?.weeks || []) {
                const day = (week.days || []).find(d => d?.date === date && d.workout?.sets?.length);
                if (day) return { workout: day.workout, title: day.session || "Workout", miles: Number(day.miles) || 0, category: null };
            }
        }
    } catch { /* no coach plans here */ }
    return null;
}

async function fetchOne(run, ms = 8000) {
    try {
        const { isCorosConnected } = await import("./corosClient.js");
        if (!isCorosConnected()) return null;
        const { fetchLaps } = await import("./trendsData.js");
        await Promise.race([fetchLaps([{ date: run.date, run }], { max: 1 }), new Promise(resolve => setTimeout(resolve, ms))]);
        return lapsOf(run.labelId);
    } catch { return null; }
}

/** The share picture for a completed run. Resolves { kind, model }. */
export async function runCardForSession(session, { fetch = true } = {}) {
    const labelId = session?.id?.startsWith("c:") ? session.id.slice(2) : null;
    const coros = labelId ? corosRun(labelId, session.date) : null;
    const run = coros || {
        source: session?.source === "strava" ? "strava" : session?.source, date: session?.date,
        distance: session?.run?.meters, duration: session?.durationSec, avgHr: session?.run?.avgHr
    };
    let entry = labelId ? lapsOf(labelId) : null;
    if (!entry && labelId && coros && fetch) entry = await fetchOne(coros);
    const plan = await planOn(session.date);
    // The plan's workout only judges this run when it's the day's main run (not a 2-mile shakeout).
    const fits = plan && (!plan.miles || !session?.run?.meters || session.run.meters / MILE >= plan.miles * 0.6);
    const category = session?.run?.category === "Long Run" ? "long_run" : session?.run?.category === "Speed Work" ? "speed_work" : plan?.category || null;
    return runCardModel({
        run, entry, workout: fits ? plan.workout : null, id: session.id,
        meta: { date: session.date, name: fits && plan.title ? plan.title : session.title !== "Run" ? session.title : "", category, plannedMiles: fits ? plan.miles : session?.run?.plannedMiles }
    });
}

/** What Recent Workouts can promise without asking COROS: "reps", "splits" or null. */
export async function cardKindFor(session) {
    if (session?.type !== "run" || !session.id?.startsWith("c:")) return null;
    const entry = lapsOf(session.id.slice(2));
    if (!entry) return null;
    const plan = await planOn(session.date);
    return plan && hasTargets(plan.workout) ? "reps" : "splits";
}

/** Laps for the last `days` days' COROS runs not saved yet, a few a visit. */
export async function prefetchRecentLaps({ today = null, days = 14, max = 4, every = 10 * 60000 } = {}) {
    try {
        const last = Number(localStorage.getItem(PREFETCH_KEY) || 0);
        if (Date.now() - last < every) return false;
        const { isCorosConnected } = await import("./corosClient.js");
        if (!isCorosConnected()) return false;
        const d = new Date();
        const to = today || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const saved = read("coros-laps", {});
        const todo = runsBetween(read(HISTORY_KEY, null) || emptyHistory(), addDays(to, -(days - 1)), to)
            .filter(r => r.labelId && Number(r.distance) > 800 && !saved[r.labelId])
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(run => ({ date: run.date, run }));
        localStorage.setItem(PREFETCH_KEY, String(Date.now()));
        if (!todo.length) return false;
        const { fetchLaps } = await import("./trendsData.js");
        const got = await fetchLaps(todo, { max });
        if (got) window.dispatchEvent(new CustomEvent("sb:laps-updated"));
        return got;
    } catch { return false; }
}
