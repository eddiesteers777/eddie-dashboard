/* ==========================================
   Southbound — the coaching feedback loop (pure)

   Client trains -> logs -> weekly check-in -> coach reviews -> adjusts
   the plan -> publishes -> client sees the new week.

   Here:
     - weekSnapshot(): the week a check-in is about, worked out from the
       unified week (js/weekModel.js) and their workout logs, saved on
       the check-in so the coach never has to rebuild it
     - the check-in's wellbeing answers (energy / recovery / motivation
       1-5, pain, what went well, what to change) and the flags a coach
       should see first ("pain", "low recovery 2/5")
     - the reasons a client can give when asking for a change
     - attentionQueue(): every client's attention items as one list for
       the coach dashboard, most urgent first
   No DOM or storage. Unit-tested in tests/feedbackModel.test.mjs.
========================================== */

export const WELLBEING = [
    { key: "energy", label: "Energy", low: "Low energy" },
    { key: "recovery", label: "Recovery", low: "Low recovery" },
    { key: "motivation", label: "Motivation", low: "Low motivation" }
];

export const CHANGE_REASONS = [
    { value: "work", label: "Work or life conflict" },
    { value: "fatigue", label: "Feeling run down" },
    { value: "travel", label: "Travel" },
    { value: "pain", label: "Pain or discomfort" },
    { value: "event", label: "Race or event" },
    { value: "other", label: "Something else" }
];

export const reasonLabel = value => CHANGE_REASONS.find(r => r.value === value)?.label || "Something else";

const round1 = n => Math.round((Number(n) || 0) * 10) / 10;
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const score = v => { const n = Math.round(Number(v)); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };

// ---------- The week a check-in is about ----------

/**
 * week: buildWeek() output; results: workoutResults for that client.
 * A flat map of numbers / short strings (the rules check its size).
 */
export function weekSnapshot(week, results = []) {
    const s = week?.summary || {};
    const items = (week?.days || []).flatMap(d => d.items);
    const inWeek = (results || []).filter(r => r.date >= week?.monday && r.date <= week?.sunday);
    // A logged result decides its coach-plan day, even if this device
    // never saw the done mark (logged on another phone).
    const logged = new Map(inWeek.map(r => [`${r.planId}|${r.date}|${r.kind === "strength" ? "strength" : "run"}`, r]));
    const stateOf = i => {
        const r = i.coachPlanId ? logged.get(`${i.coachPlanId}|${i.source?.date}|${i.source?.strength || i.kind === "strength" ? "strength" : "run"}`) : null;
        if (r) return r.status === "completed" ? "done" : "skipped";
        return i.done ? "done" : i.state;
    };
    const workouts = items.filter(i => i.kind !== "session" && i.source?.type !== "log");
    const runs = workouts.filter(i => i.kind === "run");
    const strength = workouts.filter(i => i.kind === "strength");
    const long = runs.find(i => i.title === "Long run");
    const rpes = inWeek.map(r => Number(r.rpe)).filter(n => n >= 1 && n <= 10);
    return {
        planned: workouts.length,
        done: workouts.filter(i => stateOf(i) === "done").length,
        skipped: workouts.filter(i => stateOf(i) === "skipped").length,
        missed: workouts.filter(i => stateOf(i) === "missed").length,
        miles: round1(s.miles),
        milesDone: round1(runs.filter(i => stateOf(i) === "done").reduce((sum, i) => sum + (Number(i.miles) || 0), 0)),
        loggedMiles: round1(s.loggedMiles),
        strengthPlanned: strength.length,
        strengthDone: strength.filter(i => stateOf(i) === "done").length,
        longRun: long ? stateOf(long) : "",
        avgRpe: rpes.length ? round1(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null,
        painDays: new Set(inWeek.filter(r => r.pain).map(r => r.date)).size,
        sessions: s.sessions || 0
    };
}

// "5 of 6 workouts", "28 / 32 mi", ... for the client's card and the coach's review.
export function snapshotLines(snap) {
    if (!snap) return [];
    const lines = [];
    if (snap.planned) lines.push(`${snap.done} of ${snap.planned} workouts done`);
    if (snap.miles) lines.push(`${snap.milesDone} / ${snap.miles} mi`);
    else if (snap.loggedMiles) lines.push(`${snap.loggedMiles} mi logged`);
    if (snap.strengthPlanned) lines.push(`Strength ${snap.strengthDone} of ${snap.strengthPlanned}`);
    if (snap.longRun) lines.push(`Long run ${snap.longRun === "done" ? "done" : snap.longRun === "skipped" ? "skipped" : snap.longRun === "missed" ? "missed" : "still to come"}`);
    if (snap.skipped) lines.push(`${snap.skipped} skipped`);
    if (snap.avgRpe) lines.push(`Average effort ${snap.avgRpe}/10`);
    if (snap.painDays) lines.push(`Pain flagged on ${snap.painDays} day${snap.painDays === 1 ? "" : "s"}`);
    if (snap.sessions) lines.push(`${snap.sessions} session${snap.sessions === 1 ? "" : "s"} with the coach`);
    return lines;
}

// ---------- The check-in's answers ----------

export function cleanCheckinAnswers(input = {}) {
    const pain = Boolean(input.pain);
    return {
        energy: score(input.energy),
        recovery: score(input.recovery),
        motivation: score(input.motivation),
        pain,
        painNote: pain ? str(input.painNote, 300) : "",
        wentWell: str(input.wentWell, 1000),
        change: str(input.change, 1000),
        notes: str(input.notes, 2000)
    };
}

// What the coach should notice first: ["Pain: left knee", "Low recovery (2/5)", "Wants a change"].
export function checkinFlags(c) {
    if (!c) return [];
    const flags = [];
    if (c.pain) flags.push(c.painNote ? `Pain: ${c.painNote}` : "Pain or discomfort");
    for (const w of WELLBEING) {
        if (Number(c[w.key]) && Number(c[w.key]) <= 2) flags.push(`${w.low} (${c[w.key]}/5)`);
    }
    if (c.change) flags.push("Wants a change");
    return flags;
}

// ---------- The coach's queue ----------

// Most urgent first; anything unknown sorts last.
export const ATTENTION_ORDER = [
    "pain", "change", "checkin", "missed", "skipped", "booking", "plan-unseen",
    "race", "plan", "quiet", "no-checkin", "sessions", "intake"
];

/**
 * clients: [{ uid, name, attention: [{ kind, text, tab }] }]
 * -> [{ uid, name, kind, text, tab, href }] across everyone, most urgent
 * first, one client's items kept together in their own order.
 */
export function attentionQueue(clients) {
    const rank = kind => { const i = ATTENTION_ORDER.indexOf(kind); return i < 0 ? ATTENTION_ORDER.length : i; };
    return (clients || [])
        .filter(c => c.attention?.length)
        .map(c => ({ c, top: Math.min(...c.attention.map(a => rank(a.kind))) }))
        .sort((a, b) => a.top - b.top || String(a.c.name).localeCompare(String(b.c.name)))
        .flatMap(({ c }) => [...c.attention]
            .sort((a, b) => rank(a.kind) - rank(b.kind))
            .map(a => ({ uid: c.uid, name: c.name, ...a, href: `client.html?uid=${encodeURIComponent(c.uid)}${a.tab ? `&tab=${a.tab}` : ""}` })));
}
