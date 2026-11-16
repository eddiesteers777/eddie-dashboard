import test from "node:test";
import assert from "node:assert/strict";
import { newToken, isToken, parentUrl, buildSnapshot, homeworkLines, shareMessage } from "../js/parentLink.js";

test("a new token is 32 hex characters and passes the rules' pattern", () => {
    const t = newToken(new Uint8Array(16).fill(171));
    assert.equal(t, "ab".repeat(16));
    assert.ok(isToken(t));
    assert.ok(!isToken("short"));
    assert.ok(!isToken("../../etc/passwd-aaaaaaaaaaaaaaaa"));
});

test("the snapshot keeps only first names, trimmed text and at most 8 homework lines", () => {
    const s = buildSnapshot({
        clientUid: "c", coachUid: "k", playerName: "Ava Marie Lee", coachName: "Eddie Steers",
        summary: { date: "2026-11-14", workedOn: "Two-touch\n passing", nextTime: "Head up", log: { focus: "Weak foot", notes: "PRIVATE" } },
        homework: Array.from({ length: 10 }, (_, i) => ({ title: `Drill ${i}|x`, label: "2 of 3" }))
    });
    assert.equal(s.firstName, "Ava");
    assert.equal(s.coachFirst, "Eddie");
    assert.deepEqual(Object.keys(s).sort(), ["clientUid", "coachFirst", "coachUid", "firstName", "homework", "last"]);
    assert.deepEqual(s.last, { date: "2026-11-14", focus: "Weak foot", workedOn: "Two-touch passing", nextTime: "Head up" });
    assert.equal(homeworkLines(s).length, 8);
    assert.equal(homeworkLines(s)[0].title, "Drill 0/x");
});

test("no summary and no names fall back to safe words; messages and urls build", () => {
    const s = buildSnapshot({ clientUid: "c", coachUid: "k" });
    assert.equal(s.last, null);
    assert.equal(s.firstName, "Your player");
    assert.equal(s.homework, "");
    assert.equal(parentUrl("abc", "https://x.test/"), "https://x.test/parent.html?t=abc");
    assert.match(shareMessage({ firstName: "Ava", coachFirst: "Eddie" }, "U"), /Ava's latest soccer update from Eddie: U/);
});
