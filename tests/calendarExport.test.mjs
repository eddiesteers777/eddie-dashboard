// Unit tests for Add to Calendar (js/calendarExport.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { icsText, foldLine, eventFromItem, eventsFromWeeks, buildCalendar } from "../js/calendarExport.js";

const week = {
    days: [
        { date: "2026-09-28", items: [{ id: "coach-p1:2026-09-28", kind: "run", title: "Tempo run", miles: 6, detail: "1.5 mi warm-up · 3 × 1 mi @ tempo effort", source: { type: "plan" } }] },
        { date: "2026-09-29", items: [] },
        { date: "2026-09-30", items: [{ id: "log:2026-09-30", kind: "run", title: "Logged run", miles: 4, source: { type: "log" } }] },
        { date: "2026-10-03", items: [{ id: "session:b1:2026-10-03", kind: "session", title: "1-on-1 Soccer", detail: "9:00 AM · with Eddie", startTime: "09:00", endTime: "10:00", source: { type: "session" } }] },
        { date: "2026-10-04", items: [{ id: "extra-s", kind: "strength", title: "Lower body", detail: "4 exercises", source: { type: "plan-strength" } }] }
    ]
};
const linkFor = item => item.kind === "run" ? "https://southboundcoaching.com/workout.html?program=coach-p1&date=2026-09-28" : "";

test("a week becomes events; rest days and self-logged runs stay off", () => {
    const events = eventsFromWeeks([week], { linkFor });
    assert.deepEqual(events.map(e => e.title), ["6 mi Tempo run · Southbound", "1-on-1 Soccer", "Lower body · Southbound"]);
    const run = events[0];
    assert.equal(run.uid, "coach-p1:2026-09-28@southboundcoaching.com");
    assert.equal(run.start, "", "workouts are all-day");
    assert.match(run.description, /3 × 1 mi @ tempo effort\n\nOpen in Southbound: https:\/\/southboundcoaching.com\/workout.html/);
    const session = events[1];
    assert.deepEqual([session.start, session.end], ["20261003T090000", "20261003T100000"]);
});

test("a session with no end time gets an hour", () => {
    const e = eventFromItem({ id: "s", kind: "session", title: "Group", startTime: "17:30" }, "2026-10-01");
    assert.deepEqual([e.start, e.end], ["20261001T173000", "20261001T183000"]);
    assert.equal(eventFromItem({ id: "s", kind: "session", title: "Group" }, "2026-10-01").start, "", "no time -> all day");
});

test("the file is valid iCalendar", () => {
    const ics = buildCalendar(eventsFromWeeks([week], { linkFor }), { now: Date.UTC(2026, 8, 26, 12, 0, 0) });
    assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
    assert.match(ics, /DTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20260929\r\n/);
    assert.match(ics, /DTSTAMP:20260926T120000Z/);
    assert.match(ics, /DTSTART:20261003T090000\r\nDTEND:20261003T100000/);
    for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
    // Month and year roll over for the all-day end date.
    assert.match(buildCalendar(eventsFromWeeks([{ days: [{ date: "2026-12-31", items: [{ id: "x", kind: "cross", title: "Bike" }] }] }])), /DTEND;VALUE=DATE:20270101/);
});

test("text is escaped and long lines fold", () => {
    assert.equal(icsText("a, b; c\\d\nnext"), "a\\, b\\; c\\\\d\\nnext");
    const long = "DESCRIPTION:" + "x".repeat(200);
    const folded = foldLine(long);
    assert.ok(folded.split("\r\n ").every(p => p.length <= 75));
    assert.equal(folded.replace(/\r\n /g, ""), long);
    assert.equal(foldLine("short"), "short");
});
