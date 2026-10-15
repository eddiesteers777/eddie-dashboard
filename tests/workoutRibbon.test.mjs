// Unit tests for the workout ribbon (js/workoutRibbon.js): the three glass pills on Today's card.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ribbonSegments, ribbonHtml } from "../js/workoutRibbon.js";

const tempo = {
    warmup: { amount: 1.25, unit: "mi", pace: "" },
    sets: [{ repeat: 3, amount: 1, unit: "mi", pace: "7:05-7:15", recovery: { amount: 2, unit: "min" } }],
    cooldown: { amount: 1.25, unit: "mi" }
};

test("a tempo run is three pills: the warm up, the main set as one pill, the cool down", () => {
    const s = ribbonSegments(tempo);
    assert.deepEqual(s.map(p => p.kind), ["easy", "hard", "easy"]);
    assert.equal(s[0].label, "1.25 mi");
    assert.equal(s[2].label, "1.25 mi");
    assert.match(s[1].label, /^3 × 1 mi · 7:05–7:15$/, "reps and the pace on the main set, no /mi");
});

test("the pill widths are the miles each part covers, recoveries included in the main set", () => {
    const s = ribbonSegments(tempo);
    const total = s.reduce((t, p) => t + p.miles, 0);
    assert.ok(Math.abs(s[0].miles - 1.25) < 0.01);
    assert.ok(Math.abs(s[1].miles - (3 + 2 * (2 / 8.3))) < 0.05, "three 1-mile reps and two 2-minute jogs");
    assert.ok(total > 5.5 && total < 7.5);
});

test("a run with no steps has no ribbon, and nothing is drawn", () => {
    assert.deepEqual(ribbonSegments(undefined), []);
    assert.deepEqual(ribbonSegments({}), []);
    assert.equal(ribbonHtml([]), "");
});

test("an easy run with only a warm up and a cool down has no hard pill", () => {
    const s = ribbonSegments({ warmup: { amount: 2, unit: "mi" }, cooldown: { amount: 1, unit: "mi" } });
    assert.deepEqual(s.map(p => p.kind), ["easy", "easy"]);
});

test("one long set with no reps is named by its size, with its pace", () => {
    const s = ribbonSegments({ sets: [{ repeat: 1, amount: 6, unit: "mi", pace: "8:00-8:20" }] });
    assert.equal(s.length, 1);
    assert.equal(s[0].label, "6 mi · 8:00–8:20");
});

test("with several sets there is no single pace to show, so the pill says Main set", () => {
    const s = ribbonSegments({ sets: [{ repeat: 2, amount: 800, unit: "m", pace: "6:30-6:40" }, { repeat: 2, amount: 400, unit: "m", pace: "6:00-6:10" }] });
    assert.equal(s.length, 1);
    assert.equal(s[0].label, "Main set");
});

test("the HTML is three pills and their words, read once from the picture's label", () => {
    const html = ribbonHtml(ribbonSegments(tempo));
    assert.match(html, /^<div class="wk-ribbon" role="img" aria-label="1\.25 mi, 3 × 1 mi · 7:05–7:15, 1\.25 mi">/);
    assert.equal((html.match(/class="wk-ribbon-pill/g) || []).length, 3);
    assert.equal((html.match(/wk-ribbon-pill is-hard/g) || []).length, 1, "only the main set is sand");
    assert.ok(html.includes('aria-hidden="true"'), "the words under the bar are not read twice");
});

test("labels are escaped", () => {
    const html = ribbonHtml([{ kind: "easy", miles: 1, label: "<b>x</b>" }]);
    assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;") && !html.includes("<b>x</b>"));
});
