import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../team/boardModel.js";

test("every formation has 11 home slots with a keeper, all on the pitch", () => {
    for (const f of M.FORMATIONS) {
        const s = M.formationSlots(f);
        assert.equal(s.length, 11, f);
        assert.deepEqual(s[0], { x: 0.5, y: 0.93 });
        for (const p of s) assert.ok(p.x > 0 && p.x < 1 && p.y > 0.4 && p.y < 1, f);
    }
    assert.throws(() => M.formationSlots("4-4-3"));
});

test("home and away start in their own halves", () => {
    const b = M.newBoard();
    assert.ok(b.home.every(p => p.y > 0.5));
    assert.ok(b.away.every(p => p.y < 0.5));
});

test("changing formation keeps names and numbers", () => {
    let b = M.editPlayer(M.newBoard(), "h3", { name: "Marcus", num: 22 });
    b = M.setFormation(b, "home", "4-3-3");
    assert.equal(b.homeFormation, "4-3-3");
    assert.equal(b.home[2].name, "Marcus");
    assert.equal(b.home[2].num, 22);
    assert.equal(b.away.length, 11);
});

test("moves are clamped to the pitch", () => {
    const b = M.movePlayer(M.newBoard(), "h5", 2, -3);
    const p = M.findPlayer(b, "h5");
    assert.equal(p.x, 0.97); assert.equal(p.y, 0.03);
    assert.equal(M.moveBall(b, -1, 9).ball.x, 0.02);
});

test("undo and redo walk through changes; a no-op adds no step", () => {
    let h = M.createHistory(M.newBoard());
    h = M.commit(h, h.present);
    assert.equal(h.past.length, 0);
    h = M.commit(h, M.movePlayer(h.present, "h2", 0.3, 0.7));
    h = M.commit(h, M.setFormation(h.present, "home", "3-5-2"));
    assert.equal(h.present.homeFormation, "3-5-2");
    h = M.undo(h); assert.equal(h.present.homeFormation, "4-4-2");
    h = M.undo(h); assert.equal(M.findPlayer(h.present, "h2").x !== 0.3, true);
    h = M.redo(h); assert.equal(M.findPlayer(h.present, "h2").x, 0.3);
    h = M.commit(h, M.setShowAway(h.present, false));
    assert.equal(h.future.length, 0);
    assert.equal(M.undo(M.createHistory(1)).present, 1);
});

test("save and load round trip; bad files are rejected", () => {
    let b = M.editPlayer(M.newBoard(), "a4", { name: "Eli", num: 7 });
    b = M.setMeta(M.moveBall(b, 0.2, 0.3), { title: "Corner A", scenario: "Set piece" });
    assert.deepEqual(M.parseBoard(M.serialize(b)), b);
    assert.equal(M.parseBoard("nope"), null);
    assert.equal(M.parseBoard(JSON.stringify({ v: 1, home: [], away: [] })), null);
    const evil = JSON.parse(M.serialize(b)); evil.home[0].x = 99; evil.home[1].name = "x".repeat(500);
    const ok = M.parseBoard(JSON.stringify(evil));
    assert.equal(ok.home[0].x, 0.97); assert.equal(ok.home[1].name.length, 24);
});
