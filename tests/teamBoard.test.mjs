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

import * as PM from "../team/practiceModel.js";

const ALL_EQ = new Set(PM.EQUIPMENT.map(e => e[0]));
const seeds = DR.mergeSeeds([], SEED_DRILLS);

test("practice: equipment needs are read from drill equipment", () => {
    const need = n => PM.equipmentNeeds(seeds.find(d => d.name === n));
    assert.deepEqual([...need("Finishing circuit")].sort(), ["balls", "cones", "goals"]);
    assert.ok(need("1v1 to goal").has("smallGoals") && !need("1v1 to goal").has("goals"));
    assert.ok(need("Passing squares").has("pinnies"));
});

test("practice: a suggested plan adds up, starts with a warm-up and respects limits", () => {
    for (const total of [45, 60, 75, 90, 120]) {
        const p = PM.suggestPlan({ drills: seeds, total, players: 20, equipment: ALL_EQ });
        assert.equal(PM.planTotal(p.items), total, "total " + total);
        const first = seeds.find(d => d.id === p.items[0].drillId);
        assert.equal(first.topic, "Warm-up");
        assert.equal(new Set(p.items.map(i => i.drillId)).size, p.items.length);
    }
    const small = PM.suggestPlan({ drills: seeds, total: 60, players: 6, equipment: ALL_EQ });
    assert.ok(small.items.every(i => seeds.find(d => d.id === i.drillId).minPlayers <= 6));
    const noGoals = PM.suggestPlan({ drills: seeds, total: 60, players: 20, equipment: new Set(["cones", "balls", "pinnies"]), focus: ["Finishing"] });
    assert.ok(noGoals.items.every(i => !PM.equipmentNeeds(seeds.find(d => d.id === i.drillId)).has("goals")));
    assert.ok(noGoals.notes.length > 0);
});

test("practice: a game tomorrow means no high-intensity drills; variants change the drills", () => {
    const p = PM.suggestPlan({ drills: seeds, total: 75, players: 20, equipment: ALL_EQ, gameInDays: 1, focus: ["Defending", "Pressing", "Finishing"] });
    assert.ok(p.items.every(i => seeds.find(d => d.id === i.drillId).intensity !== "High"));
    assert.ok(p.notes.some(n => /Game tomorrow/.test(n)));
    const a = PM.suggestPlan({ drills: seeds, total: 75, players: 20, equipment: ALL_EQ, focus: ["Passing"], variant: 0 });
    const b = PM.suggestPlan({ drills: seeds, total: 75, players: 20, equipment: ALL_EQ, focus: ["Passing"], variant: 1 });
    assert.notDeepEqual(a.items.map(i => i.drillId), b.items.map(i => i.drillId));
});

test("practice: fit shrinks and grows fairly, edits and times work", () => {
    const items = [{ drillId: "a", minutes: 10 }, { drillId: "b", minutes: 20 }, { drillId: "c", minutes: 20 }];
    assert.equal(PM.planTotal(PM.fitMinutes(items, 30)), 30);
    assert.equal(PM.planTotal(PM.fitMinutes(items, 80)), 80);
    assert.ok(PM.fitMinutes(items, 12).length < 3);
    assert.deepEqual(PM.moveItem(items, 0, 1).map(i => i.drillId), ["b", "a", "c"]);
    assert.equal(PM.moveItem(items, 0, -1), items);
    assert.equal(PM.setMinutes(items, 1, 999)[1].minutes, 60);
    assert.deepEqual(PM.startTimes(items, "15:30"), ["3:30 PM", "3:40 PM", "4:00 PM"]);
    assert.deepEqual(PM.startTimes(items, ""), ["", "", ""]);
    assert.deepEqual(PM.startTimes([{ minutes: 30 }, { minutes: 5 }], "11:45"), ["11:45 AM", "12:15 PM"]);
});

test("practice: save list, round trip and bad input", () => {
    let pr = PM.newPractice(); pr.title = "Tuesday"; pr.items = [{ drillId: "d1", minutes: 12 }];
    let r = PM.savePractice([], pr, null, 5);
    r = PM.savePractice(r.list, { ...pr, title: "Tuesday v2" }, r.id, 9);
    assert.equal(r.list.length, 1); assert.equal(r.list[0].name, "Tuesday v2");
    const back = PM.parsePracticeList(PM.serializePracticeList(r.list));
    assert.deepEqual(back[0].practice, r.list[0].practice);
    assert.equal(PM.parsePractice({ v: 1, items: [], total: 9999, players: -4, equipment: ["x"] }).total, 180);
    assert.equal(PM.parsePractice({ v: 2 }), null);
    assert.deepEqual(PM.parsePracticeList("junk"), []);
    assert.equal(PM.deletePractice(r.list, r.id).length, 0);
});

import * as RO from "../team/rosterModel.js";

