import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../js/biblePlan.js";

test("the plan covers all 1,189 chapters in 365 days, in order, once", () => {
    const days = B.planDays();
    assert.equal(days.length, 365);
    assert.equal(B.TOTAL_CHAPTERS, 1189);
    const all = days.flat();
    assert.equal(all.length, 1189);
    assert.equal(new Set(all).size, 1189);
    assert.equal(all[0], "Genesis 1");
    assert.equal(all.at(-1), "Revelation 22");
    assert.ok(days.every(d => d.length === 3 || d.length === 4));
});

test("marking a day read logs it, and unmarking removes the log", () => {
    let p = B.startPlan("2026-11-14");
    const n = B.chaptersOn(0).length;
    for (let i = 0; i < n; i++) p = B.toggleChapter(p, "2026-11-14", 0, i);
    assert.ok(B.dayDone(p, 0));
    assert.equal(p.log["2026-11-14"], 0);
    p = B.toggleChapter(p, "2026-11-14", 0, 1);
    assert.ok(!B.dayDone(p, 0));
    assert.equal(p.log["2026-11-14"], undefined);
});

test("a missed day carries over: tomorrow shows the first unfinished day", () => {
    let p = B.startPlan("2026-11-14");
    p = B.withLock(p, "2026-11-14");
    assert.equal(p.lock.day, 0);
    p = B.toggleChapter(p, "2026-11-14", 0, 0); // read one of three, then stopped
    assert.equal(B.dayFor(p, "2026-11-14"), 0, "held steady all day");
    assert.equal(B.dayFor(p, "2026-11-16"), 0, "two days later still the unfinished day");
    assert.equal(B.daysBehind(p, "2026-11-16", 0), 2);
});

test("finishing the day does not swap the sheet until tomorrow", () => {
    let p = B.withLock(B.startPlan("2026-11-14"), "2026-11-14");
    for (let i = 0; i < B.chaptersOn(0).length; i++) p = B.toggleChapter(p, "2026-11-14", 0, i);
    assert.equal(B.dayFor(p, "2026-11-14"), 0);
    assert.equal(B.dayFor(p, "2026-11-15"), 1);
    assert.equal(B.daysBehind(p, "2026-11-15", 1), 0);
});

test("week strip runs Monday to Sunday and marks done days", () => {
    let p = B.startPlan("2026-11-09");
    p = { ...p, log: { "2026-11-10": 1 } };
    const w = B.weekStrip(p, "2026-11-14"); // a Saturday
    assert.equal(w.length, 7);
    assert.equal(w[0].key, "2026-11-09");
    assert.equal(w[1].state, "done");
    assert.equal(w[5].state, "today");
    assert.equal(w[6].state, "ahead");
    assert.equal(w[0].state, "open");
});

test("cleanPlan rejects other shapes", () => {
    assert.equal(B.cleanPlan({ id: "x" }), null);
    assert.ok(B.cleanPlan(B.startPlan("2026-11-14")));
});
