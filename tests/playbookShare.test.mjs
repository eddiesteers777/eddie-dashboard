import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/playbook/shareModel.js";
import * as M from "../js/playbook/boardModel.js";
import * as D from "../js/playbook/drillModel.js";
import * as P from "../js/playbook/practiceModel.js";
import { SEED_DRILLS } from "../js/playbook/drillSeed.js";

test("a board survives the trip through a link, without names or roster links", async () => {
    let b = M.newBoard();
    b = M.editPlayer(b, b.home[3].id, { num: 7, name: "Marcus" });
    b = { ...b, home: b.home.map((p, i) => (i === 3 ? { ...p, rid: "r4" } : p)), title: "Corner routine" };
    b = M.addMark(b, M.makeMark("pass", [{ x: .2, y: .5 }, { x: .6, y: .3 }], 1));
    const token = await S.encodePayload(S.boardPayload(b));
    assert.match(token, /^[zr][A-Za-z0-9_-]+$/);
    assert.ok(token.length < 3000, "board link stays short: " + token.length);
    const got = S.parsePayload(await S.decodePayload(token));
    assert.equal(got.kind, "board");
    assert.equal(got.board.title, "Corner routine");
    assert.equal(got.board.marks.length, 1);
    assert.equal(got.board.home[3].num, 7);
    assert.ok(got.board.home.every(p => p.name === "" && p.rid === ""));
    assert.ok(!token.includes("Marcus") && !JSON.stringify(await S.decodePayload(token)).includes("Marcus"));
});

test("a practice plan travels with the drills it uses and imports without duplicates", async () => {
    const drills = D.mergeSeeds([], SEED_DRILLS);
    const pr = P.suggestPlan({ drills, total: 75, players: 18, equipment: new Set(["goals", "smallGoals", "cones", "pinnies", "balls"]) });
    const practice = { ...P.newPractice(), title: "Tuesday", items: pr.items };
    const token = await S.encodePayload(S.practicePayload(practice, drills));
    assert.ok(token.length < 12000, "plan link length " + token.length);
    const shared = S.parsePayload(await S.decodePayload(token));
    assert.equal(shared.kind, "practice");
    assert.equal(shared.practice.items.length, practice.items.length);
    assert.equal(shared.drills.length, new Set(practice.items.map(i => i.drillId)).size);
    // import into an empty library: every drill is added, the plan points at them
    const a = S.importPractice([], [], shared, 5);
    assert.equal(a.practices.length, 1);
    assert.equal(a.practices[0].practice.items.length, practice.items.length);
    const ids = new Set(a.drills.map(d => d.id));
    assert.ok(a.practice.items.every(i => ids.has(i.drillId)));
    // import again into the same library: same-name drills are reused
    const b = S.importPractice(a.drills, a.practices, shared, 6);
    assert.equal(b.drills.length, a.drills.length);
    assert.equal(b.practices.length, 2);
    assert.notEqual(b.practiceId, a.practiceId);
});

test("bad, huge or tampered links are refused, never thrown", async () => {
    for (const t of ["", "x", "zzzz", "rnot-base64!", "r" + "A".repeat(S.MAX_TOKEN + 5), null, 42]) assert.equal(await S.decodePayload(t), null);
    assert.equal(S.parsePayload(null), null);
    assert.equal(S.parsePayload({ v: 2, k: "board" }), null);
    assert.equal(S.parsePayload({ v: 1, k: "board", board: { junk: true } }), null);
    assert.equal(S.parsePayload({ v: 1, k: "practice", practice: { v: 1 } }), null);
    const evil = S.parsePayload({ v: 1, k: "practice", practice: { ...P.newPractice(), title: "<img src=x onerror=alert(1)>" }, drills: [{ name: "<b>x</b>", boardId: "b9", minutes: 9999 }] });
    assert.equal(evil.drills[0].minutes, 60);
    assert.equal(evil.drills[0].boardId, "");
});

test("the link points at the read-only page", () => {
    assert.equal(S.shareUrl("https://southboundcoaching.com", "zabc"), "https://southboundcoaching.com/playbook-view.html#zabc");
});
