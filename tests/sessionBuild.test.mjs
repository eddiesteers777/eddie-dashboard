import test from "node:test";
import assert from "node:assert/strict";
import { cleanTemplate, validTemplate, linesFromParts, notesFromParts, partsFromLines, totalMins, sessionMinutes, lastPlanFor, sessionGroups, findGroup, cleanParts, blankParts } from "../js/sessionBuild.js";
import { cleanPlan, parseLine } from "../js/sessionPlanModel.js";

const parts = [
    { kind: "Warm-up", name: "Rondo 4v1", mins: 10, note: "Two touch max." },
    { kind: "Technical", name: "Wall passes | weak foot", mins: "15", note: "" },
    { kind: "Nope", name: "3v3 to small goals", mins: 25, note: "2 points\nfor a clean first touch" },
    { kind: "Cool-down", name: "", mins: 10, note: "dropped: no name" }
];

test("parts become timed lines players can read, and survive the plan cleaner", () => {
    const lines = linesFromParts(parts, "16:00");
    assert.deepEqual(lines, ["4:00 PM|Warm-up · Rondo 4v1|10 min", "4:10 PM|Technical · Wall passes weak foot|15 min", "4:25 PM|3v3 to small goals|25 min"]);
    assert.deepEqual(cleanPlan({ key: "s1", date: "2026-11-17", title: "x", lines }).lines, lines);
    assert.equal(parseLine(lines[0]).name, "Warm-up · Rondo 4v1");
});

test("notes stay apart from the lines and line up with them", () => {
    const notes = notesFromParts(parts);
    assert.equal(notes.length, 3);
    assert.equal(notes[0], "Two touch max.");
    assert.ok(!linesFromParts(parts, "16:00").join("").includes("Two touch"));
});

test("round trip: lines + notes back to the same parts", () => {
    const back = partsFromLines(linesFromParts(parts, "16:00"), notesFromParts(parts));
    assert.deepEqual(back, cleanParts(parts));
    assert.deepEqual(partsFromLines(["6:00 PM|Old drill|8 min"])[0], { kind: "Other", name: "Old drill", mins: 8, note: "" });
});

test("minutes, last week's plan, groups", () => {
    assert.equal(totalMins(parts), 50);
    assert.equal(sessionMinutes("16:00", "17:00"), 60);
    assert.equal(sessionMinutes("", "17:00"), 0);
    assert.equal(blankParts().length, 4);
    const plans = [{ key: "s1", date: "2026-11-03", lines: ["a|b|c"] }, { key: "s1", date: "2026-11-10", lines: ["a|b|c"] }, { key: "s1", date: "2026-11-17", lines: ["a|b|c"] }, { key: "s2", date: "2026-11-12", lines: ["a|b|c"] }, { key: "s1", date: "2026-11-11", lines: [] }];
    assert.equal(lastPlanFor(plans, "s1", "2026-11-17").date, "2026-11-10");
    assert.equal(lastPlanFor(plans, "s9", "2026-11-17"), null);
    const groups = sessionGroups([
        { bookingId: "b1", slotId: "s1", date: "2026-11-17", startTime: "16:00", clientUid: "a", clientName: "Ava" },
        { bookingId: "b2", slotId: "s1", date: "2026-11-17", startTime: "16:00", clientUid: "j", clientName: "Jordan" },
        { bookingId: "b3", slotId: "", date: "2026-11-19", startTime: "17:00", clientUid: "a", clientName: "Ava" },
        { bookingId: "b4", slotId: "s1", date: "2026-11-17", startTime: "16:00", clientUid: "x", log: { status: "cancelled" } }
    ]);
    assert.equal(groups.length, 2);
    assert.equal(findGroup(groups, "s1", "2026-11-17").players.length, 2);
    assert.equal(findGroup(groups, "b3", "2026-11-19").players[0].name, "Ava");
});

test("templates keep parts with their notes and need a name and a part", () => {
    const t = cleanTemplate({ name: "  First touch night ", focus: "x", parts: [{ kind: "Warm-up", name: "Rondo", mins: 10, note: "private" }, { name: "" }] });
    assert.equal(t.name, "First touch night"); assert.equal(t.parts.length, 1); assert.equal(t.parts[0].note, "private");
    assert.equal(validTemplate(t), "");
    assert.match(validTemplate(cleanTemplate({ parts: t.parts })), /name/);
    assert.match(validTemplate(cleanTemplate({ name: "x" })), /part/);
});
