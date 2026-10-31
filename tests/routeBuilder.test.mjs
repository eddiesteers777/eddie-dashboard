// Unit tests for the route builder's pure modules (js/route*.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePolyline, haversine, thinLine, isLoop, lineMiles, boundsOf, boxContains } from "../js/routeGeo.js";
import { categoryForWay, makeWay, scoreLine, scoreQuarters, percentages, xStretches } from "../js/routeScore.js";
import { climbRange, smoothedGainFt } from "../js/routeElevation.js";
import { fuelPlan, fuelLines, bandFor } from "../js/routeFuel.js";
import { buildGpx, parseGpxPoints, gpxFileName } from "../js/routeGpx.js";
import { generateLoop, loopPoints, LOOP_MAX_ATTEMPTS } from "../js/routeLoop.js";
import { shiftWaypoints, keepShifted, optimise } from "../js/routeOptimise.js";
import { explain } from "../js/routeExplain.js";
import { makeRecord, listRoutes, saveRoute, deleteRoute, readRoute, isRouteKey } from "../js/routeStore.js";
import { calculateTargets } from "../js/fuelTargets.js";

const memStore = () => {
    const m = new Map();
    return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};

// A street running east at lat 35, 0.001 degrees (~90 m) apart points.
const eastLine = (lat, n = 40, lon0 = -85.3) => Array.from({ length: n }, (_, i) => [lat, lon0 + i * 0.0005]);

test("polyline: decodes Valhalla's precision-6 format", () => {
    // 38.5,-120.2 then +2.2,+0.6 degrees: the classic Google example scaled to precision 5.
    assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC", 5).map(p => p.map(n => Math.round(n * 10) / 10)), [[38.5, -120.2], [40.7, -120.9]]);
});

test("geometry: haversine, loops, thinning keeps the ends", () => {
    assert.ok(Math.abs(haversine([0, 0], [0, 1]) - 69.09) < 0.1);
    const line = eastLine(35, 1000);
    const thin = thinLine(line, 300);
    assert.equal(thin.length, 300);
    assert.deepEqual(thin[0], line[0]);
    assert.deepEqual(thin[299], line[999]);
    assert.equal(thinLine(line.slice(0, 5), 300).length, 5);
    assert.ok(isLoop([[35, -85], [35.01, -85], [35.01, -85.01], [35, -85.0001]]));
    assert.ok(!isLoop(eastLine(35)));
    assert.ok(lineMiles(eastLine(35)) > 1);
    assert.ok(boxContains(boundsOf([[35, -85], [35.1, -85.1]], 0.02), boundsOf([[35.05, -85.05]], 0.001)));
});

test("scoring: the way classes from OSM tags", () => {
    assert.equal(categoryForWay({ highway: "footway" }), "A");
    assert.equal(categoryForWay({ highway: "cycleway" }), "A");
    assert.equal(categoryForWay({ highway: "footway", footway: "sidewalk" }), "B");
    assert.equal(categoryForWay({ highway: "residential" }), "C");
    assert.equal(categoryForWay({ highway: "residential", sidewalk: "both" }), "B");
    assert.equal(categoryForWay({ highway: "primary" }), "X");
    assert.equal(categoryForWay({ highway: "residential", foot: "no" }), "X");
    assert.equal(categoryForWay({ highway: "steps" }), null);
});

test("scoring: percentages always add to 100", () => {
    for (const counts of [{ A: 1, B: 1, C: 1, D: 0, X: 0 }, { A: 7, B: 3, C: 3, D: 3, X: 1 }, { A: 0, B: 0, C: 0, D: 5, X: 0 }]) {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const p = percentages(counts, total);
        assert.equal(Object.values(p).reduce((a, b) => a + b, 0), 100);
    }
    assert.equal(Object.values(percentages({ A: 0, B: 0, C: 0, D: 0, X: 0 }, 0)).reduce((a, b) => a + b, 0), 0);
});

test("scoring: a route on a trail, beside a sidewalk, and on a highway", () => {
    const trail = makeWay("A", eastLine(35.0000), "Greenway");
    const hwy = makeWay("X", eastLine(35.01), "Hixson Pike");
    const onTrail = scoreLine(eastLine(35.0000), [trail, hwy]);
    assert.equal(onTrail.pcts.A, 100);
    assert.equal(onTrail.ab, 100);
    assert.equal(onTrail.pcts.X, 0);
    const onHwy = scoreLine(eastLine(35.01), [trail, hwy]);
    assert.equal(onHwy.pcts.X, 100);
    assert.deepEqual(onHwy.highwayNames, ["Hixson Pike"]);
    assert.ok(onHwy.score < 0, "any X drags the score negative");
    const nowhere = scoreLine(eastLine(35.5), [trail, hwy]);
    assert.equal(nowhere.pcts.D, 100, "unmatched is D, not a guess");
    assert.equal(scoreLine(eastLine(35), []), null, "nothing to score against is null, not zero");
});

