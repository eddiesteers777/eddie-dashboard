/* ==========================================
   Southbound — the Weekly Review as a story (pure)

   docs/ATHLETE_MODEL_AUDIT.md section 9 (Phase D): what happened this
   week, what it means, what to do next, readable in one scroll.
     weekGlance     planned vs done by day (Mon–Sun), key workouts marked
     weekSentence   the week in one sentence, ending in the decision
     modelReading   one reading: Adapting / Steady / Accumulating fatigue /
                    Unusual response / Not enough evidence
     responseWeek   this week's effort answers against expected, the runs
                    that stood out, key-workout execution
     nextWeek       the plan's next 7 days with the decision's changes
                    inline, and the one thing to watch
   Inputs come from what's already worked out elsewhere: the plan's days
   (js/weeklyDecisionData.js planDaysFrom), the run list (the ledger),
   the training response (js/trainingResponse.js) and the weekly
   decision (js/weeklyDecision.js). Nothing here is a model of its own.
   Unit-tested in tests/weekStory.test.mjs.
========================================== */

const MILE = 1609.344;
const KEY_KINDS = ["quality", "long", "race"];
const r1 = n => Math.round(n * 10) / 10;
const KIND_WORDS = { quality: "Workout", long: "Long run", race: "Race", easy: "Easy", recovery: "Recovery", rest: "Rest" };

/**
 * planDays: the week's plan days [{ date, dayName, session, miles, kind }]; runs: sessions [{ date, distance }].
 * -> { days: [{ date, dayName, planned, done, key, state }], plannedMiles, plannedToDate, doneMiles, runs, keyPlanned, keyDone, keyToDate }
 */
export function weekGlance({ planDays = [], runs = [], today }) {
    const days = planDays.map(p => {
        const mine = runs.filter(r => r.date === p.date);
        const miles = r1(mine.reduce((t, r) => t + (Number(r.distance) || 0), 0) / MILE);
        const key = KEY_KINDS.includes(p.kind);
        const planned = Number(p.miles) || 0;
        const state = p.date > today ? "upcoming"
            : planned > 0 ? (miles >= planned * 0.8 ? "done" : miles > 0 ? "partial" : p.date === today ? "today" : "missed")
            : miles > 0 ? "extra" : "rest";
        return { date: p.date, dayName: p.dayName, planned, title: p.session || KIND_WORDS[p.kind] || "", kind: p.kind, done: miles, runs: mine.length, key, state };
    });
    const past = days.filter(d => d.date <= today);
    const keyPast = past.filter(d => d.key && d.state !== "today");
    return {
        days,
        plannedMiles: r1(days.reduce((t, d) => t + d.planned, 0)),
        plannedToDate: r1(past.reduce((t, d) => t + d.planned, 0)),
        doneMiles: r1(days.reduce((t, d) => t + d.done, 0)),
        runs: days.reduce((t, d) => t + d.runs, 0),
        keyPlanned: days.filter(d => d.key).length,
        keyToDate: keyPast.length,
        keyDone: keyPast.filter(d => d.state === "done").length
    };
}

const RESPONSE_PHRASE = {
    adaptation: "easy runs costing less heart rate than usual",
    steady: "runs going as usual",
    fatigue: "runs costing more heart rate and feeling harder",
    hrOnly: "easy runs costing a little more heart rate than usual",
    deep: "heart rate down but runs feeling harder",
    costlier: "runs feeling harder than usual",
    easier: "runs feeling easier than usual"
};
const RECOVERY_KEYS = ["autonomic", "sleep", "subjective"];

/** The worst recovery domain this week -> "recovery normal" / "a little off" / "off" (null without any). */
export function recoveryWord(domains = []) {
    const rec = domains.filter(d => RECOVERY_KEYS.includes(d.key));
    if (!rec.length) return null;
    const worst = Math.max(...rec.map(d => d.severity));
    return worst === 0 ? "recovery normal" : worst === 1 ? "recovery a little off" : "recovery off";
}

const keyWords = (done, of) => (!of ? "" : done === of ? (of === 1 ? "the key workout done" : of === 2 ? "both key workouts done" : `all ${of} key workouts done`) : `${done} of ${of} key workouts done`);

/** "Week 12: 41 of 52 planned miles, both key workouts done, …; recovery normal → Proceed." */
export function weekSentence({ weekNumber, glance, reading, decision }) {
    const g = glance;
    const parts = [];
    if (g) {
        const miles = g.doneMiles;
        parts.push(g.plannedMiles ? `${miles} of ${g.plannedMiles} planned miles${g.plannedToDate < g.plannedMiles ? ` (${g.plannedToDate} planned through today)` : ""}` : `${miles} miles`);
        const k = keyWords(g.keyDone, g.keyToDate);
        if (k) parts.push(k);
    }
    const resp = reading && RESPONSE_PHRASE[reading.key];
    if (resp) parts.push(resp);
    const rec = recoveryWord(decision?.domains);
    const head = weekNumber ? `Week ${weekNumber}: ` : "This week: ";
    const body = parts.join(", ") || "nothing logged yet";
    return `${head}${body}${rec ? `; ${rec}` : ""}${decision?.label ? ` → ${decision.label}` : ""}.`;
}

