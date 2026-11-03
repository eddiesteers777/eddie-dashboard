// Unit tests for the water screen's custom buttons (js/waterPresets.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCustom, addCustom, removeCustom, allPresets, MAX_CUSTOM } from "../js/waterPresets.js";

test("a good size is added, sorted, and shown after the built-in buttons", () => {
    let r = addCustom([], 20, "Gym bottle");
    assert.deepEqual(r.list, [{ oz: 20, label: "Gym bottle" }]);
    r = addCustom(r.list, 5, "");
    assert.deepEqual(r.list.map(p => p.oz), [5, 20]);
    assert.equal(r.list[0].label, "mine", "no name falls back to mine");
    assert.deepEqual(allPresets(r.list).map(p => p.oz), [8, 12, 16, 24, 5, 20]);
    assert.deepEqual(allPresets(r.list).map(p => p.custom), [false, false, false, false, true, true]);
});

test("bad sizes and repeats are refused with a sentence", () => {
    assert.match(addCustom([], 0, "x").error, /1 to 200/);
    assert.match(addCustom([], 201, "x").error, /1 to 200/);
    assert.match(addCustom([], "abc", "x").error, /1 to 200/);
    assert.match(addCustom([], 12, "x").error, /already have a \+12/);
    assert.match(addCustom([{ oz: 20, label: "a" }], 20, "x").error, /already have a \+20/);
});

test("there is room for four of your own", () => {
    let list = [];
    for (const oz of [5, 10, 20, 30]) list = addCustom(list, oz, "").list;
    assert.equal(list.length, MAX_CUSTOM);
    assert.match(addCustom(list, 40, "").error, /keep 4/);
    assert.deepEqual(removeCustom(list, 10).map(p => p.oz), [5, 20, 30]);
    assert.deepEqual(removeCustom(list, 99).map(p => p.oz), [5, 10, 20, 30]);
});

test("a damaged saved list is cleaned, never trusted", () => {
    const dirty = [{ oz: "20", label: "  Big   mug  " }, { oz: 12 }, { oz: -3 }, null, { oz: 20 }, { oz: 3.6, label: "x".repeat(40) }, "junk"];
    assert.deepEqual(cleanCustom(dirty), [{ oz: 4, label: "xxxxxxxxxxxxxx" }, { oz: 20, label: "Big mug" }]);
    assert.deepEqual(cleanCustom("nope"), []);
});
