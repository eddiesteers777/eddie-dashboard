// Tests for the coach's own marathon plan helpers (js/ownPlan.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { corosPrefill, prefillNote, applyPrefill, doneDates, whereInPlan, weekBars, isOwnPlan } from "../js/ownPlan.js";
import { generateCoachPlan } from "../js/coachPlanGenerator.js";
import { marathonSettingsFromProfile } from "../js/marathonProfile.js";

const TODAY = "2026-11-10";
const MI = 1609.344;
const run = (date, miles, race = null) => ({ date, distance: miles * MI, race });

test("pre-fill: weekly miles from the last 4 weeks, longest run from 30 days, best race by fitness", () => {
    const s = [
        run("2026-11-09", 8), run("2026-11-07", 12), run("2026-11-03", 6), run("2026-10-30", 5), run("2026-10-20", 10), run("2026-10-14", 7), run("2026-10-12", 16),
        run("2026-06-01", 6.2, { meters: 10000, timeSec: 2460 }),
        run("2026-09-01", 13.1, { meters: 21097.5, timeSec: 6300 })
    ];
    const p = corosPrefill(s, TODAY);
    // last 28 days start 2026-10-14: 8+12+6+5+10+7 = 48 -> 12 a week
    assert.equal(p.currentMiles, 12);
    assert.equal(p.longestRun, 16);
    assert.equal(p.recentRace.key, "10K");  // 41:00 10K is stronger than a 1:45 half
    assert.match(prefillNote(p, x => `${x}s`), /^From your COROS: 12 miles a week/);
});

test("pre-fill: no runs means no numbers and no note; old races are ignored", () => {
    const p = corosPrefill([run("2025-01-01", 6.2, { meters: 10000, timeSec: 2400 })], TODAY);
    assert.equal(p.runs, 0);
    assert.equal(p.recentRace, null);
    assert.equal(prefillNote(p), "");
    assert.deepEqual(applyPrefill({ currentMiles: 0 }, p), { currentMiles: 0 });
});

test("pre-fill only fills gaps in a saved setup", () => {
    const p = { runs: 9, currentMiles: 30, longestRun: 12, recentRace: { meters: 10000, seconds: 2460, key: "10K" } };
    const out = applyPrefill({ currentMiles: 40, longestRun: 0, recentRace: null }, p);
    assert.equal(out.currentMiles, 40);
    assert.equal(out.longestRun, 12);
    assert.deepEqual(out.recentRace, { meters: 10000, seconds: 2460 });
});

test("an own plan is found by its flag, and the plan helpers read a real generated plan", () => {
    assert.equal(isOwnPlan({ own: true }), true);
    assert.equal(isOwnPlan({ id: "x" }), false);
    const st = { ...marathonSettingsFromProfile({}, TODAY), raceDate: "2027-03-28", startDate: "2026-11-16", currentMiles: 30, longestRun: 10, runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN", goalTime: "3:30:00" };
    const { plan } = generateCoachPlan(st);
    assert.equal(whereInPlan(plan, TODAY).state, "before");
    assert.equal(whereInPlan(plan, "2026-11-17").state, "in");
    assert.equal(whereInPlan(plan, "2026-11-17").index, 0);
    assert.equal(whereInPlan(plan, "2027-04-20").state, "after");
    assert.equal(whereInPlan(plan, "2026-11-17").today.date, "2026-11-17");
    const bars = weekBars(plan);
    assert.equal(bars.length, plan.weeks.length);
    assert.ok(bars.at(-1).race);
    plan.weeks[0].days[1].completed = true;
    assert.ok(doneDates(plan).has(plan.weeks[0].days[1].date));
    assert.equal(whereInPlan({ weeks: [] }, TODAY).state, "none");
});
