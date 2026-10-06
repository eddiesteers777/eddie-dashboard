/* ==========================================
   Southbound — weekly planning on Eddie's own plan

   Weekly planning P2 (docs/WEEKLY_PLANNING_AUDIT.md). Eddie's marathon
   plan is written in js/marathonData.js and his edits live in
   "training-overrides" (the Marathon page's own edits, and where the
   weekly decision's Apply writes). This turns his plan's days into the
   coach-plan shape the chatbot round trip reads (js/planPrompt.js), and
   writes an accepted answer back the same way Apply does:

   selfWeek(from, to)        -> { plan, planDays, paces }
   applySelf(days, planDays, { from, to })
                             the accepted days into training-overrides (the
                             chatbot's own workout words as the day's text,
                             which the watch reader understands), logged in
                             "athlete-model".planning with what each day was
                             before, so Undo works after a reload too
   undoSelf(id)              puts those days back exactly
   planningLog()             the last 26 applies
   logClientPlanning(uid, e) a client's chatbot week, in the coach's own
                             "coach-athlete-model" entry for them
   No rules change: everything stays in his own synced data.
========================================== */

import { loadModelRecord, updateModelRecord } from "./athleteData.js";

const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TYPE = { quality: "workout", long: "long", easy: "easy", race: "race", rest: "rest" };
const KEEP = 26;
const clone = v => (v == null ? null : JSON.parse(JSON.stringify(v)));
const dayCount = (from, to) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 864e5) + 1;

/**
 * Eddie's plan days from `from` to `to`, in the coach-plan shape (and as
 * the decision reads them). The plan also holds the 7 days before, so the
 * safety checks can compare the new week with the one before it.
 */
export async function selfWeek(from, to) {
    const [{ planDaysFrom }, md, { addDays }] = await Promise.all([import("./weeklyDecisionData.js"), import("./marathonData.js"), import("./athleteLedger.js")]);
    const before = addDays(from, -7);
    const all = await planDaysFrom(before, 7 + dayCount(from, to));
    const shape = d => ({
        date: d.date, day: CODES[d.index], type: d.race ? "race" : TYPE[d.kind] || "easy",
        miles: Number(d.miles) || 0, session: d.session || (d.kind === "rest" ? "Rest" : "")
    });
    const planDays = all.filter(d => d.date >= from);
    const weeks = [{ days: all.filter(d => d.date < from).map(shape) }, { days: planDays.map(shape) }].filter(w => w.days.length);
    const race = planDays.find(d => d.race);
    const plan = { weeks, ...(race ? { raceDate: race.date } : {}) };
    const paces = (md.PACES || []).map(([name, range]) => `${name} ${range}`).join(" · ");
    return { plan, planDays, paces };
}

// The pace word the Marathon page and the watch reader go by.
function paceFor(type, before) {
    if (type === "workout") return before?.kind === "quality" && before.pace ? before.pace : "Threshold";
    if (type === "long") return before?.kind === "long" && before.pace ? before.pace : "Long run";
    if (type === "recovery") return "Recovery";
    if (type === "race") return "Race";
    if (type === "rest") return "Recovery";
    return before?.kind === "easy" && before.pace ? before.pace : "Easy";
}

/** What a parsed day writes into the override for that day. */
export function overrideFor({ rx, text, note }, before) {
    const type = rx.type;
    const off = ["rest", "cross", "strength"].includes(type);
    const session = type === "rest" ? "Rest"
        : type === "strength" ? "Strength"
        : type === "cross" ? rx.session || "Cross-training"
        : String(text || rx.session || "").slice(0, 300);
    return {
        session, miles: off ? 0 : Number(rx.miles) || 0,
        pace: paceFor(type, before), race: type === "race", ...(note ? { notes: String(note).slice(0, 300) } : {})
    };
}

/** -> the log entry's id. days: parseReply's days (accepted ones only). */
export async function applySelf(days, planDays, { from, to } = {}) {
    const md = await import("./marathonData.js");
    const overrides = md.loadOverrides();
    const byDate = new Map(planDays.map(d => [d.date, d]));
    const changed = [];
    for (const day of days) {
        const pd = byDate.get(day.date);
        if (!pd) continue;
        const key = md.DAYS[pd.index];
        const prev = clone(overrides[pd.week]?.[key]);
        const next = { ...(prev || {}), ...overrideFor(day, pd) };
        overrides[pd.week] = overrides[pd.week] || {};
        overrides[pd.week][key] = next;
        changed.push({ date: day.date, week: pd.week, day: key, prev, next });
    }
    if (!changed.length) return null;
    md.saveOverrides(overrides);
    const id = `p${Date.now().toString(36)}`;
    updateModelRecord(rec => {
        rec.planning = [...(rec.planning || []), { id, at: Date.now(), from, to, source: "chatbot", choice: "applied", days: changed }].slice(-KEEP);
    });
    import("./athleteSources.js").then(m => m.forgetSelfState()).catch(() => {});
    return id;
}

/** Puts the days of one apply back the way they were. */
export async function undoSelf(id) {
    const entry = planningLog().find(e => e.id === id);
    if (!entry || entry.choice !== "applied") return false;
    const md = await import("./marathonData.js");
    const overrides = md.loadOverrides();
    for (const d of entry.days) {
        overrides[d.week] = overrides[d.week] || {};
        if (d.prev) overrides[d.week][d.day] = d.prev;
        else delete overrides[d.week][d.day];
        if (!Object.keys(overrides[d.week]).length) delete overrides[d.week];
    }
    md.saveOverrides(overrides);
    updateModelRecord(rec => {
        const e = (rec.planning || []).find(x => x.id === id);
        if (e) { e.choice = "undone"; e.undoneAt = Date.now(); }
    });
    import("./athleteSources.js").then(m => m.forgetSelfState()).catch(() => {});
    return true;
}

export const planningLog = () => loadModelRecord().planning || [];

/**
 * A client's planning, logged in the coach's own "coach-athlete-model"
 * entry for them (private, cloud-synced): what went into the draft, so
 * later steps can judge the week against what was planned.
 */
export function logClientPlanning(uid, entry) {
    try {
        const all = JSON.parse(localStorage.getItem("coach-athlete-model") || "{}") || {};
        const e = { races: {}, decisions: [], snapshots: [], ...(all[uid] || {}) };
        e.planning = [...(e.planning || []), { id: `p${Date.now().toString(36)}`, at: Date.now(), source: "chatbot", choice: "draft", ...entry }].slice(-KEEP);
        all[uid] = e;
        localStorage.setItem("coach-athlete-model", JSON.stringify(all));
        import("./cloudSync.js").then(m => m.pushToCloud()).catch(() => {});
    } catch { /* the draft is in the editor either way */ }
}
