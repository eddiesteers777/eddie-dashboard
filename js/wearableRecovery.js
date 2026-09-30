/* ==========================================
   Southbound — shared COROS recovery & sleep

   Step 5C:
   - recovery category only
   - sleep score / time asleep
   - sleep HRV assessment
   - resting heart rate
   - stress
   - COROS recovery percentage / status / estimated recovery time
   - no readiness/check-in data, performance metrics, calories, tokens,
     or raw COROS payloads
   - private COROS health history remains the source of truth
========================================== */

import { HEALTH_KEY } from "./corosHealth.js";
import { FITNESS_KEY, isoDate, addDays } from "./corosHistory.js";

const WINDOW_DAYS = 28;
const RECENT_DAY_LIMIT = 8;

function load(key, fallback = {}) {
    try {
        return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch {
        return fallback;
    }
}

const round1 = value => Math.round(value * 10) / 10;

function positiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function average(values, digits = 1) {
    const numbers = values.map(Number).filter(Number.isFinite);
    if (!numbers.length) return null;
    const raw = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    return digits === 0 ? Math.round(raw) : round1(raw);
}

function buildDay(date, health = {}, fitness = {}) {
    const sleep = health.sleep || {};
    const hrv = health.hrv || {};
    const recovery = fitness.recovery || {};
    const row = {
        date,
        sleepScore: positiveNumber(sleep.score),
        asleepMinutes: positiveNumber(sleep.asleepMin),
        hrvAvg: positiveNumber(hrv.avg),
        hrvStatus: String(hrv.status || ""),
        restingHeartRate: positiveNumber(health.rhr),
        stressAvg: positiveNumber(health.stress?.avg),
        stressLevel: String(health.stress?.level || ""),
        recoveryPercent: positiveNumber(recovery.percent),
        recoveryStatus: String(recovery.status || ""),
        recoveryHours: positiveNumber(recovery.hours)
    };

    if (!row.sleepScore) row.sleepScore = null;
    if (!row.asleepMinutes) row.asleepMinutes = null;
    if (!row.hrvAvg) row.hrvAvg = null;
    if (!row.restingHeartRate) row.restingHeartRate = null;
    if (!row.stressAvg) row.stressAvg = null;
    if (!row.recoveryPercent) row.recoveryPercent = null;
    if (!row.recoveryHours) row.recoveryHours = null;

    return row;
}

export function buildSharedRecovery(
    healthHistory = {},
    fitnessHistory = {},
    today = isoDate(new Date()),
    days = WINDOW_DAYS
) {
    const windowTo = today;
    const windowFrom = addDays(today, -(days - 1));

    const dates = new Set([
        ...Object.keys(healthHistory || {}),
        ...Object.keys(fitnessHistory || {})
    ]);

    const rows = [...dates]
        .filter(date => date >= windowFrom && date <= windowTo)
        .sort((a, b) => b.localeCompare(a))
        .map(date => buildDay(date, healthHistory[date], fitnessHistory[date]))
        .filter(row => [
            row.sleepScore, row.asleepMinutes, row.hrvAvg, row.restingHeartRate,
            row.stressAvg, row.recoveryPercent, row.recoveryStatus, row.recoveryHours
        ].some(value => value != null && value !== ""));

    const latest = rows[0] || null;

    return {
        version: 1,
        source: "coros",
        windowFrom,
        windowTo,
        summary: {
            daysWithData: rows.length,
            averageSleepScore: average(rows.map(r => r.sleepScore).filter(v => v != null), 1),
            averageAsleepMinutes: average(rows.map(r => r.asleepMinutes).filter(v => v != null), 0),
            averageHrv: average(rows.map(r => r.hrvAvg).filter(v => v != null), 0),
            averageRestingHeartRate: average(rows.map(r => r.restingHeartRate).filter(v => v != null), 0),
            averageStress: average(rows.map(r => r.stressAvg).filter(v => v != null), 0),
            averageRecoveryPercent: average(rows.map(r => r.recoveryPercent).filter(v => v != null), 1),
            latestSleepScore: latest?.sleepScore ?? null,
            latestAsleepMinutes: latest?.asleepMinutes ?? null,
            latestHrv: latest?.hrvAvg ?? null,
            latestRestingHeartRate: latest?.restingHeartRate ?? null,
            latestRecoveryPercent: latest?.recoveryPercent ?? null,
            latestRecoveryStatus: latest?.recoveryStatus || "",
            latestRecoveryHours: latest?.recoveryHours ?? null
        },
        recentDays: rows.slice(0, RECENT_DAY_LIMIT)
    };
}

/**
 * Pushes the compact recovery projection to every linked coach for whom
 * the client has explicitly enabled Recovery & sleep sharing.
 */
export async function syncSharedWearableRecovery() {
    const {
        listMyWearableShares,
        writeSharedWearableRecovery,
        deleteSharedWearableRecovery
    } = await import("./coachAccess.js");

    const shares = await listMyWearableShares();
    const payload = buildSharedRecovery(
        load(HEALTH_KEY, {}),
        load(FITNESS_KEY, {})
    );

    const results = await Promise.allSettled(shares.map(async ({ link, share }) => {
        const allowed = share?.status === "active" && share?.permissions?.recovery === true;
        if (allowed) {
            await writeSharedWearableRecovery(link.coachUid, payload);
            return "shared";
        }

        await deleteSharedWearableRecovery(link.coachUid, link.clientUid);
        return "cleared";
    }));

    results.forEach(result => {
        if (result.status === "rejected") {
            console.warn("Southbound: shared COROS recovery update failed.", result.reason?.code || result.reason);
        }
    });

    return {
        shared: results.filter(r => r.status === "fulfilled" && r.value === "shared").length,
        cleared: results.filter(r => r.status === "fulfilled" && r.value === "cleared").length
    };
}
