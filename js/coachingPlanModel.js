/* ==========================================
   Southbound — Coaching plan model (pure)

   The coach owns the prescription; the client owns the execution.
   A published coaching plan version stores ONLY the prescription
   (dates, workout types, miles, session text). What the client did
   ("completed", actual pace, notes...) lives in the client's local
   copy and is carried from version to version by date.

   The plan itself keeps the same shape the Running calendar already
   reads (a generatedPlan: { weeks: [{ week, phase, startDate,
   plannedMiles, days: [{ date, day, type, miles, session }],
   supplemental: [...] }] }), so every existing client screen works on
   a coach plan unchanged.

   No DOM, storage or Firebase here. Unit-tested in
   tests/coachingPlanModel.test.mjs.
========================================== */

// Things the athlete records on a day. Never part of what the coach
// publishes; always kept from the client's own copy.
export const RUNTIME_KEYS = [
    "completed", "completedAt", "actual", "actualDistance", "actualDuration",
    "actualPace", "actualTime", "notes", "source", "corosActivityId",
    "skipped", "resultId", "rpe", "pain"
];

export const DAY_TYPES = ["rest", "easy", "long", "workout", "race", "cross", "strength"];
const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TYPE_LABELS = { rest: "Rest", easy: "Easy", long: "Long run", workout: "Workout", race: "Race", cross: "Cross-training", strength: "Strength", tempo: "Tempo", recovery: "Recovery" };

const clone = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round1 = n => Math.round(num(n) * 10) / 10;

export function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseIso(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
    const date = parseIso(iso);
    date.setDate(date.getDate() + n);
    return isoDate(date);
}

// Monday on or before a date.
export function mondayOf(iso) {
    const date = parseIso(iso);
    const offset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - offset);
    return isoDate(date);
}

