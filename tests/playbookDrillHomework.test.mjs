import test from "node:test";
import assert from "node:assert/strict";
import * as H from "../js/playbook/drillHomework.js";
import { cleanAssignment } from "../js/homeworkModel.js";
import { newBoard } from "../js/playbook/boardModel.js";
import { SEED_DRILLS } from "../js/playbook/drillSeed.js";
import * as D from "../js/playbook/drillModel.js";

const drill = D.normalizeDrill(SEED_DRILLS.find(d => d.topic === "Passing"), "d1");

test("a drill becomes a clean assignment with a short note", () => {
    const a = H.assignmentFor(drill, { due: "2026-10-28" });
    assert.equal(a.title, drill.name);
    assert.equal(a.skill, "Passing");
    assert.ok(a.note.length > 0 && a.note.length <= 1000);
    const c = cleanAssignment({ ...a, diagram: "" });
    assert.equal(c.title, drill.name); assert.equal(c.dueDate, "2026-10-28");
});
test("a huge drill still fits the note limit", () => {
    const big = { ...drill, setup: "s".repeat(600), how: "h".repeat(600), points: ["p".repeat(300), "q".repeat(300)] };
    assert.ok(H.noteFor(big).length <= 1000);
});
test("diagram token round trips without names and is link-safe", async () => {
    let b = newBoard(); b = { ...b, home: b.home.map(p => ({ ...p, name: "Marcus", rid: "r1" })) };
    const t = await H.diagramToken(b);
    assert.ok(t && t.length <= H.MAX_DIAGRAM && /^[A-Za-z0-9_-]+$/.test(t));
    const back = await H.diagramBoard(t);
    assert.equal(back.home.length, 11);
    assert.ok(back.home.every(p => p.name === "" && p.rid === ""));
    assert.equal(cleanAssignment({ title: "x", diagram: t }).diagram, t);
});
test("bad diagrams are dropped", async () => {
    assert.equal(cleanAssignment({ title: "x", diagram: "<b>" }).diagram, "");
    assert.equal(cleanAssignment({ title: "x", diagram: "A".repeat(4001) }).diagram, "");
    assert.equal(await H.diagramBoard("not a token"), null);
    assert.equal(await H.diagramToken(null), "");
});
test("solo friendly means one or two players", () => {
    assert.ok(H.soloFriendly({ minPlayers: 1 })); assert.ok(!H.soloFriendly({ minPlayers: 6 }));
});
