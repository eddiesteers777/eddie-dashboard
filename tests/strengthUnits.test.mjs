import { test } from "node:test";
import assert from "node:assert/strict";
import {
    cleanSettings, toDisplay, fromDisplay, nudge, weightText, loadText, setShort,
    isBodyweightEquipment, isBodyweight, rirFromRpe, rpeFromRir, effortText, effortOptions, plateMath, volumeText, stepFor
} from "../js/strengthUnits.js";

test("settings default to lb + RPE and ignore nonsense", () => {
    assert.deepEqual(cleanSettings(null), { unit: "lb", effort: "rpe" });
    assert.deepEqual(cleanSettings({ unit: "kg", effort: "rir" }), { unit: "kg", effort: "rir" });
    assert.deepEqual(cleanSettings({ unit: "stone", effort: 7 }), { unit: "lb", effort: "rpe" });
});

test("weights are stored in lb and shown in either unit, round-tripping what was typed", () => {
    assert.equal(toDisplay(185, "lb"), 185);
    assert.equal(toDisplay(220.46, "kg"), 100);
    for (const kg of [2.5, 20, 60, 100, 102.5, 142.5, 250]) {
        assert.equal(toDisplay(fromDisplay(kg, "kg"), "kg"), kg, `${kg} kg`);
    }
    assert.equal(fromDisplay("", "kg"), 0);
    assert.equal(fromDisplay(-5, "lb"), 0);
    assert.equal(weightText(185, "kg"), "83.9 kg");
    assert.equal(weightText(135, "lb"), "135 lb");
});

test("+/- moves 5 lb or 2.5 kg in the shown unit", () => {
    assert.equal(nudge(135, "lb", 1), 140);
    assert.equal(nudge(0, "lb", -1), 0);
    assert.equal(toDisplay(nudge(fromDisplay(60, "kg"), "kg", 1), "kg"), 62.5);
    assert.equal(stepFor("kg"), 2.5);
});

test("bodyweight exercises: BW, BW + added load", () => {
    assert.equal(isBodyweightEquipment("body only"), true);
    assert.equal(isBodyweightEquipment("Bodyweight"), true);
    assert.equal(isBodyweightEquipment("barbell"), false);
    assert.equal(isBodyweight({ equipment: "body only" }), true, "older pull-ups read as bodyweight");
    assert.equal(isBodyweight({ equipment: "body only", load: "weighted" }), false);
    assert.equal(isBodyweight({ equipment: "barbell", load: "bw" }), true);
    assert.equal(isBodyweight({ equipment: "dumbbell" }), false);
    assert.equal(loadText(0, "lb", true), "BW");
    assert.equal(loadText(25, "lb", true), "BW + 25 lb");
    assert.equal(loadText(0, "lb", false), "");
    assert.equal(setShort({ weight: 0, reps: 10 }, "lb", { bodyweight: true }), "BW×10");
    assert.equal(setShort({ weight: 22.05, reps: 8 }, "kg", { bodyweight: true }), "BW+10×8");
    assert.equal(setShort({ weight: 185, reps: 5 }, "kg"), "83.9×5");
    assert.equal(setShort({ duration: 45 }, "lb", { time: true }), "45s");
});

test("reps in reserve is 10 − RPE, stored as RPE", () => {
    assert.equal(rirFromRpe(8), 2);
    assert.equal(rirFromRpe(10), 0);
    assert.equal(rirFromRpe(""), null);
    assert.equal(rpeFromRir(2), 8);
    assert.equal(rpeFromRir(0), 10);
    assert.equal(effortText(8, "rpe"), "RPE 8");
    assert.equal(effortText(8, "rir"), "2 RIR");
    assert.equal(effortText(0, "rir"), "");
    const rir = effortOptions("rir", 8);
    assert.deepEqual(rir.map(o => o.label), ["0", "1", "2", "3", "4", "5"]);
    assert.equal(rir.find(o => o.selected).value, 8);
    assert.ok(effortOptions("rir", 3).some(o => o.value === 3 && o.label === "7" && o.selected), "an older low RPE still shows");
    assert.equal(effortOptions("rpe", 7).length, 10);
});

test("plates per side in lb and kg; volume in the shown unit", () => {
    assert.deepEqual(plateMath(225, "lb").plates, [45, 45]);
    assert.equal(plateMath(45, "lb").perSide, 0);
    const kg = plateMath(fromDisplay(100, "kg"), "kg");
    assert.equal(kg.bar, 20);
    assert.deepEqual(kg.plates, [25, 15]);
    assert.equal(volumeText(12400, "lb"), "12,400 lb");
    assert.equal(volumeText(12400, "kg"), "5,625 kg");
});
