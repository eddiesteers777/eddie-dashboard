import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../js/prayerRequests.js";

const mem = obj => ({ get length() { return Object.keys(obj).length; }, key: i => Object.keys(obj)[i], getItem: k => obj[k] ?? null });

test("a request needs words; a note and a group are optional", () => {
    assert.equal(R.newRequest("   ", "", "", "2026-11-16"), null);
    const r = R.newRequest("  Mom  ", "Surgery Thursday", "Family", "2026-11-16");
    assert.equal(r.text, "Mom"); assert.equal(r.group, "Family"); assert.equal(r.answered, null);
    assert.equal(R.newRequest("x", "", "Nope", "2026-11-16").group, "", "an unknown group is dropped");
});

test("answered moves a request to the answered list with its date and what happened; reopen undoes it", () => {
    const r = R.newRequest("Dad's scan", "", "Family", "2026-10-02");
    const a = R.markAnswered(r, "2026-10-28", "Clear");
    assert.deepEqual(R.openRequests([a]), []);
    assert.equal(R.answeredRequests([a])[0].answered.note, "Clear");
    assert.equal(R.daysBetween(a.added, a.answered.date), 26);
    assert.equal(R.openRequests([R.reopen(a)]).length, 1);
});

test("open requests: longest waiting first, filter by group; answered: newest first", () => {
    const a = { ...R.newRequest("a", "", "Family", "2026-11-01"), updatedAt: 1 }, b = { ...R.newRequest("b", "", "Players", "2026-11-05"), updatedAt: 2 };
    assert.deepEqual(R.openRequests([b, a]).map(r => r.text), ["a", "b"]);
    assert.deepEqual(R.openRequests([b, a], "Players").map(r => r.text), ["b"]);
    const x = R.markAnswered(a, "2026-11-10", ""), y = R.markAnswered(b, "2026-11-12", "");
    assert.deepEqual(R.answeredRequests([x, y]).map(r => r.text), ["b", "a"]);
});

test("loadAll reads one key per request, skips deleted markers and junk", () => {
    const r = R.newRequest("Mom", "", "Family", "2026-11-16"), gone = R.newRequest("Gone", "", "", "2026-11-16");
    const store = mem({ [R.keyFor(r.id)]: JSON.stringify(r), [R.keyFor(gone.id)]: JSON.stringify(R.tombstone(gone)), "prayer-req-bad": "{not json", other: "1" });
    assert.deepEqual(R.loadAll(store).map(x => x.text), ["Mom"]);
});

test("cleanRequest rejects an answered date that is not a date", () => {
    const r = R.cleanRequest({ id: "1", text: "x", answered: { date: "soon" } });
    assert.equal(r.answered, null);
});
