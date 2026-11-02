// Unit tests for the water sheet's numbers (js/waterModel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readWater, addWater, undoLast, pins, paceOz, nextTip, timeText, nutritionKey, MAX_TOTAL } from "../js/waterModel.js";

test("adding and undoing keeps total and log in step", () => {
    let day = {};
    day = addWater(day, 16, "06:40");
    day = addWater(day, 12, "09:15");
    assert.equal(day.water, 28);
    assert.deepEqual(readWater(day).log.map(e => e.oz), [16, 12]);
    day = undoLast(day);
    assert.equal(day.water, 16);
    assert.equal(undoLast(undoLast(day)), null, "nothing left to undo");
});

test("other fields on the day record survive", () => {
    const day = addWater({ breakfast: "eggs", protein: 30 }, 8, "07:00");
    assert.equal(day.breakfast, "eggs");
    assert.equal(day.protein, 30);
});

test("bad or huge amounts are refused", () => {
    assert.equal(addWater({}, 0), null);
    assert.equal(addWater({}, -5), null);
    assert.equal(addWater({}, "abc"), null);
    assert.equal(addWater({}, 500), null);
    assert.equal(addWater({ water: MAX_TOTAL - 4 }, 8), null);
});

test("a total changed on the Nutrition page reconciles the log", () => {
    const up = readWater({ water: 40, waterLog: [{ t: "07:00", oz: 16 }] });
    assert.deepEqual(up.log.map(e => e.oz), [24, 16], "the gap becomes an earlier drink with no time");
    assert.equal(up.log[0].t, null);
    const down = readWater({ water: 20, waterLog: [{ t: "07:00", oz: 16 }, { t: "09:00", oz: 12 }] });
    assert.equal(down.log.reduce((s, e) => s + e.oz, 0), 20);
    assert.deepEqual(readWater({ water: 24 }).log, [{ t: null, oz: 24 }], "old days with only a total");
    assert.deepEqual(readWater({}).log, []);
});

test("pins give the running level", () => {
    assert.deepEqual(pins([{ t: "a", oz: 16 }, { t: "b", oz: 12 }]).map(p => p.level), [16, 28]);
});

test("an even pace runs 7 am to 9 pm", () => {
    assert.equal(paceOz(100, 7 * 60), 0);
    assert.equal(paceOz(100, 14 * 60), 50);
    assert.equal(paceOz(100, 21 * 60), 100);
    assert.equal(paceOz(100, 4 * 60), 0);
    assert.equal(paceOz(100, 23 * 60), 100);
});

test("the next tip aims at the next 3-hour mark and rounds up to 4 oz", () => {
    assert.deepEqual(nextTip(60, 100, 14 * 60), { oz: 4, byText: "3 pm" }, "ahead of pace still gets a small nudge");
    assert.deepEqual(nextTip(0, 100, 8 * 60), { oz: 16, byText: "9 am" });
    assert.equal(nextTip(100, 100, 12 * 60), null);
    assert.deepEqual(nextTip(60, 100, 21 * 60 + 30), { oz: 40, byText: "tonight" });
});

test("time text and the nutrition key", () => {
    assert.equal(timeText("06:40"), "6:40 am");
    assert.equal(timeText("13:05"), "1:05 pm");
    assert.equal(timeText("00:10"), "12:10 am");
    assert.equal(timeText(null), "");
    assert.equal(nutritionKey(new Date("2026-11-02T20:00:00Z")), "nutrition-2026-11-02");
});
