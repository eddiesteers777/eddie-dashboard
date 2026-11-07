import test from "node:test";
import assert from "node:assert/strict";
import { continueCard } from "../js/playbook/continueModel.js";
import { newPractice } from "../js/playbook/practiceModel.js";

test("no card without a practice or without drills in it", () => {
    assert.equal(continueCard(null), null);
    assert.equal(continueCard("not json"), null);
    assert.equal(continueCard(newPractice()), null);
});

test("a practice with drills becomes a card with its own minutes and count", () => {
    const pr = { ...newPractice(), title: "Tuesday practice", items: [{ drillId: "a", minutes: 10 }, { drillId: "b", minutes: 8 }] };
    const c = continueCard(JSON.stringify(pr));
    assert.equal(c.title, "Tuesday practice");
    assert.equal(c.meta, "18 min · 2 drills");
    assert.equal(c.href, "playbook-practice.html");
});

test("one drill is singular and a set date is shown", () => {
    const pr = { ...newPractice(), date: "2026-11-10", items: [{ drillId: "a", minutes: 12 }] };
    assert.equal(continueCard(pr).meta, "12 min · 1 drill · Tue Nov 10");
});
