// Property tests (fast-check, dev-only): instead of a few hand-picked
// examples, each test states a rule that must hold for EVERY input and
// lets fast-check try hundreds of random ones. When a rule breaks, it
// shrinks the input to the smallest case that fails and prints it.
// Covers the unit conversions, pace and time parsing, booking dates and
// calendar export that clients see numbers from.
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { toDisplay, fromDisplay, nudge, plateMath, rirFromRpe, rpeFromRir } from "../js/strengthUnits.js";
import { toFluid, fromFluid } from "../js/fluidUnits.js";
import { parsePace, formatPace, formatDuration, resolveRun } from "../js/fuelTargets.js";
import { parseStartTime, timeOfDay, formatClock, formatTsp, firstGelValue } from "../js/fuelSchedule.js";
import { generateWeeklyDates, nextOpenDate, takenDates, slotBookingFields } from "../js/slotBookings.js";
import { weekStartOf, addDays } from "../js/scheduleWeek.js";
import { foldLine, icsText } from "../js/calendarExport.js";

const RUNS = { numRuns: 500 };

// A calendar date as YYYY-MM-DD, 2020–2035 (covers DST changes and leap days).
const isoDate = fc.date({ min: new Date(2020, 0, 1), max: new Date(2035, 11, 31), noInvalidDate: true })
    .map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
const dayOfWeek = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
const dayNumber = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

/* ---------- Strength: pounds stored, kg shown ---------- */

test("a weight typed in kg (to 0.1) shows back exactly as typed", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 5000 }), tenths => {
        const kg = tenths / 10;
        assert.equal(toDisplay(fromDisplay(kg, "kg"), "kg"), kg);
    }), RUNS);
});

test("a weight typed in lb (to 0.1) shows back exactly as typed", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 15000 }), tenths => {
        const lb = tenths / 10;
        assert.equal(toDisplay(fromDisplay(lb, "lb"), "lb"), lb);
    }), RUNS);
});

test("+ and − move the shown weight by one step and never below zero", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2000 }), fc.constantFrom("lb", "kg"), fc.constantFrom(1, -1), (whole, unit, dir) => {
        const shown = toDisplay(fromDisplay(whole, unit), unit);
        const after = toDisplay(nudge(fromDisplay(whole, unit), unit, dir), unit);
        const step = unit === "kg" ? 2.5 : 5;
        assert.ok(after >= 0);
        if (dir > 0) assert.equal(after, Math.round((shown + step) * 10) / 10);
        else assert.equal(after, Math.max(0, Math.round((shown - step) * 10) / 10));
    }), RUNS);
});

test("plates per side never add up to more than half of what's over the bar", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1500 }), fc.constantFrom("lb", "kg"), (lb, unit) => {
        const p = plateMath(lb, unit);
        const sum = p.plates.reduce((a, b) => a + b, 0);
        assert.ok(sum <= p.perSide + 0.01, `${sum} > ${p.perSide}`);
        // What's left over is smaller than the smallest plate.
        const smallest = unit === "kg" ? 1.25 : 2.5;
        assert.ok(p.perSide - sum < smallest, `left ${p.perSide - sum}`);
    }), RUNS);
});

test("RPE and reps in reserve convert both ways", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), rpe => {
        assert.equal(rpeFromRir(rirFromRpe(rpe)), rpe);
    }));
});

/* ---------- Fluid: ounces stored, ml shown ---------- */

test("ml typed on the shown step (5 ml, 10 ml past 200) shows back exactly", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 600 }), k => {
        const ml = k <= 40 ? k * 5 : 200 + (k - 40) * 10;
        assert.equal(toFluid(fromFluid(ml, "ml"), "ml"), ml);
    }), RUNS);
});

test("ounces typed to 0.1 show back exactly", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 5000 }), tenths => {
        const oz = tenths / 10;
        assert.equal(toFluid(fromFluid(oz, "oz"), "oz"), oz);
    }), RUNS);
});

/* ---------- Pace and run time ---------- */

test("every pace from 3:00 to 30:00 a mile reads back to itself", () => {
    fc.assert(fc.property(fc.integer({ min: 180, max: 1800 }), seconds => {
        const text = formatPace(seconds / 60);
        assert.match(text, /^\d{1,2}:[0-5]\d$/);
        assert.equal(formatPace(parsePace(text)), text);
        assert.equal(Math.round(parsePace(text) * 60), seconds);
    }), RUNS);
});

