import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/playbook/liveModel.js";
import { newGame, setSquad, autoPlan } from "../js/playbook/gameModel.js";

const roster = Array.from({ length: 14 }, (_, i) => ({ id: "r" + i, name: "P" + i, num: i + 1, pos: i === 0 ? "GK" : "Any" }));
const game = autoPlan(setSquad(newGame(), roster.map(p => p.id)), roster);
const T0 = 1_000_000;

test("a new clock is ready with the period's full time", () => {
    const l = L.newLive(game, "2027-02-06");
    assert.equal(l.status, "ready");
    assert.equal(L.remaining(l, T0), 30 * 60000);
});

test("start counts down from a deadline; pause and resume keep the time", () => {
    let l = L.start(L.newLive(game, "d"), T0);
    assert.equal(L.remaining(l, T0 + 60000), 29 * 60000);
    l = L.pause(l, T0 + 60000);
    assert.equal(l.status, "paused");
    assert.equal(L.remaining(l, T0 + 999999), 29 * 60000);
    l = L.resume(l, T0 + 500000);
    assert.equal(L.remaining(l, T0 + 560000), 28 * 60000);
});

test("the period is over when time runs out, and the clock never goes negative", () => {
    const l = L.start(L.newLive(game, "d"), T0);
    assert.equal(L.isOver(l, T0 + 29 * 60000), false);
    assert.equal(L.isOver(l, T0 + 31 * 60000), true);
    assert.equal(L.remaining(l, T0 + 40 * 60000), 0);
});

test("adding a minute works running, ready and paused", () => {
    const l = L.start(L.newLive(game, "d"), T0);
    assert.equal(L.remaining(L.addMinute(l, T0), T0), 31 * 60000);
    assert.equal(L.remaining(L.addMinute(L.newLive(game, "d"), T0), T0), 31 * 60000);
    assert.equal(L.remaining(L.addMinute(L.pause(l, T0), T0, -5), T0), 25 * 60000);
});

test("next period resets the clock, and the last one ends the game", () => {
    let l = L.nextPeriod(L.start(L.newLive(game, "d"), T0), game);
    assert.equal(l.period, 1);
    assert.equal(l.status, "ready");
    assert.equal(L.remaining(l, T0), 30 * 60000);
    l = L.nextPeriod(l, game);
    assert.equal(L.isFinal(l), true);
});

test("goals stay between 0 and 99", () => {
    let l = L.newLive(game, "d");
    l = L.goal(l, "us", 1); l = L.goal(l, "us", 1);
    assert.equal(l.us, 2);
    assert.equal(L.goal(l, "them", -1).them, 0);
    assert.equal(L.goal({ ...l, us: 99 }, "us", 1).us, 99);
});

test("changeInto reports who comes off and on at the break, nothing at the start", () => {
    assert.equal(L.changeInto(game, 0), null);
    const c = L.changeInto(game, 1);
    assert.ok(c && c.on.length > 0 && c.off.length === c.on.length);
});

test("a saved clock only fits its own date and a period the game has", () => {
    const l = L.newLive(game, "2027-02-06");
    assert.equal(L.fits(l, "2027-02-06", game), true);
    assert.equal(L.fits(l, "2027-02-07", game), false);
    assert.equal(L.fits({ ...l, period: 3 }, "2027-02-06", game), false);
    assert.equal(L.fits(null, "x", game), false);
});

test("serialize and parse round-trip; bad text is rejected", () => {
    const l = L.start(L.newLive(game, "d"), T0);
    assert.deepEqual(L.parseLive(L.serializeLive(l)), l);
    assert.equal(L.parseLive("nope"), null);
    assert.equal(L.parseLive(JSON.stringify({ v: 2 })), null);
    assert.equal(L.parseLive(JSON.stringify({ v: 1, date: "d", status: "weird", us: 500 })).us, 99);
});
