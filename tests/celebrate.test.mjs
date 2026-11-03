// Unit tests for what the completion moments say (js/celebrate.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { celebrationFor, runSummaryFor, weekRunProgress, daySummaryFor, tickSummaryFor, countParts, celebrateEmojiSrc, celebrateRun, celebrateHabit, titleWords, weekDots } from "../js/celebrate.js";

test("a run shows its miles; other workouts say what they were", () => {
    assert.deepEqual(celebrationFor({ kind: "run", title: "Easy run", miles: 5 }), { kicker: "Run complete", title: "Easy run", detail: "5 mi" });
    assert.equal(celebrationFor({ kind: "run", miles: 6.25 }).detail, "6.3 mi");
    assert.equal(celebrationFor({ kind: "run", miles: 0 }).detail, "", "no miles, no detail");
    assert.equal(celebrationFor({ kind: "strength", title: "Lower body", miles: 3 }).detail, "", "miles only on runs");
    assert.equal(celebrationFor({ kind: "strength" }).kicker, "Strength complete");
    assert.equal(celebrationFor({ kind: "other" }).kicker, "Workout complete");
});

test("a long title is cut to fit the screen", () => {
    const { title } = celebrationFor({ title: "Long run with marathon pace finish and strides" });
    assert.ok(title.length <= 26 && title.endsWith("…"));
});

test("the run summary shows miles, time and pace from the run's own numbers", () => {
    const m = runSummaryFor({ kind: "run", title: "Easy 6", miles: 6.2, durationSec: 3134 });
    assert.deepEqual(m.stats.map(s => s.label), ["miles", "time", "per mile"]);
    assert.equal(m.stats[0].value, "6.2");
    assert.equal(m.stats[1].value, "52:14");
    assert.equal(m.stats[2].value, "8:25", "3134 s over 6.2 mi");
    assert.equal(runSummaryFor({ kind: "run", miles: 4, durationSec: 4 * 3600 + 5 }).stats[1].value, "4:00:05");
});

test("the summary only shows what it knows: no time, no pace; no miles, no stats", () => {
    assert.deepEqual(runSummaryFor({ kind: "run", miles: 5 }).stats, [{ value: "5", label: "miles" }]);
    assert.deepEqual(runSummaryFor({ kind: "run" }).stats, []);
    assert.deepEqual(runSummaryFor({ kind: "strength", title: "Lower", miles: 3, durationSec: 2400 }).stats.map(s => s.label), ["time"], "no miles or pace on strength");
});

test("the week strip says run N of M and never starts at zero", () => {
    const w = runSummaryFor({ kind: "run", miles: 6, week: { runsDone: 3, runsPlanned: 4, milesDone: 18.2, milesPlanned: 24 } }).week;
    assert.deepEqual(w.segments, ["on", "on", "now", ""]);
    assert.equal(w.left, "Run 3 of 4");
    assert.equal(w.right, "18.2 of 24 mi");
    assert.equal(w.line, "1 to go this week.");
    const first = runSummaryFor({ kind: "run", week: { runsDone: 0, runsPlanned: 3, milesDone: 0, milesPlanned: 12 } }).week;
    assert.deepEqual(first.segments, ["now", "", ""], "the run just finished already counts");
    assert.equal(runSummaryFor({ kind: "run", week: { runsDone: 4, runsPlanned: 4, milesDone: 24, milesPlanned: 24 } }).week.line, "That's every run this week.");
    assert.equal(runSummaryFor({ kind: "run", week: null }).week, null, "no plan, no strip");
    assert.equal(runSummaryFor({ kind: "strength", week: { runsDone: 1, runsPlanned: 4 } }).week, null, "the strip counts runs only");
});

test("weekRunProgress counts planned runs and the ones done, not logs or strength", () => {
    const run = (done, miles, type = "plan") => ({ kind: "run", done, miles, source: { type } });
    const week = { days: [
        { items: [run(true, 6)] }, { items: [{ kind: "strength", done: true, miles: 0, source: {} }] },
        { items: [run(false, 8)] }, { items: [run(true, 3.1, "log")] }, { items: [run(false, 10)] }
    ] };
    assert.deepEqual(weekRunProgress(week), { runsDone: 1, runsPlanned: 3, milesDone: 6, milesPlanned: 24 });
    assert.equal(weekRunProgress({ days: [{ items: [] }] }), null);
    assert.equal(weekRunProgress(null), null);
});

