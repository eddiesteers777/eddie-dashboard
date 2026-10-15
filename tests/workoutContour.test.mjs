// Unit tests for the workout contour (js/workoutContour.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { contourParts, contourSvg } from "../js/workoutContour.js";
import { executionSteps } from "../js/runWorkout.js";

const tempo = {
    warmup: { amount: 1.25, unit: "mi" },
    sets: [{ repeat: 3, amount: 1, unit: "mi", pace: "7:05-7:15", recovery: { amount: 2, unit: "min" } }],
    cooldown: { amount: 1.25, unit: "mi" }
};

test("no workout gives no parts and no picture", () => {
    assert.deepEqual(contourParts(null), []);
    assert.equal(contourSvg([]), "");
});

test("a tempo run becomes warm up, three reps with recoveries between, cool down", () => {
    const parts = contourParts(tempo);
    assert.deepEqual(parts.map(p => p.phase), ["warmup", "work", "recovery", "work", "recovery", "work", "cooldown"]);
    assert.equal(parts.filter(p => p.phase === "work").length, 3);
    assert.ok(Math.abs(parts[0].miles - 1.25) < 1e-9, "warm up is 1.25 mi");
});

test("reps are as tall as the fast pace and the easy parts sit lower", () => {
    const parts = contourParts(tempo);
    const rep = parts.find(p => p.phase === "work");
    const easy = parts.find(p => p.phase === "warmup");
    assert.ok(rep.level > easy.level, "a tempo rep is higher than the warm up");
    const fasterRep = contourParts({ sets: [{ repeat: 1, amount: 1, unit: "mi", pace: "6:30" }] })[0];
    const slowerRep = contourParts({ sets: [{ repeat: 1, amount: 1, unit: "mi", pace: "9:30" }] })[0];
    assert.ok(fasterRep.level > slowerRep.level, "a faster pace is drawn higher");
});

test("widths follow distance: a 2 mile part is twice as wide as a 1 mile part", () => {
    const parts = contourParts({ sets: [{ repeat: 1, amount: 1, unit: "mi" }, { repeat: 1, amount: 2, unit: "mi" }] });
    const svg = contourSvg(parts, { id: "t" });
    assert.match(svg, /<svg class="wk-contour-svg"/);
    const widths = [...svg.matchAll(/<rect x="[\d.]+" y="0" width="([\d.]+)"/g)].map(m => Number(m[1]));
    assert.ok(Math.abs(widths[1] / widths[0] - 2) < 0.02, `widths were ${widths}`);
});

test("one part per workout step, in the same order, so the mode can light the current step by its number", () => {
    assert.equal(contourParts(tempo).length, executionSteps(tempo).length);
    const odd = { warmup: { amount: 0, unit: "mi" }, sets: [{ repeat: 2, amount: 1, unit: "mi", recovery: { amount: 1, unit: "min" } }] };
    assert.equal(contourParts(odd).length, executionSteps(odd).length, "a zero-length step is still a part");
    assert.ok(contourParts(odd)[0].miles > 0, "and it gets a sliver of width, never zero");
});

test("workout mode: finished parts in sage, the current part lit, the rest dimmed", () => {
    const svg = contourSvg(contourParts(tempo), { id: "m", active: 2 });
    const fills = [...svg.matchAll(/fill="url\(#m-(wc-[a-z]+)\)"( opacity="\.5")?\/>/g)].map(m => m[1] + (m[2] ? "*" : ""));
    assert.deepEqual(fills.slice(0, 2), ["wc-done", "wc-done"]);
    assert.equal(fills[2], "wc-lit");
    assert.ok(fills.slice(3).every(f => f.endsWith("*")), `the rest are dimmed: ${fills}`);
    assert.match(svg, /height="5" fill="#F4E2C0"/, "a bar marks where she is, so a short recovery still reads");
    const plain = contourSvg(contourParts(tempo), { id: "m" });
    assert.ok(!plain.includes("wc-lit)") && !plain.includes("#F4E2C0"), "without `active` nothing is lit or marked");
});

test("the picture is labelled with its parts for screen readers, and its ids are unique per card", () => {
    const svg = contourSvg(contourParts(tempo), { id: "card7" });
    assert.match(svg, /aria-label="Warm up 1\.3 mi, Rep 1 of 3 1 mi, Recover/);
    assert.ok(svg.includes('id="card7-clip"'));
    assert.ok(!svg.includes('id="wc-clip"'));
});
