// Unit tests for the Fueling calculator's steps (js/fuelStepsModel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { STEPS, LAST_STEP, clampStep, stepInfo, nextStep, prevStep, startingStep, barText, runSummary, answerRows } from "../js/fuelStepsModel.js";

test("four steps, the last one is the review, and each has a title and help in plain words", () => {
    assert.equal(STEPS.length, 4);
    assert.equal(LAST_STEP, 4);
    assert.deepEqual(STEPS.map(s => s.title), ["Your run", "About you", "What you carry", "Your plan"]);
    assert.ok(STEPS.every(s => s.help.length > 10 && !/ -- /.test(s.help)), "real words, real dashes");
    assert.equal(stepInfo(3).next, "See my plan", "the step before the plan says where it goes");
    assert.equal(stepInfo(1).next, "Next");
});

test("steps never leave 1 to 4, whatever they are given", () => {
    assert.equal(nextStep(4), 4);
    assert.equal(prevStep(1), 1);
    assert.equal(nextStep(1), 2);
    assert.equal(prevStep(4), 3);
    assert.equal(clampStep(0), 1);
    assert.equal(clampStep(9), 4);
    assert.equal(clampStep("2"), 2);
    assert.equal(clampStep(undefined), 1);
    assert.equal(clampStep(NaN), 1);
});

test("it opens on the review only when a plan is already showing and nothing has been touched", () => {
    assert.equal(startingStep({ planShown: true, touched: false }), 4, "a resumed draft or a Fuel this run link");
    assert.equal(startingStep({ planShown: true, touched: true }), 1, "never jumps under someone who has started");
    assert.equal(startingStep({ planShown: false, touched: false }), 1);
    assert.equal(startingStep(), 1);
});

test("the glass bar shows the numbers, or says what is missing", () => {
    assert.equal(barText({ carbs: "55", fluid: "22", unit: "oz" }), "55 g/hr · 22 oz/hr");
    assert.equal(barText({ carbs: 55.4, fluid: 650.2, unit: "ml" }), "55 g/hr · 650 ml/hr");
    assert.equal(barText({ carbs: "", fluid: "" }), "Add a distance or time");
    assert.equal(barText({ carbs: "0", fluid: "22" }), "Add a distance or time", "zero is no plan");
    assert.equal(barText({ carbs: "40" }), "40 g/hr", "a missing fluid is left out, not guessed");
    assert.equal(barText(), "Add a distance or time");
});

test("the run is summarised from what is filled in, and nothing else", () => {
    assert.equal(runSummary({ type: "Long Run", distance: "14", duration: "125", pace: "8:56" }), "Long Run · 14 mi · 125 min · 8:56/mi");
    assert.equal(runSummary({ type: "Easy Run", duration: "45" }), "Easy Run · 45 min");
    assert.equal(runSummary({ distance: "10", pace: "5:30/km" }), "10 mi · 5:30/km", "a pace that names its unit keeps it");
    assert.equal(runSummary({}), "Nothing yet");
    assert.equal(runSummary({ distance: "0", duration: "" }), "Nothing yet");
});

test("the review has a row for each part, each with the step its Edit button goes to", () => {
    const rows = answerRows({
        run: { type: "Long Run", distance: "14", duration: "125", pace: "8:56" },
        tune: { you: "165 lb · normal stomach", conditions: "75°F · 55% humidity", sodium: "Not sure", carry: "gels · no caffeine" }
    });
    assert.deepEqual(rows.map(r => [r.key, r.step]), [["run", 1], ["you", 2], ["weather", 2], ["carry", 3]]);
    assert.equal(rows[0].summary, "Long Run · 14 mi · 125 min · 8:56/mi");
    assert.equal(rows[2].summary, "75°F · 55% humidity");
    const empty = answerRows();
    assert.ok(empty.every(r => r.summary), "an empty row says so in words, never blank");
});
