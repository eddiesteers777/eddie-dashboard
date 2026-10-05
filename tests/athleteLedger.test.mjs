// Unit tests for the athlete's session list and race finder (js/athleteLedger.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    sessionsFrom, linkPlan, attachAnswers, buildLedger, raceDistance, raceScore, raceCandidates,
    confirmedRaces, raceRecord, notRaceRecord, effortPrompts, effortRecord, parseClock, clockText, paceText, addDays, planEffortKey
} from "../js/athleteLedger.js";

const M = 1609.344;
const at = (date, h = 6, min = 0) => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d, h, min); };
const coros = (id, date, miles, secPerMile, extra = {}) => ({
    labelId: id, date, startTime: at(date, extra.hour ?? 6).toISOString(), distance: Math.round(miles * M),
    duration: Math.round(miles * secPerMile), avgHr: 140, name: extra.name || "Pelham Run", sportType: 100
});
const strava = (k, date, meters, sec, extra = {}) => ({
    k, d: date, t: Math.round(at(date, extra.hour ?? 7).getTime() / 1000), y: "run", m: meters, s: sec, e: extra.e ?? sec + 20,
    h: 150, x: extra.x ?? 181, g: extra.g ?? 40, n: extra.n || "Morning Run", ...(extra.b ? { b: extra.b } : {})
});

// 2026-10-03 is a Saturday.
test("sessions: COROS wins on a shared run, Strava fills in what COROS lacks, runs only in Strava are added", () => {
    const c = coros("111", "2026-10-03", 13.1, 420, { hour: 7 });
    const sameRun = strava("f9", "2026-10-03", Math.round(13.12 * M), Math.round(13.1 * 420) + 5, { n: "Columbus Half", x: 188, g: 55, e: 5530, b: [380, 1300, null, 5520, null] });
    const old = strava("f1", "2024-04-15", 42400, 11200, { n: "Boston Marathon" });
    const ride = { ...strava("f2", "2024-05-01", 30000, 3600), y: "ride" };
    const s = sessionsFrom({ corosRuns: [c], stravaActs: { f9: sameRun, f1: old, f2: ride }, runLog: [] });
    assert.equal(s.length, 2, "the ride is left out and the shared run counts once");
    const half = s.find(x => x.date === "2026-10-03");
    assert.equal(half.id, "c:111");
    assert.deepEqual(half.aliases, ["s:f9"]);
    assert.deepEqual(half.sources, ["coros", "strava"]);
    assert.equal(half.otherName, "Columbus Half");
    assert.equal(half.maxHr, 188);
    assert.equal(half.climb, 55);
    assert.equal(half.elapsedSec, 5530);
    assert.equal(half.best[3], 5520);
    assert.equal(s[0].id, "s:f1", "oldest first");
});

test("sessions: hand-logged runs count unless a watch run already covers that day", () => {
    const c = coros("1", "2026-10-01", 6, 500);
    const log = [
        { id: "a", source: "manual", date: "2026-10-01", miles: 6.05 },
        { id: "b", source: "manual", date: "2026-10-02", miles: 4, type: "Easy" },
        { id: "c", source: "coros", date: "2026-10-02", miles: 4 }
    ];
    const s = sessionsFrom({ corosRuns: [c], runLog: log });
    assert.deepEqual(s.map(x => x.id), ["c:1", "l:b"]);
    assert.equal(s[1].movingSec, null);
});

test("plan link: each planned day gets the session closest to its miles", () => {
    const s = sessionsFrom({ corosRuns: [coros("a", "2026-10-03", 2, 540), coros("b", "2026-10-03", 18, 470, { hour: 7 })] });
    linkPlan(s, [{ date: "2026-10-03", miles: 18, title: "Long run" }, { date: "2026-10-04", miles: 5, title: "Easy" }]);
    assert.equal(s.find(x => x.id === "c:b").planned.title, "Long run");
    assert.equal(s.find(x => x.id === "c:a").planned, undefined);
});

test("answers attach by the session id or a Strava alias", () => {
    const c = coros("111", "2026-10-03", 13.1, 420, { hour: 7 });
    const st = strava("f9", "2026-10-03", Math.round(13.1 * M), Math.round(13.1 * 420));
    const s = buildLedger({ corosRuns: [c], stravaActs: { f9: st }, rpe: { "c:111": { rpe: 8, at: 1, scale: "cr10" } }, races: { "s:f9": { status: "race", distanceKey: "half" } } });
    assert.equal(s[0].rpe, 8);
    assert.equal(s[0].rpeAnswered, true);
    assert.equal(s[0].race.distanceKey, "half", "a race confirmed when only Strava had it still counts once COROS has the run");
});

test("race distance: standard distances, GPS reading a little long", () => {
    assert.equal(raceDistance(5040).key, "5k");
    assert.equal(raceDistance(21300).key, "half");
    assert.equal(raceDistance(42600).key, "marathon");
    assert.equal(raceDistance(16200).key, "10mi");
    assert.equal(raceDistance(12000), null);
    assert.equal(raceDistance(4800), null, "4% short is a training run, not a 5K");
});

