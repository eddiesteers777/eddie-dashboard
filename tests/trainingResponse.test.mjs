// Unit tests for the training response (js/trainingResponse.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitHrSpeed, easyRuns, efficiency, sessionClass, effortResponse, qualityHr, executionSummary, decoupling, reading, READINGS, doseBacktest, seriesNoise, RESPONSE_VERSION } from "../js/trainingResponse.js";
import { addDays } from "../js/athleteLedger.js";
import { sessionDoses } from "../js/sessionDose.js";
import { athlete } from "./athleteFixture.mjs";

const TODAY = "2026-10-04";
const M = 1609.344;

/** An easy run: session + its dose. hr(date, v) decides the heart rate. */
function easyPair(date, i, { secPerMile = 510, miles = 6, hr = 145, extra = {}, intensity = 0.72 } = {}) {
    const wobble = [-12, 0, 10, -6, 6][i % 5];
    const spm = secPerMile + wobble;
    const sec = Math.round(miles * spm);
    const v = miles * M / sec;
    const s = { id: `c:e${i}`, date, distance: miles * M, movingSec: sec, avgHr: typeof hr === "function" ? hr(date, v) : hr, climb: 0, indoor: false, ...extra };
    const d = { id: s.id, date, intensity, hrr: 0.6, dose: 50, domains: { easy: 50, threshold: 0, hard: 0 }, miles, minutes: sec / 60, long: false, rpe: null };
    return { s, d };
}
function history(days, hr, opts = {}) {
    const pairs = [];
    for (let i = 0; i < days; i++) { const date = addDays(TODAY, -i); if (i % 7 !== 3) pairs.push(easyPair(date, i, { hr, ...opts })); }
    return { sessions: pairs.map(p => p.s).reverse(), doses: pairs.map(p => p.d).reverse() };
}
// HR follows speed (25 bpm per m/s) around a base.
const line = base => (date, v) => Math.round(base(date) + 25 * (v - 3.15));

test("fitHrSpeed: robust slope from many runs, the prior when speeds barely differ", () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ v: 2.8 + (i % 10) * 0.08, hr: 60 + 25 * (2.8 + (i % 10) * 0.08) }));
    pts[3].hr = 200;                        // a bad strap reading
    const f = fitHrSpeed(pts);
    assert.ok(Math.abs(f.b - 25.4) < 0.5, String(f.b));
    assert.ok(Math.abs(f.a + f.b * 3 - 135) < 1);
    assert.equal(fitHrSpeed([{ v: 3, hr: 140 }, { v: 3.01, hr: 150 }, { v: 3.02, hr: 141 }]).b, 30);
});

test("easy runs that count: not treadmill, race, hilly, too short or too hard", () => {
    const { s, d } = easyPair("2026-10-01", 1);
    const variants = [
        [{ indoor: true }, {}], [{ race: { status: "race" } }, {}], [{ climb: 200 }, {}],
        [{ movingSec: 1200 }, {}], [{}, { intensity: 0.9 }], [{ avgHr: null }, {}]
    ];
    assert.equal(easyRuns([s], [d]).length, 1);
    for (const [se, de] of variants) assert.equal(easyRuns([{ ...s, ...se }], [{ ...d, ...de }]).length, 0, JSON.stringify(se) + JSON.stringify(de));
});

test("efficiency: easy HR 6 bpm lower in the last 2 weeks reads as 'lower', with the pace it's worth", () => {
    const { sessions, doses } = history(110, line(date => (date > addDays(TODAY, -14) ? 139 : 145)));
    const e = efficiency(sessions, doses, TODAY);
    assert.equal(e.version, RESPONSE_VERSION);
    assert.equal(e.signal.verdict, "lower");
    assert.ok(e.signal.bpm < -4 && e.signal.bpm > -8, String(e.signal.bpm));
    assert.ok(e.signal.paceSec > 15, String(e.signal.paceSec));
    assert.equal(e.signal.to, addDays(TODAY, -8));
    assert.ok(e.refHr >= 140 && e.refHr <= 146);
    // The weekly pace at the usual HR gets faster in the last weeks.
    const w = e.weeks.filter(x => x.pace);
    assert.ok(w.at(-1).pace < w.at(-4).pace, `${w.at(-4).pace} -> ${w.at(-1).pace}`);
});

