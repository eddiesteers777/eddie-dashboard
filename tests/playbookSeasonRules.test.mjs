import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/playbook/seasonModel.js";
import * as R from "../js/playbook/seasonRules.js";
import * as T from "../js/playbook/teamModel.js";
import * as P from "../js/playbook/practiceModel.js";
import { SEED_DRILLS } from "../js/playbook/drillSeed.js";
import { mergeSeeds } from "../js/playbook/drillModel.js";

const TODAY = "2027-01-20";
const mk = items => items.reduce((t, it) => S.saveItem(t, it).team, T.emptyTeam());
const game = (date, opp = "A") => ({ date, kind: "game", opp, time: "16:30" });
const prac = date => ({ date, kind: "practice" });
const ids = list => list.map(s => s.id.split(":")[0]);

test("a practice the day before a game gets a light-day suggestion that is not applied", () => {
    const t = mk([game("2027-02-04"), prac("2027-02-03"), prac("2027-02-02")]);
    const l = R.suggestions(t, TODAY).filter(s => s.kind === "light");
    assert.equal(l.length, 1); assert.equal(l[0].date, "2027-02-03"); assert.equal(l[0].action, "light");
    assert.equal(t.sessions.find(s => s.date === "2027-02-03").planId, undefined);
});
test("the day after a game suggests recovery, a game-day practice is only questioned", () => {
    const t = mk([game("2027-02-04"), prac("2027-02-05"), prac("2027-02-04")]);
    const l = R.suggestions(t, TODAY);
    assert.ok(l.some(s => s.kind === "recovery" && s.date === "2027-02-05" && s.action === "recovery"));
    assert.ok(l.some(s => s.kind === "sameday" && s.action === null));
});
test("a cancelled practice gets no suggestion and nothing is made up for it", () => {
    let t = mk([game("2027-02-04"), prac("2027-02-03")]);
    t = S.setCancelled(t, t.sessions.find(s => s.kind === "practice").id, true);
    assert.deepEqual(R.suggestions(t, TODAY).filter(s => s.kind === "light"), []);
    assert.ok(t.sessions.find(s => s.kind === "practice").cancelled);
    assert.equal(S.setCancelled(t, t.sessions.find(s => s.kind === "practice").id, false).sessions.find(s => s.kind === "practice").cancelled, undefined);
});
test("two games within 7 days are flagged once", () => {
    const l = R.suggestions(mk([game("2027-02-04"), game("2027-02-09", "B"), game("2027-02-25", "C")]), TODAY);
    assert.equal(l.filter(s => s.kind === "twoGames").length, 1);
});
test("the 13-day count only warns near the first game and only while short", () => {
    const far = mk([game("2027-03-30")]);
    assert.equal(R.suggestions(far, TODAY).some(s => s.kind === "count"), false);
    const short = mk([game("2027-02-04"), prac("2027-01-25"), prac("2027-01-26")]);
    assert.ok(R.suggestions(short, TODAY).some(s => s.kind === "count" && /2 of 13/.test(s.text)));
    const rep = S.repeatPractices(T.emptyTeam(), "2027-01-18", "2027-02-03", [1, 2, 3, 4, 5]).team;
    assert.equal(R.suggestions(S.saveItem(rep, game("2027-02-04")).team, TODAY).some(s => s.kind === "count"), false);
});
test("cancelled practices do not count toward the 13", () => {
    let t = S.saveItem(S.repeatPractices(T.emptyTeam(), "2027-01-18", "2027-02-03", [1, 2, 3, 4, 5]).team, game("2027-02-04")).team;
    t = S.setCancelled(t, t.sessions.find(s => s.kind === "practice").id, true);
    assert.deepEqual(S.practiceDaysBefore(t, t.sessions.find(s => s.kind === "game")), { have: 12, need: 13 });
});
test("practices outside the season window are flagged by week, and the window is editable", () => {
    let t = mk([prac("2026-12-07"), prac("2026-12-08"), prac("2027-02-02")]);
    const w = R.suggestions(t, "2026-11-01").filter(s => s.kind === "window");
    assert.equal(w.length, 1); assert.match(w[0].text, /2 practices are outside/);
    t = S.setWindow(t, "2026-12-01", "2027-04-17");
    assert.equal(R.suggestions(t, "2026-11-01").some(s => s.kind === "window"), false);
    assert.equal(S.setWindow(t, "2027-05-01", "2027-04-01"), t);
});
test("past practices are not suggested about, and Skip hides a suggestion for good", () => {
    let t = mk([game("2027-02-04"), prac("2027-02-03")]);
    assert.equal(R.suggestions(t, "2027-02-10").length, 0);
    const sug = R.suggestions(t, TODAY).find(s => s.kind === "light");
    t = S.handle(t, sug.id);
    assert.equal(R.suggestions(t, TODAY).some(s => s.kind === "light"), false);
    assert.equal(R.suggestions(T.loadTeam(T.serializeTeam(t)), TODAY).some(s => s.kind === "light"), false);
});
test("cancelled, window and handled survive a save and reload; junk is dropped", () => {
    let t = mk([prac("2027-02-03")]);
    t = S.setCancelled(S.setWindow(S.handle(t, "x:1"), "2027-01-18", "2027-04-17"), t.sessions[0].id, true);
    const back = T.loadTeam(T.serializeTeam(t));
    assert.equal(back.sessions[0].cancelled, true); assert.deepEqual(back.season, { start: "2027-01-18", end: "2027-04-17" }); assert.deepEqual(back.handled, ["x:1"]);
    const junk = T.parseTeam(JSON.stringify({ app: "playbook-team", v: 1, season: { start: "nope", end: 5 }, handled: [1, "ok", "y".repeat(99)], sessions: [{ id: "s1", date: "2027-02-03", kind: "game", cancelled: true }] }));
    assert.equal(junk.season, undefined); assert.deepEqual(junk.handled, ["ok"]); assert.equal(junk.sessions[0].cancelled, undefined);
});
test("recovery mode picks only easy drills and light mode keeps high-intensity out", () => {
    const drills = mergeSeeds([], SEED_DRILLS);
    const rec = P.suggestPlan({ drills, total: 60, players: 18, equipment: ["cones", "balls", "pinnies", "smallGoals", "goals"], recovery: true });
    const by = new Map(drills.map(d => [d.id, d]));
    assert.ok(rec.items.length > 0 && rec.items.every(i => by.get(i.drillId).intensity === "Low"));
    const light = P.suggestPlan({ drills, total: 75, players: 18, equipment: ["cones", "balls", "pinnies", "smallGoals", "goals"], gameInDays: 1 });
    assert.ok(light.items.length > 0 && light.items.every(i => by.get(i.drillId).intensity !== "High"));
});
test("suggestions come back sorted and ids are stable", () => {
    const t = mk([game("2027-02-04"), prac("2027-02-03"), prac("2027-02-05")]);
    const a = R.suggestions(t, TODAY), b = R.suggestions(t, TODAY);
    assert.deepEqual(a, b); assert.deepEqual(a.map(s => s.date), [...a.map(s => s.date)].sort());
    assert.ok(ids(a).includes("light") && ids(a).includes("recovery"));
});
