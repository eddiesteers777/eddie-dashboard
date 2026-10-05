// Unit tests for the effort scale (js/effortScale.js, audit B5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EFFORT_WORDS, SB1_WORDS, SB1_TO_CR10, toCr10, scaleOf, logScale, effortWords, sessionEndMs, delayMinutes, isLate, CR10_FROM } from "../js/effortScale.js";

test("CR-10 words with its anchors; every number has words", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 7, 10].map(n => EFFORT_WORDS[n]), ["Very easy", "Easy", "Moderate", "Somewhat hard", "Hard", "Very hard", "Maximal"]);
    for (let n = 1; n <= 10; n++) assert.ok(EFFORT_WORDS[n] && SB1_WORDS[n]);
    assert.equal(new Set(Object.values(EFFORT_WORDS)).size, 10, "no two numbers share words (the first list had 'Easy' twice)");
});

test("the first words map onto CR-10 by meaning, never upward past the top, and answers stay as given", () => {
    assert.equal(toCr10(5, "sb1"), 4, "'Steady' ≈ CR-10 3–4");
    assert.equal(toCr10(9, "sb1"), 9);
    assert.equal(toCr10(10, "sb1"), 10);
    assert.equal(toCr10(5, "cr10"), 5);
    assert.equal(toCr10(5), 5);
    assert.equal(toCr10(0, "cr10"), null);
    assert.equal(toCr10("x"), null);
    for (let n = 1; n < 10; n++) assert.ok(SB1_TO_CR10[n] <= SB1_TO_CR10[n + 1], "keeps the order");
    assert.equal(scaleOf({ rpe: 5, at: 1 }), "sb1", "an answer with no scale is from before");
    assert.equal(scaleOf({ rpe: 5, at: 1, scale: "cr10" }), "cr10");
    assert.equal(effortWords(5, "sb1"), "Steady");
    assert.equal(effortWords(5), "Hard");
});

test("a workout log's scale from when it was saved; delay and late", () => {
    assert.equal(logScale(CR10_FROM - 1), "sb1");
    assert.equal(logScale(CR10_FROM), "cr10");
    assert.equal(logScale({ toMillis: () => CR10_FROM + 5 }), "cr10", "a Firestore timestamp");
    assert.equal(logScale("2026-10-02T12:00:00Z"), "sb1");
    assert.equal(logScale(null), "sb1");
    const s = { start: "2026-10-06T11:00:00Z", elapsedSec: 3600, movingSec: 3500 };
    assert.equal(sessionEndMs(s), Date.parse("2026-10-06T12:00:00Z"));
    assert.equal(sessionEndMs({ start: null }), null);
    assert.equal(delayMinutes(Date.parse("2026-10-06T12:40:00Z"), sessionEndMs(s)), 40);
    assert.equal(delayMinutes(Date.parse("2026-10-06T11:40:00Z"), sessionEndMs(s)), 0, "rated during the run (a mark done) is 0, not negative");
    assert.equal(delayMinutes(5, null), null);
    assert.equal(isLate(24 * 60), false);
    assert.equal(isLate(24 * 60 + 1), true);
    assert.equal(isLate(null), false);
});
