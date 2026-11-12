import test from "node:test";
import assert from "node:assert/strict";
import { planRange, canRemove, canDeleteCopy, deleteCoachCopy, editLinkFor, removeCoachPlan, restoreCoachPlan, archiveByCoachPlanId } from "../js/coachPlanRemoval.js";

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
test("a plan I published, even to myself, links to its editor; a stranger's does not", () => {
    const headers = [{ id: "ftI", clientUid: "me uid" }];
    assert.equal(editLinkFor(entry, headers), "client.html?uid=me%20uid&tab=plan&plan=ftI");
    assert.equal(editLinkFor(other, headers), "");
    assert.equal(editLinkFor(entry, null), "");
});
test("only an orphaned copy can be deleted from the list", () => {
    const orphan = { ...entry, orphaned: true };
    assert.equal(canDeleteCopy(orphan), true);
    assert.equal(canDeleteCopy(entry), false);
    assert.deepEqual(deleteCoachCopy([orphan, other], "coach-ftI").map(p => p.id), ["coach-x"]);
    assert.equal(deleteCoachCopy([entry, other], "coach-ftI").length, 2);
});
