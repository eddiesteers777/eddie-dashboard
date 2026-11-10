import test from "node:test";
import assert from "node:assert/strict";
import { planRange, canRemove, removeCoachPlan, restoreCoachPlan, archiveByCoachPlanId } from "../js/coachPlanRemoval.js";

const entry = {
    id: "coach-ftI", coachPlanId: "ftI", source: "coach", status: "active", name: "Strength Phase",
    generatedPlan: { weeks: [{ startDate: "2026-11-16", endDate: "2026-11-22", days: [] }, { startDate: "2026-11-23", endDate: "2026-11-29", days: [] }] }
};
const other = { id: "coach-x", coachPlanId: "x", source: "coach", status: "active" };

test("range covers the whole plan", () => {
    assert.deepEqual(planRange(entry), { start: "2026-11-16", end: "2026-11-29" });
});
test("a coach account can always remove; a client only when the coach's plan is gone", () => {
    assert.equal(canRemove(entry, "coach"), true);
    assert.equal(canRemove(entry, "client"), false);
    assert.equal(canRemove({ ...entry, orphaned: true }, "client"), true);
    assert.equal(canRemove({ ...entry, source: "training-plan" }, "coach"), false);
});
test("remove and put back touch only that plan", () => {
    const removed = removeCoachPlan([entry, other], "coach-ftI", "2026-11-10T00:00:00Z");
    assert.equal(removed[0].status, "archived");
    assert.equal(removed[0].removedByClient, true);
    assert.equal(removed[1], other);
    const back = restoreCoachPlan(removed, "coach-ftI");
    assert.equal(back[0].status, "active");
    assert.equal(back[0].removedByClient, false);
});
test("unassign by the coach archives the matching copy", () => {
    const out = archiveByCoachPlanId([entry, other], "ftI", true);
    assert.equal(out[0].status, "archived");
    assert.equal(out[1].status, "active");
});
