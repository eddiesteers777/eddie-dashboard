/* ==========================================
   Southbound — session plans (pure)

   A practice plan the coach attaches to one session (one open time on one
   date, so a whole group sees it). Stored as sessionPlans/{coachUid}_{key}_{date}
   (js/sessionPlans.js). The doc is readable by every client booked on that
   date, so it holds only what players may see: drill names, times, a bring
   list and a focus line, never private notes. Lines are "time|drill|12 min".
   Unit-tested in tests/sessionPlanModel.test.mjs.
========================================== */

export const MAX_LINES = 12;
export const MODES = ["plan", "focus"];

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// One open time repeated weekly shares a key; a one-off booking uses its own id.
export const planKey = s => clean(s?.slotId || s?.bookingId || s?.requestId || s?.id || "", 60);
export const planId = (coachUid, key, date) => `${coachUid}_${key}_${date}`;
export const planMatches = (plan, s) => Boolean(plan && s && plan.key === planKey(s) && plan.date === s.date);

const clock = (start, minutesIn) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(start || "");
    if (!m) return "";
    const t = Number(m[1]) * 60 + Number(m[2]) + minutesIn;
    const h = Math.floor(t / 60) % 24, mm = t % 60;
    return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// Playbook practice -> lines the players see, timed from the session's own start time.
export function linesFromPractice(practice, drillsById, startTime = "") {
    const out = [];
    let at = 0;
    for (const it of (practice?.items || []).slice(0, MAX_LINES)) {
        const d = drillsById.get ? drillsById.get(it.drillId) : drillsById[it.drillId];
        if (!d) continue;
        const mins = Math.min(120, Math.max(1, Math.round(Number(it.minutes) || d.minutes || 10)));
        out.push([clock(startTime, at), clean(d.name, 60), `${mins} min`].join("|"));
        at += mins;
    }
    return out;
}
export const parseLine = line => {
    const [time = "", name = "", mins = ""] = String(line || "").split("|");
    return { time, name, mins };
};
export const totalMinutes = lines => lines.reduce((a, l) => a + (Number.parseInt(parseLine(l).mins, 10) || 0), 0);

// What gets saved. "focus" mode drops the drill lines so players only see the focus.
export function cleanPlan(input = {}) {
    const mode = MODES.includes(input.mode) ? input.mode : "plan";
    const lines = mode === "plan" ? (Array.isArray(input.lines) ? input.lines : []).slice(0, MAX_LINES).map(l => clean(l, 110)).filter(Boolean) : [];
    const ids = [...new Set((Array.isArray(input.clientUids) ? input.clientUids : []).filter(u => typeof u === "string" && u).map(u => u.slice(0, 40)))].slice(0, 40);
    return {
        key: clean(input.key, 60),
        date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : "",
        startTime: /^\d{1,2}:\d{2}$/.test(input.startTime || "") ? input.startTime : "",
        title: clean(input.title, 80),
        mode,
        focus: clean(input.focus, 200),
        lines,
        bring: clean(input.bring, 200),
        clientUids: ids
    };
}
export const validPlan = p => (!p.key ? "Missing session." : !p.date ? "Missing date." : !p.title ? "Give the plan a name." : !p.lines.length && !p.focus ? "Add a plan or a focus." : "");

// Everything attached to sessions from today on, soonest first.
export const upcoming = (plans, today) => (plans || []).filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)));

// The booked people of one open time on one date, from the coach's week items / sessions.
export function clientsOf(requests, key, date) {
    return [...new Set((requests || []).filter(r => r.status === "approved" && (r.dates || r.allDates || []).includes(date) && planKey({ slotId: r.slotId, bookingId: r.id }) === key).map(r => r.clientUid).filter(Boolean))];
}
