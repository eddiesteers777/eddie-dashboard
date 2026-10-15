// Unit tests for the workout contour (js/workoutContour.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { contourParts, contourSvg } from "../js/workoutContour.js";

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

test("the picture is labelled with its parts for screen readers, and its ids are unique per card", () => {
    const svg = contourSvg(contourParts(tempo), { id: "card7" });
    assert.match(svg, /aria-label="Warm up 1\.3 mi, Rep 1 of 3 1 mi, Recover/);
    assert.ok(svg.includes('id="card7-clip"'));
    assert.ok(!svg.includes('id="wc-clip"'));
});
