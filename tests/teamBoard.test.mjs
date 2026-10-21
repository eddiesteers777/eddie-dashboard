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

test("drawings: taps are ignored, lines and zones are made, freehand is thinned", () => {
    assert.equal(M.makeMark("pass", [{ x: .5, y: .5 }, { x: .501, y: .5 }], "m1"), null);
    assert.equal(M.makeMark("nope", [{ x: .5, y: .5 }], "m1"), null);
    const pass = M.makeMark("pass", [{ x: .1, y: .1 }, { x: .2, y: .15 }, { x: .5, y: .5 }], "m1");
    assert.equal(pass.pts.length, 2);
    const many = Array.from({ length: 200 }, (_, i) => ({ x: i / 400, y: .5 }));
    const run = M.makeMark("run", many, "m2");
    assert.ok(run.pts.length > 2 && run.pts.length <= 40);
    assert.deepEqual(run.pts[run.pts.length - 1], { x: 0.498, y: .5 });
    assert.equal(M.makeMark("text", [{ x: .4, y: .4 }], "m3").text, "Note");
    assert.equal(M.makeMark("zone", [{ x: .1, y: .1 }, { x: .4, y: .3 }], "m4").pts.length, 2);
});

test("marks can be added, edited, moved without leaving the pitch, removed, cleared", () => {
    let b = M.newBoard();
    const id = M.nextMarkId(b);
    b = M.addMark(b, M.makeMark("arrow", [{ x: .1, y: .1 }, { x: .3, y: .2 }], id));
    assert.equal(M.nextMarkId(b), "m2");
    b = M.moveMark(b, id, 5, 5);
    const pts = b.marks[0].pts;
    assert.ok(pts.every(p => p.x <= 1 && p.y <= 1));
    assert.equal(Math.round((pts[1].x - pts[0].x) * 1000), 200);
    b = M.addMark(b, M.makeMark("text", [{ x: .5, y: .5 }], "m2"));
    b = M.updateMark(b, "m2", { text: "Press here".repeat(10) });
    assert.equal(b.marks[1].text.length, 40);
    assert.equal(M.removeMark(b, id).marks.length, 1);
    assert.equal(M.clearMarks(b).marks.length, 0);
});

test("views and drawings survive save and load; broken marks are dropped", () => {
    let b = M.setView(M.newBoard(), "top");
    b = M.addMark(b, M.makeMark("dribble", [{ x: .2, y: .6 }, { x: .4, y: .4 }], "m1"));
    assert.deepEqual(M.parseBoard(M.serialize(b)), b);
    assert.equal(M.setView(b, "sideways").view, "top");
    const o = JSON.parse(M.serialize(b));
    o.marks.push({ type: "pass", pts: [{ x: "a" }] }, { type: "bad", pts: [{ x: 0, y: 0 }] });
    assert.equal(M.parseBoard(JSON.stringify(o)).marks.length, 1);
});

