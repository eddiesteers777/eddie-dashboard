// Day 1 baseline (pure). Two tests, each player's own result only: no ranking, no pass/fail,
// no standards. Results stay on this device (KEYS.baseline is not in SYNC_KEYS).
//
// Beep test = the widely published 20 m multistage shuttle protocol (Leger): start 8.5 km/h, +0.5
// km/h each level, a level lasts about a minute. The page makes its own beeps; no recording is used.
// Shuttles per level follow the common published table (7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12 ...):
// level 1 is 7 shuttles, every later level runs until it has passed 60 seconds.

export const LINE_M = 20;
export const START_KMH = 8.5;
export const STEP_KMH = 0.5;
export const MAX_LEVEL = 21;

export const levelSpeed = level => START_KMH + STEP_KMH * (level - 1);
export const shuttleSeconds = level => LINE_M / (levelSpeed(level) / 3.6);

export function shuttlesInLevel(level) {
    if (level <= 1) return 7;
    return Math.floor(60 / shuttleSeconds(level) + 1e-9) + 1;
}

// Every beep after the start signal: { level, shuttle, at (seconds from start), last (ends its level) }.
export function schedule(maxLevel = MAX_LEVEL) {
    const out = [];
    let at = 0;
    for (let level = 1; level <= maxLevel; level++) {
        const n = shuttlesInLevel(level), t = shuttleSeconds(level);
        for (let s = 1; s <= n; s++) { at += t; out.push({ level, shuttle: s, at, last: s === n }); }
    }
    return out;
}

// Where the group is `seconds` after the start: the shuttle being run now.
export function positionAt(seconds, sched = schedule()) {
    if (seconds < 0) return { level: 1, shuttle: 1, done: false };
    const i = sched.findIndex(b => b.at > seconds);
    if (i < 0) { const l = sched[sched.length - 1]; return { level: l.level, shuttle: l.shuttle, done: true }; }
    return { level: sched[i].level, shuttle: sched[i].shuttle, done: false };
}

// "Level.Shuttle", e.g. 7.4. Reached = the last shuttle the player completed.
export const scoreText = (level, shuttle) => `${level}.${shuttle}`;
// The last completed shuttle when stopped while running position `pos` (they did not finish it).
export function completed(pos) {
    if (pos.shuttle > 1) return { level: pos.level, shuttle: pos.shuttle - 1 };
    if (pos.level > 1) return { level: pos.level - 1, shuttle: shuttlesInLevel(pos.level - 1) };
    return { level: 0, shuttle: 0 };
}

// ---- 1 mile: time as m:ss, and whether they ran it without stopping ----
export function parseClock(text) {
    const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(String(text || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const clockText = sec => Number.isFinite(sec) && sec >= 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "";

// ---- stored results: one entry per player and day ----
const cleanName = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, 40);
export function setResult(list, { name, date, test, value }) {
    const n = cleanName(name);
    if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !["mile", "beep"].includes(test)) return list;
    const key = x => x.name.toLowerCase() === n.toLowerCase() && x.date === date;
    const row = list.find(key) || { name: n, date };
    const next = { ...row };
    if (test === "mile") {
        const sec = Number(value?.seconds);
        next.mile = { seconds: Number.isFinite(sec) && sec > 0 && sec <= 3600 ? Math.round(sec) : null, nonstop: !!value?.nonstop };
    } else {
        const level = Math.round(Number(value?.level)), shuttle = Math.round(Number(value?.shuttle));
        next.beep = { level: level >= 0 && level <= MAX_LEVEL ? level : 0, shuttle: shuttle >= 0 && shuttle <= 30 ? shuttle : 0 };
    }
    return [...list.filter(x => !key(x)), next].slice(-400);
}
export const removeResult = (list, name, date) => list.filter(x => !(x.name.toLowerCase() === String(name).toLowerCase() && x.date === date));
export const serialize = list => JSON.stringify({ app: "playbook-baseline", v: 1, results: list });
export function parse(text) {
    try {
        const o = JSON.parse(text);
        if (!o || o.app !== "playbook-baseline" || !Array.isArray(o.results)) return [];
        return o.results.filter(r => r && cleanName(r.name) && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "")).slice(-400);
    } catch { return []; }
}

// ---- 1 mile run mode: one shared stopwatch, tap a name when they finish, tap "walked" to mark/unmark ----
// State: { startedAt (ms), date, finished: { name: seconds }, walked: [names] }. Kept so a reload
// mid-run loses nothing.
export const newMile = (now, date) => ({ startedAt: now, date, finished: {}, walked: [], names: [] });
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();
const findKey = (obj, name) => Object.keys(obj).find(k => sameName(k, name));
export const elapsedSec = (m, now) => Math.max(0, Math.round((now - m.startedAt) / 1000));
export function finishMile(m, name, now) {
    const n = cleanName(name);
    if (!m || !n || findKey(m.finished, n)) return m;
    return { ...m, finished: { ...m.finished, [n]: elapsedSec(m, now) } };
}
export function undoFinish(m, name) {
    const k = findKey(m.finished, name);
    if (!k) return m;
    const { [k]: _gone, ...rest } = m.finished;
    return { ...m, finished: rest };
}
export function toggleWalked(m, name) {
    const n = cleanName(name);
    if (!n) return m;
    const has = m.walked.some(w => sameName(w, n));
    return { ...m, walked: has ? m.walked.filter(w => !sameName(w, n)) : [...m.walked, n] };
}
export const hasWalked = (m, name) => m.walked.some(w => sameName(w, name));
export const serializeMile = m => JSON.stringify({ app: "playbook-mile", v: 1, ...m });
export function parseMile(text) {
    try {
        const o = JSON.parse(text);
        if (!o || o.app !== "playbook-mile" || !Number.isFinite(o.startedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(o.date || "")) return null;
        const finished = {};
        for (const [k, v] of Object.entries(o.finished || {})) if (cleanName(k) && Number.isFinite(v) && v > 0 && v <= 3600) finished[cleanName(k)] = Math.round(v);
        return { startedAt: o.startedAt, date: o.date, finished, walked: (Array.isArray(o.walked) ? o.walked : []).map(cleanName).filter(Boolean).slice(0, 80), names: (Array.isArray(o.names) ? o.names : []).map(cleanName).filter(Boolean).slice(0, 80) };
    } catch { return null; }
}
export function addName(m, name) {
    const n = cleanName(name);
    return n && !m.names.some(x => sameName(x, n)) ? { ...m, names: [...m.names, n] } : m;
}
// Remove one test from a player's day without touching the other test.
export function clearTest(list, name, date, test) {
    return list.map(x => (x.name.toLowerCase() === String(name).toLowerCase() && x.date === date ? (({ [test]: _gone, ...rest }) => rest)(x) : x))
        .filter(x => x.mile || x.beep);
}
