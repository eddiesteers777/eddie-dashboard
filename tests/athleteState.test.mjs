// Unit tests for the Athlete State (js/athleteState.js, weekly planning P1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { athleteCore, athleteState, signalList, KINDS, CONFIDENCES, DOMAINS, targetOf } from "../js/athleteState.js";
import { clientInputs, clientModel } from "../js/clientModel.js";
import { encodeShare, decodeShare } from "../js/athleteShare.js";
import { addDays } from "../js/athleteLedger.js";

const TODAY = "2026-10-04";   // a Sunday
const MILE = 1609.344;
const wobble = i => [0, 3, -2, 1, -3, 2, -1][i % 7];

function year({ days = 300, pain = null } = {}) {
    const sessions = [];
    for (let i = days; i >= 1; i--) {
        const date = addDays(TODAY, -i);
        if (i % 7 === 3) continue;
        const long = i % 7 === 6;
        const miles = long ? 13 : 6;
        sessions.push({ id: `c:${1000 + i}`, aliases: [], sources: ["coros"], date, start: `${date}T11:00:00.000Z`, name: "Run", distance: miles * MILE, movingSec: miles * (long ? 540 : 525), avgHr: 145 + wobble(i), maxHr: 172, climb: 20, rpe: long ? 4 : 2, rpeAnswered: true });
    }
    if (days >= 60) sessions.push({ id: "c:race", aliases: [], sources: ["coros"], date: "2026-08-22", start: "2026-08-22T12:00:00.000Z", name: "Lakefront Half", distance: 21150, movingSec: 5650, elapsedSec: 5660, avgHr: 170, maxHr: 186, rpe: 9, rpeAnswered: true, race: { status: "race", meters: 21097.5, timeSec: 5660, allOut: true } });
    const health = Object.fromEntries(Array.from({ length: 110 }, (_, i) => [addDays(TODAY, -i), { hrv: { avg: 62 + wobble(i) }, rhr: 50, sleep: { asleepMin: 450 } }]));
    const checkins = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [addDays(TODAY, -i), { soreness: 2, energy: 4, mood: 4, sick: false, pain: i === 1 ? pain : null, note: i === 1 ? "calf secret note" : "" }]));
    return { sessions, health, checkins };
}

const planDays = () => Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, i + 1), week: 12, index: i, dayName: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], session: ["Recovery jog", "6x1mi @ Threshold", "Easy aerobic", "5mi @ Marathon Pace", "Recovery", "Long run 18", "Recovery jog"][i], miles: [5, 8, 6, 10, 4, 18, 4][i], pace: "", kind: ["easy", "quality", "easy", "quality", "easy", "long", "easy"][i], phase: "mp", race: false }));

function selfInputs(extra = {}) {
    const y = year(extra);
    return {
        who: "self", today: TODAY, ...y, fitness: { [addDays(TODAY, -1)]: { vo2: 56, marathon: "3:04:00", threshold: "6:45" } }, settings: {}, laps: {}, keyWork: [],
        nextDays: planDays(), upcoming: planDays(),
        plan: { source: "marathon plan", name: "Indianapolis Monumental Marathon", week: 12, totalWeeks: 16, phase: "Marathon-Specific Development", purpose: "Fitness checkpoint", race: { name: "Indianapolis Monumental Marathon", date: "2026-11-08", meters: 42195, goalSec: 3 * 3600 + 5 * 60 } },
        decisions: [{ weekOf: "2026-09-21", level: "absorb", choice: "declined", reason: "I feel fine" }],
        busyDays: [{ date: addDays(TODAY, 2), category: "class", title: "Organic chemistry exam" }],
        strengthDates: [addDays(TODAY, -3), addDays(TODAY, -10), addDays(TODAY, -40)]
    };
}

test("every signal is a full envelope: kind, confidence, source, evidence; a missing value says what would fill it", () => {
    const state = athleteState(selfInputs());
    const all = signalList(state);
    assert.ok(all.length >= 30, String(all.length));
    for (const { path, signal: s } of all) {
        assert.ok(KINDS.includes(s.kind), `${path} kind ${s.kind}`);
        assert.ok(CONFIDENCES.includes(s.confidence), `${path} confidence ${s.confidence}`);
        assert.equal(typeof s.source, "string", path);
        assert.ok(Array.isArray(s.evidence) && s.evidence.length <= 3, path);
        assert.equal(s.asOf, TODAY, path);
        if (s.value == null) {
            assert.equal(s.confidence, "none", `${path}: no value, no confidence`);
            assert.ok(s.missing && typeof s.missing === "string", `${path} says what's missing`);
        } else assert.equal(s.missing, null, path);
    }
    assert.deepEqual(Object.keys(state).filter(k => DOMAINS.includes(k)), DOMAINS);
});

