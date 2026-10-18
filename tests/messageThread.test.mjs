// The coach-client message thread (js/messageThread.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortThread, threadDays, unreadFor, inboxByClient, messageAttention, shouldEmail, preview, seenLine, dayLabel, isTyping, togglePinned } from "../js/messageThread.js";

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const msg = (id, from, when, extra = {}) => ({ id, coachUid: "coach", clientUid: "sam", from, text: `${from} ${id}`, createdAt: when, readAt: null, ...extra });

test("the thread is oldest first; one still sending goes last", () => {
    const t = sortThread([msg("b", "client", at(10, 9)), msg("p", "coach", null), msg("a", "coach", { seconds: at(9, 8) / 1000 })]);
    assert.deepEqual(t.map(m => m.id), ["a", "b", "p"]);
});

test("days, my side, and runs of messages", () => {
    const days = threadDays([
        msg("1", "coach", at(10, 9, 0)),
        msg("2", "coach", at(10, 9, 3)),
        msg("3", "coach", at(10, 9, 30)),
        msg("4", "client", at(10, 9, 31)),
        msg("5", "client", at(11, 7, 0))
    ], { role: "client", today: "2026-10-11" });
    assert.deepEqual(days.map(d => d.label), ["Yesterday", "Today"]);
    assert.deepEqual(days[0].items.map(m => [m.id, m.mine, m.first]), [["1", false, true], ["2", false, false], ["3", false, true], ["4", true, true]]);
    assert.equal(days[1].items[0].first, true);   // a new day starts a new run
    assert.match(days[0].items[0].time, /9:00/);
});

test("day labels", () => {
    assert.equal(dayLabel("2026-10-11", "2026-10-11"), "Today");
    assert.equal(dayLabel("2026-10-08", "2026-10-11"), "Thursday");
    assert.equal(dayLabel("2026-09-01", "2026-10-11"), "Tue, Sep 1");
    assert.equal(dayLabel("2025-12-30", "2026-10-11"), "Dec 30, 2025");
});

test("unread is what the other side sent that I haven't read", () => {
    const t = [msg("1", "coach", at(10, 9)), msg("2", "client", at(10, 10)), msg("3", "coach", at(10, 11), { readAt: at(10, 12) })];
    assert.deepEqual(unreadFor(t, "client").map(m => m.id), ["1"]);
    assert.deepEqual(unreadFor(t, "coach").map(m => m.id), ["2"]);
});

test("the coach's inbox and the attention line", () => {
    const inbox = inboxByClient([
        msg("1", "client", at(9, 8)),
        msg("2", "coach", at(9, 9)),
        msg("3", "client", at(10, 8), { text: "Knee is a little sore after the long run :sb_recovery:" }),
        { ...msg("4", "client", at(10, 9)), clientUid: "pat", readAt: at(10, 10) }
    ]);
    const sam = inbox.get("sam");
    assert.equal(sam.count, 3);
    assert.equal(sam.unread, 2);
    assert.equal(sam.waitingSince, at(9, 8));
    const a = messageAttention(sam);
    assert.equal(a.kind, "message");
    assert.equal(a.tab, "messages");
    assert.equal(a.at, at(9, 8));
    assert.match(a.text, /^2 messages waiting on you, the last: "Knee is a little sore after the long run \[Recovery\]"/);
    assert.equal(messageAttention(inbox.get("pat")), null);
    const one = messageAttention(inboxByClient([msg("9", "client", at(10, 8), { text: "Quick one" })]).get("sam"));
    assert.equal(one.text, 'Sent you a message: "Quick one"');
});

test("only the first unread message of a run sends an email", () => {
    assert.equal(shouldEmail([], "coach"), true);
    assert.equal(shouldEmail([msg("1", "coach", at(10, 9))], "coach"), false);              // they haven't read the last one
    assert.equal(shouldEmail([msg("1", "coach", at(10, 9), { readAt: at(10, 10) })], "coach"), true);
    assert.equal(shouldEmail([msg("1", "client", at(10, 9))], "coach"), true);              // their unread messages don't count
});

test("preview and the Seen line", () => {
    assert.equal(preview("  a\n b  "), "a b");
    assert.equal(preview("x".repeat(100), 10), `${"x".repeat(9)}…`);
    assert.equal(seenLine([msg("1", "coach", at(10, 9))], "coach"), "Delivered");
    assert.match(seenLine([msg("1", "coach", at(10, 9), { readAt: at(10, 14, 5) })], "coach"), /^Read 2:05/);
    assert.equal(seenLine([msg("1", "client", at(10, 9))], "coach"), "");
});

test("bubble positions, time stamps and the typing window", () => {
    const days = threadDays([
        msg("1", "coach", at(10, 9, 0)), msg("2", "coach", at(10, 9, 1)), msg("3", "coach", at(10, 9, 2)),
        msg("4", "client", at(10, 9, 3)), msg("5", "client", at(10, 11, 0))
    ], { role: "client", today: "2026-10-10" });
    const it = days[0].items;
    assert.deepEqual(it.map(m => m.pos), ["top", "mid", "end", "single", "single"]);
    assert.deepEqual(it.map(m => Boolean(m.stamp)), [true, false, false, false, true]);
    const now = 1_000_000;
    assert.equal(isTyping(now - 2000, now), true);
    assert.equal(isTyping(now - 9000, now), false);
    assert.equal(isTyping(null, now), false);
});

test("pinning adds to the front and a second toggle removes", () => {
    assert.deepEqual(togglePinned([], "a"), ["a"]);
    assert.deepEqual(togglePinned(["a"], "b"), ["b", "a"]);
    assert.deepEqual(togglePinned(["b", "a"], "b"), ["a"]);
    assert.deepEqual(togglePinned("junk", "a"), ["a"]);
});
