// Unit tests for the bell's list (js/notificationsModel.js): what counts as "needs your attention".
import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationItems } from "../js/notificationsModel.js";

// 2026-10-02 is a Friday, 2026-09-29 a Tuesday. The check-in is due from Friday.
const FRI = "2026-10-02", TUE = "2026-09-29";
const unreadMsg = { id: "m1", coachUid: "c1", senderName: "Eddie", text: "New shoes arrived? :sb_high_five: Try them on the cool-down first.", from: "coach", readAt: null };

test("a quiet day gives an empty bell", () => {
    assert.deepEqual(notificationItems({ today: TUE }), []);
});

test("unread messages and updates are counted as one row each, with the coach's words", () => {
    const items = notificationItems({
        today: TUE,
        messages: [unreadMsg],
        updates: [{ coachName: "Eddie", text: "Moved Saturday.", readAt: null }, { coachName: "Eddie", text: "Old", readAt: 1 }]
    });
    assert.equal(items.length, 2);
    assert.match(items[0].title, /New message from Eddie/);
    assert.ok(!items[0].detail.includes(":sb_"), "reaction codes are taken out of the preview");
    assert.equal(items[0].link, "messages.html?coach=c1");
    assert.equal(items[1].title, "New update from Eddie");
    assert.equal(items[1].link, "updates.html");
});

test("the weekly check-in only shows when it is due, and only for a client with a coach who has check-ins", () => {
    const due = notificationItems({ today: FRI, hasCoach: true, canCheckins: true });
    assert.equal(due.length, 1);
    assert.equal(due[0].link, "checkin.html");
    assert.deepEqual(notificationItems({ today: TUE, hasCoach: true, canCheckins: true }), [], "due Sunday is not news on a Tuesday");
    assert.deepEqual(notificationItems({ today: FRI, hasCoach: false, canCheckins: true }), [], "no coach, no check-in");
    assert.deepEqual(notificationItems({ today: FRI, hasCoach: true, canCheckins: false }), [], "soccer-only without a plan");
});

test("a coach reply to a check-in is news; 'sent' is not", () => {
    const thisMonday = "2026-09-28";
    const sent = notificationItems({ today: TUE, hasCoach: true, canCheckins: true, checkins: [{ weekOf: thisMonday, status: "submitted" }] });
    assert.deepEqual(sent, []);
    const reply = notificationItems({
        today: TUE, hasCoach: true, canCheckins: true,
        checkins: [{ weekOf: "2026-09-21", status: "reviewed", coachFeedback: "Good week." }, { weekOf: thisMonday, status: "submitted" }]
    });
    assert.equal(reply.length, 1);
    assert.equal(reply[0].id, "checkin-reply");
    assert.equal(reply[0].detail, "Good week.");
});
