/* ==========================================
   Southbound — the coach's own marathon plan

   Eddie's own plan lives in the same store as his other race plans
   (running-programs), flagged `own: true`, so the Running calendar,
   "done" ticks, hand edits and cloud sync all work with no new key and
   no rules change. It is never a client's plan: nothing here is shared.
   The pure helpers are unit-tested in tests/ownPlan.test.mjs.
========================================== */

import { vdotFromRace } from "./vdot.js";

export const OWN_ID = "own-marathon";
const M_PER_MI = 1609.344;
const RACE_SIZES = [["5K", 5000], ["10K", 10000], ["HALF", 21097.5], ["MARATHON", 42195]];

const addDays = (date, n) => {
    const [y, m, d] = date.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const round = (x, step) => Math.round(x / step) * step;

/** The programs.js / calendar record is ours when it carries the flag. */
export const isOwnPlan = p => Boolean(p && p.own === true);

/**
 * What the COROS history says about where the runner is now.
 * sessions: [{ date, distance (meters), race?: { meters, timeSec } | null }]
 * Weekly miles = the last 28 days / 4. Longest run = last 30 days. Best race = the
 * strongest 5K to marathon in the last year (by VDOT). Nothing is made up: no runs, no numbers.
 */
export function corosPrefill(sessions = [], today) {
    const list = (sessions || []).filter(s => s && s.date && Number(s.distance) > 0);
    const from28 = addDays(today, -27), from30 = addDays(today, -29), from365 = addDays(today, -364);
    const last28 = list.filter(s => s.date >= from28 && s.date <= today);
    const miles28 = last28.reduce((t, s) => t + s.distance / M_PER_MI, 0);
    const long30 = list.filter(s => s.date >= from30 && s.date <= today).reduce((m, s) => Math.max(m, s.distance / M_PER_MI), 0);
    let best = null;
    for (const s of list) {
        if (!s.race || s.date < from365 || s.date > today) continue;
        const sec = Number(s.race.timeSec), meters = Number(s.race.meters);
        const size = RACE_SIZES.find(([, m]) => Math.abs(m - meters) / m < 0.03);
        if (!size || !(sec > 0)) continue;
        const v = vdotFromRace(size[1], sec);
        if (!best || v > best.vdot) best = { vdot: v, key: size[0], meters: size[1], seconds: Math.round(sec), date: s.date };
    }
    return {
        runs: last28.length,
        currentMiles: last28.length ? Math.round(miles28 / 4) : 0,
        longestRun: long30 ? round(long30, 0.5) : 0,
        recentRace: best ? { key: best.key, meters: best.meters, seconds: best.seconds, date: best.date } : null
    };
}

/** "From your COROS: 31 miles a week, longest run 13, 10K in 41:00." or "" when there is nothing. */
export function prefillNote(p, clock = s => String(s)) {
    if (!p || !p.runs) return "";
    const bits = [`${p.currentMiles} miles a week (last 4 weeks)`, `longest run ${p.longestRun}`];
    if (p.recentRace) bits.push(`${p.recentRace.key === "HALF" ? "half" : p.recentRace.key === "MARATHON" ? "marathon" : p.recentRace.key} in ${clock(p.recentRace.seconds)}`);
    return `From your COROS: ${bits.join(", ")}.`;
}

/** Fill only what the plan settings lack, so a saved setup is never overwritten by newer history. */
export function applyPrefill(settings, p) {
    const out = { ...settings };
    if (!p || !p.runs) return out;
    if (!(out.currentMiles > 0) && p.currentMiles > 0) out.currentMiles = p.currentMiles;
    if (!(out.longestRun > 0) && p.longestRun > 0) out.longestRun = p.longestRun;
    if (!out.recentRace && p.recentRace) out.recentRace = { meters: p.recentRace.meters, seconds: p.recentRace.seconds };
    return out;
}

/** Dates already ticked done in a generated plan. */
export function doneDates(plan) {
    return new Set((plan?.weeks || []).flatMap(w => (w.days || []).filter(d => d.completed).map(d => d.date)));
}

const weekMiles = w => Math.round((w.days || []).reduce((t, d) => t + (d.type === "race" ? 0 : Number(d.miles) || 0), 0) * 10) / 10;

/** Where "today" falls in the plan: { state: "none"|"before"|"in"|"after", index, week, total, ... }. */
export function whereInPlan(plan, today) {
    const weeks = plan?.weeks || [];
    if (!weeks.length) return { state: "none", total: 0 };
    const total = weeks.length;
    const first = weeks[0].startDate, last = weeks[total - 1];
    const lastDay = addDays(last.startDate, 6);
    const raceDay = weeks.flatMap(w => w.days || []).find(d => d.type === "race");
    if (today < first) return { state: "before", index: 0, week: weeks[0], total, startsOn: first };
    if (today > lastDay) return { state: "after", index: total - 1, week: last, total, raceDate: raceDay?.date || plan.raceDate };
    const index = weeks.findIndex(w => today >= w.startDate && today <= addDays(w.startDate, 6));
    const week = weeks[Math.max(0, index)];
    const todayDay = (week.days || []).find(d => d.date === today) || null;
    return { state: "in", index: Math.max(0, index), week, total, today: todayDay, raceDate: raceDay?.date || plan.raceDate };
}

/** One number per week for the chart: [{ miles, down, race }]. */
export function weekBars(plan) {
    return (plan?.weeks || []).map(w => ({ miles: weekMiles(w), down: Boolean(w.cutback), race: (w.days || []).some(d => d.type === "race"), phase: w.phase || "" }));
}

export { weekMiles };

/* ---------- storage (same store as race plans) ---------- */

export async function loadOwn() {
    const { loadRunningPrograms } = await import("./runningPrograms.js");
    return loadRunningPrograms().find(isOwnPlan) || null;
}

/** Make or replace Eddie's own plan. `plan` is a coach-plan-shaped generated plan. */
export async function saveOwn({ plan, name, now = Date.now() }) {
    const { loadRunningPrograms, saveRunningPrograms } = await import("./runningPrograms.js");
    const all = loadRunningPrograms();
    const existing = all.find(isOwnPlan);
    const iso = new Date(now).toISOString();
    const recovery = plan.generator?.settings?.engine === "recovery";
    const raceType = recovery ? "RECOVERY" : ["HALF", "10K", "5K"].includes(plan.generator?.settings?.raceType) ? plan.generator.settings.raceType : "MARATHON";
    const label = { MARATHON: "marathon", HALF: "half marathon", "10K": "10K", "5K": "5K", RECOVERY: "recovery" }[raceType];
    const record = {
        ...(existing || {}),
        id: existing?.id || OWN_ID,
        own: true,
        name: name || `My ${label} plan`,
        type: raceType,
        settings: { raceType, raceName: name || `My ${label} plan`, raceDate: plan.raceDate },
        status: "active",
        generatedPlan: plan,
        createdAt: existing?.createdAt || iso,
        updatedAt: iso,
        archivedAt: null,
        pausedAt: null,
        revision: (Number(existing?.revision) || 0) + (existing ? 1 : 0)
    };
    await saveRunningPrograms([record, ...all.filter(p => !isOwnPlan(p))]);
    return record;
}

export async function removeOwn() {
    const { loadRunningPrograms, saveRunningPrograms } = await import("./runningPrograms.js");
    await saveRunningPrograms(loadRunningPrograms().filter(p => !isOwnPlan(p)));
}