test("roster: normalize, save, edit, delete, here toggle", () => {
    assert.equal(RO.normalizePlayer({ name: " " }), null);
    const p = RO.normalizePlayer({ name: "Marcus J", num: "7", pos: "WING", here: false, note: "x".repeat(200) }, "r5");
    assert.equal(p.num, 7); assert.equal(p.pos, "Any"); assert.equal(p.here, false); assert.equal(p.note.length, 60);
    assert.equal(RO.normalizePlayer({ name: "Eli", num: "" }, "r1").num, null);
    let list = [];
    let r = RO.savePlayer(list, { name: "Eli", num: 9, pos: "FWD" }); list = r.list;
    r = RO.savePlayer(list, { name: "Sam", pos: "GK" }); list = r.list;
    assert.deepEqual(list.map(x => x.id), ["r1", "r2"]);
    list = RO.savePlayer(list, { ...list[0], name: "Eli R" }).list;
    assert.equal(list[0].name, "Eli R"); assert.equal(list.length, 2);
    list = RO.setHere(list, "r2", false);
    assert.deepEqual(RO.available(list).map(x => x.id), ["r1"]);
    list = RO.deletePlayer(list, "r1");
    assert.equal(RO.savePlayer(list, { name: "Ty" }).id, "r3"); // ids never repeat
});

test("roster: bulk add and file round trip", () => {
    const t = RO.parseBulk("Marcus 10 MID\n#7 Eli\nJordan Lee, 4, def\n\nSam GK 1");
    assert.deepEqual(t.map(x => [x.name, x.num, x.pos]), [["Marcus", 10, "MID"], ["#7 Eli", null, "Any"], ["Jordan Lee", 4, "DEF"], ["Sam", 1, "GK"]]);
    const r = RO.addBulk([], "A 1\nB 2 FWD");
    assert.equal(r.added, 2);
    assert.deepEqual(RO.parseRoster(RO.serializeRoster(r.list)), r.list);
    assert.equal(RO.parseRoster("{}"), null);
    assert.equal(RO.parseRoster("junk"), null);
});

test("roster: slot roles follow the formation", () => {
    assert.deepEqual(RO.slotRoles("4-4-2"), ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"]);
    assert.deepEqual(RO.slotRoles("4-2-3-1").filter(r => r === "MID").length, 5);
    assert.equal(RO.slotRoles("3-5-2").length, 11);
});

test("roster: auto lineup uses positions, skips absent players, fills gaps", () => {
    const mk = (name, pos, here = true) => ({ name, pos, here });
    const list = [mk("Gus", "GK"), mk("D1", "DEF"), mk("D2", "DEF"), mk("M1", "MID"), mk("F1", "FWD"), mk("Out", "FWD", false), mk("Any1", "Any")].map((p, i) => ({ id: "r" + (i + 1), num: null, note: "", ...p }));
    const l = RO.autoLineup(list, "4-4-2");
    assert.equal(l.length, 11);
    assert.equal(l[0].name, "Gus");
    assert.deepEqual([l[1].name, l[2].name], ["D1", "D2"]);
    assert.ok(!l.some(p => p && p.name === "Out"));
    assert.equal(new Set(l.filter(Boolean).map(p => p.id)).size, l.filter(Boolean).length);
    assert.equal(l.filter(Boolean).length, 6);
    // a keeper is never used outfield while a spot can stay empty
    const gks = RO.autoLineup([mk("G1", "GK"), mk("G2", "GK")].map((p, i) => ({ id: "r" + i, num: null, note: "", ...p })), "4-4-2");
    assert.equal(gks.filter(Boolean).length, 1);
});

test("board lineup: assign, unlink on rename, formation switch keeps link, auto lineup, no duplicate numbers", () => {
    let b = M.newBoard();
    b = M.assignPlayer(b, "h10", { id: "r3", name: "Marcus", num: 9 });
    let p = M.findPlayer(b, "h10");
    assert.deepEqual([p.rid, p.name, p.num], ["r3", "Marcus", 9]);
    // number already used by another slot: fall back to the slot number
    b = M.assignPlayer(b, "h11", { id: "r4", name: "Eli", num: 9 });
    assert.equal(M.findPlayer(b, "h11").num, 11); // 9 is taken by Marcus
    b = M.setFormation(b, "home", "4-3-3");
    assert.equal(M.findPlayer(b, "h10").rid, "r3");
    b = M.editPlayer(b, "h10", { name: "Marc" });
    assert.equal(M.findPlayer(b, "h10").rid, "");
    b = M.editPlayer(b, "h10", { num: 14 });
    assert.equal(M.findPlayer(b, "h10").num, 14);
    b = M.assignPlayer(b, "h10", null);
    assert.equal(M.findPlayer(b, "h10").name, "");
    const roster = Array.from({ length: 13 }, (_, i) => ({ id: "r" + (i + 1), name: "P" + (i + 1), num: i % 3 === 0 ? 5 : i + 1, pos: "Any", here: true, note: "" }));
    const lineup = RO.autoLineup(roster, "4-4-2").map(x => x);
    const full = M.applyLineup(M.newBoard(), lineup);
    assert.equal(new Set(full.home.map(h => h.num)).size, 11);
    assert.ok(full.home.every(h => h.rid && h.name));
    assert.equal(M.clearLineup(full).home.every(h => !h.rid && !h.name), true);
    assert.deepEqual(M.parseBoard(M.serialize(full)), full);
});
