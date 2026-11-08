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
