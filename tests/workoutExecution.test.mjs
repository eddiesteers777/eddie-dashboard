// Unit tests for workout execution: planned steps vs COROS laps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedSteps, inferLapKind, reconstructWorkout, clockText, deltaText, EXECUTION_VERSION } from "../js/workoutExecution.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";
import { parseLapGroups } from "../js/trends.js";

const MILE = 1609.344;
// Eddie's example, typed into his plan the way he writes it.
const EXAMPLE = planDayFromMarathon({ session: "2mi WU; 6x600m @ 2:27; 2min jog; 1mi @ 7:08; 1.5mi CD", miles: 8, pace: "Threshold" }, PACES).workout;

// The laps the watch makes running it: warm-up, 6 × (rep, 2:00 jog) (the watch's interval
// group has a jog after rep 6 too), the threshold mile, the cool-down.
let n = 0;
const lap = (m, s, hr = 150) => ({ i: ++n, m, s, hr });
function exampleLaps({ reps = [147, 147, 147, 147, 147, 147], repMeters = [600, 600, 600, 600, 600, 600], threshold = 428, skip = [] } = {}) {
    n = 0;
    const out = [lap(3219, 1020, 135)];
    reps.forEach((s, r) => {
        if (skip.includes(r + 1)) return;
        out.push(lap(repMeters[r], s, 168));
        out.push(lap(330, 120, 140));
    });
    out.push(lap(1609, threshold, 165), lap(2414, 765, 140));
    return out;
}

test("the plan reads into steps: rep time kept as written, recovery after the last rep optional", () => {
    const rep = EXAMPLE.sets[0];
    assert.equal(rep.repTime, "2:27", "2:27 is the rep's time, not only a rounded pace");
    const steps = plannedSteps(EXAMPLE);
    assert.deepEqual(steps.map(s => s.id), ["wu", "s1.r1", "s1.r1.rec", "s1.r2", "s1.r2.rec", "s1.r3", "s1.r3.rec", "s1.r4", "s1.r4.rec", "s1.r5", "s1.r5.rec", "s1.r6", "s1.r6.rec", "s2.r1", "cd"]);
    assert.deepEqual(steps.filter(s => s.optional).map(s => s.id), ["s1.r6.rec"]);
    assert.deepEqual(steps.find(s => s.id === "s1.r1").repTime, { lo: 147, hi: 147 });
    assert.equal(steps.find(s => s.id === "s1.r1.rec").durationSec, 120);
    assert.equal(steps.find(s => s.id === "s2.r1").kind, "work");
    assert.equal(steps.find(s => s.id === "s2.r1").label, "1 mi @ 7:08/mi");
    assert.equal(steps[0].kind, "warmup");
});

