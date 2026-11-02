import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../js/playbook/fitnessModel.js";

test("speeds follow the published protocol: 8.5 km/h, +0.5 per level", () => {
    assert.equal(F.levelSpeed(1), 8.5);
    assert.equal(F.levelSpeed(2), 9);
    assert.equal(F.levelSpeed(10), 13);
    assert.ok(Math.abs(F.shuttleSeconds(1) - 8.4706) < 0.001);
});

test("shuttles per level match the known table (7,8,8,9,9,10,10,11,11,11,12...)", () => {
    const got = Array.from({ length: 11 }, (_, i) => F.shuttlesInLevel(i + 1));
    assert.deepEqual(got, [7, 8, 8, 9, 9, 10, 10, 11, 11, 11, 12]);
    assert.equal(F.shuttlesInLevel(21), 16);
    assert.equal(Array.from({ length: 21 }, (_, i) => F.shuttlesInLevel(i + 1)).reduce((a, b) => a + b, 0), 247); // the published 21-level total
});

test("levels after the first last at least a minute, and less than a minute plus one shuttle", () => {
    for (let l = 2; l <= F.MAX_LEVEL; l++) {
        const sec = F.shuttlesInLevel(l) * F.shuttleSeconds(l);
        assert.ok(sec >= 60 - 1e-6 && sec <= 60 + F.shuttleSeconds(l) + 1e-6, `level ${l}: ${sec}`);
    }
});

test("schedule is increasing and ends each level", () => {
    const s = F.schedule();
    for (let i = 1; i < s.length; i++) assert.ok(s[i].at > s[i - 1].at);
    assert.equal(s.filter(b => b.last).length, F.MAX_LEVEL);
    assert.equal(s[0].level, 1); assert.equal(s[0].shuttle, 1);
});

test("position and completed shuttle", () => {
    const s = F.schedule();
    assert.deepEqual(F.positionAt(0, s), { level: 1, shuttle: 1, done: false });
    assert.deepEqual(F.positionAt(F.shuttleSeconds(1) + 0.01, s), { level: 1, shuttle: 2, done: false });
    assert.deepEqual(F.completed({ level: 3, shuttle: 4 }), { level: 3, shuttle: 3 });
    assert.deepEqual(F.completed({ level: 3, shuttle: 1 }), { level: 2, shuttle: 8 });
    assert.deepEqual(F.completed({ level: 1, shuttle: 1 }), { level: 0, shuttle: 0 });
    assert.equal(F.scoreText(7, 4), "7.4");
});

test("mile time parses m:ss and rejects nonsense", () => {
    assert.equal(F.parseClock("8:05"), 485);
    assert.equal(F.parseClock("12:30"), 750);
    assert.equal(F.parseClock("8:75"), null);
    assert.equal(F.parseClock("abc"), null);
    assert.equal(F.clockText(485), "8:05");
});

test("results: one per player and day, either test, round trip, bad input ignored", () => {
    let l = [];
    l = F.setResult(l, { name: "Sam", date: "2027-01-05", test: "mile", value: { seconds: 485, nonstop: true } });
    l = F.setResult(l, { name: "sam", date: "2027-01-05", test: "beep", value: { level: 7, shuttle: 4 } });
    assert.equal(l.length, 1);
    assert.deepEqual(l[0].mile, { seconds: 485, nonstop: true });
    assert.deepEqual(l[0].beep, { level: 7, shuttle: 4 });
    assert.equal(F.setResult(l, { name: "", date: "2027-01-05", test: "mile", value: {} }).length, 1);
    assert.equal(F.setResult(l, { name: "Al", date: "bad", test: "mile", value: {} }).length, 1);
    assert.deepEqual(F.parse(F.serialize(l)), l);
    assert.deepEqual(F.parse("nope"), []);
    assert.equal(F.removeResult(l, "SAM", "2027-01-05").length, 0);
});

test("mile run: finish by name, walked toggles on and off, undo", () => {
    let m = F.newMile(1000, "2027-01-05");
    m = F.finishMile(m, "Sam", 1000 + 485000);
    assert.equal(m.finished.Sam, 485);
    assert.equal(F.finishMile(m, "sam", 1000 + 600000).finished.Sam, 485, "a second tap does not overwrite");
    assert.equal(F.hasWalked(m, "Alex"), false);
    m = F.toggleWalked(m, "Alex");
    assert.equal(F.hasWalked(m, "alex"), true);
    m = F.toggleWalked(m, "ALEX");
    assert.equal(F.hasWalked(m, "Alex"), false);
    m = F.undoFinish(m, "SAM");
    assert.deepEqual(m.finished, {});
    assert.equal(F.finishMile(m, "", 5000), m);
});

test("mile run state survives save and load; junk is null", () => {
    let m = F.finishMile(F.newMile(1000, "2027-01-05"), "Sam", 301000);
    m = F.toggleWalked(m, "Sam");
    assert.deepEqual(F.parseMile(F.serializeMile(m)), m);
    assert.equal(F.parseMile("nope"), null);
    assert.equal(F.parseMile(JSON.stringify({ app: "playbook-mile", startedAt: "x", date: "bad" })), null);
    assert.equal(F.elapsedSec(F.newMile(5000, "2027-01-05"), 4000), 0);
});

test("extra names are kept once; clearing one test keeps the other", () => {
    let m = F.addName(F.addName(F.newMile(1, "2027-01-05"), "Jo"), "jo");
    assert.deepEqual(m.names, ["Jo"]);
    assert.deepEqual(F.parseMile(F.serializeMile(m)).names, ["Jo"]);
    let l = F.setResult([], { name: "Sam", date: "2027-01-05", test: "mile", value: { seconds: 480, nonstop: true } });
    l = F.setResult(l, { name: "Sam", date: "2027-01-05", test: "beep", value: { level: 5, shuttle: 2 } });
    const c = F.clearTest(l, "SAM", "2027-01-05", "mile");
    assert.equal(c.length, 1); assert.equal(c[0].mile, undefined); assert.deepEqual(c[0].beep, { level: 5, shuttle: 2 });
    assert.equal(F.clearTest(c, "Sam", "2027-01-05", "beep").length, 0);
});
