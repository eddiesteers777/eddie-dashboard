/* ==========================================
   Southbound — the athlete's session list and race finder (pure)

   Athlete model, layer 1 (docs/PERFORMANCE_ENGINE_PLAN.md 3.2). Every
   run the athlete did, once, from every source:
     COROS runs (coros-run-history, normalized) — win when a run is in
       both, as everywhere else in the app (js/stravaHistory.js sameRun)
     Strava archive activities (strava-history, compact) — add the runs
       COROS doesn't have, and fill in what COROS lacks on shared runs
       (max HR, climb, elapsed time, fastest efforts, Strava's name)
     the running log (hand-logged runs only; COROS imports are already in)
   each linked to its planned day, with what the athlete told us:
     session-rpe   { sessionId: { rpe: 1-10 | null, skipped?, at } }
     race-results  { sessionId: { status: "race" | "not", … } }
   Nothing here is stored as a new source of truth: the list is rebuilt
   from the sources every time. Only RPE and race answers are new facts.

   Race finder: neither COROS nor Strava's archive marks races, so runs
   are scored on their name, a standard race distance, how fast they were
   for their length (against the runs around them), the plan's race day
   and a weekend-morning start. Candidates are only suggestions; a race
   counts for calibration once the athlete or coach says yes.

   Unit-tested in tests/athleteLedger.test.mjs.
========================================== */

import { sameRun } from "./stravaHistory.js";

export const LEDGER_VERSION = 1;
export const RPE_KEY = "session-rpe";
export const RACES_KEY = "race-results";
export const CANDIDATE_SCORE = 5;

const MILE = 1609.344;

export const RACE_DISTANCES = Object.freeze([
    { key: "mile", label: "Mile", m: 1609.344 },
    { key: "5k", label: "5K", m: 5000 },
    { key: "8k", label: "8K", m: 8000 },
    { key: "10k", label: "10K", m: 10000 },
    { key: "15k", label: "15K", m: 15000 },
    { key: "10mi", label: "10 miles", m: 16093.44 },
    { key: "half", label: "Half marathon", m: 21097.5 },
    { key: "marathon", label: "Marathon", m: 42195 },
    { key: "50k", label: "50K", m: 50000 }
]);

const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(date, n) { const [y, m, d] = date.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); }
const dayShift = (date, n) => addDays(date, n);

// ---------- building the list ----------

/** A normalized COROS run -> a session. */
function fromCoros(r) {
    return {
        id: `c:${r.labelId || `${r.date}|${Math.round(Number(r.distance) || 0)}`}`,
        aliases: [],
        sources: ["coros"],
        date: r.date,
        start: r.startTime || null,
        name: r.name || "Run",
        otherName: "",
        distance: num(r.distance) || 0,
        movingSec: num(r.duration),
        elapsedSec: null,
        avgHr: num(r.avgHr),
        maxHr: null,
        climb: null,
        best: null,
        // Treadmill / indoor runs: the watch's pace isn't trustworthy (js/sessionDose.js leaves it out)
        indoor: /indoor|treadmill/i.test(String(r.sport || "")) || Number(r.sportType) === 101,
        trail: /trail/i.test(String(r.sport || "")) || Number(r.sportType) === 102
    };
}

/** A compact Strava activity (js/stravaHistory.js format) -> a session. */
function fromStrava(a) {
    return {
        id: `s:${a.k}`,
        aliases: [],
        sources: ["strava"],
        date: a.d,
        start: a.t ? new Date(a.t * 1000).toISOString() : null,
        name: a.n || "Run",
        otherName: "",
        distance: num(a.m) || 0,
        movingSec: num(a.s) ?? num(a.e),
        elapsedSec: num(a.e),
        avgHr: num(a.h),
        maxHr: num(a.x),
        climb: Number.isFinite(Number(a.g)) ? Number(a.g) : null,
        best: Array.isArray(a.b) ? a.b : null,
        indoor: false,
        trail: false
    };
}

/** A hand-logged running-log entry (miles, no time) -> a session. */
function fromLog(e) {
    return {
        id: `l:${e.id}`,
        aliases: [],
        sources: ["log"],
        date: e.date,
        start: null,
        name: e.name || e.type || "Logged run",
        otherName: "",
        distance: (Number(e.miles) || 0) * MILE,
        movingSec: null,
        elapsedSec: null,
        avgHr: null,
        maxHr: null,
        climb: null,
        best: null,
        indoor: false,
        trail: false
    };
}

/**
 * Every run once.
 *   corosRuns  normalized COROS runs (js/corosHistory.js runsBetween)
 *   stravaActs { key: compact activity } (js/stravaHistory.js)
 *   runLog     running-log entries
 * -> sessions, oldest first
 */
