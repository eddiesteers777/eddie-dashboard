// Which picture a run gets (js/runCard.js) and the splits card (js/executionShare.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runCardModel, hasTargets } from "../js/runCard.js";
import { splitRows, splitsCardModel, captionText, cardHeight, MIN_H } from "../js/executionShare.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";

const MI = 1609.344;
let n = 0;
const lap = (m, s, hr = 150) => ({ i: ++n, m, s, hr });
const miles = paces => { n = 0; return paces.map((p, i) => lap(MI, p, 140 + i)); };

test("auto mile laps read as Mile 1… with pace, the last partial lap by its distance", () => {
    n = 0;
    const { unit, rows } = splitRows({ laps: [lap(MI, 500), lap(MI, 490), lap(0.32 * MI, 155), lap(40, 30)] });
    assert.equal(unit, "mile");
    assert.deepEqual(rows.map(r => r.label), ["Mile 1", "Mile 2", "0.32 mi"], "a 40 m scrap is left out");
    assert.equal(rows[2].partial, true);
});

test("the splits card: every mile with pace, fastest and slowest, halves, no target invented", () => {
    const m = splitsCardModel({ laps: miles([520, 515, 510, 505, 500, 498, 495, 470]) }, { date: "2026-10-03", name: "16 mi long run", category: "long_run", runMeters: 8 * MI, runSec: 4013, avgHr: 145 });
    assert.equal(m.kind, "splits");
    assert.equal(m.title, "Long Run");
    assert.equal(m.sets[0].head, "Mile splits");
    assert.match(m.sets[0].sub, /^avg 8:2\d\/mi$/);
    assert.equal(m.sets[0].rows.length, 8);
    assert.equal(m.sets[0].rows[7].result, "Fastest");
    assert.equal(m.sets[0].rows[0].result, "Slowest");
    assert.equal(m.sets[0].rows[0].actual, "8:40/mi");
    assert.match(m.sets[0].summary, /^Negative split · 2nd half 0:\d\d\/mi faster · HR 140–147$/);
    assert.deepEqual(m.stats.map(s => s.label), ["Distance", "Time", "Avg pace", "Avg HR"]);
    assert.ok(!m.stats.some(s => /target/i.test(s.label)));
    assert.ok(cardHeight(m) >= MIN_H);
    assert.match(captionText(m), /Mile splits \(avg 8:2\d\/mi\): 8:40\/mi, 8:35\/mi/);
});

test("a long run's 16+ miles go to two columns instead of a giant image", () => {
    const m = splitsCardModel({ laps: miles(Array.from({ length: 18 }, () => 500)) }, { date: "2026-10-03" });
    assert.ok(cardHeight(m) < 2300);
    assert.equal(m.sets[0].summary.startsWith("Even halves"), true);
});

test("laps pressed by hand (not miles) read as Lap n with time and pace", () => {
    n = 0;
    const m = splitsCardModel({ laps: [lap(800, 170), lap(400, 120), lap(800, 168)] }, { date: "2026-10-03" });
    assert.equal(m.sets[0].head, "Laps");
    assert.deepEqual(m.sets[0].rows.map(r => [r.label, r.actual]), [["Lap 1", "2:50.0"], ["Lap 2", "2:00.0"], ["Lap 3", "2:48.0"]]);
    assert.match(m.sets[0].rows[0].delta, /\/mi$/);
});

test("no laps: no splits card", () => {
    assert.equal(splitsCardModel({ laps: [] }, {}), null);
    assert.equal(splitsCardModel(null, {}), null);
});

const RUN = { labelId: "r1", date: "2026-10-06", distance: 8.02 * MI, duration: 3585, avgHr: 158 };
const SPEED = planDayFromMarathon({ session: "2mi WU; 5x1mi @ 6:45-6:55; 90s jog; 1mi CD", miles: 8, pace: "Threshold" }, PACES).workout;

test("the one rule: targets + laps = rep by rep; laps alone = splits; nothing = plain", () => {
    n = 0;
    const laps = [lap(2 * MI, 1008)];
    [410, 411, 409, 409, 397].forEach(s => { laps.push(lap(MI, s, 160)); laps.push(lap(300, 90, 140)); });
    laps.push(lap(MI, 505));
    assert.ok(hasTargets(SPEED));
    const reps = runCardModel({ run: RUN, workout: SPEED, entry: { laps, kind: "laps" }, meta: { date: RUN.date } });
    assert.equal(reps.kind, "execution");
    assert.equal(reps.model.title, "5 × 1 mi");
    const easy = planDayFromMarathon({ session: "Easy run", miles: 8, pace: "Easy" }, PACES).workout;
    assert.equal(hasTargets(easy), false, "an easy run has nothing to judge laps against");
    const splits = runCardModel({ run: RUN, workout: easy, entry: { laps: miles([500, 498, 497]) }, meta: { date: RUN.date } });
    assert.equal(splits.kind, "splits");
    assert.equal(runCardModel({ run: RUN, workout: SPEED, entry: null, meta: { date: RUN.date } }).kind, "plain", "speed work without laps: the plain card, not an empty rep table");
    assert.equal(runCardModel({ run: { ...RUN, source: "strava" }, workout: null, entry: { laps: miles([500]) } }).kind, "plain", "Strava runs have no laps of their own");
});

test("a structured day whose laps match nothing falls back to the splits", () => {
    n = 0;
    const r = runCardModel({ run: RUN, workout: { sets: [{ repeat: 4, amount: 400, unit: "m", pace: "5:40-5:50" }] }, entry: { laps: [lap(20, 10)] }, meta: {} });
    assert.ok(["splits", "plain"].includes(r.kind));
});
