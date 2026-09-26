/* ==========================================
   Southbound — one week, everything in it (pure)

   The client's week as one list per day, whatever it came from:
     - plan days (the coach's plan, or a Race / Training Plan they made):
       runs, strength days, cross-training, plus a plan's extra
       strength / cross sessions ("supplemental"). A coach's strength
       session on a day (day.strength) is the day itself on a strength
       day, or its own item next to the run on any other day.
     - strength workouts on their Strength schedule. A plan's strength
       session that was also copied onto that schedule (tagged with the
       plan it came from) shows once, as the schedule item.
     - sessions booked with the coach
     - runs they logged (shown on the matching run, which counts as done
       when they logged at least 80% of it; a run with no plan behind it
       appears as its own "Logged run")

   Every workout gets a state: done / today / missed / upcoming (rest
   days are "rest", sessions are never "missed"). No DOM or storage
   here -- js/weekData.js gathers the inputs. Unit-tested in
   tests/weekModel.test.mjs.
========================================== */

import { addDays, typeLabel } from "./coachingPlanModel.js";
import { strengthSummary } from "./strengthWorkout.js";

const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = n => Math.round(num(n) * 10) / 10;

const RUN_TITLES = { easy: "Easy run", recovery: "Recovery run", long: "Long run", workout: "Workout", tempo: "Tempo run", race: "Race", run: "Run" };

function runTitle(type) {
    return RUN_TITLES[type] || typeLabel(type);
}

function kindOf(type) {
    if (type === "strength") return "strength";
    if (type === "cross") return "cross";
    return "run";
}

function supplementalDate(week, entry) {
    const offset = DAY_CODES.indexOf(entry?.day);
    if (!week?.startDate || offset < 0) return null;
    return addDays(week.startDate, offset);
}

function stateFor(item, date, today) {
    if (item.kind === "session") return date < today ? "done" : date === today ? "today" : "upcoming";
    if (item.done) return "done";
    if (item.skipped) return "skipped";
    if (date === today) return "today";
    return date < today ? "missed" : "upcoming";
}

// Which week of which plan a date falls in: "Week 2 of 4 · Fall 10K".
export function planContext(plans, date) {
    const ordered = [...(plans || [])].sort((a, b) => (b.source === "coach") - (a.source === "coach"));
    for (const plan of ordered) {
        const weeks = plan.generatedPlan?.weeks || [];
        const index = weeks.findIndex(w => (w.days || []).some(d => d.date === date));
        if (index >= 0) {
            return { planId: plan.id, planName: plan.name || "Your plan", weekNumber: weeks[index].week ?? index + 1, totalWeeks: weeks.length, phase: weeks[index].phase || "" };
        }
    }
    return null;
}

/**
 * Everything on one date.
 *   plans     [{ id, name, source, adoptedFromId?, generatedPlan }]
 *   strength  strength-schedule items [{ id, date, workoutName, workoutId, time, completed, racePlanId?, trainingPlanId? }]
 *   sessions  [{ date, startTime, title, detail }]
 *   runLog    [{ date, miles }]
 */
