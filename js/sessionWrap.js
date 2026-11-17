/* ==========================================
   Southbound — wrap up a session (pure)

   After a session the coach ticks who came, marks each part of the plan
   Done or Skipped (with a word on how it went), writes one group summary
   and, if they like, a line per player. Sending writes the existing
   per-player session log (js/sessionLogs.js), so the player already sees
   it as their session report, and attendance and packages keep working.
   The working copy is coach-only (sessionWraps). Unit-tested in
   tests/sessionWrap.test.mjs.
========================================== */

export const MAX_SUMMARY = 700;
export const MAX_LINE = 200;
export const MAX_HOW = 200;
const text = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

// Parts to wrap up come from the saved plan; earlier wrap-up answers stay by position and name.
export function wrapParts(planParts = [], saved = []) {
    return (planParts || []).map((p, i) => {
        const before = saved?.[i] && saved[i].name === p.name ? saved[i] : null;
        return { name: p.name, kind: p.kind, mins: p.mins || 0, status: before?.status === "skipped" ? "skipped" : "done", how: text(before?.how, MAX_HOW) };
    });
}

export function cleanWrap(input = {}, players = []) {
    const known = new Set((players || []).map(p => p.clientUid));
    const missed = [...new Set((input.missed || []).filter(u => known.has(u)))];
    const lines = {};
    for (const [uid, line] of Object.entries(input.lines || {})) {
        const t = text(line, MAX_LINE);
        if (known.has(uid) && t) lines[uid] = t;
    }
    // Carried only with a line to carry.
    const carry = [...new Set((input.carry || []).filter(u => known.has(u) && lines[u] && !missed.includes(u)))];
    return {
        missed,
        carry,
        parts: (input.parts || []).slice(0, 12).map(p => ({
            name: text(p.name, 60), kind: text(p.kind, 12) || "Other", mins: Math.min(180, Math.max(0, Number(p.mins) || 0)),
            status: p.status === "skipped" ? "skipped" : "done", how: text(p.how, MAX_HOW)
        })).filter(p => p.name),
        summary: text(input.summary, MAX_SUMMARY),
        lines
    };
}

// What a player reads: the summary, then their own line.
export const wordsFor = (wrap, uid) => [wrap.summary, wrap.lines?.[uid] ? `For you: ${wrap.lines[uid]}` : ""].filter(Boolean).join("\n\n").slice(0, 1000);

// One session log per booked player.
export function logsFor({ group, wrap, focus = "" }) {
    const done = (wrap.parts || []).filter(p => p.status === "done");
    return (group.players || []).map(p => {
        const missed = (wrap.missed || []).includes(p.clientUid);
        return missed
            ? { clientUid: p.clientUid, bookingId: p.bookingId, date: group.date, status: "no-show", workedOn: "", nextTime: "", focus: "", drills: [] }
            : {
                clientUid: p.clientUid, bookingId: p.bookingId, date: group.date, status: "completed",
                workedOn: wordsFor(wrap, p.clientUid), nextTime: "", focus: text(focus, 100),
                drills: done.map(d => ({ name: d.name, result: d.mins ? `${d.mins} min` : "" }))
            };
    });
}

export function canWrap(date, today) { return Boolean(date) && date <= today; }
export const hasWords = wrap => Boolean(wrap.summary || Object.keys(wrap.lines || {}).length || (wrap.parts || []).some(p => p.how));

// The email body for one player: no private notes, only what they would read in the app.
export function emailText(wrap, uid, focus = "") {
    return [focus ? `Focus: ${focus}` : "", wordsFor(wrap, uid)].filter(Boolean).join("\n\n");
}

// ---- Group into 1-on-1: lines the coach marked "carry to their next 1-on-1" ----

export const CARRY_DAYS = 21;
const addDaysIso = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };

// wraps: the coach's saved wrap-ups. Newest carried line per player, from before `beforeDate`
// and within CARRY_DAYS of it.
export function carryNotes(wraps = [], playerUids = [], beforeDate = "") {
    const want = new Set(playerUids);
    const from = addDaysIso(beforeDate, -CARRY_DAYS);
    const best = new Map();
    for (const w of wraps || []) {
        if (!w?.date || !(w.date < beforeDate) || w.date < from) continue;
        for (const uid of w.carry || []) {
            const line = w.lines?.[uid];
            if (!want.has(uid) || !line) continue;
            const had = best.get(uid);
            if (!had || w.date > had.date) best.set(uid, { uid, date: w.date, key: w.key, line, summary: w.summary || "" });
        }
    }
    return [...best.values()].sort((a, b) => b.date.localeCompare(a.date));
}

// The plan part a carried line becomes. The name is what players see; the line stays a private note.
export const carryPart = note => ({ kind: "Other", name: "Carry-over from group", mins: 0, note: String(note.line || "").slice(0, 300) });
