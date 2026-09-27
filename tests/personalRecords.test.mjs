// Unit tests for personal records from your runs (js/personalRecords.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { personalRecords, parseTime, formatTime } from "../js/personalRecords.js";

const M = 1609.344;
const acts = {
    f1: { k: "f1", y: "run", d: "2024-04-15", m: 42300, n: "Boston Marathon", b: [380, 1230, 2500, 5280, 10560] },
    f2: { k: "f2", y: "run", d: "2025-05-10", m: 1700, n: "Mile time trial", b: [322, null, null, null, null] },
    f3: { k: "f3", y: "run", d: "2023-01-01", m: 3000, n: "Glitch", b: [150, null, null, null, null] },   // 2:30 mile: bad reading
    r1: { k: "r1", y: "ride", d: "2025-06-01", m: 40000, b: [100, 100, 100, 100, 100] }
};
const runs = [
    { labelId: "c1", date: "2026-09-13", distance: 5010, duration: 1150, name: "Parkrun" },        // a 5K race: 19:10 -> 19:08 over exactly 5K
    { key: "t9", date: "2019-03-02", distance: 9900, duration: 2420, name: "10K race" },           // 1.0% short: scaled up
    { labelId: "c2", date: "2026-09-26", distance: 30614, duration: 8692, name: "19 miler" }        // not near any race distance
];

test("times: typed text in, clock text out", () => {
    assert.equal(parseTime("3:05:00"), 11100);
    assert.equal(parseTime("18:45"), 1125);
    assert.equal(parseTime(" 1:25:30 "), 5130);
    assert.equal(parseTime("sub 3"), null);
    assert.equal(formatTime(11100), "3:05:00");
    assert.equal(formatTime(322), "5:22");
});

test("the fastest of watch-file efforts, whole runs and typed times", () => {
    const pr = Object.fromEntries(personalRecords(runs, acts, { half: "1:25:30", marathon: "3:05:00" }).map(p => [p.id, p]));
    assert.deepEqual([pr.mile.text, pr.mile.source, pr.mile.name, pr.mile.inside], ["5:22", "effort", "Mile time trial", true]);
    assert.deepEqual([pr["5k"].text, pr["5k"].source, pr["5k"].name], ["19:08", "run", "Parkrun"]);
    assert.deepEqual([pr["10k"].text, pr["10k"].source, pr["10k"].date, pr["10k"].inside], ["40:44", "run", "2019-03-02", false], "the 10K race (1% short, scaled) beats the 41:40 inside Boston");
    assert.deepEqual([pr.half.text, pr.half.source], ["1:25:30", "typed"], "typed is faster than the 1:28:00 inside Boston");
    assert.deepEqual([pr.marathon.text, pr.marathon.source, pr.marathon.inside], ["2:56:00", "effort", false], "Boston itself (42.3 km) beats the typed 3:05");
});

test("hiding a found time shows the next fastest; untyped text stays as written", () => {
    const typed = { mile: "", "5k": "under 20", _hidden: { mile: ["e:f2"], "5k": ["r:c1"] } };
    const pr = Object.fromEntries(personalRecords(runs, acts, typed).map(p => [p.id, p]));
    assert.deepEqual([pr.mile.text, pr.mile.name, pr.mile.hiddenCount], ["6:20", "Boston Marathon", 1]);
    assert.equal(pr["5k"].text, "20:30", "Boston's 5K stretch, once the Parkrun is hidden");
    const none = Object.fromEntries(personalRecords([], {}, { "5k": "under 20" }).map(p => [p.id, p]));
    assert.deepEqual([none["5k"].text, none["5k"].source], ["under 20", "typed"]);
    assert.deepEqual([none.mile.text, none.mile.source], [null, null]);
});
