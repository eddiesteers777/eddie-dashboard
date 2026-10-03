// Unit tests for the client's Today at a glance (js/todayGlance.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { whenLabel, whatLabel, nextLine, quietDayTitle, checkinRows, mondayOf, niceTime } from "../js/todayGlance.js";

// 2026-09-28 is a Monday; 2026-10-03 a Saturday.
const MON = "2026-09-28", THU = "2026-10-01", FRI = "2026-10-02", SAT = "2026-10-03", SUN = "2026-10-04";

test("when: today, tomorrow, a date, with a session's time", () => {
    assert.equal(whenLabel(SAT, SAT), "Today");
    assert.equal(whenLabel(SUN, SAT), "Tomorrow");
    assert.equal(whenLabel("2026-10-05", SAT, "17:00"), "Mon, Oct 5 · 5:00 PM");
    assert.equal(niceTime("09:05"), "9:05 AM");
    assert.equal(mondayOf(SUN), MON, "Sunday belongs to the week that started Monday");
});

test("what: a few words for each kind of item", () => {
    assert.equal(whatLabel({ kind: "run", miles: 10, title: "Long run", detail: "" }), "10 mi long run");
    assert.equal(whatLabel({ kind: "run", miles: 6, title: "Workout", detail: "Tempo" }), "6 mi workout · Tempo");
    assert.equal(whatLabel({ kind: "run", miles: 4, title: "Easy run", detail: "Easy run" }), "4 mi easy run", "no repeat of the type");
    assert.equal(whatLabel({ kind: "strength", title: "Full Body A" }), "Strength · Full Body A");
    assert.equal(whatLabel({ kind: "strength", title: "Marathon Strength A" }), "Marathon Strength A");
    assert.equal(whatLabel({ kind: "session", title: "Soccer · 1-on-1" }), "Soccer · 1-on-1");
    assert.equal(whatLabel({ kind: "cross", title: "Bike 45 min" }), "Bike 45 min");
    assert.equal(whatLabel(null), "");
});

test("the NEXT line: a session carries its time, a run doesn't", () => {
    assert.equal(nextLine(null, SAT), null);
    assert.deepEqual(nextLine({ date: "2026-10-05", item: { kind: "session", title: "Soccer · 1-on-1", startTime: "17:00" } }, SAT),
        { when: "Mon, Oct 5 · 5:00 PM", what: "Soccer · 1-on-1" });
    assert.deepEqual(nextLine({ date: SUN, item: { kind: "run", miles: 10, title: "Long run", startTime: "" } }, SAT),
        { when: "Tomorrow", what: "10 mi long run" });
    // A run and a session the same day: both, the session with its time.
    const run = { kind: "run", miles: 4, title: "Easy run", detail: "" }, soccer = { kind: "session", title: "Soccer · 1-on-1", startTime: "17:00" };
    assert.deepEqual(nextLine({ date: "2026-10-05", item: run, items: [run, soccer] }, SAT),
        { when: "Mon, Oct 5", what: "4 mi easy run + Soccer · 1-on-1 at 5:00 PM" });
});

test("a quiet day: Rest day with a plan, No session today without one", () => {
    assert.equal(quietDayTitle({ plan: true }), "Rest day");
    assert.equal(quietDayTitle({ plan: false }), "No session today");
});

test("check-in: due Sunday early in the week, a prompt from Friday", () => {
    for (const day of [MON, THU]) {
        const rows = checkinRows(day, []);
        assert.equal(rows.length, 1, day);
        assert.equal(rows[0].kind, "checkin-soon");
        assert.equal(rows[0].title, "Check-in due Sunday");
        assert.equal(rows[0].soon, true, "goes last on the card");
    }
    assert.deepEqual(checkinRows(FRI, []).map(r => [r.kind, r.title, r.detail]),
        [["checkin-due", "Weekly check-in due", "Two minutes: how did this week go? Due Sunday."]]);
    assert.equal(checkinRows(SAT, [])[0].detail, "Two minutes: how did this week go? Due tomorrow.");
    assert.equal(checkinRows(SUN, [])[0].title, "Weekly check-in due today");
    // Last week's check-in doesn't count for this week.
    assert.equal(checkinRows(FRI, [{ weekOf: "2026-09-21", status: "submitted" }])[0].kind, "checkin-due");
});

test("check-in: sent, then the coach's reply while it's news", () => {
    assert.deepEqual(checkinRows(SAT, [{ weekOf: MON, status: "submitted" }]).map(r => r.kind), ["checkin-sent"]);
    const replied = checkinRows(SAT, [{ weekOf: MON, status: "reviewed", coachFeedback: "Great week :sb_great_work:" }]);
    assert.deepEqual(replied.map(r => r.kind), ["checkin-reply"], "nothing due once this week's is in");
    assert.equal(replied[0].note, "Great week :sb_great_work:");
    assert.equal(replied[0].detail, "Week of Mon, Sep 28");
    // Monday: this week's is due Sunday, last week's reply still shows.
    assert.deepEqual(checkinRows("2026-10-05", [{ weekOf: MON, status: "reviewed", coachFeedback: "Nice" }]).map(r => r.kind), ["checkin-soon", "checkin-reply"]);
    // Older replies, or a reply with no words, aren't news.
    assert.deepEqual(checkinRows(SAT, [{ weekOf: "2026-09-07", status: "reviewed", coachFeedback: "Old" }]).map(r => r.kind), ["checkin-due"]);
    assert.deepEqual(checkinRows(SAT, [{ weekOf: MON, status: "reviewed", coachFeedback: "  " }]).map(r => r.kind), []);
    // The newest reply wins.
    const two = checkinRows(SAT, [{ weekOf: "2026-09-21", status: "reviewed", coachFeedback: "Last week" }, { weekOf: MON, status: "reviewed", coachFeedback: "This week" }]);
    assert.equal(two.find(r => r.kind === "checkin-reply").note, "This week");
});
