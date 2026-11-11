import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDiagram, marksAt, markD } from "../js/playbook/drillDiagramModel.js";
import { DIAGRAMS, diagramFor } from "../js/playbook/drillDiagramData.js";
import { SEED_DRILLS } from "../js/playbook/drillSeed.js";

test("normalizeDiagram clamps points and drops junk", () => {
    const d = normalizeDiagram({ a: [[500, -4, 1], ["x", 2]], c: [[10, 10]], steps: [{ say: " go ", m: [["pass", [0, 0], [200, 200]], ["fly", [1, 1], [2, 2]], ["run", [1, 1]]] }] });
    assert.deepEqual(d.a, [{ x: 100, y: 0, n: "1" }]);
    assert.equal(d.steps[0].say, "go");
    assert.deepEqual(d.steps[0].marks, [{ kind: "pass", pts: [[0, 0], [100, 70]] }]);
});
test("normalizeDiagram needs steps and something to draw", () => {
    assert.equal(normalizeDiagram(null), null);
    assert.equal(normalizeDiagram({ a: [[1, 1]], steps: [] }), null);
    assert.equal(normalizeDiagram({ steps: [{ say: "x", m: [] }] }), null);
});
test("marksAt builds up step by step and flags the current step", () => {
    const d = normalizeDiagram({ a: [[1, 1]], steps: [{ say: "a", m: [["pass", [1, 1], [2, 2]]] }, { say: "b", m: [["run", [3, 3], [4, 4]]] }] });
    assert.equal(marksAt(d, 0).length, 1);
    const two = marksAt(d, 1);
    assert.deepEqual(two.map(m => m.now), [false, true]);
    assert.equal(marksAt(d, 99).length, 2);
});
test("markD makes a line or a curve", () => {
    assert.equal(markD({ pts: [[1, 2], [3, 4]] }), "M1 2 L3 4");
    assert.equal(markD({ pts: [[1, 2], [3, 4], [5, 6]] }), "M1 2 Q3 4 5 6");
});
test("every starter diagram is valid, matches a starter drill and keeps its player positions on the grid", () => {
    const names = new Set(SEED_DRILLS.map(d => d.name.toLowerCase()));
    const keys = Object.keys(DIAGRAMS);
    assert.ok(keys.length >= 20, "at least 20 diagrams, got " + keys.length);
    for (const k of keys) {
        assert.ok(names.has(k), "no starter drill named " + k);
        const d = DIAGRAMS[k];
        assert.ok(d, "invalid diagram " + k);
        assert.ok(d.steps.length >= 2 && d.steps.length <= 4, k + " steps");
        assert.ok(d.steps.every(s => s.say && s.marks.length), k + " each step has a line and an arrow");
        assert.ok(d.a.length > 0, k + " has players");
    }
});
test("diagramFor matches by name and yields to a saved board", () => {
    assert.ok(diagramFor({ name: "Passing Squares" }));
    assert.equal(diagramFor({ name: "Passing squares", boardId: "b1" }), null);
    assert.equal(diagramFor({ name: "My own drill" }), null);
    assert.equal(diagramFor(null), null);
});
