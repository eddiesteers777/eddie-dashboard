// Unit tests for the Analytics summary strip and data coverage (js/analyticsSummary.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { summaryLines, dataCoverage, effortThisMonth, MAX_LINES } from "../js/analyticsSummary.js";

const TODAY = "2026-10-05";
const lens = (key, sec, sigma = 0.04) => ({ key, sec, sigma });

test("COROS and your own evidence 5%+ apart: the first line, with the reason, pointing at Capability", () => {
    const cap = { sec: 11000, lenses: [lens("races", 11100), lens("training", 11000, 0.05), lens("coros", 10300, 0.06)], quality: { flags: ["Newest race is 7 months old"] } };
    const [first] = summaryLines({ today: TODAY, capability: cap });
    assert.equal(first.key, "coros-gap");
    assert.equal(first.href, "#anCapability");
    assert.match(first.text, /differ by 7% on the marathon \(COROS is faster\): your newest race is 7 months old\./);
    const close = { ...cap, lenses: [lens("races", 11000), lens("coros", 10800, 0.06)] };
    assert.ok(!summaryLines({ today: TODAY, capability: close }).some(l => l.key === "coros-gap"), "under 5%: nothing to say");
});

test("at most three lines, most important first; quiet when there's nothing to look into", () => {
    assert.deepEqual(summaryLines({ today: TODAY }), []);
    const facts = {
        today: TODAY,
        capability: { sec: 11000, lenses: [lens("training", 11000, 0.05), lens("coros", 10000, 0.06)], quality: { flags: ["No confirmed race in the last 12 months"] } },
        response: { reading: { key: "fatigue", title: "Tired, hot or getting sick?" }, eff: { signal: { verdict: "higher", bpm: 5 } } },
        race: { name: "Indianapolis", date: "2026-11-08" },
        preparation: { gap: 0.3, readiness: 0.7, basis: "yours", kind: "marathon" },
        effortMonth: { runs: 6, rated: 1 },
        coverage: { runs: 40, hr: 10, hrv: 5, nights: 60 }
    };
    const lines = summaryLines(facts);
    assert.equal(lines.length, MAX_LINES);
    assert.deepEqual(lines.map(l => l.key), ["coros-gap", "reading", "prep"]);
    assert.match(lines[2].text, /Indianapolis in 34 days: this block is 70% of your usual marathon block\./);
    assert.equal(lines[1].tone, "warn");
});

test("lower data lines: effort answers this month, heart rate, HRV nights", () => {
    const lines = summaryLines({ today: TODAY, effortMonth: { runs: 11, rated: 4 }, coverage: { runs: 30, hr: 30, hrv: 50, nights: 60 } });
    assert.equal(lines.length, 1);
    assert.match(lines[0].text, /Only 4 of 11 runs rated in October/);
    const hrv = summaryLines({ today: TODAY, coverage: { runs: 30, hr: 12, hrv: 10, nights: 60 } }).map(l => l.key);
    assert.deepEqual(hrv, ["hr", "hrv"]);
    const eff = summaryLines({ today: TODAY, response: { reading: { key: "adaptation", title: "Adapting" }, eff: { signal: { verdict: "lower", bpm: -4 } } } });
    assert.match(eff[0].text, /Easy-run heart rate down 4 bpm/);
    assert.equal(eff[0].tone, "good");
});

test("data coverage: watch runs in 90 days with heart rate, effort and laps; HRV and sleep nights in 60", () => {
    const sessions = [
        { id: "c:1", aliases: [], date: "2026-10-04", avgHr: 140, rpe: 3, rpeAnswered: true },
        { id: "c:2", aliases: [], date: "2026-09-20", avgHr: 0, rpe: null },
        { id: "s:9", aliases: ["c:3"], date: "2026-08-01", avgHr: 150, rpe: null },
        { id: "l:7", aliases: [], date: "2026-10-01", avgHr: 0, rpe: 4 },          // hand-logged: not a watch run
        { id: "c:4", aliases: [], date: "2026-06-01", avgHr: 150, rpe: 5 }          // older than 90 days
    ];
    const health = { "2026-10-05": { hrv: { avg: 80 }, sleep: { asleepMin: 420 } }, "2026-10-04": { sleep: { asleepMin: 400 } } };
    const c = dataCoverage({ sessions, health, laps: { 1: { laps: [{ m: 1609 }] }, 3: { laps: [{ m: 1000 }] } }, today: TODAY });
    assert.equal(c.runs, 3);
    assert.equal(c.hr, 2);
    assert.equal(c.effort, 1);
    assert.equal(c.laps, 2, "by id or alias");
    assert.equal(c.hrv, 1);
    assert.equal(c.sleep, 2);
    assert.deepEqual(c.rows.map(r => r.key), ["hr", "effort", "laps", "hrv", "sleep"]);
    assert.equal(c.rows[0].pct, 67);
    assert.deepEqual(effortThisMonth(sessions, TODAY), { runs: 1, rated: 1, answered: 1 });
});
