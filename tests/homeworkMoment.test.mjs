import test from "node:test";
import assert from "node:assert/strict";
import { momentFor, weekDaysFor } from "../js/homeworkMoment.js";

const TODAY = "2026-11-11"; // a Wednesday; the week starts Monday 2026-11-09
const week = (logs, extra = {}) => ({ title: "Wall passes", cadence: "weekly", timesPerWeek: 3, logs: logs.map(date => ({ date, count: 1 })), ...extra });

test("a practice that does not finish the week is the practice moment", () => {
    const m = momentFor({ hw: week(["2026-11-11"]), wasComplete: false, today: TODAY, streak: 1, firstName: "Ava Lee" });
    assert.equal(m.kind, "practice");
    assert.match(m.headline, /Ava/);
    assert.doesNotMatch(m.headline, /Lee/);
    assert.deepEqual(m.chips, ["+1 practice", "1 of 3 this week"]);
    assert.equal(m.ring, null);
});

test("the practice that reaches the target is the week moment, once", () => {
    const hw = week(["2026-11-09", "2026-11-10", "2026-11-11"]);
    const m = momentFor({ hw, wasComplete: false, today: TODAY, streak: 3, firstName: "Ben" });
    assert.equal(m.kind, "week");
    assert.equal(m.headline, "Week complete");
    assert.deepEqual(m.ring, { done: 3, target: 3 });
    assert.ok(m.chips.includes("3-day streak"));
    assert.equal(m.days.length, 7);
    const again = momentFor({ hw, wasComplete: true, today: TODAY, firstName: "Ben" });
    assert.equal(again.kind, "practice");
});

test("a one-time task is never a week moment; a goal says goal reached", () => {
    assert.equal(momentFor({ hw: { cadence: "once", logs: [{ date: TODAY }] }, today: TODAY }).kind, "practice");
    const g = momentFor({ hw: { cadence: "goal", goal: 20, logs: [{ date: TODAY, count: 20 }] }, today: TODAY });
    assert.equal(g.kind, "week");
    assert.equal(g.kicker, "Goal reached");
    assert.equal(g.ring, null);
});

test("no name falls back to you; days mark today and earlier practices", () => {
    assert.match(momentFor({ hw: week([TODAY]), today: TODAY }).headline, /you/);
    const d = weekDaysFor(week(["2026-11-09", TODAY]), TODAY);
    assert.deepEqual(d.map(x => x.letter).join(""), "MTWTFSS");
    assert.equal(d[0].on, true);
    assert.equal(d[2].today, true);
    assert.equal(d[1].on, false);
});
