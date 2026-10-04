/* ==========================================
   Southbound — the weekly decision on this device (coach's own plan)

   Gathers what js/weeklyDecision.js needs (the morning numbers, the
   training response and load from js/readinessV2Data.js, the marathon
   plan's next 7 days) and keeps its record in the private, synced
   "athlete-model" key:
     policy     the athlete's own dial-down percentages (defaults otherwise)
     snapshots  what the engine said each week, saved the first time the
                week is seen, so it can be judged on what it said then
                ({ weekOf, asOf, level, domains: { key: severity }, version }, last 104)
     decisions  each week's suggestion and the choice: applied (with what
                the plan said before, for Undo) / not this week + reason /
                undone (last 104)
   Apply writes the changed days into "training-overrides", the same
   place the Marathon page's own edits go.
========================================== */

import { weekDecision, DEFAULT_POLICY, mondayOf } from "./weeklyDecision.js";
import { athleteInputs } from "./readinessV2Data.js";
import { inputs as readinessInputs } from "./readinessData.js";
import { loadModelRecord, updateModelRecord } from "./athleteData.js";
import { kindOfDay } from "./readiness.js";

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const KEEP = 104;

/** The marathon plan's next `n` days from `from`: [{ date, week, index, dayName, session, miles, pace, kind, phase, race }]. */
export async function planDaysFrom(from, n = 7) {
    try {
        const md = await import("./marathonData.js");
        const { planDayFromMarathon } = await import("./marathonCoros.js");
        const out = [];
        for (let w = 1; w <= md.WEEKS.length; w++) {
            const days = md.getAdjustedWeekDays(w);
            for (let i = 0; i < 7; i++) {
                const d = new Date(md.weekStart(w)); d.setDate(d.getDate() + i);
                const date = iso(d);
                if (date < from || date >= addDays(from, n)) continue;
                const day = days[i];
                out.push({
                    date, week: w, index: i, dayName: md.DAYS[i],
                    session: day.session || "", miles: Number(day.miles) || 0, pace: day.pace || "",
                    kind: kindOfDay(day, planDayFromMarathon(day, md.PACES)), phase: md.WEEKS[w - 1]?.phase || "", race: Boolean(day.race)
                });
            }
        }
        return out.sort((a, b) => a.date.localeCompare(b.date));
    } catch {
        return [];
    }
}

export const loadPolicy = () => ({ ...DEFAULT_POLICY, ...(loadModelRecord().policy || {}) });
export function savePolicy(policy) { updateModelRecord(rec => { rec.policy = policy; }); }
export function resetPolicy() { updateModelRecord(rec => { delete rec.policy; }); }

export const decisionLog = () => loadModelRecord().decisions || [];
export const snapshots = () => loadModelRecord().snapshots || [];
export const decisionFor = weekOf => decisionLog().find(d => d.weekOf === weekOf) || null;

/** Everything the decision reads, as of today. */
export async function decisionInputs(today) {
    const extra = await athleteInputs(today);
    return { ...readinessInputs(), ...(extra || {}) };
}

/** This week's decision, from tomorrow's plan on. Saves the week's first snapshot. */
export async function currentDecision(today) {
    const data = await decisionInputs(today);
    const weekOf = mondayOf(today);
    const earlier = snapshots().filter(s => s.weekOf < weekOf).sort((a, b) => b.weekOf.localeCompare(a.weekOf));
    const lastWeek = earlier[0]?.weekOf === addDays(weekOf, -7) ? earlier[0].level : null;
    const decision = weekDecision(today, data, await planDaysFrom(addDays(today, 1), 7), { policy: loadPolicy(), previous: lastWeek });
    if (!snapshots().some(s => s.weekOf === weekOf) && decision.domains.length) {
        updateModelRecord(rec => {
            rec.snapshots = [...(rec.snapshots || []), {
                weekOf, asOf: today, level: decision.level, version: decision.version, savedAt: Date.now(),
                domains: Object.fromEntries(decision.domains.map(d => [d.key, d.severity]))
            }].slice(-KEEP);
        });
    }
    return { decision, data };
}

function logChoice(decision, fields) {
    updateModelRecord(rec => {
        const list = (rec.decisions || []).filter(d => d.weekOf !== decision.weekOf);
        list.push({
            weekOf: decision.weekOf, asOf: decision.asOf, level: decision.level, version: decision.version,
            summary: decision.summary, changes: decision.changes.map(c => ({ date: c.date, dayName: c.dayName, text: c.text })),
            plannedMiles: decision.plannedMiles, at: Date.now(), ...fields
        });
        rec.decisions = list.sort((a, b) => a.weekOf.localeCompare(b.weekOf)).slice(-KEEP);
    });
}

/** Writes the changes into the plan. -> undo() */
export async function applyDecision(decision) {
    const md = await import("./marathonData.js");
    const overrides = md.loadOverrides();
    const before = decision.changes.map(c => {
        const key = md.DAYS[c.index];
        const prev = overrides[c.week]?.[key];
        return { week: c.week, day: key, prev: prev ? JSON.parse(JSON.stringify(prev)) : null };
    });
    for (const c of decision.changes) {
        const key = md.DAYS[c.index];
        overrides[c.week] = overrides[c.week] || {};
        overrides[c.week][key] = { ...(overrides[c.week][key] || {}), session: c.after.session, miles: c.after.miles, pace: c.after.pace };
    }
    md.saveOverrides(overrides);
    logChoice(decision, { choice: "applied", before });
    return () => undoDecision(decision.weekOf);
}

/** Puts the plan back the way it was before Apply. */
export async function undoDecision(weekOf) {
    const entry = decisionFor(weekOf);
    if (!entry || entry.choice !== "applied") return false;
    const md = await import("./marathonData.js");
    const overrides = md.loadOverrides();
    for (const b of entry.before || []) {
        overrides[b.week] = overrides[b.week] || {};
        if (b.prev) overrides[b.week][b.day] = b.prev;
        else delete overrides[b.week][b.day];
        if (!Object.keys(overrides[b.week]).length) delete overrides[b.week];
    }
    md.saveOverrides(overrides);
    updateModelRecord(rec => {
        const e = (rec.decisions || []).find(d => d.weekOf === weekOf);
        if (e) { e.choice = "undone"; e.undoneAt = Date.now(); }
    });
    return true;
}

export function declineDecision(decision, reason) {
    logChoice(decision, { choice: "declined", reason: String(reason || "").slice(0, 200) });
}

/** Changing your mind on a declined week: forget the choice, so the card asks again. */
export function reopenDecision(weekOf) {
    updateModelRecord(rec => { rec.decisions = (rec.decisions || []).filter(d => !(d.weekOf === weekOf && d.choice !== "applied")); });
}
