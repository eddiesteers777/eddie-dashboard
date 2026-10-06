import { test } from "node:test";
import assert from "node:assert/strict";
import { autoCategory, autoRunCategory, categoryFor, FEATURED_CATEGORIES } from "../js/featuredTrainingModel.js";

const plan = (overrides = {}) => ({ workout: { sets: overrides.sets || [] }, type: overrides.type || "workout" });

test("interval formatting is Speed Work even when the day is long enough to look like a long run", () => {
    const s = "14 mi with 6x800 @ 5K";
    assert.equal(autoCategory({ miles: 14, session: s, pace: "Threshold" }, plan({
        sets: [{ repeat: 6, amount: 800, unit: "m", effort: "hard" }]
    })), FEATURED_CATEGORIES.SPEED_WORK);
});

test("mixed repeats are Speed Work", () => {
    const s = "4x(1mi @ MP, 1mi @ threshold)";
    assert.equal(autoCategory({ miles: 8, session: s, pace: "Threshold" }, plan({
        sets: [{ repeat: 4, parts: [{ amount: 1, unit: "mi" }] }]
    })), FEATURED_CATEGORIES.SPEED_WORK);
});

test("long-run wording stays Long Run", () => {
    const s = "18-mile long run";
    assert.equal(autoCategory({ miles: 18, session: s, pace: "Long Run" }, plan({ type: "long" })), FEATURED_CATEGORIES.LONG_RUN);
});

test("a single threshold block is not automatically Speed Work", () => {
    const s = "3mi @ threshold";
    assert.equal(autoCategory({ miles: 7, session: s, pace: "Threshold" }, plan({
        sets: [{ repeat: 1, amount: 3, unit: "mi", effort: "threshold" }]
    })), null);
});

test("explicit overrides win, including Hide", () => {
    const day = { date: "2026-10-06", miles: 7, session: "Tempo 3mi @ threshold", pace: "Threshold" };
    const p = plan({ sets: [{ repeat: 1, amount: 3, unit: "mi", effort: "threshold" }] });
    assert.equal(categoryFor(day, p, { "marathon|2026-10-06": FEATURED_CATEGORIES.SPEED_WORK }), FEATURED_CATEGORIES.SPEED_WORK);
    assert.equal(categoryFor(day, p, { "marathon|2026-10-06": FEATURED_CATEGORIES.NONE }), null);
});

test("completed run can be Speed Work from its activity name without a plan match", () => {
    assert.equal(autoRunCategory({
        date: "2026-10-06",
        distance: 9800,
        duration: 3600,
        name: "6 x 800m"
    }), FEATURED_CATEGORIES.SPEED_WORK);
});

test("completed run can be Long Run from its activity name without a plan match", () => {
    assert.equal(autoRunCategory({
        date: "2026-10-04",
        distance: 26000,
        duration: 8300,
        name: "Saturday long run"
    }), FEATURED_CATEGORIES.LONG_RUN);
});

test("completed run can be Long Run from size alone when it has no plan match", () => {
    assert.equal(autoRunCategory({
        date: "2026-10-03",
        distance: 19300,
        duration: 6900,
        name: "Run"
    }), FEATURED_CATEGORIES.LONG_RUN);
});

test("a nearby planned Speed Work day can classify a completed run even when it was moved", () => {
    assert.equal(autoRunCategory(
        { date: "2026-10-07", distance: 11000, duration: 4200, name: "Run" },
        plan({ sets: [{ repeat: 5, amount: 1000, unit: "m", effort: "hard" }] }),
        FEATURED_CATEGORIES.SPEED_WORK
    ), FEATURED_CATEGORIES.SPEED_WORK);
});
