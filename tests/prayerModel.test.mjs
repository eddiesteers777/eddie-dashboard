import test from "node:test";
import assert from "node:assert/strict";
import * as P from "../js/prayerModel.js";

test("starter list has five steps and every item starts unchecked", () => {
    const l = P.starterList();
    assert.equal(l.steps.length, 5);
    assert.deepEqual(P.progress(l, {}, "2026-11-14"), { done: 0, total: 5 });
    assert.equal(new Set(P.allItems(l).map(i => i.id)).size, 5);
});

test("complete only when every item is checked, and unchecking one undoes it", () => {
    const l = P.starterList(), day = "2026-11-14";
    let c = {};
    for (const i of P.allItems(l)) c = P.toggleCheck(c, day, i.id);
    assert.ok(P.isComplete(l, c, day));
    c = P.toggleCheck(c, day, P.allItems(l)[0].id);
    assert.ok(!P.isComplete(l, c, day));
    assert.ok(!P.isComplete({ steps: [] }, {}, day), "an empty list is never done");
});

test("checks are per day", () => {
    const l = P.starterList(), id = P.allItems(l)[0].id;
    const c = P.toggleCheck({}, "2026-11-14", id);
    assert.equal(P.progress(l, c, "2026-11-15").done, 0);
});

test("current step is the first with an unchecked item", () => {
    const l = P.starterList(), day = "d";
    const c = P.toggleCheck({}, day, l.steps[0].items[0].id);
    assert.equal(P.currentStepId(l, c, day), l.steps[1].id);
});

test("editing: add, rename, remove items and steps", () => {
    let l = P.starterList();
    const s = l.steps[3];
    l = P.addItem(l, s.id, "  Wife   and family ");
    assert.equal(l.steps[3].items.at(-1).text, "Wife and family");
    const id = l.steps[3].items.at(-1).id;
    l = P.renameItem(l, id, "Family");
    assert.equal(l.steps[3].items.at(-1).text, "Family");
    l = P.removeItem(l, id);
    assert.equal(l.steps[3].items.length, 1);
    l = P.addStep(l, "Praise");
    assert.equal(l.steps.length, 6);
    assert.equal(P.addItem(l, s.id, "   "), l, "blank text changes nothing");
    const only = { steps: [l.steps[0]] };
    assert.equal(P.removeStep(only, l.steps[0].id), only, "last step stays");
});

test("prune drops old days and removed items", () => {
    const l = P.starterList(), id = P.allItems(l)[0].id;
    const c = { "2026-01-01": { [id]: true }, "2026-11-14": { [id]: true, gone: true } };
    assert.deepEqual(P.pruneChecks(c, l, "2026-11-14"), { "2026-11-14": { [id]: true } });
});

test("cleanList rejects junk", () => {
    assert.equal(P.cleanList(null), null);
    assert.equal(P.cleanList({ steps: "x" }), null);
    assert.ok(P.cleanList(P.starterList()));
});
