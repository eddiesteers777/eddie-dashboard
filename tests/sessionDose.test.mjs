// Unit tests for one dose per session (js/sessionDose.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rawDose, chooseDose, blendWeights, calibrate, v60At, weeklyAnchors, sessionDoses, doseAgreement, domainOf, DOSE_VERSION } from "../js/sessionDose.js";
import { athlete, trueTime, M } from "./athleteFixture.mjs";

const ASOF = "2026-10-04";
const anchor = { v60: 15000 / 3600, hrMax: 190, hrRest: 50 };     // 15 km in an hour
const sess = (extra = {}) => ({ id: "c:1", date: "2026-10-01", distance: 15000, movingSec: 3600, avgHr: 170, rpe: null, climb: null, ...extra });

test("pace load: one hour at 1-hour race pace is 100, at 80% speed 64; domains by IF", () => {
    assert.equal(Math.round(rawDose(sess(), anchor).pace), 100);
    const easy = rawDose(sess({ distance: 12000 }), anchor);
    assert.equal(Math.round(easy.pace), 64);
    assert.equal(domainOf(0.79), "easy");
    assert.equal(domainOf(0.8), "threshold");
    assert.equal(domainOf(1.0), "hard");
    const easier = rawDose(sess({ distance: 11000 }), anchor);
    assert.ok(easier.domainsPace.easy > 0 && easier.domainsPace.threshold === 0);
    assert.match(easy.flags.join(" "), /No laps/);
});

test("laps split an interval session into its domains; the average would have hidden the hard part", () => {
    // 6 x 1 km fast (3:20) with 400 m jogs (2:40), warm-up and cool-down 2 km at 5:00/km.
    const laps = [{ m: 2000, s: 600 }];
    for (let i = 0; i < 6; i++) laps.push({ m: 1000, s: 200 }, { m: 400, s: 160 });
    laps.push({ m: 2000, s: 600 });
    const m = laps.reduce((t, l) => t + l.m, 0), s = laps.reduce((t, l) => t + l.s, 0);
    const withLaps = rawDose(sess({ distance: m, movingSec: s }), anchor, laps);
    const without = rawDose(sess({ distance: m, movingSec: s }), anchor, null);
    assert.ok(withLaps.domainsPace.hard > 0 && withLaps.minutesBy.hard === 20);
    assert.equal(without.domainsPace.hard, 0);
    assert.ok(withLaps.pace > without.pace, "squared intensity: reps cost more than the average pace says");
    assert.ok(withLaps.laps && !withLaps.flags.some(f => /No laps/.test(f)));
});

test("hills count: climb raises the pace load; treadmill pace isn't used", () => {
    const flat = rawDose(sess({ distance: 12000 }), anchor).pace;
    const hilly = rawDose(sess({ distance: 12000, climb: 300 }), anchor).pace;
    assert.ok(hilly > flat * 1.2);
    const tm = rawDose(sess({ indoor: true }), anchor);
    assert.equal(tm.pace, null);
    assert.ok(tm.hr > 0);
    assert.match(tm.flags.join(" "), /Treadmill/);
});

test("HR load (TRIMP) and effort load; no HR max means no HR load", () => {
    const r = rawDose(sess({ rpe: 7 }), anchor);
    const x = (170 - 50) / 140;
    assert.ok(Math.abs(r.hr - 60 * x * 0.64 * Math.exp(1.92 * x)) < 0.01);
    assert.equal(r.effort, 420);
    assert.equal(rawDose(sess(), { ...anchor, hrMax: null }).hr, null);
});

test("calibrate: defaults with few pairs, the athlete's own ratio once there are many", () => {
    const few = calibrate([{ pace: 50, hr: 100 }]);
    assert.equal(few.hr.ratio, 0.7);
    const many = calibrate(Array.from({ length: 90 }, () => ({ pace: 50, hr: 100, effort: 250 })));
    assert.ok(Math.abs(many.hr.ratio - 0.5) < 0.03, String(many.hr.ratio));
    assert.ok(Math.abs(many.effort.ratio - 0.2) < 0.02, String(many.effort.ratio));
    assert.equal(many.hr.n, 90);
});

