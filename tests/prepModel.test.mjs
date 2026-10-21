import test from "node:test";
import assert from "node:assert/strict";
import { prepSummary, suggestDrills } from "../js/prepModel.js";

const T = "2026-10-21";
const sessions = [
    { bookingId: "b1", date: "2026-10-14", startTime: "17:00", log: { status: "completed", workedOn: "Weak foot passing", nextTime: "Add pressure" } },
    { bookingId: "b1", date: "2026-10-22", startTime: "17:00", log: null },
    { bookingId: "b1", date: "2026-10-29", startTime: "17:00", log: null },
    { bookingId: "b1", date: "2026-10-07", startTime: "17:00", log: { status: "cancelled" } }
];
test("next is the soonest unlogged session; last is the latest completed one with its words", () => {
    const p = prepSummary({ sessions, homework: [], today: T });
    assert.equal(p.next.date, "2026-10-22");
    assert.equal(p.last.date, "2026-10-14");
    assert.match(p.last.words, /Weak foot passing/); assert.match(p.last.words, /Add pressure/);
});
test("nothing booked and nothing logged is fine", () => {
    const p = prepSummary({ today: T });
    assert.equal(p.next, null); assert.equal(p.last, null); assert.deepEqual(p.skills, []);
});
test("skills and behind come from open homework only", () => {
    const hw = [{ title: "Wall passes", skill: "Passing", status: "active" }, { title: "Juggling", skill: "Juggling", status: "archived" }, { title: "Cone weave", skill: "Dribbling", status: "active" }];
    const p = prepSummary({ homework: hw, today: T, standing: h => (h.title === "Cone weave" ? "behind" : "on-track") });
    assert.deepEqual(p.skills, ["Passing", "Dribbling"]); assert.deepEqual(p.behind, ["Cone weave"]);
});
const drills = [
    { name: "Wall passes", topic: "Passing", minPlayers: 1 }, { name: "Rondo", topic: "Possession", minPlayers: 5 },
    { name: "Cone weave", topic: "Dribbling", minPlayers: 1 }, { name: "Pass and move", topic: "Passing", minPlayers: 2 },
    { name: "Touch ladder", topic: "Receiving", minPlayers: 1 }, { name: "Dribble gates", topic: "Dribbling", minPlayers: 1 }
];
test("suggestions: solo-friendly, on their skills, mixed across topics, not already assigned", () => {
    const s = suggestDrills(drills, ["Passing", "Dribbling"], ["wall passes"], 3).map(d => d.name);
    assert.deepEqual(s, ["Pass and move", "Cone weave", "Dribble gates"]);
    assert.ok(!suggestDrills(drills, ["Passing"], []).some(d => d.minPlayers > 2));
    assert.ok(suggestDrills(drills, [], []).length > 0);
});
