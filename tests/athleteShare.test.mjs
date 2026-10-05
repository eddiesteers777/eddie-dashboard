// Unit tests for the athlete model's shared history (js/athleteShare.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeShare, decodeShare, dayNumber, dateOfDay, SHARE_LIMITS, SHARE_PATTERN, SHARE_DAYS } from "../js/athleteShare.js";
import { addDays } from "../js/athleteLedger.js";

const TODAY = "2026-10-04";
const run = (over = {}) => ({
    id: "c:470123456789", aliases: ["s:f1234"], sources: ["coros", "strava"], date: "2026-10-03",
    start: "2026-10-03T12:31:00.000Z", name: "Fall Classic 10K", otherName: "", distance: 10050, movingSec: 2410,
    elapsedSec: 2422, avgHr: 171, maxHr: 186, climb: 34, best: [370, 1190, 2401, null, null],
    indoor: false, trail: true, rpe: 9, rpeAnswered: true,
    race: { status: "race", meters: 10000, timeSec: 2422, allOut: true, name: "Fall Classic 10K", date: "2026-10-03" },
    ...over
});

test("days and dates round-trip", () => {
    for (const d of ["1970-01-01", "2016-02-29", TODAY, "2030-12-31"]) assert.equal(dateOfDay(dayNumber(d)), d);
});

test("a run comes back with everything the engines read, and nothing else", () => {
    const share = encodeShare({ sessions: [run()] }, TODAY);
    assert.match(share.runs, SHARE_PATTERN);
    const [s] = decodeShare(share).sessions;
    assert.equal(s.id, "c:470123456789");
    assert.equal(s.date, "2026-10-03");
    assert.equal(s.start, "2026-10-03T12:31:00.000Z");
    assert.deepEqual([s.distance, s.movingSec, s.elapsedSec, s.avgHr, s.maxHr, s.climb], [10050, 2410, 2422, 171, 186, 34]);
    assert.deepEqual(s.best, [370, 1190, 2401, null, null]);
    assert.equal(s.trail, true);
    assert.equal(s.indoor, false);
    assert.equal(s.rpe, 9);
    assert.equal(s.rpeAnswered, true);
    assert.deepEqual({ ...s.race, name: undefined, date: undefined }, { status: "race", meters: 10000, timeSec: 2422, allOut: true, name: undefined, date: undefined });
    assert.equal(s.name, "Race", "only that the name sounds like a race");
    assert.doesNotMatch(JSON.stringify(share), /Fall|Classic/);
});

test("effort 10, skipped effort, no answer, workouts, treadmills and a not-a-race answer", () => {
    const sessions = [
        run({ id: "c:1", rpe: 10, race: null, name: "Morning Run" }),
        run({ id: "c:2", rpe: null, rpeAnswered: true, race: { status: "not" }, name: "Tempo Tuesday", indoor: true, trail: false, climb: 0 }),
        run({ id: "l:abc-123", sources: ["log"], rpe: null, rpeAnswered: false, race: null, start: null, movingSec: null, elapsedSec: null, avgHr: null, maxHr: null, climb: null, best: null, name: "Logged run" })
    ];
    const [a, b, c] = decodeShare(encodeShare({ sessions }, TODAY)).sessions;
    assert.equal(a.rpe, 10);
    assert.equal(a.name, "Run");
    assert.equal(b.rpe, null);
    assert.equal(b.rpeAnswered, true);
    assert.equal(b.race.status, "not");
    assert.equal(b.name, "Workout");
    assert.equal(b.indoor, true);
    assert.equal(b.climb, 0);
    assert.equal(c.id, "l:abc123");
    assert.deepEqual(c.sources, ["log"]);
    assert.equal(c.rpeAnswered, false);
    assert.equal(c.start, null);
    assert.equal(c.movingSec, null);
    assert.equal(c.best, null);
});

test("health, fitness and morning check-ins: numbers only; pain and sickness as yes / no", () => {
    const health = { [TODAY]: { hrv: { avg: 61, low: 52, high: 70, baseline: 60, status: "Normal" }, rhr: 47, sleep: { asleepMin: 452, score: 81, deepMin: 90 }, stress: { avg: 30 } } };
    const fitness = { [TODAY]: { recovery: { percent: 88, status: "Fully recovered" }, marathon: "3:04:51", threshold: "6:35", vo2max: 58 } };
    const checkins = { [TODAY]: { soreness: 2, energy: 4, mood: 5, sick: true, pain: "left knee", note: "slept badly", tags: ["alcohol"] }, "2026-10-03": { note: "only words" } };
    const share = encodeShare({ health, fitness, checkins }, TODAY);
    assert.match(share.health, SHARE_PATTERN);
    assert.match(share.checkins, SHARE_PATTERN);
    const d = decodeShare(share);
    assert.deepEqual(d.health[TODAY], { hrv: { avg: 61, low: 52, high: 70, baseline: 60 }, rhr: 47, sleep: { asleepMin: 452, score: 81 } });
    assert.deepEqual(d.fitness[TODAY], { recovery: { percent: 88 }, marathon: "3:04:51", threshold: "6:35" });
    assert.equal(d.checkins[TODAY].soreness, 2);
    assert.equal(d.checkins[TODAY].mood, 5);
    assert.equal(d.checkins[TODAY].sick, true);
    assert.match(d.checkins[TODAY].pain, /reported/);
    assert.equal(d.checkins["2026-10-03"], undefined, "a morning with only words isn't shared");
    assert.doesNotMatch(JSON.stringify(share), /knee|slept|alcohol/);
});

test("windows and limits: a year of runs, 120 nights; the oldest go first when a list is full", () => {
    const sessions = Array.from({ length: 900 }, (_, i) => run({ id: `c:${1000000000000 + i}`, date: addDays(TODAY, -Math.floor(i / 2)), start: null }));
    const health = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [addDays(TODAY, -i), { hrv: { avg: 60 }, rhr: 48, sleep: { asleepMin: 450 } }]));
    const share = encodeShare({ sessions, health }, TODAY);
    for (const k of ["runs", "health", "checkins"]) assert.ok(share[k].length <= SHARE_LIMITS[k], k);
    const d = decodeShare(share);
    assert.equal(Object.keys(d.health).length, SHARE_DAYS.health);
    const dates = d.sessions.map(s => s.date).sort();
    assert.ok(dates[0] >= addDays(TODAY, -364));
    assert.equal(dates.at(-1), TODAY);
    // Squeezed: the newest stay.
    const big = Array.from({ length: 2000 }, (_, i) => run({ id: `c:${1000000000000 + i}`, date: addDays(TODAY, -Math.floor(i / 6)) }));
    const tight = encodeShare({ sessions: big }, TODAY);
    assert.ok(tight.runs.length <= SHARE_LIMITS.runs && tight.runs.length > SHARE_LIMITS.runs - 200);
    assert.equal(decodeShare(tight).sessions.at(-1).date, TODAY);
});

test("the rule's limits and alphabet match the module's", () => {
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const block = rules.slice(rules.indexOf("function validSharedAthleteModel"), rules.indexOf("match /sharedAthleteModel"));
    for (const [k, n] of Object.entries(SHARE_LIMITS)) {
        assert.match(block, new RegExp(`d\\.${k}\\.size\\(\\) <= ${n} && d\\.${k}\\.matches\\("\\^\\[0-9a-z,;~\\]\\*\\$"\\)`), k);
    }
    assert.equal(SHARE_PATTERN.source, "^[0-9a-z,;~]*$");
    assert.deepEqual(decodeShare(null).sessions, []);
});
