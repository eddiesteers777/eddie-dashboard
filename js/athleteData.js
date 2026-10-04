/* ==========================================
   Southbound — the athlete model's data on this device

   Gathers what the session list (js/athleteLedger.js) is built from —
   the saved COROS runs, the imported Strava history, the running log and
   the coach's own marathon plan — and saves the two new facts the
   athlete tells us: effort after a run ("session-rpe") and race answers
   ("race-results"). Both are private, cloud-synced keys (js/cloudSync.js).
   Coach only for now (Eddie is the first athlete); clients come with
   step 7 of docs/PERFORMANCE_ENGINE_PLAN.md.
========================================== */

import { buildLedger, RPE_KEY, RACES_KEY } from "./athleteLedger.js";
import { HISTORY_KEY, emptyHistory, runsBetween, isoDate, addDays } from "./corosHistory.js";
import { loadStrava } from "./stravaStore.js";

const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};

function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
    window.dispatchEvent(new CustomEvent("sb:athlete-answers", { detail: { key } }));
}

export const loadRpe = () => read(RPE_KEY, {}) || {};
export const loadRaces = () => read(RACES_KEY, {}) || {};

/** The coach's own marathon plan as planned days: [{ date, miles, title, race }]. */
async function marathonPlanDays() {
    try {
        const { WEEKS, weekStart, getAdjustedWeekDays } = await import("./marathonData.js");
        const out = [];
        WEEKS.forEach((_, wi) => {
            getAdjustedWeekDays(wi + 1).forEach((day, di) => {
                const d = new Date(weekStart(wi + 1));
                d.setDate(d.getDate() + di);
                out.push({ date: isoDate(d), miles: Number(day.miles) || 0, title: day.session || "", race: Boolean(day.race) });
            });
        });
        return out;
    } catch {
        return [];
    }
}

/** Every session on this device, linked to the plan, with the athlete's answers. */
export async function loadLedger(today = isoDate(new Date())) {
    const history = read(HISTORY_KEY, null) || emptyHistory();
    const corosRuns = runsBetween(history, "1970-01-01", addDays(today, 1));
    const runLog = (read("running-log", {}) || {}).entries || [];
    return buildLedger({
        corosRuns,
        stravaActs: loadStrava().acts || {},
        runLog,
        planDays: await marathonPlanDays(),
        rpe: loadRpe(),
        races: loadRaces()
    });
}

/** Saves an answer under the session's id (and drops older answers kept under its aliases). */
function put(key, session, value) {
    const all = read(key, {}) || {};
    for (const alias of session.aliases || []) delete all[alias];
    if (value === null) delete all[session.id];
    else all[session.id] = value;
    save(key, all);
}

export const saveEffort = (session, record) => put(RPE_KEY, session, record);
export const saveRace = (session, record) => put(RACES_KEY, session, record);
export const clearRace = session => put(RACES_KEY, session, null);
