// Unit tests for js/viewportFixModel.js: the bottom bars on a phone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixedShift, isTypingTarget, MIN_SHIFT } from "../js/viewportFixModel.js";

test("no gap, no shift", () => {
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 844 }), 0);
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 844 - MIN_SHIFT + 1 }), 0, "small gaps are rounding");
});

test("the iOS 26 stuck viewport (keyboard closed, viewport still short) moves the bars back down", () => {
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 560 }), 284);
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 560, vvOffsetTop: 20 }), 264);
});

test("never shifts while typing, while zoomed, or on nonsense", () => {
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 500, typing: true }), 0);
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 422, scale: 2 }), 0);
    assert.equal(fixedShift({ innerHeight: 844, vvHeight: 200 }), 0, "more than half the screen is not this bug");
    assert.equal(fixedShift({ innerHeight: 0, vvHeight: 0 }), 0);
    assert.equal(fixedShift({}), 0);
    assert.equal(fixedShift(), 0);
});

test("fields that bring up a keyboard or picker count as typing; buttons and boxes don't", () => {
    const el = (tagName, extra = {}) => ({ tagName, ...extra });
    assert.ok(isTypingTarget(el("INPUT", { type: "number" })));
    assert.ok(isTypingTarget(el("INPUT", { type: "text" })));
    assert.ok(isTypingTarget(el("INPUT")));
    assert.ok(isTypingTarget(el("SELECT")));
    assert.ok(isTypingTarget(el("TEXTAREA")));
    assert.ok(isTypingTarget(el("DIV", { isContentEditable: true })));
    assert.ok(!isTypingTarget(el("INPUT", { type: "checkbox" })));
    assert.ok(!isTypingTarget(el("BUTTON")));
    assert.ok(!isTypingTarget(null));
    assert.ok(!isTypingTarget({}));
});
