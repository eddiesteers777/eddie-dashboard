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
    const base = { vh: 800, heroH: 740, storyTop: 1500, storyBottom: 5000, featBottom: 6500, closeTop: 8500, step: 1 };
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 0 })], "Start line");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 800 })], "Warm-up");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 2500, step: 1 })], "01 · You apply");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 4000, step: 4 })], "04 · I change it by hand");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 5600 })], "More in the app");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 6700 })], "Your three ways in");
    assert.equal(CHAPTERS[chapterIndex({ ...base, scrollY: 8300 })], "Finish");
});

test("a bad step still gives a valid chapter", () => {
    for (const step of [0, 9, NaN, undefined]) {
        const i = chapterIndex({ vh: 800, heroH: 740, storyTop: 1500, storyBottom: 5000, featBottom: 6500, closeTop: 8500, scrollY: 3000, step });
        assert.ok(i >= 2 && i <= 5, String(step));
    }
});

test("the sideways track only moves inside its travel", () => {
    assert.equal(sidewaysProgress(100, 600), 0);
    assert.equal(sidewaysProgress(-300, 600), 0.5);
    assert.equal(sidewaysProgress(-900, 600), 1);
    assert.equal(sidewaysProgress(-50, 0), 0);
});

import { CLIPS, CLIP_ORDER, storyClipAt, featureClipAt, featureStep, manualFrac, manualActive, phoneFade } from "../js/homeSkyModel.js";

test("every recording has a chip label, a title and a sentence", () => {
    assert.equal(CLIP_ORDER.length, 7);
    for (const id of CLIP_ORDER) { assert.equal(CLIPS[id].length, 3, id); for (const w of CLIPS[id]) assert.ok(w.length > 2, id); }
});

test("the story plays check-in, plans, live, then the rest of check-in, forwards with the scroll", () => {
    assert.deepEqual(storyClipAt(0), { id: "checkin", frac: 0 });
    assert.deepEqual(storyClipAt(0.125), { id: "checkin", frac: 0.5 });
    assert.deepEqual(storyClipAt(0.25), { id: "plans", frac: 0 });
    assert.equal(storyClipAt(0.5).id, "live");
    assert.deepEqual(storyClipAt(0.75), { id: "wins", frac: 0 });
    assert.deepEqual(storyClipAt(1), { id: "wins", frac: 1 });
});

test("scrolling back moves the recording back: the position only depends on where you are", () => {
    const ps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const fwd = ps.map(storyClipAt), back = [...ps].reverse().map(storyClipAt).reverse();
    assert.deepEqual(fwd, back);
    for (let i = 1; i < fwd.length; i++) if (fwd[i].id === fwd[i - 1].id) assert.ok(fwd[i].frac >= fwd[i - 1].frac);
});

test("bad progress gives a valid recording and position", () => {
    for (const p of [NaN, -3, 9, undefined]) { const c = storyClipAt(p), f = featureClipAt(p); assert.ok(CLIP_ORDER.includes(c.id) && c.frac >= 0 && c.frac <= 1); assert.ok(CLIP_ORDER.includes(f.id) && f.frac >= 0 && f.frac <= 1); }
});

test("the feature section plays four recordings the story did not use, each start to end", () => {
    assert.deepEqual(featureClipAt(0), { id: "soccer", frac: 0 });
    assert.equal(featureClipAt(0.4).id, "fuel");
    assert.equal(featureClipAt(0.7).id, "pace");
    assert.deepEqual(featureClipAt(1), { id: "pace", frac: 1 });
    assert.equal(featureStep(1), 2); assert.equal(featureStep(-4), 0); assert.equal(featureStep(NaN), 0);
});

test("a tapped chip follows the scroll for about a screen and a bit, then lets go", () => {
    assert.equal(manualFrac(0, 800), 0);
    assert.equal(manualFrac(-300, 800), 0);
    assert.equal(manualFrac(480, 800), 0.5);
    assert.equal(manualFrac(5000, 800), 1);
    assert.equal(manualActive(0, 800), true);
    assert.equal(manualActive(-100, 800), true);
    assert.equal(manualActive(-400, 800), false);
    assert.equal(manualActive(2000, 800), false);
});

test("the phone is hidden at the top, shown from the story, gone after the feature section", () => {
    const pg = { vh: 800, storyTop: 1500, featTop: 4900, featH: 3200 };
    assert.deepEqual(phoneFade({ ...pg, scrollY: 0 }), { inn: 0, out: 0 });
    const mid = phoneFade({ ...pg, scrollY: 3000 });
    assert.equal(mid.inn, 1); assert.equal(mid.out, 0);
    assert.equal(phoneFade({ ...pg, scrollY: 8000 }).out, 1);
});