test("chooseDose (0.3.0): the dose is what was done (pace); heart rate and effort sit beside it, never raise it", () => {
    const scale = { hr: { ratio: 0.5, own: 0.5 }, effort: { ratio: 0.25, own: 0.25 } };
    const s = sess({ rpe: 5 });
    const raw = rawDose(s, anchor);
    const b = chooseDose(s, raw, scale, anchor);
    assert.equal(b.source, "pace");
    assert.equal(b.dose, raw.pace, "external load = pace load");
    assert.ok(Math.abs(b.internal.hr - raw.hr * 0.5) < 0.06);
    assert.ok(Math.abs(b.internal.effort - raw.effort * 0.25) < 0.06);
    // The 0.2.0 blend is kept for display: a weighted average, never a sum.
    const vals = [raw.pace, raw.hr * 0.5, raw.effort * 0.25];
    assert.equal(b.blendSource, "blend");
    assert.ok(b.blend >= Math.min(...vals) - 0.06 && b.blend <= Math.max(...vals) + 0.06);
    assert.deepEqual(Object.keys(b.parts).sort(), ["effort", "hr", "pace"]);
    assert.ok(Math.abs(b.domains.easy + b.domains.threshold + b.domains.hard - b.dose) < 1e-6);
    // The same run felt much harder: the load doesn't move (that's a response, not load).
    const harder = sess({ rpe: 9, avgHr: (s.avgHr || 150) + 15 });
    const h = chooseDose(harder, rawDose(harder, anchor), scale, anchor);
    assert.equal(h.dose, b.dose);
    assert.ok(h.internal.effort > b.internal.effort && h.internal.hr > b.internal.hr);
    // Treadmill: pace can't measure it, so heart rate stands in (effort never joins).
    const tm = sess({ indoor: true, rpe: 5 });
    const byTm = chooseDose(tm, rawDose(tm, anchor), scale, anchor);
    assert.equal(byTm.source, "hr");
    assert.ok(Math.abs(byTm.dose - rawDose(tm, anchor).hr * 0.5) < 1e-9);
    assert.ok(byTm.flags.some(f => /Treadmill: load from heart rate/.test(f)));
    // A trail run with no climb data: pace can't be trusted either.
    const trail = sess({ trail: true, climb: 0 });
    assert.equal(chooseDose(trail, rawDose(trail, anchor), scale, anchor).source, "hr");
    // A treadmill run with no heart rate still has a distance: easy miles (external) before effort.
    const tmNoHr = sess({ indoor: true, avgHr: null, rpe: 4 });
    assert.equal(chooseDose(tmNoHr, rawDose(tmNoHr, anchor), scale, anchor).source, "miles");
    // Nothing measured at all but time and an effort: effort, flagged.
    const noHr = sess({ indoor: true, avgHr: null, rpe: 4, distance: null });
    const byEffort = chooseDose(noHr, rawDose(noHr, anchor), scale, anchor);
    assert.equal(byEffort.source, "effort");
    assert.equal(byEffort.dose, 60 * 4 * 0.25);
    assert.equal(byEffort.domains.easy, byEffort.dose);
    const log = { id: "l:1", date: "2026-10-01", distance: 5 * M, movingSec: null, avgHr: null, rpe: null };
    const byMiles = chooseDose(log, rawDose(log, anchor), scale, anchor);
    assert.equal(byMiles.source, "miles");
    assert.ok(byMiles.dose > 20 && byMiles.dose < 60, String(byMiles.dose));
    assert.ok(chooseDose(sess({ distance: 17000 }), rawDose(sess({ distance: 17000 }), anchor), scale, anchor).long);
});

test("blend weights: trust follows the run (no laps, hills, trail, short runs, a default scale)", () => {
    const own = { hr: { own: 0.5 }, effort: { own: 0.25 } };
    const raw = { pace: 50, hr: 100, effort: 200, laps: true };
    assert.deepEqual(blendWeights(sess({ rpe: 5 }), raw, own), { pace: 1, hr: 0.8, effort: 0.8 });
    assert.equal(blendWeights(sess({}), { ...raw, laps: false }, own).pace, 0.8);
    assert.equal(blendWeights(sess({ trail: true, climb: 0 }), raw, own).pace, 0.5);
    assert.equal(blendWeights(sess({ climb: 400 }), raw, own).pace, 0.7);
    assert.equal(blendWeights(sess({ movingSec: 900 }), raw, own).hr, 0.4);
    const def = blendWeights(sess({}), raw, { hr: {}, effort: {} });
    assert.ok(Math.abs(def.hr - 0.48) < 1e-9 && Math.abs(def.effort - 0.48) < 1e-9);
    assert.equal(blendWeights(sess({}), { pace: null, hr: null, effort: null }, own).pace, 0);
});

