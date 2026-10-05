// Unit tests for readiness v2 (js/readinessV2.js) and the readiness check (js/readinessBacktest.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { zToScore, autonomic, sleepDomain, feelDomain, responseDomain, loadDomain, readinessV2, READINESS_V2_VERSION } from "../js/readinessV2.js";
import { roughDays, auc, readinessCheck, trainingOutcomes, READINESS_CHECK_VERSION } from "../js/readinessBacktest.js";
import { addDays } from "../js/athleteLedger.js";

const TODAY = "2026-10-04";
const wobble = i => [0, 3, -2, 1, -3, 2, -1][i % 7];
/** 90 nights: HRV ~60 ms, resting HR ~48, 7h30 asleep; override(i, night) for the last ones. */
function health(override = () => ({})) {
    const h = {};
    for (let i = 0; i < 90; i++) {
        const d = addDays(TODAY, -i);
        h[d] = { hrv: { avg: 60 + wobble(i), low: 52, high: 68, baseline: 60 }, rhr: 48 + (i % 3) - 1, sleep: { asleepMin: 450, score: 80 }, ...override(i) };
    }
    return h;
}

test("zToScore: normal is green, a SD below yellow, two SDs below red", () => {
    assert.equal(zToScore(0), 75);
    assert.ok(zToScore(0.4) >= 67 && zToScore(-0.4) >= 67);
    assert.ok(zToScore(-1) < 67 && zToScore(-1) >= 34);
    assert.ok(zToScore(-2) < 40);
    assert.ok(zToScore(2) > 95);
    assert.equal(zToScore(null), null);
});