test("the state's numbers are the engines' own (nothing recomputed)", () => {
    const inputs = selfInputs();
    const core = athleteCore(inputs);
    const state = athleteState(inputs, { core });
    assert.equal(state.fitness.raceTime.value.sec, Math.round(core.race.sec));
    assert.equal(state.fitness.raceTime.value.distance, "Marathon", "Eddie's target is the plan's race");
    assert.equal(state.fitness.raceTime.confidence, core.race.confidence.toLowerCase());
    assert.equal(state.load.percentile.value.percentile, core.load.today.percentile);
    assert.equal(state.load.level.value.recent, core.load.today.recent);
    assert.equal(state.decision.weekly.value.level, core.decision.level);
    assert.equal(state.decision.weekly.value.domains.length, core.decision.domains.length);
    assert.equal(state.decision.weekly.value.votes, core.decision.count, "votes is the total, a number");
    assert.equal(typeof state.decision.weekly.value.groups.recovery, "number");
    assert.equal(state.readiness.score.value.score, core.readinessV2.score);
    assert.equal(state.readiness.classic.value.score, core.readinessClassic.score);
    assert.equal(state.response.efficiency.value?.bpm ?? null, core.eff.signal.bpm ?? null);
    assert.equal(state.goals.goalTime.value.text, "3:05:00");
    assert.equal(state.goals.daysToRace.value, 35);
    assert.equal(state.goals.phase.value.week, 12);
    assert.equal(state.load.strength.value.sessions28, 2);
    assert.equal(state.preparation.block.value.kind, "marathon");
    assert.equal(state.decision.recentChoices.value[0].reason, "I feel fine");
    assert.equal(state.readiness.shown, "classic");
    assert.equal(athleteState({ ...inputs, settings: { version: "v2" } }, { core }).readiness.shown, "new");
});

test("Eddie: the planner gives busy days by category only; a pain flag keeps the day, never the words", () => {
    const state = athleteState(selfInputs({ pain: "left calf secret" }));
    const text = JSON.stringify(state);
    assert.ok(!/Organic chemistry/.test(text), "event titles stay out");
    assert.ok(!/secret/.test(text), "check-in words stay out");
    assert.deepEqual(state.schedule.busyDays.value, [{ date: addDays(TODAY, 2), category: "class" }]);
    assert.equal(state.decision.weekly.value.level, "checkin");
    assert.match(state.decision.weekly.value.reason, /^pain reported \(2026-10-03\)$/);
    assert.match(state.decision.weekly.value.summary, /pain reported \(2026-10-03\)/);
    assert.deepEqual(state.constraints.painOrSick.value, [{ date: "2026-10-03", kind: "pain", from: "morning check-in" }]);
    assert.ok(state.unknowns.some(u => u.key === "goals.profile"), "Eddie has no profile yet, and the state says so");
});

