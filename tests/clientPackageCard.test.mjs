import test from "node:test";
import assert from "node:assert/strict";
import { getPackage } from "../js/packageCatalog.js";
import { countCompletedPackageSessions, packageRemainingSessions, paymentAction, paymentActionType, ONLINE_PAYMENTS } from "../js/clientPackageModel.js";

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

test("no Pay button until online payments are switched on (they need Blaze + deployed functions)", () => {
    const owed = { status: "active", paymentStatus: "pending", billingModel: "session_pack" };
    assert.equal(ONLINE_PAYMENTS, false);
    assert.equal(paymentAction(owed), null, "a button now would only fail");
    assert.equal(paymentAction(owed, { online: true }), "Pay now");
    assert.equal(paymentAction({ ...owed, billingModel: "subscription" }, { online: true }), "Subscribe");
    assert.equal(paymentAction({ ...owed, paymentStatus: "past_due" }, { online: true }), "Retry payment");
    assert.equal(paymentAction({ ...owed, paymentStatus: "paid" }, { online: true }), null);
    assert.equal(paymentAction({ ...owed, status: "paused" }, { online: true }), null);
    const sub = { status: "active", paymentStatus: "past_due", billingModel: "subscription", stripeSubscriptionId: "sub_1" };
    assert.equal(paymentAction(sub, { online: true }), "Manage Billing");
    assert.equal(paymentActionType(sub), "portal");
    assert.equal(paymentActionType(owed), "checkout");
});
