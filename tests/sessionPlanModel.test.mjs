import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/sessionPlanModel.js";

const drills = new Map([["d1", { name: "Rondo 4v1", minutes: 12 }], ["d2", { name: "Triangle passing", minutes: 15 }]]);
test("lines are timed from the session start and skip unknown drills", () => {
    const lines = M.linesFromPractice({ items: [{ drillId: "d1", minutes: 12 }, { drillId: "zz", minutes: 5 }, { drillId: "d2", minutes: 15 }] }, drills, "18:00");
    assert.deepEqual(lines, ["6:00 PM|Rondo 4v1|12 min", "6:12 PM|Triangle passing|15 min"]);
    assert.equal(M.totalMinutes(lines), 27);
    assert.deepEqual(M.parseLine(lines[0]), { time: "6:00 PM", name: "Rondo 4v1", mins: "12 min" });
});
test("keys: an open time shares one, a one-off booking uses its own id", () => {
    assert.equal(M.planKey({ slotId: "s1", bookingId: "b1" }), "s1");
    assert.equal(M.planKey({ bookingId: "b1" }), "b1");
    assert.equal(M.planId("c", "s1", "2026-10-22"), "c_s1_2026-10-22");
    assert.ok(M.planMatches({ key: "s1", date: "2026-10-22" }, { slotId: "s1", date: "2026-10-22" }));
    assert.ok(!M.planMatches({ key: "s1", date: "2026-10-22" }, { slotId: "s1", date: "2026-10-29" }));
});
test("focus mode keeps no drill lines; clean plan clamps everything", () => {
    const p = M.cleanPlan({ key: "s1", date: "2026-10-22", startTime: "18:00", title: "  Passing\n night ", mode: "focus", focus: "x".repeat(500), lines: ["a|b|c"], bring: "Ball", clientUids: ["u1", "u1", "u2", 5] });
    assert.equal(p.lines.length, 0); assert.equal(p.focus.length, 200); assert.equal(p.title, "Passing night"); assert.deepEqual(p.clientUids, ["u1", "u2"]);
    const q = M.cleanPlan({ key: "s1", date: "bad", title: "t", lines: Array(30).fill("a|b|1 min") });
    assert.equal(q.lines.length, M.MAX_LINES); assert.equal(q.date, "");
    assert.equal(M.validPlan(q), "Missing date.");
    assert.equal(M.validPlan({ ...q, date: "2026-10-22", lines: [] }), "Add a plan or a focus.");
    assert.equal(M.validPlan({ ...q, date: "2026-10-22" }), "");
});
test("clients of one open time on one date, and upcoming order", () => {
    const reqs = [{ id: "b1", slotId: "s1", status: "approved", dates: ["2026-10-22"], clientUid: "u1" }, { id: "b2", slotId: "s1", status: "approved", dates: ["2026-10-22", "2026-10-29"], clientUid: "u2" }, { id: "b3", slotId: "s1", status: "requested", dates: ["2026-10-22"], clientUid: "u3" }, { id: "b4", slotId: "s2", status: "approved", dates: ["2026-10-22"], clientUid: "u4" }];
    assert.deepEqual(M.clientsOf(reqs, "s1", "2026-10-22"), ["u1", "u2"]);
    assert.deepEqual(M.upcoming([{ date: "2026-10-30" }, { date: "2026-10-01" }, { date: "2026-10-22", startTime: "19:00" }, { date: "2026-10-22", startTime: "18:00" }], "2026-10-22").map(p => p.startTime || p.date), ["18:00", "19:00", "2026-10-30"]);
});
