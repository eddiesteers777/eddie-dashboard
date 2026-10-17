import { test } from "node:test";
import assert from "node:assert/strict";
import { bookedCounts, fullDatesBySlot, slotBookingFields, takenDates, nextOpenDate } from "../js/slotBookings.js";

const TODAY = "2026-10-17"; // a Saturday
const oneOnOne = { id: "s1", dayOfWeek: 2, capacity: 1, active: true };   // Tuesdays, 1:1
const group = { id: "g1", dayOfWeek: 4, capacity: 3, active: true };      // Thursdays, 3 spots
const req = (id, status, slotId, dates, clientUid = "pat") => ({ id, status, slotId, dates, clientUid });

test("only approved bookings take a spot, and only from today on", () => {
    const counts = bookedCounts([
        req("a", "approved", "s1", ["2026-10-13", "2026-10-20", "2026-10-27"]),
        req("b", "requested", "s1", ["2026-11-03"]),
        req("c", "denied", "s1", ["2026-11-10"]),
        req("d", "cancelled", "s1", ["2026-11-17"]),
        req("e", "approved", "g1", ["2026-10-22"]),
        req("f", "approved", "g1", ["2026-10-22"], "sam")
    ], TODAY);
    assert.deepEqual(counts, { s1: { "2026-10-20": 1, "2026-10-27": 1 }, g1: { "2026-10-22": 2 } });
});

test("a 1:1 slot is full after one approval; a group slot only at its capacity", () => {
    const counts = { s1: { "2026-10-20": 1 }, g1: { "2026-10-22": 2, "2026-10-29": 3 } };
    assert.deepEqual(fullDatesBySlot(counts, [oneOnOne, group]), { s1: ["2026-10-20"], g1: ["2026-10-29"] });
    // A removed slot (no capacity known) counts as 1:1, so nothing is ever double-booked.
    assert.deepEqual(fullDatesBySlot({ gone: { "2026-10-20": 1 } }, []), { gone: ["2026-10-20"] });
});

test("the bug: after the coach approves a 1:1, that date is no longer open", () => {
    const fields = slotBookingFields([req("a", "approved", "s1", ["2026-10-20"])], [oneOnOne, group], TODAY);
    assert.deepEqual(fields.fullDates, { s1: ["2026-10-20"] });
    assert.deepEqual(takenDates(oneOnOne, ["2026-10-20", "2026-10-27"], fields.fullDates), ["2026-10-20"]);
    assert.equal(nextOpenDate(oneOnOne, TODAY, fields.fullDates), "2026-10-27");
    // A different slot is untouched.
    assert.equal(nextOpenDate(group, TODAY, fields.fullDates), "2026-10-22");
});

test("the fields are the same whatever order the bookings arrive in", () => {
    const a = req("a", "approved", "s1", ["2026-10-27", "2026-10-20"]);
    const b = req("b", "approved", "g1", ["2026-10-22"]);
    assert.equal(JSON.stringify(slotBookingFields([a, b], [oneOnOne, group], TODAY)),
        JSON.stringify(slotBookingFields([b, a], [group, oneOnOne], TODAY)));
});

test("your own waiting or approved dates aren't offered again either", () => {
    const mine = [req("a", "requested", "s1", ["2026-10-20"]), req("b", "denied", "s1", ["2026-10-27"])];
    assert.deepEqual(takenDates(oneOnOne, ["2026-10-20", "2026-10-27"], {}, mine), ["2026-10-20"]);
    assert.equal(nextOpenDate(oneOnOne, TODAY, {}, mine), "2026-10-27");
});

test("a slot booked for every week ahead has no open date", () => {
    const dates = Array.from({ length: 52 }, (_, i) => {
        const d = new Date("2026-10-20T00:00:00"); d.setDate(d.getDate() + 7 * i);
        return d.toLocaleDateString("en-CA");
    });
    assert.equal(nextOpenDate(oneOnOne, TODAY, { s1: dates }), null);
});
