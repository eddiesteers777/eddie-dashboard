import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEYS } from "../js/playbook/store.js";
import { planSync, mergeStates, hasWork, SYNC_KEYS, MAX_VALUE_BYTES } from "../js/playbook/syncModel.js";
import * as RO from "../js/playbook/rosterModel.js";
import * as DR from "../js/playbook/drillModel.js";
import * as PM from "../js/playbook/practiceModel.js";
import * as L from "../js/playbook/boardLibrary.js";
import * as M from "../js/playbook/boardModel.js";

const R = KEYS.roster;

test("sync keys are the work, never the theme", () => {
    assert.ok(SYNC_KEYS.includes(KEYS.roster) && SYNC_KEYS.includes(KEYS.library));
    assert.ok(!SYNC_KEYS.includes(KEYS.theme));
});

test("a local edit is pushed, a remote edit is applied, equal values do nothing", () => {
    const snapshot = { [R]: "a" };
    assert.deepEqual(planSync({ local: { [R]: "b" }, snapshot, remote: { [R]: { v: "a", at: 1 } } }).push, { [R]: "b" });
    assert.deepEqual(planSync({ local: { [R]: "a" }, snapshot, remote: { [R]: { v: "c", at: 5 } } }).apply, { [R]: "c" });
    const none = planSync({ local: { [R]: "a" }, snapshot, remote: { [R]: { v: "a", at: 1 } } });
    assert.deepEqual([none.push, none.apply], [{}, {}]);
});

test("edited on both sides: the newer edit wins", () => {
    const base = { snapshot: { [R]: "a" }, remote: { [R]: { v: "r", at: 100 } } };
    assert.deepEqual(planSync({ ...base, local: { [R]: "l" }, localTimes: { [R]: 200 } }).push, { [R]: "l" });
    assert.deepEqual(planSync({ ...base, local: { [R]: "l" }, localTimes: { [R]: 50 } }).apply, { [R]: "r" });
});

test("clearing a key on one device removes it on the other", () => {
    assert.deepEqual(planSync({ local: { [R]: null }, snapshot: { [R]: "a" }, remote: { [R]: { v: "a", at: 1 } } }).push, { [R]: null });
    assert.deepEqual(planSync({ local: { [R]: "a" }, snapshot: { [R]: "a" }, remote: { [R]: { v: null, at: 9 } } }).apply, { [R]: null });
});

test("a value that is too big is not pushed", () => {
    const big = "x".repeat(MAX_VALUE_BYTES + 1);
    const p = planSync({ local: { [R]: big }, snapshot: {}, remote: {} });
    assert.deepEqual(p.push, {});
    assert.deepEqual(p.tooBig, [R]);
});

test("combining two sets of work keeps both and fixes the links", () => {
    // device: roster Ana(r1); account: roster Ben(r1), Ana(r2); a board linked to Ben, a practice using a drill
    const dev = { [R]: RO.serializeRoster([{ id: "r1", name: "Ana", num: 7, pos: "MID", here: true }]) };
    const acct = { [R]: RO.serializeRoster([{ id: "r1", name: "Ben", num: 9, pos: "FWD", here: true }, { id: "r2", name: "Ana", num: 7, pos: "MID", here: true }]) };
    const board = M.newBoard(); board.home[0].rid = "r1"; board.home[0].name = "Ben";
    let lib = L.saveBoard(L.emptyLibrary(), board, null, 5).lib;
    acct[KEYS.library] = L.serializeLibrary(lib);
    const d = DR.saveDrill([], { ...DR.normalizeDrill({ name: "Rondo", minutes: 10, topic: "Passing" }, "d1"), id: "" });
    acct[KEYS.drills] = DR.serializeDrills(d.list);
    const pr = PM.newPractice(); pr.items = [{ drillId: d.id, minutes: 10 }];
    acct[KEYS.practices] = PM.serializePracticeList(PM.savePractice([], pr, null, 7).list);
    const dev2 = { ...dev, [KEYS.drills]: DR.serializeDrills(DR.saveDrill([], { ...DR.normalizeDrill({ name: "Other", minutes: 8, topic: "Passing" }, "d1"), id: "" }).list) };

    const out = mergeStates(dev2, acct);
    const roster = RO.parseRoster(out[R]);
    assert.deepEqual(roster.map(p => p.name).sort(), ["Ana", "Ben"]);
    const ben = roster.find(p => p.name === "Ben");
    assert.notEqual(ben.id, "r1"); // r1 is Ana on this device
    const merged = L.parseLibrary(out[KEYS.library]).boards;
    assert.equal(merged.length, 1);
    assert.equal(merged[0].board.home[0].rid, ben.id); // the board still points at Ben
    const drills = DR.parseDrills(out[KEYS.drills]);
    assert.deepEqual(drills.map(x => x.name).sort(), ["Other", "Rondo"]);
    const rondo = drills.find(x => x.name === "Rondo");
    assert.notEqual(rondo.id, drills.find(x => x.name === "Other").id);
    const pl = PM.parsePracticeList(out[KEYS.practices]);
    assert.equal(pl[0].practice.items[0].drillId, rondo.id); // the practice still uses Rondo
});

test("combining with an empty side returns the other side's work", () => {
    const acct = { [R]: RO.serializeRoster([{ id: "r1", name: "Ben", num: 9, pos: "FWD", here: true }]) };
    assert.equal(RO.parseRoster(mergeStates({}, acct)[R])[0].name, "Ben");
    assert.equal(hasWork({}), false);
    assert.equal(hasWork(acct), true);
});

test("sign-out and account switches clear Playbook work that is linked to an account", () => {
    const src = readFileSync(new URL("../js/auth.js", import.meta.url), "utf8");
    assert.match(src, /sb-playbook-owner/);
    assert.match(src, /clearLinkedPlaybook\(\);/);
    assert.match(src, /key !== "sb-playbook-theme"/);
});
