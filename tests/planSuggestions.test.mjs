import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestions, weeksTo, reasonFrom } from "../js/planSuggestions.js";

const monday = "2026-11-02";
const dates = Array.from({ length: 7 }, (_, i) => `2026-11-0${2 + i}`.replace("2026-11-010", "2026-11-10"));
const wk = states => ({ days: dates.map((date, i) => ({ date, state: states[i] || "rest" })) });
const primary = raceDate => ({ state: "current", raceDate });

test("weeksTo counts weeks to the race date, null when none or passed", () => {
    assert.equal(weeksTo("2026-10-30", "2026-11-06"), 1);
    assert.equal(weeksTo("2026-10-30", ""), null);
    assert.equal(weeksTo("2026-10-30", "2026-10-01"), null);
});
test("nothing missed, or one or two: no suggestion", () => {
    assert.deepEqual(buildSuggestions({ week: wk(["done", "done", "upcoming"]), primary: primary("2026-12-07"), today: "2026-11-05" }), []);
    assert.deepEqual(buildSuggestions({ week: wk(["missed", "done", "upcoming"]), primary: primary("2026-12-07"), today: "2026-11-05" }), []);
});
test("three missed with 5 weeks to race: a rebuild suggestion, no make-up", () => {
    const s = buildSuggestions({ week: wk(["missed", "missed", "skipped", "upcoming"]), primary: primary("2026-12-07"), today: "2026-11-05" });
    assert.equal(s.length, 1);
    assert.equal(s[0].kind, "missed");
    assert.equal(s[0].recommendation, "REBUILD_TO_RACE_DATE");
    assert.match(s[0].text, /No make-up session/);
});
test("a skipped run counts with the missed ones", () => {
    const s = buildSuggestions({ week: wk(["skipped", "skipped", "skipped"]), primary: primary("2026-12-07"), today: "2026-11-05" });
    assert.equal(s[0].title, "3 sessions missed this week");
});
test("in a taper even one missed session is held, never rebuilt", () => {
    const s = buildSuggestions({ week: wk(["missed", "done", "upcoming"]), primary: primary("2026-11-09"), today: "2026-11-05" });
    assert.equal(s[0].kind, "held");
    assert.equal(s[0].recommendation, "PROTECT_TAPER");
    const sick = buildSuggestions({ week: wk(["missed", "done"]), primary: primary("2026-11-09"), today: "2026-11-05",
        results: [{ status: "skipped", date: "2026-11-02", note: "Skipped: Sick" }] });
    assert.equal(sick[0].recommendation, "PROTECT_TAPER_COACH_RACE_CALL");
});
test("reason comes from skipped runs this week only", () => {
    const r = [{ status: "skipped", date: "2026-11-03", note: "Skipped: Sore or hurting" }, { status: "skipped", date: "2026-10-01", note: "Sick" }];
    assert.equal(reasonFrom(r, "2026-11-02", "2026-11-08"), "injury");
    assert.equal(reasonFrom([], "2026-11-02", "2026-11-08"), "busy");
});
test("dismissed, finished and planless weeks show nothing", () => {
    const base = { week: wk(["missed", "missed", "missed"]), primary: primary("2026-12-07"), today: "2026-11-05" };
    assert.equal(buildSuggestions({ ...base, dismissed: [`missed:${monday}`] }).length, 0);
    assert.equal(buildSuggestions({ ...base, primary: { state: "finished" } }).length, 0);
    assert.equal(buildSuggestions({ ...base, primary: null }).length, 0);
    assert.equal(buildSuggestions({}).length, 0);
});

test("pace items ride along, can be dismissed, and show even with nothing missed", () => {
    const item = { id: "pace:tempo:405:2026-11-02", kind: "pace", tone: "call", title: "Tighten tempo pace by 3 s" };
    const base = { week: wk(["done", "done", "upcoming"]), primary: primary("2026-12-07"), today: "2026-11-05", paceItems: [item] };
    assert.equal(buildSuggestions(base).length, 1);
    assert.equal(buildSuggestions({ ...base, dismissed: [item.id] }).length, 0);
    const both = buildSuggestions({ ...base, week: wk(["missed", "missed", "missed"]) });
    assert.deepEqual(both.map(s => s.kind), ["missed", "pace"]);
});
