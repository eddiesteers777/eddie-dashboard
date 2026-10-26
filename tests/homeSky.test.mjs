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

import { runProgress, chapterIndex, sidewaysProgress, CHAPTERS, RACE_MILES } from "../js/homeSkyModel.js";

test("the run starts at 0 miles and finishes at the close", () => {
    assert.ok(runProgress({ scrollY: 0, vh: 800, heroH: 740, closeTop: 7000 }) < 0.1);
    assert.equal(runProgress({ scrollY: 9000, vh: 800, heroH: 740, closeTop: 7000 }), 1);
    assert.ok(Math.abs(RACE_MILES - 13.1) < 1e-9);
});

test("chapters follow the page: start, warm-up, four steps, services, finish", () => {
    const base = { vh: 800, heroH: 740, storyTop: 1500, storyBottom: 5000, closeTop: 7000, step: 1 };
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 0 })], "Start line");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 800 })], "Warm-up");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 2500, step: 1 })], "01 · You apply");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 4000, step: 4 })], "04 · I change it by hand");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 5600 })], "Your three ways in");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 6800 })], "Finish");
});

test("a bad step still gives a valid chapter", () => {
    for (const step of [0, 9, NaN, undefined]) {
        const i = chapterIndex({ vh: 800, heroH: 740, storyTop: 1500, storyBottom: 5000, closeTop: 7000, scrollY: 3000, step });
        assert.ok(i >= 2 && i <= 5, String(step));
    }
});

test("the sideways track only moves inside its travel", () => {
    assert.equal(sidewaysProgress(100, 600), 0);
    assert.equal(sidewaysProgress(-300, 600), 0.5);
    assert.equal(sidewaysProgress(-900, 600), 1);
    assert.equal(sidewaysProgress(-50, 0), 0);
});

import { phoneFeed, phoneFade, PHONE_SCREENS } from "../js/homeSkyModel.js";

test("the phone holds on the screen for each story step", () => {
    assert.equal(phoneFeed(0), 0);
    assert.equal(phoneFeed(0.35), 2);
    assert.equal(phoneFeed(0.6), 4);
    assert.equal(phoneFeed(1), 5);
    assert.ok(PHONE_SCREENS - 1 === phoneFeed(1));
});

test("between steps the feed moves smoothly and never goes backwards", () => {
    let last = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) { const f = phoneFeed(p); assert.ok(f >= last - 1e-9, String(p)); last = f; }
});

test("bad story progress gives a valid feed position", () => {
    for (const p of [NaN, -3, 9, undefined]) { const f = phoneFeed(p); assert.ok(f >= 0 && f <= 5, String(p)); }
});

test("the phone is hidden at the top, shown in the story, gone after it", () => {
    const pg = { vh: 800, storyTop: 1500, storyH: 3400 };
    assert.deepEqual(phoneFade({ ...pg, scrollY: 0 }), { inn: 0, out: 0 });
    const mid = phoneFade({ ...pg, scrollY: 3000 });
    assert.equal(mid.inn, 1); assert.equal(mid.out, 0);
    assert.equal(phoneFade({ ...pg, scrollY: 6000 }).out, 1);
});
