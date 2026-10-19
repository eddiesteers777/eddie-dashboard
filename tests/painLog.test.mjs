import test from "node:test";
import assert from "node:assert/strict";
import { painEntries, painSummary } from "../js/painLog.js";

const run = (date, pain, painNote = "", title = "Easy run") => ({ date, pain, painNote, title });

test("entries come from workout logs and check-ins, newest first, no pain left out", () => {
    const list = painEntries(
        [run("2026-10-10", true, "left Achilles"), run("2026-10-12", false), run("2026-10-14", true, "", "Long run")],
        [{ weekOf: "2026-10-12", pain: true, painNote: "calf tight" }, { weekOf: "2026-10-05", pain: false }]
    );
    assert.deepEqual(list.map(e => [e.date, e.source, e.where]), [
        ["2026-10-14", "workout", ""], ["2026-10-12", "check-in", "calf tight"], ["2026-10-10", "workout", "left Achilles"]
    ]);
});

test("a check-in with no week date uses when it was sent; junk is skipped", () => {
    const list = painEntries([{ date: "nope", pain: true }, null], [{ pain: true, submittedAt: Date.parse("2026-10-09T10:00:00Z") }, { pain: true }]);
    assert.deepEqual(list.map(e => e.date), ["2026-10-09"]);
});

test("trend compares the last 14 days with the 14 before", () => {
    const t = "2026-10-19";
    assert.equal(painSummary([], [], t).trend, "none");
    assert.equal(painSummary([run("2026-09-20", true)], [], t).trend, "quiet");
    assert.equal(painSummary([run("2026-10-15", true)], [], t).trend, "new");
    assert.equal(painSummary([run("2026-10-15", true), run("2026-10-17", true), run("2026-10-01", true)], [], t).trend, "more");
    assert.equal(painSummary([run("2026-10-15", true), run("2026-10-01", true), run("2026-10-03", true)], [], t).trend, "less");
    assert.equal(painSummary([run("2026-10-15", true), run("2026-10-03", true)], [], t).trend, "same");
});

test("two flags on one day count as one day; the last entry is the newest", () => {
    const s = painSummary([run("2026-10-15", true, "a"), run("2026-10-15", true, "b")], [{ week: "2026-10-18", pain: true, painNote: "c" }], "2026-10-19");
    assert.equal(s.recent, 2);
    assert.equal(s.last.where, "c");
});