test("scoring: a point 100 m off a way does not match it", () => {
    const trail = makeWay("A", eastLine(35.0000));
    assert.equal(scoreLine(eastLine(35.0010), [trail]).pcts.D, 100);
});

test("scoring: major-road stretches are found and named for the map", () => {
    const trail = makeWay("A", eastLine(35.0, 80));
    const hwy = makeWay("X", eastLine(35.0001, 80).slice(20, 40), "Hixson Pike"); // the middle of the route, 40 m north
    const line = eastLine(35.0001, 80);
    const stretches = xStretches(line, [trail, hwy]);
    assert.equal(stretches.length, 1);
    assert.equal(stretches[0].name, "Hixson Pike");
    assert.ok(stretches[0].coords.length >= 15 && stretches[0].coords.length <= 30);
    assert.deepEqual(xStretches(line, [trail]), []);
    assert.deepEqual(xStretches(line, []), []);
});

test("scoring: four quarters add up to the route", () => {
    const trail = makeWay("A", eastLine(35.0, 80));
    const q = scoreQuarters(eastLine(35.0, 80), [trail]);
    assert.equal(q.length, 4);
    assert.ok(q.every(x => x.score.pcts.A === 100));
});

test("climb: a range from two filters, never the raw sum", () => {
    // 3 m of GPS wobble on flat ground plus one real 30 m hill.
    const flat = Array.from({ length: 200 }, (_, i) => 100 + (i % 2 ? 1.5 : -1.5));
    const hill = flat.map((h, i) => h + (i > 60 && i < 140 ? 30 : 0));
    const raw = hill.slice(1).reduce((sum, h, i) => sum + Math.max(0, h - hill[i]), 0) * 3.28084;
    const r = climbRange(hill);
    assert.ok(r.highFt < raw / 2, "wobble must not count as climb");
    assert.ok(r.lowFt <= r.highFt);
    assert.ok(r.highFt >= 80 && r.lowFt <= 140, `a 30 m (98 ft) hill reads near 98 ft, got ${r.lowFt}-${r.highFt}`);
    assert.match(r.text, /^about \d+(–\d+)? ft$/);
    assert.equal(climbRange([]), null);
    assert.equal(smoothedGainFt([5], 1, 2), 0);
});

test("fuel: the bands", () => {
    assert.equal(bandFor(59).id, "water");
    assert.equal(bandFor(60).id, "mid");
    assert.equal(bandFor(150).id, "mid");
    assert.equal(bandFor(151).id, "high");
});

test("fuel: a 90 minute run is ranges, not one number", () => {
    const p = fuelPlan({ miles: 10, pace: 9 });
    assert.equal(p.durationMin, 90);
    assert.deepEqual([p.band.lo, p.band.hi], [30, 60]);
    assert.deepEqual([p.totalLo, p.totalHi], [45, 90]);
    assert.deepEqual([p.gelsLo, p.gelsHi], [2, 4]);
    assert.deepEqual([p.waterLo, p.waterHi], [0.6, 1.2]);
    assert.equal(p.coachCheck, false);
    assert.equal(p.status, "review");
    assert.ok(p.windows.every(w => w.toMile >= w.fromMile && w.toMin <= p.durationMin - 15));
    assert.deepEqual([p.windows[0].fromMin, p.windows[0].toMin], [30, 45]);
});

test("fuel: under an hour is water only; over 150 asks for a coach check", () => {
    const short = fuelPlan({ miles: 5, pace: 9 });
    assert.deepEqual([short.totalLo, short.totalHi, short.gelsHi, short.windows.length], [0, 0, 0, 0]);
    assert.match(fuelLines(short).join(" "), /Water only/);
    const long = fuelPlan({ miles: 20, pace: 9 });
    assert.equal(long.coachCheck, true);
    assert.deepEqual([long.band.lo, long.band.hi], [60, 90]);
    assert.match(fuelLines(long).join(" "), /coach check/);
    assert.match(fuelLines(long).join(" "), /not a coach-approved prescription/);
});

