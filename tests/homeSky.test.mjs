import test from "node:test";
import assert from "node:assert/strict";
import { skyState } from "../js/homeSkyModel.js";

const page = { vh: 800, heroH: 740, storyTop: 1500, storyBottom: 5000, closeTop: 7000 };
const at = (scrollY) => skyState({ ...page, scrollY });

test("the top of the page is pure sunset", () => {
    const s = at(0);
    assert.equal(s.dusk, 0); assert.equal(s.night, 0); assert.equal(s.dawn, 0);
    assert.equal(s.hero, 0); assert.equal(s.set, 0);
});

test("it is night in the middle of the story", () => {
    const s = at(3000);
    assert.equal(s.night, 1); assert.equal(s.dawn, 0); assert.equal(s.dusk, 1);
});

test("dawn arrives after the story and night is gone by the close", () => {
    const s = at(6500);
    assert.equal(s.dawn, 1); assert.equal(s.night, 0);
});

test("night and dawn never add up past one", () => {
    for (let y = 0; y <= 8000; y += 50) { const s = at(y); assert.ok(s.night + s.dawn <= 1 + 1e-9, String(y)); }
});

test("every value stays between 0 and 1 for any scroll, even beyond the page", () => {
    for (const y of [-500, 0, 1e5, NaN]) for (const v of Object.values(at(y))) assert.ok(v >= 0 && v <= 1, `${y} ${v}`);
});

test("missing measurements do not throw", () => {
    const s = skyState({ scrollY: 100, vh: 0 });
    for (const v of Object.values(s)) assert.ok(Number.isFinite(v));
});
