import test from "node:test";
import assert from "node:assert/strict";
import { cleanQuestions, cleanAnswers, savedAnswers, MAX_QUESTION, MAX_ANSWER } from "../js/workoutQuestions.js";

test("questions: one per line, trimmed, at most two, each capped", () => {
    assert.deepEqual(cleanQuestions("  How were the hills?  \n\n How is the calf?\nThird one"), ["How were the hills?", "How is the calf?"]);
    assert.deepEqual(cleanQuestions(""), []);
    assert.deepEqual(cleanQuestions(null), []);
    assert.equal(cleanQuestions("x".repeat(500))[0].length, MAX_QUESTION);
    assert.deepEqual(cleanQuestions(["a  b", " ", "c"]), ["a b", "c"]);
});

test("answers keep the question beside them and drop blanks", () => {
    assert.deepEqual(cleanAnswers(["Hills?", "Calf?"], ["Strong", "  "]), [{ q: "Hills?", a: "Strong" }]);
    assert.deepEqual(cleanAnswers(["Hills?"], undefined), []);
    assert.equal(cleanAnswers(["Q"], ["y".repeat(900)])[0].a.length, MAX_ANSWER);
});

test("saved answers: ignores junk, old logs have none", () => {
    assert.deepEqual(savedAnswers({}), []);
    assert.deepEqual(savedAnswers({ answers: [{ q: "Q", a: "A" }, { q: 1, a: "x" }, null, { q: "Q2", a: " " }] }), [{ q: "Q", a: "A" }]);
});
