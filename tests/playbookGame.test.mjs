import test from "node:test";
import assert from "node:assert/strict";
import * as G from "../js/playbook/gameModel.js";
import * as T from "../js/playbook/teamModel.js";
import * as S from "../js/playbook/sampleModel.js";

const sample = S.loadSample([], T.emptyTeam(), new Date(2026, 9, 21));
const roster = sample.roster;
const mk = (periods, ids = roster.map(p => p.id)) => G.setSquad(G.setPeriods(G.newGame(), periods), ids);

test("slot positions follow the formation", () => {
    assert.deepEqual(G.slotPositions("4-3-3"), ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD"]);
    assert.equal(G.slotPositions("4-2-3-1").length, 11);
});
test("auto plan: 14 players, two halves, nobody twice, one goalkeeper all game", () => {
    const g = G.autoPlan(mk(2), roster);
    for (const row of g.lineups) { assert.equal(row.filter(Boolean).length, 11); assert.equal(new Set(row).size, 11); }
    assert.equal(g.lineups[0][0], "r1"); assert.equal(g.lineups[1][0], "r1");
    const m = G.minutes(g);
    assert.ok(Object.values(m).every(v => v === 30 || v === 60));
    assert.equal(G.changes(g)[0].off.length, 3);
});
test("auto plan: four quarters spreads minutes within one period", () => {
    const g = G.autoPlan(mk(4), roster);
    const s = G.spread(g);
    assert.ok(s.max - s.min <= g.minutes, JSON.stringify(s));
    assert.equal(g.lineups.length, 4);
});
test("auto plan keeps position matches where it can", () => {
    const g = G.autoPlan(mk(2), roster), pos = G.slotPositions(g.formation);
    const byId = Object.fromEntries(roster.map(p => [p.id, p]));
    const ok = g.lineups[0].filter((r, i) => byId[r].pos === pos[i]).length;
    assert.ok(ok >= 8, "matched " + ok);
});
test("a short squad leaves empty slots instead of failing", () => {
    const g = G.autoPlan(mk(2, roster.slice(0, 8).map(p => p.id)), roster);
    assert.equal(g.lineups[0].filter(Boolean).length, 8);
    assert.equal(G.autoPlan(G.newGame(), roster).lineups[0].filter(Boolean).length, 0);
});
test("setSlot swaps, ignores outsiders; leaving the squad clears slots", () => {
    let g = G.autoPlan(mk(2), roster);
    const a = g.lineups[0][1], b = g.lineups[0][2];
    g = G.setSlot(g, 0, 1, b);
    assert.equal(g.lineups[0][1], b); assert.equal(g.lineups[0][2], a);
    assert.equal(G.setSlot(g, 0, 1, "zzz"), g);
    g = G.toggleSquad(g, b);
    assert.ok(!g.lineups.flat().includes(b));
});
test("changing format or formation resets sensibly", () => {
    const g = G.autoPlan(mk(2), roster);
    assert.equal(G.setFormation(g, "4-3-3").lineups[0].filter(Boolean).length, 0);
    const q = G.setPeriods(g, 4);
    assert.equal(q.lineups.length, 4); assert.equal(q.minutes, 15); assert.equal(q.lineups[0][0], "r1"); assert.equal(q.lineups[3][0], "");
});
test("a game plan survives save and load on the team, bad data is cleaned", () => {
    let t = T.emptyTeam();
    const o = T.openSession(t, "2026-10-24", "game");
    const g = G.autoPlan(mk(2), roster);
    t = T.setGame(o.team, o.id, G.setOpponent(g, "Pelham"));
    const back = T.loadTeam(T.serializeTeam(t));
    assert.deepEqual(back.sessions[0].game, t.sessions[0].game);
    const bad = JSON.parse(T.serializeTeam(t));
    bad.sessions[0].game.formation = "9-9"; bad.sessions[0].game.lineups[0][3] = "ghost"; bad.sessions[0].game.minutes = 9999;
    const clean = T.loadTeam(JSON.stringify(bad)).sessions[0].game;
    assert.equal(clean.formation, "4-4-2"); assert.equal(clean.minutes, 60); assert.equal(clean.lineups[0][3], "");
    const prac = JSON.parse(T.serializeTeam(T.openSession(T.emptyTeam(), "2026-10-25", "practice").team));
    prac.sessions[0].game = bad.sessions[0].game;
    assert.equal(T.loadTeam(JSON.stringify(prac)).sessions[0].game, undefined);
});
