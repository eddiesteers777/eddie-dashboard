// Unit tests for race capability (js/raceCapability.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { predictRace, durability, typicalWeeklyMiles, clock, RACE_MODEL_VERSION } from "../js/raceCapability.js";
import { athlete, trueTime } from "./athleteFixture.mjs";

const ASOF = "2026-10-04";
const tenK = { date: "2026-09-13", meters: 10000, sec: 2400, name: "Fall 10K" };

test("nothing to go on: no time, grade D, says what's missing", () => {
    const r = predictRace({ meters: 42195, asOf: ASOF, sessions: [] });
    assert.equal(r.sec, null);
    assert.equal(r.quality.grade, "D");
    assert.match(r.explanation[0], /confirm a race/);
});

test("marathon from a 10K with full marathon training: near Riegel, no durability penalty, a range", () => {
    const s = athlete({ asOf: ASOF, weeks: 16, longMiles: 20, easyMiles: 9, races: [tenK] });
    const r = predictRace({ meters: 42195, asOf: ASOF, sessions: s });
    assert.equal(r.version, RACE_MODEL_VERSION);
    const races = r.lenses.find(l => l.key === "races");
    assert.ok(Math.abs(races.sec - trueTime(42195)) < 30, clock(races.sec));
    assert.ok(r.durability.deficit < 0.001, String(r.durability.deficit));
    assert.ok(r.lo < r.sec && r.sec < r.hi);
    assert.ok(r.lenses.some(l => l.key === "training"));
    assert.equal(r.quality.grade, "A");
    assert.match(r.explanation.join(" "), /training looks complete/);
});

test("the same 10K with little marathon training: preparation is shown, not taken off the time (0.2.0); the old trim only on request", () => {
    const fullS = athlete({ asOf: ASOF, longMiles: 20, easyMiles: 9, races: [tenK] });
    const thinS = athlete({ asOf: ASOF, longMiles: 11, easyMiles: 4, races: [tenK] });
    const full = predictRace({ meters: 42195, asOf: ASOF, sessions: fullS });
    const thin = predictRace({ meters: 42195, asOf: ASOF, sessions: thinS });
    assert.ok(thin.durability.deficit > 0.03, String(thin.durability.deficit));
    assert.equal(thin.durability.applied, false);
    assert.ok(Math.abs(thin.sec - full.sec) < 1, `${clock(thin.sec)} vs ${clock(full.sec)}: the headline time doesn't move`);
    assert.ok(thin.lenses.every(l => !l.adjusted));
    const text = thin.explanation.join(" ");
    assert.match(text, /Marathon-specific training is \d+% of a typical plan/);
    assert.match(text, /0 runs of 18\+ mi \(typical 4\)/);
    assert.match(text, /Not taken off the time.*could cost up to about \d+ min/);
    assert.ok(thin.durability.couldCostSec > 60);
    // The 0.1.0 way, for the backtest's comparison.
    const trimmed = predictRace({ meters: 42195, asOf: ASOF, sessions: thinS, applyPreparation: true });
    assert.ok(trimmed.durability.applied);
    assert.ok(trimmed.sec > full.sec * 1.03, `${clock(trimmed.sec)} vs ${clock(full.sec)}`);
    assert.match(trimmed.explanation.join(" "), /Marathon-specific training trims about \d+ min/);
    const training = trimmed.lenses.find(l => l.key === "training");
    assert.ok(training.adjusted && training.sec > training.raw);
});

test("COROS is used exactly as COROS gives it, even when the preparation trim is applied", () => {
    const thinS = athlete({ asOf: ASOF, longMiles: 11, easyMiles: 4, races: [tenK] });
    const fitness = { "2026-10-01": { marathon: "3:10:00" } };
    for (const applyPreparation of [false, true]) {
        const r = predictRace({ meters: 42195, asOf: ASOF, sessions: thinS, fitness, applyPreparation });
        const coros = r.lenses.find(l => l.key === "coros");
        assert.equal(coros.sec, 11400);
        assert.equal(coros.raw, 11400);
        assert.equal(coros.adjusted, false);
        assert.match(coros.note, /used as it is/);
    }
});

test("durability only applies from the half up, and uses typical volume for the predicted time", () => {
    const s = athlete({ asOf: ASOF, races: [tenK] });
    assert.equal(durability(s, ASOF, 10000, 2400), null);
    assert.equal(durability(s, ASOF, 21097.5, 5300).kind, "half");
    assert.equal(typicalWeeklyMiles(180), 55);
    assert.equal(typicalWeeklyMiles(195), 50);
    assert.equal(typicalWeeklyMiles(120), 70);
});

