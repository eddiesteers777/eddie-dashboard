/* ==========================================
   Southbound — 75-day challenge tracker (pure logic)

   The free tool at 75.html. Everything here is pure (no storage, no DOM),
   unit-tested in tests/seventyFive.test.mjs. The page is js/seventyFivePage.js,
   the account sync is js/seventyFiveCloud.js.

   One state object holds a whole challenge:
     { v, preset, tasks:[{id,name,sub,icon}], start:"YYYY-MM-DD", attempt, strict,
       log:{ "YYYY-MM-DD": { taskId:true } }, history:[{attempt,start,reached}], updatedAt }
   Dates are local calendar days as "YYYY-MM-DD" strings, never Date objects.
========================================== */

export const TOTAL_DAYS = 75;
export const MAX_TASKS = 10;
export const STORE_KEY = "sb-75-state";

// Task icons are the app's drawn habit icons (js/habitIconSet.js); their family picks the
// celebration scene (js/celebrate.js), so a workout lands differently from water.
export const PRESETS = Object.freeze({
    hard: {
        id: "hard",
        label: "75 Hard",
        blurb: "Two 45-minute workouts (one outside), a diet, no alcohol, a gallon of water, 10 pages, a photo.",
        tasks: [
            { name: "Workout 1", sub: "45 min, any kind", icon: "workout" },
            { name: "Workout 2, outdoors", sub: "45 min, rain or shine", icon: "run" },
            { name: "Follow your diet", sub: "No cheat meals, no alcohol", icon: "meals" },
            { name: "Drink a gallon of water", sub: "128 oz", icon: "water" },
            { name: "Read 10 pages", sub: "Non-fiction", icon: "read" },
            { name: "Progress photo", sub: "Take it, keep it", icon: "check" }
        ]
    },
    soft: {
        id: "soft",
        label: "75 Soft",
        blurb: "One workout, eat well, drink only on social occasions, 3 litres of water, 10 pages.",
        tasks: [
            { name: "Workout", sub: "45 min", icon: "workout" },
            { name: "Eat well", sub: "Drink only on social occasions", icon: "meals" },
            { name: "Drink 3 litres of water", sub: "About 100 oz", icon: "water" },
            { name: "Read 10 pages", sub: "Anything you like", icon: "read" }
        ]
    },
    custom: { id: "custom", label: "Write my own", blurb: "Start from a blank list. Up to 10 things.", tasks: [] }
});