function trainingAround(date, n = 12) {
    // Easy 5-8 milers at 8:30/mi in the weeks around a race.
    return Array.from({ length: n }, (_, i) => coros(`t${i}`, addDays(date, -(i * 3 + 1)), 5 + (i % 4), 510));
}

test("race score: a named, standard-distance, fast weekend run is a candidate with reasons", () => {
    const race = coros("r", "2026-10-03", 13.15, 425, { hour: 7, name: "Columbus Half Marathon" });
    const all = sessionsFrom({ corosRuns: [...trainingAround("2026-10-03"), race] });
    const sc = raceScore(all.find(s => s.id === "c:r"), all);
    assert.ok(sc.score >= 7, String(sc.score));
    assert.equal(sc.distance.key, "half");
    assert.ok(sc.reasons.includes('Named "Columbus Half Marathon"'));
    assert.ok(sc.reasons.includes("Half marathon distance"));
    assert.ok(sc.reasons.includes("Weekend morning"));
    assert.ok(sc.reasons.some(r => /fastest|faster/.test(r)), sc.reasons.join(" | "));
});

test("race score: an unnamed but fast 10K on a Saturday is found; easy runs and workouts aren't", () => {
    const tenK = coros("k", "2026-09-26", 6.25, 400, { hour: 8, name: "Indianapolis" });
    const tempo = coros("w", "2026-09-29", 6.22, 430, { hour: 6, name: "Tempo workout" });
    const easy = coros("e", "2026-09-27", 6.21, 515, { hour: 8 });
    const all = sessionsFrom({ corosRuns: [...trainingAround("2026-09-26"), tenK, tempo, easy] });
    const c = raceCandidates(all);
    assert.deepEqual(c.map(x => x.session.id), ["c:k"]);
});

test("race score: the plan's race day counts even without a name", () => {
    const run = coros("p", "2026-11-08", 26.4, 425, { hour: 7, name: "Indianapolis" });
    const all = linkPlan(sessionsFrom({ corosRuns: [...trainingAround("2026-11-08"), run] }), [{ date: "2026-11-08", miles: 26.2, title: "RACE DAY", race: true }]);
    const sc = raceScore(all.find(s => s.id === "c:p"), all);
    assert.ok(sc.reasons.includes("Your plan's race day"));
    assert.ok(sc.score >= 4);
});

test("candidates leave out answered runs; confirmed races list newest first", () => {
    const a = coros("a", "2025-04-12", 3.12, 380, { hour: 8, name: "Spring 5K" });
    const b = coros("b", "2025-10-11", 13.12, 420, { hour: 7, name: "Fall Half" });
    const all = buildLedger({ corosRuns: [...trainingAround("2025-04-12"), ...trainingAround("2025-10-11"), a, b], races: { "c:a": { status: "race", meters: 5000 }, "c:b": notRaceRecord(5) } });
    assert.equal(raceCandidates(all).length, 0);
    assert.deepEqual(confirmedRaces(all).map(r => r.session.id), ["c:a"]);
});

test("race record: snaps to the standard distance, elapsed time unless an official time is given", () => {
    const s = sessionsFrom({ stravaActs: { f: strava("f", "2024-04-15", 42500, 11100, { e: 11180, n: "Boston" }) } })[0];
    const r = raceRecord(s, {}, 99);
    assert.deepEqual(r, { status: "race", distanceKey: "marathon", meters: 42195, timeSec: 11180, official: false, allOut: true, date: "2024-04-15", name: "Boston", at: 99 });
    const r2 = raceRecord(s, { officialSec: 11165, allOut: false, distanceKey: "marathon" }, 100);
    assert.equal(r2.timeSec, 11165);
    assert.equal(r2.official, true);
    assert.equal(r2.allOut, false, "paced someone / ran it as a workout: kept, but not used to calibrate");
    const odd = raceRecord({ ...s, distance: 25000, elapsedSec: 7000 }, {}, 1);
    assert.equal(odd.distanceKey, null);
    assert.equal(odd.meters, 25000);
});

test("effort prompts: watch runs from the last 3 days with no answer, newest first", () => {
    const all = buildLedger({
        corosRuns: [coros("1", "2026-10-01", 5, 500), coros("2", "2026-10-02", 6, 500), coros("3", "2026-10-03", 8, 500), coros("0", "2026-09-29", 5, 500)],
        runLog: [{ id: "x", source: "manual", date: "2026-10-03", miles: 2 }],
        rpe: { "c:2": { rpe: null, skipped: true, at: 1 } }
    });
    assert.deepEqual(effortPrompts(all, "2026-10-03").map(s => s.id), ["c:3", "c:1"], "skipped one and the hand-logged run aren't asked about");
    assert.deepEqual(effortRecord(7, 5), { rpe: 7, scale: "cr10", at: 5 });
    assert.deepEqual(effortRecord(7, 5 + 40 * 60000, { endMs: 5 }), { rpe: 7, scale: "cr10", at: 5 + 40 * 60000, delayMin: 40 });
    assert.deepEqual(effortRecord(null, 5), { rpe: null, skipped: true, at: 5 });
    assert.deepEqual(effortRecord(11, 5), { rpe: null, skipped: true, at: 5 });
});

