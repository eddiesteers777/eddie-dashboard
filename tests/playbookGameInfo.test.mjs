import test from "node:test";
import assert from "node:assert/strict";
import { gameInfo, gameIcs, mapsUrl } from "../js/playbook/gameInfoModel.js";

const g = { date: "2026-11-13", time: "10:00", arrive: "09:15", site: "home", place: "Field 2", opp: "Pelham", periods: 2, minutes: 30 };

test("gameInfo words the time, arrive and where", () => {
    assert.deepEqual(gameInfo(g), { time: "10 AM", arrive: "9:15 AM", where: "Home · Field 2", hasAny: true });
    assert.equal(gameInfo({}).hasAny, false);
    assert.equal(gameInfo({ site: "away" }).where, "Away");
});

test("the calendar file has the kickoff, a length of the whole game and escaped text", () => {
    const ics = gameIcs({ ...g, opp: "A, B; C" }, 0);
    assert.match(ics, /DTSTART:20261113T100000/);
    assert.match(ics, /DTEND:20261113T110000/);
    assert.ok(ics.includes("SUMMARY:Game vs A\\, B\\; C"));
    assert.match(ics, /Arrive by 9:15 AM/);
});

test("no date or no kickoff means no calendar file", () => {
    assert.equal(gameIcs({ ...g, time: "" }), "");
    assert.equal(gameIcs({ ...g, date: "" }), "");
});

test("the maps link only exists with a field and is encoded", () => {
    assert.equal(mapsUrl(""), "");
    assert.equal(mapsUrl("Pelham Park & Field 2"), "https://www.google.com/maps/search/?api=1&query=Pelham%20Park%20%26%20Field%202");
});
