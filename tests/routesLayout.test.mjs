import assert from "node:assert/strict";
import { test } from "node:test";
import { panelStartsOpen, mapHeight, WIDE } from "../js/routesLayout.js";

test("the panel starts open on a wide screen and closed on a phone", () => {
    assert.equal(panelStartsOpen(1280, null), true);
    assert.equal(panelStartsOpen(WIDE, null), true);
    assert.equal(panelStartsOpen(WIDE - 1, null), false);
    assert.equal(panelStartsOpen(390, null), false);
});
test("a saved choice wins on any width; junk is ignored", () => {
    assert.equal(panelStartsOpen(390, "open"), true);
    assert.equal(panelStartsOpen(1280, "closed"), false);
    assert.equal(panelStartsOpen(1280, "banana"), true);
});
test("map height leaves room for the header and a bottom nav, never under 420", () => {
    assert.equal(mapHeight(900, 76), 824);
    assert.equal(mapHeight(844, 60, 64), 720);
    assert.equal(mapHeight(500, 100, 64), 420);
});
