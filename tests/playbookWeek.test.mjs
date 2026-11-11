import test from "node:test";
import assert from "node:assert/strict";
import { weekView, countdown, dayText, timeText } from "../js/playbook/weekModel.js";
import { emptyTeam } from "../js/playbook/teamModel.js";

const now = new Date("2027-02-04T08:00:00"); // a Thursday morning
const team = sessions => ({ ...emptyTeam(), sessions });
const s = (id, date, kind, extra = {}) => ({ id, date, kind, marks: {}, ...extra });

test("countdown with a start time shows days and hours, then hours and minutes", () => {
    assert.equal(countdown("2027-02-06", "10:00", now), "2d 2h");
    assert.equal(countdown("2027-02-04", "13:20", now), "5h 20m");
    assert.equal(countdown("2027-02-04", "08:30", now), "30m");
    assert.equal(countdown("2027-02-04", "07:00", now), "Now");
    assert.equal(countdown("2027-02-04", "02:00", now), "Started");
});

test("countdown without a time uses plain words", () => {
    assert.equal(countdown("2027-02-04", "", now), "Today");
    assert.equal(countdown("2027-02-05", "", now), "Tomorrow");
    assert.equal(countdown("2027-02-09", "", now), "In 5 days");
});

test("an empty team shows nothing and says so", () => {
    const v = weekView(emptyTeam(), now);
    assert.equal(v.empty, true);
    assert.equal(v.game, null);
    assert.equal(v.practice, null);
});

test("the next game and next practice come from the schedule, past ones are skipped", () => {
    const v = weekView(team([
        s("a", "2027-02-01", "game", { opp: "Old", time: "10:00" }),
        s("b", "2027-02-06", "game", { opp: "Pelham", time: "10:00", arrive: "09:15", site: "home", place: "Field 2" }),
        s("c", "2027-02-03", "practice"),
        s("d", "2027-02-05", "practice", { time: "15:30", planId: "p1" }),
        s("e", "2027-02-05", "practice", { cancelled: true })
    ]), now);
    assert.equal(v.empty, false);
    assert.equal(v.game.id, "b");
    assert.equal(v.game.title, "vs Pelham");
    assert.equal(v.game.arrive, "9:15 AM");
    assert.equal(v.game.where, "Home · Field 2");
    assert.equal(v.game.count, "2d 2h");
    assert.equal(v.game.hasLineup, false);
    assert.equal(v.practice.id, "d");
    assert.equal(v.practice.planId, "p1");
    assert.equal(v.practice.when, "Fri Feb 5 · 3:30 PM");
});

test("an away game reads 'at'", () => {
    assert.equal(weekView(team([s("g", "2027-02-06", "game", { opp: "Helena", site: "away", time: "10:00" })]), now).game.title, "at Helena");
});

test("date and time text are safe on bad input", () => {
    assert.equal(dayText("nope"), "");
    assert.equal(timeText(""), "");
    assert.equal(timeText("12:00"), "12 PM");
});

test("a game with a lineup says so, so the home page can offer Game day", () => {
    const lineups = [["a", "b"], ["a", "c"]];
    const v = weekView(team([s("g", "2027-02-06", "game", { opp: "X", time: "10:00", game: { lineups } })]), now);
    assert.equal(v.game.hasLineup, true);
    assert.equal(weekView(team([s("g", "2027-02-06", "game", { opp: "X", time: "10:00", game: { lineups: [[""], [""]] } })]), now).game.hasLineup, false);
});
