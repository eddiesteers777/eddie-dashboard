// Unit tests for the course map on a fueling plan (js/fuelCourse.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule } from "../js/fuelSchedule.js";
import { workoutSegments } from "../js/paceSegments.js";
import { courseLevels, courseHtml } from "../js/fuelCourse.js";

const gel = { name: "Basic Carb Gel", qty: 2, carbs: 25, sodium: 50, fluid: 0 };
const drink = { bottleCount: 2, bottleSize: 20, carbs: 60, sodium: 890, carbSource: "table-sugar", sodiumSource: "table-salt" };
const evenRun = () => buildSchedule({ durationMin: 132, distanceMi: 16, items: [gel], drink, targets: { carbsPerHour: 50 } });

// A tempo session: warm up 1.25 mi, 3 × 1 mi at 7:05 with 2 min jogs, cool down 1.25 mi.
const tempo = { warmup: { amount: 1.25, unit: "mi" }, sets: [{ repeat: 3, amount: 1, unit: "mi", pace: "7:05", recovery: { amount: 2, unit: "min" } }], cooldown: { amount: 1.25, unit: "mi" } };
const tempoRun = () => buildSchedule({
    durationMin: 58, distanceMi: 6, items: [{ ...gel, qty: 1 }], drink: { ...drink, bottleCount: 1 }, targets: { carbsPerHour: 50 },
    segments: workoutSegments(tempo, { paces: null })
});

test("without the workout's paces the run is one flat line, and the map makes no claim about effort", () => {
    const s = evenRun();
    assert.equal(s.profile, null);
    const levels = courseLevels(s);
    assert.equal(levels.length, 1);
    assert.deepEqual([levels[0].fromMin, levels[0].toMin], [0, 132]);
    assert.ok(!courseHtml(s).includes("Height shows"), "no caption on a flat line");
});

test("with a structured workout the schedule carries its effort, stretch by stretch", () => {
    const s = tempoRun();
    assert.ok(s.profile && s.profile.length >= 7, `profile: ${s.profile?.length}`);
    assert.equal(s.profile[0].label, "Warm-up");
    assert.equal(s.profile[0].fromMin, 0);
    assert.ok(Math.abs(s.profile.at(-1).toMin - 58) < 0.01, "the last stretch ends at the finish");
    assert.ok(s.profile.some(p => p.hard), "the reps are hard");
});

test("hard reps stand tall, the jogs and the warm-up sit low", () => {
    const s = tempoRun();
    const levels = courseLevels(s);
    const rep = levels[s.profile.findIndex(p => p.hard)].level;
    const warm = levels[0].level;
    assert.ok(rep > warm, `a rep (${rep}) is above the warm-up (${warm})`);
    assert.ok(levels.every(l => l.level > 0 && l.level <= 1));
});

test("each bottle is a labelled zone, each gel is a dot and a tag on the line", () => {
    const html = courseHtml(evenRun(), { fluid: oz => `${oz} oz`, id: "t" });
    assert.match(html, /<span class="fs-zone-tag" style="left:0\.00%">Bottle 1 · 20 oz<\/span>/);
    assert.match(html, /<span class="fs-zone-tag" style="left:50\.00%">Bottle 2 · 20 oz<\/span>/);
    assert.equal((html.match(/class="fs-gel-tag"/g) || []).length, 2);
    assert.equal((html.match(/<circle /g) || []).length, 2);
    assert.ok(html.includes('id="t-clip"') && html.includes("url(#t-clip)"), "ids are per map");
});

test("the axis names the start, the middle mile and the finish with its time", () => {
    const html = courseHtml(evenRun());
    assert.match(html, /<span>Start<\/span>/);
    assert.match(html, /<span>Mile 8\.0<\/span>/);
    assert.match(html, /<span>Finish, mile 16\.0 · 2:12<\/span>/);
});

test("the picture is read out in words: the run, each bottle's stretch, each gel's mile", () => {
    const html = courseHtml(evenRun());
    assert.match(html, /role="img" aria-label="The run, 16\.0 mi in 2:12\. Bottle 1, 20 oz, covers mile 0\.0 to 8\.0\. Bottle 2, 20 oz, covers mile 8\.0 to 16\.0\. Gel 1 at mile /);
});

test("with the workout's paces the map says what its height means", () => {
    assert.match(courseHtml(tempoRun()), /Height shows the workout's pace: higher is faster\./);
});

test("with no bottles the run still gets a zone and the map still draws; a caffeinated gel is marked", () => {
    const s = buildSchedule({ durationMin: 60, distanceMi: 7, items: [{ ...gel, qty: 1, caffeine: true }], drink: null, targets: {} });
    const html = courseHtml(s);
    assert.ok(html.includes("<svg viewBox"), "still a map");
    assert.ok(!html.includes("fs-zone-tag"), "no bottle tags");
    assert.ok(html.includes('fill="#ECD6B0"'), "the caffeinated gel is a different colour");
    assert.ok(html.includes("fs-dot-caffeine"), "and it is in the legend");
});
