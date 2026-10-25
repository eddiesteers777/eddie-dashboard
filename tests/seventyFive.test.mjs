import test from "node:test";
import assert from "node:assert/strict";
import {
    PRESETS, TOTAL_DAYS, newChallenge, sanitize, toggleTask, missedDay, restart, fixDay, streak, summary, tickStates,
    dayNumber, isOver, reminderIcs, addDays, daysBetween, validKey, shareLine, resolveSync, cleanTasks, isDayComplete
} from "../js/seventyFive.js";
import { habitIconId, storedIcon } from "../js/habitIconSet.js";
import { sceneFor } from "../js/celebrate.js";

const START = "2026-10-01";
const fresh = (o = {}) => newChallenge({ preset: "hard", start: START, now: 1, ...o });
const finish = (s, day) => s.tasks.reduce((acc, t) => toggleTask(acc, day, t.id, 2), s);

test("dates: add days, days between, month ends and leap years", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
    assert.equal(daysBetween("2026-10-01", "2026-10-24"), 23);
    assert.ok(validKey("2026-10-24"));
    assert.ok(!validKey("2026-02-30"));
});

test("presets: Hard has six tasks, Soft four, and every icon is a real drawn icon with a scene", () => {
    assert.equal(PRESETS.hard.tasks.length, 6);
    assert.equal(PRESETS.soft.tasks.length, 4);
    for (const t of [...PRESETS.hard.tasks, ...PRESETS.soft.tasks]) assert.equal(habitIconId({ icon: storedIcon(t.icon), name: "" }), t.icon, t.name);
    assert.equal(sceneFor("workout"), "impact");
    assert.equal(sceneFor("water"), "water");
    assert.equal(sceneFor("meals"), "nourish");
});

test("a challenge needs at least one task; custom lists are cleaned and capped at 10", () => {
    assert.equal(newChallenge({ preset: "custom", tasks: [], start: START }), null);
    const many = cleanTasks(Array.from({ length: 14 }, (_, i) => ({ name: `Thing ${i}` })));
    assert.equal(many.length, 10);
    const dup = cleanTasks([{ name: "Walk" }, { name: "Walk" }]);
    assert.notEqual(dup[0].id, dup[1].id);
});

test("day number: 0 before the start, 1 on the start, capped at 75 with over set after", () => {
    const s = fresh();
    assert.equal(dayNumber(s, "2026-09-30"), 0);
    assert.equal(dayNumber(s, START), 1);
    assert.equal(dayNumber(s, "2026-12-14"), 75);
    assert.ok(!isOver(s, "2026-12-14"));
    assert.ok(isOver(s, "2026-12-15"));
});

test("ticking a task marks it, ticking again clears it, and the original state is untouched", () => {
    const s = fresh();
    const a = toggleTask(s, START, s.tasks[0].id, 5);
    assert.ok(a.log[START][s.tasks[0].id]);
    assert.equal(a.updatedAt, 5);
    assert.deepEqual(s.log, {});
    const b = toggleTask(a, START, s.tasks[0].id, 6);
    assert.deepEqual(b.log, {});
    assert.equal(toggleTask(s, START, "nope"), s);
});

test("a finished day needs every task; the streak counts finished days up to today", () => {
    let s = fresh();
    for (const d of [START, "2026-10-02"]) s = finish(s, d);
    assert.equal(streak(s, "2026-10-03"), 2, "today not finished yet: yesterday back");
    s = finish(s, "2026-10-03");
    assert.equal(streak(s, "2026-10-03"), 3);
    assert.equal(summary(s, "2026-10-03").todayComplete, true);
    assert.equal(summary(s, "2026-10-03").toGo, 72);
});

test("strict mode: an unfinished earlier day asks to start over; today never does", () => {
    let s = finish(fresh(), START);
    assert.equal(missedDay(s, "2026-10-02"), null, "day 2 is today");
    assert.equal(missedDay(s, "2026-10-03"), "2026-10-02");
    assert.equal(missedDay({ ...s, strict: false }, "2026-10-03"), null);
});