test("text helpers", () => {
    assert.equal(parseClock("1:24:10"), 5050);
    assert.equal(parseClock("24:37"), 1477);
    assert.equal(parseClock("24:77"), null);
    assert.equal(parseClock("abc"), null);
    assert.equal(clockText(11180), "3:06:20");
    assert.equal(clockText(1477), "24:37");
    assert.equal(paceText(1477, 5000), "7:55/mi");
});

test("race score: a fast weekday 10K-length tempo with no name isn't a candidate", () => {
    const tempo = coros("w", "2026-09-30", 6.22, 420, { hour: 6, name: "Indianapolis" });
    const all = sessionsFrom({ corosRuns: [...trainingAround("2026-09-30"), tempo] });
    assert.equal(raceCandidates(all).length, 0);
});

test("an effort given on Mark Done before the watch run arrived goes on that day's planned run, not its shakeout", () => {
    const runs = [coros("901", "2026-10-06", 10, 470), coros("902", "2026-10-06", 2, 560, { hour: 17 })];
    const plan = [{ date: "2026-10-06", miles: 10, title: "Tempo" }];
    const s = buildLedger({ corosRuns: runs, planDays: plan, rpe: { [planEffortKey("2026-10-06")]: { rpe: 7, at: 1, scale: "cr10" } } });
    const main = s.find(x => x.id === "c:901"), shake = s.find(x => x.id === "c:902");
    assert.equal(main.rpe, 7);
    assert.equal(main.rpeAnswered, true);
    assert.equal(shake.rpeAnswered, false, "the other run that day is still asked about");
    assert.deepEqual(effortPrompts(s, "2026-10-06").map(x => x.id), ["c:902"]);
    // The run's own answer wins.
    const own = buildLedger({ corosRuns: runs, planDays: plan, rpe: { [planEffortKey("2026-10-06")]: { rpe: 7, at: 1, scale: "cr10" }, "c:901": { rpe: 5, at: 2, scale: "cr10" } } });
    assert.equal(own.find(x => x.id === "c:901").rpe, 5);
    // Without the plan (a client's own ledger) the day answer isn't used.
    assert.equal(buildLedger({ corosRuns: runs, rpe: { [planEffortKey("2026-10-06")]: { rpe: 7, at: 1 } } }).find(x => x.id === "c:901").rpeAnswered, false);
});

test("addDays across month, year and daylight-saving edges (it is remembered, so check it twice)", () => {
    for (let k = 0; k < 2; k++) {
        assert.equal(addDays("2026-03-07", 1), "2026-03-08");
        assert.equal(addDays("2026-03-08", 1), "2026-03-09");
        assert.equal(addDays("2026-11-01", -1), "2026-10-31");
        assert.equal(addDays("2025-12-31", 1), "2026-01-01");
        assert.equal(addDays("2024-03-01", -1), "2024-02-29");
    }
});

test("effort (audit B5): old answers read on CR-10 but kept as given; delay and late; the 15-minute wait", async () => {
    const { effortPrompts, nextPromptAt } = await import("../js/athleteLedger.js");
    const end = Date.parse("2026-10-06T12:00:00Z");
    const run = { labelId: "77", startTime: "2026-10-06T11:00:00Z", date: "2026-10-06", distance: 16000, duration: 3600, avgHr: 150 };
    // An answer from before (no scale): "Steady" 5 on the first words is CR-10 4; the answer itself is untouched.
    const old = buildLedger({ corosRuns: [run], rpe: { "c:77": { rpe: 5, at: end + 30 * 60000 } } })[0];
    assert.deepEqual([old.rpeGiven, old.rpeScale, old.rpe], [5, "sb1", 4]);
    assert.equal(old.rpeDelayMin, 30, "worked out from the saved time when the answer has no delay");
    assert.equal(old.rpeLate, false);
    const late = buildLedger({ corosRuns: [run], rpe: { "c:77": { rpe: 6, at: end + 30 * 3600000, scale: "cr10", delayMin: 1800 } } })[0];
    assert.deepEqual([late.rpe, late.rpeDelayMin, late.rpeLate], [6, 1800, true]);
    // Today asks only once the run ended 15 minutes ago, and says when the next one is due.
    const fresh = buildLedger({ corosRuns: [run] });
    assert.equal(effortPrompts(fresh, "2026-10-06", { now: end + 5 * 60000 }).length, 0);
    assert.equal(nextPromptAt(fresh, "2026-10-06", end + 5 * 60000), end + 15 * 60000);
    assert.equal(effortPrompts(fresh, "2026-10-06", { now: end + 16 * 60000 }).length, 1);
    assert.equal(nextPromptAt(fresh, "2026-10-06", end + 16 * 60000), null);
    assert.equal(effortPrompts(fresh, "2026-10-06").length, 1, "without a clock (tests, older callers) nothing waits");
});
