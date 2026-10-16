// Unit tests for carrying a guest's fueling work into an account (js/guestFuel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptGuestFueling, stashFor, STASH_KEY, GUEST_MARK } from "../js/guestFuel.js";

const profile = (fields) => JSON.stringify({ v: 1, fields });

test("keys the account doesn't have yet are added as they are", () => {
    const r = adoptGuestFueling({ "fueling-draft-a1": '{"id":"a1"}', "fueling-units": '{"fluid":"ml"}' }, {});
    assert.deepEqual(r.set, { "fueling-draft-a1": '{"id":"a1"}', "fueling-units": '{"fluid":"ml"}' });
    assert.equal(r.added, 2);
    assert.equal(r.merged, 0);
});

test("a setting the account already has stays the account's (nothing to merge)", () => {
    const r = adoptGuestFueling({ "fueling-units": '{"fluid":"ml"}', "fueling-mode": "race" }, { "fueling-units": '{"fluid":"oz"}', "fueling-mode": "training" });
    assert.deepEqual(r.set, {});
    assert.equal(r.added + r.merged, 0);
});

test("the athlete profile merges newest answer per field, so neither side loses an answer", () => {
    const guest = profile({ bodyWeight: { v: 160, at: 2000 } });
    const account = profile({ bodyWeight: { v: 170, at: 1000 }, tolerance: { v: "high", at: 1500 } });
    const r = adoptGuestFueling({ "fueling-profile": guest }, { "fueling-profile": account });
    const out = JSON.parse(r.set["fueling-profile"]);
    assert.equal(out.fields.bodyWeight.v, 160, "the guest typed it more recently");
    assert.equal(out.fields.tolerance.v, "high", "the account's other answers stay");
    assert.equal(r.merged, 1);
});

test("saved plans from both sides are kept", () => {
    const guest = JSON.stringify([{ id: "g1", name: "Guest long run", updatedAt: 3 }]);
    const account = JSON.stringify([{ id: "p1", name: "Week 8", updatedAt: 1 }]);
    const r = adoptGuestFueling({ "fueling-plans": guest }, { "fueling-plans": account });
    const ids = JSON.parse(r.set["fueling-plans"]).map(p => p.id).sort();
    assert.deepEqual(ids, ["g1", "p1"]);
});

test("only fueling keys are ever adopted", () => {
    const r = adoptGuestFueling({ "nutrition-2026-10-15": "{}", "sb-account-role": "coach", "fueling-mode": "race" }, {});
    assert.deepEqual(Object.keys(r.set), ["fueling-mode"]);
    assert.deepEqual(adoptGuestFueling(null, null), { set: {}, added: 0, merged: 0 });
});

test("a stash is offered only to the account it was set aside for", () => {
    const raw = JSON.stringify({ uid: "u1", at: 1, keys: { "fueling-draft-a": "{}" } });
    assert.ok(stashFor(raw, "u1"));
    assert.equal(stashFor(raw, "u2"), null, "someone else signing in on this device never sees it");
    assert.equal(stashFor(raw, null), null);
    assert.equal(stashFor("not json", "u1"), null);
    assert.equal(stashFor(JSON.stringify({ uid: "u1", keys: { "habits": "[]" } }), "u1"), null, "nothing fueling, nothing to offer");
});

test("the two storage keys are device-only names", () => {
    assert.equal(STASH_KEY, "sb-guest-fueling-stash");
    assert.equal(GUEST_MARK, "sb-guest-fueling");
    assert.ok(!STASH_KEY.startsWith("fueling-") && !GUEST_MARK.startsWith("fueling-"), "never caught by the fueling- sync prefix");
});
