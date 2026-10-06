/* ==========================================
   Southbound — plan vs actual (pure)

   Weekly planning P4 (docs/WEEKLY_PLANNING_AUDIT.md, section 12). Once a
   planned week is over, what was prescribed against what was done. It
   makes no new measurements: it joins what the engines already worked out
   (the athlete's sessions, each run's effort against what it usually
   costs, easy-run heart rate, key-workout execution from laps) with the
   plan as it was approved.

   prescribedDays(cycle)       the plan the week was judged against: the
                               published day where a client's draft went
                               out, else the approved (chatbot) day, else
                               the plan as it stood when the brief was
                               copied
   planOutcome({ planDays, sessions, effortRows, effRuns, execution,
                 doses, skipped, checkins, from, to, today, accepted, kept })
     -> { version, from, to, through, asOf, days: [...], week: {...}, lines }
     per day: planned { kind, miles, title }, actual { miles, runs, effort,
     expected, hrResidual }, status completed (80%+ of the miles) / modified
     (short, or easy where a workout was planned) / missed / extra / rest /
     upcoming, execution (on-target reps) where laps exist, line (one plain
     sentence for key days)
   outcomeLines(outcome)       three lines for the next week's brief
   withOutcome(cycle, outcome) the cycle with it filled in
   Unit-tested in tests/planOutcome.test.mjs.
========================================== */

import { readLine } from "./planPrompt.js";

