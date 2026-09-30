import test from "node:test";
import assert from "node:assert/strict";
import { getPackage } from "../js/packageCatalog.js";
import { countCompletedPackageSessions, packageRemainingSessions } from "../js/clientPackageModel.js";

test("client package usage is derived from completed session logs", () => {
    const pkg = getPackage("soccer_1on1_5");
    const logs = [
        { log: { status: "completed", packageAssignmentId: "p1" } },
        { log: { status: "completed", packageAssignmentId: "p1" } },
        { log: { status: "no-show", packageAssignmentId: "p1" } },
        { log: { status: "completed", packageAssignmentId: "p2" } }
    ];
    const used = countCompletedPackageSessions("p1", logs);
    assert.equal(used, 2);
    assert.equal(packageRemainingSessions({ ...pkg, id: "p1" }, used), 3);
});

test("a monthly package has no finite session counter", () => {
    const pkg = getPackage("online_monthly");
    assert.equal(packageRemainingSessions(pkg, 99), null);
});
