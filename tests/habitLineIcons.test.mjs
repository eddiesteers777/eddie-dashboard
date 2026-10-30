// Every habit icon has a line icon (js/habitLineIcons.js), drawn like the app's others.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HABIT_ICONS } from "../js/habitIconSet.js";
import { HABIT_LINE_ICONS, habitLineSvg } from "../js/habitLineIcons.js";

test("each habit icon ID has a line icon, and none is left over", () => {
    const ids = HABIT_ICONS.map(i => i.id).sort();
    assert.deepEqual(Object.keys(HABIT_LINE_ICONS).sort(), ids);
});

test("line icons are stroke-only, currentColor, no hard-coded colours or fills", () => {
    for (const [id, body] of Object.entries(HABIT_LINE_ICONS)) {
        assert.ok(!/#[0-9a-f]{3,6}|rgb|fill="(?!none)/i.test(body), id);
        assert.match(habitLineSvg(id), /stroke="currentColor"/);
    }
    assert.match(habitLineSvg("nope"), /<polygon/, "unknown ID falls back to the star");
});