test("lenses that disagree widen the range; COROS counts only for the marathon", () => {
    const s = athlete({ asOf: ASOF, longMiles: 20, easyMiles: 9, races: [tenK] });
    const agree = predictRace({ meters: 42195, asOf: ASOF, sessions: s, fitness: { "2026-10-01": { marathon: clock(trueTime(42195)) } } });
    const disagree = predictRace({ meters: 42195, asOf: ASOF, sessions: s, fitness: { "2026-10-01": { marathon: "2:40:00" } } });
    assert.ok(agree.lenses.some(l => l.key === "coros"));
    assert.ok((disagree.hi - disagree.lo) > (agree.hi - agree.lo) * 1.2, `${clock(disagree.hi - disagree.lo)} vs ${clock(agree.hi - agree.lo)}`);
    assert.match(disagree.explanation[0], /apart/);
    const half = predictRace({ meters: 21097.5, asOf: ASOF, sessions: s, fitness: { "2026-10-01": { marathon: "2:40:00" } } });
    assert.ok(!half.lenses.some(l => l.key === "coros"));
    const stale = predictRace({ meters: 42195, asOf: ASOF, sessions: s, fitness: { "2026-08-01": { marathon: "2:40:00" } } });
    assert.ok(!stale.lenses.some(l => l.key === "coros"), "older than 30 days");
});

test("only what happened by asOf counts: a later race changes nothing", () => {
    const later = { date: "2026-10-03", meters: 21097.5, sec: 5000 };
    const s = athlete({ asOf: ASOF, races: [tenK, later] });
    const a = predictRace({ meters: 42195, asOf: "2026-09-30", sessions: s });
    const b = predictRace({ meters: 42195, asOf: "2026-09-30", sessions: s.filter(x => x.date <= "2026-09-30") });
    assert.equal(a.sec, b.sec);
    assert.match(a.lenses.find(l => l.key === "races").note, /10K on Sep 13/);
});

test("an old race on its own: low confidence and the reason", () => {
    const s = athlete({ asOf: ASOF, weeks: 2, races: [{ date: "2026-01-10", meters: 10000, sec: 2400 }] }).filter(x => x.race || x.date >= "2026-09-20");
    const r = predictRace({ meters: 42195, asOf: ASOF, sessions: s });
    assert.equal(r.confidence, "Low");
    assert.ok(r.quality.flags.some(f => /months old/.test(f)), r.quality.flags.join(" | "));
});

test("training factor: learns how the athlete's races compare with their training, shrunk toward 0.97", async () => {
    const { trainingFactor, TRAINING_FACTOR_PRIOR } = await import("../js/raceCapability.js");
    const none = trainingFactor(athlete({ asOf: ASOF, weeks: 4 }), ASOF);
    assert.equal(none.n, 0);
    assert.equal(none.value, TRAINING_FACTOR_PRIOR);
    // Three races each much faster than the tempo runs suggest: the factor moves well below 0.97.
    const fast = athlete({ asOf: ASOF, weeks: 30, races: [
        { date: "2026-05-09", meters: 10000, sec: 2250 }, { date: "2026-07-11", meters: 10000, sec: 2240 }, { date: "2026-09-12", meters: 10000, sec: 2230 }] });
    const f = trainingFactor(fast, ASOF);
    assert.equal(f.n, 3);
    assert.ok(f.value < 0.95, String(f.value));
});

test("track record: marathons that keep running slower than predicted move the next prediction", async () => {
    const { trackRecord } = await import("../js/raceCapability.js");
    // Shorter races follow Riegel; each marathon comes in 5% slower than Riegel from the 10K before it.
    const races = [];
    for (const [y, m] of [[2024, "04"], [2025, "04"]]) {
        races.push({ date: `${y}-02-10`, meters: 10000, sec: 2400 });
        races.push({ date: `${y}-${m}-13`, meters: 42195, sec: Math.round(trueTime(42195) * 1.05) });
    }
    races.push({ date: "2026-09-12", meters: 10000, sec: 2400 });
    const s = athlete({ asOf: ASOF, weeks: 140, longMiles: 20, easyMiles: 9, races });
    const t = trackRecord(s, ASOF, 42195);
    assert.equal(t.n, 2);
    // The 10K → marathon pairs already pull the exponent up, so part of the gap is gone before this step.
    assert.ok(t.avgMiss > 0.02, String(t.avgMiss));
    assert.ok(t.value > 1.01 && t.value < t.avgMiss + 1, String(t.value));
    const r = predictRace({ meters: 42195, asOf: ASOF, sessions: s });
    const raw = predictRace({ meters: 42195, asOf: ASOF, sessions: s, calibrate: false });
    assert.ok(r.sec > raw.sec * 1.01, `${clock(r.sec)} vs ${clock(raw.sec)}`);
    assert.match(r.explanation.join(" "), /2 earlier marathon-length races ran [\d.]+% slower/);
    // A 10K prediction isn't touched by the marathons.
    assert.equal(trackRecord(s, ASOF, 10000).n, 3);
});