test("autonomic: a week of low HRV and a higher resting HR score low, against the athlete's own baseline", () => {
    const usual = autonomic(TODAY, health());
    assert.ok(usual.score >= 67, String(usual.score));
    assert.match(usual.note, /in your normal range/);
    assert.ok(usual.hrv.own);
    const low = autonomic(TODAY, health(i => (i < 7 ? { hrv: { avg: 50 }, rhr: 53 } : {})));
    assert.ok(low.score < 45, String(low.score));
    assert.match(low.note, /below your normal/);
    assert.match(low.note, /resting HR 5 above your usual/);
    // Under 14 nights of baseline: COROS's range, said so.
    const short = {}; for (let i = 0; i < 10; i++) short[addDays(TODAY, -i)] = { hrv: { avg: 60, low: 52, high: 68, baseline: 60 } };
    assert.match(autonomic(TODAY, short).note, /COROS's range until 14 nights/);
});

test("sleep: three nights weighted toward last night, and a week's debt", () => {
    assert.equal(sleepDomain(TODAY, health()).score, 100);
    const shortNight = sleepDomain(TODAY, health(i => (i === 0 ? { sleep: { asleepMin: 360 } } : {})));
    assert.ok(shortNight.score < 85 && shortNight.score > 70, String(shortNight.score));
    const debt = sleepDomain(TODAY, health(i => (i < 7 ? { sleep: { asleepMin: 390 } } : {})));
    assert.ok(debt.score < shortNight.score && debt.debtMin === 420, `${debt.score} ${debt.debtMin}`);
    assert.match(debt.note, /7h short over 7 nights/);
    assert.equal(sleepDomain(TODAY, { [TODAY]: { sleep: { score: 64 } } }).score, 64);
});

test("feel: against the athlete's own usual once there are 8 check-ins", () => {
    const c = {};
    for (let i = 1; i <= 10; i++) c[addDays(TODAY, -i)] = { soreness: 2, energy: 4, mood: 4 };
    c[TODAY] = { soreness: 2, energy: 4, mood: 4 };
    assert.ok(feelDomain(TODAY, c).score >= 70);
    c[TODAY] = { soreness: 4, energy: 2, mood: 2 };
    const low = feelDomain(TODAY, c);
    assert.ok(low.score < 40, String(low.score));
    assert.match(low.note, /below your usual/);
    assert.equal(feelDomain(TODAY, {}), null);
});

test("response and load: only what came before the morning counts", () => {
    const effortRows = [1, 2, 3, 4].map(i => ({ date: addDays(TODAY, -i), residual: 1.5 }));
    const r = responseDomain(TODAY, { effRuns: [], effortRows: [...effortRows, { date: TODAY, residual: -5 }] });
    assert.equal(r.score, 45);
    assert.match(r.note, /1.5 harder than usual/);
    const series = Array.from({ length: 200 }, (_, i) => ({ date: addDays(TODAY, -200 + i), recent: i < 190 ? 50 : 90 }));
    const l = loadDomain(TODAY, series);
    assert.ok(l.percentile >= 94 && l.score < 45, JSON.stringify(l));
    assert.equal(loadDomain(TODAY, series.slice(0, 20)), null);
});

test("readinessV2: body-only domains, sick and pain caps, positives and the main concern, COROS shown not scored", () => {
    const h = health(i => (i < 7 ? { hrv: { avg: 50 }, rhr: 53 } : {}));
    const fitness = { [TODAY]: { recovery: { percent: 95, status: "Fully recovered" } } };
    const r = readinessV2(TODAY, { health: h, fitness, checkins: {} });
    assert.equal(r.version, READINESS_V2_VERSION);
    assert.deepEqual(r.domains.map(d => d.key), ["autonomic", "sleep"]);
    assert.ok(r.score < 67 && r.score > 40, String(r.score));
    assert.match(r.concern, /below your normal/);
    assert.match(r.positives[0], /7h 30m/);
    assert.deepEqual(r.coros, { percent: 95, status: "Fully recovered" });
    const same = readinessV2(TODAY, { health: h, fitness: {}, checkins: {} });
    assert.equal(same.score, r.score, "COROS recovery doesn't move the score");
    assert.equal(readinessV2(TODAY, { health: h, checkins: { [TODAY]: { sick: true } } }).score <= 30, true);
    assert.equal(readinessV2(TODAY, { health: h, checkins: { [TODAY]: { pain: "knee" } } }).score <= 55, true);
    assert.equal(readinessV2(TODAY, { health: { [TODAY]: { rhr: 48 } } }).score, null, "needs last night's HRV or sleep");
    // 0.2.0 (audit A4): training response and load are shown beside the score, not in it.
    const effortRows = [1, 2, 3, 4].map(i => ({ date: addDays(TODAY, -i), residual: 2 }));
    const series = Array.from({ length: 200 }, (_, i) => ({ date: addDays(TODAY, -200 + i), recent: i < 190 ? 50 : 95 }));
    const withContext = readinessV2(TODAY, { health: h, checkins: {}, response: { effRuns: [], effortRows }, loadSeries: series });
    assert.equal(withContext.score, same.score, "a hard week of runs doesn't move the body score");
    assert.deepEqual(withContext.domains.map(d => d.key), ["autonomic", "sleep"]);
    assert.deepEqual(withContext.context.map(d => d.key), ["response", "load"]);
    assert.match(withContext.context[0].note, /harder than usual/);
});

test("readiness check: bad days, AUC, and a method that does predict them", () => {
    assert.equal(auc([{ rough: true, score: 40 }, { rough: false, score: 80 }]), 1);
    assert.equal(auc([{ rough: true, score: 80 }, { rough: false, score: 40 }]), 0);
    assert.equal(auc([{ rough: true, score: 60 }, { rough: false, score: 60 }]), 0.5);
    // 60 days with a run; HRV dips the morning of every 5th day, and those days' runs feel hard.
    const bad = i => i % 5 === 0;
    const h = health(i => (bad(i) ? { hrv: { avg: 44 }, rhr: 54 } : {}));
    const effortRows = Array.from({ length: 60 }, (_, i) => ({ date: addDays(TODAY, -i), residual: bad(i) ? 2 : (i % 3) * 0.2 - 0.2 }));
    const rough = roughDays({ effortRows });
    assert.equal([...rough.values()].filter(Boolean).length, 12);
    const r = readinessCheck({ health: h, fitness: {}, checkins: {}, settings: {}, response: { effRuns: [], effortRows }, doses: [] }, TODAY, { draws: 200 });
    const hrv = r.methods.find(m => m.key === "hrv"), v2 = r.methods.find(m => m.key === "v2"), v1 = r.methods.find(m => m.key === "v1");
    assert.equal(r.version, READINESS_CHECK_VERSION);
    assert.equal(r.bad, 11, "today and yesterday wait for their next 2 days");
    assert.equal(r.kinds.rough, 11);
    assert.ok(hrv.auc > 0.9 && v2.auc > 0.85 && v1.auc > 0.6, JSON.stringify({ hrv, v2, v1 }));
    assert.ok(hrv.lo <= hrv.auc && hrv.auc <= hrv.hi);
    assert.ok(r.v2vsV1 && ["better", "same", "worse"].includes(r.v2vsV1.verdict));
    assert.equal(r.v2vsPersist?.verdict, "better", "the dips warn of something yesterday didn't");
    assert.equal(r.methods.find(m => m.key === "coros").auc, null, "no COROS recovery numbers = no verdict for it");
    assert.equal(readinessCheck({ health: h, response: { effortRows: effortRows.slice(0, 5) } }, TODAY).verdict, "few");
});

test("training outcomes: skipped, moved, cut short, off target, new pain or sickness", () => {
    const planDays = [
        { date: "2026-09-21", miles: 8 }, { date: "2026-09-22", miles: 6 }, { date: "2026-09-23", miles: 10 },
        { date: "2026-09-24", miles: 5 }, { date: "2026-09-25", miles: 6 }, { date: "2026-09-26", miles: 0 },
        { date: "2026-09-27", miles: 13.1, race: true }
    ];
    const doses = [
        { date: "2026-09-21", miles: 14 },                         // done, plus the 22nd's 6 miles
        // 22: nothing, but the day before has 6 extra: moved, not skipped
        { date: "2026-09-23", miles: 10 },
        { date: "2026-09-24", miles: 2 },                          // cut short (under 70%)
        // 25: skipped
        { date: "2026-09-26", miles: 4 },                          // unplanned run, fine
        { date: "2026-09-27", miles: 13.1 }
    ];
    const execution = [{ date: "2026-09-23", work: 6, onTarget: 2, fast: 0, slow: 4 }];
    const checkins = { "2026-09-21": {}, "2026-09-22": { pain: "calf" }, "2026-09-24": {}, "2026-09-26": { sick: true } };
    const o = trainingOutcomes({ planDays, doses, execution, checkins }, "2026-10-04");
    const kinds = d => o.get(d)?.kinds || null;
    assert.deepEqual(kinds("2026-09-21"), ["hurt"], "pain reported the next day, none that morning");
    assert.deepEqual(kinds("2026-09-22"), [], "moved to the day before; already in pain that morning, so not new");
    assert.deepEqual(kinds("2026-09-23"), ["slow"]);
    assert.deepEqual(kinds("2026-09-24"), ["skipped", "hurt"]);
    assert.deepEqual(kinds("2026-09-25"), ["skipped", "hurt"]);
    assert.deepEqual(kinds("2026-09-26"), [], "already sick that morning");
    assert.deepEqual(kinds("2026-09-27"), [], "race days aren't judged on their miles");
    assert.equal(trainingOutcomes({ planDays, doses }, "2026-09-25").has("2026-09-24"), false, "the next 2 days must be known");
    assert.deepEqual(trainingOutcomes({ planDays, doses, execution, checkins }, "2026-10-04", { kinds: ["skipped", "slow"] }).get("2026-09-21").kinds, []);
});

test("readiness check (audit A4): body numbers that are pure noise score a coin flip, and the baseline sees streaks", () => {
    // A year: HRV, sleep, resting HR and check-ins are noise; how runs go comes in streaks
    // (day-to-day correlation 0.8), and the plan is always done. Nothing about the body
    // predicts anything, so an honest check finds nothing; yesterday's outcome does.
    let seed = 3; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const h = {}, checkins = {}, effortRows = [], doses = [], planDays = [];
    let ar = 0;
    for (let i = 400; i >= 0; i--) {
        const d = addDays(TODAY, -i);
        h[d] = { hrv: { avg: 60 * Math.exp(0.08 * gauss()), low: 50, high: 70, baseline: 60 }, rhr: Math.round(48 + 2 * gauss()), sleep: { asleepMin: Math.round(450 + 40 * gauss()) } };
        checkins[d] = { soreness: 1 + Math.floor(rnd() * 5), energy: 1 + Math.floor(rnd() * 5), mood: 1 + Math.floor(rnd() * 5) };
        ar = 0.8 * ar + 0.6 * gauss();
        if (i <= 365) { effortRows.push({ date: d, residual: ar }); doses.push({ date: d, miles: 6, dose: 50 }); planDays.push({ date: d, miles: 6 }); }
    }
    const r = readinessCheck({ health: h, checkins, fitness: {}, settings: {}, response: { effRuns: [], effortRows }, doses, planDays }, TODAY, { draws: 300 });
    const m = k => r.methods.find(x => x.key === k);
    for (const k of ["v2", "v1", "hrv", "feel"]) {
        assert.ok(Math.abs(m(k).auc - 0.5) < 0.1, `${k} ${m(k).auc}`);
        assert.ok(m(k).lo < 0.5 && m(k).hi > 0.5, `${k}'s range covers a coin flip: ${m(k).lo}–${m(k).hi}`);
    }
    assert.ok(m("persist").auc > 0.65, `yesterday's outcome sees the streaks: ${m("persist").auc}`);
    assert.notEqual(r.v2vsPersist.verdict, "better");
    assert.notEqual(r.v1vsPersist.verdict, "better");
    assert.ok(r.kinds.skipped === 0 && r.kinds.rough > 30);
});