// "2026-09-29" -> "Tue, Sep 29"
export function shortDay(iso) {
    return parseIso(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function typeLabel(type) {
    return TYPE_LABELS[type] || (type ? type[0].toUpperCase() + type.slice(1) : "Workout");
}

// One day, the way a person reads it: "6 mi Workout (3 x 1 mi @ tempo)".
export function dayText(day) {
    if (!day || !day.type || day.type === "rest") return "Rest";
    const miles = num(day.miles) ? `${round1(day.miles)} mi ` : "";
    const session = String(day.session || "").trim();
    const showSession = session && session.toLowerCase() !== String(day.type).toLowerCase();
    return `${miles}${typeLabel(day.type)}${showSession ? ` (${session})` : ""}`;
}

// ---------- Prescription only ----------

function stripEntry(entry) {
    if (!entry || typeof entry !== "object") return entry;
    const out = {};
    for (const [key, value] of Object.entries(entry)) {
        if (!RUNTIME_KEYS.includes(key)) out[key] = clone(value);
    }
    return out;
}

// The plan as a coach prescribes it: no completion or results.
export function stripRuntime(plan) {
    if (!plan) return plan;
    const out = clone(plan);
    out.weeks = (out.weeks || []).map(week => ({
        ...week,
        days: (week.days || []).map(stripEntry),
        supplemental: (week.supplemental || []).map(stripEntry)
    }));
    return out;
}

// Keeps every week's planned mileage honest after edits.
export function recalcPlannedMiles(plan) {
    for (const week of plan?.weeks || []) {
        week.plannedMiles = round1((week.days || []).reduce((sum, day) => sum + (day.type === "rest" ? 0 : num(day.miles)), 0));
    }
    return plan;
}

export function planDateRange(plan) {
    const dates = (plan?.weeks || []).flatMap(week => (week.days || []).map(day => day.date)).filter(Boolean).sort();
    return dates.length ? { startDate: dates[0], endDate: dates[dates.length - 1] } : { startDate: "", endDate: "" };
}

// ---------- Blank plan ----------

export function blankPlan(startDate, weekCount) {
    const monday = mondayOf(startDate);
    const weeks = [];
    for (let w = 0; w < Math.max(1, Math.min(52, weekCount)); w++) {
        const weekStart = addDays(monday, w * 7);
        weeks.push({
            week: w + 1,
            phase: "",
            startDate: weekStart,
            plannedMiles: 0,
            days: DAY_CODES.map((code, i) => ({ date: addDays(weekStart, i), day: code, type: "rest", miles: 0, session: "" })),
            supplemental: []
        });
    }
    const plan = { weeks, trainingStartDate: weeks[0].startDate };
    return plan;
}

// Adds whole weeks to the end (a plan that needs to run longer).
export function addWeeks(plan, count = 1) {
    const out = clone(plan) || { weeks: [] };
    for (let i = 0; i < count; i++) {
        const last = out.weeks[out.weeks.length - 1];
        const weekStart = last ? addDays(last.startDate || mondayOf(last.days?.[0]?.date), 7) : mondayOf(isoDate(new Date()));
        out.weeks.push({
            week: (last?.week || out.weeks.length) + 1,
            phase: last?.phase || "",
            startDate: weekStart,
            plannedMiles: 0,
            days: DAY_CODES.map((code, j) => ({ date: addDays(weekStart, j), day: code, type: "rest", miles: 0, session: "" })),
            supplemental: []
        });
    }
    return out;
}

// ---------- What changed between two versions ----------

function supplementalDate(week, entry) {
    const offset = DAY_CODES.indexOf(entry?.day);
    if (!week?.startDate || offset < 0) return null;
    return addDays(week.startDate, offset);
}

// date -> readable text for everything prescribed that day.
function dayTextMap(plan) {
    const map = new Map();
    for (const week of plan?.weeks || []) {
        for (const day of week.days || []) {
            if (day?.date) map.set(day.date, { main: dayText(day), extras: [], day });
        }
        for (const entry of week.supplemental || []) {
            const date = supplementalDate(week, entry);
            if (!date) continue;
            if (!map.has(date)) map.set(date, { main: "Rest", extras: [], day: null });
            map.get(date).extras.push(typeLabel(entry.type) + (entry.session ? ` (${entry.session})` : ""));
        }
    }
    const out = new Map();
    for (const [date, v] of map) out.set(date, [v.main, ...v.extras].filter((t, i) => i === 0 || t).join(" + "));
    return out;
}

// Every date whose prescription differs: { date, before, after, kind }.
// kind: "changed" | "added" (date only in the new plan) | "removed".
// A workout that simply moved to another day in the same week is
// reported once as kind "moved" with { from, to, what }.
export function diffPlans(previousPlan, nextPlan) {
    const before = dayTextMap(previousPlan);
    const after = dayTextMap(nextPlan);
    const dates = [...new Set([...before.keys(), ...after.keys()])].sort();
    let changes = [];
    for (const date of dates) {
        const b = before.get(date);
        const a = after.get(date);
        if (b === a) continue;
        changes.push({
            date,
            kind: b === undefined ? "added" : a === undefined ? "removed" : "changed",
            before: b ?? "",
            after: a ?? ""
        });
    }

    // Pair "X -> Rest" with "Rest -> X" in the same week: that's a move.
    const moved = [];
    const used = new Set();
    for (const out of changes) {
        if (used.has(out) || out.kind !== "changed" || out.after !== "Rest" || out.before === "Rest") continue;
        const into = changes.find(c => !used.has(c) && c !== out && c.kind === "changed"
            && c.before === "Rest" && c.after === out.before && mondayOf(c.date) === mondayOf(out.date));
        if (into) {
            used.add(out); used.add(into);
            moved.push({ kind: "moved", date: into.date, from: out.date, to: into.date, what: out.before });
        }
    }
    changes = changes.filter(c => !used.has(c)).concat(moved).sort((x, y) => x.date.localeCompare(y.date));
    return changes;
}

export function changeText(change) {
    if (change.kind === "moved") return `${change.what} moved from ${shortDay(change.from)} to ${shortDay(change.to)}`;
    if (change.kind === "added") return `${shortDay(change.date)}: ${change.after} (new)`;
    if (change.kind === "removed") return `${shortDay(change.date)}: ${change.before} removed`;
    return `${shortDay(change.date)}: ${change.before} → ${change.after}`;
}

// Short list for a publish summary / email / client notice.
export function changeLines(changes, { limit = 12 } = {}) {
    const lines = (changes || []).slice(0, limit).map(changeText);
    if ((changes || []).length > limit) lines.push(`…and ${changes.length - limit} more`);
    return lines;
}

// ---------- The client's copy ----------

// A new prescription with the athlete's own records carried over from
// their current copy, matched by date (a workout they did on a date
// stays done even if the coach later tweaks that day).
export function mergeRuntimeByDate(localPlan, prescription) {
    const result = clone(prescription);
    if (!localPlan || !result) return result;
    const localDays = new Map();
    const localExtras = new Map();
    for (const week of localPlan.weeks || []) {
        for (const day of week.days || []) if (day?.date) localDays.set(day.date, day);
        for (const entry of week.supplemental || []) {
            const date = supplementalDate(week, entry);
            if (date) localExtras.set(`${date}|${entry.type}`, entry);
        }
    }
    const copyRuntime = (from, to) => {
        if (!from || !to) return;
        for (const key of RUNTIME_KEYS) if (Object.prototype.hasOwnProperty.call(from, key)) to[key] = clone(from[key]);
    };
    for (const week of result.weeks || []) {
        for (const day of week.days || []) copyRuntime(localDays.get(day.date), day);
        for (const entry of week.supplemental || []) copyRuntime(localExtras.get(`${supplementalDate(week, entry)}|${entry.type}`), entry);
    }
    return result;
}

// Where a plan stands for a person on a given date.
export function planWeekFor(plan, today) {
    const weeks = plan?.weeks || [];
    const index = weeks.findIndex(week => (week.days || []).some(day => day.date === today));
    if (index >= 0) return { index, week: weeks[index], state: "current" };
    const { startDate, endDate } = planDateRange(plan);
    if (startDate && today < startDate) return { index: 0, week: weeks[0], state: "upcoming" };
    if (endDate && today > endDate) return { index: weeks.length - 1, week: weeks[weeks.length - 1], state: "finished" };
    return { index: 0, week: weeks[0] || null, state: "unknown" };
}