// ---- dates -------------------------------------------------------------------
const pad = n => String(n).padStart(2, "0");
export function dateKey(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const toUtc = key => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export function addDays(key, n) {
    const t = new Date(toUtc(key) + n * 86400000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a, b) {
    return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}
const minKey = (a, b) => (a < b ? a : b);
export const validKey = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;

// ---- state -------------------------------------------------------------------
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "task";

export function cleanTasks(list) {
    const seen = new Set();
    const out = [];
    for (const t of Array.isArray(list) ? list : []) {
        const name = String(t?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
        if (!name) continue;
        let id = String(t?.id || slug(name));
        while (seen.has(id)) id += "-2";
        seen.add(id);
        out.push({ id, name, sub: String(t?.sub ?? "").replace(/\s+/g, " ").trim().slice(0, 60), icon: String(t?.icon || "check").slice(0, 24) });
        if (out.length >= MAX_TASKS) break;
    }
    return out;
}

export function newChallenge({ preset = "hard", tasks = null, start, strict = true, now = Date.now() } = {}) {
    const p = PRESETS[preset] || PRESETS.hard;
    const list = cleanTasks(tasks || p.tasks);
    if (!list.length) return null;
    return { v: 1, preset: p.id, tasks: list, start, attempt: 1, strict: strict !== false, log: {}, history: [], updatedAt: now };
}

// Anything that came from storage or the cloud is checked before it is used.
export function sanitize(raw) {
    if (!raw || typeof raw !== "object" || !validKey(raw.start)) return null;
    const tasks = cleanTasks(raw.tasks);
    if (!tasks.length) return null;
    const ids = new Set(tasks.map(t => t.id));
    const log = {};
    for (const [day, marks] of Object.entries(raw.log && typeof raw.log === "object" ? raw.log : {})) {
        if (!validKey(day) || !marks || typeof marks !== "object") continue;
        const kept = Object.fromEntries(Object.entries(marks).filter(([id, v]) => v === true && ids.has(id)));
        if (Object.keys(kept).length) log[day] = kept;
    }
    const history = (Array.isArray(raw.history) ? raw.history : []).slice(-50)
        .filter(h => h && validKey(h.start)).map(h => ({ attempt: Number(h.attempt) || 1, start: h.start, reached: Math.max(0, Math.min(TOTAL_DAYS, Number(h.reached) || 0)) }));
    return {
        v: 1,
        preset: PRESETS[raw.preset] ? raw.preset : "custom",
        tasks, start: raw.start,
        attempt: Math.max(1, Math.floor(Number(raw.attempt)) || 1),
        strict: raw.strict !== false,
        log, history,
        updatedAt: Number(raw.updatedAt) || 0
    };
}

export function hasChallenge(state) {
    return Boolean(state && state.tasks?.length && state.start);
}

// Day 1 is the start date. Before the start it is 0; after day 75 it stays 75 and `over` is true.
export function dayNumber(state, today) {
    const n = daysBetween(state.start, today) + 1;
    return Math.max(0, Math.min(TOTAL_DAYS, n));
}
export const isOver = (state, today) => daysBetween(state.start, today) + 1 > TOTAL_DAYS;

export function doneCount(state, day) {
    const marks = state.log[day] || {};
    return state.tasks.filter(t => marks[t.id]).length;
}
export const isDayComplete = (state, day) => doneCount(state, day) === state.tasks.length;

export function toggleTask(state, day, taskId, now = Date.now()) {
    if (!state.tasks.some(t => t.id === taskId)) return state;
    const marks = { ...(state.log[day] || {}) };
    if (marks[taskId]) delete marks[taskId]; else marks[taskId] = true;
    const log = { ...state.log };
    if (Object.keys(marks).length) log[day] = marks; else delete log[day];
    return { ...state, log, updatedAt: now };
}

// The first earlier day of this attempt that was not finished, or null. Only strict mode asks
// to start over; relaxed mode just shows the gap in the streak.
export function missedDay(state, today) {
    if (!state.strict) return null;
    const last = minKey(addDays(today, -1), addDays(state.start, TOTAL_DAYS - 1));
    for (let d = state.start; d <= last; d = addDays(d, 1)) {
        if (!isDayComplete(state, d)) return d;
    }
    return null;
}

export function restart(state, today, now = Date.now()) {
    const reached = Math.min(TOTAL_DAYS, Math.max(0, countComplete(state, today)));
    return { ...state, start: today, attempt: state.attempt + 1, log: {}, history: [...state.history, { attempt: state.attempt, start: state.start, reached }].slice(-50), updatedAt: now };
}

// "I did it": mark every task done on the missed day.
export function fixDay(state, day, now = Date.now()) {
    const marks = Object.fromEntries(state.tasks.map(t => [t.id, true]));
    return { ...state, log: { ...state.log, [day]: marks }, updatedAt: now };
}

export function countComplete(state, today) {
    const last = minKey(today, addDays(state.start, TOTAL_DAYS - 1));
    let n = 0;
    for (let d = state.start; d <= last; d = addDays(d, 1)) if (isDayComplete(state, d)) n++;
    return n;
}

// Finished days in a row, counting today only when it is already complete.
export function streak(state, today) {
    let d = isDayComplete(state, today) ? today : addDays(today, -1);
    let n = 0;
    while (d >= state.start && n < TOTAL_DAYS && isDayComplete(state, d)) { n++; d = addDays(d, -1); }
    return n;
}

export function summary(state, today) {
    const day = dayNumber(state, today);
    const over = isOver(state, today);
    const complete = over && countComplete(state, today) === TOTAL_DAYS;
    return {
        day, over, complete,
        notStarted: day === 0,
        streak: streak(state, today),
        toGo: over ? 0 : Math.max(0, TOTAL_DAYS - day),
        attempt: state.attempt,
        done: day > 0 && !over ? doneCount(state, today) : 0,
        total: state.tasks.length,
        todayComplete: day > 0 && !over && isDayComplete(state, today)
    };
}

// Which of the 75 ticks are finished, today's, or still ahead. Used by the dial and the share card.
export function tickStates(state, today) {
    const day = dayNumber(state, today);
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
        const key = addDays(state.start, i), n = i + 1;
        if (n === day && !isOver(state, today)) return isDayComplete(state, key) ? "done" : "now";
        if (n < day || isOver(state, today)) return isDayComplete(state, key) ? "done" : "missed";
        return "ahead";
    });
}

// The line under the share image. Plain, no hype.
export function shareLine(state, today) {
    const s = summary(state, today);
    const name = (PRESETS[state.preset]?.label || "75-day challenge");
    if (s.complete) return `${name}: all 75 days done.`;
    if (s.notStarted) return `${name} starts ${state.start}.`;
    const row = s.streak === 1 ? "1 day in a row" : `${s.streak} days in a row`;
    return `${name}, day ${s.day} of 75. ${row}.`;
}

// ---- account sync ------------------------------------------------------------
// One doc, last write wins. At the first link of a device that already has a challenge, and an
// account that has one too, the person chooses; every later sync takes the newer one.
export function resolveSync({ local, remote, linked }) {
    const l = hasChallenge(local) ? local : null, r = hasChallenge(remote) ? remote : null;
    if (!l && !r) return "none";
    if (!l) return "pull";
    if (!r) return "push";
    if (JSON.stringify(l) === JSON.stringify(r)) return "none";
    if (!linked) return "ask";
    if (l.updatedAt === r.updatedAt) return "none";
    return l.updatedAt > r.updatedAt ? "push" : "pull";
}

// A calendar file with one daily reminder that repeats for the 75 days. `hhmm` is "2000" for 8 pm.
// Floating local time, so it follows the phone's own clock. No server, no push.
export function reminderIcs(state, hhmm = "2000") {
    const day = state.start.replace(/-/g, "");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const name = PRESETS[state.preset]?.label || "75-day challenge";
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Southbound//75-day//EN", "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT", `UID:75-${day}-${state.attempt}@southboundcoaching.com`, `DTSTAMP:${stamp}`,
        `DTSTART:${day}T${hhmm}00`, `DTEND:${day}T${hhmm}00`,
        `RRULE:FREQ=DAILY;COUNT=${TOTAL_DAYS}`,
        `SUMMARY:${name}: check off today's list`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${name}: check off today's list`, "TRIGGER:PT0S", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", ""
    ].join("\r\n");
}
