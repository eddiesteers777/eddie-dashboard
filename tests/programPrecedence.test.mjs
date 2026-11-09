import test from "node:test";
import assert from "node:assert/strict";
import { winningProgramId, overriddenProgramNames, coversDate } from "../js/programPrecedence.js";

const plan = (id, name, start, end, extra = {}) => ({
    id, name, ...extra,
    generatedPlan: { weeks: [{ startDate: start, endDate: end, days: [{ date: start, type: "easy", miles: 4 }] }] }
});
const old = plan("old", "Strength Phase", "2026-11-16", "2026-11-29");
const winter = plan("winter", "Winter Strength Building", "2026-11-23", "2027-01-04");

test("later-starting plan wins where both cover the date", () => {
    assert.equal(winningProgramId([old, winter], "2026-11-25"), "winter");
    assert.deepEqual(overriddenProgramNames([old, winter], "2026-11-25"), ["Strength Phase"]);
});
test("older plan returns where the winter plan does not reach", () => {
    assert.equal(winningProgramId([old, winter], "2026-11-18"), "old");
    assert.equal(coversDate(winter, "2026-11-18"), false);
});
test("order of the list does not matter, and no plan means null", () => {
    assert.equal(winningProgramId([winter, old], "2026-11-25"), "winter");
    assert.equal(winningProgramId([old, winter], "2030-01-01"), null);
});
test("same start: most recently updated wins", () => {
    const a = plan("a", "A", "2026-11-23", "2026-11-29", { updatedAt: "2026-11-01" });
    const b = plan("b", "B", "2026-11-23", "2026-11-29", { updatedAt: "2026-11-05" });
    assert.equal(winningProgramId([a, b], "2026-11-24"), "b");
});