test("efficiency: steady HR = no change; noise alone doesn't call one; few runs say so", () => {
    const steady = history(110, line(() => 145));
    assert.equal(efficiency(steady.sessions, steady.doses, TODAY).signal.verdict, "none");
    const noisy = history(110, (date, v) => line(() => 145)(date, v) + ((date.charCodeAt(9) % 3) - 1) * 4);
    assert.equal(efficiency(noisy.sessions, noisy.doses, TODAY).signal.verdict, "none");
    const few = history(10, line(() => 145));
    assert.equal(efficiency(few.sessions, few.doses, TODAY).signal.verdict, "few");
    assert.equal(efficiency([], [], "2026-07-10").summer, true);
});

test("sessionClass: race, long, intervals, threshold, tempo, steady, easy", () => {
    const d = (intensity, extra = {}) => ({ intensity, dose: 100, domains: { easy: 100, threshold: 0, hard: 0 }, long: false, ...extra });
    assert.equal(sessionClass(d(0.9), { race: { status: "race" } }), "race");
    assert.equal(sessionClass(d(0.75, { long: true })), "long");
    assert.equal(sessionClass(d(0.9, { domains: { easy: 50, threshold: 20, hard: 30 } })), "intervals");
    assert.equal(sessionClass(d(0.95)), "threshold");
    assert.equal(sessionClass(d(0.88)), "tempo");
    assert.equal(sessionClass(d(0.82)), "steady");
    assert.equal(sessionClass(d(0.7)), "easy");
    assert.equal(sessionClass(d(null, { hrr: 0.9 })), "threshold");
});

test("effort vs expected: defaults first, then your own; 3 harder-than-usual runs = costing more", () => {
    const doses = [];
    for (let i = 30; i >= 6; i--) doses.push({ id: `c:${i}`, date: addDays(TODAY, -i), intensity: 0.72, dose: 50, domains: { easy: 50, threshold: 0, hard: 0 }, long: false, minutes: 50, rpe: 4 });
    for (let i = 3; i >= 1; i--) doses.push({ id: `c:${i}`, date: addDays(TODAY, -i), intensity: 0.72, dose: 50, domains: { easy: 50, threshold: 0, hard: 0 }, long: false, minutes: 50, rpe: 6 });
    const r = effortResponse([], doses, TODAY);
    assert.equal(r.rows[0].expected, 3, "the first easy run expects the default 3");
    assert.ok(r.rows[24].expected > 3.8, "after 24 easy runs at 4, expect about 4");
    assert.equal(r.signal.verdict, "costlier");
    assert.ok(r.signal.mean >= 1);
    // A long run expects more for its extra hour.
    const long = effortResponse([], [{ id: "x", date: TODAY, intensity: 0.7, dose: 150, domains: { easy: 150, threshold: 0, hard: 0 }, long: true, minutes: 180, rpe: 6 }], TODAY);
    assert.equal(long.rows[0].expected, 5.8);
    assert.equal(effortResponse([], doses.slice(0, 2), TODAY).signal.verdict, "few");
});

test("quality HR: reps at the same speed 5 bpm higher than the 8 weeks before", () => {
    const anchors = new Map();
    const doses = [], laps = {};
    for (let w = 9; w >= 0; w--) {
        const date = addDays("2026-10-01", -7 * w);
        const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d);
        anchors.set(addDays(date, -((t.getDay() + 6) % 7)), { v60: 4.0 });
        doses.push({ id: `q${w}`, date });
        const bump = w === 0 ? 5 : 0;
        laps[`q${w}`] = [{ m: 3000, s: 1000, hr: 140 }, ...[4.0, 4.1, 4.2, 4.0].map(v => ({ m: v * 300, s: 300, hr: 150 + 20 * (v - 4) + bump }))];
    }
    const q = qualityHr(doses, laps, anchors, TODAY);
    const last = q.sessions.at(-1);
    assert.ok(Math.abs(last.residual - 5) < 1, String(last.residual));
    assert.equal(q.sessions[0].date > "2026-08-01", true, "needs 8 earlier reps before the first verdict");
});

