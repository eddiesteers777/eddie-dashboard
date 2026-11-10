import test from "node:test";
import assert from "node:assert/strict";
import { makePlanned, cleanPlanned, plannedForDate, logEntryFromPlanned, plannedAmount, PLAN_KINDS } from "../js/runningPlanned.js";

test("a planned run needs a date, a kind and miles", () => {
    assert.equal(makePlanned({ date: "2026-11-10", kind: "tempo", miles: 0 }), null);
    assert.equal(makePlanned({ date: "2026-11-10", kind: "nope", miles: 3 }), null);
    assert.equal(makePlanned({ date: "Nov 10", kind: "easy", miles: 3 }), null);
    const p = makePlanned({ date: "2026-11-10", kind: "easy", miles: "6.04", notes: "  hills  " });
    assert.equal(p.miles, 6);
    assert.equal(p.notes, "hills");
    assert.equal(p.done, false);
});

test("strength and cross-training use minutes and may leave them blank", () => {
    const s = makePlanned({ date: "2026-11-10", kind: "strength", minutes: "45" });
    assert.equal(s.minutes, 45);
    assert.equal(s.miles, undefined);
    assert.equal(makePlanned({ date: "2026-11-10", kind: "cross" }).minutes, null);
});

test("a planned run becomes the log entry you confirm, strength does not", () => {
    const run = makePlanned({ date: "2026-11-10", kind: "intervals", miles: 6.8 });
    assert.deepEqual(logEntryFromPlanned(run), { date: "2026-11-10", time: null, miles: 6.8, type: "Workout", notes: "" });
    assert.equal(logEntryFromPlanned(makePlanned({ date: "2026-11-10", kind: "strength" })), null);
    for (const k of PLAN_KINDS.filter(k => k.run)) assert.ok(k.logType, k.id);
});

test("cleaning storage drops junk and keeps done", () => {
    const good = makePlanned({ date: "2026-11-11", kind: "long", miles: 12 });
    const out = cleanPlanned({ entries: [{ ...good, done: true }, { id: "x", date: "bad", kind: "easy", miles: 3 }, null] });
    assert.equal(out.length, 1);
    assert.equal(out[0].done, true);
    assert.deepEqual(cleanPlanned(null), []);
    assert.equal(plannedForDate(out, "2026-11-11").length, 1);
    assert.equal(plannedForDate(out, "2026-11-12").length, 0);
    assert.equal(plannedAmount(out[0]), "12.0 mi");
});
