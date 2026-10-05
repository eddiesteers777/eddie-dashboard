/* ==========================================
   Southbound — the athlete model's shared history (client -> coach)

   Athlete model step 7 (docs/PERFORMANCE_ENGINE_PLAN.md 3.10). A client
   who turns on "Athlete model" sharing in Settings sends their coach a
   compact copy of what the model reads, so the engine can run on the
   coach's side (the Client Hub's Model tab):
     runs      the last 365 days: date, start, distance, moving / elapsed
               time, avg / max HR, climb, indoor / trail, effort 1-10,
               fastest efforts inside the run, a race answer
     health    the last 120 nights: HRV (avg, COROS's range, baseline),
               resting HR, time asleep, sleep score, COROS recovery %,
               marathon prediction, threshold pace
     checkins  the last 120 mornings: soreness / energy / mood 1-5, and
               whether they felt sick or reported pain (never the words)
   Never: GPS, run names or notes (only "looks like a race / a workout"
   from the name), stress, calories, tokens, the private sync document.

   Each list is one string of records ("," between fields, ";" between
   records, "~" inside a field, numbers in base 36), so the Firestore rule
   can check each with one size limit and one character pattern
   (sharedAthleteModel in firestore.rules). The oldest records are
   dropped first if a list would pass its limit.

   encodeShare / decodeShare are pure (tests/athleteShare.test.mjs);
   syncSharedAthleteModel writes or clears the copy for each linked coach.
========================================== */

import { RACE_WORDS, NOT_WORDS, addDays } from "./athleteLedger.js";

export const SHARE_VERSION = 1;
export const SHARE_DAYS = { runs: 365, health: 120, checkins: 120 };
export const SHARE_LIMITS = { runs: 80000, health: 12000, checkins: 6000 };
/** The characters the rule allows in each list (keep in step with firestore.rules). */
export const SHARE_PATTERN = /^[0-9a-z,;~]*$/;

const b36 = v => {
    const n = Number(v);
    return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n).toString(36) : "";
};
const un36 = s => (s ? parseInt(s, 36) : null);
const pos = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** "2026-10-04" <-> days since 1970-01-01. */
export function dayNumber(date) {
    const [y, m, d] = String(date).split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}
export function dateOfDay(n) {
    return new Date(n * 864e5).toISOString().slice(0, 10);
}

