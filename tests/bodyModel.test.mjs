// Unit tests for Today's health stats (js/bodyModel.js, js/bodyView.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { showHealthStats, bodyMeasures } from "../js/bodyModel.js";
import { ringHtml, sparkHtml, measuresHtml } from "../js/bodyView.js";

// Ten mornings up to Thursday 15 Oct 2026, as the COROS health record keeps them.
const DATES = Array.from({ length: 10 }, (_, i) => `2026-10-${String(6 + i).padStart(2, "0")}`);
const health = Object.fromEntries(DATES.map((d, i) => [d, {
    hrv: { avg: 52 + (i % 4), baseline: 55, low: 50, high: 63 },
    rhr: 54 - (i % 3),
    sleep: { asleepMin: 400 + i * 4 }
}]));
const TODAY = "2026-10-15";

test("it shows only with a watch behind it, and only until the person turns it off", () => {
    assert.equal(showHealthStats({ settings: {}, connected: true, hasData: false }), true, "a connected watch");
    assert.equal(showHealthStats({ settings: {}, connected: false, hasData: true }), true, "history already on this device");
    assert.equal(showHealthStats({ settings: {}, connected: false, hasData: false }), false, "no watch, nothing to show: not drawn");
    assert.equal(showHealthStats({ settings: { showOnToday: false }, connected: true, hasData: true }), false, "switched off in Settings");
    assert.equal(showHealthStats({ settings: { showOnToday: true }, connected: true }), true);
    assert.equal(showHealthStats(), false);
});

test("sleep, HRV and resting HR are read off the morning's record", () => {
    const m = bodyMeasures(health, TODAY, { needMin: 450 });
    assert.equal(m.sleep.min, 436);
    assert.equal(m.sleep.value, "7h 16m");
    assert.equal(m.hrv.ms, 53);
    assert.equal(m.rhr.bpm, 54);
});

test("each measure says where it stands in plain words", () => {
    const m = bodyMeasures(health, TODAY, { needMin: 450 });
    assert.equal(m.sleep.note, "about the 7h 30m you need", "14 minutes short is close enough");
    assert.equal(m.hrv.note, "normal for you");
    assert.deepEqual(m.hrv.band, [50, 63]);
    const low = structuredClone(health);
    low[TODAY].sleep.asleepMin = 330;
    low[TODAY].hrv.avg = 44;
    low[TODAY].rhr = 61;
    const b = bodyMeasures(low, TODAY, { needMin: 450 });
    assert.equal(b.sleep.note, "2h short of 7h 30m");
    assert.equal(b.hrv.note, "below your normal");
    assert.match(b.rhr.note, /^\d+ above your usual$/);
    low[TODAY].hrv.avg = 70;
    assert.equal(bodyMeasures(low, TODAY).hrv.note, "above your normal");
});

test("resting HR compares with the person's own 30-day usual; with too little history it says so", () => {
    assert.equal(bodyMeasures({ [TODAY]: { rhr: 52 } }, TODAY).rhr.note, "building your average");
    const steady = Object.fromEntries(DATES.map(d => [d, { rhr: 52 }]));
    assert.equal(bodyMeasures(steady, TODAY).rhr.note, "your usual is 52");
});

test("the week is a line only when there are at least 3 days of it, each at its own place in the week", () => {
    const m = bodyMeasures(health, TODAY);
    assert.equal(m.sleep.trend.length, 7);
    assert.deepEqual(m.sleep.trend.map(p => p.day), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(m.sleep.trend.at(-1).v, 436, "the last point is this morning");
    const sparse = bodyMeasures({ [TODAY]: health[TODAY], "2026-10-13": health["2026-10-13"] }, TODAY);
    assert.equal(sparse.sleep.trend, null, "two days is not a line");
    assert.equal(sparse.sleep.min, 436, "but the number is still there");
    const gaps = bodyMeasures({ [TODAY]: health[TODAY], "2026-10-14": health["2026-10-14"], "2026-10-11": health["2026-10-11"] }, TODAY);
    assert.deepEqual(gaps.sleep.trend.map(p => p.day), [2, 5, 6], "missing days leave gaps, not squeezed points");
});

test("a measure the watch did not report is null, never a guess", () => {
    const m = bodyMeasures({ [TODAY]: { sleep: { asleepMin: 420 } } }, TODAY);
    assert.equal(m.hrv, null);
    assert.equal(m.rhr, null);
    assert.equal(m.sleep.min, 420);
    assert.deepEqual(bodyMeasures({}, TODAY), { sleep: null, hrv: null, rhr: null });
});

test("without the watch's own range the HRV has no band and no claim of normal", () => {
    const m = bodyMeasures({ [TODAY]: { hrv: { avg: 58 } } }, TODAY);
    assert.equal(m.hrv.band, null);
    assert.equal(m.hrv.note, "from your watch");
});

test("the ring is filled to the score in the day's tone, and reads out in words", () => {
    const html = ringHtml(74, "green", "t");
    assert.match(html, /<figure class="rd-ring2 tone-green" role="img" aria-label="Readiness 74 out of 100, green">/);
    assert.ok(html.includes("<b>74</b>") && html.includes('id="t"') && html.includes("url(#t)"));
    const half = ringHtml(50, "yellow"), full = ringHtml(100, "green");
    assert.ok(half.includes("tone-yellow"));
    assert.ok(full.length > 0 && full.includes("<circle"), "a full ring still ends in its dot");
});

test("no score: the track alone and a dash, nothing filled", () => {
    const html = ringHtml(null, "none");
    assert.match(html, /aria-label="Readiness not available"/);
    assert.ok(html.includes("<b>–</b>"));
    assert.ok(!html.includes("<circle") && !html.includes("rd-ring-glow"));
});

test("the line has the dot on the last morning, and a shaded band only for HRV's normal range", () => {
    const m = bodyMeasures(health, TODAY);
    const html = sparkHtml(m.hrv.trend, { band: m.hrv.band });
    assert.ok(html.includes('class="rd-spark"') && html.includes("rd-spark-dot") && html.includes("<rect"));
    assert.ok(!sparkHtml(m.sleep.trend).includes("<rect"), "no band without a range");
    assert.equal(sparkHtml(null), "");
    assert.equal(sparkHtml([{ day: 5, v: 1 }, { day: 6, v: 2 }]), "", "two days is not a line");
    assert.match(sparkHtml(m.sleep.trend), /left:96\.0%/, "the last morning is at the right end, a little in from the edge so the dot is not clipped");
});

test("only the measures the watch reported are drawn; none, nothing", () => {
    const all = measuresHtml(bodyMeasures(health, TODAY));
    assert.equal((all.match(/class="rd-measure"/g) || []).length, 3);
    assert.match(all, /--cols:3/);
    assert.ok(all.includes("7h 16m") && all.includes("<small> ms</small>") && all.includes("<small> bpm</small>"));
    const one = measuresHtml(bodyMeasures({ [TODAY]: { sleep: { asleepMin: 420 } } }, TODAY));
    assert.equal((one.match(/class="rd-measure"/g) || []).length, 1);
    assert.match(one, /--cols:1/);
    assert.equal(measuresHtml(bodyMeasures({}, TODAY)), "");
    assert.equal(measuresHtml(), "");
});
