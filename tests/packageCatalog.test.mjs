import test from "node:test";
import assert from "node:assert/strict";
import {
    PACKAGE_CATALOG,
    PACKAGE_IDS,
    getPackage,
    packageSessionLabel,
    isFiniteSessionPackage
} from "../js/packageCatalog.js";

test("package catalog ids are unique and stable", () => {
    assert.equal(PACKAGE_IDS.length, 6);
    assert.equal(new Set(PACKAGE_IDS).size, PACKAGE_IDS.length);
    assert.deepEqual(PACKAGE_IDS, [
        "online_monthly",
        "soccer_1on1_single",
        "soccer_1on1_5",
        "soccer_1on1_10",
        "soccer_group_drop_in",
        "soccer_group_monthly"
    ]);
});

test("all catalog prices remain unset until real pricing is decided", () => {
    assert.ok(PACKAGE_CATALOG.every(pkg => pkg.priceCents === null));
});

test("finite-session packages carry their real allowances", () => {
    assert.equal(getPackage("soccer_1on1_single").sessionAllowance, 1);
    assert.equal(getPackage("soccer_1on1_5").sessionAllowance, 5);
    assert.equal(getPackage("soccer_1on1_10").sessionAllowance, 10);
    assert.equal(getPackage("soccer_group_drop_in").sessionAllowance, 1);
    assert.equal(isFiniteSessionPackage(getPackage("soccer_1on1_10")), true);
    assert.equal(isFiniteSessionPackage(getPackage("online_monthly")), false);
});

test("catalog helper uses plain package-facing labels", () => {
    assert.equal(packageSessionLabel(getPackage("soccer_1on1_10")), "10 sessions");
    assert.equal(packageSessionLabel(getPackage("soccer_1on1_single")), "1 session");
    assert.equal(packageSessionLabel(getPackage("online_monthly")), "Monthly");
    assert.equal(packageSessionLabel(getPackage("soccer_group_monthly")), "Weekly");
    assert.equal(packageSessionLabel(null), "");
});

test("unknown package ids fail closed", () => {
    assert.equal(getPackage("does_not_exist"), null);
});