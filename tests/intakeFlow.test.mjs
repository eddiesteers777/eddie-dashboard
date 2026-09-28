// Unit tests for the guided profile (js/intakeFlow.js).
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ESSENTIALS, MORE, NONE_EVENT, NONE_INJURIES, isNoneAnswer, realAnswer, essentialsDone, allEssentialsDone,
    startStep, nextStep, prevStep, goalIdeas, milesChoice, MILES_CHOICES, togglePhrase, hasPhrase,
    recentWeeklyMiles, sportFromServices, asksMiles
} from "../js/intakeFlow.js";
import { FIELD_KEYS, sanitizeClientRecord } from "../js/clientRecordSchema.js";

const FULL = {
    primarySport: "running", primaryGoal: "Run a faster race", targetEvent: "Indy Half", targetDate: "2026-12-20",
    availabilityDays: ["tue", "thu", "sat"], weeklyMileage: 20, strengthExperience: "some", injuries: NONE_INJURIES
};

test("six essentials, each using only real profile fields", () => {
    assert.equal(ESSENTIALS.length, 6);
    for (const step of ESSENTIALS) for (const key of step.keys) assert.ok(FIELD_KEYS.includes(key), `${step.id}: ${key}`);
    for (const step of MORE) assert.ok(FIELD_KEYS.includes(step.key), step.id);
    // Every essential is kept by the sanitizer the save path uses (so no rules change is needed).
    const saved = sanitizeClientRecord(FULL);
    assert.equal(essentialsDone(saved), 6);
});

test("essentials count up one by one, and 'none' answers count as answered", () => {
    assert.equal(essentialsDone(null), 0);
    assert.equal(essentialsDone({ primarySport: "running" }), 1);
    assert.equal(essentialsDone({ primarySport: "running", primaryGoal: "  " }), 1, "a blank goal isn't a goal");
    assert.equal(essentialsDone({ ...FULL, targetEvent: NONE_EVENT, targetDate: "" }), 6);
    assert.equal(essentialsDone({ ...FULL, targetEvent: "", targetDate: "2027-04-01" }), 6, "a date alone answers it");
    assert.equal(essentialsDone({ ...FULL, injuries: "" }), 5);
    assert.ok(allEssentialsDone(FULL));
});

test("starting point: runners need miles and strength; others only strength", () => {
    assert.equal(essentialsDone({ ...FULL, weeklyMileage: null }), 5);
    assert.equal(essentialsDone({ ...FULL, weeklyMileage: 0 }), 6, "0 miles is an answer");
    assert.equal(essentialsDone({ ...FULL, primarySport: "soccer", weeklyMileage: null }), 6);
    assert.equal(essentialsDone({ ...FULL, primarySport: "soccer", strengthExperience: "" }), 5);
    assert.ok(asksMiles("running") && asksMiles("general") && !asksMiles("soccer") && !asksMiles("strength"));
});

test("where the guide opens, and the order of screens", () => {
    assert.equal(startStep(null), "welcome");
    assert.equal(startStep({ whoTrains: "self" }), "welcome");
    assert.equal(startStep({ primarySport: "running", primaryGoal: "x" }), "event", "picks up where they left off");
    assert.equal(startStep({ ...FULL, availabilityDays: [] }), "days");
    assert.equal(startStep(FULL), "review");
    assert.deepEqual(["welcome", "sport", "goal", "event", "days", "level", "limits", "more"].map(nextStep),
        ["sport", "goal", "event", "days", "level", "limits", "more", "birthYear"]);
    assert.equal(nextStep("notWorked"), "review");
    assert.equal(prevStep("sport"), "welcome");
    assert.equal(prevStep("birthYear"), "more");
    assert.equal(prevStep("welcome"), null);
});

test("'none' answers are recognised, real ones never are", () => {
    for (const t of [NONE_EVENT, NONE_INJURIES, "none", "None.", "N/A", "na", "no", "Nothing", "not yet", "No injuries", "nothing planned", "No event", "none at the moment", ""]) {
        assert.ok(isNoneAnswer(t), t);
    }
    for (const t of ["No hills for 2 weeks", "Sore left knee", "Nothing above 8 miles yet", "no running on Sundays", "Boston Marathon", "Knee — none of the stairs"]) {
        assert.ok(!isNoneAnswer(t), t);
    }
    assert.equal(realAnswer(NONE_INJURIES), "");
    assert.equal(realAnswer(" Tight Achilles "), "Tight Achilles");
});

test("tap helpers: goal ideas, mileage buttons, coaching wants", () => {
    assert.ok(goalIdeas("running").includes("Run my first 5K"));
    assert.ok(goalIdeas("soccer").includes("Make the team"));
    assert.deepEqual(goalIdeas("unknown"), goalIdeas("general"));
    assert.equal(milesChoice(null), null);
    assert.equal(milesChoice(0), 0);
    assert.equal(milesChoice(12), 10);
    assert.equal(milesChoice(26), 32);
    assert.equal(milesChoice(80), 45);
    for (const c of MILES_CHOICES) assert.equal(milesChoice(c.value), c.value, c.label);
    let text = togglePhrase("", "Someone to keep me accountable");
    text = togglePhrase(text, "Technique and form help");
    assert.equal(text, "Someone to keep me accountable; Technique and form help");
    assert.ok(hasPhrase(text, "technique and form help"));
    assert.equal(togglePhrase(text, "Someone to keep me accountable"), "Technique and form help");
    assert.equal(togglePhrase("I want a real plan", "Motivation on the hard days"), "I want a real plan; Motivation on the hard days", "keeps what they typed");
});

test("weekly miles from COROS or the running log, last 4 weeks, never counted twice", () => {
    const today = "2026-09-30";
    const mi = m => m * 1609.344;
    const coros = [
        { date: "2026-09-29", distance: mi(6) }, { date: "2026-09-20", distance: mi(10) },
        { date: "2026-09-10", distance: mi(8) }, { date: "2026-09-03", distance: mi(16) },
        { date: "2026-08-01", distance: mi(20) }   // too old
    ];
    assert.deepEqual(recentWeeklyMiles({ corosRuns: coros }, today), { miles: 10, runs: 4, source: "COROS" });
    const log = [{ date: "2026-09-29", miles: 6 }, { date: "2026-09-25", miles: 4 }];
    assert.equal(recentWeeklyMiles({ corosRuns: coros, logEntries: log }, today).source, "COROS", "the bigger source, not both added");
    assert.deepEqual(recentWeeklyMiles({ logEntries: log }, today), { miles: 3, runs: 2, source: "your running log" });
    assert.equal(recentWeeklyMiles({ logEntries: [log[0]] }, today), null, "one run isn't enough to go on");
    assert.equal(recentWeeklyMiles({}, today), null);
});

test("a starting sport from the services they asked for", () => {
    assert.equal(sportFromServices(["running", "strength"]), "running");
    assert.equal(sportFromServices(["soccer_1on1"]), "soccer");
    assert.equal(sportFromServices(["strength"]), "strength");
    assert.equal(sportFromServices(["online_coaching"]), "general");
    assert.equal(sportFromServices([]), "");
});
