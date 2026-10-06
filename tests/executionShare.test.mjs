// Unit tests for the shareable workout image (what it says and how tall it draws).
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareCardModel, cardHeight, MIN_H } from "../js/executionShare.js";
import { reconstructWorkout } from "../js/workoutExecution.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";

const W = planDayFromMarathon({ session: "2mi WU; 6x600m @ 2:27; 2min jog; 1mi @ 7:08; 1.5mi CD", miles: 8, pace: "Threshold" }, PACES).workout;
let n = 0;
const lap = (m, s, hr = 150) => ({ i: ++n, m, s, hr });
function laps(reps, thr = 409) {
    n = 0;
    const out = [lap(3219, 1020, 135)];
    reps.forEach(s => { out.push(lap(600, s, 168)); out.push(lap(330, 120, 141)); });
    return [...out, lap(1609, thr, 166), lap(2414, 765, 140)];
}

test("the card for Eddie's Oct 6 session: title, the run, done and on target, every rep with its difference", () => {
    const x = reconstructWorkout(W, { laps: laps([142, 146, 142, 146, 144, 141]), kind: "laps" }, { plannedWorkoutId: "marathon|2026-10-06" });
    const m = shareCardModel(x, { date: "2026-10-06", name: "2mi WU", runMeters: 8.01 * 1609.344, runSec: 4015 });
    assert.equal(m.title, "6 × 600 m + 1 mi");
    assert.equal(m.name, "", "a name that's just the first step isn't shown");
    assert.equal(m.date, "Tue, Oct 6, 2026");
    assert.deepEqual(m.stats, [{ label: "Distance", value: "8.01 mi" }, { label: "Time", value: "1:06:55" }, { label: "Complete", value: "7/7" }, { label: "Within target", value: "2/7" });
    assert.equal(m.sets[0].head, "6 × 600 m @ 2:27");
    assert.equal(m.sets[0].sub, "2 min jog");
    assert.deepEqual(m.sets[0].rows.map(r => [r.label, r.actual, r.delta, r.result]), [
        ["Rep 1", "2:22.0", "−0:05", "Fast"], ["Rep 2", "2:26.0", "−0:01", "On target"], ["Rep 3", "2:22.0", "−0:05", "Fast"],
        ["Rep 4", "2:26.0", "−0:01", "On target"], ["Rep 5", "2:24.0", "−0:03", "Fast"], ["Rep 6", "2:21.0", "−0:06", "Fast"]
    ]);
    assert.match(m.sets[0].summary, /^avg 2:23\.5 · spread 5 s · 168 bpm$/);
    assert.deepEqual(m.sets[1].rows.map(r => [r.label, r.actual, r.delta, r.result]), [["1 mi", "6:49", "−0:19", "Fast"]]);
    assert.equal(m.easy.length, 2);
    assert.equal(m.easy[0], "Warm-up 2.00 mi @ 8:30/mi");
    assert.match(m.footer, /every lap matched/);
    assert.equal(cardHeight(m), MIN_H, "fits a 4:5 image");
});

test("a long set goes to two columns; a cut-short rep says so; a long card grows instead of cramming", () => {
    const w = { warmup: { amount: 2, unit: "mi" }, sets: [{ repeat: 16, amount: 400, unit: "m", pace: "5:40-5:50", recovery: { amount: 200, unit: "m", note: "jog" } }], cooldown: { amount: 2, unit: "mi" } };
    n = 0;
    const ls = [lap(3219, 1000)];
    for (let r = 0; r < 16; r++) { ls.push(r === 9 ? lap(250, 54) : lap(400, 86)); ls.push(lap(200, 70)); }
    ls.push(lap(3219, 1010));
    const x = reconstructWorkout(w, { laps: ls, kind: "laps" }, { plannedWorkoutId: "p|d" });
    const m = shareCardModel(x, { date: "2026-10-10", name: "Ladder day" });
    assert.equal(m.name, "Ladder day");
    assert.equal(m.sets[0].rows.length, 16);
    assert.equal(m.sets[0].rows[9].result, "Cut short");
    assert.equal(m.stats.find(s => s.label === "Complete").value, "15/16", "cut short is not counted as fully complete");
    assert.ok(cardHeight(m) >= MIN_H);
    const twelve = shareCardModel(x, {}); twelve.sets.push(...Array.from({ length: 3 }, () => twelve.sets[0]));
    assert.ok(cardHeight(twelve) > MIN_H, "four long sets: a taller image");
});
