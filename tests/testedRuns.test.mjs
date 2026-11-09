import test from "node:test";
import assert from "node:assert/strict";
import { buildRun, rateRun, prefillFromPlan, upsertRun, removeRun, readRuns, runLine } from "../js/testedRuns.js";
import { mergeById, mergeSyncedValue } from "../js/syncMerge.js";

const good = (extra = {}) => ({ name: "Rome 21-miler", date: "2026-10-25", miles: 21, minutes: 162, carbs: 67, sodium: 640, fluid: 20, caffeine: 120, tempF: 58, stomach: "fine", energy: "strong", took: "all", ...extra });

test("ratings: only a clean run is Worked", () => {
    assert.equal(rateRun({ stomach: "fine", energy: "strong", took: "all" }), "worked");
    assert.equal(rateRun({ stomach: "fine", energy: "okay", took: "most" }), "worked");
    assert.equal(rateRun({ stomach: "off", energy: "strong", took: "all" }), "mostly");
    assert.equal(rateRun({ stomach: "fine", energy: "faded", took: "all" }), "mostly");
    assert.equal(rateRun({ stomach: "fine", energy: "strong", took: "half" }), "mostly");
    assert.equal(rateRun({ stomach: "bad", energy: "strong", took: "all" }), "didnt");
    assert.equal(rateRun({ stomach: "fine" }), null);
});

test("a run needs a name, date, distance, time, carbs and three answers", () => {
    assert.equal(buildRun(good()).ok, true);
    for (const bad of [{ name: " " }, { date: "Oct 25" }, { miles: 0 }, { minutes: "" }, { carbs: "" }, { carbs: 400 }, { stomach: "" }, { sodium: 99999 }]) {
        const r = buildRun(good(bad));
        assert.equal(r.ok, false, JSON.stringify(bad));
        assert.ok(r.problem.length > 5);
    }
});

test("0 g/hr is a real answer; blank optional numbers stay null", () => {
    const r = buildRun(good({ carbs: 0, sodium: "", fluid: "", caffeine: "", tempF: "" }));
    assert.equal(r.ok, true);
    assert.equal(r.run.taken.carbs, 0);
    assert.equal(r.run.taken.sodium, null);
    assert.equal(r.run.tempF, null);
});

test("the plan's number is kept beside what was taken; the rating is worked out", () => {
    const { run } = buildRun(good({ carbs: 68, planned: { carbs: 95, sodium: 800, fluid: 24 }, tweaks: ["salt", "nonsense", "salt"] }), { id: "t1", now: 5 });
    assert.deepEqual(run.planned, { carbs: 95, sodium: 800, fluid: 24 });
    assert.deepEqual(run.tweaks, ["salt"]);
    assert.equal(run.rating, "worked");
    assert.equal(run.updatedAt, 5);
    assert.equal(runLine(run), "Oct 25 · 21 mi · 68 g/hr (plan: 95)");
});

test("prefill reads a saved plan", () => {
    const p = prefillFromPlan({ id: 7, name: "Untitled Plan", date: "2026-11-04T10:00:00Z", mode: "race", duration: 185, carbsPerHour: 95, sodiumPerHour: 800, fluidPerHour: 24, session: { distance: 26.2, temperature: 45 } });
    assert.equal(p.name, "");
    assert.equal(p.kind, "race");
    assert.equal(p.miles, 26.2);
    assert.equal(p.minutes, 185);
    assert.equal(p.carbs, 95);
    assert.equal(p.planId, 7);
    assert.equal(prefillFromPlan({}).planned, null);
});

test("list helpers: newest first, upsert replaces, junk dropped", () => {
    const a = buildRun(good(), { id: "a", now: 1 }).run, b = buildRun(good({ date: "2026-11-07", name: "Indy" }), { id: "b", now: 2 }).run;
    let list = upsertRun(upsertRun([], a), b);
    assert.deepEqual(list.map(r => r.id), ["b", "a"]);
    list = upsertRun(list, { ...a, name: "Rome" });
    assert.equal(list.length, 2);
    assert.deepEqual(removeRun(list, "a").map(r => r.id), ["b"]);
    assert.equal(readRuns([null, { id: 1 }, a]).length, 1);
    assert.deepEqual(readRuns("x"), []);
});