test("markPath makes a path; dribbles wiggle", () => {
    const line = M.markPath({ type: "pass", pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, 68, 105);
    assert.match(line, /^M0 0L68 105$/);
    const wavy = M.markPath({ type: "dribble", pts: [{ x: 0, y: .5 }, { x: 1, y: .5 }] }, 68, 105);
    assert.ok(wavy.split("L").length > 20);
});

import * as L from "../team/boardLibrary.js";

test("library: save, update, duplicate, delete, sort", () => {
    let lib = L.emptyLibrary();
    const a = M.setMeta(M.newBoard(), { title: "Corner A", scenario: "Set piece" });
    let r = L.saveBoard(lib, a, null, 100); lib = r.lib;
    assert.equal(r.id, "b1");
    r = L.saveBoard(lib, M.setFormation(a, "home", "4-3-3"), r.id, 200); lib = r.lib;
    assert.equal(lib.boards.length, 1);
    assert.equal(lib.boards[0].board.homeFormation, "4-3-3");
    const d = L.duplicateBoard(lib, "b1", 300); lib = d.lib;
    assert.equal(lib.boards[0].name, "Corner A copy");
    assert.equal(d.id, "b2");
    assert.deepEqual(L.sortedBoards(lib).map(b => b.id), ["b2", "b1"]);
    lib = L.deleteBoard(lib, "b1");
    assert.deepEqual(lib.boards.map(b => b.id), ["b2"]);
    assert.equal(L.duplicateBoard(lib, "zzz").lib, lib);
    // ids never repeat after a delete
    assert.equal(L.saveBoard(lib, a, null, 400).id, "b3");
});

test("library file round trip, bad boards skipped, merge keeps existing", () => {
    let lib = L.saveBoard(L.emptyLibrary(), M.setMeta(M.newBoard(), { title: "One" }), null, 10).lib;
    lib = L.saveBoard(lib, M.setMeta(M.newBoard(), { title: "Two" }), null, 20).lib;
    const back = L.parseLibrary(L.serializeLibrary(lib));
    assert.equal(back.boards.length, 2);
    assert.deepEqual(back.boards.map(b => b.name).sort(), ["One", "Two"]);
    const o = JSON.parse(L.serializeLibrary(lib)); o.boards.push({ name: "bad", board: { v: 1 } });
    assert.equal(L.parseLibrary(JSON.stringify(o)).boards.length, 2);
    assert.equal(L.parseLibrary("{}"), null);
    const merged = L.mergeLibrary(lib, back);
    assert.equal(merged.boards.length, 4);
    assert.equal(new Set(merged.boards.map(b => b.id)).size, 4);
    assert.equal(L.loadLibrary("garbage").boards.length, 0);
});

import * as DR from "../team/drillModel.js";
import { SEED_DRILLS } from "../team/drillSeed.js";

test("starter drills are complete and use known topics", () => {
    assert.ok(SEED_DRILLS.length >= 24);
    for (const t of DR.TOPICS) assert.ok(SEED_DRILLS.some(d => d.topic === t), "no starter drill for " + t);
    const names = new Set();
    for (const d of SEED_DRILLS) {
        const c = DR.normalizeDrill(d, "d1");
        assert.ok(c, d.name);
        assert.ok(c.setup && c.how && c.points.length >= 3 && c.progressions.length && c.easier.length, d.name + " is incomplete");
        assert.ok(c.minutes >= 8 && c.minutes <= 25, d.name);
        assert.ok(!names.has(d.name), "duplicate " + d.name); names.add(d.name);
        assert.ok(!/ -- /.test(JSON.stringify(d)), "use a real dash in " + d.name);
    }
});

test("drills: normalize, save, edit keeps id, copy, delete, filter", () => {
    assert.equal(DR.normalizeDrill({ name: "  " }), null);
    const messy = DR.normalizeDrill({ name: "X", topic: "Bogus", minutes: 999, intensity: "Wild", equipment: "a\n\n b ", points: ["p"] }, "d9");
    assert.equal(messy.topic, "Small-sided"); assert.equal(messy.minutes, 60); assert.equal(messy.intensity, "Medium");
    assert.deepEqual(messy.equipment, ["a", "b"]);
    let list = DR.mergeSeeds([], SEED_DRILLS);
    assert.equal(list.length, SEED_DRILLS.length);
    assert.ok(list.every(d => d.seed));
    assert.equal(new Set(list.map(d => d.id)).size, list.length);
    const r = DR.saveDrill(list, { name: "My drill", topic: "Passing", minutes: 8 }); list = r.list;
    assert.equal(list[0].name, "My drill"); assert.equal(list[0].seed, false);
    const e = DR.saveDrill(list, { ...list[0], name: "My drill v2" });
    assert.equal(e.id, r.id); assert.equal(e.list.length, list.length);
    const first = list.find(d => d.seed);
    assert.equal(DR.saveDrill(list, { ...first, name: "Edited seed" }).list.find(d => d.id === first.id).seed, true);
    const c = DR.duplicateDrill(list, r.id); assert.equal(c.list[0].name, "My drill copy"); assert.notEqual(c.id, r.id);
    assert.equal(DR.deleteDrill(list, r.id).length, list.length - 1);
    assert.ok(DR.filterDrills(list, { topic: "Finishing" }).every(d => d.topic === "Finishing"));
    assert.ok(DR.filterDrills(list, { maxMinutes: 10 }).every(d => d.minutes <= 10));
    assert.ok(DR.filterDrills(list, { q: "RONDO" }).length >= 1);
    assert.ok(DR.filterDrills(list, { intensity: "High" }).every(d => d.intensity === "High"));
});

test("drills: seeds never overwrite edits; file round trip; import skips same names", () => {
    let list = DR.mergeSeeds([], SEED_DRILLS);
    const id = list[0].id;
    list = DR.saveDrill(list, { ...list[0], name: "Renamed" }).list;
    list = DR.deleteDrill(list, list[1].id);
    const again = DR.mergeSeeds(list, SEED_DRILLS);
    assert.ok(again.some(d => d.name === "Renamed" && d.id === id));
    assert.equal(again.length, list.length + 2); // the renamed one and the deleted one come back as starters
    const back = DR.parseDrills(DR.serializeDrills(list));
    assert.equal(back.length, list.length);
    assert.equal(DR.parseDrills("{}"), null);
    assert.equal(DR.importDrills(list, back).length, list.length);
    assert.equal(DR.importDrills([], back).length, list.length);
});
