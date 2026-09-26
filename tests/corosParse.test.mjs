// Unit tests for reading COROS replies (js/corosParse.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrapResult, findRecords, describeShape } from "../js/corosParse.js";

const run = { labelId: "a1", sportType: 100, distance: 8046, startTime: 1790000000 };
const asText = obj => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

test("finds the activity list wherever COROS puts it", () => {
    for (const reply of [
        asText({ activities: [run] }),
        asText({ records: [run] }),
        asText([run]),                                       // a bare list
        asText({ code: 0, data: { list: [run], total: 1 } }), // one level deeper
        asText({ result: { dataList: [run] } }),
        { structuredContent: { data: [run] } },
        { content: [{ type: "text", text: "LabelId: a1\nSportType: 100\nDistance: 8046" }] }
    ]) {
        const found = findRecords(unwrapResult(reply));
        assert.equal(found.length, 1, JSON.stringify(reply).slice(0, 80));
        assert.equal(String(found[0].labelid ?? found[0].labelId), "a1");
    }
});

test("an empty or unrelated reply is empty, not a crash", () => {
    assert.deepEqual(findRecords(unwrapResult(asText({ code: 0, data: { list: [], total: 0 } }))), []);
    assert.deepEqual(findRecords(unwrapResult({ content: [{ type: "text", text: "No records found." }] })), []);
    assert.deepEqual(findRecords(unwrapResult(asText({ user: { name: "x", units: [1, 2] } }))), []);
    assert.deepEqual(findRecords(null), []);
});

test("describes a reply's shape for the diagnostic", () => {
    assert.equal(describeShape({ code: 0, data: { list: [], total: 0 } }), "{code, data: {list: list[0], total}}");
    assert.equal(describeShape([run]), "list[1] of {labelId, sportType, distance, startTime}");
    assert.equal(describeShape({ text: "No records found for the selected period." }), '{text: text "No records found for the selected period."}');
});
