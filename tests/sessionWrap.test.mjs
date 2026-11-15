import test from "node:test";
import assert from "node:assert/strict";
import { wrapParts, cleanWrap, logsFor, wordsFor, canWrap, hasWords, emailText } from "../js/sessionWrap.js";

const players = [{ clientUid: "a", name: "Ava", bookingId: "b1" }, { clientUid: "j", name: "Jordan", bookingId: "b2" }, { clientUid: "c", name: "Cole", bookingId: "b3" }];
const plan = [{ name: "Rondo 4v1", kind: "Warm-up", mins: 10, note: "private" }, { name: "Juggling", kind: "Cool-down", mins: 10, note: "" }];

test("parts to wrap up start Done and keep earlier answers by position and name", () => {
    assert.deepEqual(wrapParts(plan).map(p => p.status), ["done", "done"]);
    const saved = [{ name: "Rondo 4v1", status: "done", how: "Sharp" }, { name: "Juggling", status: "skipped", how: "Ran out of time" }];
    const w = wrapParts(plan, saved);
    assert.equal(w[0].how, "Sharp"); assert.equal(w[1].status, "skipped");
    assert.equal(wrapParts(plan, [{ name: "Other drill", status: "skipped", how: "x" }])[0].status, "done");
    assert.ok(!JSON.stringify(wrapParts(plan)).includes("private"));
});

test("cleanWrap drops strangers, blank lines and over-long text", () => {
    const w = cleanWrap({ missed: ["c", "zzz"], summary: "x".repeat(900), lines: { a: "  Opens up  ", zzz: "no", j: "   " }, parts: [{ name: "Rondo", status: "skipped", how: "y".repeat(300) }, { name: "" }] }, players);
    assert.deepEqual(w.missed, ["c"]);
    assert.equal(w.summary.length, 700);
    assert.deepEqual(w.lines, { a: "Opens up" });
    assert.equal(w.parts.length, 1); assert.equal(w.parts[0].how.length, 200); assert.equal(w.parts[0].status, "skipped");
});

test("one log per player: who came gets the report, a no-show gets a no-show", () => {
    const wrap = cleanWrap({ missed: ["c"], summary: "Great energy.", lines: { a: "Opens up on the right." }, parts: [{ name: "Rondo 4v1", mins: 10, status: "done" }, { name: "Juggling", mins: 10, status: "skipped" }] }, players);
    const logs = logsFor({ group: { date: "2026-11-17", players }, wrap, focus: "First touch" });
    assert.equal(logs.length, 3);
    assert.equal(logs[0].status, "completed");
    assert.equal(logs[0].workedOn, "Great energy.\n\nFor you: Opens up on the right.");
    assert.deepEqual(logs[0].drills, [{ name: "Rondo 4v1", result: "10 min" }]);
    assert.equal(logs[1].workedOn, "Great energy.");
    assert.equal(logs[2].status, "no-show"); assert.equal(logs[2].workedOn, "");
    assert.equal(logs[0].focus, "First touch");
});

test("words, email, when you can wrap up", () => {
    const wrap = { summary: "Good.", lines: { a: "Nice." }, parts: [] };
    assert.equal(wordsFor(wrap, "j"), "Good.");
    assert.equal(emailText(wrap, "a", "First touch"), "Focus: First touch\n\nGood.\n\nFor you: Nice.");
    assert.ok(canWrap("2026-11-15", "2026-11-15")); assert.ok(!canWrap("2026-11-16", "2026-11-15"));
    assert.ok(!hasWords({ summary: "", lines: {}, parts: [{ how: "" }] })); assert.ok(hasWords({ summary: "x", lines: {}, parts: [] }));
});
