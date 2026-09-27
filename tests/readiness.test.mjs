// Unit tests for daily readiness (js/readiness.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadiness, adviceFor, sleepCoach, insights, checkinsUntilInsights, hrvPart, rhrPart, sleepPart, colorOf, kindOfDay, TAGS, hm } from "../js/readiness.js";

// Eddie's real week (COROS, wake-up days).
const HEALTH = {
    "2026-09-20": { hrv: { avg: 68, status: "Low", low: 75, high: 87, baseline: 81 }, rhr: 53, sleep: { score: 82, asleepMin: 526, wake: "07:05" } },
    "2026-09-21": { hrv: { avg: 87, status: "Above normal", low: 74, high: 86, baseline: 80 }, rhr: 51, sleep: { score: 72, asleepMin: 398, wake: "04:58" } },
    "2026-09-22": { hrv: { avg: 77, status: "Normal", low: 74, high: 88, baseline: 81 }, rhr: 50, sleep: { score: 80, asleepMin: 423, wake: "04:47" } },
    "2026-09-23": { hrv: { avg: 91, status: "Above normal", low: 74, high: 88, baseline: 81 }, rhr: 47, sleep: { score: 78, asleepMin: 399, wake: "04:40" } },
    "2026-09-24": { hrv: { avg: 81, status: "Normal", low: 74, high: 88, baseline: 81 }, rhr: 47, sleep: { score: 79, asleepMin: 402, wake: "04:25" } },
    "2026-09-25": { hrv: { avg: 88, status: "Normal", low: 74, high: 88, baseline: 81 }, rhr: 47, sleep: { score: 85, asleepMin: 413, wake: "04:40" } },
    "2026-09-26": { hrv: { avg: 81, status: "Normal", low: 74, high: 88, baseline: 81 }, rhr: 49, sleep: { score: 88, asleepMin: 417, wake: "04:48" } }
};
const FITNESS = { "2026-09-26": { recovery: { percent: 76, status: "Moderate training recommended" } } };

test("the parts, in plain words", () => {
    assert.deepEqual(hrvPart(HEALTH["2026-09-26"].hrv), { key: "hrv", label: "HRV", value: "81 ms", note: "right at your baseline (81)", score: 75 });
    assert.equal(hrvPart(HEALTH["2026-09-23"].hrv).note, "above your normal range (74–88)");
    assert.equal(hrvPart(HEALTH["2026-09-23"].hrv).score, 100);
    assert.equal(hrvPart(HEALTH["2026-09-20"].hrv).note, "below your normal range (75–87)");
    assert.ok(hrvPart(HEALTH["2026-09-20"].hrv).score < 20);
    assert.deepEqual(rhrPart(49, [47, 47, 47, 50, 51, 53]), { key: "rhr", label: "Resting HR", value: "49 bpm", note: "normal (your average 49)", score: 86 });
    assert.equal(rhrPart(53, [48, 48, 48]).note, "5 above your 30-day average (48)");
    assert.equal(rhrPart(53, [48]).score, null, "needs 3 days of history");
    assert.deepEqual(sleepPart(HEALTH["2026-09-26"].sleep, 450), { key: "sleep", label: "Sleep", value: "6h 57m", note: "33m short of 7h 30m · sleep score 88", score: 86 });
    assert.equal(sleepPart({ asleepMin: 500, score: 90 }, 450).note, "enough sleep · sleep score 90");
    assert.equal(hm(450), "7h 30m");
});

test("Sep 26 before the 19-miler: about 80, green; Sep 20 (low HRV): yellow", () => {
    const r = computeReadiness("2026-09-26", { health: HEALTH, fitness: FITNESS });
    assert.equal(r.score, 80);
    assert.equal(r.color, "green");
    assert.deepEqual(r.parts.map(p => p.key), ["hrv", "rhr", "sleep", "recovery"]);
    assert.equal(r.needsCheckin, true);
    const low = computeReadiness("2026-09-20", { health: HEALTH });
    assert.equal(low.color, "yellow");
    assert.ok(low.flags.some(f => f.key === "hrv-low"));
    assert.equal(computeReadiness("2026-09-27", { health: HEALTH }).score, null, "no HRV or sleep yet: no score");
});

test("the check-in counts, and sick / pain cap the score", () => {
    const good = computeReadiness("2026-09-26", { health: HEALTH, fitness: FITNESS, checkins: { "2026-09-26": { soreness: 1, energy: 5, mood: 5 } } });
    assert.ok(good.score > 80);
    assert.equal(good.bodyScore, 80, "the body part ignores how you felt");
    const sore = computeReadiness("2026-09-26", { health: HEALTH, fitness: FITNESS, checkins: { "2026-09-26": { soreness: 5, energy: 1, mood: 2 } } });
    assert.ok(sore.score < 80);
    const sick = computeReadiness("2026-09-26", { health: HEALTH, checkins: { "2026-09-26": { sick: true } } });
    assert.equal(sick.score, 30);
    assert.equal(sick.color, "red");
    const pain = computeReadiness("2026-09-26", { health: HEALTH, checkins: { "2026-09-26": { pain: "left Achilles" } } });
    assert.equal(pain.score, 55);
    assert.equal(colorOf(67), "green");
    assert.equal(colorOf(66), "yellow");
    assert.equal(colorOf(33), "red");
});

