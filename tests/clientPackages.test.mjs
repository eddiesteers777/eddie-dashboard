import test from "node:test";
import assert from "node:assert/strict";
import { getPackage, isFiniteSessionPackage } from "../js/packageCatalog.js";
import { PACKAGE_STATUSES, PAYMENT_STATUSES, packageRemainingSessions, packageCatalogOptions, countCompletedPackageSessions, packageDateInWindow, packageCanConsumeSession, isStripeManagedPackage } from "../js/clientPackageModel.js";

test("package statuses stay explicit and finite", () => {
    assert.deepEqual(PACKAGE_STATUSES, ["active", "paused", "completed", "cancelled"]);
});

test("manual payment statuses stay explicit", () => {
    assert.deepEqual(PAYMENT_STATUSES, ["pending", "paid", "past_due", "comped"]);
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

test("package usage counts only completed linked sessions", () => {
    const sessions = [
        { log: { status: "completed", packageAssignmentId: "p1" } },
        { log: { status: "completed", packageAssignmentId: "p1" } },
        { log: { status: "no-show", packageAssignmentId: "p1" } },
        { log: { status: "completed", packageAssignmentId: "p2" } },
        { log: { status: "completed" } }
    ];
    assert.equal(countCompletedPackageSessions("p1", sessions), 2);
    assert.equal(countCompletedPackageSessions("p2", sessions), 1);
    assert.equal(countCompletedPackageSessions("p3", sessions), 0);
});

test("package credit eligibility respects status, dates and derived remaining credits", () => {
    const pkg = { status: "active", sessionAllowance: 5, startsAt: "2026-10-01", endsAt: "2026-10-31" };
    assert.equal(packageDateInWindow(pkg, "2026-10-01"), true);
    assert.equal(packageDateInWindow(pkg, "2026-11-01"), false);
    assert.equal(packageCanConsumeSession(pkg, "2026-09-30", 0), false);
    assert.equal(packageCanConsumeSession(pkg, "2026-10-15", 4), true);
    assert.equal(packageCanConsumeSession(pkg, "2026-10-15", 5), false);
    assert.equal(packageCanConsumeSession({ ...pkg, status: "paused" }, "2026-10-15", 0), false);
});
test("Stripe-managed packages are identified by server-owned Stripe fields", () => {
    assert.equal(isStripeManagedPackage({}), false);
    assert.equal(isStripeManagedPackage({ stripeCheckoutSessionId: "cs_123" }), true);
    assert.equal(isStripeManagedPackage({ stripeSubscriptionId: "sub_123" }), true);
    assert.equal(isStripeManagedPackage({ stripeCustomerId: "cus_123" }), true);
    assert.equal(isStripeManagedPackage({ stripeSubscriptionId: "  " }), false);
});
