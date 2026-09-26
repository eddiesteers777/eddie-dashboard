// Unit tests for reading COROS replies (js/corosParse.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrapResult, findRecords, describeShape, normalizeActivity, durationSeconds } from "../js/corosParse.js";

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

// COROS's real reply to querySportRecords (2026-09-26, coordinates rounded,
// three runs of nine): a JSON string inside the text item.
const REAL = [
    "Sport Records — 2026-09-20 to 2026-09-26 (3 records)",
    "========================",
    "",
    "1. Outdoor Run — 2026-09-26",
    "   Location: 19 mile long run",
    "   Start Coordinates: 33.47, -86.77",
    "   Time Window: startTimestamp=1790420165 | endTimestamp=1790429021",
    "   Duration: 2:24:52 | Distance: 30.61 km",
    "   Average Pace: 4:44 /km | Avg HR: 146 bpm | Calories: 2154 kcal",
    "   LabelId: 480614647400005733 | SportType: 100",
    "",
    "2. Outdoor Run — 2026-09-25",
    "   Location: Pelham Run",
    "   Start Coordinates: 33.27, -86.79",
    "   Time Window: startTimestamp=1790333485 | endTimestamp=1790334063",
    "   Duration: 2:36 | Distance: 679 m",
    "   Average Pace: 3:50 /km | Avg HR: 112 bpm | Calories: 31 kcal",
    "   LabelId: 480589151928877559 | SportType: 100",
    "",
    "3. Outdoor Run — 2026-09-24",
    "   Location: Pelham Run",
    "   Time Window: startTimestamp=1790243641 | endTimestamp=1790248422",
    "   Duration: 1:19:21 | Distance: 14.52 km",
    "   Average Pace: 5:28 /km | Avg HR: 134 bpm | Calories: 1033 kcal",
    "   LabelId: 480566167956652134 | SportType: 100"
].join("\n");

test("COROS's real run list: one record per run, every stat kept", () => {
    const reply = { content: [{ type: "text", text: JSON.stringify(REAL) }] };
    const runs = findRecords(unwrapResult(reply));
    assert.equal(runs.length, 3);
    assert.deepEqual(runs.map(r => r.labelid), ["480614647400005733", "480589151928877559", "480566167956652134"]);
    assert.equal(runs[0].title, "Outdoor Run");
    assert.equal(runs[0].location, "19 mile long run");
    assert.equal(runs[0].starttimestamp, "1790420165");
    assert.equal(runs[0].distance, "30.61 km");
    assert.equal(runs[0].avg_hr, "146 bpm");

    const r = normalizeActivity(runs[0]);
    assert.equal(r.labelId, "480614647400005733");
    assert.equal(r.sportType, 100);
    assert.equal(r.sport, "Outdoor Run");
    assert.equal(r.name, "19 mile long run");
    assert.equal(r.startTime, new Date(1790420165 * 1000).toISOString());
    assert.equal(r.distance, 30610);
    assert.equal(r.duration, 2 * 3600 + 24 * 60 + 52);
    assert.equal(r.pace_seconds_per_mile, Math.round(284 * 1.609344));
    assert.equal(r.avgHr, 146);
    assert.equal(r.calories, 2154);
    assert.equal((r.distance / 1609.344).toFixed(1), "19.0");
    assert.equal(normalizeActivity(runs[1]).distance, 679);
    assert.equal(normalizeActivity(runs[1]).duration, 156);
});

test("normalizing JSON records and odd values", () => {
    const j = normalizeActivity({ labelId: 7, sportType: "101", distance: 8046, totalTime: 2400, startTime: 1790000000 });
    assert.equal(j.labelId, "7");
    assert.equal(j.sportType, 101);
    assert.equal(j.startTime, new Date(1790000000 * 1000).toISOString());
    assert.equal(j.duration, 2400);
    assert.equal(j.pace_seconds_per_mile, Math.round(2400 / (8046 / 1609.344)));
    // A bare date stays on that day wherever the phone is.
    assert.equal(normalizeActivity({ date: "2026-09-21", distance: "5 mi" }).date, "2026-09-21");
    assert.equal(normalizeActivity({ startDate: "20260921", distance: "5 mi" }).distance, 8046.7);
    assert.equal(durationSeconds("45 min"), 2700);
    assert.equal(durationSeconds("1h 5m"), 3900);
    assert.equal(durationSeconds(""), null);
});
