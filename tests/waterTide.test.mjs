// Unit tests for the water screen's numbers (js/waterTide.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { tideFrac, tideY, layoutFor, hourText, countCaption, paceMessage, finaleSummary, paceTag } from "../js/waterTide.js";

test("the sea is empty at 0, full at the goal, and stays full over it", () => {
    assert.equal(tideFrac(0, 100), 0);
    assert.equal(tideFrac(50, 100), 0.5);
    assert.equal(tideFrac(100, 100), 1);
    assert.equal(tideFrac(116, 100), 1);
    assert.equal(tideFrac(-5, 100), 0);
    assert.equal(tideFrac(10, 0), 1, "a missing goal never divides by zero");
});

test("the surface sits on the goal line when full and on the floor when empty", () => {
    assert.equal(tideY(0, 100, 118, 724), 724);
    assert.equal(tideY(100, 100, 118, 724), 118);
    assert.equal(tideY(50, 100, 118, 724), 421);
});

test("the layout keeps the count and the check between the goal line and the controls", () => {
    for (const [w, h, lowerTop] of [[390, 760, 510], [375, 560, 330], [460, 820, 560], [320, 480, 300]]) {
        const L = layoutFor(w, h, lowerTop);
        assert.ok(L.goalY >= 104 && L.goalY <= 132);
        assert.ok(L.countTop > L.goalY, `count under the goal line at ${w}x${h}`);
        assert.ok(L.buoyY - L.buoy / 2 > L.goalY, `check under the goal line at ${w}x${h}`);
        assert.ok(L.countSize >= 84 && L.countSize <= 136);
        assert.ok(L.titleSize >= 36 && L.titleSize <= 52);
        assert.equal(L.floorY, h - 36);
    }
    const tall = layoutFor(390, 760, 510);
    assert.ok(tall.titleTop + tall.titleSize < 510, "the title clears the controls on a normal phone");
});

test("clock and caption words", () => {
    assert.equal(hourText(13 * 60), "1 PM");
    assert.equal(hourText(9 * 60 + 5), "9:05 AM");
    assert.equal(hourText(0), "12 AM");
    assert.equal(countCaption(40, 100), "of 100 oz today");
    assert.equal(countCaption(100, 100), "right on the goal");
    assert.equal(countCaption(116, 100), "16 oz over the goal");
});

test("the pace line says ahead, behind, or nothing yet", () => {
    assert.deepEqual(paceMessage({ total: 0, pace: 52, isToday: true, goal: 100 }), { lead: "", rest: "Nothing yet. The dashed line is where an even day puts you." });
    assert.equal(paceMessage({ total: 40, pace: 52, isToday: true, goal: 100 }).lead, "12 oz behind");
    assert.equal(paceMessage({ total: 60, pace: 52, isToday: true, goal: 100 }).lead, "8 oz ahead of");
    assert.equal(paceMessage({ total: 60, pace: 100, isToday: false, goal: 100 }).lead, "40 oz");
});

test("the finale summary adds the over amount and a streak of two or more days", () => {
    assert.equal(finaleSummary(100, 100, 0), "100 oz");
    assert.equal(finaleSummary(100, 100, 1), "100 oz");
    assert.equal(finaleSummary(116, 100, 6), "116 oz · 16 over · day 6 in a row");
    assert.equal(paceTag(52, 13 * 60), "Even pace · 52 oz by 1 PM");
});
