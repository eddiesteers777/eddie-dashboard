/* ==========================================
   Southbound — data for the Analytics trends (js/trends.js)

   Reads what's saved (run history, health, readiness, fitness) and adds
   two things from COROS when it's connected:
     - laps for the key workouts of the last 6 weeks (queryActivityLapData),
       fetched once per run and kept in "coros-laps" (compact, the last 80 runs)
     - 8 weeks of sleep and HRV, once, so the Body charts start full
       (7-day windows, COROS's limit for HRV; "coros-health-backfill"
       remembers how far back it got)
========================================== */

import { WEEKS, weekStart, getAdjustedWeekMileage, getAdjustedWeekDays, PACES } from "./marathonData.js";
import { planDayFromMarathon } from "./marathonCoros.js";
import { kindOfDay } from "./readiness.js";
import { HISTORY_KEY, FITNESS_KEY, runsBetween, emptyHistory } from "./corosHistory.js";
import { HEALTH_KEY, healthDays, mergeHealth } from "./corosHealth.js";
import { READINESS_KEY } from "./readiness.js";
import { callTool, isCorosConnected } from "./corosClient.js";
import { recompute, load, pushCloud, isoDate } from "./readinessData.js";
import { parseLaps, addDays } from "./trends.js";

const LAPS_KEY = "coros-laps";
const BACKFILL_KEY = "coros-health-backfill";
const pause = ms => new Promise(r => setTimeout(r, ms));
const ymd = date => date.replace(/-/g, "");
const MILE = 1609.344;

export function planWeeks() {
    return WEEKS.map((_, i) => ({ week: i + 1, start: isoDate(weekStart(i + 1)), planned: getAdjustedWeekMileage(i + 1) }));
}

export function allRuns(today = isoDate(new Date())) {
    return runsBetween(load(HISTORY_KEY, null) || emptyHistory(), addDays(today, -400), today);
}

export const health = () => load(HEALTH_KEY, {});
export const readiness = () => load(READINESS_KEY, {});
export const fitness = () => load(FITNESS_KEY, {});
export const laps = () => load(LAPS_KEY, {});

/** Quality and long days of the plan in the last `days` days, newest first, with the run done that day. */
export function keyWorkouts(today = isoDate(new Date()), { days = 42 } = {}) {
    const runs = allRuns(today);
    const out = [];
    WEEKS.forEach((_, wi) => {
        getAdjustedWeekDays(wi + 1).forEach((day, di) => {
            const d = new Date(weekStart(wi + 1)); d.setDate(d.getDate() + di);
            const date = isoDate(d);
            if (date > today || date < addDays(today, -days)) return;
            const planDay = planDayFromMarathon(day, PACES);
            const kind = kindOfDay(day, planDay);
            if (kind !== "quality" && kind !== "long" && kind !== "race") return;
            const run = runs.filter(r => r.date === date).sort((a, b) => b.distance - a.distance)[0] || null;
            out.push({ date, kind, title: day.session, plannedMiles: Number(day.miles) || 0, sets: planDay?.workout?.sets || [], run, runMiles: run ? run.distance / MILE : 0 });
        });
    });
    return out.sort((a, b) => b.date.localeCompare(a.date));
}

// This visit's lap requests: labelId -> "loading" | "failed" (a failed one is tried again next visit).
const lapStatus = new Map();
export const lapState = labelId => lapStatus.get(String(labelId)) || null;

function saveLaps(saved) {
    const keep = Object.entries(saved).sort((a, b) => String(b[1].date).localeCompare(String(a[1].date))).slice(0, 80);
    localStorage.setItem(LAPS_KEY, JSON.stringify(Object.fromEntries(keep)));
}

/**
 * Laps for key workouts that don't have them yet, newest first (at most `max`
 * a visit, one request at a time). Calls onBatch every 3 so the page fills in
 * as they arrive. Resolves true when any came in.
 */
export async function fetchLaps(items, { max = 18, onBatch } = {}) {
    if (!isCorosConnected()) return false;
    const saved = laps();
    const todo = items.filter(i => i.run?.labelId && !saved[i.run.labelId] && lapState(i.run.labelId) !== "loading").slice(0, max);
    todo.forEach(i => lapStatus.set(String(i.run.labelId), "loading"));
    let got = 0;
    for (let n = 0; n < todo.length; n++) {
        if (n) await pause(300);
        const r = todo[n].run;
        try {
            const result = await callTool("queryActivityLapData", { labelId: String(r.labelId), sportType: Number(r.sportType) || 100 });
            saved[r.labelId] = { date: r.date, laps: parseLaps(result) };
            lapStatus.delete(String(r.labelId));
            got++;
        } catch (error) {
            lapStatus.set(String(r.labelId), "failed");
            if (/401|Reconnect COROS|not connected/i.test(error.message || "")) break;
        }
        if (got && (n + 1) % 3 === 0 && n + 1 < todo.length) { saveLaps(saved); onBatch?.(); }
    }
    todo.forEach(i => { if (lapState(i.run.labelId) === "loading") lapStatus.set(String(i.run.labelId), "failed"); });
    if (got) { saveLaps(saved); pushCloud(); }
    return got > 0;
}

let backfilling = null;

/** 8 weeks of sleep + HRV (+ 60 days of resting HR), once. Resolves true when it added anything. */
export function backfillHealth(today = isoDate(new Date()), { weeks = 8 } = {}) {
    if (backfilling) return backfilling;
    if (!isCorosConnected()) return Promise.resolve(false);
    const oldest = addDays(today, -(weeks * 7 - 1));
    let from = localStorage.getItem(BACKFILL_KEY) || addDays(today, -6);   // the last 7 days come with Readiness
    if (from <= oldest) return Promise.resolve(false);
    backfilling = (async () => {
        let added = false;
        try {
            try {
                const rhr = await callTool("queryRestingHeartRate", { days: weeks * 7 });
                localStorage.setItem(HEALTH_KEY, JSON.stringify(mergeHealth(health(), healthDays({ rhr }), today)));
                added = true;
            } catch {}
            while (from > oldest) {
                const end = addDays(from, -1);
                const start = addDays(end, -6) < oldest ? oldest : addDays(end, -6);
                await pause(300);
                const hrv = await callTool("querySleepHrv", { startDate: ymd(start), endDate: ymd(end), days: 7 });
                await pause(300);
                const sleep = await callTool("querySleepOverview", { startDate: ymd(start), endDate: ymd(end), days: 7 });
                localStorage.setItem(HEALTH_KEY, JSON.stringify(mergeHealth(health(), healthDays({ hrv, sleep }), today)));
                from = start;
                localStorage.setItem(BACKFILL_KEY, from);
                added = true;
            }
        } catch (error) {
            console.warn("Southbound: loading older sleep / HRV paused.", error);
        } finally {
            if (added) { recompute(today, weeks * 7); pushCloud(); }
            backfilling = null;
        }
        return added;
    })();
    return backfilling;
}
