import test from "node:test";
import assert from "node:assert/strict";
import { hrZones, zoneRange } from "../js/hrZones.js";

const gapFree = zones => zones.slice(1).every((z, i) => z.low === zones[i].high + 1);

test("threshold: Friel's seven running zones from LTHR", () => {
    const { zones } = hrZones({ method: "threshold", lthr: 170 });
    assert.deepEqual(zones.map(z => z.key), ["1", "2", "3", "4", "5a", "5b", "5c"]);
    // 85% = 144.5 → 145, 90% = 153, 95% = 161.5 → 162, 100% = 170, 103% = 175.1 → 175, 107% = 181.9 → 182
    assert.deepEqual(zones.map(z => [z.low, z.high]), [
        [null, 144], [145, 152], [153, 161], [162, 169], [170, 174], [175, 181], [182, null]
    ]);
    assert.ok(gapFree(zones));
});

test("max: five zones from 50% to 100% of max", () => {
    const { zones } = hrZones({ method: "max", max: 190 });
    assert.deepEqual(zones.map(z => [z.low, z.high]), [[95, 113], [114, 132], [133, 151], [152, 170], [171, 190]]);
    assert.ok(gapFree(zones));
});

test("reserve: Karvonen adds resting HR to a share of the reserve", () => {
    const { zones } = hrZones({ method: "reserve", max: 190, rest: 50 });
    // reserve 140: 50% → 120, 60% → 134, 70% → 148, 80% → 162, 90% → 176
    assert.deepEqual(zones.map(z => [z.low, z.high]), [[120, 133], [134, 147], [148, 161], [162, 175], [176, 190]]);
    assert.ok(gapFree(zones));
});

test("bad or missing numbers explain themselves instead of returning zones", () => {
    assert.match(hrZones({ method: "threshold", lthr: "" }).error, /threshold/);
    assert.match(hrZones({ method: "threshold", lthr: 400 }).error, /threshold/);
    assert.match(hrZones({ method: "max", max: 80 }).error, /maximum/);
    assert.match(hrZones({ method: "reserve", max: 190 }).error, /resting/);
    assert.match(hrZones({ method: "reserve", max: 150, rest: 120 }).error, /resting/i);
    assert.match(hrZones({}).error, /method/);
});

test("ranges read plainly, open ends included", () => {
    assert.equal(zoneRange({ low: null, high: 144 }), "Under 145 bpm");
    assert.equal(zoneRange({ low: 182, high: null }), "182+ bpm");
    assert.equal(zoneRange({ low: 145, high: 152 }), "145–152 bpm");
});
