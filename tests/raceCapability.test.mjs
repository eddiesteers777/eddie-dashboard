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
    assert.match(r.explanation.join(" "), /training is all there/);
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

// ---------- 0.3.0: audit B1–B4 ----------
// Blocks of 16 weeks, each ending in a marathon; `thin` blocks have short long runs and low miles.
function blocks(list, { now = null } = {}) {
    const out = [];
    for (const b of list) out.push(...athlete({ asOf: b.date, weeks: 16, longMiles: b.thin ? 11 : 20, easyMiles: b.thin ? 4 : 9, races: [{ date: b.date, meters: 42195, sec: Math.round(trueTime(42195) * b.slow) }] }));
    if (now) out.push(...athlete({ asOf: now.asOf, weeks: 16, longMiles: now.thin ? 11 : 20, easyMiles: now.thin ? 4 : 9, races: now.races || [] }));
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
const HISTORY = [
    { date: "2023-04-16", thin: false }, { date: "2023-10-15", thin: true },
    { date: "2024-04-14", thin: false }, { date: "2024-10-13", thin: true }
];
const NOW = { asOf: "2025-04-01", thin: true, races: [{ date: "2025-03-15", meters: 10000, sec: 2400 }] };

test("B1: several races share an error, so the race lens doesn't narrow as if they were independent", () => {
    const one = predictRace({ meters: 42195, asOf: ASOF, sessions: athlete({ asOf: ASOF, races: [tenK] }) });
    const three = predictRace({ meters: 42195, asOf: ASOF, sessions: athlete({ asOf: ASOF, weeks: 20, races: [tenK, { date: "2026-08-15", meters: 10000, sec: 2400 }, { date: "2026-07-18", meters: 10000, sec: 2400 }] }) });
    const l1 = one.lenses.find(l => l.key === "races"), l3 = three.lenses.find(l => l.key === "races");
    assert.ok(Math.abs(l1.sigma - (0.03 + 0.005 * 21 / 30.4 + 0.015 * Math.log(4.2195))) < 1e-9, "one race: its own σ");
    const sigmas = [0, 1, 2].map(i => 0.03 + 0.015 * Math.log(4.2195) + 0.005 * [21, 50, 78][i] / 30.4);
    const independent = Math.sqrt(1 / sigmas.reduce((t, s) => t + 1 / s ** 2, 0));
    assert.ok(l3.sigma > independent * 1.05, `${l3.sigma} vs independent ${independent}`);
    assert.ok(l3.sigma < l1.sigma, "more races still help");
});

test("B3: the training factor is per kind of distance, each shrunk toward the athlete's overall factor", async () => {
    const { trainingFactor } = await import("../js/raceCapability.js");
    // 10Ks match training's prediction; two marathons run 8% slower than training said.
    const s = athlete({ asOf: ASOF, weeks: 40, longMiles: 20, easyMiles: 9, races: [
        { date: "2026-02-14", meters: 10000, sec: 2400 }, { date: "2026-04-12", meters: 42195, sec: Math.round(trueTime(42195) * 1.08) },
        { date: "2026-06-13", meters: 10000, sec: 2400 }, { date: "2026-08-30", meters: 42195, sec: Math.round(trueTime(42195) * 1.08) }] });
    const pooled = trainingFactor(s, ASOF);
    const mar = trainingFactor(s, ASOF, { meters: 42195 });
    const ten = trainingFactor(s, ASOF, { meters: 10000 });
    const half = trainingFactor(s, ASOF, { meters: 21097.5 });
    assert.equal(pooled.n, 4);
    assert.equal(mar.n, 2); assert.equal(mar.band, "marathon");
    assert.ok(mar.value > pooled.value && ten.value < pooled.value, `${ten.value} < ${pooled.value} < ${mar.value}`);
    assert.equal(half.n, 0); assert.equal(half.value, pooled.value, "no halves: the overall factor");
    const r = predictRace({ meters: 42195, asOf: ASOF, sessions: s });
    assert.match(r.lenses.find(l => l.key === "training").note, /your marathon-length races have run/);
});

test("B4: preparation against the athlete's own usual block, its effect learned from their races and applied once", () => {
    const slowWhenThin = blocks(HISTORY.map(b => ({ ...b, slow: b.thin ? 1.07 : 1.0 })), { now: NOW });
    const learned = predictRace({ meters: 42195, asOf: NOW.asOf, sessions: slowWhenThin });
    const off = predictRace({ meters: 42195, asOf: NOW.asOf, sessions: slowWhenThin, preparation: "off" });
    const d = learned.durability;
    assert.equal(d.basis, "yours");
    assert.equal(d.blocks, 4);
    assert.ok(d.gap > 0.15, String(d.gap));
    assert.ok(d.beta > 0.02, `β ${d.beta}`);
    assert.equal(d.learnedFrom, 2);
    assert.ok(d.applied);
    assert.ok(learned.sec > off.sec + 30, `${clock(learned.sec)} vs ${clock(off.sec)}`);
    assert.ok(Math.abs(d.effectSec - (learned.sec - learned.sec / Math.exp(d.beta * d.gap))) < 1);
    assert.match(learned.explanation.join(" "), /% of your usual marathon block \(from your 4 earlier marathons\).*after thinner blocks ran slower than the model said, so this adds/);
    assert.equal(off.durability.applied, false);
    // The same history, but thin blocks didn't cost anything: nothing learned, nothing applied.
    const fine = blocks(HISTORY.map(b => ({ ...b, slow: 1.0 })), { now: NOW });
    const r = predictRace({ meters: 42195, asOf: NOW.asOf, sessions: fine });
    assert.ok(r.durability.beta < 0.02, `β ${r.durability.beta}`);
    assert.equal(r.durability.applied, false);
    assert.match(r.explanation.join(" "), /Not taken off the time: your 2 earlier marathons after thinner blocks haven't shown it slows you/);
});

test("B2: the range learns from the athlete's own misses at that distance", () => {
    const steady = blocks(HISTORY.map(b => ({ ...b, slow: 1.0 })), { now: { ...NOW, thin: false } });
    const r = predictRace({ meters: 42195, asOf: NOW.asOf, sessions: steady });
    assert.equal(r.track.n, 4);
    assert.ok(r.track.sigmaOwn != null && r.track.within != null);
    const expected = Math.sqrt((3 * r.modelSigma ** 2 + 4 * r.track.sigmaOwn ** 2) / 7);
    assert.ok(Math.abs(r.sigma - Math.max(0.01, expected)) < 1e-9, `${r.sigma} vs ${expected}`);
    assert.match(r.explanation.join(" "), /your 4 earlier races at this distance landed within [\d.]+% of the model/);
    // Wildly scattered marathons: the range widens past the model's own.
    const scattered = blocks(HISTORY.map((b, i) => ({ ...b, thin: false, slow: [0.94, 1.08, 0.95, 1.09][i] })), { now: { ...NOW, thin: false } });
    const w = predictRace({ meters: 42195, asOf: NOW.asOf, sessions: scattered });
    assert.ok(w.sigma > w.modelSigma, `${w.sigma} vs model ${w.modelSigma}`);
});

test("B2: COROS's σ comes from its own misses once 3 marathons had a COROS number before them", async () => {
    const { corosRecord } = await import("../js/raceCapability.js");
    const s = blocks(HISTORY.map(b => ({ ...b, thin: false, slow: 1.0 })), { now: { ...NOW, thin: false } });
    const t = Math.round(trueTime(42195));
    const close = Object.fromEntries(HISTORY.map(b => [addDaysLocal(b.date, -5), { marathon: clock(t * 1.01) }]));
    const rec = corosRecord(s, close, NOW.asOf);
    assert.equal(rec.n, 4);
    assert.ok(rec.sigma < 0.06 && rec.sigma > 0.01, String(rec.sigma));
    assert.equal(corosRecord(s, { [addDaysLocal(HISTORY[0].date, -5)]: { marathon: clock(t) } }, NOW.asOf).sigma, 0.06, "under 3: the prior");
    const r = predictRace({ meters: 42195, asOf: NOW.asOf, sessions: s, fitness: { ...close, "2025-03-28": { marathon: clock(t) } } });
    const coros = r.lenses.find(l => l.key === "coros");
    assert.equal(coros.sigma, rec.sigma);
    assert.match(coros.note, /from its misses on your 4 marathons/);
});

function addDaysLocal(date, n) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