test("sync: a run added on each phone survives; a delete sticks", () => {
    const a = buildRun(good(), { id: "a", now: 1 }).run, b = buildRun(good({ name: "Indy" }), { id: "b", now: 2 }).run;
    assert.equal(mergeById([a], [b], []).length, 2);
    assert.deepEqual(mergeById([], [a, b], [a, b]).map(r => r.id), []);
    const merged = JSON.parse(mergeSyncedValue("fueling-tested-runs", JSON.stringify([a]), JSON.stringify([b]), "[]").value);
    assert.equal(merged.length, 2);
});

import { testedRate, compareModel } from "../js/testedRuns.js";
const mk = (o, id) => buildRun(good(o), { id, now: 1 }).run;

test("tested rate: highest Worked rate on a run of an hour or more", () => {
    const runs = [mk({ carbs: 55 }, "a"), mk({ carbs: 67, date: "2026-11-01" }, "b"), mk({ carbs: 80, stomach: "off" }, "c"), mk({ carbs: 90, minutes: 40 }, "d")];
    assert.equal(testedRate(runs).carbs, 67);
    assert.equal(testedRate([mk({ stomach: "bad" }, "x")]), null);
    assert.equal(testedRate([]), null);
});

test("compare card: hidden when off or untested; warns past 10 g/hr; says which number is in use", () => {
    const runs = [mk({ carbs: 67 }, "a")];
    assert.equal(compareModel({ on: false, runs, calcCarbs: 95, current: 95 }), null);
    assert.equal(compareModel({ on: true, runs: [], calcCarbs: 95, current: 95 }), null);
    assert.equal(compareModel({ on: true, runs, calcCarbs: 0, current: 0 }), null);
    const m = compareModel({ on: true, runs, calcCarbs: 95, current: 95, race: true });
    assert.equal(m.gap, 28); assert.equal(m.applied, "calc"); assert.match(m.warn, /Race day is not the day/);
    assert.equal(compareModel({ on: true, runs, calcCarbs: 95, current: 67 }).applied, "tested");
    assert.equal(compareModel({ on: true, runs, calcCarbs: 95, current: 80 }).applied, "custom");
    assert.equal(compareModel({ on: true, runs, calcCarbs: 70, current: 70 }).warn, "");
    assert.match(compareModel({ on: true, runs, calcCarbs: 95, current: 95 }).warn, /long run first/);
});

test("step 3: a Worked newest run earns +10, capped below the calculator; so-so and bad runs hold", () => {
    const old = mk({ carbs: 55, date: "2026-10-11" }, "a"), rome = mk({ carbs: 67, date: "2026-10-25" }, "b");
    const m = compareModel({ on: true, runs: [old, rome], calcCarbs: 95, current: 95 });
    assert.equal(m.next.carbs, 77);
    assert.deepEqual(m.ladder.map(r => [r.kind, r.carbs]), [["done", 55], ["done", 67], ["next", 77], ["calc", 95]]);
    assert.equal(compareModel({ on: true, runs: [old, rome], calcCarbs: 95, current: 77 }).applied, "next");
    assert.equal(compareModel({ on: true, runs: [rome], calcCarbs: 75, current: 75 }).next, null, "within one step of the calculator");
    const so = mk({ carbs: 72, stomach: "off", date: "2026-11-01" }, "c");
    const h = compareModel({ on: true, runs: [old, rome, so], calcCarbs: 95, current: 95 });
    assert.equal(h.next, null); assert.match(h.hold, /Hold at 67/);
    const bad = mk({ carbs: 80, stomach: "bad", date: "2026-11-02" }, "d");
    assert.match(compareModel({ on: true, runs: [rome, bad], calcCarbs: 95, current: 95 }).hold, /Stay at 67/);
    const lower = mk({ carbs: 50, date: "2026-11-03" }, "e");
    assert.equal(compareModel({ on: true, runs: [rome, lower], calcCarbs: 95, current: 95 }).next, null, "a clean run below the best earns no step");
});

test("step 4: the tested rate carries the setup that worked", () => {
    const r = mk({ carbs: 67, setup: "3 bottles, 10.4%, handoff at mile 10" }, "s");
    assert.equal(testedRate([r]).setup, "3 bottles, 10.4%, handoff at mile 10");
    assert.equal(compareModel({ on: true, runs: [r], calcCarbs: 95, current: 95 }).tested.setup, r.setup);
    assert.equal(testedRate([mk({ carbs: 60 }, "n")]).setup, "");
});
