/* ==========================================
   Southbound — COROS runs, a few at a time, from any page

   Analytics (js/corosData.js) loads the whole COROS picture: a year of
   runs, laps, fitness. Every other page only needs to know about the run
   just finished, so "How hard was it?" can ask about it: Today and Weekly
   Review call refreshRecentRuns(), which asks COROS for the days since
   the newest saved run (usually one 7-day window), adds what's new to
   the saved history ("coros-run-history", js/corosHistory.js) and fires
   "eddieos:coros-history-updated". At most every 5 minutes per device
   (sb-coros-runs-checked, not synced), only with COROS connected on this
   device, nothing offline. No side effects on import (the COROS
   connection is loaded only when it's used).
========================================== */

import { unwrapResult, findRecords, normalizeActivity } from "./corosParse.js";
import { HISTORY_KEY, emptyHistory, mergeRuns, markCovered, windowsToFetch, isoDate } from "./corosHistory.js";

const CHECKED_KEY = "sb-coros-runs-checked";
const TOOL_KEY = "sb-coros-sport-tool";
const EVERY_MS = 5 * 60 * 1000;

export function supported(schema, key) {
    return Boolean(schema?.properties && Object.prototype.hasOwnProperty.call(schema.properties, key));
}

function formatCorosDate(date) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

/** querySportRecords' arguments for a date range, only the ones its schema takes. */
export function buildArgs(toolDefinition, start, end) {
    const schema = toolDefinition?.inputSchema || {};
    const args = {};
    if (supported(schema, "startDate")) args.startDate = formatCorosDate(start);
    if (supported(schema, "endDate")) args.endDate = formatCorosDate(end);
    // Outdoor, indoor, trail and track runs.
    if (supported(schema, "sportTypeCodes")) args.sportTypeCodes = [100, 101, 102, 103];
    if (supported(schema, "timezone")) args.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (supported(schema, "limit")) args.limit = 20;
    return args;
}

// Every run in one plain shape (meters, seconds, ISO start) for every page.
export function parseRecords(result) {
    return findRecords(unwrapResult(result)).map(normalizeActivity);
}

const dayOf = iso => new Date(`${iso}T12:00:00`);
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; } catch { return fallback; } };

// The run tool's description, remembered for this visit (one tools/list per session).
async function sportTool(mcpRequest) {
    try { const t = JSON.parse(sessionStorage.getItem(TOOL_KEY) || "null"); if (t?.name) return t; } catch {}
    const tools = (await mcpRequest("tools/list"))?.tools || [];
    const t = tools.find(x => x?.name === "querySportRecords");
    if (!t) throw new Error("COROS did not expose querySportRecords");
    try { sessionStorage.setItem(TOOL_KEY, JSON.stringify({ name: t.name, inputSchema: t.inputSchema || {} })); } catch {}
    return t;
}

let running = null;

/**
 * Brings the saved COROS runs up to today (when due). Resolves to the
 * number of new runs, or 0 (not connected, offline, checked recently,
 * nothing new, or COROS didn't answer: never throws).
 */
export function refreshRecentRuns({ force = false } = {}) {
    if (running) return running;
    if (!navigator.onLine) return Promise.resolve(0);
    const last = Number(localStorage.getItem(CHECKED_KEY) || 0);
    if (!force && Date.now() - last < EVERY_MS) return Promise.resolve(0);
    running = (async () => {
        try {
            // (Loaded here: the COROS sign-in code needs a page, and the helpers above don't.)
            const { callTool, mcpRequest, isCorosConnected } = await import("./corosClient.js");
            if (!isCorosConnected()) return 0;
            localStorage.setItem(CHECKED_KEY, String(Date.now()));
            const today = isoDate(new Date());
            let history = load(HISTORY_KEY, null) || emptyHistory();
            // Only the recent end; Analytics fills in older weeks. A history that was never
            // loaded starts with this week.
            // (More than 6 weeks behind: Analytics catches that up, the saved range must stay continuous.)
            const { recent } = windowsToFetch(history, today);
            if (!recent.length || recent.length > 6) return 0;
            const tool = await sportTool(mcpRequest);
            let added = 0;
            for (const win of recent) {
                const result = await callTool(tool.name, buildArgs(tool, dayOf(win.start), dayOf(win.end)));
                const merged = mergeRuns(history, parseRecords(result), today);
                added += merged.added;
                history = markCovered(merged.history, win.start, win.end);
            }
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            if (added) {
                import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
                window.dispatchEvent(new CustomEvent("eddieos:coros-history-updated", { detail: { added } }));
            }
            return added;
        } catch (error) {
            console.warn("Southbound: couldn't check COROS for new runs.", error?.message || error);
            return 0;
        } finally {
            running = null;
        }
    })();
    return running;
}
