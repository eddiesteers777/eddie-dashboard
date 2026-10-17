/* ==========================================
   Southbound — Which session dates are taken

   Pure logic (tests/slotBookings.test.mjs). A coach's weekly slot
   holds `capacity` people (1 = 1:1). Every approved booking takes a
   spot on each of its dates. The coach's side keeps a summary on the
   availability doc: `bookedCounts` (slot -> date -> approved count,
   so approvals can be checked in one transaction) and `fullDates`
   (slot -> dates with no spot left). Clients read `fullDates` to hide
   taken dates, and firestore.rules refuses a request for one.
========================================== */

// Builds `count` date strings (YYYY-MM-DD), one per week, starting
// from the first occurrence of `dayOfWeek` on or after `fromDate`.
export function generateWeeklyDates(fromDate, dayOfWeek, count) {
    const start = new Date(`${fromDate}T00:00:00`);
    const offset = (dayOfWeek - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + offset);

    const dates = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i * 7);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${day}`);
    }
    return dates;
}

// slotId -> { date: approved count }, dates from `today` on only.
// `dates` are the dates still on (js/sessionModel.js attachLogs drops
// a date the coach cancelled), so a cancelled session frees its spot.
export function bookedCounts(requests, today) {
    const counts = {};
    for (const r of requests || []) {
        if (r?.status !== "approved" || !r.slotId) continue;
        for (const date of new Set(r.dates || [])) {
            if (date < today) continue;
            const slot = counts[r.slotId] || (counts[r.slotId] = {});
            slot[date] = (slot[date] || 0) + 1;
        }
    }
    return counts;
}

const capacityOf = slot => Math.max(1, Number(slot?.capacity) || 1);

// slotId -> sorted dates with no spot left. A slot that's been removed
// counts as 1:1, so nothing is ever double-booked by accident.
export function fullDatesBySlot(counts, slots) {
    const byId = new Map((slots || []).map(s => [s.id, s]));
    const full = {};
    for (const [slotId, dates] of Object.entries(counts || {})) {
        const cap = capacityOf(byId.get(slotId));
        const list = Object.keys(dates).filter(d => dates[d] >= cap).sort();
        if (list.length) full[slotId] = list;
    }
    return full;
}

// Both fields for the availability doc, with keys in a fixed order so
// an unchanged summary compares equal and isn't rewritten.
export function slotBookingFields(requests, slots, today) {
    const counts = bookedCounts(requests, today);
    const sorted = {};
    for (const slotId of Object.keys(counts).sort()) {
        sorted[slotId] = {};
        for (const date of Object.keys(counts[slotId]).sort()) sorted[slotId][date] = counts[slotId][date];
    }
    return { bookedCounts: sorted, fullDates: fullDatesBySlot(sorted, slots) };
}

// Which of `dates` a client can't ask for on this slot: full, or one
// they've already asked for (waiting or approved).
export function takenDates(slot, dates, fullDates = {}, myRequests = []) {
    const taken = new Set(fullDates?.[slot.id] || []);
    for (const r of myRequests) {
        if (r.slotId === slot.id && (r.status === "requested" || r.status === "approved")) {
            for (const d of r.dates || []) taken.add(d);
        }
    }
    return dates.filter(d => taken.has(d));
}

// The first date on or after `fromDate` this slot can still be asked
// for, looking a year ahead; null when every week is taken.
export function nextOpenDate(slot, fromDate, fullDates = {}, myRequests = []) {
    const dates = generateWeeklyDates(fromDate, slot.dayOfWeek, 52);
    const taken = new Set(takenDates(slot, dates, fullDates, myRequests));
    return dates.find(d => !taken.has(d)) || null;
}
