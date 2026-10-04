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
