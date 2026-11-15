import test from "node:test";
import assert from "node:assert/strict";
import { clientWeek, clientWeekLine } from "../js/soccerWeek.js";
import { monthDays, addMonths } from "../js/scheduleWeek.js";

const req = { id: "r1", status: "approved", slotId: "s1", startTime: "09:00", endTime: "10:00", sessionType: "soccer", clientUid: "c", dates: ["2026-11-21"], allDates: ["2026-11-21"] };

test("clientWeek puts a session and homework on the right days", () => {
    const days = clientWeek({
        requests: [req], today: "2026-11-16",
        homework: [
            { id: "h1", title: "Wall passes", cadence: "daily", logs: [{ date: "2026-11-17" }] },
            { id: "h2", title: "Scanning", cadence: "weekly", dueDate: "2026-11-20", logs: [] },
            { id: "h3", title: "Old", cadence: "daily", status: "archived", logs: [] }
        ]
    });
    assert.equal(days.length, 7);
    assert.equal(days[0].date, "2026-11-16");
    assert.equal(days[5].sessions.length, 1);
    assert.equal(days[1].homework.find(h => h.id === "h1").done, true);
    assert.deepEqual(days[4].homework.map(h => h.id).sort(), ["h1", "h2"]);
    assert.ok(days.every(d => !d.homework.some(h => h.id === "h3")));
    assert.equal(clientWeekLine(days, "2026-11-16"), "1 session · 7 practices to do");
});

test("cancelled sessions stay off the strip", () => {
    const days = clientWeek({ requests: [{ ...req, logs: { "2026-11-21": { status: "cancelled" } } }], today: "2026-11-16" });
    assert.equal(days[5].sessions.length, 0);
});

test("monthDays covers whole Monday-first weeks and counts", () => {
    const cells = monthDays({ month: "2026-11", slots: [{ id: "s1", dayOfWeek: 6, startTime: "09:00", endTime: "10:00", capacity: 2, sessionType: "soccer" }], requests: [req] });
    assert.equal(cells.length % 7, 0);
    assert.equal(cells[0].date, "2026-10-26");
    assert.equal(cells[0].inMonth, false);
    const sat21 = cells.find(c => c.date === "2026-11-21");
    assert.equal(sat21.booked, 1);
    assert.equal(sat21.open, 1);
    assert.equal(cells.find(c => c.date === "2026-11-28").open, 1);
    assert.equal(cells.at(-1).date, "2026-12-06");
});

test("addMonths rolls the year", () => {
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("clientWeekLine says caught up when everything is logged", () => {
    const days = clientWeek({ requests: [], today: "2026-11-16", homework: [{ id: "h", title: "x", cadence: "weekly", dueDate: "2026-11-18", logs: [{ date: "2026-11-18" }] }] });
    assert.equal(clientWeekLine(days, "2026-11-19"), "All caught up this week");
});