test("fuel: pace comes from the runner, bad inputs give no plan", () => {
    assert.equal(fuelPlan({ miles: 10, pace: 3 }), null);
    assert.equal(fuelPlan({ miles: 0, pace: 9 }), null);
    assert.equal(fuelPlan({ miles: 10, pace: 9, gelG: 5 }), null);
    assert.equal(fuelPlan({ miles: 10, pace: 8 }).durationMin, 80);
});

test("fuel: the Fueling page's own number is shown beside the range, and flagged when outside it", () => {
    const calc = calculateTargets({ duration: 90, mode: "training", workoutType: "long" });
    const inside = fuelPlan({ miles: 10, pace: 9, calculator: { carbsPerHour: calc.carbsPerHour, fluidLPerHour: calc.fluidPerHour * 0.0295735 } });
    assert.equal(inside.calcCarbs, Math.round(calc.carbsPerHour));
    assert.equal(inside.calcWithin, true);
    const outside = fuelPlan({ miles: 10, pace: 9, calculator: { carbsPerHour: 20 } });
    assert.equal(outside.calcWithin, false);
    assert.match(fuelLines(outside).join(" "), /outside this range/);
    assert.equal(fuelPlan({ miles: 10, pace: 9 }).calcCarbs, null);
});

test("GPX: <ele> only when there is one height per point", () => {
    const coords = [[35.1, -85.1], [35.2, -85.2], [35.3, -85.3]];
    const withEle = buildGpx({ name: "A & B <test>", coords, heightsM: [1, 2, 3], miles: 1.234, climbText: "about 20–30 ft" });
    assert.equal(withEle.hasEle, true);
    assert.deepEqual(parseGpxPoints(withEle.text).map(p => p.ele), [1, 2, 3]);
    assert.match(withEle.text, /<metadata><name>A &amp; B &lt;test&gt;<\/name>/);
    assert.match(withEle.text, /1\.23 mi, 3 points, with elevation \(climb about 20–30 ft, not exact\)/);
    const stale = buildGpx({ coords, heightsM: [1, 2], miles: 1 });
    assert.equal(stale.hasEle, false);
    assert.ok(!stale.text.includes("<ele>"), "heights for a different route never leak in");
    assert.match(stale.text, /no elevation/);
    assert.equal(parseGpxPoints(stale.text).length, 3);
    assert.equal(gpxFileName("Sunday Long Run!"), "southbound-sunday-long-run.gpx");
    assert.equal(gpxFileName(""), "southbound-route.gpx");
});

// A router that makes a loop of known length from the radius: miles = 2*pi*r*k.
const fakeRoute = k => async locs => ({ coords: locs, miles: k * Math.max(...locs.map(p => haversine(locs[0], p))) * 2 * Math.PI });

test("loop: lands within 10% of the target and keeps the closest attempt", async () => {
    const out = await generateLoop({ start: [35, -85.3], targetMiles: 3, route: fakeRoute(1.4) });
    assert.ok(out.withinTarget);
    assert.ok(out.best.err <= 0.1);
    assert.ok(out.attempts.length <= LOOP_MAX_ATTEMPTS);
    assert.equal(loopPoints([35, -85], 1).length, 6);
});

test("loop: an erratic router still returns the closest of the attempts", async () => {
    const miles = [6.4, 3.73, 2.35, 3.76, 3.7, 3.65]; // the v4 sandbox sequence on a town grid
    let i = 0;
    const out = await generateLoop({ start: [35, -85], targetMiles: 3, route: async locs => ({ coords: locs, miles: miles[i++] }) });
    assert.equal(out.attempts.length, LOOP_MAX_ATTEMPTS);
    assert.equal(out.withinTarget, false);
    assert.ok(Math.abs(out.best.result.miles - 3) <= Math.min(...miles.map(m => Math.abs(m - 3))) + 1e-9);
});

test("loop: a router failure is thrown, no loop is invented", async () => {
    await assert.rejects(generateLoop({ start: [35, -85], targetMiles: 3, route: async () => { throw new Error("down"); } }), /down/);
});

