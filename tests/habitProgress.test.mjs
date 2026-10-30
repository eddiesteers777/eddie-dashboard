// Unit tests for the Habits page progress (js/habitProgress.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekdayIndex, weekBar, recentCompletionPct, ringValues, habitStreak, streakAtRisk } from "../js/habitProgress.js";

const H = [{ id: "a" }, { id: "b" }];
const all = { a: true, b: true };

test("weekdayIndex: Monday is 0, Sunday is 6", () => {
    assert.equal(weekdayIndex("2026-10-26"), 0);
    assert.equal(weekdayIndex("2026-10-30"), 4);
    assert.equal(weekdayIndex("2026-11-01"), 6);
});

test("weekBar: Monday to Sunday, states from real check-offs, future days marked", () => {
    const entries = { "2026-10-26": all, "2026-10-27": { a: true }, "2026-10-29": all };
    const w = weekBar(entries, H, "2026-10-30");
    assert.deepEqual(w.days.map(d => d.key.slice(8)), ["26", "27", "28", "29", "30", "31", "01"]);
    assert.deepEqual(w.days.map(d => d.state), ["complete", "partial", "none", "complete", "none", "future", "future"]);
    assert.equal(w.completeDays, 2);
    assert.equal(w.days[1].pct, 50);
    assert.ok(w.days[4].isToday);
});

test("weekBar: nothing ticked, or no habits, is all 'none' and zero complete", () => {
    assert.equal(weekBar({}, H, "2026-10-30").completeDays, 0);
    assert.ok(weekBar({}, H, "2026-10-30").days.slice(0, 5).every(d => d.state === "none"));
    assert.ok(weekBar({ "2026-10-26": all }, [], "2026-10-30").days.slice(0, 5).every(d => d.state === "none"));
});

test("a Sunday belongs to the week that started the Monday before", () => {
    assert.equal(weekBar({}, H, "2026-11-01").days[0].key, "2026-10-26");
});

test("recentCompletionPct and ringValues use only real check-offs", () => {
    assert.equal(recentCompletionPct({}, [], "2026-10-30"), null);
    assert.equal(recentCompletionPct({}, H, "2026-10-30"), 0);
    assert.deepEqual(ringValues({}, H, "2026-10-30"), [0, 0, 0]);
    assert.deepEqual(ringValues({}, [], "2026-10-30"), [0, 0, 0]);
    const r = ringValues({ "2026-10-30": { a: true }, "2026-10-29": all }, H, "2026-10-30");
    assert.equal(r[0], 0.5);
    assert.equal(r[1], 1 / 7);
    assert.equal(r[2], 3 / 60);
});

test("streak and at-risk come from Today's logic: no streak, no cue", () => {
    assert.equal(habitStreak({}, H, "2026-10-30"), 0);
    assert.equal(streakAtRisk({}, H, "2026-10-30"), 0);
    const run = { "2026-10-27": all, "2026-10-28": all, "2026-10-29": all };
    assert.equal(habitStreak(run, H, "2026-10-30"), 3);
    assert.equal(streakAtRisk(run, H, "2026-10-30"), 3);
    assert.equal(streakAtRisk({ ...run, "2026-10-30": all }, H, "2026-10-30"), 0);
    assert.equal(streakAtRisk({ "2026-10-29": all }, H, "2026-10-30"), 0);
});
