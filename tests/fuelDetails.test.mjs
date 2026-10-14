import test from "node:test";
import assert from "node:assert/strict";
import { profileKnowsEssentials, detailsSummary, detailsBarText, startsFolded, ESSENTIAL_KEYS } from "../js/fuelDetails.js";
import { resetProfile, setProfileFields } from "../js/fuelProfile.js";

const profile = values => setProfileFields(resetProfile(), values, 1000).profile;

test("the basics are weight, tolerance and stomach", () => {
    assert.deepEqual(ESSENTIAL_KEYS, ["bodyWeight", "tolerance", "stomachSensitivity"]);
});

test("an empty profile doesn't know the athlete; the page's assumptions don't count", () => {
    assert.equal(profileKnowsEssentials(resetProfile()), false);
    assert.equal(profileKnowsEssentials(null), false);
    assert.equal(profileKnowsEssentials(profile({ bodyWeight: 160 })), false, "weight alone isn't enough");
    assert.equal(profileKnowsEssentials(profile({ bodyWeight: 160, tolerance: "moderate" })), false);
});

test("weight, tolerance and stomach in the profile are enough", () => {
    assert.equal(profileKnowsEssentials(profile({ bodyWeight: 160, tolerance: "high", stomachSensitivity: "sensitive" })), true);
});

test("the line says only what is filled in", () => {
    const text = detailsSummary({ weight: "165", weightUnit: "lb", tolerance: "moderate", stomach: "normal", sweatRate: "high", sweatSodium: "unknown", preferences: ["gels", "chews"], caffeine: false });
    assert.equal(text, "165 lb · moderate fueling tolerance · normal stomach · heavy sweater · likes gels, chews");
    assert.ok(!/unknown/.test(text), "an unknown salty-sweat guess isn't mentioned");
    assert.equal(detailsSummary({}), "");
    assert.equal(detailsSummary(), "");
});

test("measured numbers replace the guesses and say so", () => {
    const text = detailsSummary({ weight: "72", weightUnit: "kg", tolerance: "high", stomach: "iron", sweatRate: "low", sweatRateMeasured: "28", fluidUnit: "oz", sweatSodium: "heavy", sweatSodiumMeasured: "900", currentCarbIntake: "45", typicalSodiumIntake: "300", caffeine: true });
    assert.match(text, /72 kg/);
    assert.match(text, /sweats 28 oz\/hr \(measured\)/);
    assert.ok(!/light sweater/.test(text), "the measured rate wins over the guess");
    assert.match(text, /sweat sodium 900 mg\/L \(measured\)/);
    assert.ok(!/heavy salty sweat/.test(text));
    assert.match(text, /45 g\/hr carbs now/);
    assert.match(text, /300 mg\/hr sodium now/);
    assert.match(text, /caffeine on$/);
    assert.match(detailsSummary({ sweatRateMeasured: "830", fluidUnit: "ml" }), /830 ml\/hr/);
});

test("zero or empty intake isn't mentioned", () => {
    const text = detailsSummary({ weight: "165", currentCarbIntake: "0", typicalSodiumIntake: "", tolerance: "low" });
    assert.ok(!/carbs now|sodium now/.test(text));
});

test("the bar's words for each state", () => {
    const folded = detailsBarText(true, "165 lb · moderate fueling tolerance");
    assert.deepEqual(folded, { lead: "165 lb · moderate fueling tolerance", button: "Edit my details", expanded: false });
    assert.equal(detailsBarText(true, "").lead, "Filled in from your profile.");
    const open = detailsBarText(false, "ignored");
    assert.equal(open.button, "Hide my details");
    assert.equal(open.expanded, true);
    assert.ok(!/ -- /.test(open.lead + folded.lead), "real dashes only");
});

test("folded only for someone whose profile knows them, who hasn't kept it open, with nothing to fix", () => {
    assert.equal(startsFolded({ known: true }), true);
    assert.equal(startsFolded({ known: false }), false, "a new athlete sees every field");
    assert.equal(startsFolded({ known: true, choice: "open" }), false, "their own choice wins");
    assert.equal(startsFolded({ known: true, choice: "folded" }), true);
    assert.equal(startsFolded({ known: true, hasProblem: true }), false, "a number to check is never hidden");
});
