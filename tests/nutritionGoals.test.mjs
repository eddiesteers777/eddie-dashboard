// Unit tests for daily nutrition goals (js/nutritionGoals.js).
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { COACH_GOALS, GENERAL_GOALS, startingGoals, resolveGoals, withGoal } from "../js/nutritionGoals.js";

test("a client never starts from the coach's numbers", () => {
    assert.deepEqual(resolveGoals(null).goals, GENERAL_GOALS);
    assert.equal(resolveGoals(null).custom, false);
    assert.deepEqual(resolveGoals(null, { isCoach: true }).goals, COACH_GOALS);
});

test("with a body weight, the starting point scales to it", () => {
    assert.deepEqual(startingGoals(160), { calories: 2500, protein: 120, carbs: 375, fat: 55, water: 80, sodium: 2300 });
    assert.deepEqual(startingGoals(120), { calories: 1800, protein: 90, carbs: 275, fat: 40, water: 64, sodium: 2300 });
    assert.deepEqual(startingGoals(0), GENERAL_GOALS, "no weight");
    assert.deepEqual(startingGoals(9000), GENERAL_GOALS, "nonsense weight");
    assert.deepEqual(resolveGoals({}, { bodyWeightLb: 160 }).goals.protein, 120);
});

test("their own goals win, gaps fill from the defaults, junk is ignored", () => {
    const r = resolveGoals({ protein: 150, carbs: "abc", fat: -5 }, { bodyWeightLb: 160 });
    assert.equal(r.custom, true);
    assert.equal(r.goals.protein, 150);
    assert.equal(r.goals.carbs, 375);
    assert.equal(r.goals.fat, 55);
});

test("saving one goal", () => {
    assert.deepEqual(withGoal({ protein: 150 }, "calories", "2400.4"), { protein: 150, calories: 2400 });
    assert.deepEqual(withGoal(null, "water", 90), { water: 90 });
    assert.equal(withGoal({}, "calories", 0), null);
    assert.equal(withGoal({}, "vitamins", 5), null);
});