test("a client: only training-relevant profile answers; no contacts, health check, birth year or words", () => {
    const y = year();
    const shared = decodeShare(encodeShare({ sessions: y.sessions, health: y.health, checkins: y.checkins }, TODAY));
    const record = {
        whoTrains: "self", preferredName: "Sam Rivera", birthYear: 1991, phone: "555-0100", primarySport: "running",
        emergencyName: "Pat Rivera", emergencyPhone: "555-0199", emergencyRelation: "spouse", guardianName: "Guardian Person", guardianPhone: "555-0142",
        healthFlags: ["heart"], healthNote: "murmur secret", eventType: "half", targetEvent: "Fall Half", targetDate: "2026-11-15",
        primaryGoal: "Run a half under 1:45", availabilityDays: ["MON", "WED", "SAT"], injuries: "Sore knee on hills", injuryAreas: ["knee"], injuryStatus: "managing",
        workedBefore: "Long runs with friends", confirmedAt: { primaryGoal: Date.parse("2026-09-30"), availabilityDays: Date.parse("2026-05-01") }
    };
    const inputs = clientInputs({
        shared, results: [{ id: "r1", date: "2026-10-02", status: "completed", distance: 5, durationSec: 2600, rpe: 4, pain: true, painNote: "knee secret", note: "log secret" }],
        record, today: TODAY,
        extra: {
            now: Date.parse(`${TODAY}T12:00:00`), firstName: "Sam",
            weeklyCheckins: [{ weekOf: "2026-09-28", rating: 4, energy: 3, recovery: 2, motivation: 4, pain: true, painNote: "weekly secret", notes: "notes secret", wentWell: "went secret" }],
            changeRequests: [{ status: "open", reason: "travel", date: "2026-10-08", message: "request secret" }],
            booked: ["2026-10-07", "2026-12-01"]
        }
    });
    const state = athleteState(inputs);
    const text = JSON.stringify(state);
    for (const leak of ["555-01", "Pat Rivera", "Guardian", "murmur", "secret", "1991", "Rivera", "healthFlags", "healthNote", "spouse"]) assert.ok(!text.includes(leak), `"${leak}" must not be in the state`);
    assert.equal(state.identity.firstName, "Sam");
    assert.equal(state.identity.ageBand, "30s");
    assert.equal(state.identity.tier, "shared");
    assert.equal(state.goals.targetRace.value.distance, "Half marathon");
    assert.equal(state.goals.targetRace.kind, "athlete");
    assert.equal(state.goals.primary.confidence, "high", "confirmed a few days ago");
    assert.equal(state.schedule.availableDays.confidence, "low", "confirmed 5 months ago: may be out of date");
    assert.deepEqual(state.schedule.availableDays.value, ["Mon", "Wed", "Sat"]);
    assert.equal(state.constraints.limits.value.text, "Sore knee on hills");
    assert.deepEqual(state.constraints.openRequests.value, [{ reason: "travel", date: "2026-10-08" }]);
    assert.deepEqual(state.schedule.booked.value, ["2026-10-07"]);
    assert.equal(state.readiness.weekly.value.pain, true);
    assert.ok(state.constraints.painOrSick.value.some(f => f.from === "workout log"));
    assert.equal(state.fitness.raceTime.value.distance, "Half marathon");
    assert.equal(state.readiness.classic, undefined, "Classic is only worked out on the athlete's own phone");
});

test("the client's state runs on the same engines as the Model tab", () => {
    const y = year();
    const shared = decodeShare(encodeShare({ sessions: y.sessions, health: y.health, checkins: y.checkins }, TODAY));
    const args = { shared, results: [], record: { eventType: "half" }, today: TODAY };
    const m = clientModel(args);
    const state = athleteState(m.inputs, { core: m.core });
    assert.equal(state.fitness.raceTime.value.sec, Math.round(m.race.sec));
    assert.equal(state.load.percentile.value.percentile, m.load.today.percentile);
    assert.equal(state.decision.weekly.value.level, m.decision.level);
    assert.equal(state.readiness.score.value.score, m.readiness.score);
    assert.equal(targetOf(m.inputs), m.target);
});

test("thin data: 'none' and what's missing, never an invented number", () => {
    const none = athleteState({ who: "client", today: TODAY, sessions: [], profile: null });
    assert.equal(none.fitness.raceTime.value, null);
    assert.equal(none.fitness.raceTime.confidence, "none");
    assert.equal(none.load.level.value, null);
    assert.equal(none.load.percentile.value, null);
    assert.equal(none.readiness.score.value, null);
    assert.equal(none.response.reading.value, null);
    assert.match(none.response.reading.missing, /Needs/);
    assert.ok(none.unknowns.some(u => u.key === "fitness.raceTime"));
    assert.ok(none.unknowns.some(u => u.key === "goals.targetRace"));
    // Two weeks of runs: load exists, but no percentile and no efficiency verdict yet.
    const two = athleteState({ who: "self", today: TODAY, ...year({ days: 14 }), health: {}, checkins: {} });
    assert.ok(two.load.level.value.recent > 0);
    assert.equal(two.load.percentile.value, null);
    assert.match(two.load.percentile.missing, /4 weeks/);
    assert.equal(two.readiness.score.value, null);
    assert.equal(two.decision.weekly.confidence === "moderate", false, "few signals measured: the decision isn't moderate");
});
