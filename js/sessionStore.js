/* ==========================================
   Southbound — completed workouts on this device (and the account)

   The storage side of js/completedSessions.js:
   - stored sessions (strength finished on the Strength page,
     cross-training logged) one key each, `workout-session-<id>`,
     cloud-synced (js/cloudSync.js KEY_PREFIXES);
   - share history in `workout-shares`;
   - loadFeed(): every completed workout, newest first, each once:
     the stored ones + COROS / Strava runs + the Running Log + (for a
     client) their logs on the coach's plan.
   Changes fire "sb:sessions-changed".
========================================== */

import {
    SESSION_PREFIX, SHARES_KEY, storageKey, cleanStored, deletedMarker, recordShare,
    runFromWatch, runFromLog, sessionFromResult, buildFeed, localDay
} from "./completedSessions.js";

const read = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v ?? fallback; } catch { return fallback; }
};

let pushTimer = null;
function pushSoon() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        import("./cloudSync.js").then(m => m.pushToCloud()).catch(() => {});
    }, 400);
}
const changed = id => {
    try { window.dispatchEvent(new CustomEvent("sb:sessions-changed", { detail: { id } })); } catch { /* no window */ }
};

/** Every stored session on this device, deletion markers included. */
export function storedSessions() {
    const out = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith(SESSION_PREFIX)) continue;
            const s = cleanStored(localStorage.getItem(key));
            if (s) out.push(s);
        }
    } catch { /* storage unavailable */ }
    return out;
}

export function getSession(id) {
    try { return cleanStored(localStorage.getItem(storageKey(id))); } catch { return null; }
}

/**
 * Saves a session. Throws when the phone's storage is full, so the caller
 * can say so instead of pretending it saved.
 */
export function saveSession(record) {
    const clean = cleanStored(record);
    if (!clean || clean.deleted) throw new Error("Not a session");
    localStorage.setItem(storageKey(clean.id), JSON.stringify(clean));
    changed(clean.id);
    pushSoon();
    return clean;
}

export function deleteSession(id) {
    localStorage.setItem(storageKey(id), JSON.stringify(deletedMarker(id)));
    changed(id);
    pushSoon();
}

export const loadShares = () => read(SHARES_KEY, {});

/** Notes a share or a save of a session's image. Never throws. */
export function noteShared(id, via) {
    if (!id) return;
    try {
        localStorage.setItem(SHARES_KEY, JSON.stringify(recordShare(loadShares(), id, via)));
        changed(id);
        pushSoon();
    } catch { /* a full phone doesn't stop the share */ }
}

/** The run category Featured Runs uses (long run / speed work), from the run alone. */
async function categoryOf() {
    try {
        const { autoRunCategory } = await import("./featuredTrainingModel.js");
        return run => {
            const c = autoRunCategory(run);
            return c === "long_run" ? "Long Run" : c === "speed_work" ? "Speed Work" : null;
        };
    } catch { return () => null; }
}

async function watchRuns(today) {
    try {
        const { allRuns } = await import("./trendsData.js");
        const cat = await categoryOf();
        return allRuns(today).map(r => runFromWatch(r, { category: cat(r) })).filter(Boolean);
    } catch { return []; }
}

function logRuns() {
    const log = read("running-log", { entries: [] });
    return (Array.isArray(log?.entries) ? log.entries : []).map(runFromLog).filter(Boolean);
}

async function planResults() {
    try {
        const { showsPersonalPlan } = await import("./role.js");
        if (showsPersonalPlan()) return [];
        const { listMyResults } = await import("./workoutResults.js");
        const list = await Promise.race([listMyResults(), new Promise(resolve => setTimeout(() => resolve(null), 6000))]);
        return (list || []).map(sessionFromResult).filter(Boolean);
    } catch { return []; }
}

/**
 * Every completed workout in the last `days` days, newest first.
 * { results: false } skips the account read (a quick redraw).
 */
export async function loadFeed({ today = localDay(), days = 120, results = true, cachedResults = null } = {}) {
    const from = (() => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - days); return localDay(d.getTime()); })();
    const [watch, plan] = await Promise.all([watchRuns(today), cachedResults ? Promise.resolve(cachedResults) : results ? planResults() : Promise.resolve([])]);
    return {
        feed: buildFeed({ stored: storedSessions(), watchRuns: watch, logRuns: logRuns(), results: plan, shares: loadShares(), from, to: today }),
        results: plan
    };
}
