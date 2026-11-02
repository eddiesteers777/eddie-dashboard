import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/playbook/seasonModel.js";
import * as T from "../js/playbook/teamModel.js";

const game = { date: "2027-02-04", kind: "game", opp: "Opponent A", time: "16:30", arrive: "15:45", site: "home", place: "Field 2" };

test("weekStart gives the Monday and weekDays covers seven days", () => {
    assert.equal(S.weekStart("2027-02-04"), "2027-02-01");
    assert.equal(S.weekStart("2027-02-07"), "2027-02-01");
    assert.equal(S.weekStart("2027-02-01"), "2027-02-01");
    const days = S.weekDays(T.emptyTeam(), "2027-02-01");
    assert.equal(days.length, 7); assert.equal(days[6].date, "2027-02-07");
});
test("a game keeps its schedule details through save and reload", () => {
    const r = S.saveItem(T.emptyTeam(), game);
    assert.ok(r.id);
    const back = T.loadTeam(T.serializeTeam(r.team));
    const s = back.sessions[0];
    assert.deepEqual([s.opp, s.time, s.arrive, s.site, s.place], ["Opponent A", "16:30", "15:45", "home", "Field 2"]);
});
test("junk schedule fields are dropped on load", () => {
    const text = JSON.stringify({ app: "playbook-team", v: 1, sessions: [{ id: "s1", date: "2027-02-04", kind: "practice", time: "99:99", site: "moon", opp: "x", place: 5, planId: 7 }] });
    const s = T.loadTeam(text).sessions[0];
    assert.equal(s.time, undefined); assert.equal(s.site, undefined); assert.equal(s.opp, undefined); assert.equal(s.place, undefined); assert.equal(s.planId, undefined);
});
test("only one game and one practice per day", () => {
    let r = S.saveItem(T.emptyTeam(), game);
    assert.equal(S.saveItem(r.team, game).error, "taken");
    assert.ok(S.saveItem(r.team, { date: game.date, kind: "practice" }).id);
});
test("editing changes the details and refuses a date that is taken", () => {
    let r = S.saveItem(T.emptyTeam(), game); const id = r.id;
    r = S.saveItem(r.team, { id, date: "2027-02-05", kind: "game", opp: "Opponent B", time: "17:00" });
    const s = r.team.sessions.find(x => x.id === id);
    assert.equal(s.date, "2027-02-05"); assert.equal(s.opp, "Opponent B"); assert.equal(s.site, undefined);
    const two = S.saveItem(r.team, { date: "2027-02-09", kind: "game", opp: "C" });
    assert.equal(S.saveItem(two.team, { id, date: "2027-02-09", kind: "game" }).error, "taken");
});
test("nextGame skips past games and games with no details", () => {
    let t = S.saveItem(T.emptyTeam(), { ...game, date: "2027-01-28" }).team;
    t = S.saveItem(t, game).team;
    t = T.openSession(t, "2027-02-02", "game").team; // an old attendance-only game with no opponent
    const n = S.nextGame(t, "2027-02-01");
    assert.equal(n.session.date, "2027-02-04"); assert.equal(n.days, 3);
    assert.equal(S.nextGame(t, "2027-03-01"), null);
});
test("practice days before the first game count distinct practice dates only for that game", () => {
    let t = T.emptyTeam();
    const rep = S.repeatPractices(t, "2027-01-18", "2027-02-03", [1, 2, 3, 4, 5]);
    assert.equal(rep.added, 13);
    t = S.saveItem(rep.team, game).team;
    const g = t.sessions.find(s => s.kind === "game");
    assert.deepEqual(S.practiceDaysBefore(t, g), { have: 13, need: 13 });
    const later = S.saveItem(t, { ...game, date: "2027-02-10", opp: "B" });
    assert.equal(S.practiceDaysBefore(later.team, later.team.sessions.find(s => s.id === later.id)), null);
});
test("repeatPractices skips existing days, bad ranges and the wrong weekdays", () => {
    let t = S.saveItem(T.emptyTeam(), { date: "2027-02-01", kind: "practice" }).team;
    const r = S.repeatPractices(t, "2027-02-01", "2027-02-07", [1, 3]);
    assert.equal(r.added, 1); // Wednesday only; Monday already had one
    assert.equal(S.repeatPractices(t, "2027-02-07", "2027-02-01", [1]).added, 0);
    assert.equal(S.repeatPractices(t, "2027-01-01", "2027-12-31", [1]).added, 0);
});
test("attaching a plan and removing an item also removes its runs", () => {
    let r = S.saveItem(T.emptyTeam(), { date: "2027-02-01", kind: "practice" });
    let t = S.setPlan(r.team, r.id, "p123");
    assert.equal(t.sessions[0].planId, "p123");
    assert.equal(S.setPlan(t, r.id, "").sessions[0].planId, undefined);
    t = { ...t, runs: [{ id: "x1", rid: "a", sid: r.id, owed: "2 laps", done: false, doneAt: 0 }] };
    const gone = S.removeItem(t, r.id);
    assert.equal(gone.sessions.length, 0); assert.equal(gone.runs.length, 0);
});
test("bad input never throws", () => {
    assert.equal(S.saveItem(T.emptyTeam(), { date: "nope", kind: "game" }).error, "bad");
    assert.equal(S.saveItem(T.emptyTeam(), { date: "2027-02-01", kind: "other" }).error, "bad");
    assert.equal(S.saveItem(T.emptyTeam(), { id: "zzz", date: "2027-02-01" }).error, "missing");
});

test("month view: weeks cover the month, Monday first, items on their day", () => {
    let team = T.emptyTeam();
    team = S.saveItem(team, { date: "2027-02-04", kind: "game", opp: "Chelsea", time: "16:00" }).team;
    team = S.saveItem(team, { date: "2027-02-01", kind: "practice" }).team;
    const weeks = S.monthWeeks(team, "2027-02-17");
    assert.equal(weeks.length, 4); // Feb 2027 runs Mon Feb 1 to Sun Feb 28
    assert.ok(weeks.every(w => w.length === 7));
    assert.equal(weeks[0][0].date, "2027-02-01");
    assert.equal(weeks[0][3].items[0].opp, "Chelsea");
    assert.equal(weeks[0][0].items[0].kind, "practice");
    const jan = S.monthWeeks(team, "2027-01-10");
    assert.equal(jan[0][0].inMonth, false); // Mon Dec 28 is outside January
    assert.equal(jan.at(-1)[6].date, "2027-01-31");
});
test("addMonths lands on the first of the month, across a year end", () => {
    assert.equal(S.addMonths("2026-12-31", 1), "2027-01-01");
    assert.equal(S.addMonths("2027-01-15", -1), "2026-12-01");
    assert.equal(S.addMonths("2027-03-31", -1), "2027-02-01");
});
