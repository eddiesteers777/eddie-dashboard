// Unit tests for the month on My Plan (js/monthModel.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGrid, shiftMonth, firstOfMonth, cellLabel, monthSummaryLine } from "../js/monthModel.js";
import { blankPlan } from "../js/coachingPlanModel.js";

// Coach plan, weeks of Mon 2026-09-28 and 2026-10-05.
function coachPlan() {
    const plan = blankPlan("2026-09-28", 2);
    const a = plan.weeks[0].days, b = plan.weeks[1].days;
    a[0] = { ...a[0], type: "easy", miles: 5, completed: true };      // Mon 28 Sep: done
    a[2] = { ...a[2], type: "workout", miles: 6 };                      // Wed 30 Sep: not done (in the past)
    a[4] = { ...a[4], type: "easy", miles: 3, skipped: true };          // Fri 2 Oct: skipped
    a[5] = { ...a[5], type: "long", miles: 12, completed: true };       // Sat 3 Oct: done
    b[1] = { ...b[1], type: "easy", miles: 4 };                         // Tue 6 Oct: planned
    return { id: "p1", name: "Fall 10K", source: "coach", generatedPlan: plan };
}
const inputs = { plans: [coachPlan()], strength: [], sessions: [], runLog: [] };
const TODAY = "2026-10-05";

test("months shift and snap to their first day", () => {
    assert.equal(firstOfMonth("2026-10-19"), "2026-10-01");
    assert.equal(shiftMonth("2026-10-01", 1), "2026-11-01");
    assert.equal(shiftMonth("2026-01-01", -1), "2025-12-01");
    assert.equal(shiftMonth("2026-12-01", 1), "2027-01-01");
});

test("October 2026 is five Monday-first weeks, starting Mon 28 Sep and ending Sun 1 Nov", () => {
    const g = monthGrid("2026-10-01", inputs, TODAY);
    assert.equal(g.label, "October 2026");
    assert.equal(g.weeks.length, 5);
    assert.ok(g.weeks.every(w => w.length === 7));
    assert.equal(g.weeks[0][0].date, "2026-09-28");
    assert.equal(g.weeks[0][0].inMonth, false);
    assert.equal(g.weeks[0][3].date, "2026-10-01");
    assert.equal(g.weeks[0][3].inMonth, true);
    assert.equal(g.weeks[4][6].date, "2026-11-01");
});

test("each day carries the week view's status", () => {
    const g = monthGrid("2026-10-01", inputs, TODAY);
    const by = Object.fromEntries(g.weeks.flat().map(c => [c.date, c]));
    assert.equal(by["2026-09-28"].status, "done");
    assert.equal(by["2026-09-30"].status, "missed");
    assert.equal(by["2026-10-02"].status, "skipped");
    assert.equal(by["2026-10-03"].status, "done");
    assert.equal(by["2026-10-04"].status, "rest");
    assert.equal(by["2026-10-05"].status, "rest", "today with nothing planned is a rest day");
    assert.equal(by["2026-10-05"].today, true);
    assert.equal(by["2026-10-06"].status, "upcoming");
    assert.deepEqual([by["2026-10-06"].kinds, by["2026-10-06"].miles, by["2026-10-06"].title], [["run"], 4, "Easy run"]);
    assert.equal(by["2026-10-20"].status, "rest", "beyond the open weeks nothing is invented");
});

test("the summary counts only days inside the month", () => {
    const g = monthGrid("2026-10-01", inputs, TODAY);
    // Inside October: Fri 2 skipped, Sat 3 done (12 mi), Tue 6 planned. Mon 28 and Wed 30 Sep are September's.
    assert.deepEqual(g.summary, { done: 1, missed: 0, skipped: 1, planned: 3, miles: 12 });
    const sep = monthGrid("2026-09-01", inputs, TODAY).summary;
    assert.deepEqual([sep.done, sep.missed], [1, 1]);
});

test("logged runs and booked sessions show on days with no plan", () => {
    const g = monthGrid("2026-10-01", { plans: [], strength: [], sessions: [{ date: "2026-10-01", startTime: "09:00", title: "1-on-1 soccer" }], runLog: [{ date: "2026-10-02", miles: 4 }] }, TODAY);
    const by = Object.fromEntries(g.weeks.flat().map(c => [c.date, c]));
    assert.deepEqual([by["2026-10-01"].kinds, by["2026-10-01"].status], [["session"], "done"]);
    assert.deepEqual([by["2026-10-02"].kinds, by["2026-10-02"].status], [["run"], "done"]);
});

test("labels and the summary line read plainly", () => {
    const g = monthGrid("2026-10-01", inputs, TODAY);
    const by = Object.fromEntries(g.weeks.flat().map(c => [c.date, c]));
    assert.equal(cellLabel(by["2026-09-30"]), "Wed, Sep 30: run, not done");
    assert.equal(cellLabel(by["2026-10-04"]), "Sun, Oct 4: rest");
    assert.equal(monthSummaryLine({ done: 12, missed: 2, skipped: 0, planned: 16, miles: 31.5 }), "12 done · 2 not done · 31.5 mi run");
    assert.equal(monthSummaryLine({ done: 0, missed: 0, skipped: 0, planned: 0, miles: 0 }), "");
});
