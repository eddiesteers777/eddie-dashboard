import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftDay, pickTodayRun, dayComplete, habitStreak, streakAtRisk, restDayAction, restTextOf } from "../js/todayCues.js";

const H = [{ id: "a" }, { id: "b" }];
const all = { a: true, b: true };

test("shiftDay crosses months and years", () => {
    assert.equal(shiftDay("2026-11-01", -1), "2026-10-31");
    assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
});

test("pickTodayRun: only a run dated today, else nothing", () => {
    const prompts = [{ id: "r2", date: "2026-10-29" }, { id: "r1", date: "2026-10-28" }];
    assert.equal(pickTodayRun(prompts, "2026-10-29").id, "r2");
    assert.equal(pickTodayRun(prompts.slice(1), "2026-10-29"), null);
    assert.equal(pickTodayRun([], "2026-10-29"), null);
    assert.equal(pickTodayRun(undefined, "2026-10-29"), null);
});

test("dayComplete needs a list and every habit", () => {
    assert.equal(dayComplete({ "2026-10-29": all }, "2026-10-29", H), true);
    assert.equal(dayComplete({ "2026-10-29": { a: true } }, "2026-10-29", H), false);
    assert.equal(dayComplete({ "2026-10-29": all }, "2026-10-29", []), false);
});

test("streak counts back from yesterday while today is open, from today once done", () => {
    const entries = { "2026-10-26": all, "2026-10-27": all, "2026-10-28": all };
    assert.equal(habitStreak(entries, H, "2026-10-29"), 3);
    assert.equal(habitStreak({ ...entries, "2026-10-29": all }, H, "2026-10-29"), 4);
    assert.equal(habitStreak({ "2026-10-27": all }, H, "2026-10-29"), 0);   // a gap yesterday ends it
});

test("streakAtRisk: only a real streak that today hasn't kept", () => {
    const entries = { "2026-10-27": all, "2026-10-28": all };
    assert.equal(streakAtRisk(entries, H, "2026-10-29"), 2);
    assert.equal(streakAtRisk({ ...entries, "2026-10-29": all }, H, "2026-10-29"), 0);   // kept already
    assert.equal(streakAtRisk({ "2026-10-28": all }, H, "2026-10-29"), 0);               // one day is not a streak
    assert.equal(streakAtRisk({}, H, "2026-10-29"), 0);                                    // no data
    assert.equal(streakAtRisk(entries, [], "2026-10-29"), 0);                              // no habits
});

test("restDayAction: the plan's own words for its rest day, never invented", () => {
    const plan = (days) => [{ generatedPlan: { weeks: [{ days }] } }];
    assert.equal(restDayAction(plan([{ date: "2026-10-29", type: "rest", session: "Walk 20 min + mobility" }]), "2026-10-29"), "Walk 20 min + mobility");
    assert.equal(restDayAction(plan([{ date: "2026-10-29", type: "rest", session: "Rest" }]), "2026-10-29"), "");
    assert.equal(restDayAction(plan([{ date: "2026-10-29", type: "rest", session: "" }]), "2026-10-29"), "");
    assert.equal(restDayAction(plan([{ date: "2026-10-29", type: "easy", session: "4 easy" }]), "2026-10-29"), "");
    assert.equal(restDayAction(plan([{ date: "2026-10-28", type: "rest", session: "Walk" }]), "2026-10-29"), "");
    assert.equal(restDayAction([], "2026-10-29"), "");
});

test("restTextOf: a 0-mile marathon day's words only", () => {
    assert.equal(restTextOf({ miles: 0, session: "Rest: walk, eat, celebrate" }), "Rest: walk, eat, celebrate");
    assert.equal(restTextOf({ miles: 0, session: "Rest" }), "");
    assert.equal(restTextOf({ miles: 5, session: "Easy" }), "");
    assert.equal(restTextOf(null), "");
});
