// Strength progress (pure, no DOM, no storage): tests/strengthProgress.test.mjs.
// Reads strength-history ({ exerciseName lower-case: [{ date, mode, name?, bw?, sets: [{ weight lb, reps, duration, type? }] }] },
// newest first) and works out, per exercise: each session's top set, estimated 1-rep max, volume,
// records, and how the last 6 weeks compare with the 6 before.

const DAY = 86400000;
const toMs = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDaysIso = (d, n) => new Date(toMs(d) + n * DAY).toISOString().slice(0, 10);

// Epley, the formula most apps show. Only trusted for 1–12 reps with a real weight.
export function e1rm(weight, reps) {
    const w = Number(weight) || 0;
    const r = Math.round(Number(reps) || 0);
    if (w <= 0 || r < 1 || r > 12) return null;
    return r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10;
}

export function titleCase(key) {
    return String(key || "").replace(/(^|[\s(/-])(\p{Ll})/gu, (m, s, c) => s + c.toUpperCase());
}

const isWarmup = set => set?.type === "warmup";

// One day = one session (two logs on the same day are joined).
export function sessionsOf(entries = []) {
    const byDate = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        if (!entry?.date || !Array.isArray(entry.sets)) continue;
        const day = byDate.get(entry.date) || { date: entry.date, mode: entry.mode === "time" ? "time" : "reps", bw: Boolean(entry.bw), sets: [] };
        day.sets.push(...entry.sets);
        if (entry.bw) day.bw = true;
        byDate.set(entry.date, day);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map(summarizeSession);
}

function summarizeSession(day) {
    const work = day.sets.filter(s => !isWarmup(s));
    const sets = work.length ? work : day.sets;
    if (day.mode === "time") {
        const best = Math.max(0, ...sets.map(s => Number(s.duration) || 0));
        return { date: day.date, mode: "time", sets: sets.length, bestDuration: best, volume: 0, e1rm: null, top: null, reps: 0 };
    }
    let top = null;
    let bestE = null;
    let volume = 0;
    let reps = 0;
    let heaviest = 0;
    let mostReps = 0;
    for (const s of sets) {
        const w = Number(s.weight) || 0;
        const r = Number(s.reps) || 0;
        volume += w * r;
        reps += r;
        heaviest = Math.max(heaviest, w);
        mostReps = Math.max(mostReps, r);
        const e = e1rm(w, r);
        if (e != null && (bestE == null || e > bestE)) { bestE = e; top = { weight: w, reps: r }; }
    }
    if (!top) {
        const s = [...sets].sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0) || (Number(b.reps) || 0) - (Number(a.reps) || 0))[0];
        top = s ? { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 } : null;
    }
    return { date: day.date, mode: "reps", bw: day.bw, sets: sets.length, top, e1rm: bestE, volume: Math.round(volume), reps, heaviest, mostReps };
}

// Each session marked with the records it set against everything before it.
export function withRecords(sessions) {
    let bestE = 0, bestW = 0, bestReps = 0, bestVol = 0, bestDur = 0;
    return sessions.map((s, i) => {
        const first = i === 0;
        const pr = [];
        if (s.mode === "time") {
            if (!first && s.bestDuration > bestDur) pr.push("longest");
            bestDur = Math.max(bestDur, s.bestDuration);
        } else {
            if (!first && s.e1rm != null && s.e1rm > bestE) pr.push("e1rm");
            if (!first && s.heaviest > bestW) pr.push("weight");
            if (!first && !s.heaviest && s.mostReps > bestReps) pr.push("reps");
            if (!first && s.volume > bestVol && s.volume > 0) pr.push("volume");
            bestE = Math.max(bestE, s.e1rm || 0);
            bestW = Math.max(bestW, s.heaviest || 0);
            bestReps = Math.max(bestReps, s.mostReps || 0);
            bestVol = Math.max(bestVol, s.volume || 0);
        }
        return { ...s, pr };
    });
}

const best = (list, f) => list.reduce((m, x) => (f(x) != null && (m == null || f(x) > f(m)) ? x : m), null);

