// Unit tests for what the completion moments say (js/celebrate.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { celebrationFor, habitMoment, sceneFor, HABIT_LINES, celebrateRun, celebrateHabit } from "../js/celebrate.js";
import { HABIT_ICONS } from "../js/habitIconSet.js";

test("a run shows its miles; other workouts say what they were", () => {
    assert.deepEqual(celebrationFor({ kind: "run", title: "Easy run", miles: 5 }), { kicker: "Run complete", title: "Easy run", detail: "5 mi" });
    assert.equal(celebrationFor({ kind: "run", miles: 6.25 }).detail, "6.3 mi");
    assert.equal(celebrationFor({ kind: "run", miles: 0 }).detail, "", "no miles, no detail");
    assert.equal(celebrationFor({ kind: "strength", title: "Lower body", miles: 3 }).detail, "", "miles only on runs");
    assert.equal(celebrationFor({ kind: "strength" }).kicker, "Strength complete");
    assert.equal(celebrationFor({ kind: "other" }).kicker, "Workout complete");
});

test("a long title is cut to fit the sheet", () => {
    const { title } = celebrationFor({ title: "Long run with marathon pace finish and strides" });
    assert.ok(title.length <= 26 && title.endsWith("…"));
});

test("every drawn habit icon has its own line, so no habit gets a generic moment", () => {
    for (const { id } of HABIT_ICONS) assert.ok(HABIT_LINES[id], `no line for the "${id}" icon`);
    for (const id of Object.keys(HABIT_LINES)) assert.ok(HABIT_ICONS.some(i => i.id === id), `"${id}" is not a drawn icon`);
});

test("a habit's moment uses its own icon, name and a scene for its family", () => {
    const water = habitMoment({ id: "c4", name: "Water Goal", icon: "hb:water" });
    assert.deepEqual([water.iconId, water.scene, water.title, water.line, water.kicker], ["water", "water", "Water Goal", "Hydrated.", "Habit done"]);
    assert.equal(habitMoment({ name: "Training Complete", icon: "hb:run" }).scene, "stride");
    assert.equal(sceneFor("strength"), "impact");
    assert.equal(sceneFor("sleep"), "night");
    assert.equal(sceneFor("pray"), "light");
    assert.equal(sceneFor("protein"), "nourish");
    assert.equal(sceneFor("read"), "focus", "anything else gets the focus scene");
    // No saved icon: the name suggests one.
    assert.equal(habitMoment({ name: "Drink 100oz water" }).iconId, "water");
});

test("the day's last habit says Day complete; a leading emoji is dropped from the name", () => {
    const m = habitMoment({ name: "💧 Water", icon: "hb:water" }, { allDone: true });
    assert.equal(m.kicker, "Day complete");
    assert.equal(m.title, "Water");
});

test("without a page it does nothing and still resolves", async () => {
    await celebrateRun({ kind: "run" });
    await celebrateHabit({ name: "Water" });
});

test("a different noun changes the kicker and the all-done line (the 75-day tracker says Task)", () => {
    const m = habitMoment({ name: "Read 10 pages", icon: "hb:read" }, { noun: "Task" });
    assert.equal(m.kicker, "Task done");
    assert.equal(habitMoment({ name: "x", icon: "hb:read" }, { allDone: true, noun: "Task" }).line, "Every task, done.");
    assert.equal(habitMoment({ name: "x", icon: "hb:read" }, { allDone: true }).line, "Every habit, done.");
});
