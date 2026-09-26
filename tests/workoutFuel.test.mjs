// Unit tests for fuel on the workout (js/workoutFuel.js, js/fuelTargets.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { fuelForRun, profileFromPlans, pickGels, gelCues } from "../js/workoutFuel.js";
import { calculateTargets, estimateDurationMinutes } from "../js/fuelTargets.js";

const library = [
    { category: "gels", name: "Hammer Gel", carbs: 22, sodium: 25, caffeine: false },
    { category: "gels", name: "Caffeinated Carb Gel", carbs: 25, sodium: 60, caffeine: true },
    { category: "drinkmix", name: "Isotonic Drink Mix", carbs: 22, sodium: 300 }
];

test("targets: the Fueling page's math, now shared", () => {
    assert.deepEqual(calculateTargets({ workoutType: "long", distance: 12, mode: "training" }), { duration: 99, carbsPerHour: 45, fluidPerHour: 22, sodiumPerHour: 450 });
    assert.equal(estimateDurationMinutes({ duration: 70 }), 70);
    assert.equal(calculateTargets({ workoutType: "easy", duration: 40 }).carbsPerHour, 0, "under 45 min: no carbs");
    assert.equal(calculateTargets({ workoutType: "race", duration: 200, mode: "race" }).carbsPerHour, 75);
    assert.equal(calculateTargets({ workoutType: "long", duration: 100, tolerance: "low" }).carbsPerHour, 30);
});

test("a long run: before, gels by time and mile (caffeine last), after", () => {
    const f = fuelForRun({ type: "long", miles: 12, coachNote: "Practice race-day fueling." }, { profile: { bodyWeight: 160, caffeineWanted: true }, library });
    assert.equal(f.level, "full");
    assert.equal(f.durationMin, 99);
    assert.deepEqual(f.gels.map(g => [g.clock, g.mile, g.name]), [["0:30", 3.6, "Hammer Gel"], ["0:57", 6.9, "Hammer Gel"], ["1:24", 10.2, "Caffeinated Carb Gel"]]);
    assert.equal(f.summary, "3 gels, first at 0:30 · 21 oz/hr");
    assert.match(f.before[0].text, /^About 70 g of carbs/);
    assert.equal(f.before[1].when, "15-30 min before");
    assert.match(f.after[0], /about 70 g carbs \+ 20-30 g protein/);
    assert.equal(f.coachNote, "Practice race-day fueling.");
    assert.deepEqual(gelCues(f).map(c => c.min), [30, 57, 84]);
});

test("short and easy: nothing to carry; hard: eat before and refuel after", () => {
    const easy = fuelForRun({ type: "easy", miles: 5 }, { library });
    assert.equal(easy.level, "none");
    assert.deepEqual(easy.gels, []);
    assert.equal(easy.summary, "");
    assert.deepEqual(easy.during, ["No fuel needed. Water if it's hot."]);
    const hard = fuelForRun({ type: "workout", miles: 6 }, { library });
    assert.equal(hard.level, "none");
    assert.equal(hard.before[0].when, "1-2 hours before");
    assert.match(hard.after[0], /protein/);
    // 65 minutes easy: one plain gel, never the caffeinated one.
    const mid = fuelForRun({ type: "easy", miles: 7.5 }, { profile: { caffeineWanted: true }, library });
    assert.equal(mid.level, "light");
    assert.deepEqual(mid.gels.map(g => [g.clock, g.caffeine]), [["0:40", false]]);
});

test("their inputs and gels, or sensible defaults", () => {
    assert.deepEqual(profileFromPlans([
        { date: "2026-09-01", session: { bodyWeight: 150 } },
        { date: "2026-09-20", session: { bodyWeight: 158, sweatRate: "high", pace: "8:00" }, caffeine: true }
    ]), { bodyWeight: 158, sweatRate: "high", caffeineWanted: true });
    assert.deepEqual(profileFromPlans([]), {});
    assert.equal(pickGels([], false).plain.name, "Energy gel");
    assert.equal(pickGels(library, false).caffeinated, null);
    const f = fuelForRun({ type: "long", miles: 12 }, {});
    assert.equal(f.gels[0].name, "Energy gel");
    assert.match(f.before[0].text, /^A carb-focused meal/);
    // Heavy sweater, hot day: more fluid.
    assert.ok(fuelForRun({ type: "long", miles: 12 }, { profile: { sweatRate: "high", temperature: 88 } }).targets.fluidPerHour > f.targets.fluidPerHour);
    // A run's own planned duration wins over the estimate.
    assert.equal(fuelForRun({ type: "long", miles: 12, durationMin: 110 }).durationMin, 110);
});
