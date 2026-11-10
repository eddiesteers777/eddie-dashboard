// A week view says each thing once (audit 2026-11). weekView.js loads browser-only modules, so this reads its source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const view = readFileSync(new URL("../js/weekView.js", import.meta.url), "utf8");
const today = readFileSync(new URL("../js/todayClient.js", import.meta.url), "utf8");

test("a detail line that repeats the title is left out, in the card and the list", () => {
    assert.ok(view.includes("function detailText"));
    assert.ok(!/item\.detail \? `<(p|small)/.test(view), "no raw item.detail rendering");
});

test("Today's summary leaves the miles to the heading when the heading shows them", () => {
    assert.ok(view.includes("{ miles = true } = {}"));
    assert.ok(today.includes("{ miles: !milesInHeading }"));
});