export const READING_WORDS = Object.freeze({
    adapting: { title: "Adapting", text: "The same running is costing you less, and nothing else is off. This is what the training is for." },
    steady: { title: "Steady", text: "Training, how it lands and how you recover are all where they usually are." },
    fatigue: { title: "Accumulating fatigue", text: "Several signals agree that the training is adding up faster than you're recovering. The decision below eases it." },
    unusual: { title: "Unusual response", text: "How runs are landing has changed (heart rate or effort), without the rest agreeing yet. Worth watching for a few days." },
    unknown: { title: "Not enough evidence", text: "" }
});

/** One reading for the week. reading: trainingResponse's; decision: the weekly decision. */
export function modelReading({ reading, decision }) {
    const level = decision?.level;
    const out = key => ({ key, ...READING_WORDS[key] });
    if (level === "ease" || level === "recover") return out("fatigue");
    if (level === "checkin") return { key: "unusual", title: "Check in first", text: `Something needs a look before reading the week: ${decision.reason || "a pain or sickness flag"}.` };
    if (reading && ["fatigue", "deep", "hrOnly", "costlier"].includes(reading.key)) return out("unusual");
    if (reading?.key === "adaptation") return out("adapting");
    if ((!reading || reading.key === "partial") && !(decision?.domains || []).length) {
        return { key: "unknown", title: READING_WORDS.unknown.title, text: reading?.text || "Needs a few weeks of runs with heart rate, effort answers and nights with HRV or sleep." };
    }
    return out("steady");
}

const CLASS_WORDS = { easy: "easy run", steady: "steady run", long: "long run", tempo: "tempo", threshold: "threshold run", intervals: "interval session", race: "race" };

/**
 * This week's responses. effortRows: effortResponse rows; execution: executionSummary rows; runs: this week's sessions.
 * -> { rated, of, mean, stoodOut: [{ date, text }], execution: [{ date, title, onTarget, work }] }
 */
export function responseWeek({ effortRows = [], execution = [], runs = [], from, to }) {
    const mine = effortRows.filter(r => r.date >= from && r.date <= to);
    const of = runs.filter(r => r.date >= from && r.date <= to && !String(r.id || "").startsWith("l:")).length;
    const mean = mine.length ? r1(mine.reduce((t, r) => t + r.residual, 0) / mine.length) : null;
    const stoodOut = mine.filter(r => Math.abs(r.residual) >= 1.5).map(r => ({
        date: r.date, residual: r.residual,
        text: `${CLASS_WORDS[r.cls] || "run"} felt ${Math.abs(r.residual)} ${r.residual > 0 ? "harder" : "easier"} than it usually costs you (${r.rpe}, expected ${r.expected})`
    }));
    return { rated: mine.length, of: Math.max(of, mine.length), mean, stoodOut, execution: execution.filter(e => e.date >= from && e.date <= to) };
}

/**
 * The next 7 days with the decision's changes inline, and the one thing to watch.
 * planDays: tomorrow on; decision: weekDecision (changes [{ date, text }], domains).
 */
export function nextWeek({ planDays = [], decision }) {
    const changes = new Map((decision?.changes || []).map(c => [c.date, c.text]));
    const days = planDays.map(p => ({ date: p.date, dayName: p.dayName, miles: Number(p.miles) || 0, title: p.session || KIND_WORDS[p.kind] || "", key: KEY_KINDS.includes(p.kind), change: changes.get(p.date) || null }));
    const worst = (decision?.domains || []).filter(d => d.severity > 0).sort((a, b) => b.severity - a.severity)[0];
    const watch = decision?.level === "checkin" ? `Before anything hard: ${decision.reason}.`
        : worst ? `Watch ${worst.label.toLowerCase()}: ${worst.text}.`
        : decision?.domains?.length ? "Nothing in particular: keep doing the morning check-in and rating your runs." : "";
    return { days, watch, miles: r1(days.reduce((t, d) => t + d.miles, 0)), changed: changes.size };
}

const back = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d - n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * Recovery as changes from usual: the last 7 nights against the 28 before (HRV, resting HR),
 * sleep against the need, and the morning check-ins. health: COROS days; checkins: readiness check-ins.
 * -> { hrv: { week, usual, n }, rhr: { week, usual, n }, sleep: { avgMin, needMin, n }, checkins }
 */
export function recoveryWeek({ health = {}, checkins = {}, today, needMin = 450 }) {
    const week = Array.from({ length: 7 }, (_, i) => back(today, i));
    const before = Array.from({ length: 28 }, (_, i) => back(today, i + 7));
    const vals = (days, f) => days.map(d => f(health[d])).filter(Number.isFinite);
    const pair = f => { const w = vals(week, f), u = vals(before, f); return { week: w.length ? r1(avg(w)) : null, usual: u.length >= 5 ? r1(avg(u)) : null, n: w.length }; };
    const sleep = vals(week, h => h?.sleep?.asleepMin);
    return {
        hrv: pair(h => h?.hrv?.avg),
        rhr: pair(h => h?.rhr),
        sleep: { avgMin: sleep.length ? Math.round(avg(sleep)) : null, needMin, n: sleep.length },
        checkins: week.filter(d => checkins[d]).length
    };
}
