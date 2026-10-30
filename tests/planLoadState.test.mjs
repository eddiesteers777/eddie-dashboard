import { test } from "node:test";
import assert from "node:assert/strict";
import { within, planView } from "../js/planLoadState.js";

test("within: passes a fast answer through", async () => {
    assert.equal(await within(Promise.resolve(7), 50), 7);
});

test("within: a read that never answers fails instead of hanging", async () => {
    await assert.rejects(within(new Promise(() => {}), 20), /timed out/);
});

test("within: a failed read stays failed", async () => {
    await assert.rejects(within(Promise.reject(new Error("permission-denied")), 50), /permission-denied/);
});

test("planView: a plan on the device always shows, even if reads failed", () => {
    assert.equal(planView({ hasContent: true, headers: null, coaches: null }), "plan");
});

test("planView: a failed read is never shown as an empty plan", () => {
    assert.equal(planView({ hasContent: false, headers: null, coaches: [] }), "failed");
    assert.equal(planView({ hasContent: false, headers: [], coaches: null }), "failed");
    assert.equal(planView({ hasContent: false, headers: null, coaches: null }), "failed");
});

test("planView: empty only when both reads answered", () => {
    assert.equal(planView({ hasContent: false, headers: [], coaches: [{ coachUid: "c" }] }), "empty-coach");
    assert.equal(planView({ hasContent: false, headers: [], coaches: [] }), "empty-unlinked");
});

test("planView: a published plan not on the device yet is arriving, not empty", () => {
    assert.equal(planView({ hasContent: false, headers: [{ status: "active" }], coaches: null }), "arriving");
    assert.equal(planView({ hasContent: false, headers: [{ status: "archived" }], coaches: [] }), "empty-unlinked");
});
