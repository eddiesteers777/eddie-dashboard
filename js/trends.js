/* ==========================================
   Southbound — training and body trends for Analytics (pure)

   Everything here works from what was actually run and measured:
     - runs from the saved COROS history (js/corosHistory.js, normalized:
       date, distance in meters, duration in seconds, avgHr)
     - laps from COROS (queryActivityLapData, parsed by parseLaps)
     - sleep / HRV / resting HR by wake-up day (js/corosHealth.js)
     - readiness by day (js/readiness.js), fitness by day (js/corosHistory.js)
   and the coach's own marathon plan for what was planned.
   Unit-tested in tests/trends.test.mjs.
========================================== */

const MILE = 1609.344;
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(date, n) { const [y, m, d] = date.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); }
export function mondayOf(date) { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return iso(t); }
const round1 = n => Math.round(n * 10) / 10;
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const miles = run => (Number(run?.distance) || 0) / MILE;
export const paceOf = run => (Number(run?.duration) > 0 && miles(run) > 0 ? Number(run.duration) / miles(run) : null);
export const mmss = s => { const r = Math.round(s); return `${Math.floor(r / 60)}:${pad(r % 60)}`; };

// ---------- plan vs actual ----------

/**
 * planWeeks: [{ week, start (Monday), planned (miles) }], runs, today
 * -> { rows: [{ week, start, planned, actual, runs, isCurrent, isFuture }], thisWeek, last4 }
 */
export function planVsActual(planWeeks, runs, today) {
    const rows = planWeeks.map(w => {
        const end = addDays(w.start, 6);
        const inWeek = (runs || []).filter(r => r.date >= w.start && r.date <= end);
        return {
            week: w.week, start: w.start, planned: round1(w.planned),
            actual: round1(inWeek.reduce((t, r) => t + miles(r), 0)), runs: inWeek.length,
            isCurrent: today >= w.start && today <= end, isFuture: w.start > today
        };
    });
    const current = rows.find(r => r.isCurrent) || null;
    const done = rows.filter(r => !r.isFuture && !r.isCurrent).slice(-4);
    const planned = done.reduce((t, r) => t + r.planned, 0);
    return {
        rows,
        thisWeek: current,
        last4: done.length ? { weeks: done.length, planned: round1(planned), actual: round1(done.reduce((t, r) => t + r.actual, 0)), pct: planned ? Math.round(done.reduce((t, r) => t + r.actual, 0) / planned * 100) : null } : null
    };
}

// ---------- long runs ----------

/** Each week's longest run of at least minMiles -> [{ date, miles, pace, hr, name }], oldest first. */
export function longRuns(runs, { minMiles = 10 } = {}) {
    const byWeek = new Map();
    for (const r of runs || []) {
        if (miles(r) < minMiles) continue;
        const wk = mondayOf(r.date);
        if (!byWeek.has(wk) || miles(r) > miles(byWeek.get(wk))) byWeek.set(wk, r);
    }
    return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date))
        .map(r => ({ date: r.date, miles: round1(miles(r)), pace: paceOf(r), hr: Number(r.avgHr) || null, name: r.name || "" }));
}

// ---------- aerobic fitness: easy pace at the same heart rate ----------

/**
 * Easy runs (heart rate from 100 to hrCap, 3+ miles): speed per heartbeat
 * (efficiency) -> the pace that heart rate would give at 140 bpm, by week.
 * -> { points: [{ week, paceAt140, runs }], change: seconds per mile faster
 *    over the last 4 weeks vs. the 4 before (positive = fitter), or null }
 */
export function aerobicTrend(runs, { hrCap = 155, at = 140 } = {}) {
    const byWeek = new Map();
    for (const r of runs || []) {
        const hr = Number(r.avgHr), secs = Number(r.duration);
        if (!hr || hr < 100 || hr > hrCap || miles(r) < 3 || !secs) continue;
        const speed = Number(r.distance) / (secs / 60);          // meters per minute
        const wk = mondayOf(r.date);
        if (!byWeek.has(wk)) byWeek.set(wk, []);
        byWeek.get(wk).push(speed / hr);
    }
    const points = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, eff]) => ({ week, paceAt140: Math.round(MILE / (avg(eff) * at) * 60), runs: eff.length }));
    let change = null;
    if (points.length >= 6) {
        const recent = avg(points.slice(-4).map(p => p.paceAt140));
        const before = avg(points.slice(-8, -4).map(p => p.paceAt140));
        change = Math.round(before - recent);
    }
    return { points, change };
}

// ---------- load: this week vs. your usual ----------

/**
 * Weekly miles for the last `weeks` weeks, and the last 7 days against the
 * average week of the last 28 (acute : chronic). 0.8-1.3 is the usual safe band.
 */
export function loadTrend(runs, today, { weeks = 12 } = {}) {
    const monday = mondayOf(today);
    const bars = Array.from({ length: weeks }, (_, i) => {
        const start = addDays(monday, -7 * (weeks - 1 - i));
        const end = addDays(start, 6);
        return { start, miles: round1((runs || []).filter(r => r.date >= start && r.date <= end).reduce((t, r) => t + miles(r), 0)) };
    });
    const sum = (from, to) => (runs || []).filter(r => r.date >= from && r.date <= to).reduce((t, r) => t + miles(r), 0);
    const acute = sum(addDays(today, -6), today);
    const chronic = sum(addDays(today, -27), today) / 4;
    const ratio = chronic > 0 ? Math.round(acute / chronic * 100) / 100 : null;
    const status = ratio == null ? "none" : ratio > 1.5 ? "high" : ratio > 1.3 ? "caution" : ratio >= 0.8 ? "safe" : "low";
    return { bars, acute: round1(acute), chronic: round1(chronic), ratio, status };
}

