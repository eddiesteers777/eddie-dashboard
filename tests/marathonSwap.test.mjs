// Unit tests for swapping two days of a marathon week (js/marathonSwap.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { swapBlocker, swapOverrides, swapFuelPlans, fuelPlansOn } from "../js/marathonSwap.js";

const KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const day = (session, miles, extra = {}) => ({ session, miles, pace: "Easy", race: false, strength: [], mobility: [], recovery: [], crossTraining: [], notes: "", ...extra });
const DAYS = [day("Recovery", 6), day("Easy", 8), day("Easy", 7), day("MP", 10), day("Easy", 5), day("20-mile long run", 20, { pace: "MP", notes: "race shoes" }), day("Easy", 5, { strength: ["Squats 3x8"] })];

test("two days trade session, miles, pace and their lists", () => {
    const out = swapOverrides({}, DAYS, KEYS, 14, "Sat", "Sun");
    assert.equal(out[14].Sun.session, "20-mile long run");
    assert.equal(out[14].Sun.miles, 20);
    assert.equal(out[14].Sun.pace, "MP");
    assert.equal(out[14].Sun.notes, "race shoes");
    assert.deepEqual(out[14].Sun.strength, []);
    assert.equal(out[14].Sat.session, "Easy");
    assert.deepEqual(out[14].Sat.strength, ["Squats 3x8"]);
});

test("swapping is its own inverse and leaves other days and fields alone", () => {
    const start = { 14: { Mon: { miles: 7 }, Sat: { description: "kept" } } };
    const once = swapOverrides(start, DAYS, KEYS, 14, "Sat", "Sun");
    assert.equal(once[14].Mon.miles, 7);
    assert.equal(once[14].Sat.description, "kept");
    assert.deepEqual(start[14].Sat, { description: "kept" }, "input is not changed");
    const resolved = DAYS.map((d, i) => ({ ...d, ...(once[14][KEYS[i]] || {}) }));
    const back = swapOverrides(once, resolved, KEYS, 14, "Sat", "Sun");
    assert.equal(back[14].Sat.session, "20-mile long run");
    assert.equal(back[14].Sun.session, "Easy");
});

test("a race day, or the same day, can't be swapped", () => {
    const withRace = DAYS.map((d, i) => (i === 6 ? { ...d, race: true } : d));
    assert.equal(swapBlocker(withRace, KEYS, "Sat", "Sun"), "race");
    assert.equal(swapBlocker(DAYS, KEYS, "Sat", "Sat"), "same");
    assert.equal(swapBlocker(DAYS, KEYS, "Sat", "Sun"), "");
});

test("fueling plans follow their run: day and id re-pointed, other weeks untouched", () => {
    const plans = [
        { id: "w14-Sat", name: "Long run gels", marathonRef: { week: 14, dayKey: "Sat" } },
        { id: "w14-Sun", name: "Easy", marathonRef: { week: 14, dayKey: "Sun" } },
        { id: "w13-Sat", name: "Last week", marathonRef: { week: 13, dayKey: "Sat" } },
        { id: 99, name: "Custom", marathonRef: null }
    ];
    const out = swapFuelPlans(plans, 14, "Sat", "Sun", 5);
    assert.equal(fuelPlansOn(out, 14, "Sun")[0].name, "Long run gels");
    assert.equal(out[0].id, "w14-Sun");
    assert.equal(out[0].updatedAt, 5);
    assert.equal(fuelPlansOn(out, 14, "Sat")[0].name, "Easy");
    assert.equal(out[2], plans[2]);
    assert.equal(out[3], plans[3]);
});

test("a plan with a custom id keeps it", () => {
    const out = swapFuelPlans([{ id: 123, marathonRef: { week: 14, dayKey: "Sat" } }], 14, "Sat", "Sun");
    assert.equal(out[0].id, 123);
    assert.equal(out[0].marathonRef.dayKey, "Sun");
});
