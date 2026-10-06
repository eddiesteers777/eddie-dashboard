// Unit tests for drawing a reconstructed workout (structured workouts step 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconstructWorkout } from "../js/workoutExecution.js";
import { executionHtml, executionClass, signedText, stripHtml, chipsHtml, CONFIDENCE_WORDS } from "../js/executionView.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";

const W = planDayFromMarathon({ session: "2mi WU; 6x600m @ 2:27; 2min jog; 1mi @ 7:08; 1.5mi CD", miles: 8, pace: "Threshold" }, PACES).workout;
let n = 0;
const lap = (m, s, hr = 150) => ({ i: ++n, m, s, hr });
function laps(reps, { cut = null } = {}) {
    n = 0;
    const out = [lap(3219, 1020, 135)];
    reps.forEach((s, r) => { out.push(r + 1 === cut ? lap(410, 101, 165) : lap(600, s, 168)); out.push(lap(330, 120, 141)); });
    out.push(lap(1609, 433, 166), lap(2414, 765, 140));
    return out;
}
const rowsOf = html => [...html.matchAll(/<tr class="ex-row ex-(\w+)"/g)].map(m => m[1]);

test("the signed difference: negative = faster, whole seconds", () => {
    assert.equal(signedText(-4.2), "−0:04");
    assert.equal(signedText(1), "+0:01");
    assert.equal(signedText(0.3), "0:00");
    assert.equal(signedText(-65), "−1:05");
    assert.equal(signedText(null), "–");
});

test("a full card: chips, read, strip, a row per rep with its recovery, the warm-up and cool-down line", () => {
    const x = reconstructWorkout(W, { laps: laps([143, 146, 144, 148, 0, 146], { cut: 5 }), kind: "laps" });
    const html = executionHtml(x);
    assert.match(html, /95% done/);
    assert.match(html, /3 of 6 on target/);
    assert.match(html, new RegExp(CONFIDENCE_WORDS.approximate));
    assert.deepEqual(rowsOf(html), ["fast", "within", "fast", "within", "partial", "within", "slow"], "6 reps, then the threshold mile");
    assert.match(html, /<td data-label="Target">2:27<\/td>/);
    assert.match(html, /<td data-label="Actual">2:23\.0 <small>168 bpm<\/small><\/td>/);
    assert.match(html, /<td data-label="Δ">−0:04<\/td>/);
    assert.match(html, /Cut short <small>stopped at 410 of 600 m<\/small>/);
    assert.match(html, /<td data-label="Target">7:08<\/td>/, "a mile rep's target is its time");
    assert.match(html, /<td data-label="Result" class="ex-result">0:05 slow<\/td>/);
    assert.equal((html.match(/class="ex-rec"/g) || []).length, 6, "a recovery line under each rep (the watch's last one too)");
    assert.match(html, /then 2:00 jog · 0\.21 mi · 141 bpm/);
    assert.match(html, /Warm-up 2 mi in 17:00 \(8:30\/mi, 135 bpm\) · Cool-down 1\.5 mi in 12:45/);
    assert.match(html, /avg 2:25\.4 · spread 5 s · 168 bpm/);
    assert.equal(executionClass(x), "ok");
});

test("the strip: one segment per step (the unrun last recovery left out), sized by plan, a legend for what's there", () => {
    const x = reconstructWorkout(W, { laps: laps([147, 147, 147, 147, 147, 147]).filter((l, i) => i !== 12), kind: "laps" });
    const strip = stripHtml(x);
    const segs = [...strip.matchAll(/class="ex-seg ex-(\w+)"/g)].map(m => m[1]);
    assert.equal(segs.length, 14, "warm-up + 6 reps + 5 recoveries + threshold + cool-down");
    assert.equal(segs[0], "easy");
    assert.ok(segs.slice(1, 12).every((s, i) => s === (i % 2 ? "rec" : "within")));
    assert.equal(segs[12], "slow", "the threshold mile, 5 s slow");
    assert.match(strip, /title="Warm-up: Done"/, "warm-ups are never judged");
    assert.match(strip, /aria-label="6\/6 reps completed · 1 mi done; 6 of 7 on target"/);
    assert.match(strip, /within target/);
    assert.ok(!/cut short|missed/.test(strip.split("ex-legend")[1]), "legend only for what's on the strip");
    assert.equal(executionClass(x), "good", "6 of 7 = 86%");
});

test("mile laps only, and no laps: says so without a table", () => {
    n = 0;
    const auto = reconstructWorkout(W, { laps: Array.from({ length: 8 }, () => lap(1609.3, 470)), kind: "auto" });
    const html = executionHtml(auto);
    assert.match(html, /Reps not in the laps/);
    assert.match(html, /only mile laps/);
    assert.ok(!html.includes("ex-table"));
    assert.match(chipsHtml(reconstructWorkout(W, { laps: [] })), /Not matched/);
});