test("saved offline says so in plain words; online says nothing", () => {
    assert.match(runSummaryFor({ kind: "run", offline: true }).note, /Saved on this phone.*back online/);
    assert.equal(runSummaryFor({ kind: "run" }).note, "");
});

test("the next step is only offered when the caller has one", () => {
    assert.equal(runSummaryFor({ kind: "run", next: "How did it feel?" }).next, "How did it feel?");
    assert.equal(runSummaryFor({ kind: "run" }).next, "");
});

test("the day's last habit says Day complete with its count and streak", () => {
    const m = daySummaryFor({ noun: "Habit", count: 6, streak: 12 });
    assert.deepEqual([m.kicker, m.title], ["Day complete", "All 6 done"]);
    assert.deepEqual(m.stats, [{ value: "6/6", label: "habits" }, { value: "12", label: "day streak" }]);
    assert.deepEqual(daySummaryFor({ noun: "Task", count: 5, streak: 1 }).stats, [{ value: "5/5", label: "tasks" }], "a 1-day streak isn't shown");
    assert.equal(daySummaryFor().title, "All done");
});

test("only numbers that read as miles, a clock or a whole count can count up", () => {
    assert.deepEqual(countParts("6.2"), { kind: "dec", a: 6, b: 2 });
    assert.deepEqual(countParts("52:14"), { kind: "clk", a: 52, b: 14 });
    assert.deepEqual(countParts("8:05"), { kind: "clk", a: 8, b: 5 });
    assert.deepEqual(countParts("12"), { kind: "int", a: 12, b: 0 });
    for (const v of ["4:00:05", "5/5", "96%", "", "x", null]) assert.equal(countParts(v), null, `"${v}" shows as written`);
});

test("every emoji the moments use exists in the light-blue set", () => {
    for (const id of ["finish", "pr", "great_work", "high_five", "long_run", "strong", "hydrate", "sleep", "big_effort"]) {
        assert.ok(existsSync(new URL(`../${celebrateEmojiSrc(id)}`, import.meta.url)), `${celebrateEmojiSrc(id)} is missing (run node scripts/build-emoji.mjs)`);
    }
});

test("without a page it does nothing and still resolves; an ordinary habit tick shows nothing", async () => {
    await celebrateRun({ kind: "run" });
    await celebrateHabit({ name: "Water" });
    await celebrateHabit({ name: "Water" }, { allDone: true });
});

test("tickSummaryFor: the habit's name and how many are done today", () => {
    const m = tickSummaryFor({ name: "Walk 20 min", done: 3, count: 5 });
    assert.equal(m.kicker, "Habit done");
    assert.equal(m.title, "Walk 20 min");
    assert.deepEqual(m.stats, [{ value: "3/5", label: "done today" }]);
    assert.equal(tickSummaryFor({ name: "x".repeat(40) }).title.length, 30, "one long word is cut");
    assert.equal(tickSummaryFor({ name: "Call grandma every Sunday night after dinner" }).title, "Call grandma every Sunday…", "ends at a word");
    assert.deepEqual(tickSummaryFor({ name: "A", done: 0, count: 0 }).stats, []);
});

test("titleWords keeps words whole and drops emojis from custom habit names", () => {
    assert.deepEqual(titleWords("🧘 Stretch / Mobility").map(w => w.join("")), ["Stretch", "/", "Mobility"]);
    assert.deepEqual(titleWords("Training Complete").map(w => w.length), [8, 8]);
    assert.deepEqual(titleWords("👨‍👩‍👧 Family time ❤️").map(w => w.join("")), ["Family", "time"]);
    assert.deepEqual(titleWords("  "), []);
    assert.deepEqual(titleWords("Café"), [["C", "a", "f", "é"]]);
});

test("weekDots: the last seven days, oldest first, today last and done", () => {
    const done = new Set(["2026-11-01", "2026-10-31", "2026-10-28"]);
    const d = weekDots("2026-11-02", k => done.has(k));
    assert.equal(d.length, 7);
    assert.equal(d[0].key, "2026-10-27");
    assert.equal(d[6].key, "2026-11-02");
    assert.ok(d[6].today && d[6].done);
    assert.deepEqual(d.map(x => x.done), [false, true, false, false, true, true, true]);
    assert.equal(d[6].letter, "M", "Nov 2 2026 is a Monday");
    assert.deepEqual(weekDots("2026-03-01", () => true).map(x => x.key).slice(0, 2), ["2026-02-23", "2026-02-24"], "crosses a month");
});
