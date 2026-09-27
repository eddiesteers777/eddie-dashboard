// Unit tests for "Describe it": the coach's words -> plan settings (js/planDescribe.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRequest, cleanDescribed, DESCRIBE_TOOL, DESCRIBE_SCHEMA, MAX_DESCRIPTION, SETTING_LABELS } from "../js/planDescribe.js";
import { settingsFromProfile, checkSettings, generateCoachPlan, RACES, EQUIPMENT } from "../js/coachPlanGenerator.js";

const TODAY = "2026-09-27";   // a Sunday
const current = () => settingsFromProfile({}, TODAY);

test("the request: today's date, the coach's settings and words, one tool the answer must use", () => {
    const r = describeRequest({ description: "Sam, half in April, goal 1:45", settings: current(), today: TODAY });
    assert.match(r.system, /Today is Sunday, 2026-09-27/);
    assert.match(r.system, /HALF = Half marathon/);
    assert.equal(r.messages.length, 1);
    assert.match(r.messages[0].content, /"currentMiles":15/);
    assert.match(r.messages[0].content, /Sam, half in April, goal 1:45$/);
    assert.equal(r.tools[0].name, DESCRIBE_TOOL);
    assert.deepEqual(r.tool_choice, { type: "tool", name: DESCRIBE_TOOL });
    // The schema offers exactly the generator's own options.
    assert.deepEqual(DESCRIBE_SCHEMA.properties.settings.properties.raceType.enum, RACES.map(r => r[0]));
    assert.deepEqual(DESCRIBE_SCHEMA.properties.settings.properties.equipment.enum, EQUIPMENT.map(e => e[0]));
    assert.deepEqual(Object.keys(DESCRIBE_SCHEMA.properties.settings.properties).sort(), Object.keys(SETTING_LABELS).sort());
    // Long descriptions are cut, not sent whole.
    const long = describeRequest({ description: "x".repeat(MAX_DESCRIPTION + 500), settings: {}, today: TODAY });
    assert.ok(long.messages[0].content.length < MAX_DESCRIPTION + 300);
});

test("a good answer fills the form and says what changed", () => {
    const out = cleanDescribed({
        settings: {
            mode: "race", raceType: "HALF", raceDate: "2027-04-18", goalTime: "1:45", startDate: "2026-12-28",
            runDays: ["SUN", "TUE", "THU", "SAT"], longRunDay: "SUN", currentMiles: 25, peakMiles: 40, longestRun: 8.3,
            strengthDays: 2, equipment: "dumbbells", experience: "RECREATIONAL"
        },
        name: "  Indy   Half build ",
        understood: ["Half marathon on Sun, Apr 18, goal 1:45", "Runs Tue, Thu, Sat, Sun"],
        notes: ["Achilles gets tight on hills: go easy on hill work"]
    }, current(), TODAY);
    const s = out.settings;
    assert.deepEqual([s.mode, s.raceType, s.raceDate, s.goalTime, s.startDate], ["race", "HALF", "2027-04-18", "1:45:00", "2026-12-28"]);
    assert.deepEqual(s.runDays, ["TUE", "THU", "SAT", "SUN"], "in week order");
    assert.equal(s.longestRun, 8.5, "to the half mile");
    assert.equal(out.name, "Indy Half build");
    assert.ok(out.changed.includes("raceDate") && out.changed.includes("equipment") && !out.changed.includes("strengthDays"), out.changed.join());
    assert.deepEqual(out.notes, ["Achilles gets tight on hills: go easy on hill work"]);
    assert.deepEqual(checkSettings(s), [], "the form can generate straight away");
    assert.ok(generateCoachPlan(s).plan.weeks.length >= 15);
});

test("nothing the AI makes up gets through", () => {
    const cur = current();
    const out = cleanDescribed({
        settings: {
            mode: "ultra", raceType: "100_MILE", trainingGoal: "WIN", equipment: "spaceship", experience: "GOD",
            raceDate: "2026-02-30", startDate: "2025-01-05", endDate: "soon",
            runDays: ["MON", "FUNDAY"], longRunDay: "SAT", speedDays: 7, crossDays: -1, strengthDays: 2.4,
            currentMiles: 500, peakMiles: "lots", longestRun: 0, goalTime: "fast"
        },
        understood: ["ok", "", 42, "x".repeat(400)], notes: "not a list", name: { evil: true }
    }, cur, TODAY);
    const s = out.settings;
    for (const key of ["mode", "raceType", "trainingGoal", "equipment", "experience", "raceDate", "startDate", "endDate", "speedDays", "crossDays", "currentMiles", "peakMiles", "longestRun"]) {
        assert.deepEqual(s[key], cur[key], key);
    }
    assert.equal(s.strengthDays, 2);
    assert.equal(s.goalTime, cur.goalTime, "an unreadable goal time is ignored");
    assert.deepEqual(s.runDays, ["MON"]);
    assert.ok(s.trainDays.includes("MON"), "a run day is always a day they can train");
    assert.equal(s.longRunDay, "MON", "the long run moves onto a run day");
    assert.deepEqual(out.understood, ["ok", "42", "x".repeat(160)]);
    assert.deepEqual([out.notes, out.name], [[], ""]);
    // Garbage in, nothing changes.
    for (const junk of [null, "text", 5, {}, { settings: "no" }]) assert.deepEqual(cleanDescribed(junk, cur, TODAY).changed, [], String(junk));
});

test("settings that have to fit together", () => {
    const cur = { ...current(), currentMiles: 30, peakMiles: 40 };
    const lower = cleanDescribed({ settings: { peakMiles: 20 } }, cur, TODAY).settings;
    assert.equal(lower.peakMiles, 30, "peak never below current miles");
    const past = cleanDescribed({ settings: { mode: "race", raceDate: "2026-10-01", startDate: "2026-10-05" } }, cur, TODAY).settings;
    assert.equal(past.raceDate, "", "a race before the start isn't taken");
    const cleared = cleanDescribed({ settings: {}, understood: [] , notes: [] }, { ...cur, goalTime: "1:50:00" }, TODAY);
    assert.equal(cleared.settings.goalTime, "1:50:00", "a goal left out stays");
    const noGoal = cleanDescribed({ settings: { goalTime: "" } }, { ...cur, goalTime: "1:50:00" }, TODAY);
    assert.equal(noGoal.settings.goalTime, "", "\"no goal time\" clears it");
    const trainOnly = cleanDescribed({ settings: { trainDays: ["MON", "WED", "FRI"] } }, cur, TODAY).settings;
    assert.ok(cur.runDays.every(d => trainOnly.trainDays.includes(d)), "run days stay training days");
});