export function buildDay(date, { plans = [], strength = [], sessions = [], runLog = [] } = {}, today = date) {
    const items = [];
    const scheduled = strength.filter(s => s.date === date);
    const scheduledFrom = new Set(scheduled.flatMap(s => [s.racePlanId, s.trainingPlanId]).filter(Boolean));

    for (const plan of plans) {
        const planIds = [plan.id, plan.adoptedFromId].filter(Boolean);
        for (const week of plan.generatedPlan?.weeks || []) {
            for (const day of week.days || []) {
                if (day.date !== date || !day.type || day.type === "rest") continue;
                const lift = day.strength?.exercises?.length ? day.strength : null;
                const liftItem = extra => ({
                    id: extra ? `plan-strength:${plan.id}:${date}` : `plan:${plan.id}:${date}`,
                    kind: "strength",
                    title: lift.title || "Strength",
                    detail: strengthSummary({ ...lift, title: "" }),
                    miles: 0,
                    done: Boolean(day.strengthCompleted || (!extra && day.completed)),
                    skipped: Boolean(day.strengthSkipped || (!extra && day.skipped)),
                    structured: true,
                    actual: day.strengthResultId ? { rpe: day.strengthRpe ?? null, pain: Boolean(day.strengthPain) } : null,
                    coachPlanId: plan.coachPlanId || null,
                    planName: plan.name || "",
                    fromCoach: plan.source === "coach",
                    source: { type: extra ? "plan-strength" : "plan", programId: plan.id, date, strength: true }
                });
                if (lift && day.type === "strength") { items.push(liftItem(false)); continue; }
                const kind = kindOf(day.type);
                const session = String(day.session || "").trim();
                const title = kind === "run" ? runTitle(day.type) : kind === "strength" ? (session || "Strength") : (session || "Cross-training");
                items.push({
                    id: `plan:${plan.id}:${date}`,
                    kind,
                    title,
                    detail: kind === "run" && session && session.toLowerCase() !== String(day.type).toLowerCase() ? session : "",
                    miles: kind === "run" ? round1(day.miles) : 0,
                    done: Boolean(day.completed),
                    skipped: Boolean(day.skipped),
                    structured: Boolean(day.workout && (day.workout.sets?.length || day.workout.warmup || day.workout.cooldown)),
                    dayType: day.type,
                    fuelNote: day.workout?.fuel || "",
                    actual: day.resultId ? { distance: day.actualDistance ?? null, durationSec: day.actualDuration ?? null, rpe: day.rpe ?? null, pain: Boolean(day.pain) } : null,
                    coachPlanId: plan.coachPlanId || null,
                    planName: plan.name || "",
                    fromCoach: plan.source === "coach",
                    source: { type: "plan", programId: plan.id, date }
                });
                if (lift) items.push(liftItem(true));
            }
            for (const entry of week.supplemental || []) {
                if (supplementalDate(week, entry) !== date) continue;
                const kind = entry.type === "strength" ? "strength" : "cross";
                // Already on their Strength schedule (with its own done mark).
                if (kind === "strength" && planIds.some(id => scheduledFrom.has(id))) continue;
                items.push({
                    id: `extra:${plan.id}:${date}:${entry.type}`,
                    kind,
                    title: entry.session || (kind === "strength" ? "Strength" : "Cross-training"),
                    detail: "",
                    miles: 0,
                    done: Boolean(entry.completed),
                    planName: plan.name || "",
                    fromCoach: plan.source === "coach",
                    source: { type: "extra", programId: plan.id, date }
                });
            }
        }
    }

    for (const s of scheduled) {
        items.push({
            id: `strength:${s.id}`,
            kind: "strength",
            title: s.workoutName || "Strength workout",
            detail: s.time ? niceTime(s.time) : "",
            miles: 0,
            done: Boolean(s.completed),
            planName: s.racePlanName || s.trainingPlanName || "",
            fromCoach: false,
            workoutId: s.workoutId || "",
            source: { type: "strength", itemId: s.id, date }
        });
    }

    for (const s of sessions.filter(x => x.date === date)) {
        items.push({
            id: `session:${s.id || s.date + s.startTime}`,
            kind: "session",
            title: s.title || "Session with your coach",
            detail: [s.startTime ? niceTime(s.startTime) : "", s.detail].filter(Boolean).join(" · "),
            miles: 0,
            done: false,
            fromCoach: true,
            source: { type: "session", date }
        });
    }

    // Logged runs: shown on the day's run, or as their own item.
    const logged = round1(runLog.filter(r => r.date === date).reduce((sum, r) => sum + num(r.miles), 0));
    const run = items.find(i => i.kind === "run");
    if (logged > 0) {
        if (run) {
            run.logged = logged;
            // Logging (most of) the planned run counts as doing it, even
            // without ticking it off. Not saved as a done mark.
            if (!run.done && (!run.miles || logged >= run.miles * 0.8)) { run.done = true; run.autoDone = true; }
        }
        else items.push({ id: `log:${date}`, kind: "run", title: "Logged run", detail: "", miles: logged, logged, done: true, fromCoach: false, source: { type: "log", date } });
    }

    const order = { run: 0, strength: 1, cross: 2, session: 3 };
    items.sort((a, b) => order[a.kind] - order[b.kind]);
    for (const item of items) item.state = stateFor(item, date, today);

    const workouts = items.filter(i => i.kind !== "session");
    const status = !items.length ? "rest"
        : workouts.length && workouts.every(i => i.done) ? "done"
        : workouts.some(i => i.state === "missed") ? "missed"
        : date < today && workouts.length && workouts.every(i => i.done || i.state === "skipped") ? "skipped"
        : date === today ? "today"
        : date < today ? "done" : "upcoming";

    return { date, isToday: date === today, items, status, loggedMiles: logged };
}

// A Monday-to-Sunday week, plus how it's going.
export function buildWeek(monday, inputs, today) {
    const days = [];
    for (let i = 0; i < 7; i++) days.push(buildDay(addDays(monday, i), inputs, today));
    const workouts = days.flatMap(d => d.items.filter(i => i.kind !== "session" && i.source.type !== "log"));
    const runs = workouts.filter(i => i.kind === "run");
    const strength = workouts.filter(i => i.kind === "strength");
    return {
        monday,
        sunday: addDays(monday, 6),
        days,
        context: planContext(inputs.plans, today >= monday && today <= addDays(monday, 6) ? today : monday)
            || planContext(inputs.plans, addDays(monday, 6)),
        summary: {
            planned: workouts.length,
            done: workouts.filter(i => i.done).length,
            missed: workouts.filter(i => i.state === "missed").length,
            miles: round1(runs.reduce((s, i) => s + i.miles, 0)),
            milesDone: round1(runs.filter(i => i.done).reduce((s, i) => s + i.miles, 0)),
            loggedMiles: round1(days.reduce((s, d) => s + d.loggedMiles, 0)),
            strength: { planned: strength.length, done: strength.filter(i => i.done).length },
            sessions: days.flatMap(d => d.items.filter(i => i.kind === "session")).length
        }
    };
}

// The next workout after `today` (for a rest day: "Next: Sat, long run").
export function nextWorkout(inputs, today, horizonDays = 21) {
    for (let i = 1; i <= horizonDays; i++) {
        const date = addDays(today, i);
        const item = buildDay(date, inputs, today).items.find(x => x.kind !== "session" && x.source.type !== "log");
        if (item) return { date, item };
    }
    return null;
}

function niceTime(hhmm) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return hhmm || "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