// How the last 6 weeks' best compares with the 6 weeks before (null without a session in both).
export function trendOf(sessions, today, { weeks = 6 } = {}) {
    const cut = addDaysIso(today, -7 * weeks);
    const before = addDaysIso(today, -14 * weeks);
    const recent = sessions.filter(s => s.date > cut && s.date <= today);
    const prior = sessions.filter(s => s.date > before && s.date <= cut);
    if (!recent.length || !prior.length) return null;
    const metric = s => (s.mode === "time" ? s.bestDuration : s.e1rm ?? (s.heaviest ? null : s.mostReps));
    const a = best(prior, metric), b = best(recent, metric);
    if (!a || !b || !metric(a)) return null;
    const pct = Math.round(((metric(b) - metric(a)) / metric(a)) * 1000) / 10;
    return { pct, word: pct >= 2 ? "up" : pct <= -2 ? "down" : "steady", from: metric(a), to: metric(b) };
}

export function exerciseProgress(key, entries, today) {
    const sessions = withRecords(sessionsOf(entries));
    if (!sessions.length) return null;
    const last = sessions[sessions.length - 1];
    const name = (Array.isArray(entries) && entries.find(e => e?.name)?.name) || titleCase(key);
    const mode = last.mode;
    const bw = sessions.some(s => s.bw) || (mode === "reps" && sessions.every(s => !s.heaviest));
    const bestE = best(sessions, s => s.e1rm);
    const bestW = best(sessions, s => (s.heaviest || null));
    const bestR = best(sessions, s => (s.mostReps || null));
    const bestD = best(sessions, s => (s.mode === "time" ? s.bestDuration || null : null));
    const since28 = addDaysIso(today, -28);
    const recentVolume = sessions.filter(s => s.date > since28).reduce((n, s) => n + (s.volume || 0), 0);
    return {
        key, name, mode, bw,
        sessions,
        count: sessions.length,
        first: sessions[0].date,
        last: last.date,
        best: { e1rm: bestE && { value: bestE.e1rm, date: bestE.date, top: bestE.top },
                weight: bestW && { value: bestW.heaviest, date: bestW.date },
                reps: bestR && { value: bestR.mostReps, date: bestR.date },
                duration: bestD && { value: bestD.bestDuration, date: bestD.date } },
        recentVolume,
        prCount: sessions.filter(s => s.pr.length).length,
        trend: trendOf(sessions, today)
    };
}

// Every logged exercise, most recently done first.
export function allProgress(history, today) {
    return Object.entries(history && typeof history === "object" ? history : {})
        .map(([key, entries]) => exerciseProgress(key, entries, today))
        .filter(Boolean)
        .sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
}

// Monday-first weeks of total volume (stored lb × reps) and sessions, oldest first.
export function weeklyVolume(history, today, weeks = 8) {
    const dow = (new Date(toMs(today)).getUTCDay() + 6) % 7;
    const monday = addDaysIso(today, -dow);
    const out = Array.from({ length: weeks }, (_, i) => ({ start: addDaysIso(monday, -7 * (weeks - 1 - i)), volume: 0, days: new Set() }));
    for (const entries of Object.values(history || {})) {
        for (const s of sessionsOf(entries)) {
            const w = out.find(x => s.date >= x.start && s.date < addDaysIso(x.start, 7));
            if (w) { w.volume += s.volume || 0; w.days.add(s.date); }
        }
    }
    return out.map(w => ({ start: w.start, volume: Math.round(w.volume), sessions: w.days.size }));
}

// A client's logged strength sessions on a coach plan (workoutResults with kind "strength":
// { date, status, exercises: [{ name, sets: [{ weight lb, reps }] }] }) in strength-history's shape,
// so the same progress maths reads them. Skipped logs and empty exercises are left out.
export function historyFromResults(results = []) {
    const out = {};
    for (const r of Array.isArray(results) ? results : []) {
        if (r?.kind !== "strength" || r.status === "skipped" || !r.date) continue;
        for (const ex of Array.isArray(r.exercises) ? r.exercises : []) {
            const name = String(ex?.name || "").trim();
            const sets = (Array.isArray(ex?.sets) ? ex.sets : []).filter(s => Number(s?.weight) > 0 || Number(s?.reps) > 0);
            if (!name || !sets.length) continue;
            const key = name.toLowerCase();
            (out[key] = out[key] || []).push({ date: r.date, mode: "reps", name, sets: sets.map(s => ({ weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 })) });
        }
    }
    for (const key of Object.keys(out)) out[key].sort((a, b) => b.date.localeCompare(a.date));
    return out;
}

