// Unit tests for the client profile schema (js/clientRecordSchema.js).
// Run with: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    sanitizeClientRecord, isIntakeComplete, athleteDisplayName, displayValue,
    FIELDS, FIELD_KEYS, META_KEYS
} from "../js/clientRecordSchema.js";

test("sanitize: trims, caps lengths, drops unknown keys and bad choices", () => {
    const out = sanitizeClientRecord({
        preferredName: "  Sam  ",
        primaryGoal: "x".repeat(900),
        primarySport: "curling",
        strengthExperience: "some",
        isCoachApproved: true,
        availabilityDays: ["sat", "funday", "mon", "mon"],
        targetDate: "next spring",
        birthYear: "1994",
        weeklyMileage: "22.46"
    }, { currentYear: 2026 });
    assert.equal(out.preferredName, "Sam");
    assert.equal(out.primaryGoal.length, 500);
    assert.equal(out.primarySport, "");
    assert.equal(out.strengthExperience, "some");
    assert.equal("isCoachApproved" in out, false);
    assert.deepEqual(out.availabilityDays, ["mon", "sat"], "known days, in week order, once");
    assert.equal(out.targetDate, "");
    assert.equal(out.birthYear, 1994);
    assert.equal(out.weeklyMileage, 22.5);
    assert.equal(out.whoTrains, "self");
});

test("sanitize: numbers outside sensible ranges are dropped", () => {
    const out = sanitizeClientRecord({ birthYear: "3000", weeklyMileage: "-4" }, { currentYear: 2026 });
    assert.equal(out.birthYear, null);
    assert.equal(out.weeklyMileage, null);
    assert.equal(sanitizeClientRecord({ weeklyMileage: "" }).weeklyMileage, null);
    assert.equal(sanitizeClientRecord({ weeklyMileage: "900" }).weeklyMileage, 500);
});

test("sanitize: fields for the other kind of account are blanked", () => {
    const parent = sanitizeClientRecord({ whoTrains: "child", athleteName: "Alex", preferredName: "Jordan" });
    assert.equal(parent.athleteName, "Alex");
    assert.equal(parent.preferredName, "");
    const self = sanitizeClientRecord({ whoTrains: "self", athleteName: "Alex", preferredName: "Sam" });
    assert.equal(self.athleteName, "");
    assert.equal(self.preferredName, "Sam");
});

test("intake is complete with a main goal and a sport", () => {
    assert.equal(isIntakeComplete(null), false);
    assert.equal(isIntakeComplete({ primaryGoal: "Sub-45 10K" }), false);
    assert.equal(isIntakeComplete({ primaryGoal: "  ", primarySport: "running" }), false);
    assert.equal(isIntakeComplete({ primaryGoal: "Sub-45 10K", primarySport: "running" }), true);
});

test("athlete display name", () => {
    assert.equal(athleteDisplayName({ whoTrains: "child", athleteName: "Alex" }, "Jordan"), "Alex");
    assert.equal(athleteDisplayName({ whoTrains: "self", preferredName: "Sammy" }, "Sam"), "Sammy");
    assert.equal(athleteDisplayName(null, "Sam"), "Sam");
});

test("display values", () => {
    const f = key => FIELDS.find(x => x.key === key);
    assert.equal(displayValue(f("primarySport"), "soccer"), "Soccer");
    assert.equal(displayValue(f("availabilityDays"), ["mon", "sat"]), "Mon, Sat");
    assert.equal(displayValue(f("weeklyMileage"), 20), "20 mi");
    assert.equal(displayValue(f("targetDate"), "2026-10-11"), "Oct 11, 2026");
    assert.equal(displayValue(f("phone"), ""), "");
});

test("firestore.rules holds exactly the profile rule the schema makes (node scripts/build-profile-rules.mjs)", async () => {
    const { profileRule, currentProfileRule } = await import("../scripts/build-profile-rules.mjs");
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    assert.equal(currentProfileRule(rules), profileRule(), "run: node scripts/build-profile-rules.mjs");
    const keys = currentProfileRule(rules).match(/join\(","\)\.matches\('\^\(\(([^)]+)\)/)[1].split("|").sort();
    assert.deepEqual(keys, [...FIELD_KEYS, ...META_KEYS].sort());
});

test("sanitize: the tap answers keep only their choices", () => {
    const out = sanitizeClientRecord({
        runsPerWeek: "4", longestRun: "130", eventType: "ironman", yearsRunning: "3-5",
        equipment: ["dumbbells", "yacht", "bands", "dumbbells"], timeOfDay: "morning",
        injuryAreas: ["knee", "ankle"], injuryStatus: "recovering", healthFlags: ["joints", "nosy"],
        emergencyName: "  Pat  ", guardianName: "Jo"
    });
    assert.equal(out.runsPerWeek, 4);
    assert.equal(out.longestRun, 100, "capped at 100 miles");
    assert.equal(out.eventType, "");
    assert.equal(out.yearsRunning, "3-5");
    assert.deepEqual(out.equipment, ["bands", "dumbbells"], "known ones, in list order, once");
    assert.deepEqual(out.timeOfDay, []);
    assert.deepEqual(out.injuryAreas, ["knee", "ankle"]);
    assert.deepEqual(out.healthFlags, ["joints"]);
    assert.equal(out.emergencyName, "Pat");
    assert.equal(out.guardianName, "Jo");
    assert.equal(sanitizeClientRecord({ runsPerWeek: "12" }).runsPerWeek, 7);
    assert.equal(sanitizeClientRecord({ runsPerWeek: "" }).runsPerWeek, null);
    assert.equal(sanitizeClientRecord({ whoTrains: "child", guardianName: "Jo" }).guardianName, "", "a parent's account is already the guardian");
});

test("display values for the tap answers", () => {
    const f = key => FIELDS.find(x => x.key === key);
    assert.equal(displayValue(f("runsPerWeek"), 4), "4 a week");
    assert.equal(displayValue(f("equipment"), ["dumbbells", "bands"]), "Bands, Dumbbells");
    assert.equal(displayValue(f("healthFlags"), ["heart"]), "Heart condition or high blood pressure");
    assert.equal(displayValue(f("sessionLength"), "60"), "An hour");
    assert.equal(displayValue(f("equipment"), []), "");
});
