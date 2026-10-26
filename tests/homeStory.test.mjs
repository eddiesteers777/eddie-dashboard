import test from "node:test";
import assert from "node:assert/strict";
import { storyState, storyProgress } from "../js/homeStoryModel.js";

test("the story starts on step 1 with a sliver of the first bar", () => {
    assert.deepEqual(storyState(0), { step: 1, fills: [6, 0, 0, 0] });
});

test("each quarter of the scroll is one step, earlier bars full", () => {
    assert.equal(storyState(0.3).step, 2);
    assert.deepEqual(storyState(0.3).fills.slice(0, 1), [100]);
    assert.equal(storyState(0.6).step, 3);
    assert.deepEqual(storyState(0.875), { step: 4, fills: [100, 100, 100, 50] });
});

test("the end of the story shows step 4 complete, never a step 5", () => {
    assert.deepEqual(storyState(1), { step: 4, fills: [100, 100, 100, 100] });
    assert.equal(storyState(7).step, 4);
});

test("bad input falls back to the start", () => {
    assert.equal(storyState(NaN).step, 1);
    assert.equal(storyState(-2).step, 1);
});

test("progress runs from 0 at the section's top to 1 at its end", () => {
    assert.equal(storyProgress(100, 4000, 800), 0);
    assert.equal(storyProgress(-1600, 4000, 800), 0.5);
    assert.equal(storyProgress(-5000, 4000, 800), 1);
    assert.equal(storyProgress(0, 600, 800), 0, "a section shorter than the window never divides by zero");
});
