import test from "node:test";
import assert from "node:assert/strict";
import { overview, playerProgress, library, librarySkills, filterLibrary, prefillFrom } from "../js/homeworkOverview.js";

const rows = [
    { uid: "a", name: "Ava L.", group: true, one: false, status: "ok" },
    { uid: "b", name: "Ben K.", group: true, one: true, status: "new" },
    { uid: "m", name: "Marcus T.", group: false, one: true, status: "ok" }
];
const hw = (id, uid, extra = {}) => ({ id, clientUid: uid, title: "Wall passes", cadence: "weekly", timesPerWeek: 3, status: "active", logs: [], createdMs: 1, ...extra });
const homework = [hw("1", "a"), hw("2", "m", { title: "Juggling", skill: "Juggling", cadence: "daily" }), hw("3", "a", { status: "archived" }), hw("4", "zzz")];
const progressOf = h => ({ kind: "week", done: h.id === "1" ? 3 : 1, target: h.cadence === "daily" ? 7 : 3 });
const standingOf = h => (h.id === "2" ? "behind" : "on-track");

test("overview: behind list, week by group, ignores archived and strangers", () => {
    const o = overview({ homework, rows, standingOf, progressOf });
    assert.equal(o.active, 2);
    assert.deepEqual(o.behind.map(b => b.name), ["Marcus T."]);
    assert.deepEqual(o.groups.group, { done: 3, target: 3 });
    assert.deepEqual(o.groups.one, { done: 1, target: 7 });
    assert.equal(o.pct, Math.round(100 * 4 / 10));
    assert.deepEqual(o.noHomework.map(r => r.uid), ["b"]);
});

test("overview: practices not yet reviewed show up", () => {
    const o = overview({ homework: [hw("1", "a", { logs: [{ at: 50 }], reviewedMs: 10 }), hw("2", "m", { logs: [{ at: 5 }], reviewedMs: 10 })], rows, standingOf, progressOf });
    assert.equal(o.toReview.length, 1);
    assert.equal(o.toReview[0].hw.id, "1");
});

test("player rows carry progress, streak and a review flag", () => {
    const p = playerProgress({ rows, homework: [hw("1", "a", { logs: [{ at: 50 }], reviewedMs: 0 })], standingOf, progressOf, streakOf: l => l.length * 4 });
    const ava = p.find(r => r.uid === "a");
    assert.equal(ava.pct, 100); assert.equal(ava.streak, 4); assert.equal(ava.standing, "review");
    assert.equal(p.find(r => r.uid === "b").pct, null);
});

test("library: distinct assignments, most used first, filters, prefill", () => {
    const items = library([hw("1", "a", { createdMs: 1 }), hw("2", "b", { createdMs: 5, note: "newer note" }), hw("3", "m", { title: "wall  passes", createdMs: 3 }), hw("4", "a", { title: "Juggling", skill: "Juggling", cadence: "goal", goal: 50 }), hw("5", "a", { title: "Juggling", skill: "Juggling", cadence: "daily" })]);
    assert.equal(items[0].title, "Wall passes"); assert.equal(items[0].count, 3); assert.equal(items[0].players, 3); assert.equal(items[0].note, "newer note");
    assert.equal(items.length, 3);
    assert.deepEqual(librarySkills(items), ["Juggling"]);
    assert.equal(filterLibrary(items, "Juggling").length, 2);
    assert.equal(filterLibrary(items, "all", "WALL").length, 1);
    assert.equal(prefillFrom(items[0]).timesPerWeek, 3);
    assert.ok(!("count" in prefillFrom(items[0])));
});