test("v60: from a recent race with the athlete's exponent, else training × 0.97, else COROS threshold", () => {
    const s = athlete({ asOf: ASOF, weeks: 8, races: [{ date: "2026-09-13", meters: 10000, sec: 2400 }] });
    const v = v60At(s, ASOF);
    // The hour race for a 40:00 10K runner with 1.06: about 15.3 km.
    const expected = 10000 * Math.pow(3600 / trueTime(10000), 1 / 1.06) / 3600;
    assert.ok(v.v60 >= expected * 0.99, `${v.v60} vs ${expected}`);
    assert.ok(["race", "training"].includes(v.source));
    assert.equal(v60At([], ASOF), null);
    const c = v60At([], ASOF, { fitness: { "2026-10-01": { threshold: "6:00/mi" } } });
    assert.equal(c.source, "coros");
    assert.ok(Math.abs(c.v60 - M / 360) < 1e-9);
});

test("v60 from training needs a month of runs: two weeks of easy runs don't make every run look hard", () => {
    const s = athlete({ asOf: ASOF, weeks: 2 });
    assert.equal(v60At(s, ASOF), null);
    const longer = athlete({ asOf: ASOF, weeks: 6 });
    const v = v60At(longer, ASOF);
    assert.equal(v.source, "training");
    // The best training effort is the 6 mi tempo at 6:45; as a race-equivalent hour it's a bit faster than 6:45.
    assert.ok(M / v.v60 < 405 && M / v.v60 > 380, String(M / v.v60));
    const a = weeklyAnchors(s, ASOF).get("2026-09-28");
    assert.equal(a.hrMax, 190);
    assert.equal(a.hrMaxSource, "assumed 190");
});

test("anchors use only what came before each week (no leak from a race later on)", () => {
    const s = athlete({ asOf: ASOF, weeks: 10, races: [{ date: "2026-10-03", meters: 5000, sec: 1000 }] });   // a very fast 5K on the last Saturday
    const a = weeklyAnchors(s, ASOF);
    const thisWeek = a.get("2026-09-28"), nextAfter = weeklyAnchors(s, "2026-10-05").get("2026-10-05");
    assert.ok(nextAfter.v60 > thisWeek.v60, "the race moves the anchor only from the following Monday");
    assert.equal(thisWeek.hrRestSource, "assumed 60");
});

test("sessionDoses: every run gets one dose; counts by source; version; easy weeks mostly easy", () => {
    const s = athlete({ asOf: ASOF, weeks: 12, races: [{ date: "2026-08-15", meters: 10000, sec: 2400 }] });
    s.forEach(x => { x.maxHr = 185; });
    s.find(x => x.date === "2026-10-01").indoor = true;
    const r = sessionDoses(s, ASOF);
    assert.equal(r.version, DOSE_VERSION);
    assert.equal(r.doses.length, s.length);
    // The first 4 weeks have no 1-hour pace yet (no race, under a month of runs) and the treadmill
    // run has no pace: heart rate stands in; every other run is measured by pace.
    assert.equal(r.counts.pace + r.counts.hr, s.length, JSON.stringify(r.counts));
    assert.ok(r.counts.pace > s.length / 2 && r.counts.hr >= 1, JSON.stringify(r.counts));
    const week = r.doses.filter(d => d.date >= "2026-09-21" && d.date <= "2026-09-27");
    const by = k => week.reduce((t, d) => t + d.domains[k], 0);
    assert.ok(by("easy") > by("threshold"), `${by("easy")} vs ${by("threshold")}`);
    const tempo = r.doses.find(d => d.date === "2026-09-29");
    assert.ok(tempo.domains.threshold > 0 || tempo.domains.hard > 0);
});

test("doseAgreement: pairs, coverage and a primary count", () => {
    const s = athlete({ asOf: ASOF, weeks: 12, races: [{ date: "2026-08-15", meters: 10000, sec: 2400 }] });
    s.forEach((x, i) => { x.maxHr = 185; if (i % 2) x.rpe = 4; });
    const a = doseAgreement(sessionDoses(s, ASOF), ASOF);
    assert.ok(a.hr.n > 20 && a.hr.ratio > 0);
    assert.ok(a.effort.n > 10);
    assert.ok(a.coverage.pace > 0 && a.coverage.effort > 10);
    assert.ok(a.hr.spreadPct >= 0);
    assert.equal(a.runs, s.length);
});
