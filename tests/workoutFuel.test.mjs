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
    const { why, fluidWhy, sodiumWhy, basis, ...t } = calculateTargets({ workoutType: "long", distance: 12, mode: "training" });
    assert.deepEqual(t, { duration: 99, carbsPerHour: 40, fluidPerHour: 22, sodiumPerHour: 450 });
    assert.equal(why.length, 1, "a long run: just the base");
    assert.equal(estimateDurationMinutes({ duration: 70 }), 70);
    assert.equal(calculateTargets({ workoutType: "easy", duration: 40 }).carbsPerHour, 0, "under 45 min: no carbs");
    assert.equal(calculateTargets({ workoutType: "race", duration: 200, mode: "race" }).carbsPerHour, 80);
    assert.equal(calculateTargets({ workoutType: "long", duration: 100, tolerance: "low" }).carbsPerHour, 30);
});

test("a long run: before, gels by time and mile (caffeine last), after", () => {
    const f = fuelForRun({ type: "long", miles: 12, coachNote: "Practice race-day fueling." }, { profile: { bodyWeight: 160, caffeineWanted: true }, library });
    assert.equal(f.level, "full");
    assert.equal(f.durationMin, 99);
    assert.deepEqual(f.gels.map(g => [g.clock, g.mile, g.name]), [["0:30", 3.6, "Hammer Gel"], ["0:57", 6.9, "Hammer Gel"], ["1:24", 10.2, "Caffeinated Carb Gel"]]);
    assert.equal(f.summary, "3 gels, first at 0:30 · 21 oz/hr");
    // In ml when that's their choice.
    const ml = fuelForRun({ type: "long", miles: 12 }, { profile: { bodyWeight: 160 }, library, unit: "ml" });
    assert.match(ml.summary, / · 620 ml\/hr$/);
    assert.ok(ml.during.includes("620 ml fluid an hour"));
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

test("a structured workout: gels at the same times, at the miles its own paces reach", () => {
    const workout = {
        warmup: { amount: 2, unit: "mi" },
        sets: [{ repeat: 6, amount: 1, unit: "mi", pace: "6:50", recovery: { amount: 0.25, unit: "mi", note: "jog" } }],
        cooldown: { amount: 8.75, unit: "mi" }
    };
    const plain = fuelForRun({ type: "long", miles: 18 });
    const paced = fuelForRun({ type: "long", miles: 18, workout });
    assert.deepEqual(paced.gels.map(g => g.movedFrom?.min ?? g.min), plain.gels.map(g => g.min));
    assert.notDeepEqual(paced.gels.map(g => g.mile), plain.gels.map(g => g.mile));
    assert.ok(paced.gels.some(g => g.movedFrom && /^Rep /.test(g.movedFrom.part)), "a gel due during a rep moves to a jog");
});

test("a measured sweat rate replaces most of what's lost, never more, and at most a liter an hour", () => {
    const base = { workoutType: "long", duration: 120 };
    const guess = calculateTargets(base);
    assert.equal(guess.basis.fluid, "estimate");
    assert.ok(guess.fluidWhy.length >= 1);
    const m = calculateTargets({ ...base, sweatRateMeasured: 30 });
    assert.equal(m.fluidPerHour, 21, "70% of 30");
    assert.equal(m.basis.fluid, "measured");
    const heavy = calculateTargets({ ...base, sweatRateMeasured: 70 });
    assert.equal(heavy.fluidPerHour, 34, "capped");
    assert.match(heavy.fluidWhy.at(-1).label, /Capped/);
    // Weather and weight don't move a measured number.
    assert.equal(calculateTargets({ ...base, sweatRateMeasured: 30, temperature: 95, bodyWeight: 220 }).fluidPerHour, 21);
});

test("measured sweat sodium covers the sodium in what you'll drink; else what you take now; else an estimate", () => {
    const base = { workoutType: "long", duration: 120, sweatRateMeasured: 30 };
    const m = calculateTargets({ ...base, sweatSodiumMeasured: 1000, typicalSodiumIntake: 300 });
    assert.equal(m.basis.sodium, "measured");
    assert.equal(m.sodiumPerHour, 625, "1,000 mg/L x 21 oz (0.62 L) to the nearest 25");
    assert.ok(m.sodiumWhy.some(w => /take about 300/.test(w.label)));
    assert.equal(calculateTargets({ ...base, typicalSodiumIntake: 300 }).basis.sodium, "yours");
    const e = calculateTargets({ workoutType: "long", duration: 120, temperature: 90 });
    assert.equal(e.basis.sodium, "estimate");
    assert.equal(e.sodiumPerHour, 550);
});

test("workout pages use the fueling profile first, then the last saved plan", () => {
    const plans = [{ date: "2026-10-01", session: { bodyWeight: 170, tolerance: "low" } }];
    const profile = { v: 1, fields: { bodyWeight: { v: 158, at: 1 }, sweatRateMeasured: { v: 30, at: 1 }, tolerance: { v: null, at: 2, cleared: true } } };
    const p = profileFromPlans(plans, profile);
    assert.equal(p.bodyWeight, 158);
    assert.equal(p.sweatRateMeasured, 30);
    assert.equal(p.tolerance, "low", "a cleared answer falls back to the plan");
    assert.deepEqual(profileFromPlans([], null), {});
});

test("intake checks: carbs and sodium off target, drinking past sweat, too much caffeine", async () => {
    const { intakeChecks } = await import("../js/fuelTargets.js");
    const base = { durationMin: 120, targets: { carbsPerHour: 60, fluidPerHour: 20, sodiumPerHour: 500 }, bodyWeightLb: 150, sweatRateMeasured: 20 };
    assert.deepEqual(intakeChecks({ ...base, planned: { carbs: 120, sodium: 1000, fluidOz: 30 } }), [], "on target");
    const low = intakeChecks({ ...base, planned: { carbs: 75, sodium: 400, fluidOz: 30 } });
    assert.deepEqual(low.map(c => c.kind), ["carbs", "sodium"]);
    assert.match(low[0].text, /38% under the 120 g/);
    const wet = intakeChecks({ ...base, planned: { carbs: 120, sodium: 1000, fluidOz: 50 } });
    assert.match(wet[0].text, /\{fluid:50\}.*\{fluid:40\}/);
    assert.equal(intakeChecks({ ...base, planned: { carbs: 120, sodium: 1000, caffeineMg: 450 } })[0].kind, "caffeine");
    assert.deepEqual(intakeChecks({ ...base, durationMin: 0, planned: { carbs: 1 } }), []);
});
