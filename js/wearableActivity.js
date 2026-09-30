/* ==========================================
   Southbound — shared COROS training activity

   Step 5A is intentionally narrow:
   - only running activity
   - only dates, distance, and duration
   - no pace, heart rate, recovery, sleep, or other performance data
   - the private COROS history remains the source of truth
   - this file builds the small coach-visible projection from that history
========================================== */

import { HISTORY_KEY, emptyHistory, isoDate, addDays, runsBetween } from "./corosHistory.js";

const WINDOW_DAYS = 28;
const RECENT_RUN_LIMIT = 8;
const MILES_PER_METER = 1 / 1609.344;

function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || "null") || emptyHistory();
    } catch {
        return emptyHistory();
    }
}

const round1 = value => Math.round(value * 10) / 10;

function cleanRun(run) {
    const distanceMeters = Number(run.distance ?? run.distanceMeters) || 0;
    const durationSeconds = Number(run.duration ?? run.durationSeconds) || 0;
    return {
        date: String(run.date || ""),
        startTime: String(run.startTime || ""),
        distanceMiles: round1(distanceMeters * MILES_PER_METER),
        durationSeconds: Math.max(0, Math.round(durationSeconds))
    };
}

/**
 * Build the exact data shape Step 5A is allowed to expose.
 * No pace / heart-rate / calories / recovery / sleep fields are copied.
 */
export function buildSharedActivity(history, today = isoDate(new Date()), days = WINDOW_DAYS) {
    const windowTo = today;
    const windowFrom = addDays(today, -(days - 1));
    const runs = runsBetween(history || emptyHistory(), windowFrom, windowTo)
        .map(cleanRun)
        .filter(run => run.date && run.distanceMiles > 0);

    const totalMiles = round1(runs.reduce((sum, run) => sum + run.distanceMiles, 0));
    const totalDurationSeconds = runs.reduce((sum, run) => sum + run.durationSeconds, 0);

    return {
        version: 1,
        source: "coros",
        windowFrom,
        windowTo,
        summary: {
            runCount: runs.length,
            distanceMiles: totalMiles,
            durationSeconds: totalDurationSeconds
        },
        recentRuns: runs.slice(0, RECENT_RUN_LIMIT).map(({ date, startTime, distanceMiles, durationSeconds }) => ({
            date,
            startTime,
            distanceMiles,
            durationSeconds
        }))
    };
}

/**
 * Pushes the small projection to every coach for whom the client has
 * explicitly enabled Training activity. Other wearable categories never
 * participate in this write.
 */
export async function syncSharedWearableActivity() {
    const {
        listMyWearableShares,
        writeSharedWearableActivity,
        deleteSharedWearableActivity
    } = await import("./coachAccess.js");
    const shares = await listMyWearableShares();
    const payload = buildSharedActivity(loadHistory());

    const results = await Promise.allSettled(shares.map(async ({ link, share }) => {
        const activityAllowed = share?.status === "active" && share?.permissions?.activity === true;
        if (activityAllowed) {
            await writeSharedWearableActivity(link.coachUid, payload);
            return "shared";
        }
        await deleteSharedWearableActivity(link.coachUid, link.clientUid);
        return "cleared";
    }));

    results.forEach(result => {
        if (result.status === "rejected") {
            console.warn("Southbound: shared COROS activity update failed.", result.reason?.code || result.reason);
        }
    });

    return {
        shared: results.filter(r => r.status === "fulfilled" && r.value === "shared").length,
        cleared: results.filter(r => r.status === "fulfilled" && r.value === "cleared").length
    };
}