// The device's own strength-history plus lifts logged elsewhere (a client's coach-plan sessions,
// historyFromResults): an exercise's day that's already in the history isn't added twice.
export function mergeHistories(own = {}, extra = {}) {
    const out = {};
    for (const [key, list] of Object.entries(own || {})) if (Array.isArray(list)) out[key] = list.slice();
    for (const [key, list] of Object.entries(extra || {})) {
        if (!Array.isArray(list)) continue;
        const have = new Set((out[key] || []).map(e => e?.date));
        const add = list.filter(e => e?.date && !have.has(e.date));
        if (!add.length) continue;
        out[key] = [...(out[key] || []), ...add].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }
    return out;
}

// Each lift's most recent session (for the coach's plan builder: "Last time · Oct 6: 175 × 5").
// key (lower-case name) -> { name, date, mode, bw, sets, top, e1rm, best }.
// { before: "YYYY-MM-DD" } leaves out that day and later (a session page shows what came before it).
export function lastLifts(history = {}, { before = null } = {}) {
    const out = {};
    for (const [key, all] of Object.entries(history || {})) {
        const entries = before && Array.isArray(all) ? all.filter(e => e?.date && e.date < before) : all;
        const sessions = sessionsOf(entries);
        const last = sessions[sessions.length - 1];
        if (!last) continue;
        const named = (Array.isArray(entries) ? entries : []).find(e => e?.name)?.name;
        const best = Math.max(0, ...sessions.map(s => s.e1rm || 0)) || null;
        out[key] = { name: named || titleCase(key), date: last.date, mode: last.mode, bw: Boolean(last.bw), sets: last.sets, top: last.top, e1rm: last.e1rm, best, bestDuration: last.bestDuration || 0 };
    }
    return out;
}

// The words for one lift's last session: { when: "Oct 6", what: "175 × 5", sets: 3 }.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function lastLiftWords(lift) {
    if (!lift || (!lift.top && !lift.bestDuration)) return null;
    const [, m, d] = String(lift.date || "").split("-").map(Number);
    const when = m && d ? `${MONTHS[m - 1]} ${d}` : "";
    const num = n => (Math.round(Number(n) * 10) / 10).toLocaleString("en-US");
    let what;
    if (lift.mode === "time") what = `${lift.bestDuration} sec`;
    else if (!lift.top.weight) what = `${lift.top.reps} reps${lift.bw ? " (bodyweight)" : ""}`;
    else what = `${num(lift.top.weight)} × ${lift.top.reps}`;
    return { when, what, sets: lift.sets || 0 };
}

// The records set on one day, one line per lift: what beat everything logged before it.
// [{ key, name, kind, line }] — kind is the headline record (est. 1RM first, then heaviest, reps, hold, volume).
export function recordsOn(history = {}, date) {
    const out = [];
    const num = n => (Math.round(Number(n) * 10) / 10).toLocaleString("en-US");
    for (const [key, all] of Object.entries(history || {})) {
        const entries = (Array.isArray(all) ? all : []).filter(e => e?.date && e.date <= date);
        const sessions = withRecords(sessionsOf(entries));
        const day = sessions[sessions.length - 1];
        if (!day || day.date !== date || !day.pr.length) continue;
        const before = sessions.slice(0, -1);
        const max = f => Math.max(0, ...before.map(f).filter(v => v != null));
        const name = entries.find(e => e?.name)?.name || titleCase(key);
        let kind, line;
        if (day.pr.includes("e1rm")) { kind = "e1rm"; line = `est. 1RM ${num(Math.round(day.e1rm))} lb (best was ${num(Math.round(max(s => s.e1rm)))})`; }
        else if (day.pr.includes("weight")) { kind = "weight"; line = `heaviest yet: ${num(day.heaviest)} lb (was ${num(max(s => s.heaviest))})`; }
        else if (day.pr.includes("reps")) { kind = "reps"; line = `most reps: ${day.mostReps} (was ${max(s => s.mostReps)})`; }
        else if (day.pr.includes("longest")) { kind = "longest"; line = `longest: ${day.bestDuration} sec (was ${max(s => s.bestDuration)})`; }
        else { kind = "volume"; line = `most volume: ${num(day.volume)} lb (was ${num(max(s => s.volume))})`; }
        out.push({ key, name, kind, line });
    }
    const order = ["e1rm", "weight", "reps", "longest", "volume"];
    return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name));
}
