import test from "node:test";
import assert from "node:assert/strict";
import { heartRateZones, zoneInputError, estimateMaxHr, zoneFor, ZONES } from "../js/heartZones.js";

test("zones from max HR alone are shares of max", () => {
    const r = heartRateZones({ maxHr: 190 });
    assert.equal(r.method, "max");
    assert.deepEqual(r.zones.map(z => [z.low, z.high]), [[95, 113], [114, 132], [133, 151], [152, 170], [171, 190]]);
});

test("with a resting HR, zones are shares of the heart rate reserve", () => {
    const r = heartRateZones({ maxHr: 190, restHr: 50 });
    assert.equal(r.method, "reserve");
    // 50 + 140 × 60% = 134, 70% = 148, 80% = 162, 90% = 176
    assert.deepEqual(r.zones.map(z => [z.low, z.high]), [[120, 133], [134, 147], [148, 161], [162, 175], [176, 190]]);
});

test("zones touch but never overlap, and the last ends at max", () => {
    for (const input of [{ maxHr: 183 }, { maxHr: 201, restHr: 44 }, { maxHr: "176", restHr: "61" }]) {
        const { zones, maxHr } = heartRateZones(input);
        assert.equal(zones.length, ZONES.length);
        for (let i = 1; i < zones.length; i++) assert.equal(zones[i].low, zones[i - 1].high + 1);
        assert.equal(zones.at(-1).high, maxHr);
        zones.forEach(z => assert.ok(z.low <= z.high));
    }
});

test("bad inputs get a plain-words reason, and heartRateZones refuses them", () => {
    assert.match(zoneInputError({}), /max heart rate/);
    assert.match(zoneInputError({ maxHr: 90 }), /between 120 and 230/);
    assert.match(zoneInputError({ maxHr: 190, restHr: 20 }), /Resting heart rate/);
    assert.match(zoneInputError({ maxHr: 150, restHr: 100 }), /too close/);
    assert.equal(zoneInputError({ maxHr: 190, restHr: "" }), null);
    assert.throws(() => heartRateZones({ maxHr: 300 }));
});

test("max HR estimate from age uses Tanaka (208 − 0.7 × age)", () => {
    assert.equal(estimateMaxHr(30), 187);
    assert.equal(estimateMaxHr(50), 173);
    assert.equal(estimateMaxHr(""), null);
    assert.equal(estimateMaxHr(5), null);
});

test("zoneFor places a heart rate in its zone", () => {
    const r = heartRateZones({ maxHr: 190 });
    assert.equal(zoneFor(140, r), 3);
    assert.equal(zoneFor(151, r), 3);
    assert.equal(zoneFor(152, r), 4);
    assert.equal(zoneFor(80, r), 0);
    assert.equal(zoneFor(200, r), 5);
    assert.equal(zoneFor(140, null), null);
});
