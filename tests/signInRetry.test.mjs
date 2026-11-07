import test from "node:test";
import assert from "node:assert/strict";
import { retryOnNetworkError } from "../js/signInRetry.js";

const net = () => Object.assign(new Error("net"), { code: "auth/network-request-failed" });
const noWait = { wait: async () => {} };

test("a dropped first request is tried again and then succeeds", async () => {
    let calls = 0, retries = 0;
    const out = await retryOnNetworkError(async () => { if (++calls < 3) throw net(); return "ok"; }, { ...noWait, onRetry: () => retries++ });
    assert.equal(out, "ok"); assert.equal(calls, 3); assert.equal(retries, 2);
});
test("it gives up after the last wait and rethrows the network error", async () => {
    let calls = 0;
    await assert.rejects(retryOnNetworkError(async () => { calls++; throw net(); }, noWait), { code: "auth/network-request-failed" });
    assert.equal(calls, 3);
});
test("other errors are not retried", async () => {
    let calls = 0;
    await assert.rejects(retryOnNetworkError(async () => { calls++; throw Object.assign(new Error("x"), { code: "auth/popup-blocked" }); }, noWait), { code: "auth/popup-blocked" });
    assert.equal(calls, 1);
});
