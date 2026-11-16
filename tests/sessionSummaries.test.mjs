import test from "node:test";
import assert from "node:assert/strict";
import { summaries, kindLabel } from "../js/sessionSummaries.js";

const req = (id, dates, logs, extra = {}) => ({ id, status: "approved", dates, allDates: dates, startTime: "09:00", sessionType: "soccer", label: "1-on-1", clientUid: "c", logs, ...extra });
const done = (date, extra = {}) => ({ date, status: "completed", ...extra });

test("finished sessions with words or a report, newest first", () => {
    const r = [
        req("a", ["2026-11-07", "2026-11-14"], { "2026-11-07": done("2026-11-07", { workedOn: "First touch" }), "2026-11-14": done("2026-11-14", { workedOn: "Weak foot", nextTime: "Head up" }) }),
        req("b", ["2026-11-10"], { "2026-11-10": done("2026-11-10", { focus: "Pressing" }) })
    ];
    const s = summaries(r, "2026-11-15");
    assert.deepEqual(s.map(x => x.date), ["2026-11-14", "2026-11-10", "2026-11-07"]);
    assert.equal(s[0].nextTime, "Head up");
});

test("no words, not completed, or in the future are left out", () => {
    const r = [req("a", ["2026-11-07", "2026-11-09", "2026-11-20"], {
        "2026-11-07": done("2026-11-07"),
        "2026-11-09": { date: "2026-11-09", status: "no-show", workedOn: "x" },
        "2026-11-20": done("2026-11-20", { workedOn: "future" })
    })];
    assert.deepEqual(summaries(r, "2026-11-15"), []);
});

test("kindLabel reads group and 1-on-1 from the label", () => {
    assert.equal(kindLabel({ label: "Saturday Group" }), "Group");
    assert.equal(kindLabel({ label: "1-on-1" }), "1-on-1");
    assert.equal(kindLabel({}), "Session");
});