test("start again: day 1 today, attempt up, what was reached is remembered", () => {
    let s = fresh();
    s = finish(finish(s, START), "2026-10-02");
    const r = restart(s, "2026-10-04", 9);
    assert.equal(r.start, "2026-10-04");
    assert.equal(r.attempt, 2);
    assert.deepEqual(r.log, {});
    assert.deepEqual(r.history, [{ attempt: 1, start: START, reached: 2 }]);
    assert.equal(missedDay(r, "2026-10-04"), null);
});

test("fixing a missed day marks every task done and clears the prompt", () => {
    const s = finish(fresh(), START);
    const fixed = fixDay(s, "2026-10-02");
    assert.ok(isDayComplete(fixed, "2026-10-02"));
    assert.equal(missedDay(fixed, "2026-10-03"), null);
});

test("finishing all 75 days is complete; one gap is not", () => {
    let s = fresh();
    for (let i = 0; i < TOTAL_DAYS; i++) s = finish(s, addDays(START, i));
    const end = addDays(START, TOTAL_DAYS);
    assert.equal(summary(s, end).complete, true);
    assert.equal(shareLine(s, end), "75 Hard: all 75 days done.");
    const gap = toggleTask(s, addDays(START, 10), s.tasks[0].id);
    assert.equal(summary(gap, end).complete, false);
});

test("tick states for the dial: done, today, missed and ahead", () => {
    let s = finish(fresh(), START);
    const t = tickStates(s, "2026-10-03");
    assert.deepEqual(t.slice(0, 4), ["done", "missed", "now", "ahead"]);
    assert.equal(t.length, 75);
});

test("share line is plain", () => {
    const s = finish(fresh(), START);
    assert.equal(shareLine(s, "2026-10-02"), "75 Hard, day 2 of 75. 1 day in a row.");
    assert.equal(shareLine(fresh(), "2026-09-20"), "75 Hard starts 2026-10-01.");
});

test("sanitize drops junk from storage and the cloud, keeps good data", () => {
    assert.equal(sanitize(null), null);
    assert.equal(sanitize({ start: "nope", tasks: [{ name: "a" }] }), null);
    const s = finish(fresh(), START);
    const raw = JSON.parse(JSON.stringify(s));
    raw.log["not-a-date"] = { x: true };
    raw.log[START].ghost = true;
    raw.log["2026-10-02"] = { [s.tasks[0].id]: "yes" };
    const clean = sanitize(raw);
    assert.deepEqual(Object.keys(clean.log), [START]);
    assert.ok(!clean.log[START].ghost);
    assert.deepEqual(sanitize(clean), clean);
});

test("sync: guest first link asks only when both sides have a challenge; later the newer one wins", () => {
    const a = fresh(), b = { ...fresh(), attempt: 2, updatedAt: 9 };
    assert.equal(resolveSync({ local: null, remote: null, linked: false }), "none");
    assert.equal(resolveSync({ local: a, remote: null, linked: false }), "push");
    assert.equal(resolveSync({ local: null, remote: a, linked: false }), "pull");
    assert.equal(resolveSync({ local: a, remote: b, linked: false }), "ask");
    assert.equal(resolveSync({ local: a, remote: b, linked: true }), "pull");
    assert.equal(resolveSync({ local: b, remote: a, linked: true }), "push");
    assert.equal(resolveSync({ local: a, remote: { ...a }, linked: false }), "none");
});

test("reminder file repeats daily for 75 days from the start date", () => {
    const ics = reminderIcs(fresh(), "2030");
    assert.match(ics, /DTSTART:20261001T203000/);
    assert.match(ics, /RRULE:FREQ=DAILY;COUNT=75/);
    assert.match(ics, /BEGIN:VALARM/);
    assert.ok(ics.includes("\r\n") && ics.endsWith("\r\n"));
});
