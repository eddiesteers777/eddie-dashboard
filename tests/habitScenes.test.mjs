import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HABIT_SCENES, sceneForIcon } from "../js/habitScenes.js";

const css = readFileSync(new URL("../css/habitScenes.css", import.meta.url), "utf8");

test("each of Eddie's ten default habits has its own scene", () => {
    const ids = { pray: "candle", bible: "ribbon", run: "lap", strength: "plates", stretch: "flower", protein: "gauge", water: "water", sleep: "moon", read: "pages", love: "hearts" };
    for (const [icon, name] of Object.entries(ids)) assert.equal(sceneForIcon(icon)?.name, name, icon);
});

test("a habit without a scene gets none", () => {
    assert.equal(sceneForIcon("star"), null);
    assert.equal(sceneForIcon(""), null);
    assert.equal(sceneForIcon(undefined), null);
});

test("every scene has markup, a kicker, a time for the check, and styles", () => {
    for (const [name, s] of Object.entries(HABIT_SCENES)) {
        assert.ok(s.html.length > 50, name);
        assert.ok(s.kicker, name);
        assert.ok(s.ckAt >= 1.5 && s.ckAt <= 3, `${name} check time`);
        assert.ok(css.includes(`.sc-${name} `), `${name} has styles`);
        assert.ok(!/<script|on\w+=/i.test(s.html), `${name} markup is inert`);
    }
});

test("scene styles stay scoped and use no off-system fonts", () => {
    for (const line of css.split("\n")) {
        if (!line.trim() || line.startsWith("/*") || line.startsWith("@keyframes") || line.startsWith("   ")) continue;
        assert.ok(line.startsWith(".sb-cr .sc-"), line.slice(0, 60));
    }
    assert.ok(!/font-family/.test(css));
});
