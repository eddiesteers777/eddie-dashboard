import { test } from "node:test";
import assert from "node:assert/strict";
import { weekStartOf, addDays, weekDays, weekCounts } from "../js/scheduleWeek.js";

// Mon Oct 12 2026 .. Sun Oct 18
const slots = [
    { id: "s1", dayOfWeek: 2, startTime: "17:00", endTime: "18:00", sessionType: "soccer", label: "1-on-1", capacity: 1, active: true },
    { id: "s2", dayOfWeek: 4, startTime: "17:30", endTime: "18:30", sessionType: "soccer", label: "U10", capacity: 2, active: true },
    { id: "s3", dayOfWeek: 1, startTime: "06:30", endTime: "07:30", sessionType: "strength", capacity: 1, active: false }
];

test("the week starts on Monday", () => {
    assert.equal(weekStartOf("2026-10-17"), "2026-10-12");
    assert.equal(weekStartOf("2026-10-12"), "2026-10-12");
    assert.equal(weekStartOf("2026-10-18"), "2026-10-12");
    assert.equal(addDays("2026-10-12", 7), "2026-10-19");
});

test("seven days with open times, bookings and asks", () => {
    const requests = [
        { id: "a", status: "approved", slotId: "s1", dates: ["2026-10-13"], clientName: "Sam", startTime: "17:00", endTime: "18:00", sessionType: "soccer" },
        { id: "b", status: "requested", slotId: "s2", dates: ["2026-10-15"], clientName: "Theo", startTime: "17:30", endTime: "18:30", sessionType: "soccer" },
        { id: "c", status: "denied", slotId: "s2", dates: ["2026-10-15"], clientName: "Nope" }
    ];
    const days = weekDays({ weekStart: "2026-10-12", slots, requests });
    assert.equal(days.length, 7);
    assert.deepEqual(days.map(d => d.date)[0], "2026-10-12");
    const tue = days[1];
    // The 1:1 Tuesday time is taken: only the booking shows, no open time.
    assert.deepEqual(tue.items.map(i => i.kind), ["booked"]);
    const thu = days[3];
    assert.deepEqual(thu.items.map(i => i.kind), ["asked", "open"]);
    assert.ok(thu.items.some(i => i.kind === "asked" && i.who === "Theo"));
    // An ask doesn't take a spot, so the shared time is still open for others.
    assert.equal(thu.items.find(i => i.kind === "open").spotsLeft, 2);
    // A paused time never shows; a denied request never shows.
    assert.equal(days[0].items.length, 0);
    assert.ok(!days.flatMap(d => d.items).some(i => i.who === "Nope"));
});

test("a day off hides open times but keeps sessions already booked", () => {
    const requests = [{ id: "a", status: "approved", slotId: "s1", dates: ["2026-10-13"], clientName: "Sam", startTime: "17:00" }];
    const days = weekDays({ weekStart: "2026-10-12", slots, blackoutDates: ["2026-10-13", "2026-10-15"], requests });
    assert.equal(days[1].dayOff, true);
    assert.deepEqual(days[1].items.map(i => i.kind), ["booked"]);
    assert.deepEqual(days[3].items, []);
});

test("a full group time is not offered as open, and counts add up", () => {
    const requests = [
        { id: "a", status: "approved", slotId: "s2", dates: ["2026-10-15"], clientName: "A", startTime: "17:30" },
        { id: "b", status: "approved", slotId: "s2", dates: ["2026-10-15"], clientName: "B", startTime: "17:30" }
    ];
    const days = weekDays({ weekStart: "2026-10-12", slots, requests });
    assert.deepEqual(days[3].items.map(i => i.kind), ["booked", "booked"]);
    assert.deepEqual(weekCounts(days), { booked: 2, asked: 0, open: 1 });
});
