import test from "node:test";
import assert from "node:assert/strict";
import { scrollProgress, instrumentState } from "../js/appMotion.js";

test("progress is 0 on a page that cannot scroll and never leaves 0..1", () => {
    assert.equal(scrollProgress(500, 0), 0);
    assert.equal(scrollProgress(NaN, 100), 0);
    assert.equal(scrollProgress(-50, 100), 0);
    assert.equal(scrollProgress(250, 100), 1);
    assert.equal(scrollProgress(50, 100), 0.5);
});

test("each instrument starts at rest at the top of the page", () => {
    assert.deepEqual(instrumentState("index", 0, 1000), { needle: 0, dial: -0 });
    assert.equal(instrumentState("train", 0, 1000).tick, 0);
    assert.equal(instrumentState("plan", 0, 1000).cell, 0);
    assert.equal(instrumentState("nutrition", 0, 1000).fillY, 68);
    assert.deepEqual(instrumentState("habits", 0, 1000).rings, [0, 0, 0]);
});

test("the stopwatch tick stays on its 60 marks, even far down a long page", () => {
    for (const y of [0, 5, 99, 513, 4000, 123456]) {
        const t = instrumentState("train", y, 5000).tick;
        assert.ok(Number.isInteger(t) && t >= 0 && t < 60, `tick ${t} at ${y}`);
    }
});

test("the calendar marker walks the 21 days and stops on the last one", () => {
    assert.equal(instrumentState("plan", 1000, 1000).cell, 20);
    assert.equal(instrumentState("plan", 500, 1000).cell, 10);
});

test("the bottle fills as you scroll and the rings fill one after another", () => {
    assert.equal(instrumentState("nutrition", 1000, 1000).fillY, 12);
    const r = instrumentState("habits", 1000, 1000).rings;
    assert.ok(r[0] > r[1] && r[1] > r[2]);
    assert.ok(r.every(x => x >= 0 && x <= 0.9));
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
