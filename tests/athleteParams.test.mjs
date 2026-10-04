// Unit tests for the athlete's own numbers (js/athleteParams.js) and VDOT (js/vdot.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { vdotFromRace, timeForVdot, vdotEquivalent } from "../js/vdot.js";
import { hrMaxFrom, hrRestFrom, effortsFrom, envelope, fitSpeedCurve, curveTime, fitCriticalSpeed, personalExponent, athleteParams } from "../js/athleteParams.js";
import { sessionsFrom } from "../js/athleteLedger.js";
import { athlete, run } from "./athleteFixture.mjs";

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} ${a} vs ${b}`);

test("VDOT: Daniels' reference points and the Pace Calculator's copy agree", () => {
    close(vdotFromRace(5000, 19 * 60 + 57), 50, 0.3, "19:57 5K");
    close(vdotFromRace(42195, 3 * 3600 + 10 * 60 + 47), 50, 0.3, "3:10:47 marathon");
    close(timeForVdot(vdotFromRace(5000, 1197), 5000), 1197, 0.5, "round trip");
    close(vdotEquivalent(5000, 1197, 42195), 11447, 60, "5K -> marathon");
    // The page script can't import js/vdot.js; make sure its copy of the equations hasn't drifted.
    const src = fs.readFileSync(new URL("../js/pace-calculator.js", import.meta.url), "utf8");
    const part = src.slice(src.indexOf("function vo2AtVelocity"), src.indexOf("function paceSecondsPerMile"));
    const ctx = {};
    vm.runInNewContext(`${part}; this.v = vdotFromRace;`, ctx);
    for (const [m, s] of [[5000, 1197], [10000, 2600], [21097.5, 5400], [42195, 12000]]) close(ctx.v(m, s), vdotFromRace(m, s), 1e-9, String(m));
});

test("HR max: the 2nd-highest day in 18 months, so one spike can't set it", () => {
    const s = (date, maxHr) => ({ date, maxHr });
    const sessions = [s("2026-09-01", 214), s("2026-08-01", 188), s("2026-08-01", 190), s("2026-07-01", 186), s("2024-01-01", 199), s("2026-09-02", 120)];
    const r = hrMaxFrom(sessions, "2026-10-04");
    assert.equal(r.value, 190);
    assert.equal(r.n, 3, "one per day, the 2024 one is too old, 120 isn't a max");
    assert.equal(hrMaxFrom([], "2026-10-04"), null);
});

test("HR rest: median of the last 30 days, needs 5 nights", () => {
    const h = Object.fromEntries(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((d, i) => [d, { rhr: [48, 50, 47, 60, 49][i] }]));
    assert.equal(hrRestFrom(h, "2026-10-04").value, 49);
    assert.equal(hrRestFrom({ "2026-10-04": { rhr: 50 } }, "2026-10-04"), null);
});

test("efforts: training only (races and everything inside them left out), GPS glitches dropped", () => {
    const sessions = athlete({ asOf: "2026-10-04", weeks: 4, races: [{ date: "2026-09-26", meters: 10000, sec: 2400 }] });
    const e = effortsFrom(sessions, "2026-10-04");
    assert.ok(e.length > 10);
    assert.ok(!e.some(x => x.id === "c:race-2026-09-26"));
    assert.ok(effortsFrom(sessions, "2026-10-04", { excludeRaces: false }).some(x => x.kind === "race"));
    const glitch = sessionsFrom({ corosRuns: [run("2026-10-01", 3, 150)] });
    assert.equal(effortsFrom(glitch, "2026-10-04").length, 0, "3 mi at 2:30/mi isn't real");
});

test("speed curve: Riegel's shape with the athlete's own slope", () => {
    const pts = [1609.344, 5000, 10000, 21097.5].map(m => ({ meters: m, seconds: 2400 * Math.pow(m / 10000, 1.08) }));
    const c = fitSpeedCurve(pts);
    close(c.b, 1.08, 1e-6);
    close(curveTime(c, 42195), 2400 * Math.pow(4.2195, 1.08), 1);
    assert.equal(fitSpeedCurve(pts.slice(0, 1)), null);
    assert.equal(envelope([{ meters: 5000, seconds: 1300 }, { meters: 5100, seconds: 1250 }])[0].seconds, 1250, "fastest in the band");
});

test("critical speed: distance = CS·t + D′ over 2-20 min best efforts", () => {
    const eff = [180, 360, 720, 1080].map(t => ({ meters: 4.5 * t + 200, seconds: t }));
    const cs = fitCriticalSpeed(eff);
    close(cs.cs, 4.5, 1e-6);
    close(cs.dPrime, 200, 1e-6);
    assert.equal(fitCriticalSpeed(eff.slice(0, 2)), null, "needs 3");
    assert.equal(fitCriticalSpeed([{ meters: 2000, seconds: 400 }, { meters: 2100, seconds: 420 }, { meters: 2200, seconds: 440 }]), null, "needs a spread of times");
});

test("exponent: Riegel's 1.06 until race pairs say otherwise, shrunk toward it", () => {
    const none = personalExponent(athlete({ asOf: "2026-10-04", weeks: 2 }), "2026-10-04");
    assert.equal(none.value, 1.06);
    assert.equal(none.n, 0);
    // A 5K and a half 8 weeks apart with exponent 1.10 between them.
    const k5 = 1150, half = k5 * Math.pow(21097.5 / 5000, 1.10);
    const s = athlete({ asOf: "2026-10-04", weeks: 10, races: [{ date: "2026-08-08", meters: 5000, sec: k5 }, { date: "2026-10-03", meters: 21097.5, sec: half }] });
    const one = personalExponent(s, "2026-10-04");
    assert.equal(one.n, 1);
    close(one.value, 1.08, 0.002, "halfway with one pair");
    assert.match(one.source, /1 pair/);
    // Races 6 months apart aren't paired (fitness changed in between).
    const far = athlete({ asOf: "2026-10-04", weeks: 30, races: [{ date: "2026-03-01", meters: 5000, sec: k5 }, { date: "2026-10-03", meters: 21097.5, sec: half }] });
    assert.equal(personalExponent(far, "2026-10-04").n, 0);
});

test("params: only what happened by asOf", () => {
    const s = athlete({ asOf: "2026-10-04", weeks: 4, races: [{ date: "2026-10-03", meters: 21097.5, sec: 5300 }] });
    const before = athleteParams({ sessions: s, asOf: "2026-09-30" });
    assert.ok(before.efforts.every(e => e.date <= "2026-09-30"));
    assert.equal(before.version, 1);
});
