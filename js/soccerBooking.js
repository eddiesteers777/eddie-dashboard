/* ==========================================
   Southbound — the soccer client's booking list (pure)

   Turns a coach's weekly open times into dated times for the next two
   weeks, so the page can show a day strip and only one day's times at
   a time (tests/soccerBooking.test.mjs). A time is:
     open  — can be asked for
     full  — no spot left (fullDates, from the coach's availability doc)
     mine  — this client already asked for it or is booked on it
   No data is written here; booking itself is still `requestBooking`.
========================================== */
import { addDays } from "./homeworkModel.js";

export const WINDOW_DAYS = 14;
export const KINDS = [
    { value: "all", label: "All" },
    { value: "solo", label: "1-on-1" },
    { value: "group", label: "Groups" }
];

const minutes = hhmm => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const dayOf = iso => new Date(`${iso}T00:00:00`).getDay();
export const isGroup = slot => (Number(slot?.capacity) || 1) > 1;

// Morning (before noon), Afternoon (before 5 PM), Evening.
export function partOfDay(startTime) {
    const m = minutes(startTime);
    return m < 12 * 60 ? "Morning" : m < 17 * 60 ? "Afternoon" : "Evening";
}

// Every dated time in the next `days` days, soonest first. `nowHHMM` hides
// today's times that have already started. `bookedCounts` (optional, from
// the availability doc) gives a group's spots left.
export function datedTimes({ slots = [], fullDates = {}, mine = [], bookedCounts = {}, today, nowHHMM = "00:00", days = WINDOW_DAYS } = {}) {
    const active = slots.filter(s => s && s.active !== false);
    const mineKeys = new Set();
    for (const r of mine) {
        if (r.status !== "requested" && r.status !== "approved") continue;
        for (const d of r.dates || []) mineKeys.add(`${r.slotId}|${d}`);
    }
    const out = [];
    for (let i = 0; i < days; i++) {
        const date = addDays(today, i);
        const dow = dayOf(date);
        for (const slot of active.filter(s => s.dayOfWeek === dow)) {
            if (i === 0 && minutes(slot.startTime) <= minutes(nowHHMM)) continue;
            const cap = Math.max(1, Number(slot.capacity) || 1);
            const taken = Number(bookedCounts?.[slot.id]?.[date]) || 0;
            const isFull = (fullDates?.[slot.id] || []).includes(date) || taken >= cap;
            const state = mineKeys.has(`${slot.id}|${date}`) ? "mine" : isFull ? "full" : "open";
            out.push({ key: `${slot.id}|${date}`, slot, date, state, left: cap > 1 ? Math.max(0, cap - taken) : null });
        }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.slot.startTime.localeCompare(b.slot.startTime));
}

export const matchesKind = (t, kind) => kind === "group" ? isGroup(t.slot) : kind === "solo" ? !isGroup(t.slot) : true;

// One entry per day in the window, for the strip.
export function daySummaries(times, { today, days = WINDOW_DAYS, kind = "all" } = {}) {
    return Array.from({ length: days }, (_, i) => {
        const date = addDays(today, i);
        const list = times.filter(t => t.date === date && matchesKind(t, kind));
        return { date, open: list.filter(t => t.state === "open").length, mine: list.some(t => t.state === "mine") };
    });
}

// A day's times grouped Morning / Afternoon / Evening (empty groups left out).
export function groupByPart(list) {
    return ["Morning", "Afternoon", "Evening"]
        .map(part => ({ part, times: list.filter(t => partOfDay(t.slot.startTime) === part) }))
        .filter(g => g.times.length);
}

// The day to show first: today if it has something to book, else the
// next day that has, else today.
export function firstDayWithOpen(summaries) {
    return (summaries.find(d => d.open > 0) || summaries[0] || {}).date || "";
}

// "Your usual": the 1-on-1 weekly time this client has booked most
// (needs 2+ bookings, not declined or cancelled) that is still on offer.
export function usualSlot(requests = [], slots = []) {
    const counts = new Map();
    for (const r of requests) {
        if (r.status !== "approved" || !r.slotId) continue;
        counts.set(r.slotId, (counts.get(r.slotId) || 0) + Math.max(1, (r.allDates || r.dates || []).length));
    }
    let best = null;
    for (const slot of slots) {
        const n = counts.get(slot.id) || 0;
        if (slot.active === false || n < 2) continue;
        if (!best || n > best.count) best = { slot, count: n };
    }
    return best;
}
