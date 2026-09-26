// Unit tests for reading COROS's tool list (js/corosTools.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortCorosTools, corosToolsSummary } from "../js/corosTools.js";

const READ_ONLY = [{ name: "querySportRecords" }, { name: "getActivityDetail" }, { name: "queryRecoveryStatus" }];

test("read-only connection: say so plainly", () => {
    assert.deepEqual(sortCorosTools(READ_ONLY), { read: ["getActivityDetail", "queryRecoveryStatus", "querySportRecords"], write: [], workout: [] });
    assert.deepEqual(corosToolsSummary(READ_ONLY), { status: "warn", text: "Reads: getActivityDetail, queryRecoveryStatus, querySportRecords. Read-only: nothing here can send a workout to the watch." });
});

test("a tool that could send workouts is called out", () => {
    const tools = [...READ_ONLY, { name: "createWorkout" }, { name: "setUnits" }];
    assert.deepEqual(sortCorosTools(tools).workout, ["createWorkout"]);
    const s = corosToolsSummary(tools);
    assert.equal(s.status, "pass");
    assert.match(s.text, /Could send workouts or plans: createWorkout\./);
});

test("other changes, nothing about workouts; nothing listed at all", () => {
    assert.match(corosToolsSummary([...READ_ONLY, { name: "setUnits" }]).text, /Can also change: setUnits \(nothing about workouts\)/);
    assert.equal(corosToolsSummary([]).status, "warn");
});

test("workout tool details: only workout / plan tools, with their fields", async () => {
    const { workoutToolDetails } = await import("../js/corosTools.js");
    const details = workoutToolDetails([
        { name: "querySportRecords", description: "runs" },
        { name: "createSingleWorkout", description: "Make a workout", inputSchema: { properties: { name: { type: "string" } } } },
        { name: "queryWorkoutLibrary" }
    ]);
    assert.deepEqual(details.map(d => d.name), ["createSingleWorkout", "queryWorkoutLibrary"]);
    assert.deepEqual(details[0].inputSchema, { properties: { name: { type: "string" } } });
    assert.equal(details[1].description, "");
});
