import test from "node:test";
import assert from "node:assert/strict";
import { getPackage, isFiniteSessionPackage } from "../js/packageCatalog.js";
import {
    PACKAGE_STATUSES,
    packageRemainingSessions,
    packageCatalogOptions
} from "../js/clientPackageModel.js";
import { PACKAGE_STATUSES } from "../js/clientPackages.js";

test("package statuses stay explicit and finite", () => {
    assert.deepEqual(PACKAGE_STATUSES, ["active", "paused", "completed", "cancelled"]);
});

test("finite package allowance never goes below zero", () => {
    const pkg = getPackage("soccer_1on1_10");
    assert.equal(isFiniteSessionPackage(pkg), true);
    assert.equal(packageRemainingSessions(pkg, 0), 10);
    assert.equal(packageRemainingSessions(pkg, 4), 6);
    assert.equal(packageRemainingSessions(pkg, 11), 0);
});

test("unlimited packages return null remaining sessions", () => {
    const pkg = getPackage("online_monthly");
    assert.equal(isFiniteSessionPackage(pkg), false);
    assert.equal(packageRemainingSessions(pkg, 99), null);
});

test("catalog options mirror the active catalog", () => {
    const ids = packageCatalogOptions().map(x => x.id);
    assert.deepEqual(ids, [
        "online_monthly",
        "soccer_1on1_single",
        "soccer_1on1_5",
        "soccer_1on1_10",
        "soccer_group_drop_in",
        "soccer_group_monthly"
    ]);
});