export function sessionsFrom({ corosRuns = [], stravaActs = {}, runLog = [] } = {}) {
    const sessions = (corosRuns || []).filter(r => r?.date && num(r.distance)).map(fromCoros);
    const byDate = new Map();
    for (const s of sessions) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    const asCoros = s => ({ date: s.date, startTime: s.start, distance: s.distance, duration: s.movingSec });

    for (const a of Object.values(stravaActs || {})) {
        if (a?.y !== "run" || !num(a.m) || !a.d) continue;
        const near = [-1, 0, 1].flatMap(n => byDate.get(dayShift(a.d, n)) || []);
        const match = near.find(s => s.sources[0] === "coros" && sameRun(asCoros(s), a));
        if (match) {
            // COROS keeps the run; Strava fills in what COROS doesn't have.
            match.aliases.push(`s:${a.k}`);
            match.sources.push("strava");
            match.otherName = a.n || "";
            match.maxHr ??= num(a.x);
            match.climb ??= Number.isFinite(Number(a.g)) ? Number(a.g) : null;
            match.elapsedSec ??= num(a.e);
            match.best ??= Array.isArray(a.b) ? a.b : null;
            continue;
        }
        const s = fromStrava(a);
        sessions.push(s);
        if (!byDate.has(s.date)) byDate.set(s.date, []);
        byDate.get(s.date).push(s);
    }

    for (const e of runLog || []) {
        if (!e?.date || !(Number(e.miles) > 0) || e.source === "coros") continue;
        const meters = Number(e.miles) * MILE;
        const dup = (byDate.get(e.date) || []).some(s => Math.abs(s.distance - meters) <= 0.05 * Math.max(s.distance, meters));
        if (dup) continue;
        sessions.push(fromLog(e));
    }

    return sessions.sort((x, y) => String(x.start || `${x.date}T12`).localeCompare(String(y.start || `${y.date}T12`)));
}

/**
 * Links each planned day to the session that day closest to its planned
 * distance (one session per planned day).
 * planDays: [{ date, miles, title, race }]
 */
export function linkPlan(sessions, planDays = []) {
    const byDate = new Map();
    for (const s of sessions) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    for (const day of planDays || []) {
        const miles = Number(day.miles) || 0;
        const same = byDate.get(day.date) || [];
        if (!same.length || (!miles && !day.race)) continue;
        const best = same.slice().sort((a, b) => Math.abs(a.distance / MILE - miles) - Math.abs(b.distance / MILE - miles))[0];
        best.planned = { miles, title: day.title || "", race: Boolean(day.race) };
    }
    return sessions;
}

const lookup = (map, s) => [s.id, ...s.aliases].map(id => map?.[id]).find(Boolean) || null;

/** Adds what the athlete told us (effort, race answers) to each session. */
export function attachAnswers(sessions, { rpe = {}, races = {} } = {}) {
    for (const s of sessions) {
        const r = lookup(rpe, s);
        s.rpe = r && Number.isInteger(r.rpe) ? r.rpe : null;
        s.rpeAnswered = Boolean(r);
        s.race = lookup(races, s);
    }
    return sessions;
}

/** The whole list: sources -> sessions, linked to the plan, with answers. */
export function buildLedger({ corosRuns, stravaActs, runLog, planDays, rpe, races } = {}) {
    return attachAnswers(linkPlan(sessionsFrom({ corosRuns, stravaActs, runLog }), planDays), { rpe, races });
}

// ---------- race finder ----------

/** The standard race distance a run matches (GPS usually reads races a little long), or null. */
export function raceDistance(meters) {
    const m = Number(meters) || 0;
    if (!m) return null;
    const hit = RACE_DISTANCES.find(d => m >= d.m * 0.98 && m <= d.m * 1.04);
    return hit || null;
}

export const RACE_WORDS = /\b(race|5\s?k|8\s?k|10\s?k|15\s?k|half|marathon|parkrun|park run|trot|turkey|championships?|xc|cross country|relay|invitational|classic|dash|run for|memorial|\d+(st|nd|rd|th) annual)\b/i;
export const NOT_WORDS = /\b(workout|tempo|intervals?|easy|recovery|long run|warm ?up|cool ?down|shake ?out|pac(ed|ing)|treadmill|fartlek|strides|reps?|progression|steady)\b/i;
const secondsOf = s => s.elapsedSec || s.movingSec;
const paceOf = s => (secondsOf(s) && s.distance ? secondsOf(s) / s.distance : null);

/**
 * How race-like a session is -> { score, reasons: [plain text], distance }.
 * all = every session (for "fast for its length").
 */