test("a per-km pace reads as the same speed per mile", () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 18 }), fc.integer({ min: 0, max: 59 }), (m, s) => {
        const perMile = parsePace(`${m}:${String(s).padStart(2, "0")}/km`);
        const expected = (m + s / 60) * 1.609344;
        if (expected < 3 || expected > 30) assert.equal(perMile, null);
        else assert.ok(Math.abs(perMile - expected) < 0.001);
    }), RUNS);
});

test("a pace range reads as its middle, whichever dash is typed", () => {
    fc.assert(fc.property(fc.integer({ min: 180, max: 1800 }), fc.integer({ min: 180, max: 1800 }), fc.constantFrom("-", "–", "—", " - "), (a, b, dash) => {
        const pace = parsePace(`${formatPace(a / 60)}${dash}${formatPace(b / 60)}`);
        assert.ok(Math.abs(pace - (a + b) / 120) < 0.001);
    }), RUNS);
});

test("parsePace never throws and only ever answers null or a pace in range", () => {
    fc.assert(fc.property(fc.oneof(fc.string(), fc.string({ unit: "binary" }), fc.stringMatching(/^\d{1,2}(:\d{1,2})?\s*(\/km|\/mi|-\d{1,2}:\d\d)?$/)), text => {
        const p = parsePace(text);
        assert.ok(p === null || (p >= 3 && p <= 30), `${JSON.stringify(text)} -> ${p}`);
    }), { numRuns: 2000 });
});

test("formatDuration shows whole minutes under an hour and h:mm from an hour", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 3000 }), min => {
        const text = formatDuration(min);
        if (min < 60) assert.equal(text, `${min} min`);
        else {
            const [h, m] = text.split(":").map(Number);
            assert.equal(h * 60 + m, min);
        }
    }), RUNS);
});

test("any two of distance, pace and time work out a third that agrees with them", () => {
    const field = fc.constantFrom("distance", "pace", "duration");
    fc.assert(fc.property(
        fc.integer({ min: 1, max: 1000 }).map(n => n / 10),     // 0.1–100 mi
        fc.integer({ min: 300, max: 900 }),                      // 5:00–15:00 a mile
        fc.uniqueArray(field, { minLength: 2, maxLength: 2 }),
        (miles, paceSec, order) => {
            const pace = formatPace(paceSec / 60);
            const minutes = Math.round(miles * parsePace(pace));
            if (minutes < 1) return;
            const input = { distance: String(miles), pace, duration: String(minutes), order };
            for (const f of ["distance", "pace", "duration"]) if (!order.includes(f)) input[f] = "";
            const out = resolveRun(input);
            assert.equal(out.problems.length === 0 || out.waiting === true, true);
            if (out.waiting) return; // a worked-out pace outside 3–30 a mile is flagged, not used
            assert.equal(out.source, "two");
            assert.ok(Math.abs(out.minutes - out.distance * out.paceMin) <= 1,
                `${out.minutes} min vs ${out.distance} mi × ${out.paceMin}`);
        }
    ), RUNS);
});

/* ---------- Race-day clock (fuel schedule) ---------- */