test("execution and long-run drift", () => {
    const sets = [{ reps: 4, distance: "1mi", pace: "6:40-6:50" }];
    const lapsByLabel = { L1: { laps: [{ m: 1609, s: 600, hr: 140 }, { m: 1609, s: 402, hr: 165 }, { m: 1609, s: 405, hr: 167 }, { m: 1609, s: 380, hr: 170 }, { m: 1609, s: 425, hr: 168 }] } };
    const ex = executionSummary([{ date: "2026-10-01", title: "4 x 1 mi", sets, run: { labelId: "L1" } }], lapsByLabel, TODAY);
    assert.equal(ex.sessions, 1);
    assert.equal(ex.onTarget, 2);
    assert.equal(ex.fast + ex.slow, 2);
    const long = { id: "c:L", date: "2026-10-03", long: true, minutes: 150, miles: 18 };
    const ls = Array.from({ length: 18 }, (_, i) => ({ m: 1609, s: 500, hr: i < 9 ? 140 : 147 }));
    const dc = decoupling([long], { "c:L": ls }, TODAY);
    assert.ok(Math.abs(dc[0].drift - 4.8) < 0.2, String(dc[0].drift));
});

test("reading: every combination, honest about the ambiguous ones", () => {
    const r = (hr, ef) => reading({ verdict: hr }, { verdict: ef }).key;
    assert.equal(r("lower", "usual"), "adaptation");
    assert.equal(r("lower", "costlier"), "deep");
    assert.equal(r("higher", "costlier"), "fatigue");
    assert.equal(r("higher", "usual"), "hrOnly");
    assert.equal(r("none", "costlier"), "costlier");
    assert.equal(r("none", "usual"), "steady");
    assert.equal(r("none", "easier"), "easier");
    assert.equal(r("few", "few"), "partial");
    assert.match(reading({ verdict: "lower" }, { verdict: "few" }).note, /effort answer/);
    for (const v of Object.values(READINGS)) assert.doesNotMatch(v.text + v.title, /safe|danger|injury risk/i);
});

test("dose test: a response that follows recent load is found; too few probes say so", () => {
    const s = athlete({ asOf: TODAY, weeks: 30, races: [{ date: "2026-03-14", meters: 10000, sec: 2400 }] });
    // Some big weeks: double the easy days in a few blocks.
    s.forEach(x => { x.maxHr = 185; if (/^2026-0(6|8)-1/.test(x.date) && x.distance < 20000) x.distance *= 1.8; });
    const dr = sessionDoses(s, TODAY);
    const byDate = new Map();
    for (const d of dr.doses) byDate.set(d.date, (byDate.get(d.date) || 0) + d.dose);
    const recent = date => { let t = 0; for (let i = 1; i <= 7; i++) t += byDate.get(addDays(date, -i)) || 0; return t; };
    const probes = dr.doses.filter((d, i) => i % 2 === 0 && d.date > "2026-04-20").map(d => ({ date: d.date, residual: recent(d.date) / 40 + ((d.date.charCodeAt(9) % 5) - 2) }));
    const bt = doseBacktest(dr, probes, { draws: 300 });
    const primary = bt.variants.find(v => v.key === "primary");
    assert.ok(bt.n >= 20 && primary.r > 0.3 && primary.lo > 0 && bt.link, JSON.stringify(primary));
    assert.equal(doseBacktest(dr, probes.slice(0, 5)).verdict, "few");
    assert.deepEqual(seriesNoise([500, 498, 502, 497, 499]), { weeks: 5, sd: 4 });
    assert.equal(seriesNoise([500, null]), null);
});
