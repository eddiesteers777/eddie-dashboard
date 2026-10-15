// Unit tests for the week ridge on My Plan (js/weekRidge.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ridgeDays, weekRidgeHtml } from "../js/weekRidge.js";

// Monday 12 Oct 2026 to Sunday 18 Oct. Today is Thursday 15 Oct.
const day = (date, items = [], status = "upcoming", isToday = false) => ({ date, items, status, isToday });
const run = (miles, extra = {}) => ({ kind: "run", title: "Run", miles, source: { type: "plan" }, ...extra });
const week = {
    days: [
        day("2026-10-12", [run(4)], "done"),
        day("2026-10-13", [{ kind: "strength", title: "Full Body A", miles: 0, source: { type: "plan" } }], "done"),
        day("2026-10-14", []),
        day("2026-10-15", [run(6, { title: "Tempo run" })], "today", true),
        day("2026-10-16", []),
        day("2026-10-17", [run(10)]),
        day("2026-10-18", [run(3)]),
    ],
};

test("seven days, Monday first, with the date number and the day's planned miles", () => {
    const days = ridgeDays(week);
    assert.equal(days.length, 7);
    assert.deepEqual(days.map(d => d.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    assert.deepEqual(days.map(d => d.date), [12, 13, 14, 15, 16, 17, 18]);
    assert.deepEqual(days.map(d => d.miles), [4, 0, 0, 6, 0, 10, 3]);
});

test("the peak is as tall as the miles; a strength day is a low step; a rest day is the baseline", () => {
    const [mon, tue, wed, thu, , sat] = ridgeDays(week);
    assert.equal(mon.level, 4);
    assert.equal(tue.kind, "strength");
    assert.ok(tue.level > 0 && tue.level < 1, "a strength day is a low step, not a peak");
    assert.equal(wed.kind, "rest");
    assert.equal(wed.level, 0);
    assert.ok(sat.level > thu.level, "a 10 mile run is taller than a 6 mile run");
});

test("a logged run is what she did, not the plan: it does not add to the ridge", () => {
    const logged = { days: [day("2026-10-12", [run(4), { kind: "run", title: "Logged run", miles: 2, source: { type: "log" } }], "done")] };
    assert.equal(ridgeDays(logged)[0].miles, 4);
});

test("done days, today and the days to come are marked for the fill", () => {
    const status = ridgeDays(week).map(d => d.status);
    assert.deepEqual(status, ["done", "done", "upcoming", "today", "upcoming", "upcoming", "upcoming"]);
});

test("the picture is labelled for a screen reader and each day shows its miles under it", () => {
    const html = weekRidgeHtml(week, { id: "t" });
    assert.match(html, /<svg viewBox="0 0 700 170" role="img" aria-label="This week as a profile/);
    assert.match(html, /Thu 15: 6 mi run/);
    assert.match(html, /<b>Thu 15<\/b><em>6 mi<\/em>/);
    assert.match(html, /<span class="now"><b>Thu 15<\/b>/);
    assert.match(html, /<b>Wed 14<\/b><em>Rest<\/em>/);
    assert.ok(html.includes('id="t-clip"') && html.includes('url(#t-clip)'), "gradient and clip ids are per card");
});
