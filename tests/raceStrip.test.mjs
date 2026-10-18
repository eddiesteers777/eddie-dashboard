import { test } from "node:test";
import assert from "node:assert/strict";
import { raceStripModel, raceStripHtml } from "../js/raceStrip.js";

test("no race, no strip", () => {
    assert.equal(raceStripModel(null, { weekNumber: 3, totalWeeks: 12 }), null);
    assert.equal(raceStripModel({ date: "2026-11-22", days: -1 }, null), null);
    assert.equal(raceStripHtml(null), "");
});

test("days to go, and the block as one segment per week", () => {
    const m = raceStripModel({ date: "2026-11-22", days: 36 }, { weekNumber: 3, totalWeeks: 5 });
    assert.equal(m.big, "36");
    assert.equal(m.unit, "Days to go");
    assert.deepEqual(m.weeks, ["done", "done", "now", "next", "next"]);
    assert.equal(m.weekText, "Week 3 of 5");
    assert.match(m.caption, /^Race day · Sun,? Nov 22$/);
});

test("race day, tomorrow, and a plan we can't place in the block", () => {
    assert.equal(raceStripModel({ date: "2026-11-22", days: 0 }, null).big, "Today");
    const one = raceStripModel({ date: "2026-11-22", days: 1 }, null);
    assert.equal(one.unit, "Day to go");
    assert.deepEqual(one.weeks, [], "no plan position: just the number");
    assert.equal(one.weekText, "");
    assert.deepEqual(raceStripModel({ date: "2026-11-22", days: 9 }, { weekNumber: 1, totalWeeks: 80 }).weeks, [], "too long a block to draw");
});

test("the html is escaped and says the days out loud", () => {
    const html = raceStripHtml(raceStripModel({ date: "2026-11-22", days: 36 }, { weekNumber: 1, totalWeeks: 2 }));
    assert.match(html, /aria-label="36 days to race day"/);
    assert.match(html, /is-now/);
});
