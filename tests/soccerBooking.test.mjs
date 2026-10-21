import { test } from "node:test";
import assert from "node:assert/strict";
import { datedTimes, daySummaries, groupByPart, partOfDay, usualSlot, firstDayWithOpen, matchesKind } from "../js/soccerBooking.js";

// Wed 2026-10-21. 34 weekly times, like the lab mock-up.
const slots = [];
let n = 0;
for (let d = 0; d < 7; d++) for (const h of ["07:00", "09:00", "16:00", "17:00", "18:00"]) slots.push({ id: `s${n++}`, dayOfWeek: d, startTime: h, endTime: "x", sessionType: "soccer", capacity: h === "18:00" && d % 2 ? 8 : 1 });
const today = "2026-10-21";

test("two weeks of dated times, soonest first, today's past times hidden", () => {
    const t = datedTimes({ slots, today, nowHHMM: "16:30" });
    assert.equal(t[0].date, today);
    assert.deepEqual(t.filter(x => x.date === today).map(x => x.slot.startTime), ["17:00", "18:00"]);
    assert.equal(t.length, 5 * 14 - 3);
    for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].date <= t[i].date);
});

test("full, mine and group spots", () => {
    const t = datedTimes({
        slots, today, nowHHMM: "00:00",
        fullDates: { s16: ["2026-10-21"] },
        mine: [{ slotId: "s17", status: "approved", dates: ["2026-10-21"] }, { slotId: "s18", status: "denied", dates: ["2026-10-21"] }],
        bookedCounts: { s19: { "2026-10-21": 3 } }
    });
    const at = (id, date) => t.find(x => x.key === `${id}|${date}`);
    assert.equal(at("s16", today).state, "full");
    assert.equal(at("s17", today).state, "mine");
    assert.equal(at("s18", today).state, "open");
    assert.equal(at("s19", today).left, 5);
    assert.equal(at("s15", today).left, null);
});

test("day strip counts, kinds and grouping", () => {
    const t = datedTimes({ slots, today, nowHHMM: "00:00" });
    const days = daySummaries(t, { today });
    assert.equal(days.length, 14);
    assert.equal(days[0].open, 5);
    assert.equal(daySummaries(t, { today, kind: "group" })[0].open, 1);
    assert.deepEqual(groupByPart(t.filter(x => x.date === today)).map(g => [g.part, g.times.length]), [["Morning", 2], ["Afternoon", 1], ["Evening", 2]]);
    assert.equal(firstDayWithOpen(days), today);
    assert.equal(firstDayWithOpen([{ date: "a", open: 0 }, { date: "b", open: 2 }]), "b");
    assert.equal(partOfDay("11:59"), "Morning");
    assert.equal(partOfDay("12:00"), "Afternoon");
    assert.equal(partOfDay("17:00"), "Evening");
    assert.equal(matchesKind({ slot: { capacity: 6 } }, "solo"), false);
});

test("your usual needs two bookings and a slot still offered", () => {
    const req = (slotId, n, status = "approved") => ({ slotId, status, dates: Array(n).fill("d") });
    assert.equal(usualSlot([req("s1", 1)], slots), null);
    assert.equal(usualSlot([req("s1", 1), req("s1", 1)], slots).slot.id, "s1");
    assert.equal(usualSlot([req("s1", 6), req("s2", 3)], slots).slot.id, "s1");
    assert.equal(usualSlot([req("gone", 9)], slots), null);
    assert.equal(usualSlot([req("s1", 5, "denied")], slots), null);
    assert.equal(usualSlot([req("s1", 5)], [{ id: "s1", active: false }]), null);
});
