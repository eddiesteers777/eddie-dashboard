import test from "node:test";
import assert from "node:assert/strict";
import {
    createDraft, updateDraft, renameDraft, duplicateDraft, deletedMarker, listDrafts, draftSummary, draftKey,
    isMeaningful, autoName, draftTitle, sameState, mergeDraftValues, newDraftId, uniqueName, agoText
} from "../js/fuelDrafts.js";
import { mergeById, mergeSyncedValue } from "../js/syncMerge.js";
import { setProfileFields, resetProfile, profileValue } from "../js/fuelProfile.js";

const state = (fields = {}, extra = {}) => ({ v: 1, fields: { workoutType: "long", ...fields }, order: [], items: [], mode: "training", ...extra });

test("an untouched page isn't a draft; a workout, products or a name is", () => {
    assert.equal(isMeaningful(state()), false);
    assert.equal(isMeaningful(state({ distance: "18" })), true);
    assert.equal(isMeaningful(state({ pace: "8:" })), true, "half-typed counts");
    assert.equal(isMeaningful(state({}, { items: [{ id: 1, qty: 2 }] })), true);
    assert.equal(isMeaningful(state({ planName: "Chicago" })), true);
});

test("a draft is named from its workout until the person names it", () => {
    const s = state({ distance: "18", duration: "153" });
    assert.equal(autoName(s), "Long run · 18 mi · 2:33");
    const d = createDraft({ id: "d1", state: s, now: 1 });
    assert.equal(draftTitle(d), "Long run · 18 mi · 2:33");
    assert.equal(d.named, false);
    const named = renameDraft(d, "Chicago long run", 5);
    assert.equal(draftTitle(named), "Chicago long run");
    assert.equal(named.state.fields.planName, "Chicago long run", "the name follows into the plan name box");
    assert.equal(draftTitle(renameDraft(named, "  ", 6)), "Long run · 18 mi · 2:33");
});

test("saving the same state twice changes nothing (no extra revisions on refresh)", () => {
    const d = createDraft({ id: "d1", state: state({ distance: "10" }), now: 1, device: "A" });
    // Key order doesn't matter.
    const same = { order: [], fields: { distance: "10", workoutType: "long" }, items: [], mode: "training", v: 1 };
    assert.equal(updateDraft(d, same, { now: 9 }), d);
    const next = updateDraft(d, state({ distance: "12" }), { now: 9, device: "A" });
    assert.equal(next.rev, 2);
    assert.equal(next.updatedAt, 9);
    assert.equal(next.id, "d1");
    assert.ok(sameState(next.state, state({ distance: "12" })));
});

test("duplicates are new plans with their own id and a unique name", () => {
    const d = createDraft({ id: "d1", state: state({ distance: "10", planName: "Tempo" }, { planId: 77, marathonRef: { week: 3 } }), now: 1 });
    const copy = duplicateDraft(d, { id: "d2", now: 2, taken: ["Tempo", "Tempo copy"] });
    assert.equal(copy.id, "d2");
    assert.equal(copy.name, "Tempo copy 2");
    assert.equal(copy.planId, null, "a copy never edits the saved plan");
    assert.equal(copy.state.marathonRef, null);
    assert.equal(copy.state.fields.distance, "10");
    assert.equal(uniqueName("A", ["a"]), "A 2");
});

test("the list skips deleted and saved drafts, newest first, with a status", () => {
    const a = createDraft({ id: "a", state: state({ distance: "5" }), now: 1 });
    const b = createDraft({ id: "b", state: state({ distance: "6" }, { calculated: true }), now: 3 });
    const c = createDraft({ id: "c", state: state({ distance: "7" }), now: 5 });
    const entries = {
        [draftKey("a")]: JSON.stringify(a),
        [draftKey("b")]: JSON.stringify(b),
        [draftKey("c")]: JSON.stringify(deletedMarker(c, { now: 6, reason: "saved" })),
        "fueling-plans": "[]",
        [draftKey("bad")]: "{nope"
    };
    const list = listDrafts(entries);
    assert.deepEqual(list.map(d => d.id), ["b", "a"]);
    assert.equal(draftSummary(list[0]).status, "ready");
    assert.equal(draftSummary(list[1]).status, "unfinished");
    assert.equal(draftSummary(createDraft({ id: "e", state: state({}, { planId: 5 }), now: 1 })).status, "editing");
});

