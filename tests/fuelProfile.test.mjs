import test from "node:test";
import assert from "node:assert/strict";
import {
    resetProfile, readProfile, setProfileFields, clearProfileField, mergeProfiles, profileValue, fieldStatus,
    sessionFromProfile, profileDiff, validateField, lbToKg, kgToLb, weightIn, weightFromDisplay, ASSUMED
} from "../js/fuelProfile.js";

test("answers are saved, checked and timestamped one field at a time", () => {
    const { profile, saved, problems } = setProfileFields(resetProfile(), {
        bodyWeight: "158", tolerance: "high", sweatRateMeasured: 32, currentCarbIntake: "abc", typicalSodiumIntake: 9000, nonsense: 1
    }, 1000);
    assert.deepEqual(saved.sort(), ["bodyWeight", "sweatRateMeasured", "tolerance"]);
    assert.equal(profileValue(profile, "bodyWeight"), 158);
    assert.equal(profile.fields.tolerance.at, 1000);
    assert.ok(problems.currentCarbIntake && problems.typicalSodiumIntake);
    assert.equal(profileValue(profile, "nonsense"), undefined);
});

test("an empty box never wipes a known answer; unchanged answers keep their time", () => {
    let p = setProfileFields(resetProfile(), { bodyWeight: 158, tolerance: "high" }, 1000).profile;
    const r = setProfileFields(p, { bodyWeight: "", tolerance: "high", currentCarbIntake: "  " }, 2000);
    assert.deepEqual(r.saved, []);
    assert.equal(profileValue(r.profile, "bodyWeight"), 158);
    assert.equal(r.profile.fields.tolerance.at, 1000);
    assert.deepEqual(r.problems, {}, "a blank box isn't a problem");
});

test("clearing on purpose leaves a dated blank that survives a merge with an older answer", () => {
    const old = setProfileFields(resetProfile(), { sweatRateMeasured: 30 }, 1000).profile;
    const cleared = clearProfileField(old, "sweatRateMeasured", 2000);
    assert.equal(profileValue(cleared, "sweatRateMeasured"), null);
    assert.equal(fieldStatus(cleared, "sweatRateMeasured"), "estimate");
    const merged = mergeProfiles(cleared, old);
    assert.equal(profileValue(merged, "sweatRateMeasured"), null);
    // Kept through another save and a re-read.
    const again = readProfile(JSON.stringify(setProfileFields(cleared, { bodyWeight: 150 }, 3000).profile));
    assert.equal(again.fields.sweatRateMeasured.cleared, true);
});

test("two phones that each changed a different answer both keep theirs", () => {
    const base = setProfileFields(resetProfile(), { bodyWeight: 160, tolerance: "moderate" }, 1000).profile;
    const phone = setProfileFields(base, { bodyWeight: 155 }, 2000).profile;
    const laptop = setProfileFields(base, { tolerance: "high" }, 2500).profile;
    const m = mergeProfiles(JSON.stringify(phone), JSON.stringify(laptop));
    assert.equal(profileValue(m, "bodyWeight"), 155);
    assert.equal(profileValue(m, "tolerance"), "high");
    // Same field on both: the newer one.
    const later = setProfileFields(base, { bodyWeight: 150 }, 3000).profile;
    assert.equal(profileValue(mergeProfiles(phone, later), "bodyWeight"), 150);
});

test("status tells a measured number from your answer from an estimate", () => {
    const p = setProfileFields(resetProfile(), { sweatRateMeasured: 28, sweatRate: "high" }, 1).profile;
    assert.equal(fieldStatus(p, "sweatRateMeasured"), "measured");
    assert.equal(fieldStatus(p, "sweatRate"), "yours");
    assert.equal(fieldStatus(p, "bodyWeight"), "estimate");
});

test("a new plan starts from the profile, else the page's assumptions (marked)", () => {
    const p = setProfileFields(resetProfile(), { bodyWeight: 140, caffeineWanted: true, fuelPreferences: ["gels", "homemade", "bogus"] }, 1).profile;
    const { values, status } = sessionFromProfile(p);
    assert.equal(values.bodyWeight, 140);
    assert.equal(status.bodyWeight, "yours");
    assert.equal(values.caffeineWanted, true);
    assert.deepEqual(values.fuelPreferences, ["gels", "homemade"]);
    assert.equal(values.temperature, ASSUMED.temperature);
    assert.equal(status.temperature, "estimate");
    assert.equal(values.sweatRateMeasured, "");
});

test("an old plan's numbers that differ from the profile are listed (personal fields only)", () => {
    const p = setProfileFields(resetProfile(), { bodyWeight: 150, tolerance: "high", temperature: 60 }, 1).profile;
    const diff = profileDiff(p, { bodyWeight: 165, tolerance: "high", temperature: 85 });
    assert.deepEqual(diff.map(d => d.key), ["bodyWeight"]);
    assert.equal(diff[0].plan, 165);
});

test("weights convert both ways and stay stored in pounds", () => {
    assert.equal(lbToKg(165), 74.8);
    assert.equal(kgToLb(70), 154.3);
    assert.equal(weightIn(165, "kg"), 74.8);
    assert.equal(weightIn(165, "lb"), 165);
    assert.equal(Math.round(weightFromDisplay(74.8, "kg")), 165);
    assert.equal(validateField("bodyWeight", 30).ok, false);
    assert.equal(validateField("weightUnit", "stone").ok, false);
});

test("junk in storage reads as an empty profile", () => {
    assert.deepEqual(readProfile("not json").fields, {});
    assert.deepEqual(readProfile({ fields: { bodyWeight: { v: "x" } } }).fields, {});
});
