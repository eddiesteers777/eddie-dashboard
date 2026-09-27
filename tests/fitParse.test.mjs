// Unit tests for the FIT reader (js/fitParse.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFit, bestEfforts, sportType } from "../js/fitParse.js";
import { buildFit, steadyRun } from "./fitFixture.mjs";

const START = Date.UTC(2026, 8, 26, 10, 56, 5) / 1000;   // 5:56 am at UTC-5

test("a run: start, the watch's local time, totals, laps, device", () => {
    const a = readFit(steadyRun({ startSec: START, km: 12, secPerKm: 240, hr: 148 }));
    assert.equal(a.sport, 1);
    assert.equal(sportType(a.sport, a.subSport), "run");
    assert.equal(a.start, "2026-09-26T10:56:05.000Z");
    assert.equal(a.offsetMin, -300);
    assert.equal(a.localDate, "2026-09-26");
    assert.equal(a.distance, 12000);
    assert.equal(a.duration, 2880);
    assert.equal(a.elapsed, 2880);
    assert.deepEqual([a.avgHr, a.maxHr, a.ascent, a.calories], [148, 160, 40, 700]);
    assert.deepEqual([a.manufacturer, a.product], [294, 804]);
    assert.equal(a.laps.length, 12);
    assert.deepEqual(a.laps[0], { i: 1, m: 1000, s: 240, hr: 148, intensity: 0 });
});

test("records with compressed timestamps, developer fields and GPS are read past correctly", () => {
    // Every other record uses a compressed header; if its time were misread the efforts would be off.
    const a = readFit(steadyRun({ startSec: START, km: 12, secPerKm: 240 }));
    assert.deepEqual(a.best, { mile: 386, k5: 1200, k10: 2400, half: null, full: null });
});

test("an evening run's local date comes from the watch, not UTC", () => {
    const late = Date.UTC(2026, 8, 17, 0, 3, 23) / 1000;     // 7:03 pm on the 16th at UTC-5
    assert.equal(readFit(steadyRun({ startSec: late, km: 3, secPerKm: 300 })).localDate, "2026-09-16");
    assert.equal(readFit(steadyRun({ startSec: late, km: 3, secPerKm: 300, offsetSec: 3600 })).localDate, "2026-09-17");
});

test("fastest efforts: anywhere in the run, a GPS jump ignored, pauses count", () => {
    const pts = [];
    // 2 km easy at 5:00/km, then 5 km at 3:40/km, then 1 km easy.
    let t = 0, d = 0;
    const go = (km, pace) => { for (let i = 0; i < km * pace; i++) { t++; d += 1000 / pace; pts.push({ t, d }); } };
    pts.push({ t: 0, d: 0 });
    go(2, 300); go(5, 220); go(1, 300);
    const b = bestEfforts(pts);
    assert.equal(b.k5, 1100);
    assert.ok(Math.abs(b.mile - 354) <= 1, `mile ${b.mile}`);
    assert.equal(b.k10, null, "only 8 km run");
    // A 400 m GPS jump in one second doesn't make a faster 5K.
    const jump = pts.map(p => ({ t: p.t, d: p.t > 3000 ? p.d + 400 : p.d }));
    assert.equal(bestEfforts(jump).k5, 1100);
    // A 5-minute stop inside the fast part makes it slower (elapsed time).
    const stop = pts.map(p => ({ t: p.t > 1200 ? p.t + 300 : p.t, d: p.d }));
    assert.equal(bestEfforts(stop).k5, 1400 - 300 + 300);
});

test("other sports, and files that aren't FIT", () => {
    const ride = readFit(buildFit({ startSec: START, sport: 2, session: { elapsed: 3600, timer: 3500, m: 30000, avgHr: 130 } }));
    assert.equal(sportType(ride.sport, ride.subSport), "ride");
    assert.equal(ride.best, null, "fastest efforts are for runs");
    const lift = readFit(buildFit({ startSec: START, sport: 10, subSport: 20, session: { elapsed: 2700, timer: 2700, avgHr: 102 } }));
    assert.equal(sportType(lift.sport, lift.subSport), "strength");
    assert.equal(lift.distance, 0);
    assert.throws(() => readFit(new TextEncoder().encode("<gpx></gpx>")), /Not a FIT file/);
});
