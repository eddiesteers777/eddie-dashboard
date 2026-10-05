// Unit tests for the COROS run helpers shared by Analytics and the quick check (js/corosRuns.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildArgs, supported } from "../js/corosRuns.js";

test("only the arguments COROS's tool takes, dates as YYYYMMDD", () => {
    const tool = { name: "querySportRecords", inputSchema: { properties: { startDate: {}, endDate: {}, sportTypeCodes: {}, limit: {} } } };
    const args = buildArgs(tool, new Date(2026, 9, 1, 12), new Date(2026, 9, 7, 12));
    assert.deepEqual(args, { startDate: "20261001", endDate: "20261007", sportTypeCodes: [100, 101, 102, 103], limit: 20 });
    assert.deepEqual(buildArgs({ inputSchema: {} }, new Date(), new Date()), {});
    assert.equal(supported({ properties: { a: 1 } }, "a"), true);
    assert.equal(supported(null, "a"), false);
});
