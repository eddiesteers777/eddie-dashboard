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

test("firestore.rules allows exactly the schema's fields", () => {
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const block = rules.slice(rules.indexOf("function validClientRecord"));
    const list = block.slice(block.indexOf("hasOnly([") + 9, block.indexOf("])"));
    const ruleKeys = [...list.matchAll(/"([a-zA-Z]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(ruleKeys, [...FIELD_KEYS, ...META_KEYS].sort());
});
