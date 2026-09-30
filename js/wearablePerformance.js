/* ==========================================
   Southbound — shared COROS performance

   Step 5B:
   - performance data only
   - pace and average heart rate from running activity
   - compact COROS fitness indicators (VO2 max, threshold pace,
     marathon prediction, training-load ratio/load when available)
   - no recovery, sleep, readiness, or COROS credentials
   - private COROS history remains the source of truth
========================================== */

import { HISTORY_KEY, FITNESS_KEY, emptyHistory, isoDate, addDays, runsBetween } from "./corosHistory.js";

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

function loadFitness() {
    try {
        return JSON.parse(localStorage.getItem(FITNESS_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

const round1 = value => Math.round(value * 10) / 10;

function positiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function cleanRun(run) {
    const distanceMeters = positiveNumber(run.distance ?? run.distanceMeters);
    const durationSeconds = positiveNumber(run.duration ?? run.durationSeconds);
    const paceSecondsPerMile = positiveNumber(run.pace_seconds_per_mile);
    const avgHeartRate = positiveNumber(run.avgHr);

    return {
        date: String(run.date || ""),
        startTime: String(run.startTime || ""),
        distanceMiles: distanceMeters ? round1(distanceMeters * MILES_PER_METER) : 0,
        durationSeconds: durationSeconds ? Math.max(0, Math.round(durationSeconds)) : 0,
        paceSecondsPerMile: paceSecondsPerMile ? Math.round(paceSecondsPerMile) : 0,
        avgHeartRate: avgHeartRate ? Math.round(avgHeartRate) : 0
    };
}

function latestFitnessEntry(fitnessHistory, windowFrom, windowTo) {
    return Object.entries(fitnessHistory || {})
        .filter(([date]) => date >= windowFrom && date <= windowTo)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([, entry]) => entry || {})
        .find(entry => entry && typeof entry === "object") || {};
}

/**
 * Build the exact data shape Step 5B is allowed to expose.
 * Pace and heart-rate fields are included only in this performance
 * projection. Recovery/sleep are intentionally never copied.
 */
export function buildSharedPerformance(
    history,
    fitnessHistory,
    today = isoDate(new Date()),
    days = WINDOW_DAYS
) {
    const windowTo = today;
    const windowFrom = addDays(today, -(days - 1));
    const runs = runsBetween(history || emptyHistory(), windowFrom, windowTo)
        .map(cleanRun)
        .filter(run => run.date && run.distanceMiles > 0);

    const paceRuns = runs.filter(run => run.paceSecondsPerMile > 0 && run.durationSeconds > 0);
    const hrRuns = runs.filter(run => run.avgHeartRate > 0);

    const totalDistanceForPace = paceRuns.reduce((sum, run) => sum + run.distanceMiles, 0);
    const totalDurationForPace = paceRuns.reduce((sum, run) => sum + run.durationSeconds, 0);
    const averagePaceSecondsPerMile = totalDistanceForPace > 0
        ? Math.round(totalDurationForPace / totalDistanceForPace)
        : null;

    const totalHrWeight = hrRuns.reduce((sum, run) => sum + (run.durationSeconds || 1), 0);
    const averageHeartRate = hrRuns.length
        ? Math.round(hrRuns.reduce((sum, run) => sum + run.avgHeartRate * (run.durationSeconds || 1), 0) / totalHrWeight)
        : null;

    const bestPaceRun = paceRuns.reduce(
        (best, run) => !best || run.paceSecondsPerMile < best.paceSecondsPerMile ? run : best,
        null
    );

    const fitness = latestFitnessEntry(fitnessHistory, windowFrom, windowTo);
    const load = fitness.load || {};

    return {
        version: 1,
        source: "coros",
        windowFrom,
        windowTo,
        summary: {
            runCount: runs.length,
            averagePaceSecondsPerMile,
            averageHeartRate,
            bestPaceSecondsPerMile: bestPaceRun?.paceSecondsPerMile || null,
            bestPaceDistanceMiles: bestPaceRun?.distanceMiles || null,
            vo2Max: positiveNumber(fitness.vo2),
            thresholdPaceSecondsPerMile: parsePaceSeconds(fitness.threshold),
            marathonPrediction: String(fitness.marathon || ""),
            trainingLoadRatio: positiveNumber(load.ratio),
            shortTermLoad: positiveNumber(load.short),
            longTermLoad: positiveNumber(load.long)
        },
        recentRuns: runs.slice(0, RECENT_RUN_LIMIT).map(({ date, startTime, distanceMiles, durationSeconds, paceSecondsPerMile, avgHeartRate }) => ({
            date,
            startTime,
            distanceMiles,
            durationSeconds,
            paceSecondsPerMile,
            avgHeartRate
        }))
    };
}

function parsePaceSeconds(value) {
    const match = String(value || "").match(/^(\d+):([0-5]\d)\/mi$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Pushes the compact performance projection to each linked coach for
 * whom the client has explicitly enabled Performance sharing.
 */
export async function syncSharedWearablePerformance() {
    const {
        listMyWearableShares,
        writeSharedWearablePerformance,
        deleteSharedWearablePerformance
    } = await import("./coachAccess.js");

    const shares = await listMyWearableShares();
    const payload = buildSharedPerformance(loadHistory(), loadFitness());

    const results = await Promise.allSettled(shares.map(async ({ link, share }) => {
        const allowed = share?.status === "active" && share?.permissions?.performance === true;
        if (allowed) {
            await writeSharedWearablePerformance(link.coachUid, payload);
            return "shared";
        }
        await deleteSharedWearablePerformance(link.coachUid, link.clientUid);
        return "cleared";
    }));

    results.forEach(result => {
        if (result.status === "rejected") {
            console.warn("Southbound: shared COROS performance update failed.", result.reason?.code || result.reason);
        }
    });

    return {
        shared: results.filter(r => r.status === "fulfilled" && r.value === "shared").length,
        cleared: results.filter(r => r.status === "fulfilled" && r.value === "cleared").length
    };
}