export const OUTCOME_VERSION = "0.1.0";
const MILE = 1609.344;
const r1 = x => Math.round(x * 10) / 10;
const KEY = ["quality", "long", "race"];
const KIND_OF = { workout: "quality", tempo: "quality", long: "long", race: "race", easy: "easy", recovery: "easy", rest: "rest", cross: "rest", strength: "rest" };
const KIND_WORDS = { quality: "workout", long: "long run", race: "race", easy: "easy run", rest: "rest" };
const short = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
const shortDate = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const addDays = (date, n) => {
    const [y, m, d] = date.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const dayList = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

/** A day line ("DATE | TYPE | MILES | ...") -> { date, kind, miles, title, sets }. */
function fromLine(line) {
    const read = readLine(line);
    if (!read || read.problem) return null;
    const kind = KIND_OF[read.rx.type] || "easy";
    return { date: read.date, kind, miles: kind === "rest" ? 0 : Number(read.rx.miles) || 0, title: read.rx.session || KIND_WORDS[kind], sets: read.rx.workout?.sets || [] };
}

/**
 * The plan a cycle's week is judged against, one day per date (dates with
 * no line are left out). Published > approved > as it stood when copied.
 */
export function prescribedDays(cycle) {
    const byDate = new Map();
    for (const l of cycle?.context?.plan?.lines || []) { const d = fromLine(l); if (d) byDate.set(d.date, d); }
    const approved = cycle?.status === "approved" ? cycle.approved : null;
    for (const d of approved?.days || []) { const x = fromLine(d.line); if (x) byDate.set(x.date, x); }
    for (const d of approved?.published?.days || []) { const x = d.line ? fromLine(d.line) : null; if (x) byDate.set(x.date, x); }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const isPain = c => Boolean(c && (c.pain === true || (typeof c.pain === "string" && c.pain.trim())));

/**
 * planDays: [{ date, kind, miles, title, sets? }]; sessions: the athlete's
 * runs ({ id, date, distance (m), movingSec, rpe }); effortRows /
 * effRuns: the engines' rows by session id; execution: [{ date, work,
 * onTarget, fast, slow }]; doses: [{ id, intensity }]; skipped: dates a
 * client logged as skipped; checkins: { date: { pain, sick } };
 * accepted / kept: dates taken from the chatbot / kept as they were.
 */
export function planOutcome({
    planDays = [], sessions = [], effortRows = [], effRuns = [], execution = [], doses = [], skipped = [],
    checkins = {}, from, to, today, accepted = [], kept = []
}) {
    const through = to < today ? to : addDays(today, -1);
    const plan = new Map(planDays.map(d => [d.date, d]));
    const effortById = new Map(effortRows.map(r => [r.id, r]));
    const hrById = new Map(effRuns.map(r => [r.id, r]));
    const doseById = new Map(doses.map(d => [d.id, d]));
    const execByDate = new Map(execution.map(e => [e.date, e]));
    const skip = new Set(skipped);

    const days = dayList(from, to).map(date => {
        const p = plan.get(date) || { date, kind: "rest", miles: 0, title: "" };
        const runs = sessions.filter(s => s.date === date);
        const miles = r1(runs.reduce((t, s) => t + (Number(s.distance) || 0), 0) / MILE);
        const efforts = runs.map(s => effortById.get(s.id)).filter(Boolean);
        const effort = efforts.length ? efforts.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : null;
        const hr = runs.map(s => hrById.get(s.id)).filter(Boolean);
        const main = runs.reduce((a, b) => ((Number(b.distance) || 0) > (Number(a?.distance) || 0) ? b : a), null);
        const intensity = main ? doseById.get(main.id)?.intensity ?? null : null;
        const ex = execByDate.get(date) || null;
        const key = KEY.includes(p.kind);
        let status, why = "";
        if (date > through) status = "upcoming";
        else if (p.miles > 0) {
            const share = miles / p.miles;
            if (!runs.length) { status = "missed"; why = skip.has(date) ? "logged as skipped" : "nothing run"; }
            else if (share >= 0.8) {
                // A workout run easy (by pace, else by how hard it felt) is a different session.
                const easyInstead = p.kind === "quality" && ((intensity != null && intensity < 0.80) || (intensity == null && effort && effort.rpe <= 3));
                status = easyInstead ? "modified" : "completed";
                if (easyInstead) why = "ran easy instead of the workout";
            } else { status = "modified"; why = `${miles} of ${p.miles} mi`; }
        } else status = runs.length ? "extra" : "rest";

        const actual = runs.length ? {
            miles, runs: runs.length,
            effort: effort ? effort.rpe : null, expected: effort ? effort.expected : null, residual: effort ? effort.residual : null,
            hrResidual: hr.length ? r1(hr.reduce((t, r) => t + r.residual, 0) / hr.length) : null
        } : null;
        const day = {
            date, planned: { kind: p.kind, miles: p.miles, title: p.title }, actual, status, why, key,
            ...(ex ? { execution: { work: ex.work, onTarget: ex.onTarget, fast: ex.fast, slow: ex.slow } } : {}),
            ...(accepted.includes(date) ? { from: "answer" } : kept.includes(date) ? { from: "kept" } : {})
        };
        day.line = key && status !== "upcoming" ? keyLine(day) : "";
        return day;
    });

    const past = days.filter(d => d.status !== "upcoming");
    const runDays = past.filter(d => d.planned.miles > 0);
    const count = s => runDays.filter(d => d.status === s).length;
    const rated = past.filter(d => d.actual?.residual != null);
    const flags = dayList(from, through).flatMap(date => {
        const c = checkins[date];
        return [...(isPain(c) ? [{ date, kind: "pain" }] : []), ...(c?.sick ? [{ date, kind: "sick" }] : [])];
    });
    const followed = list => ({ n: list.length, done: list.filter(d => d.status === "completed").length });
    const week = {
        plannedMiles: r1(days.reduce((t, d) => t + d.planned.miles, 0)),
        plannedToDate: r1(past.reduce((t, d) => t + d.planned.miles, 0)),
        doneMiles: r1(past.reduce((t, d) => t + (d.actual?.miles || 0), 0)),
        runDays: runDays.length, completed: count("completed"), modified: count("modified"), missed: count("missed"),
        extra: past.filter(d => d.status === "extra").length,
        keyPlanned: runDays.filter(d => d.key).length, keyDone: runDays.filter(d => d.key && d.status === "completed").length,
        adherence: runDays.length ? Math.round((count("completed") / runDays.length) * 100) : null,
        effort: rated.length ? { n: rated.length, mean: r1(rated.reduce((t, d) => t + d.actual.residual, 0) / rated.length) } : null,
        flags,
        answer: followed(past.filter(d => d.from === "answer" && d.planned.miles > 0)),
        kept: followed(past.filter(d => d.from === "kept" && d.planned.miles > 0))
    };
    const out = { version: OUTCOME_VERSION, from, to, through, asOf: today, done: through >= to, days, week };
    out.lines = outcomeLines(out);
    return out;
}

/** "Thu workout: prescribed 6 × 1 mi @ 6:45–6:55 → 8 of 8 mi, 5 of 6 reps on target, effort 7 (usual 6)" */
function keyLine(d) {
    const what = d.planned.title || KIND_WORDS[d.planned.kind];
    const head = `${short(d.date)} ${KIND_WORDS[d.planned.kind]}: prescribed ${what}`;
    if (!d.actual) return `${head} → not run${d.why === "logged as skipped" ? " (skipped)" : ""}`;
    const bits = [`${d.actual.miles} of ${d.planned.miles} mi`];
    if (d.why && d.status === "modified" && !/^[\d.]+ of /.test(d.why)) bits.push(d.why);
    if (d.execution?.work) bits.push(`${d.execution.onTarget} of ${d.execution.work} reps on target${d.execution.fast ? `, ${d.execution.fast} fast` : ""}${d.execution.slow ? `, ${d.execution.slow} slow` : ""}`);
    if (d.actual.effort != null) bits.push(`effort ${d.actual.effort} (usual ${d.actual.expected})`);
    return `${head} → ${bits.join(", ")}`;
}

/** Three lines for the next week's brief (what was planned vs done, what changed, how it felt). */
export function outcomeLines(o) {
    const w = o.week;
    const lines = [];
    const when = `${shortDate(o.from)} – ${shortDate(o.to)}`;
    const head = w.runDays
        ? `Last planned week (${when}): ${w.doneMiles} of ${w.plannedToDate} planned miles; ${w.completed} of ${w.runDays} run days as planned${w.modified ? `, ${w.modified} changed` : ""}${w.missed ? `, ${w.missed} missed` : ""}${w.keyPlanned ? `; key sessions ${w.keyDone} of ${w.keyPlanned}` : ""}${o.done ? "" : " (so far)"}.`
        : `Last planned week (${when}): ${w.doneMiles} mi run, no runs were planned.`;
    lines.push(head);
    const changed = o.days.filter(d => d.status === "modified" || d.status === "missed")
        .map(d => `${short(d.date)} ${KIND_WORDS[d.planned.kind]} ${d.status === "missed" ? `missed${d.why === "logged as skipped" ? " (skipped)" : ""}` : `changed (${d.why})`}`);
    if (changed.length) lines.push(`Changed or missed: ${changed.slice(0, 4).join("; ")}${changed.length > 4 ? `; ${changed.length - 4} more` : ""}.`);
    else if (w.runDays) lines.push("Every planned run was done as written.");
    const third = [];
    if (w.effort) third.push(`${w.effort.n} rated ${w.effort.n === 1 ? "run" : "runs"} felt ${Math.abs(w.effort.mean) < 0.5 ? "about as hard as usual" : `${Math.abs(w.effort.mean)} ${w.effort.mean > 0 ? "harder" : "easier"} than usual on average`}`);
    if (w.answer.n) third.push(`days taken from the chatbot's answer: ${w.answer.done} of ${w.answer.n} done as planned`);
    if (w.flags.length) third.push(`${w.flags.map(f => `${f.kind} reported ${shortDate(f.date)}`).join(", ")}`);
    if (third.length) lines.push(`${third.join("; ").replace(/^./, c => c.toUpperCase())}.`);
    return lines.slice(0, 3);
}

export function withOutcome(cycle, outcome) {
    return { ...cycle, outcome };
}
