import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../js/playbook/teamModel.js";

const roster = ["a", "b", "c", "d"].map((id, i) => ({ id, name: id.toUpperCase(), num: i, pos: "Any", here: true, note: "" }));
const open = (t, d, k = "practice") => T.openSession(t, d, k);

test("opening the same day and kind twice gives the same session", () => {
    let r = open(T.emptyTeam(), "2026-10-20");
    const again = open(r.team, "2026-10-20");
    assert.equal(again.id, r.id);
    assert.equal(again.team.sessions.length, 1);
    assert.notEqual(open(r.team, "2026-10-20", "game").id, r.id);
    assert.equal(open(r.team, "nope").id, null);
});

test("absent owes a run once; changing the mark takes it back; a finished run stays", () => {
    let { team, id } = open(T.emptyTeam(), "2026-10-20");
    team = T.setMark(team, id, "a", "absent");
    team = T.setMark(team, id, "a", "absent");
    assert.equal(T.pendingRuns(team).length, 1);
    assert.equal(T.pendingRuns(team)[0].owed, "2 laps");
    team = T.setMark(team, id, "a", "excused");
    assert.equal(T.pendingRuns(team).length, 0);
    team = T.setMark(team, id, "b", "absent");
    team = T.setRunDone(team, team.runs[0].id, true);
    team = T.setMark(team, id, "b", "here");
    assert.equal(team.runs.length, 1); // kept as a record
    assert.equal(T.pendingRuns(team).length, 0);
    team = T.setMark(team, id, "b", null);
    assert.equal(T.counts(team, id).here, 0);
});

test("the penalty is copied onto the run when it is created", () => {
    let { team, id } = open(T.setPenalty(T.emptyTeam(), "10 pushups"), "2026-10-20");
    team = T.setMark(team, id, "a", "absent");
    team = T.setPenalty(team, "3 laps");
    assert.equal(team.runs[0].owed, "10 pushups");
});

test("everyone here only fills in players not yet marked", () => {
    let { team, id } = open(T.emptyTeam(), "2026-10-20");
    team = T.setMark(team, id, "a", "absent");
    team = T.markAll(team, id, roster.map(p => p.id), "here");
    assert.deepEqual(T.counts(team, id), { here: 3, late: 0, absent: 1, excused: 0 });
});

test("season numbers ignore excused days and count late as attended", () => {
    let t = T.emptyTeam();
    for (const [d, m] of [["2026-10-01", "here"], ["2026-10-02", "late"], ["2026-10-03", "absent"], ["2026-10-04", "excused"]]) {
        const r = open(t, d); t = T.setMark(r.team, r.id, "a", m);
    }
    assert.deepEqual(T.attendance(t, "a"), { here: 1, late: 1, absent: 1, excused: 1, counted: 3, streak: 1, pct: 67 });
    assert.equal(T.attendance(t, "zzz").pct, null);
});

test("duty rotates fairly, skips the absent, and avoids double jobs", () => {
    let t = T.emptyTeam();
    t = { ...t, jobs: [{ id: "j1", name: "Balls", count: 1 }, { id: "j2", name: "Cones", count: 1 }] };
    const seen = new Map();
    for (const d of ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]) {
        const r = open(t, d); t = r.team;
        t = T.markAll(t, r.id, roster.map(p => p.id), "here");
        t = T.setMark(t, r.id, "d", "absent");
        t = T.suggestDuty(t, r.id, roster);
        const duty = t.sessions.find(s => s.id === r.id).duty;
        assert.notEqual(duty.j1[0], duty.j2[0]);
        assert.ok(![...duty.j1, ...duty.j2].includes("d"));
        for (const rid of [...duty.j1, ...duty.j2]) seen.set(rid, (seen.get(rid) || 0) + 1);
    }
    // 3 players, 2 jobs a day, 4 days = 8 slots: nobody does more than 3
    assert.ok(Math.max(...seen.values()) <= 3, JSON.stringify([...seen]));
    assert.equal(seen.size, 3);
});

