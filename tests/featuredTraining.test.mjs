import { test } from "node:test";
import assert from "node:assert/strict";
import { autoCategory, categoryFor, FEATURED_CATEGORIES } from "../js/featuredTraining.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";

const parsed = function (s) {
    return planDayFromMarathon({ session: s, miles: 8, pace: "Threshold" }, PACES);
};

test("interval formatting is Speed Work even when the day is long enough to look like a long run", function () {
    const s = "14 mi with 6x800 @ 5K";
    assert.equal(autoCategory({ miles: 14, session: s, pace: "Threshold" }, parsed(s)), FEATURED_CATEGORIES.SPEED_WORK);
});

test("mixed repeats are Speed Work", function () {
    const s = "4x(1mi @ MP, 1mi @ threshold)";
    assert.equal(autoCategory({ miles: 8, session: s, pace: "Threshold" }, parsed(s)), FEATURED_CATEGORIES.SPEED_WORK);
});

test("long-run wording stays Long Run", function () {
    const s = "18-mile long run";
    assert.equal(autoCategory({ miles: 18, session: s, pace: "Long Run" }, parsed(s)), FEATURED_CATEGORIES.LONG_RUN);
});

test("a single threshold block is not automatically Speed Work", function () {
    const s = "3mi @ threshold";
    assert.equal(autoCategory({ miles: 7, session: s, pace: "Threshold" }, parsed(s)), null);
});

test("explicit overrides win, including Hide", function () {
    const day = { date: "2026-10-06", miles: 7, session: "Tempo 3mi @ threshold", pace: "Threshold" };
    const p = parsed(day.session);
    assert.equal(categoryFor(day, p, { "marathon|2026-10-06": FEATURED_CATEGORIES.SPEED_WORK }), FEATURED_CATEGORIES.SPEED_WORK);
    assert.equal(categoryFor(day, p, { "marathon|2026-10-06": FEATURED_CATEGORIES.NONE }), null);
});
