import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PACKAGE_CATALOG } from "../js/packageCatalog.js";
import {
    STRIPE_PACKAGE_IDS,
    checkoutModeForPackage,
    priceIdForPackage,
    stripeMetadata,
    paymentStatusForSubscriptionStatus,
    lifecycleUpdateForSubscriptionEvent,
    validateStripeConfig
} from "../functions/billingModel.js";

const functionsSource = readFileSync(new URL("../functions/index.js", import.meta.url), "utf8");

test("Stripe package IDs stay aligned with the canonical package catalog", () => {
    assert.deepEqual(STRIPE_PACKAGE_IDS, PACKAGE_CATALOG.map(pkg => pkg.id));
});

test("subscription packages use subscription Checkout mode", () => {
    assert.equal(checkoutModeForPackage({ billingModel: "subscription" }), "subscription");
});

test("one-time and session-pack packages use payment Checkout mode", () => {
    assert.equal(checkoutModeForPackage({ billingModel: "single" }), "payment");
    assert.equal(checkoutModeForPackage({ billingModel: "session_pack" }), "payment");
});

test("unsupported billing models return no Checkout mode", () => {
    assert.equal(checkoutModeForPackage({ billingModel: "unknown" }), null);
});

test("Stripe price IDs are validated against the known package catalog", () => {
    assert.equal(
        priceIdForPackage("online_monthly", { prices: { online_monthly: "price_123" } }),
        "price_123"
    );
    assert.equal(priceIdForPackage("not_a_package", { prices: {} }), null);
    assert.equal(
        priceIdForPackage("online_monthly", { prices: { online_monthly: "not-a-price" } }),
        null
    );
});

test("Stripe metadata always identifies the Southbound client and package assignment", () => {
    assert.deepEqual(
        stripeMetadata({
            clientUid: "client-123",
            packageAssignmentId: "assignment-456",
            packageId: "online_monthly"
        }),
        {
            clientUid: "client-123",
            packageAssignmentId: "assignment-456",
            packageId: "online_monthly"
        }
    );
});

test("Customer Portal is server-created and returns to Southbound Settings", () => {
    assert.match(functionsSource, /createStripeCustomerPortalSession/);
    assert.match(functionsSource, /stripe\.billingPortal\.sessions\.create\(/);
    assert.match(functionsSource, /return_url: origin \+ '\/settings\.html'/);
});

test("subscription billing statuses map safely to Southbound payment state", () => {
    assert.equal(paymentStatusForSubscriptionStatus("active"), "paid");
    assert.equal(paymentStatusForSubscriptionStatus("trialing"), "paid");
    assert.equal(paymentStatusForSubscriptionStatus("past_due"), "past_due");
    assert.equal(paymentStatusForSubscriptionStatus("unpaid"), "past_due");
    assert.equal(paymentStatusForSubscriptionStatus("incomplete"), "pending");
    assert.equal(paymentStatusForSubscriptionStatus("incomplete_expired"), "pending");
    assert.equal(paymentStatusForSubscriptionStatus("paused"), null);
});

test("subscription deletion ends the linked package, while ordinary updates only change billing state", () => {
    assert.deepEqual(
        lifecycleUpdateForSubscriptionEvent("customer.subscription.deleted", "canceled"),
        { status: "cancelled" }
    );
    assert.deepEqual(
        lifecycleUpdateForSubscriptionEvent("customer.subscription.updated", "past_due"),
        { paymentStatus: "past_due" }
    );
    assert.deepEqual(
        lifecycleUpdateForSubscriptionEvent("customer.subscription.updated", "active"),
        { paymentStatus: "paid" }
    );
});

test("Stripe configuration validator accepts a complete test-mode configuration", () => {
    const result = validateStripeConfig({
        secretKey: "sk_test_123456",
        webhookSecret: "whsec_123456",
        prices: Object.fromEntries(
            STRIPE_PACKAGE_IDS.map(id => [id, "price_" + id + "123"])
        )
    });
    assert.deepEqual(result, { ok: true });
});

test("Stripe configuration validator identifies the first missing required price", () => {
    const prices = Object.fromEntries(
        STRIPE_PACKAGE_IDS.map(id => [id, "price_" + id + "123"])
    );
    delete prices.online_monthly;
    assert.deepEqual(
        validateStripeConfig({
            secretKey: "sk_test_123456",
            webhookSecret: "whsec_123456",
            prices
        }),
        { ok: false, reason: "missing-price-online_monthly" }
    );
});
