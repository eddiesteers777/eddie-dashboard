import test from "node:test";
import assert from "node:assert/strict";
import { applyDayEdit, revertDayEdit } from "../js/programDayEdit.js";

const day = { date: "2026-11-16", type: "workout", miles: 6, session: "Fartlek", completed: false };

test("edit changes miles and session and remembers the original", () => {
    const e = applyDayEdit(day, { miles: "5", session: "Easy run" });
    assert.equal(e.miles, 5);
    assert.equal(e.session, "Easy run");
    assert.equal(e.edited, true);
    assert.deepEqual(e.original, { miles: 6, session: "Fartlek" });
    assert.equal(e.completed, false);
});

test("a second edit keeps the first original", () => {
    const e2 = applyDayEdit(applyDayEdit(day, { miles: 5, session: "A" }), { miles: 4, session: "B" });
    assert.deepEqual(e2.original, { miles: 6, session: "Fartlek" });
});

test("undo restores the original and drops the markers", () => {
    const back = revertDayEdit(applyDayEdit(day, { miles: 5, session: "Easy" }));
    assert.deepEqual(back, day);
});

test("bad miles become 0 and an empty workout keeps the old name", () => {
    const e = applyDayEdit(day, { miles: "abc", session: "  " });
    assert.equal(e.miles, 0);
    assert.equal(e.session, "Fartlek");
    assert.equal(applyDayEdit(day, { miles: -3, session: "x" }).miles, 0);
});

test("undo on an unedited day changes nothing", () => {
    assert.equal(revertDayEdit(day), day);
});
