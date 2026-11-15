/* ==========================================
   Southbound — build a session in parts (pure)

   The session page's Plan tab: a session is a few parts (warm-up,
   technical, game, cool-down), each a drill, minutes and a private coach
   note. Players see the plan through sessionPlans (drill names and times:
   js/sessionPlanModel.js lines "time|Kind · drill|12 min"); the notes are
   saved apart (sessionPlanNotes, coach only), one per line, same order.
   Unit-tested in tests/sessionBuild.test.mjs.
========================================== */

import { MAX_LINES, parseLine, planKey } from "./sessionPlanModel.js";

export const PART_KINDS = ["Warm-up", "Technical", "Game", "Cool-down", "Other"];
export const MAX_NOTE = 300;
const SEP = " · ";
const clean = (v, n) => String(v ?? "").replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const mins = v => Math.min(180, Math.max(0, Math.round(Number.parseInt(v, 10) || 0)));

const clock = (start, minutesIn) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(start || "");
    if (!m) return "";
    const t = Number(m[1]) * 60 + Number(m[2]) + minutesIn;
    const h = Math.floor(t / 60) % 24;
    return `${((h + 11) % 12) + 1}:${String(t % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export const cleanPart = p => ({
    kind: PART_KINDS.includes(p?.kind) ? p.kind : "Other",
    name: clean(p?.name, 60),
    mins: mins(p?.mins),
    note: String(p?.note ?? "").replace(/\r/g, "").trim().slice(0, MAX_NOTE)
});

// Parts with a name, at most MAX_LINES.
export const cleanParts = parts => (Array.isArray(parts) ? parts : []).map(cleanPart).filter(p => p.name).slice(0, MAX_LINES);

// What players see: one line per part, timed from the session's start.
export function linesFromParts(parts, startTime = "") {
    let at = 0;
    return cleanParts(parts).map(p => {
        const line = [clock(startTime, at), p.kind === "Other" ? p.name : `${p.kind}${SEP}${p.name}`, p.mins ? `${p.mins} min` : ""].join("|");
        at += p.mins;
        return line;
    });
}
export const notesFromParts = parts => cleanParts(parts).map(p => p.note);

// A saved plan (+ its private notes) back into parts. Older plans have no kind.
export function partsFromLines(lines = [], notes = []) {
    return (lines || []).slice(0, MAX_LINES).map((line, i) => {
        const { name, mins: m } = parseLine(line);
        const kind = PART_KINDS.find(k => k !== "Other" && name.startsWith(k + SEP));
        return cleanPart({ kind: kind || "Other", name: kind ? name.slice(kind.length + SEP.length) : name, mins: m, note: notes?.[i] || "" });
    }).filter(p => p.name);
}

export const totalMins = parts => cleanParts(parts).reduce((n, p) => n + p.mins, 0);
export function sessionMinutes(startTime, endTime) {
    const t = v => { const m = /^(\d{1,2}):(\d{2})$/.exec(v || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const a = t(startTime), b = t(endTime);
    return a == null || b == null || b <= a ? 0 : b - a;
}

// A fresh session: the four usual parts, empty.
export const blankParts = () => ["Warm-up", "Technical", "Game", "Cool-down"].map(kind => ({ kind, name: "", mins: 0, note: "" }));

// The most recent earlier plan for the same open time (last week's), or null.
export function lastPlanFor(plans = [], key = "", date = "") {
    return (plans || []).filter(p => p && p.key === key && p.date < date && (p.lines || []).length)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

// Booked sessions as one row per open time + date (a group is one row).
export function sessionGroups(sessions = []) {
    const map = new Map();
    for (const s of sessions || []) {
        if (["cancelled", "late-cancel"].includes(s.log?.status)) continue;
        const key = planKey(s);
        const id = `${key}|${s.date}`;
        const g = map.get(id) || { key, date: s.date, startTime: s.startTime, endTime: s.endTime, label: s.label, sessionType: s.sessionType, players: [] };
        g.players.push({ clientUid: s.clientUid, name: s.clientName || "Player", bookingId: s.bookingId });
        map.set(id, g);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)));
}
export const findGroup = (groups, key, date) => (groups || []).find(g => g.key === key && g.date === date) || null;
export const sessionHref = g => `soccer-session.html?key=${encodeURIComponent(g.key)}&date=${encodeURIComponent(g.date)}`;

// ---- Templates: a plan saved to start from again ----
export function cleanTemplate(input = {}) {
    return {
        name: clean(input.name, 60),
        focus: clean(input.focus, 200),
        bring: clean(input.bring, 200),
        parts: cleanParts(input.parts)
    };
}
export const validTemplate = t => (!t.name ? "Give the template a name." : !t.parts.length ? "Add at least one part first." : "");
