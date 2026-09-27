// Unit tests for what a client sees of a coach plan (js/planWindow.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    releaseThrough, windowPlan, visibleChanges, noticeVersionOf, awaitingAck, awaitingView,
    isRolling, mightNeedRelease, releaseDue, firstHiddenDate, opensOn, weekHidden
} from "../js/planWindow.js";
import { addDays, blankPlan, diffPlans } from "../js/coachingPlanModel.js";

// Five Monday-Sunday weeks from Mon Sep 28, 2026, with the coach's generator notes.
function plan() {
    const p = blankPlan("2026-09-28", 5);
    p.weeks.forEach((w, i) => { w.days[1].type = "easy"; w.days[1].miles = 4 + i; w.days[6].type = "long"; w.days[6].miles = 8 + i; });
    p.raceDate = "2026-11-01";
    p.generator = { v: 1, settings: { goal: "3:05" }, prints: { "2026-09-29": ["a", "b"] } };
    return p;
}

test("the client sees this week and next", () => {
    const p = plan();
    assert.equal(releaseThrough(p, "2026-09-10"), "2026-10-11", "before it starts: the first two weeks");
    assert.equal(releaseThrough(p, "2026-09-28"), "2026-10-11", "Monday of week 1: weeks 1-2");
    assert.equal(releaseThrough(p, "2026-10-04"), "2026-10-11", "Sunday of week 1: still weeks 1-2");
    assert.equal(releaseThrough(p, "2026-10-05"), "2026-10-18", "Monday of week 2: week 3 opens");
    assert.equal(releaseThrough(p, "2026-10-27"), "2026-11-01", "the last week: everything");
    assert.equal(releaseThrough(p, "2026-12-01"), "2026-11-01", "after it ends: everything");
    assert.equal(releaseThrough({ weeks: [] }, "2026-10-01"), null);
});

test("the client's copy stops at the window and keeps the big picture", () => {
    const p = plan();
    const w = windowPlan(p, "2026-10-11");
    assert.equal(w.weeks.length, 2);
    assert.deepEqual(w.window, { through: "2026-10-11", totalWeeks: 5, endDate: "2026-11-01" });
    assert.equal(w.generator, undefined, "the coach's generator notes stay with the coach");
    assert.equal(w.raceDate, "2026-11-01");
    assert.equal(w.weeks[1].plannedMiles, 5 + 9);
    assert.equal(p.weeks.length, 5, "the coach's plan isn't touched");
    assert.ok(p.generator);
    // Whole plan: nothing cut, no window, still no generator.
    const whole = windowPlan(p, "2026-11-01");
    assert.equal(whole.weeks.length, 5);
    assert.equal(whole.window, undefined);
    assert.equal(whole.generator, undefined);
    assert.equal(windowPlan(p, null).weeks.length, 5);
    // A window from an older cut doesn't stick.
    assert.equal(windowPlan(w, null).window, undefined);
});

test("change lists leave out weeks the client can't see yet", () => {
    const before = plan();
    const after = plan();
    after.weeks[0].days[1].miles = 6;           // week 1: visible
    after.weeks[3].days[6].miles = 20;          // week 4: hidden
    // A move inside hidden week 5.
    after.weeks[4].days[5] = { ...after.weeks[4].days[6], date: after.weeks[4].days[5].date, day: after.weeks[4].days[5].day };
    after.weeks[4].days[6] = { ...before.weeks[4].days[5], date: before.weeks[4].days[6].date, day: before.weeks[4].days[6].day };
    const all = diffPlans(before, after);
    const seen = visibleChanges(all, "2026-10-11");
    assert.ok(all.length >= 3);
    assert.deepEqual(seen.map(c => c.date), ["2026-09-29"]);
    assert.equal(visibleChanges(all, null).length, all.length);
    // A move with one end showing counts.
    assert.equal(visibleChanges([{ kind: "moved", date: "2026-10-13", from: "2026-10-11" }], "2026-10-11").length, 1);
});

test("automatic week openings don't count as updates", () => {
    const h = { status: "active", version: 5, noticeVersion: 3, viewedVersion: 3, ackVersion: 2 };
    assert.equal(noticeVersionOf(h), 3);
    assert.equal(awaitingAck(h), true);
    assert.equal(awaitingView(h), false);
    assert.equal(awaitingAck({ ...h, ackVersion: 3 }), false, "got the update, then weeks opened");
    // Plans from before rolling release: every version is an update.
    assert.equal(noticeVersionOf({ version: 4 }), 4);
    assert.equal(awaitingView({ status: "active", version: 4, viewedVersion: 3 }), true);
    assert.equal(awaitingAck({ status: "archived", version: 4, ackVersion: 0 }), false);
});

test("the next week opens when it's due, only for rolling plans", () => {
    const p = plan();
    const h = { status: "active", releasedThrough: "2026-10-11", endDate: "2026-11-01", showAll: false };
    assert.equal(isRolling(h), true);
    assert.equal(isRolling({ ...h, showAll: true }), false);
    assert.equal(isRolling({ status: "active", endDate: "2026-11-01" }), false, "older plans stay whole");
    assert.equal(releaseDue(h, p, "2026-10-04"), null, "nothing new yet");
    assert.equal(releaseDue(h, p, "2026-10-05"), "2026-10-18");
    assert.equal(releaseDue(h, p, "2026-10-13"), "2026-10-25", "a missed week catches up to this week and next");
    assert.equal(releaseDue({ ...h, status: "archived" }, p, "2026-10-05"), null);
    assert.equal(releaseDue({ ...h, showAll: true }, p, "2026-10-05"), null);
    // The cheap pre-check never misses a due week, and skips plans with plenty showing.
    for (let d = "2026-09-20"; d <= "2026-11-08"; d = addDays(d, 1)) {
        if (releaseDue(h, p, d)) assert.equal(mightNeedRelease(h, d), true, d);
    }
    assert.equal(mightNeedRelease({ ...h, releasedThrough: "2026-11-01" }, "2026-10-28"), false, "all open");
    assert.equal(mightNeedRelease(h, "2026-09-20"), false);
    assert.equal(firstHiddenDate(p, "2026-10-11"), "2026-10-12");
    assert.equal(firstHiddenDate(p, "2026-11-01"), null);
    assert.equal(firstHiddenDate(p, null), null);
});

test("the coach's editor knows when each hidden week opens", () => {
    const p = plan();
    assert.deepEqual([0, 1, 2, 3, 4].map(i => opensOn(p, i)), [null, null, "2026-10-05", "2026-10-12", "2026-10-19"]);
    // Each week opens the day releaseThrough first reaches it.
    for (let i = 2; i < 5; i++) {
        const last = p.weeks[i].days.at(-1).date;
        assert.equal(releaseThrough(p, opensOn(p, i)), last);
        assert.notEqual(releaseThrough(p, addDays(opensOn(p, i), -1)), last);
    }
    assert.deepEqual([0, 1, 2, 3].map(i => weekHidden(p, i, "2026-10-11")), [false, false, true, true]);
    assert.equal(weekHidden(p, 4, null), false, "whole plan: nothing hidden");
});