test("optimiser: shifts toward a trail within 0.10 mi, keeps only a real gain", async () => {
    const road = makeWay("C", eastLine(35.0000));
    const trail = makeWay("A", eastLine(35.0006));
    const wps = [[35.0000, -85.299], [35.0000, -85.28]];
    const shifted = shiftWaypoints(wps, [road, trail]);
    assert.ok(shifted.every(p => Math.abs(p[0] - 35.0006) < 1e-9), "moved onto the trail");
    assert.deepEqual(shiftWaypoints(wps, [road]), wps, "no A/B way nearby means no shift");
    assert.equal(keepShifted({ ab: 50, miles: 3, x: 0 }, { ab: 55, miles: 3.75, x: 0 }), true);
    assert.equal(keepShifted({ ab: 50, miles: 3, x: 0 }, { ab: 55, miles: 3.75, x: 0 }), true);
    assert.equal(keepShifted({ ab: 50, miles: 3, x: 5 }, { ab: 70, miles: 3, x: 12 }), false, "more major road is never kept");
    assert.equal(keepShifted({ ab: 50, miles: 3, x: 6 }, { ab: 60, miles: 3, x: 0 }), true, "less major road is fine");
    assert.equal(keepShifted({ ab: 50, miles: 3 }, { ab: 54, miles: 3 }), false, "under +5 points");
    assert.equal(keepShifted({ ab: 50, miles: 3, x: 0 }, { ab: 90, miles: 3.76, x: 0 }), false, "over +25% distance");

    const ways = [road, trail];
    const kept = await optimise({ waypoints: wps, coords: eastLine(35.0000), miles: 1.5, ways, route: async () => ({ coords: eastLine(35.0006), miles: 1.6 }) });
    assert.equal(kept.status, "kept");
    assert.ok(kept.after.ab > kept.before.ab);
    const longer = await optimise({ waypoints: wps, coords: eastLine(35.0000), miles: 1.0, ways, route: async () => ({ coords: eastLine(35.0006), miles: 1.4 }) });
    assert.equal(longer.status, "rejected");
    const none = await optimise({ waypoints: wps, coords: eastLine(35.0000), miles: 1.5, ways: [road], route: async () => assert.fail("not called") });
    assert.equal(none.status, "none");
});

test("explainer: names highway gaps and gives the verdict from the numbers", () => {
    const trail = makeWay("A", eastLine(35.0));
    const hwy = makeWay("X", eastLine(35.0001, 20), "Hixson Pike");
    const line = eastLine(35.0);
    const good = explain({ miles: 1.2, loop: false, points: 40, climb: { text: "about 10–20 ft" }, overall: scoreLine(line, [trail]), quarters: scoreQuarters(line, [trail]) });
    assert.equal(good.verdict, "path");
    assert.match(good.lines.join("\n"), /No major-road stretches/);
    assert.match(good.lines.join("\n"), /Climb: about 10–20 ft/);
    const bad = scoreLine(line, [hwy]);
    const heavy = explain({ miles: 1.2, loop: true, points: 40, overall: bad });
    assert.equal(heavy.verdict, "majorRoad");
    assert.deepEqual(heavy.gaps, ["Hixson Pike"]);
    assert.match(heavy.lines.join("\n"), /on Hixson Pike/);
    assert.match(heavy.lines.join("\n"), /a loop/);
    const blank = explain({ miles: 1, loop: false, points: 3 });
    assert.equal(blank.verdict, null);
    assert.match(blank.lines.join("\n"), /No surface detail/);
});

test("saved routes: a new record per route, thinned line, tombstone on delete", () => {
    const store = memStore();
    const coords = eastLine(35, 1000);
    const rec = makeRecord({ name: "  Sunday long  ", waypoints: [[35, -85.3], [35, -85.1]], coords, miles: 12.3456, loop: false, pace: 9, gelG: 25, now: 1000 });
    assert.equal(rec.name, "Sunday long");
    assert.equal(rec.line.length, 300);
    assert.equal(rec.miles, 12.35);
    assert.equal(makeRecord({ name: "", waypoints: [], coords: [[1, 1]], miles: 1 }).name, "My route");
    saveRoute(store, rec);
    store.setItem("route-view", JSON.stringify({ c: [35, -85], z: 13 }));
    store.setItem("route-settings", "{}");
    store.setItem("running-log", "[]");
    assert.deepEqual(listRoutes(store).map(r => r.id), [rec.id], "the view and settings keys are not routes");
    assert.equal(isRouteKey("route-view"), false);
    assert.equal(isRouteKey("route-abc"), true);
    deleteRoute(store, rec.id, 2000);
    assert.equal(listRoutes(store).length, 0);
    assert.equal(readRoute(store, rec.id), null);
    assert.equal(JSON.parse(store.getItem("route-" + rec.id)).deleted, true, "the other devices see the delete");
    store.setItem("route-bad", "{not json");
    assert.equal(listRoutes(store).length, 0);
});

test("saved routes: a fuel plan is stored as a plan to review", () => {
    const fuel = fuelPlan({ miles: 10, pace: 9 });
    const rec = makeRecord({ name: "x", waypoints: [[1, 1]], coords: [[1, 1], [1, 2]], miles: 10, fuel });
    assert.equal(rec.fuel.status, "review");
});
