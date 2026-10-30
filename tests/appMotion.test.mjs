import test from "node:test";
import assert from "node:assert/strict";
import { scrollProgress, instrumentState, habitRingsState } from "../js/appMotion.js";

test("progress is 0 on a page that cannot scroll and never leaves 0..1", () => {
    assert.equal(scrollProgress(500, 0), 0);
    assert.equal(scrollProgress(NaN, 100), 0);
    assert.equal(scrollProgress(-50, 100), 0);
    assert.equal(scrollProgress(250, 100), 1);
    assert.equal(scrollProgress(50, 100), 0.5);
});

test("each instrument starts at rest at the top of the page", () => {
    assert.equal(instrumentState("plan", 0, 1000).cell, 0);
    assert.equal(instrumentState("nutrition", 0, 1000).fillY, 68);
    assert.equal(instrumentState("habits", 0, 1000), null, "habit rings ignore the scroll");
});

test("the calendar marker walks the 21 days and stops on the last one", () => {
    assert.equal(instrumentState("plan", 1000, 1000).cell, 20);
    assert.equal(instrumentState("plan", 500, 1000).cell, 10);
});

test("the bottle fills as you scroll", () => {
    assert.equal(instrumentState("nutrition", 1000, 1000).fillY, 12);
});

test("the habit rings show the real numbers, clamped, and rest at zero", () => {
    assert.deepEqual(habitRingsState("0.5,0.143,0.05").rings, [0.5, 0.143, 0.05]);
    assert.deepEqual(habitRingsState(undefined).rings, [0, 0, 0]);
    assert.deepEqual(habitRingsState("2,-1,x").rings, [1, 0, 0]);
    assert.deepEqual(habitRingsState("0.3").rings, [0.3, 0, 0]);
});

test("messages lines never disappear and the ball ends at the far mark", () => {
    assert.ok(instrumentState("messages", 0, 1000).lines.every(x => x === 0.15));
    assert.ok(instrumentState("messages", 1000, 1000).lines.every(x => x === 1));
    assert.deepEqual(instrumentState("coach", 1000, 1000).ball, { x: 68, y: 26 });
});

test("a page without an instrument gets nothing", () => {
    assert.equal(instrumentState("settings", 100, 1000), null);
});

test("slosh: tilts with scroll speed, stays bounded, settles level", async () => {
    const { sloshStep } = await import("../js/appMotion.js");
    let s = { angle: 0, vel: 0 };
    for (let i = 0; i < 5; i++) s = sloshStep(s.angle, s.vel, 60);
    assert.ok(Math.abs(s.angle) > 0.5 && Math.abs(s.angle) <= 5);
    for (let i = 0; i < 300; i++) s = sloshStep(s.angle, s.vel, 0);
    assert.ok(Math.abs(s.angle) < 0.02);
    assert.deepEqual(sloshStep(NaN, NaN, NaN), { angle: 0, vel: 0 });
});

test("fueling: the runner starts at 0 and finishes at 1", async () => {
    const { instrumentState } = await import("../js/appMotion.js");
    assert.equal(instrumentState("fueling", 0, 1000).run, 0);
    assert.equal(instrumentState("fueling", 1000, 1000).run, 1);
});

test("more: tiles grow in order and stay between 0.4 and 1", async () => {
    const { instrumentState } = await import("../js/appMotion.js");
    const top = instrumentState("more", 0, 1000).sq, end = instrumentState("more", 1000, 1000).sq;
    assert.ok(top.every(k => k === 0.4) && end.every(k => k === 1));
    const mid = instrumentState("more", 300, 1000).sq;
    assert.ok(mid[0] >= mid[8] && mid.every(k => k >= 0.4 && k <= 1));
});

test("fabric: rests at the top, folds drift at different speeds, the tilt stays bounded", async () => {
    const { fabricState } = await import("../js/appMotion.js");
    const top = fabricState(0);
    assert.deepEqual(top.folds, [-0, -0, -0, -0]);
    assert.equal(top.rx, 26); assert.equal(top.ry, -16); assert.equal(top.needle, 0);
    const d = fabricState(1000);
    for (let i = 1; i < d.folds.length; i++) assert.ok(Math.abs(d.folds[i]) > Math.abs(d.folds[i - 1]));
    const far = fabricState(1e9);
    assert.ok(far.rx > 15 && far.rx < 26 && far.ry > -16 && far.ry < 4);
    assert.ok(Object.values(fabricState(NaN)).flat().every(Number.isFinite));
});

test("fabric: the spin speed is a parameter (stopwatch hand)", async () => {
    const { fabricState } = await import("../js/appMotion.js");
    assert.equal(fabricState(100).needle, 15);
    assert.equal(fabricState(100, 0.5).needle, 50);
});
