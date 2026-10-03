import { test } from "node:test";
import assert from "node:assert/strict";
import {
    attachLogs, sessionList, sessionsToLog, attendance, noShowStreak, weekAgenda, weekStart,
    logWords, latestSessionNotes, statusLabel, logId, LOG_WINDOW_DAYS, clientSessions
} from "../js/sessionModel.js";
import { summarizeSessions } from "../js/clientSummary.js";

const TODAY = "2026-09-29"; // a Tuesday
const log = (bookingId, date, status, extra = {}) => ({ bookingId, date, status, workedOn: "", nextTime: "", ...extra });

// Weekly soccer on Tuesdays at 17:00, four weeks either side of today.
const weekly = {
    id: "b1", status: "approved", clientUid: "pat", clientName: "Pat", sessionType: "soccer", label: "",
    startTime: "17:00", endTime: "18:00", coachNote: "See you there!",
    dates: ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13"]
};

test("logs ride along; cancelled dates leave `dates`, everything else keeps them", () => {
    const [r, pending] = attachLogs([weekly, { id: "b2", status: "requested", dates: ["2026-10-01"] }], [
        log("b1", "2026-09-08", "completed", { workedOn: "Weak foot" }),
        log("b1", "2026-10-06", "cancelled"),
        log("zz", "2026-10-06", "completed")
    ]);
    assert.deepEqual(r.dates, ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29", "2026-10-13"]);
    assert.equal(r.allDates.length, 6);
    assert.equal(r.logs["2026-09-08"].workedOn, "Weak foot");
    assert.deepEqual(pending.dates, ["2026-10-01"], "requests waiting on the coach are untouched");
    // The coach's next session skips the cancelled one.
    const s = summarizeSessions([r], "2026-09-30");
    assert.equal(s.upcoming[0].date, "2026-10-13");
    // Attaching twice doesn't lose the cancelled date's place in allDates.
    assert.equal(attachLogs([r], [log("b1", "2026-10-06", "cancelled")])[0].allDates.length, 6);
    assert.equal(logId("b1", "2026-10-06"), "b1_2026-10-06");
});

test("every date is a session with a state", () => {
    const [r] = attachLogs([weekly], [log("b1", "2026-09-08", "completed"), log("b1", "2026-09-15", "no-show"), log("b1", "2026-10-06", "cancelled")]);
    const list = sessionList([r, { ...weekly, id: "b9", status: "denied" }], TODAY);
    assert.deepEqual(list.map(s => `${s.date.slice(5)} ${s.state}`), [
        "09-08 completed", "09-15 no-show", "09-22 to-log", "09-29 today", "10-06 cancelled", "10-13 upcoming"
    ]);
    assert.equal(list[0].clientName, "Pat");
    assert.equal(list[0].startTime, "17:00");
    // Older than the window: quietly "not logged".
    const old = sessionList([{ ...weekly, logs: {}, allDates: ["2026-06-02"] }], TODAY);
    assert.equal(old[0].state, "not-logged");
    assert.ok(LOG_WINDOW_DAYS >= 30);
    // To log: only the recent ones.
    assert.deepEqual(sessionsToLog(list, TODAY).map(s => s.date), ["2026-09-22"]);
    assert.deepEqual(sessionsToLog(list, TODAY, 3).map(s => s.date), []);
});

test("sessions done: only explicitly completed logs count", () => {
    const pastBookings = { ...weekly, dates: ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"] };

    const unlogged = attendance(sessionList([pastBookings], "2026-10-01"));
    assert.equal(unlogged.completed, 0, "past bookings are not completed until a session is logged");

    const withLogs = attachLogs([pastBookings], [
        log("b1", "2026-09-08", "completed"),
        log("b1", "2026-09-15", "no-show"),
        log("b1", "2026-09-22", "cancelled")
    ]);
    const logged = attendance(sessionList(withLogs, "2026-10-01"));
    assert.equal(logged.completed, 1, "only the explicitly completed occurrence counts as done");
});

test("attendance and no-show streaks", () => {
    const [r] = attachLogs([weekly], [
        log("b1", "2026-09-08", "completed"), log("b1", "2026-09-15", "no-show"),
        log("b1", "2026-09-22", "late-cancel"), log("b1", "2026-10-06", "cancelled")
    ]);
    const a = attendance(sessionList([r], TODAY));
    assert.deepEqual({ ...a, line: undefined }, { completed: 1, noShow: 1, lateCancel: 1, cancelled: 1, counted: 3, line: undefined });
    assert.equal(a.line, "Attended 1 of 3 · 1 no-show · 1 cancelled late · 1 cancelled");
    assert.equal(attendance([]).line, "");
    const [r2] = attachLogs([weekly], [log("b1", "2026-09-08", "completed"), log("b1", "2026-09-15", "no-show"), log("b1", "2026-09-22", "cancelled"), log("b1", "2026-09-29", "no-show")]);
    assert.equal(noShowStreak(sessionList([r2], TODAY)), 2, "a cancellation in between doesn't break the streak");
    assert.equal(noShowStreak(sessionList([r], TODAY)), 0);
    assert.equal(statusLabel("late-cancel"), "Cancelled late");
});

test("the week's calendar, Monday to Sunday", () => {
    assert.equal(weekStart("2026-09-29"), "2026-09-28");
    assert.equal(weekStart("2026-10-04"), "2026-09-28", "Sunday belongs to the week before");
    const other = { ...weekly, id: "b3", clientName: "Ann", startTime: "16:00", dates: ["2026-09-29", "2026-10-02"] };
    const week = weekAgenda(sessionList(attachLogs([weekly, other], []), TODAY), TODAY);
    assert.deepEqual(week.map(d => d.date), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    assert.deepEqual(week[1].sessions.map(s => `${s.startTime} ${s.clientName}`), ["16:00 Ann", "17:00 Pat"]);
    assert.equal(week[4].sessions.length, 1);
    assert.equal(week[0].sessions.length, 0);
});

test("what the client reads: the newest session with notes", () => {
    assert.equal(logWords(log("b1", "x", "completed", { workedOn: "Weak foot", nextTime: "Wall passes" })), "Worked on: Weak foot\nFor next time: Wall passes");
    assert.equal(logWords(null), "");
    const [r] = attachLogs([weekly], [
        log("b1", "2026-09-08", "completed", { workedOn: "Weak foot" }),
        log("b1", "2026-09-15", "completed", { workedOn: "Turning", nextTime: "Juggling" }),
        log("b1", "2026-09-22", "no-show"),
        log("b1", "2026-10-13", "completed", { workedOn: "future?" })
    ]);
    const latest = latestSessionNotes([r], TODAY);
    assert.equal(latest.date, "2026-09-15");
    assert.equal(latest.text, "Worked on: Turning\nFor next time: Juggling");
    // An older booking with only its single note (no logs) still shows it.
    const legacy = latestSessionNotes([{ ...weekly, logs: {}, coachNote: "Great first session" }], TODAY);
    assert.equal(legacy.date, "2026-09-29");
    assert.equal(legacy.text, "Great first session");
    // A booking that has logs doesn't fall back to its approval note.
    assert.equal(latestSessionNotes([attachLogs([weekly], [log("b1", "2026-09-08", "no-show")])[0]], TODAY), null);
});

test("the client's Schedule: coming up, past with notes, waiting, recently turned down", () => {
    const [r, waiting, denied, oldDenied] = attachLogs([
        weekly,
        { id: "w1", status: "requested", dates: ["2026-10-02"] },
        { id: "d1", status: "denied", dates: ["2026-10-09"], coachNote: "I'm away that week" },
        { id: "d2", status: "denied", dates: ["2026-08-01"] }
    ], [
        log("b1", "2026-09-22", "completed", { workedOn: "Finishing" }),
        log("b1", "2026-09-15", "no-show"),
        log("b1", "2026-10-06", "cancelled")
    ]);
    const c = clientSessions([r, waiting, denied, oldDenied], TODAY);
    assert.deepEqual(c.upcoming.map(s => s.date), ["2026-09-29", "2026-10-06", "2026-10-13"], "today counts as coming up; a cancelled date stays, marked by its log");
    assert.equal(c.upcoming[1].log.status, "cancelled");
    assert.deepEqual(c.past.map(s => s.date), ["2026-09-22", "2026-09-15", "2026-09-08"], "newest first, logged or not");
    assert.equal(c.past[0].log.workedOn, "Finishing");
    assert.deepEqual(c.waiting.map(x => x.id), ["w1"]);
    assert.deepEqual(c.declined.map(x => x.id), ["d1"], "an old no isn't news");
    assert.equal(c.attendance.line, "Attended 1 of 2 · 1 no-show · 1 cancelled");
    assert.equal(clientSessions([r], TODAY, { pastLimit: 1 }).past.length, 1);
    assert.deepEqual(clientSessions([], TODAY), { upcoming: [], past: [], waiting: [], declined: [], attendance: attendance([]) });
});
