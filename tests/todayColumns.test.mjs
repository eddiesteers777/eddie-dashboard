// Unit tests for Today's two columns on a computer (js/todayColumns.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayColumn, MAIN_SECTIONS, FULL_SECTIONS } from "../js/todayColumns.js";
import { CLIENT_TODAY } from "../js/todayLayout.js";

test("the day goes left, what surrounds it right, the tiles full width", () => {
    assert.equal(todayColumn("todayCard"), "main");
    assert.equal(todayColumn("weekSection"), "main");
    assert.equal(todayColumn("todayTiles"), "main");
    assert.equal(todayColumn("coachCardSection"), "side");
    assert.equal(todayColumn("readinessCard"), "side");
    assert.equal(todayColumn("todayHabits"), "side");
    assert.equal(todayColumn("todayTools"), "full");
});

test("every column id is a real Today section", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    for (const id of [...MAIN_SECTIONS, ...FULL_SECTIONS, ...CLIENT_TODAY.map(s => s.id)]) {
        assert.ok(html.includes(`<section id="${id}"`) || html.includes(`<div id="${id}"`), `${id} is a section (or the tiles' wrapper) in index.html`);
    }
});
