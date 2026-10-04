// A made-up athlete for the athlete-model tests: true 10K 40:00, Riegel 1.06 between distances.
// Not real data; never commit a real FIT / Strava file.
import { sessionsFrom, attachAnswers, raceRecord, addDays } from "../js/athleteLedger.js";

export const M = 1609.344;
export const TRUE_10K = 2400;
export const trueTime = meters => TRUE_10K * Math.pow(meters / 10000, 1.06);

const at = (date, h) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d, h).toISOString(); };
let n = 0;
export const run = (date, miles, secPerMile, extra = {}) => ({
    labelId: extra.id || `r${++n}`, date, startTime: at(date, extra.hour ?? 6), distance: Math.round(miles * M),
    duration: Math.round(miles * secPerMile), avgHr: extra.hr ?? 140, name: extra.name || "Run"
});

/**
 * `weeks` of training ending `asOf`: easy 7 mi at 8:30 most days, a 6 mi tempo at 6:45 on Tuesdays
 * (whole-run efforts), Saturday long runs of `longMiles`, plus races [{ date, meters, sec, name }].
 */
export function athlete({ asOf, weeks = 16, longMiles = 18, easyMiles = 7, races = [] }) {
    const corosRuns = [];
    for (let i = 0; i < weeks * 7; i++) {
        const date = addDays(asOf, -i);
        const dow = new Date(`${date}T12:00:00`).getDay();
        if (races.some(r => r.date === date)) continue;
        if (dow === 1) continue;
        if (dow === 6) corosRuns.push(run(date, longMiles, 500));
        else if (dow === 2) corosRuns.push(run(date, 6, 405));
        else corosRuns.push(run(date, easyMiles, 510));
    }
    const raceIds = {};
    for (const r of races) {
        const id = `race-${r.date}`;
        corosRuns.push({ ...run(r.date, r.meters / M, r.sec / (r.meters / M), { id, hour: 8, name: r.name || "Race" }) });
        raceIds[`c:${id}`] = r;
    }
    const sessions = sessionsFrom({ corosRuns });
    const answers = {};
    for (const s of sessions) if (raceIds[s.id]) answers[s.id] = raceRecord(s, { officialSec: raceIds[s.id].sec, allOut: raceIds[s.id].allOut !== false }, 1);
    return attachAnswers(sessions, { races: answers });
}