const clock = sec => {
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
const clockSec = t => {
    const p = String(t || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!p) return null;
    return p[3] != null ? Number(p[1]) * 3600 + Number(p[2]) * 60 + Number(p[3]) : Number(p[1]) * 60 + Number(p[2]);
};

// ---------- runs ----------

/** "c:4701234" -> "c4701234"; the source letter stays first. */
const shortId = id => {
    const s = String(id || "");
    return (s[0] || "x").toLowerCase().replace(/[^a-z]/g, "x") + s.slice(2).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
};
const longId = s => `${s[0]}:${s.slice(1)}`;

function runFlags(s) {
    const names = [s.name, s.otherName].filter(Boolean);
    return [
        s.indoor ? "i" : "",
        s.trail ? "t" : "",
        names.some(n => RACE_WORDS.test(n)) ? "w" : names.some(n => NOT_WORDS.test(n)) ? "x" : ""
    ].join("");
}

function encodeRun(s) {
    const rpe = Number.isInteger(s.rpe) ? (s.rpe === 10 ? "a" : String(s.rpe)) : s.rpeAnswered ? "s" : "";
    const race = s.race?.status === "race"
        ? ["r", b36(s.race.meters), b36(s.race.timeSec), s.race.allOut === false ? "0" : "1"].join("~")
        : s.race?.status === "not" ? "n" : "";
    const start = s.start ? Math.round(new Date(s.start).getTime() / 60000) : null;
    return [
        shortId(s.id), b36(dayNumber(s.date)), b36(start), b36(s.distance), b36(s.movingSec), b36(s.elapsedSec),
        b36(s.avgHr), b36(s.maxHr), b36(Math.max(0, Number(s.climb) || 0) || (s.climb === 0 ? 0 : null)),
        runFlags(s), rpe, Array.isArray(s.best) ? s.best.map(b36).join("~") : "", race
    ].join(",").replace(/,+$/, "");
}

function decodeRun(rec) {
    const f = rec.split(",");
    if (!f[0] || !f[1]) return null;
    const date = dateOfDay(un36(f[1]));
    const flags = f[9] || "";
    const start = un36(f[2]);
    const rpeCode = f[10] || "";
    const best = f[11] ? f[11].split("~").map(v => un36(v)) : null;
    const r = (f[12] || "").split("~");
    const race = r[0] === "r"
        ? { status: "race", meters: un36(r[1]), timeSec: un36(r[2]), allOut: r[3] !== "0", date, name: "" }
        : r[0] === "n" ? { status: "not" } : null;
    return {
        id: longId(f[0]), aliases: [], sources: [{ c: "coros", s: "strava", l: "log" }[f[0][0]] || "shared"],
        date, start: start ? new Date(start * 60000).toISOString() : null,
        name: flags.includes("w") ? "Race" : flags.includes("x") ? "Workout" : "Run", otherName: "",
        distance: un36(f[3]) || 0, movingSec: un36(f[4]), elapsedSec: un36(f[5]),
        avgHr: un36(f[6]), maxHr: un36(f[7]), climb: f[8] ? un36(f[8]) : null,
        best: best && best.some(Boolean) ? best : null,
        indoor: flags.includes("i"), trail: flags.includes("t"),
        rpe: rpeCode && rpeCode !== "s" ? (rpeCode === "a" ? 10 : Number(rpeCode)) : null,
        rpeAnswered: Boolean(rpeCode),
        race
    };
}

// ---------- health (COROS sleep / HRV / resting HR + daily fitness) ----------

function encodeNight(date, h = {}, f = {}) {
    const fields = [
        b36(dayNumber(date)), b36(pos(h.hrv?.avg)), b36(pos(h.hrv?.low)), b36(pos(h.hrv?.high)), b36(pos(h.hrv?.baseline)),
        b36(pos(h.rhr)), b36(pos(h.sleep?.asleepMin)), b36(pos(h.sleep?.score)),
        b36(pos(f.recovery?.percent)), b36(clockSec(f.marathon)), b36(clockSec(f.threshold))
    ];
    return fields.slice(1).some(Boolean) ? fields.join(",").replace(/,+$/, "") : null;
}

function decodeNight(rec, health, fitness) {
    const f = rec.split(",").map(v => (v ? un36(v) : null));
    if (f[0] == null) return;
    const date = dateOfDay(f[0]);
    const h = {};
    if (f[1]) h.hrv = { avg: f[1], low: f[2], high: f[3], baseline: f[4] };
    if (f[5]) h.rhr = f[5];
    if (f[6] || f[7]) h.sleep = { asleepMin: f[6], score: f[7] };
    if (Object.keys(h).length) health[date] = h;
    const fit = {};
    if (f[8]) fit.recovery = { percent: f[8] };
    if (f[9]) fit.marathon = clock(f[9]);
    if (f[10]) fit.threshold = clock(f[10]);
    if (Object.keys(fit).length) fitness[date] = fit;
}

// ---------- morning check-ins ----------

const score5 = v => (Number.isInteger(Number(v)) && v >= 1 && v <= 5 ? String(v) : "");

function encodeMorning(date, c = {}) {
    const flags = (c.sick ? "s" : "") + (c.pain ? "p" : "");
    const fields = [score5(c.soreness), score5(c.energy), score5(c.mood), flags];
    return fields.some(Boolean) ? [b36(dayNumber(date)), ...fields].join(",").replace(/,+$/, "") : null;
}

function decodeMorning(rec, out) {
    const [d, soreness, energy, mood, flags = ""] = rec.split(",");
    if (!d) return;
    out[dateOfDay(un36(d))] = {
        soreness: Number(soreness) || null, energy: Number(energy) || null, mood: Number(mood) || null,
        sick: flags.includes("s"), pain: flags.includes("p") ? "reported in the morning check-in" : ""
    };
}

/** Joins records newest first until the limit, then puts them back oldest first. */
function fit(records, limit) {
    const kept = [];
    let size = 0;
    for (let i = records.length - 1; i >= 0; i--) {
        const add = records[i].length + (kept.length ? 1 : 0);
        if (size + add > limit) break;
        kept.push(records[i]);
        size += add;
    }
    return kept.reverse().join(";");
}

/**
 * What the client shares, as of `today`:
 *   sessions  the athlete's sessions (js/athleteLedger.js), with answers
 *   health    coros-health-history, fitness coros-fitness-history
 *   checkins  readiness-checkins
 * -> { version, through, runs, health, checkins } (strings within SHARE_LIMITS)
 */
export function encodeShare({ sessions = [], health = {}, fitness = {}, checkins = {} } = {}, today) {
    const from = d => addDays(today, -(SHARE_DAYS[d] - 1));
    const runs = sessions.filter(s => s?.date >= from("runs") && s.date <= today && s.distance > 0)
        .sort((a, b) => a.date.localeCompare(b.date)).map(encodeRun);
    const nights = [...new Set([...Object.keys(health || {}), ...Object.keys(fitness || {})])]
        .filter(d => d >= from("health") && d <= today).sort()
        .map(d => encodeNight(d, health[d], fitness[d])).filter(Boolean);
    const mornings = Object.keys(checkins || {}).filter(d => d >= from("checkins") && d <= today).sort()
        .map(d => encodeMorning(d, checkins[d])).filter(Boolean);
    return {
        version: SHARE_VERSION,
        through: today,
        runs: fit(runs, SHARE_LIMITS.runs),
        health: fit(nights, SHARE_LIMITS.health),
        checkins: fit(mornings, SHARE_LIMITS.checkins)
    };
}

/** The shared copy -> { sessions, health, fitness, checkins, through } in the engines' own shapes. */
export function decodeShare(doc) {
    const out = { sessions: [], health: {}, fitness: {}, checkins: {}, through: doc?.through || null };
    if (!doc) return out;
    const list = s => (typeof s === "string" && s ? s.split(";") : []);
    out.sessions = list(doc.runs).map(decodeRun).filter(Boolean);
    list(doc.health).forEach(r => decodeNight(r, out.health, out.fitness));
    list(doc.checkins).forEach(r => decodeMorning(r, out.checkins));
    return out;
}

// ---------- efforts given when logging a coach-plan run ----------

/** The client's coach-plan copies ("coach-plans") -> [{ date, miles, rpe }] for logged runs with an effort. */
export function effortsFromCoachPlans(plans = []) {
    const out = [];
    for (const p of plans || []) {
        for (const week of p?.generatedPlan?.weeks || []) {
            for (const day of week.days || []) {
                const rpe = Number(day?.rpe);
                if (day?.date && Number.isInteger(rpe) && rpe >= 1 && rpe <= 10) {
                    out.push({ date: day.date, rpe, miles: Number(day.actualDistance) || Number(day.miles) || 0 });
                }
            }
        }
    }
    return out;
}

/** Logged plan workouts (workoutResults, the coach can read them) -> [{ date, miles, rpe }]. */
export function effortsFromResults(results = []) {
    return (results || []).filter(r => r?.kind !== "strength" && r?.status === "completed" && Number.isInteger(Number(r.rpe)) && r.rpe >= 1 && r.rpe <= 10 && r.date)
        .map(r => ({ date: r.date, rpe: Number(r.rpe), miles: Number(r.distance) || Number(r.plannedMiles) || 0 }));
}

/**
 * Gives a watch run the effort the athlete already gave when logging that
 * day's plan workout, so they're never asked twice. The run on that date
 * closest to the logged miles takes it; answered runs keep their own.
 */
export function fillPlanEfforts(sessions = [], efforts = []) {
    for (const e of efforts) {
        const open = sessions.filter(s => s.date === e.date && !s.rpeAnswered);
        if (!open.length) continue;
        const best = open.sort((a, b) => Math.abs(a.distance / 1609.344 - e.miles) - Math.abs(b.distance / 1609.344 - e.miles))[0];
        best.rpe = e.rpe;
        best.rpeAnswered = true;
        best.rpeFrom = "plan";
    }
    return sessions;
}

// ---------- writing it for each coach ----------

const SYNC_AT_KEY = "sb-athlete-share-at";   // device-only: when this device last sent it
const SHARING_KEY = "sb-athlete-sharing";    // device-only: "on" when any coach gets it (Today's effort prompt)
const SYNC_EVERY_MS = 6 * 3600e3;

/** Does this client share the athlete model with a coach? (the device's last answer) */
export function sharesAthleteModel() {
    try { return localStorage.getItem(SHARING_KEY) === "on"; } catch { return false; }
}

/**
 * Writes the shared copy for every linked coach the client has said yes
 * to, and clears it for the others. At most every 6 hours unless forced
 * (Settings, a new effort answer).
 */
export async function syncSharedAthleteModel({ force = false } = {}) {
    try {
        if (!force && Date.now() - Number(localStorage.getItem(SYNC_AT_KEY) || 0) < SYNC_EVERY_MS) return null;
    } catch { /* storage blocked: go ahead */ }
    const { listMyWearableShares, writeSharedAthleteModel, deleteSharedAthleteModel } = await import("./coachAccess.js");
    const shares = await listMyWearableShares();
    const allowed = shares.filter(({ share }) => share?.status === "active" && share?.permissions?.model === true);
    let payload = null;
    if (allowed.length) {
        const { loadLedger } = await import("./athleteData.js");
        const { HEALTH_KEY } = await import("./corosHealth.js");
        const { FITNESS_KEY, isoDate } = await import("./corosHistory.js");
        const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null") || {}; } catch { return {}; } };
        const today = isoDate(new Date());
        const { loadCoachPlans } = await import("./coachPlanStore.js");
        payload = encodeShare({
            sessions: fillPlanEfforts(await loadLedger(today, { plan: false }), effortsFromCoachPlans(loadCoachPlans())),
            health: read(HEALTH_KEY), fitness: read(FITNESS_KEY), checkins: read("readiness-checkins")
        }, today);
    }
    const results = await Promise.allSettled(shares.map(async ({ link, share }) => {
        if (share?.status === "active" && share?.permissions?.model === true) {
            await writeSharedAthleteModel(link.coachUid, payload);
            return "shared";
        }
        await deleteSharedAthleteModel(link.coachUid, link.clientUid);
        return "cleared";
    }));
    results.forEach(r => { if (r.status === "rejected") console.warn("Southbound: shared athlete model update failed.", r.reason?.code || r.reason); });
    const shared = results.filter(r => r.status === "fulfilled" && r.value === "shared").length;
    try {
        localStorage.setItem(SHARING_KEY, allowed.length ? "on" : "off");
        if (results.every(r => r.status === "fulfilled")) localStorage.setItem(SYNC_AT_KEY, String(Date.now()));
    } catch { /* fine */ }
    window.dispatchEvent?.(new CustomEvent("sb:athlete-share", { detail: { sharing: allowed.length > 0 } }));
    return { shared, cleared: results.filter(r => r.status === "fulfilled" && r.value === "cleared").length };
}