test("Eddie's example, run as a workout on the watch: rep by rep, exact", () => {
    const laps = exampleLaps({ reps: [143, 146, 144, 148, 145, 146], threshold: 426 });
    const x = reconstructWorkout(EXAMPLE, { laps, kind: "laps" }, { plannedWorkoutId: "marathon|2026-10-13", activityId: "c:123" });
    assert.equal(x.version, EXECUTION_VERSION);
    assert.equal(x.matchConfidence, "exact");
    assert.equal(x.overallStatus, "completed");
    assert.deepEqual([x.plannedWorkoutId, x.activityId], ["marathon|2026-10-13", "c:123"]);
    assert.deepEqual(x.completion, { planned: 7, done: 7, partial: 0, missed: 0, unobserved: 0, pct: 100, text: "6/6 reps completed · 1 mi done" });
    const reps = x.steps.filter(s => s.set === 1 && s.kind === "work");
    assert.deepEqual(reps.map(s => s.deltaSec), [-4, -1, -3, 1, -2, -1], "negative = faster, from the lap's own seconds");
    assert.deepEqual(reps.map(s => s.verdict), ["fast", "within", "fast", "within", "fast", "within"], "within 5 s/mi = 1.9 s on a 600");
    assert.deepEqual(reps.map(s => s.lapIndexes[0]), [2, 4, 6, 8, 10, 12], "laps found by fit, not by number");
    const thr = x.steps.find(s => s.id === "s2.r1");
    assert.equal(thr.deltaSec, -1.9, "426 s for 1609 m = 426.1 s for the mile, 1.9 s under 7:08 (unrounded)");
    assert.equal(thr.verdict, "within");
    const set = x.sets[0];
    assert.equal(set.label, "6 × 600 m");
    assert.equal(set.target, "2:27");
    assert.equal(set.avgSec, 145.3);
    assert.equal(set.spreadSec, 5);
    assert.deepEqual(set.fastest, { rep: 1, sec: 143 });
    assert.deepEqual(set.slowest, { rep: 4, sec: 148 });
    assert.equal(set.avgDelta, -1.7);
    assert.deepEqual([set.within, set.fast, set.slow], [3, 3, 0]);
    assert.deepEqual(x.targetCompliance, { judged: 7, within: 4, fast: 3, slow: 0, pct: 57 });
    assert.equal(x.read[0], "Every rep and work step done.");
    assert.match(x.read[1], /^6 × 600 m \(target 2:27\): averaged 2:25\.3; 3 of 6 within target \(3 fast\); 5 s from fastest to slowest, slowing about 2 s from the first reps to the last\.$/);
    assert.match(x.read[2], /^1 mi \(target 7:08–7:08\)|^1 mi.*7:06.*within target/);
    assert.ok(x.read.some(l => /Faster than the target isn't better/.test(l)), "fast reps aren't praised");
});

test("no subtracting rounded paces: GPS lap distances are normalized to the planned distance", () => {
    const laps = exampleLaps({ reps: [148, 145, 147, 147, 147, 147], repMeters: [620, 590, 600, 600, 600, 600] });
    const x = reconstructWorkout(EXAMPLE, { laps, kind: "laps" });
    const reps = x.steps.filter(s => s.set === 1 && s.kind === "work");
    // 620 m in 148 s -> 143.2 s for 600 m (3.8 s fast); 590 m in 145 s -> 147.5 s (within).
    assert.equal(reps[0].normalizedSec, 143.2);
    assert.equal(reps[0].verdict, "fast");
    assert.equal(reps[1].normalizedSec, 147.5);
    assert.equal(reps[1].verdict, "within");
    assert.ok(reps[0].notes.some(t => /lap read 620 m/.test(t)));
    assert.equal(x.matchConfidence, "approximate", "a lap 3% off its distance isn't exact");
});

test("a missed rep and a rep cut short: 5/6, partial, approximate; completion and execution apart", () => {
    let laps = exampleLaps({ skip: [6] });
    let x = reconstructWorkout(EXAMPLE, { laps, kind: "laps" });
    let reps = x.steps.filter(s => s.set === 1 && s.kind === "work");
    assert.deepEqual(reps.map(s => s.status), ["done", "done", "done", "done", "done", "missed"]);
    assert.equal(x.steps.find(s => s.id === "s2.r1").status, "done", "the threshold mile is still found after the missing rep");
    assert.equal(x.overallStatus, "partial");
    assert.equal(x.completion.text, "5/6 reps completed · 1 mi done");
    assert.equal(x.matchConfidence, "approximate");
    assert.equal(x.targetCompliance.pct, 100, "what was run was on target");
    assert.equal(x.read[0], "5/6 reps completed · 1 mi done (rep 6 missed).");

    laps = exampleLaps({ repMeters: [600, 600, 600, 400, 600, 600], reps: [147, 147, 147, 98, 147, 147] });
    x = reconstructWorkout(EXAMPLE, { laps, kind: "laps" });
    reps = x.steps.filter(s => s.set === 1 && s.kind === "work");
    assert.equal(reps[3].status, "partial");
    assert.equal(reps[3].verdict, null, "a cut-short rep isn't judged on pace");
    assert.match(reps[3].notes[0], /stopped at 400 of 600 m/);
    assert.equal(x.completion.partial, 1);
    assert.equal(x.completion.pct, 95, "6 full steps + two thirds of one, of 7");
    assert.equal(x.sets[0].done, 5);
});

test("an extra lap press in the warm-up is joined, the rest still lines up", () => {
    n = 0;
    const laps = exampleLaps();
    const [wu, ...rest] = laps;
    const split = [{ i: 1, m: 1609, s: 510, hr: 133 }, { i: 1.5, m: 1610, s: 510, hr: 137 }, ...rest];
    const x = reconstructWorkout(EXAMPLE, { laps: split, kind: "laps" });
    assert.deepEqual(x.steps[0].lapIndexes, [1, 1.5]);
    assert.ok(x.steps[0].notes.includes("2 laps joined"));
    assert.equal(x.overallStatus, "completed");
    assert.equal(x.matchConfidence, "approximate");
    assert.equal(wu.m, 3219);
});

test("auto mile laps: reps can't be seen (unobserved, not missed); the warm-up still lines up", () => {
    n = 0;
    const laps = [lap(1609.3, 515), lap(1609.3, 505), ...Array.from({ length: 6 }, () => lap(1609.3, 470))];
    laps.push(lap(400, 140));
    assert.equal(inferLapKind({ laps }), "auto", "old entries without a kind: read from the shape");
    const x = reconstructWorkout(EXAMPLE, { laps });
    assert.equal(x.source.kind, "auto");
    assert.equal(x.matchConfidence, "low");
    assert.ok(x.steps.filter(s => s.set === 1 && s.kind === "work").every(s => s.status === "unobserved"));
    assert.deepEqual(x.steps[0].lapIndexes, [1, 2], "2 mi warm-up = the first two mile laps");
    assert.equal(x.overallStatus, "unknown", "whether the reps were done can't be known from mile laps");
    assert.equal(x.completion.pct, null);
    assert.ok(!x.steps.some(s => s.status === "missed"), "nothing is called missed that the laps can't show");
    assert.match(x.read[0], /only mile laps/);
});

test("no laps / no workout: says so, nothing invented", () => {
    const none = reconstructWorkout(EXAMPLE, { laps: [] });
    assert.equal(none.matchConfidence, "unmatched");
    assert.equal(none.overallStatus, "unknown");
    assert.deepEqual(none.read, ["No laps for this run yet, so it can't be compared rep by rep."]);
    assert.equal(reconstructWorkout(null, { laps: exampleLaps() }).overallStatus, "unknown");
});

test("a range is a range: inside = 0, outside measured from the nearer end; timed reps compare pace", () => {
    const w = { warmup: { amount: 1, unit: "mi" }, sets: [{ repeat: 1, amount: 3, unit: "mi", pace: "6:58-7:05", recovery: null }], cooldown: { amount: 1, unit: "mi" } };
    n = 0;
    const lapsOf = sec => [lap(1609, 510), lap(4828, sec), lap(1609, 520)];
    const inside = reconstructWorkout(w, { laps: lapsOf(3 * 421), kind: "laps" }).steps[1];
    assert.deepEqual([inside.deltaSec, inside.verdict], [0, "within"], "7:01 in 6:58–7:05: no made-up middle");
    const fast = reconstructWorkout(w, { laps: lapsOf(3 * 412), kind: "laps" }).steps[1];
    assert.deepEqual([fast.deltaPace, fast.verdict], [-6, "fast"], "6:52 is 6 s/mi faster than 6:58");
    assert.equal(deltaText(fast.deltaSec), "0:18 fast");

    const timed = { sets: [{ repeat: 4, amount: 3, unit: "min", pace: "6:40", recovery: { amount: 2, unit: "min", note: "jog" } }] };
    n = 0;
    const tl = [];
    for (let r = 0; r < 4; r++) { tl.push(lap(r === 2 ? 760 : 724, 180)); tl.push(lap(300, 120)); }
    const tx = reconstructWorkout(timed, { laps: tl, kind: "laps" });
    const reps = tx.steps.filter(s => s.kind === "work");
    assert.deepEqual(reps.map(s => s.verdict), ["within", "within", "fast", "within"]);
    assert.equal(reps[2].deltaSec, null);
    assert.ok(reps[2].deltaPace < -5);
    assert.equal(tx.completion.text, "4/4 reps completed");
});

test("a mixed repeat (4 × (1 mi @ MP, 1 mi @ threshold)) and an effort-only rep", () => {
    const w = planDayFromMarathon({ session: "2mi WU, 4x(1mi @ MP, 1mi @ threshold), 2mi CD", miles: 12, pace: "Marathon Pace" }, PACES).workout;
    const steps = plannedSteps(w);
    assert.deepEqual(steps.slice(1, 4).map(s => s.id), ["s1.r1.p1", "s1.r1.p2", "s1.r2.p1"]);
    n = 0;
    const laps = [lap(3219, 1020)];
    for (let r = 0; r < 4; r++) { laps.push(lap(1609, 422)); laps.push(lap(1609, 404)); }
    laps.push(lap(3219, 1030));
    const x = reconstructWorkout(w, { laps, kind: "laps" });
    assert.equal(x.matchConfidence, "exact");
    assert.equal(x.completion.done, 8);
    assert.ok(x.targetCompliance.judged === 8);

    const hills = { sets: [{ repeat: 3, amount: 45, unit: "min", effort: "hard", recovery: null }] };
    hills.sets[0].amount = 0.75;
    n = 0;
    const hx = reconstructWorkout(hills, { laps: [lap(220, 45), lap(215, 45), lap(225, 45)], kind: "laps" });
    assert.equal(hx.completion.done, 3);
    assert.equal(hx.targetCompliance, null, "no pace target: done, not judged");
});

test("lap groups keep their kind; clock and delta words", () => {
    const reply = k => ({ content: [{ type: "text", text: JSON.stringify({ lapGroups: [{ type: 10, laps: [{ lapIndex: 1, distance: 160934, time: 480 }] }, ...(k ? [{ type: 2, laps: [{ lapIndex: 1, distance: 60000, time: 147 }, { lapIndex: 2, distance: 33000, time: 120 }] }] : [])] }) }] });
    assert.equal(parseLapGroups(reply(true)).kind, "laps");
    assert.equal(parseLapGroups(reply(true)).laps.length, 2);
    assert.equal(parseLapGroups(reply(false)).kind, "auto");
    assert.equal(parseLapGroups({}).kind, null);
    assert.equal(clockText(145.33, { tenths: true }), "2:25.3");
    assert.equal(clockText(3725), "1:02:05");
    assert.equal(deltaText(-4.2), "0:04 fast");
    assert.equal(deltaText(0.3), "on target");
});
