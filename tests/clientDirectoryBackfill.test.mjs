import assert from "node:assert/strict";
import test from "node:test";
import { clientDirectoryFields, isActiveClientProfile } from "../functions/clientDirectoryModel.js";

test("accepts only active client profiles for directory backfill", () => {
    assert.equal(isActiveClientProfile({ role: "client", status: "active", isCoachApproved: false }), true);
    assert.equal(isActiveClientProfile({ role: "coach", status: "active", isCoachApproved: true }), false);
    assert.equal(isActiveClientProfile({ role: "client", status: "pending", isCoachApproved: false }), false);
    assert.equal(isActiveClientProfile({ role: "client", status: "archived", isCoachApproved: false }), false);
});

test("directory projection contains only minimal discovery fields", () => {
    const projected = clientDirectoryFields({
        uid: "client-1",
        role: "client",
        status: "active",
        isCoachApproved: false,
        displayName: "Cam Client",
        email: "client@example.com",
        services: ["running", "strength"],
        applicationMessage: "private application text",
        requestedServices: ["online_coaching"],
        secretField: "must not leak"
    });

    assert.deepEqual(projected, {
        uid: "client-1",
        displayName: "Cam Client",
        email: "client@example.com",
        services: ["running", "strength"],
        status: "active"
    });
});

test("invalid profiles do not produce a directory projection", () => {
    assert.equal(clientDirectoryFields({ role: "coach", status: "active" }), null);
});
