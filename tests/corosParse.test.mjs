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

test("text lists of runs, in the layouts COROS might write", () => {
    const find = text => findRecords(unwrapResult({ content: [{ type: "text", text }] }));
    const bullets = "Here are your runs:\n- LabelId: a1\n  SportType: 100\n  Distance: 8.1 km\n- LabelId: a2\n  SportType: 100\n  Distance: 5.0 km\n- LabelId: a3\n  SportType: 101\n  Distance: 6.4 km";
    assert.deepEqual(find(bullets).map(r => r.labelid), ["a1", "a2", "a3"]);
    const numbered = "1. **Start Time**: 2026-09-21 07:02\n   **Distance**: 8.05 km\n   **Sport Type**: Run\n\n2. **Start Time**: 2026-09-22 06:55\n   **Distance**: 10.2 km\n   **Sport Type**: Run";
    assert.deepEqual(find(numbered).map(r => r.distance), ["8.05 km", "10.2 km"]);
    const oneLine = "LabelId: b1, Sport Type: 100, Distance: 8046\nLabelId: b2, Sport Type: 100, Distance: 5000";
    assert.deepEqual(find(oneLine).map(r => r.labelid), ["b1", "b2"]);
    const table = "| Date | Sport Type | Distance | Duration |\n|---|---|---|---|\n| 2026-09-21 | Run | 8.0 km | 40:01 |\n| 2026-09-22 | Run | 5.0 km | 25:10 |";
    assert.deepEqual(find(table).map(r => r.date), ["2026-09-21", "2026-09-22"]);
    // A heading between runs starts a new one; the original LabelId blocks still work.
    const headed = "### Run 1\nStart Time: 2026-09-21\nDistance: 8 km\n### Run 2\nStart Time: 2026-09-22\nDistance: 5 km";
    assert.equal(find(headed).length, 2);
    assert.equal(find("LabelId: c1\nSportType: 100\nLabelId: c2\nSportType: 100").length, 2);
});
