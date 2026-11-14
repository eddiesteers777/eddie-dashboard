import assert from "node:assert/strict";
import { test } from "node:test";
import { routeUploadArgs, sendRouteToCoros, sentLabel } from "../js/routeCoros.js";

const rec = { id: "a", name: "Saturday long loop", miles: 3.1, line: [[33.1, -86.7], [33.11, -86.71], [33.12, -86.72]] };

test("upload arguments match the COROS tool", () => {
    const a = routeUploadArgs(rec);
    assert.equal(a.routeType, 2);
    assert.match(a.fileName, /\.gpx$/);
    assert.equal(a.routeName, "Saturday long loop");
    assert.match(a.fileContent, /^<\?xml/);
    assert.equal((a.fileContent.match(/<trkpt /g) || []).length, 3);
    assert.deepEqual(Object.keys(a).sort(), ["fileContent", "fileName", "routeName", "routeType"]);
});
test("a long name is cut to 95 characters", () => {
    assert.equal(routeUploadArgs({ ...rec, name: "x".repeat(200) }).routeName.length, 95);
});
test("success returns the sent time; the tool is called once with the right name", async () => {
    const calls = [];
    const t = await sendRouteToCoros(rec, async (n, args) => { calls.push([n, args.routeType]); return { content: [{ type: "text", text: "ok" }] }; }, 123);
    assert.equal(t, 123);
    assert.deepEqual(calls, [["uploadRouteFile", 2]]);
});
test("a duplicate refusal becomes a plain message; other errors keep COROS's words", async () => {
    await assert.rejects(sendRouteToCoros(rec, async () => ({ isError: true, content: [{ type: "text", text: "Route already imported" }] })), /Delete the old copy/);
    await assert.rejects(sendRouteToCoros(rec, async () => ({ isError: true, content: [{ type: "text", text: "Need two track points" }] })), /Need two track points/);
    await assert.rejects(sendRouteToCoros(rec, async () => { throw new Error("Reconnect COROS"); }), /Reconnect COROS/);
});
test("a route with no line is refused before any call", async () => {
    let called = false;
    await assert.rejects(sendRouteToCoros({ name: "x", line: [] }, async () => { called = true; }), /no line/);
    assert.equal(called, false);
});
test("sent label", () => { assert.equal(sentLabel(rec), "Not sent"); assert.equal(sentLabel({ corosSentAt: 1 }), "Sent to COROS"); });