test("suggest with keep leaves hand-picked jobs alone", () => {
    let { team, id } = open(T.emptyTeam(), "2026-10-01");
    team = T.setDuty(team, id, "j1", ["c"]);
    team = T.suggestDuty(team, id, roster, { keep: true });
    assert.deepEqual(team.sessions[0].duty.j1, ["c"]);
    assert.equal(team.sessions[0].duty.j2.length, 2);
});

test("saving and loading keeps ids, drops junk, keeps links", () => {
    let { team, id } = open(T.emptyTeam(), "2026-10-01");
    const r2 = open(team, "2026-10-05", "game"); team = r2.team;
    team = T.setMark(team, id, "a", "absent");
    team = T.addJob(team, "Pick up trash", 3);
    const back = T.parseTeam(T.serializeTeam(team));
    assert.deepEqual(back.sessions.map(s => s.id), team.sessions.map(s => s.id));
    assert.equal(back.runs[0].sid, id);
    assert.equal(back.jobs.at(-1).count, 3);
    assert.equal(T.parseTeam("not json"), null);
    const junk = T.parseTeam(JSON.stringify({ app: "playbook-team", sessions: [{ date: "x", kind: "practice" }, { id: "s1", date: "2026-10-01", kind: "game" }, { id: "s1", date: "2026-10-02", kind: "game" }], runs: [{ sid: "nope", rid: "a" }] }));
    assert.equal(junk.sessions.length, 2);
    assert.equal(new Set(junk.sessions.map(s => s.id)).size, 2);
    assert.equal(junk.runs.length, 0);
    assert.equal(T.loadTeam("").sessions.length, 0);
});

test("deleting a session removes its runs; removing a job clears it from sessions", () => {
    let { team, id } = open(T.emptyTeam(), "2026-10-01");
    team = T.setMark(team, id, "a", "absent");
    team = T.setDuty(team, id, "j1", ["a"]);
    assert.equal(T.removeJob(team, "j1").sessions[0].duty.j1, undefined);
    assert.equal(T.deleteSession(team, id).runs.length, 0);
});

test("captain rotates through the players who came, and saves", () => {
    let { team, id } = open(T.emptyTeam(), "2026-10-01");
    team = T.markAll(team, id, ["a", "b", "c"], "here");
    team = T.suggestCaptain(team, id, roster);
    const first = team.sessions[0].captain;
    const seen = new Set([first]);
    for (const d of ["2026-10-02", "2026-10-03"]) {
        const r = open(team, d); team = T.markAll(r.team, r.id, ["a", "b", "c"], "here");
        team = T.suggestCaptain(team, r.id, roster);
        seen.add(team.sessions.find(s => s.id === r.id).captain);
    }
    assert.equal(seen.size, 3);
    assert.ok(!seen.has("d"));
    assert.equal(T.parseTeam(T.serializeTeam(team)).sessions[0].captain, first);
    assert.equal(T.captainCount(team, first), 1);
});

test("players who keep missing are flagged; excused days don't break a streak", () => {
    let t = T.emptyTeam();
    for (const [d, m] of [["2026-10-01", "here"], ["2026-10-02", "absent"], ["2026-10-03", "excused"], ["2026-10-04", "absent"]]) {
        const r = open(t, d); t = T.setMark(r.team, r.id, "a", m);
    }
    assert.equal(T.attendance(t, "a").streak, 2);
    assert.deepEqual(T.needsAttention(t, roster).map(x => x.p.id), ["a"]);
    const r = open(t, "2026-10-05"); t = T.setMark(r.team, r.id, "a", "late");
    assert.equal(T.attendance(t, "a").streak, 0);
});

test("parent contacts: saved per player, cleaned, and links only for real numbers", () => {
    let m = T.setContact({}, "a", "  Dana  ", "(205) 555-0142");
    assert.equal(m.a.parent, "Dana");
    assert.equal(T.phoneHref("tel", m.a.phone), "tel:2055550142");
    assert.equal(T.phoneHref("sms", "123"), null);
    assert.deepEqual(T.parseContacts(T.serializeContacts(m)), m);
    assert.deepEqual(T.setContact(m, "a", "", ""), {});
    assert.deepEqual(T.parseContacts("junk"), {});
});
