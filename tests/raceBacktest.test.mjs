// Unit tests for the Model check (js/raceBacktest.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { backtest, predictOne, compare, exportable } from "../js/raceBacktest.js";
import { vdotEquivalent } from "../js/vdot.js";
import { athlete, trueTime } from "./athleteFixture.mjs";

const RACES = [
    { date: "2026-05-02", meters: 5000, sec: Math.round(trueTime(5000)) },
    { date: "2026-06-13", meters: 10000, sec: 2400 },
    { date: "2026-08-08", meters: 21097.5, sec: Math.round(trueTime(21097.5)) },
    { date: "2026-09-13", meters: 10000, sec: 2390 }
];
const sessions = athlete({ asOf: "2026-10-04", weeks: 30, longMiles: 18, easyMiles: 8, races: RACES });
const race = d => sessions.find(s => s.date === d && s.race);

test("each race is predicted only from what came before it", () => {
    const full = predictOne(race("2026-08-08"), sessions);
    const cut = predictOne(race("2026-08-08"), sessions.filter(s => s.date <= "2026-08-08"));
    assert.deepEqual(full.predictions, cut.predictions);
    assert.equal(full.actual, RACES[2].sec);
});

test("Riegel and VDOT come from the most recent earlier race", () => {
    const row = predictOne(race("2026-08-08"), sessions);
    assert.equal(Math.round(row.predictions.riegel), Math.round(2400 * Math.pow(21097.5 / 10000, 1.06)));
    assert.equal(Math.round(row.predictions.vdot), Math.round(vdotEquivalent(10000, 2400, 21097.5)));
    assert.equal(row.predictions.last, undefined, "no earlier half to compare with");
    const ten = predictOne(race("2026-09-13"), sessions);
    assert.equal(ten.predictions.last, 2400, "your last 10K");
    assert.ok(Math.abs(ten.errors.last - (2400 - 2390) / 2390) < 1e-9);
});

test("the whole check: rows newest first, every method summarized, the range's hit rate", () => {
    const r = backtest(sessions);
    assert.deepEqual(r.rows.map(x => x.date), ["2026-09-13", "2026-08-08", "2026-06-13", "2026-05-02"]);
    assert.equal(r.summary.riegel.n, 3, "the first race has no race before it");
    assert.equal(r.summary.southbound.n, 4, "training alone can predict the first race");
    assert.ok(r.summary.southbound.maePct >= 0 && r.summary.southbound.rmsePct >= r.summary.southbound.maePct);
    assert.equal(r.coverage.n, 4);
    assert.equal(r.vsRiegel.verdict, "not enough races", "3 shared races can't separate methods");
});

test("compare: a clear winner only with enough races and a CI that excludes zero", () => {
    const rows = n => Array.from({ length: n }, (_, i) => ({ errors: { southbound: 0.01 * (i % 2 ? 1 : -1), riegel: -0.05 - 0.001 * i } }));
    assert.equal(compare(rows(3)).verdict, "not enough races");
    const c = compare(rows(10));
    assert.equal(c.verdict, "better");
    assert.ok(c.hi < 0);
    const mixed = Array.from({ length: 10 }, (_, i) => ({ errors: { southbound: i % 2 ? 0.05 : 0.01, riegel: i % 2 ? 0.01 : 0.05 } }));
    assert.equal(compare(mixed).verdict, "not yet distinguishable");
});

test("Copy results holds times and errors only", () => {
    const out = exportable(backtest(sessions));
    const text = JSON.stringify(out);
    assert.ok(!/Race|Run"/.test(text), "no names");
    assert.equal(out.races.length, 4);
    assert.ok(Number.isInteger(out.races[0].predictions.southbound));
});

test("half and marathon races are also predicted without preparation and with the fixed trim, and COROS with it, so the athlete's own races can decide", () => {
    const half = predictOne(race("2026-08-08"), sessions);
    assert.ok(half.predictions.prep > 0, "Southbound + preparation trim");
    assert.ok(half.predictions.prep >= half.predictions.noPrep - 1, "the trim can only slow a prediction");
    assert.ok(half.predictions.noPrep > 0, "Southbound without preparation (0.2.0)");
    assert.ok(half.predictions.southbound >= half.predictions.noPrep - 1, "a learned effect can only slow it");
    assert.equal(half.predictions.coros, undefined, "COROS predicts the marathon only");
    const ten = predictOne(race("2026-09-13"), sessions);
    assert.equal(ten.predictions.prep, undefined, "no preparation check below the half");
    assert.equal(ten.predictions.noPrep, undefined);
    // A marathon with a COROS prediction before it: raw COROS and COROS + trim both scored.
    const mar = { date: "2026-10-03", meters: 42195, sec: Math.round(trueTime(42195) * 1.02) };
    const s = athlete({ asOf: "2026-10-04", weeks: 30, longMiles: 12, easyMiles: 5, races: [...RACES, mar] });
    const fitness = { "2026-09-28": { marathon: "3:05:00" } };
    const row = predictOne(s.find(x => x.date === "2026-10-03" && x.race), s, { fitness });
    assert.equal(row.predictions.coros, 3 * 3600 + 300, "COROS as COROS gave it");
    assert.ok(row.predictions.corosPrep > row.predictions.coros, "COROS + trim (the 0.1.0 way) is slower");
    const all = backtest(s, { fitness });
    assert.ok(all.summary.coros.n === 1 && all.summary.corosPrep.n === 1 && all.summary.prep.n >= 2);
    assert.equal(all.vsPrep.verdict, "not enough races");
    assert.equal(all.vsNoPrep.verdict, "not enough races");
    assert.ok("vsPrep" in exportable(all) && "vsNoPrep" in exportable(all));
});
