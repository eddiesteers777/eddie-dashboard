/* ==========================================
   Southbound — readiness data: COROS health in, readiness by day out

   Fetches last night's numbers from COROS (sleep, sleep HRV, resting
   heart rate, stress, recovery) for whoever has COROS connected on this
   device, at most every 2 hours (every 20 minutes while last night's
   HRV / sleep hasn't synced from the watch yet), and saves them by
   wake-up day in "coros-health-history" (js/corosHealth.js). Recovery
   goes into "coros-fitness-history" with the rest of the fitness
   numbers. Readiness for the last week is recomputed and saved in
   "readiness-history" (js/readiness.js) so trends and insights have it.
   All of it stays in this person's own storage and private sync.
========================================== */

import { callTool, isCorosConnected } from "./corosClient.js";
import { HEALTH_KEY, healthDays, mergeHealth } from "./corosHealth.js";
import { FITNESS_KEY, fitnessDays, mergeFitness } from "./corosHistory.js";
import { computeReadiness, SETTINGS_KEY, CHECKIN_KEY, READINESS_KEY, DEFAULT_SLEEP_NEED } from "./readiness.js";

const FETCHED_KEY = "coros-health-fetched";   // this device only
const ERROR_KEY = "coros-health-error";       // the last fetch's problem, this device only
const pad = n => String(n).padStart(2, "0");
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymd = d => isoDate(d).replace(/-/g, "");
const pause = ms => new Promise(r => setTimeout(r, ms));

export function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}
export function pushCloud() {
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

export const loadSettings = () => ({ sleepNeedMin: DEFAULT_SLEEP_NEED, ...load(SETTINGS_KEY, {}) });
export function saveSettings(settings) { save(SETTINGS_KEY, settings); recompute(); pushCloud(); }
export const loadCheckins = () => load(CHECKIN_KEY, {});
export function saveCheckin(date, checkin) {
    const all = loadCheckins();
    all[date] = { ...checkin, at: Date.now() };
    save(CHECKIN_KEY, all);
    recompute();
    pushCloud();
}

/** Everything readiness needs, from storage. */
export function inputs() {
    return { health: load(HEALTH_KEY, {}), fitness: load(FITNESS_KEY, {}), checkins: loadCheckins(), settings: loadSettings() };
}

/** Recompute and save readiness for the last `days` days (8 unless backfilling). */
export function recompute(today = isoDate(new Date()), days = 8) {
    const data = inputs();
    const history = load(READINESS_KEY, {});
    for (let i = 0; i < days; i++) {
        const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - i);
        const date = isoDate(d);
        const r = computeReadiness(date, data);
        if (r.score != null) history[date] = { score: r.score, bodyScore: r.bodyScore, color: r.color };
        else delete history[date];
    }
    save(READINESS_KEY, history);
    return history;
}

function due(today) {
    const last = Number(localStorage.getItem(FETCHED_KEY) || 0);
    const haveLastNight = Boolean(load(HEALTH_KEY, {})[today]?.hrv || load(HEALTH_KEY, {})[today]?.sleep);
    return Date.now() - last > (haveLastNight ? 2 * 3600e3 : 20 * 60e3);
}

let running = null;
export const healthRefreshing = () => Boolean(running);
export function lastHealthError() {
    try { const e = JSON.parse(localStorage.getItem(ERROR_KEY) || "null"); return e && Date.now() - e.at < 6 * 3600e3 ? e.message : null; } catch { return null; }
}

/** Brings COROS health up to date (when due). Resolves true when something was fetched. */
export function refreshHealth({ force = false } = {}) {
    if (running) return running;
    const today = isoDate(new Date());
    if (!isCorosConnected() || (!force && !due(today))) return Promise.resolve(false);
    running = (async () => {
        try {
            localStorage.setItem(FETCHED_KEY, String(Date.now()));
            const start = new Date(); start.setDate(start.getDate() - 6);
            const asks = {
                recovery: ["queryRecoveryStatus", {}],
                sleep: ["querySleepOverview", { days: 7 }],
                hrv: ["querySleepHrv", { startDate: ymd(start), endDate: ymd(new Date()), days: 7 }],
                rhr: ["queryRestingHeartRate", { days: 30 }],
                stress: ["queryStressLevel", { days: 7 }]
            };
            const replies = {};
            let first = true;
            for (const [key, [name, args]] of Object.entries(asks)) {
                if (!first) await pause(300);
                first = false;
                try { replies[key] = await callTool(name, args); }
                catch (error) {
                    if (/401|Reconnect COROS|not connected/i.test(error.message || "")) throw error;
                    // Resting HR: fall back to a week if COROS won't give 30 days.
                    if (key === "rhr") { try { replies.rhr = await callTool(name, { days: 7 }); } catch {} }
                }
            }
            if (!Object.keys(replies).length) throw new Error("no replies");
            save(HEALTH_KEY, mergeHealth(load(HEALTH_KEY, {}), healthDays(replies), today));
            localStorage.removeItem(ERROR_KEY);
            if (replies.recovery) save(FITNESS_KEY, mergeFitness(load(FITNESS_KEY, {}), fitnessDays(today, { recovery: replies.recovery }), today));
            recompute(today);
            pushCloud();
            window.dispatchEvent(new CustomEvent("sb:readiness-updated"));
            return true;
        } catch (error) {
            console.warn("Southbound: COROS health refresh failed.", error);
            const message = /401|Reconnect/i.test(error?.message || "") ? "your COROS sign-in expired: reconnect in Settings" : /no replies/.test(error?.message || "") ? "no data came back" : "a connection problem";
            localStorage.setItem(ERROR_KEY, JSON.stringify({ message, at: Date.now() }));
            window.dispatchEvent(new CustomEvent("sb:readiness-updated"));
            return false;
        } finally {
            running = null;
        }
    })();
    return running;
}
