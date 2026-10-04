// Unit tests for the load state (js/loadState.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadState, dailyDoses, weeklyTotals, recentWords, TAU, LOAD_VERSION } from "../js/loadState.js";
import { addDays } from "../js/athleteLedger.js";

const dose = (date, value, extra = {}) => ({ date, dose: value, domains: { easy: value, threshold: 0, hard: 0, ...(extra.domains || {}) }, miles: extra.miles ?? 6, long: Boolean(extra.long) });
const steady = (from, days, value) => Array.from({ length: days }, (_, i) => dose(addDays(from, i), value));

test("a steady 60 a day: base and recent both settle at 60, balance 0", () => {
    const s = loadState(steady("2026-01-01", 200, 60), "2026-07-19");
    assert.equal(s.version, LOAD_VERSION);
    assert.equal(s.today.base, 60);
    assert.equal(s.today.recent, 60);
    assert.equal(s.today.balance, 0);
});

test("the EWMA step: one big day moves recent by 1 − e^(−1/7) and base by 1 − e^(−1/42)", () => {
    const doses = [...steady("2026-01-01", 100, 50), dose("2026-04-11", 50 + 140)];
    const s = loadState(doses, "2026-04-11");
    assert.ok(Math.abs(s.today.recent - (50 + 140 * (1 - Math.exp(-1 / TAU.recent)))) < 0.06);
    assert.ok(Math.abs(s.today.base - (50 + 140 * (1 - Math.exp(-1 / TAU.base)))) < 0.06);
    assert.ok(s.today.balance < 0, "recent above base = negative balance");
});

test("rest days count as zero and pull recent down faster than base", () => {
    const doses = steady("2026-01-01", 120, 70);
    const s = loadState(doses, addDays("2026-01-01", 129));   // 10 days off at the end
    assert.ok(s.today.recent < s.today.base);
    assert.ok(s.today.balance > 0);
    assert.equal(dailyDoses(doses, addDays("2026-01-01", 129)).length, 130);
});

test("percentile vs the athlete's own year, and observational words (never 'safe')", () => {
    const doses = [...steady("2025-06-01", 400, 50), ...steady("2026-07-06", 14, 120)];
    const s = loadState(doses, "2026-07-19");
    assert.ok(s.today.percentile >= 95, String(s.today.percentile));
    assert.match(recentWords(s.today.percentile), /top 5%/);
    assert.match(recentWords(50), /usual/);
    assert.match(recentWords(10), /lowest 20%/);
    for (const p of [0, 15, 30, 50, 70, 90, 99]) assert.doesNotMatch(recentWords(p), /safe|risk|danger/i);
    assert.equal(loadState(steady("2026-07-01", 10, 50), "2026-07-10").today.percentile, null, "under 4 weeks of history says nothing");
});

test("domain bases follow the domain doses", () => {
    const doses = Array.from({ length: 120 }, (_, i) => dose(addDays("2026-01-01", i), 80, { domains: { easy: 50, threshold: 20, hard: 10 } }));
    const s = loadState(doses, addDays("2026-01-01", 119));
    assert.ok(Math.abs(s.today.domains.easy - 50) < 0.5 && Math.abs(s.today.domains.threshold - 20) < 0.5 && Math.abs(s.today.domains.hard - 10) < 0.5);
});

test("weeks: Monday to Sunday totals, monotony and strain; a partial current week has none", () => {
    const doses = [];
    for (let i = 0; i < 28; i++) { const d = addDays("2026-09-07", i); const dow = i % 7; if (dow !== 0) doses.push(dose(d, dow === 6 ? 150 : 60, { miles: dow === 6 ? 16 : 6, long: dow === 6 })); }
    const s = loadState(doses, "2026-10-01");
    const w = s.weeks.at(-1);
    assert.equal(w.start, "2026-09-28");
    assert.ok(w.current && w.daysIn === 4 && w.monotony === null);
    const full = s.weeks.find(x => x.start === "2026-09-21");
    assert.equal(full.total, 60 * 5 + 150);
    assert.equal(full.miles, 46);
    assert.ok(full.monotony > 0 && full.strain === Math.round(full.total * full.monotony));
    assert.equal(s.longRuns.count, 3);
    assert.equal(s.longRuns.longest, 16);
    assert.equal(weeklyTotals([], "2026-10-01").length, 16);
});

test("nothing logged: an empty state, not an error", () => {
    const s = loadState([{ date: "2026-10-01", dose: null, domains: {} }], "2026-10-04");
    assert.equal(s.today, null);
    assert.deepEqual(s.series, []);
});