export function raceScore(session, all = []) {
    const reasons = [];
    let score = 0;
    if (!session || session.distance < 1500) return { score: 0, reasons, distance: null };
    const names = [session.name, session.otherName].filter(Boolean).join(" · ");
    const distance = raceDistance(session.distance);

    if (session.planned?.race) { score += 4; reasons.push("Your plan's race day"); }
    const named = [session.name, session.otherName].find(n => n && RACE_WORDS.test(n));
    if (named) { score += 3; reasons.push(`Named "${named}"`); }
    if (names && NOT_WORDS.test(names) && !named) { score -= 3; }
    if (distance) { score += 2; reasons.push(`${distance.label} distance`); }
    else score -= 1;

    const pace = paceOf(session);
    if (pace) {
        const from = addDays(session.date, -180), to = addDays(session.date, 180);
        const around = all.filter(s => s !== session && s.date >= from && s.date <= to && paceOf(s));
        const peers = around.filter(s => s.distance >= session.distance * 0.6 && s.distance <= session.distance * 1.6);
        if (peers.length >= 5) {
            // "Faster" needs a real margin (2%), so a run of ordinary days doesn't look like a race.
            const faster = peers.filter(s => paceOf(s) <= pace * 1.02).length;
            if (faster === 0) { score += 2; reasons.push(`Your fastest of ${peers.length + 1} runs that length within 6 months`); }
            else if (faster / peers.length <= 0.1) { score += 1; reasons.push(`Faster than ${Math.floor((1 - faster / peers.length) * 100)}% of your runs that length within 6 months`); }
        } else if (around.length >= 5) {
            const paces = around.map(paceOf).sort((a, b) => a - b);
            const median = paces[Math.floor(paces.length / 2)];
            const pct = Math.round((1 - pace / median) * 100);
            if (pct >= 15) { score += 1; reasons.push(`${pct}% faster than your usual pace`); }
        }
    }

    if (session.start) {
        const t = new Date(session.start);
        const dow = t.getDay(), hour = t.getHours();
        if ((dow === 0 || dow === 6) && hour >= 5 && hour <= 11) { score += 1; reasons.push("Weekend morning"); }
    }
    return { score, reasons, distance };
}

/** Runs that look like races and haven't been answered yet, newest first. */
export function raceCandidates(sessions, { minScore = CANDIDATE_SCORE } = {}) {
    return sessions
        .filter(s => !s.race)
        .map(s => ({ session: s, ...raceScore(s, sessions) }))
        .filter(c => c.score >= minScore)
        .sort((a, b) => b.session.date.localeCompare(a.session.date));
}

/** Sessions confirmed as races, newest first, with their race record. */
export function confirmedRaces(sessions) {
    return sessions.filter(s => s.race?.status === "race")
        .map(s => ({ session: s, race: s.race }))
        .sort((a, b) => b.session.date.localeCompare(a.session.date));
}

/**
 * The record saved when a run is confirmed as a race.
 * opts: { distanceKey (omit = the standard distance it matches, "" = as measured), officialSec, allOut }; at = now (ms).
 * Watch time is elapsed time when known (closest to chip time).
 */
export function raceRecord(session, { distanceKey, officialSec, allOut = true } = {}, at = Date.now()) {
    // No distance given: the standard one it matches. Given but not a standard key (""): as measured.
    const d = distanceKey === undefined ? raceDistance(session.distance) : RACE_DISTANCES.find(x => x.key === distanceKey) || null;
    const official = num(officialSec);
    return {
        status: "race",
        distanceKey: d?.key || null,
        meters: d ? d.m : Math.round(session.distance),
        timeSec: Math.round(official ?? secondsOf(session) ?? 0) || null,
        official: Boolean(official),
        allOut: allOut !== false,
        date: session.date,
        name: session.otherName || session.name || "",
        at
    };
}

export const notRaceRecord = (at = Date.now()) => ({ status: "not", at });

// ---------- effort after a watch run ----------

/**
 * Watch runs from the last `days` days with no effort answer yet,
 * newest first (at most `max`).
 */
export function effortPrompts(sessions, today, { days = 3, max = 4 } = {}) {
    const from = addDays(today, -(days - 1));
    return sessions
        .filter(s => s.date >= from && s.date <= today && !s.rpeAnswered && s.sources.some(x => x === "coros" || x === "strava"))
        .sort((a, b) => String(b.start || b.date).localeCompare(String(a.start || a.date)))
        .slice(0, max);
}

/** The saved effort answer: rpe 1-10, or null with skipped: true. */
export function effortRecord(rpe, at = Date.now()) {
    const n = Number(rpe);
    return Number.isInteger(n) && n >= 1 && n <= 10 ? { rpe: n, at } : { rpe: null, skipped: true, at };
}

// ---------- small text helpers shared by the views ----------

export const milesText = meters => `${Math.round(meters / MILE * 10) / 10} mi`;
export function clockText(sec) {
    const s = Math.round(Number(sec) || 0);
    if (!s) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
}
export function paceText(sec, meters) {
    if (!sec || !meters) return "";
    const p = Math.round(sec / (meters / MILE));
    return `${Math.floor(p / 60)}:${pad(p % 60)}/mi`;
}
/** "1:24:10", "24:37" or "4:12:03" -> seconds, or null. */
export function parseClock(text) {
    const parts = String(text || "").trim().split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;
    const n = parts.map(Number);
    if (n.slice(1).some(x => x > 59)) return null;
    return parts.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}
