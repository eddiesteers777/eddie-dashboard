import test from "node:test";
import assert from "node:assert/strict";
import { raceDateOf, nextRace, raceCountdownText } from "../js/raceCountdown.js";
import { clientHeroLine } from "../js/todayLayout.js";
import { accessFromProfile } from "../js/navAccess.js";

const plan = (extra = {}, weeks = []) => ({ status: "active", generatedPlan: { weeks, ...extra } });
const raceWeek = date => [{ days: [{ date: "2026-11-01", type: "easy" }, { date, type: "race" }] }];

test("the race date is the plan's own, else its last race day", () => {
    assert.equal(raceDateOf(plan({ raceDate: "2026-12-06" })), "2026-12-06");
    assert.equal(raceDateOf(plan({}, raceWeek("2026-11-22"))), "2026-11-22");
    assert.equal(raceDateOf(plan({}, [{ days: [{ date: "2026-11-01", type: "easy" }] }])), "", "no race, no date");
    assert.equal(raceDateOf(plan({ raceDate: "soon" })), "", "an unreadable date is ignored");
    assert.equal(raceDateOf(null), "");
});

test("the nearest race that hasn't happened yet wins", () => {
    const plans = [plan({ raceDate: "2026-12-06" }), plan({ raceDate: "2026-11-01" }), plan({ raceDate: "2026-09-01" })];
    assert.deepEqual(nextRace(plans, "2026-10-12"), { date: "2026-11-01", days: 20 });
    assert.equal(nextRace([plan({ raceDate: "2026-09-01" })], "2026-10-12"), null, "a race in the past is not a countdown");
    assert.equal(nextRace([], "2026-10-12"), null);
    assert.equal(nextRace([plan({ raceDate: "2026-12-06" })], "nonsense"), null);
});

test("an archived plan doesn't count down", () => {
    assert.equal(nextRace([{ ...plan({ raceDate: "2026-12-06" }), status: "archived" }], "2026-10-12"), null);
});

test("days are calendar days, not 24-hour blocks, across a clock change", () => {
    // US clocks go back on 2026-11-01: Oct 31 -> Nov 2 is still 2 days.
    assert.equal(nextRace([plan({ raceDate: "2026-11-02" })], "2026-10-31").days, 2);
    assert.equal(nextRace([plan({ raceDate: "2026-03-10" })], "2026-03-07").days, 3);
});

test("the words", () => {
    assert.equal(raceCountdownText({ days: 0 }), "Race day is today");
    assert.equal(raceCountdownText({ days: 1 }), "Race day is tomorrow");
    assert.equal(raceCountdownText({ days: 41 }), "41 days to race day");
    assert.equal(raceCountdownText(null), "");
});

test("the hero line adds it only for an active account with a plan", () => {
    const run = accessFromProfile({ status: "active", services: ["running"] }, {});
    assert.equal(clientHeroLine(run, ["Fall Half"], "41 days to race day"), "Training: Fall Half · 41 days to race day");
    assert.equal(clientHeroLine(run, [], "41 days to race day"), "Here's your day. Your plan and check-ins all live here · 41 days to race day");
    assert.equal(clientHeroLine(run, ["Fall Half"], ""), "Training: Fall Half", "no race, same line as before");
    const soccer = accessFromProfile({ status: "active", services: ["soccer_1on1"] }, {});
    assert.ok(!/race/.test(clientHeroLine(soccer, [], "41 days to race day")), "no plan capability, no countdown");
    const pending = accessFromProfile({ status: "pending", services: [] }, {});
    assert.ok(!/race/.test(clientHeroLine(pending, [], "41 days to race day")), "pending keeps its own message");
});
