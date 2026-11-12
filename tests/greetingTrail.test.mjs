import test from "node:test";
import assert from "node:assert/strict";
import { trailShape, trailSvg, TRAIL } from "../js/greetingTrail.js";

test("four lines, one per logo colour, each ending on the same point", () => {
    const s = trailShape();
    assert.equal(s.paths.length, 4);
    const ends = s.paths.map(p => p.d.split(" ").slice(-2).join(" "));
    assert.equal(new Set(ends).size, 1, "all four merge onto one line");
    assert.deepEqual(s.paths.map(p => p.color), ["#C7D6E4", "#8FC3EE", "#8FD0B2", "#D2AD62"]);
});

test("the dot sits on the merged line, inside the box", () => {
    const s = trailShape();
    assert.equal(s.dot.cy, 49);
    assert.ok(s.dot.cx + s.dot.r <= TRAIL.w && s.dot.cy + s.dot.r <= TRAIL.h);
});

test("the svg has four paths and the dot", () => {
    const html = trailSvg();
    assert.equal((html.match(/<path /g) || []).length, 4);
    assert.match(html, /<circle /);
});