test("every start time reads back the same in 12-hour and 24-hour form", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1439 }), min => {
        const twelve = timeOfDay(min);
        assert.equal(parseStartTime(twelve), min);
        const h = Math.floor(min / 60), m = min % 60;
        assert.equal(parseStartTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`), min);
    }), RUNS);
});

test("times past midnight wrap to the next day, before midnight count back", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 1439 }), fc.integer({ min: -3, max: 3 }), (min, days) => {
        assert.equal(timeOfDay(min + days * 1440), timeOfDay(min));
    }), RUNS);
});

test("formatClock is h:mm of whole minutes", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 6000 }), min => {
        const [h, m] = formatClock(min).split(":").map(Number);
        assert.equal(h * 60 + m, min);
    }), RUNS);
});

test("teaspoons read as a whole number and an eighth, a short decimal under ¼, or a pinch", () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 20, noNaN: true }), tsp => {
        const text = formatTsp(tsp);
        assert.match(text, /^(a pinch|0\.\d{1,2}|\d+|\d+ [⅛¼⅜½⅝¾⅞]|[⅛¼⅜½⅝¾⅞])$/, `${tsp} -> ${text}`);
        if (tsp < 0.25) assert.ok(text === "a pinch" || Number(text) < 0.25, `${tsp} -> ${text}`);
        else assert.ok(!/^0\./.test(text), `${tsp} -> ${text}`);
    }), RUNS);
});

test("first gel time is always a whole minute between 5 and 240", () => {
    fc.assert(fc.property(fc.oneof(fc.double(), fc.string(), fc.constant(null), fc.constant("")), v => {
        const n = firstGelValue(v);
        assert.ok(Number.isInteger(n) && n >= 5 && n <= 240, `${v} -> ${n}`);
    }), { numRuns: 1000 });
});

/* ---------- Sessions: weekly dates and bookings ---------- */

test("weekly session dates land on the slot's day, exactly 7 days apart, through clock changes", () => {
    fc.assert(fc.property(isoDate, fc.integer({ min: 0, max: 6 }), fc.integer({ min: 1, max: 60 }), (from, dow, count) => {
        const dates = generateWeeklyDates(from, dow, count);
        assert.equal(dates.length, count);
        assert.ok(dates[0] >= from);
        assert.ok(dayNumber(dates[0]) - dayNumber(from) < 7);
        dates.forEach((d, i) => {
            assert.equal(dayOfWeek(d), dow, d);
            if (i) assert.equal(dayNumber(d) - dayNumber(dates[i - 1]), 7, `${dates[i - 1]} -> ${d}`);
        });
    }), RUNS);
});

test("the next open date is never one that's full or already asked for", () => {
    fc.assert(fc.property(isoDate, fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 20 }), (from, dow, fullN, askedN) => {
        const slot = { id: "s1", dayOfWeek: dow };
        const weeks = generateWeeklyDates(from, dow, 60);
        const fullDates = { s1: weeks.slice(0, fullN) };
        const mine = [{ slotId: "s1", status: "requested", dates: weeks.slice(fullN, fullN + askedN) }];
        const next = nextOpenDate(slot, from, fullDates, mine);
        assert.equal(next, weeks[fullN + askedN]);
        assert.deepEqual(takenDates(slot, [next], fullDates, mine), []);
    }), RUNS);
});

test("a date is full exactly when approved bookings reach the slot's capacity", () => {
    const booking = fc.record({
        status: fc.constantFrom("approved", "requested", "declined", "cancelled"),
        slotId: fc.constantFrom("a", "b"),
        dates: fc.array(fc.constantFrom("2026-11-02", "2026-11-09", "2026-11-16"), { maxLength: 3 })
    });
    fc.assert(fc.property(fc.array(booking, { maxLength: 12 }), fc.integer({ min: 0, max: 4 }), (requests, cap) => {
        const slots = [{ id: "a", capacity: cap }, { id: "b" }];
        const { bookedCounts, fullDates } = slotBookingFields(requests, slots, "2026-11-01");
        for (const slotId of ["a", "b"]) {
            const capacity = Math.max(1, slotId === "a" ? cap : 1);
            for (const date of ["2026-11-02", "2026-11-09", "2026-11-16"]) {
                const approved = requests.filter(r => r.status === "approved" && r.slotId === slotId && r.dates.includes(date)).length;
                assert.equal(bookedCounts[slotId]?.[date] || 0, approved);
                assert.equal((fullDates[slotId] || []).includes(date), approved >= capacity);
            }
        }
    }), RUNS);
});

test("the coach's week starts on the Monday on or before any day", () => {
    fc.assert(fc.property(isoDate, iso => {
        const monday = weekStartOf(iso);
        assert.equal(dayOfWeek(monday), 1);
        const gap = dayNumber(iso) - dayNumber(monday);
        assert.ok(gap >= 0 && gap < 7);
    }), RUNS);
});

test("adding days then taking them away returns the same date", () => {
    fc.assert(fc.property(isoDate, fc.integer({ min: -800, max: 800 }), (iso, n) => {
        assert.equal(dayNumber(addDays(iso, n)) - dayNumber(iso), n);
        assert.equal(addDays(addDays(iso, n), -n), iso);
    }), RUNS);
});

/* ---------- Calendar export (.ics) ---------- */

test("folded calendar lines stay within 75 bytes and unfold to the original", () => {
    const enc = new TextEncoder();
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 400 }), text => {
        const line = `DESCRIPTION:${icsText(text)}`;
        const folded = foldLine(line);
        for (const part of folded.split("\r\n")) assert.ok(enc.encode(part).length <= 75, part);
        assert.equal(folded.replace(/\r\n /g, ""), line);
    }), RUNS);
});

test("escaped calendar text never leaves a bare comma, semicolon or newline", () => {
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 200 }), text => {
        const out = icsText(text).replace(/\\\\/g, "");
        assert.doesNotMatch(out, /(^|[^\\])[,;]/);
        assert.doesNotMatch(out, /[\r\n]/);
    }), RUNS);
});
