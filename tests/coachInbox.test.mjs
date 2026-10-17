import assert from "node:assert/strict";
import test from "node:test";
import { inboxRows, inboxGroups, needsCount } from "../js/coachInbox.js";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const m = (from, hoursAgo, extra = {}) => ({ id: `${from}${hoursAgo}`, clientUid: "x", coachUid: "c", from, text: `hi ${hoursAgo}`, createdAt: NOW - hoursAgo * 3600000, ...extra });
const client = (uid, name, messages) => ({ uid, name, messages: messages.map(x => ({ ...x, clientUid: uid })) });

test("groups clients by who owes the next reply", () => {
    const rows = inboxRows([
        client("a", "Maya", [m("coach", 30), m("client", 2)]),
        client("b", "Priya", [m("coach", 80)]),
        client("c", "Lena", [m("client", 30, { readAt: 1 }), m("coach", 29)]),
        client("d", "Theo", [m("coach", 5)]),
        client("e", "Zed", [])
    ], NOW);
    const by = Object.fromEntries(rows.map(r => [r.name, r.group]));
    assert.deepEqual(by, { Maya: "needs", Priya: "waiting", Lena: "caught", Theo: "caught", Zed: "none" });
    assert.equal(needsCount(rows), 1);
});

test("needs-your-reply lists the longest wait first; search filters", () => {
    const rows = inboxRows([
        client("a", "Maya", [m("client", 2)]),
        client("b", "Sam", [m("client", 9)])
    ], NOW);
    assert.deepEqual(inboxGroups(rows)[0].rows.map(r => r.name), ["Sam", "Maya"]);
    assert.deepEqual(inboxGroups(rows, { query: "may" })[0].rows.map(r => r.name), ["Maya"]);
    assert.deepEqual(inboxGroups(rows, { query: "zzz" }), []);
});

test("my own message is marked and previewed", () => {
    const [r] = inboxRows([client("a", "Maya", [m("coach", 1)])], NOW);
    assert.equal(r.mine, true);
    assert.equal(r.text, "hi 1");
});
