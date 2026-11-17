import test from "node:test";
import assert from "node:assert/strict";
import { soccerRoster } from "../js/soccerRoster.js";

const dir = [
    { uid: "a", displayName: "Ava", services: ["soccer_group"], status: "active" },
    { uid: "b", displayName: "Ben", services: ["running"], status: "active" },
    { uid: "c", displayName: "Cy", services: ["soccer_1on1"], status: "pending" },
    { uid: "d", displayName: "Dee", services: ["soccer_1on1", "running"], status: "active" },
    { displayName: "No uid", services: ["soccer_group"], status: "active" }
];

test("only active clients with a soccer service make the roster", () => {
    const r = soccerRoster(dir, []);
    assert.deepEqual(r.links.map(l => l.clientUid), ["a", "d"]);
    assert.equal(r.profiles.get("d").displayName, "Dee");
});

test("mine marks the players already linked to this coach", () => {
    const r = soccerRoster(dir, [{ clientUid: "d" }, { clientUid: "zzz" }]);
    assert.equal(r.mine.has("d"), true);
    assert.equal(r.mine.has("a"), false);
});

test("empty input is an empty roster", () => {
    const r = soccerRoster(undefined, undefined);
    assert.equal(r.links.length, 0);
});