test("ids are unique-ish and readable times say how long ago", () => {
    assert.notEqual(newDraftId(1000, () => 0.1), newDraftId(1000, () => 0.2));
    assert.equal(agoText(1000, 1000 + 10_000), "just now");
    assert.equal(agoText(0, 5), "");
    assert.equal(agoText(1000, 1000 + 5 * 60_000), "5 min ago");
});

test("a draft edited on two devices keeps both: this device's at its id, the other's as a copy", () => {
    const base = createDraft({ id: "d1", state: state({ distance: "10" }), now: 1, device: "A" });
    const here = updateDraft(base, state({ distance: "12" }), { now: 5, device: "A" });
    const there = updateDraft(base, state({ distance: "14" }), { now: 6, device: "B" });
    const r = mergeDraftValues(JSON.stringify(here), JSON.stringify(there));
    assert.equal(JSON.parse(r.value).state.fields.distance, "12");
    assert.equal(r.extra.length, 1);
    const [key, value] = r.extra[0];
    const copy = JSON.parse(value);
    assert.ok(key.startsWith("fueling-draft-"));
    assert.equal(copy.conflictOf, "d1");
    assert.equal(copy.state.fields.distance, "14");
    assert.match(copy.name, /from another device/);
    assert.equal(draftSummary(copy).status, "conflict");
});

test("an edit beats a delete either way; two deletes stay deleted", () => {
    const d = createDraft({ id: "d1", state: state({ distance: "10" }), now: 1 });
    const edited = JSON.stringify(updateDraft(d, state({ distance: "11" }), { now: 5 }));
    const gone = JSON.stringify(deletedMarker(d, { now: 6 }));
    assert.equal(mergeDraftValues(gone, edited).value, edited);
    assert.equal(mergeDraftValues(edited, gone).value, edited);
    assert.equal(JSON.parse(mergeDraftValues(gone, gone).value).deleted, true);
});

test("saved plans changed on two devices: nothing added on either side is lost", () => {
    const base = [{ id: 1, name: "Easy" }, { id: 2, name: "Tempo" }, { id: 3, name: "Long" }];
    const local = [{ id: 1, name: "Easy" }, { id: 3, name: "Long" }, { id: 4, name: "Race (here)" }];          // deleted 2, added 4
    const cloud = [...base, { id: 5, name: "Race (there)" }];                                                   // added 5
    const m = mergeById(local, cloud, base);
    assert.deepEqual(m.map(p => p.id).sort(), [1, 3, 4, 5]);
});

test("a plan edited on both keeps the newer at its id and the other as a copy; an edit beats a delete", () => {
    const base = [{ id: 10, name: "Long", date: "2026-10-01T00:00:00Z" }];
    const local = [{ id: 10, name: "Long A", date: "2026-10-05T00:00:00Z" }];
    const cloud = [{ id: 10, name: "Long B", date: "2026-10-06T00:00:00Z" }];
    const m = mergeById(local, cloud, base);
    assert.equal(m.find(p => p.id === 10).name, "Long B");
    assert.equal(m.find(p => p.id === 11).name, "Long A (from another device)");
    // Deleted on the other device, edited here: kept.
    assert.deepEqual(mergeById(local, [], base).map(p => p.name), ["Long A"]);
    // Deleted on the other device, untouched here: stays deleted.
    assert.deepEqual(mergeById(base, [], base), []);
});

test("mergeSyncedValue only handles the fueling keys it knows", () => {
    assert.equal(mergeSyncedValue("habits", "[1]", "[2]", "[]"), null);
    assert.equal(mergeSyncedValue("fueling-plans", "same", "same", null), null);
    const a = setProfileFields(resetProfile(), { bodyWeight: 150 }, 5).profile;
    const b = setProfileFields(resetProfile(), { tolerance: "high" }, 6).profile;
    const r = mergeSyncedValue("fueling-profile", JSON.stringify(a), JSON.stringify(b), null);
    const p = JSON.parse(r.value);
    assert.equal(profileValue(p, "bodyWeight"), 150);
    assert.equal(profileValue(p, "tolerance"), "high");
    const lib = mergeSyncedValue("fueling-library", JSON.stringify([{ id: 1 }]), JSON.stringify([{ id: 2 }]), "[]");
    assert.deepEqual(JSON.parse(lib.value).map(i => i.id).sort(), [1, 2]);
});
