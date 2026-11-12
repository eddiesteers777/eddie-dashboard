import test from "node:test";
import assert from "node:assert/strict";
import { recoveryPlan, cleanSettings, mondayOf } from "../js/recoveryPlan.js";

const base = { startDate: "2026-11-09", easyMiles: 3, runsPerWeek: 3 };

test("four weeks, week 1 has no running", () => {
    const { plan } = recoveryPlan(base);
    assert.equal(plan.weeks.length, 4);
    const w1 = plan.weeks[0].days;
    assert.ok(w1.every(d => !["easy", "long", "workout", "race", "tempo"].includes(d.type)));
    assert.ok(w1.every(d => d.miles === 0));
    assert.ok(w1.some(d => /bike or swim/.test(d.session)));
    assert.ok(w1.some(d => /Walk/.test(d.session)));
    assert.equal(plan.weeks[0].plannedMiles, 0);
});
test("weeks 2 to 4 run the same easy miles and never build", () => {
    const { plan } = recoveryPlan(base);
    const miles = plan.weeks.slice(1).map(w => w.plannedMiles);
    assert.deepEqual(miles, [9, 9, 9]);
    for (const w of plan.weeks.slice(1)) assert.ok(w.days.filter(d => d.type === "easy").every(d => d.miles === 3));
    assert.ok(plan.weeks.every(w => w.days.every(d => d.type !== "workout" && d.type !== "long")));
});
test("strength starts in week 2, light, and builds slowly", () => {
    const { plan } = recoveryPlan(base);
    const s = w => plan.weeks[w].days.filter(d => d.type === "strength");
    assert.equal(s(0).length, 0);
    assert.equal(s(1).length, 1);
    assert.equal(s(1)[0].strength.exercises[0].sets, 1);
    assert.equal(s(2).length, 1);
    assert.equal(s(2)[0].strength.exercises[0].sets, 2);
    assert.equal(s(3).length, 2);
});
test("dates are consecutive from a Monday and the start snaps back to Monday", () => {
    const { plan } = recoveryPlan({ ...base, startDate: "2026-11-12" });
    assert.equal(plan.weeks[0].startDate, "2026-11-09");
    const dates = plan.weeks.flatMap(w => w.days.map(d => d.date));
    assert.equal(dates.length, 28);
    assert.equal(dates[27], "2026-12-06");
    assert.equal(mondayOf("2026-11-15"), "2026-11-09");
});
test("settings are bounded; no start date is a problem; name follows the race", () => {
    assert.equal(cleanSettings({ easyMiles: 99, runsPerWeek: 7 }).easyMiles, 8);
    assert.equal(cleanSettings({ runsPerWeek: 7 }).runsPerWeek, 3);
    assert.ok(recoveryPlan({}).problems.length);
    assert.equal(recoveryPlan({ ...base, raceName: "Indy" }).name, "Recovery after Indy");
    assert.equal(recoveryPlan(base).name, "Post Marathon Recovery");
    assert.equal(recoveryPlan(base).plan.generator.settings.engine, "recovery");
});
