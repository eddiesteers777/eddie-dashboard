import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/playbook/sampleModel.js";
import * as T from "../js/playbook/teamModel.js";
import * as R from "../js/playbook/rosterModel.js";

const now = new Date(2026, 9, 21);
test("sample fills the roster and three days with runs", () => {
    const r = S.loadSample([], T.emptyTeam(), now);
    assert.equal(r.roster.length, 14);
    assert.ok(r.roster.every(S.isSample));
    assert.equal(r.team.sessions.length, 3);
    assert.ok(r.team.runs.length >= 3);
    assert.ok(r.team.runs.some(x => x.done) && r.team.runs.some(x => !x.done));
    assert.ok(r.team.sessions.every(s => s.captain && Object.keys(s.duty).length));
    assert.ok(S.hasSample(r.roster, r.team));
    assert.ok(R.parseRoster(R.serializeRoster(r.roster)).length === 14);
});
test("sample never loads over a real roster", () => {
    assert.equal(S.loadSample([{ id: "r1", name: "Real", num: null, pos: "Any", here: true, note: "" }], T.emptyTeam(), now), null);
});
test("removing keeps real players and days", () => {
    const s = S.loadSample([], T.emptyTeam(), now);
    const real = { id: "r99", name: "Real", num: null, pos: "Any", here: true, note: "" };
    const o = T.openSession(s.team, "2026-10-01", "practice");
    const out = S.removeSample([...s.roster, real], o.team);
    assert.deepEqual(out.roster.map(p => p.id), ["r99"]);
    assert.equal(out.team.sessions.length, 1);
    assert.equal(out.team.runs.length, 0);
    assert.ok(!S.hasSample(out.roster, out.team));
});
