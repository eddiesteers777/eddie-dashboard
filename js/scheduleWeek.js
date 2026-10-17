/* ==========================================
   Southbound — the coach's week on Schedule (pure)

   Turns what the coach already has (weekly open times, days off and
   booking requests) into seven days for the week grid: who is booked,
   who has asked, and which open times still have room. Nothing here is
   stored. Unit-tested in tests/scheduleWeek.test.mjs.
========================================== */

const pad = n => String(n).padStart(2, "0");
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The Monday on or before `iso`.
export function weekStartOf(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(y, m - 1, d);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return isoOf(t);
}

export function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    return isoOf(new Date(y, m - 1, d + n));
}

const byTime = (a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")) || (a.kind === "open") - (b.kind === "open");

/**
 * weekStart: Monday (YYYY-MM-DD). slots: coachAvailability slots.
 * requests: bookingRequests ({ status, dates, slotId, ... }; `dates` has
 * cancelled sessions already removed). Returns 7 days:
 *   { date, dow (0 = Sunday), dayOff, items: [{ kind: "booked" | "asked" | "open", ... }] }
 */
export function weekDays({ weekStart, slots = [], blackoutDates = [], requests = [] } = {}) {
    const off = new Set(blackoutDates);
    const taken = {};   // slotId -> date -> approved count
    for (const r of requests) {
        if (r?.status !== "approved" || !r.slotId) continue;
        for (const date of new Set(r.dates || [])) {
            const s = taken[r.slotId] || (taken[r.slotId] = {});
            s[date] = (s[date] || 0) + 1;
        }
    }
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = addDays(weekStart, i);
        const [y, m, d] = date.split("-").map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        const items = [];
        for (const r of requests) {
            if (!r || (r.status !== "approved" && r.status !== "requested")) continue;
            if (!(r.dates || []).includes(date)) continue;
            items.push({
                kind: r.status === "approved" ? "booked" : "asked", date, startTime: r.startTime, endTime: r.endTime,
                who: r.clientName || "Client", sessionType: r.sessionType, label: r.label || "",
                requestId: r.id, slotId: r.slotId, clientUid: r.clientUid
            });
        }
        if (!off.has(date)) {
            for (const s of slots) {
                if (s.active === false || s.dayOfWeek !== dow) continue;
                const capacity = Math.max(1, Number(s.capacity) || 1);
                const left = capacity - (taken[s.id]?.[date] || 0);
                if (left <= 0) continue;
                items.push({ kind: "open", date, startTime: s.startTime, endTime: s.endTime, sessionType: s.sessionType, label: s.label || "", slotId: s.id, capacity, spotsLeft: left });
            }
        }
        days.push({ date, dow, dayOff: off.has(date), items: items.sort(byTime) });
    }
    return days;
}

// "3 booked · 1 asked · 4 open times", for the line over the grid.
export function weekCounts(days = []) {
    const n = { booked: 0, asked: 0, open: 0 };
    for (const day of days) for (const item of day.items) n[item.kind]++;
    return n;
}