// ---------- laps ----------

/**
 * COROS queryActivityLapData (JSON inside the text item) -> [{ i, m, s, hr }]
 * (meters, seconds, average heart rate). COROS gives auto laps (every mile,
 * lapGroup type 10) and, when the watch ran a workout or the lap button was
 * used, other groups: those are the reps, so they're preferred.
 */
export function parseLaps(reply) {
    let data = reply;
    try {
        const text = reply?.content?.find?.(c => typeof c?.text === "string")?.text;
        if (text) { data = JSON.parse(text); if (typeof data === "string") data = JSON.parse(data); }
    } catch { return []; }
    const groups = (data?.lapGroups || []).filter(g => (g.laps || []).length);
    if (!groups.length) return [];
    const manual = groups.find(g => g.type !== 10 && g.laps.length >= 2);
    const group = manual || groups[0];
    return group.laps.map((l, idx) => ({
        i: l.lapIndex ?? idx + 1,
        m: Math.round((Number(l.distance) || 0) / 100),             // centimeters -> meters
        s: Math.round((Number(l.time) || 0) * 10) / 10,
        hr: Number(l.avgHr) || null
    })).filter(l => l.m > 0 && l.s > 0);
}

const lapPace = l => l.s / (l.m / MILE);
function paceRange(text) {
    const m = String(text || "").match(/(\d{1,2}):(\d{2})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    const lo = Number(m[1]) * 60 + Number(m[2]);
    const hi = m[3] ? Number(m[3]) * 60 + Number(m[4]) : lo;
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
}

/**
 * The planned quality sets (with pace targets, per mile) + the run's laps
 * -> { target: "6:35–6:50", work, onTarget, fast, slow, avgPace, avgHr, laps: [{ ..., pace, work, onTarget }] }
 * Work laps are the ones at or faster than 20 s/mi slower than the target
 * (short partial laps under 200 m are ignored); on target = within 5 s/mi.
 */
export function checkWorkout(sets, laps) {
    const ranges = (sets || []).flatMap(s => (s.parts ? s.parts : [s])).filter(s => s.recovery !== true && s.effort !== "easy" && s.effort !== "recovery").map(s => paceRange(s.pace)).filter(Boolean);
    const rows = (laps || []).filter(l => l.m >= 200).map(l => ({ ...l, pace: lapPace(l) }));
    if (!ranges.length) return { target: null, work: 0, onTarget: 0, fast: 0, slow: 0, avgPace: null, avgHr: null, laps: rows };
    const lo = Math.min(...ranges.map(r => r.lo)), hi = Math.max(...ranges.map(r => r.hi));
    const marked = rows.map(l => ({ ...l, work: l.pace <= hi + 20, onTarget: l.pace >= lo - 5 && l.pace <= hi + 5 }));
    const work = marked.filter(l => l.work);
    return {
        target: lo === hi ? `${mmss(lo)}/mi` : `${mmss(lo)}–${mmss(hi)}/mi`,
        work: work.length,
        onTarget: work.filter(l => l.onTarget).length,
        fast: work.filter(l => l.pace < lo - 5).length,
        slow: work.filter(l => l.pace > hi + 5).length,
        avgPace: work.length ? Math.round(work.reduce((t, l) => t + l.s, 0) / (work.reduce((t, l) => t + l.m, 0) / MILE)) : null,
        avgHr: work.length && work.every(l => l.hr) ? Math.round(avg(work.map(l => l.hr))) : null,
        laps: marked
    };
}

// ---------- body ----------

/** Last `days` days of HRV (with range), resting HR, sleep hours, readiness -> one row per day. */
export function bodyTrend(health, readiness, today, { days = 56 } = {}) {
    return Array.from({ length: days }, (_, i) => {
        const date = addDays(today, -(days - 1 - i));
        const h = (health || {})[date] || {};
        return {
            date,
            hrv: h.hrv?.avg ?? null, low: h.hrv?.low ?? null, high: h.hrv?.high ?? null,
            rhr: h.rhr ?? null,
            sleep: h.sleep?.asleepMin != null ? Math.round(h.sleep.asleepMin / 6) / 10 : null,
            readiness: (readiness || {})[date]?.score ?? null
        };
    });
}

/** Averages of a body column over the last 7 days vs. the 4 weeks before. */
export function bodySummary(rows, key) {
    const vals = rows.map(r => r[key]);
    const recent = avg(vals.slice(-7).filter(v => v != null));
    const before = avg(vals.slice(-35, -7).filter(v => v != null));
    return { recent: recent == null ? null : round1(recent), before: before == null ? null : round1(before) };
}

// ---------- race prediction ----------

const clockSec = t => { const m = String(t || "").match(/^(\d{1,2}):(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null; };

/** Fitness by day -> [{ date, marathon (seconds), vo2 }] (days with either). */
export function predictionTrend(fitness) {
    return Object.entries(fitness || {}).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, f]) => ({ date, marathon: clockSec(f.marathon), vo2: f.vo2 ?? null }))
        .filter(p => p.marathon != null || p.vo2 != null);
}
export const clock = s => `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(Math.round(s % 60))}`;