test("advice knows today's workout", () => {
    const g = { score: 80, color: "green", flags: [] }, y = { score: 55, color: "yellow", flags: [] }, r = { score: 25, color: "red", flags: [] };
    assert.equal(adviceFor(g, { kind: "quality", title: "Mile repeats" }).text, "Go as planned: you're ready for Mile repeats.");
    assert.match(adviceFor(y, { kind: "quality", title: "Mile repeats" }).text, /slow end of the pace range/);
    assert.match(adviceFor(y, { kind: "long", title: "your long run" }).text, /skip any fast finish/);
    assert.deepEqual(adviceFor(r, { kind: "quality", title: "Mile repeats" }), { text: "Low readiness: run easy today and move Mile repeats to your next easy day.", swap: true });
    assert.equal(adviceFor(y, { kind: "quality", title: "Tempo" }, ["yellow", "red"]).swap, true, "third day in the yellow before a hard day");
    assert.match(adviceFor(r, { kind: "easy" }).text, /short and very easy/);
    assert.match(adviceFor(g, { kind: "rest" }).text, /recovering well/);
    assert.match(adviceFor({ ...g, flags: [{ key: "pain", text: "Pain: left Achilles" }] }, { kind: "quality", title: "Tempo" }).text, /You logged pain: left achilles\. Swap Tempo/);
    assert.match(adviceFor({ score: 30, color: "red", flags: [{ key: "sick" }] }, { kind: "easy" }).text, /^Feeling sick: rest today/);
    assert.match(adviceFor({ score: null }, { kind: "easy" }).text, /Sync your COROS watch/);
});

test("sleep coach: bedtime from your usual wake-up; this week's sleep debt", () => {
    const c = sleepCoach(HEALTH, "2026-09-26", 450);
    assert.equal(c.wake, "4:47 am");
    assert.equal(c.bedtime, "9:07 pm");
    assert.equal(c.text, "To get 7h 30m before your usual 4:47 am wake-up, be in bed by 9:07 pm.");
    assert.equal(c.debtMin, (450 - 417) + (450 - 413) + (450 - 402) + (450 - 399) + (450 - 423) + (450 - 398));
    assert.equal(sleepCoach({}, "2026-09-26"), null);
});

test("what's helping and what's hurting (needs 4 mornings with and without)", () => {
    const checkins = {}, byDay = {};
    for (let i = 0; i < 12; i++) {
        const d = `2026-09-${String(10 + i).padStart(2, "0")}`;
        const drank = i % 3 === 0, stretched = i % 2 === 0;
        checkins[d] = { tags: [drank && "alcohol", stretched && "stretch"].filter(Boolean) };
        byDay[d] = { bodyScore: 70 - (drank ? 15 : 0) + (stretched ? 1 : 0) };
    }
    const out = insights(checkins, byDay, "2026-09-26");
    assert.deepEqual(out.map(o => [o.tag, o.effect, o.times]), [["alcohol", "hurts", 4], ["stretch", "none", 6]]);
    assert.ok(out[0].diff <= -14);
    assert.equal(checkinsUntilInsights({}), 8);
    assert.equal(checkinsUntilInsights(checkins), 0);
    assert.ok(TAGS.length >= 10);
});

test("kind of day in the marathon plan", () => {
    assert.equal(kindOfDay({ miles: 0 }), "rest");
    assert.equal(kindOfDay({ miles: 6, pace: "Easy" }, { workout: null }), "easy");
    assert.equal(kindOfDay({ miles: 26.2, pace: "Race", race: true }), "race");
    assert.equal(kindOfDay({ miles: 8, pace: "Threshold" }, { workout: { sets: [{ effort: "threshold", pace: "6:35-6:50" }] } }), "quality");
    assert.equal(kindOfDay({ miles: 19, pace: "MP" }, { workout: { sets: [{ effort: "easy" }, { pace: "6:58-7:05" }] } }), "long");
    assert.equal(kindOfDay({ miles: 16, pace: "Long run" }, { workout: null }), "long");
});

test("no score today: the card says exactly why", async () => {
    const { missingReason } = await import("../js/readiness.js");
    const today = "2026-09-28";
    const history = { "2026-09-26": { score: 78, color: "green" }, "2026-09-27": { score: 64, color: "yellow" } };
    const health = { "2026-09-27": { hrv: { avg: 80 }, sleep: { asleepMin: 420 } } };
    let m = missingReason({ connected: true, health, history, today });
    assert.match(m.text, /doesn't have last night's sleep yet \(the newest is Sun, Sep 27\)\. Open the COROS app/);
    assert.deepEqual(m.latest, { date: "2026-09-27", score: 64, color: "yellow" });
    assert.equal(m.canRefresh, true);
    assert.match(missingReason({ connected: true, refreshing: true, health, history, today }).text, /Getting last night's/);
    m = missingReason({ connected: false, health, history, today });
    assert.match(m.text, /isn't connected on this device/);
    assert.equal(m.canRefresh, false);
    assert.match(missingReason({ connected: false, today }).text, /^Connect COROS in Settings/);
    assert.match(missingReason({ connected: true, error: "a connection problem", health, history, today }).text, /didn't answer just now \(a connection problem\)/);
    m = missingReason({ connected: true, today });
    assert.match(m.text, /hasn't sent any sleep or HRV yet/);
    assert.equal(m.latest, null);
});
