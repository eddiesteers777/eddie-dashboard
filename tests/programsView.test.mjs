// Unit tests for the Programs page's pure helpers (js/programsView.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    raceProgram, trainingProgram, marathonProgram, groupPrograms, bucketOf, currentWeekIndex, phaseRuns, dayCell,
    seasonLayout, seasonNote, programChecks, programCounts, statusOf, daysBetween, addDays
} from "../js/programsView.js";
import { generateRacePlan } from "../js/racePlanGenerator.js";
import { generateTrainingPlan } from "../js/trainingPlanGenerator.js";

const raceSettings = { raceType: "HALF", raceDate: "2027-01-17", trainingStartDate: "2026-10-19", goalType: "TIME", goalTime: "1:29:59",
    runDays: ["TUE", "WED", "THU", "SAT", "SUN"], longRunDay: "SAT", currentMileage: 25, peakMileage: 40, experience: "intermediate", longestRun: 10, speedDays: 2 };
const race = (id, over = {}) => raceProgram({ id, name: "Houston Half", status: "active", settings: raceSettings, generatedPlan: generateRacePlan(raceSettings), ...over });
const TODAY = "2026-10-17";

test("a race plan becomes one shape with its weeks", () => {
    const p = race("r1");
    assert.equal(p.source, "race");
    assert.equal(p.name, "Houston Half");
    assert.equal(p.kind, "Half marathon");
    assert.equal(p.goal, "1:29:59");
    assert.equal(p.weeks.length, p.totalWeeks);
    assert.ok(p.weeks.every(w => w.days.length === 7), "seven days a week");
    assert.ok(p.peak > 30 && p.longest > 8);
});

test("a race plan with no name is called by its distance, never a code", () => {
    assert.equal(race("r2", { name: "" }).name, "Half marathon plan");
});

test("the coach's marathon block has 16 weeks and ends on race day", () => {
    const m = marathonProgram();
    assert.equal(m.weeks.length, 16);
    assert.equal(m.end, "2026-11-07");
    assert.equal(m.weeks[12].n, 13);
    assert.ok(currentWeekIndex(m, TODAY) === 12, "Oct 17 is in week 13");
    assert.equal(m.weeks[15].days.some(d => d.type === "race"), true);
    assert.equal(m.weeks[12].days.filter(d => d.type === "long").length, 1, "the week's longest run reads as long");
    assert.equal(m.weeks[13].days.find(d => d.miles === 20).type, "long");
});

test("a draft shows a preview of its weeks without saving them", () => {
    const settings = { primaryGoal: "RUN_STRENGTH", startDate: "2027-05-10", endDate: "2027-07-04", runDays: 4, liftDays: 3, crossDays: 1, sundayRest: true,
        allowDoubles: true, maxDoubles: 2, longRunDay: "SAT", currentMiles: 25, targetMiles: 28, maxMiles: 30, longMin: 8, longMax: 10, speedDays: 1 };
    const draft = { id: "t1", name: "Block", status: "draft", settings };
    const bare = trainingProgram(draft);
    assert.equal(bare.weeks.length, 0);
    assert.equal(bare.runDays, 4);
    const withPreview = trainingProgram(draft, generateTrainingPlan(settings).generatedPlan);
    assert.ok(withPreview.weeks.length >= 7);
    assert.equal(withPreview.preview, true);
    assert.equal(withPreview.kind, "Running Strength");
});

test("programs are grouped by where they are in time", () => {
    const nowSettings = { ...raceSettings, trainingStartDate: "2026-10-05" };
    const now = race("a", { settings: nowSettings, generatedPlan: generateRacePlan(nowSettings) });
    const next = race("b", { settings: { ...raceSettings, trainingStartDate: "2027-02-01", raceDate: "2027-05-01" }, generatedPlan: { ...generateRacePlan({ ...raceSettings, trainingStartDate: "2027-02-01", raceDate: "2027-05-01" }) } });
    const draft = race("c", { status: "draft" });
    const done = race("d", { status: "archived" });
    const old = race("e", { generatedPlan: { ...generateRacePlan({ ...raceSettings, trainingStartDate: "2026-06-01", raceDate: "2026-09-01" }) } });
    const g = groupPrograms([now, next, draft, done, old], TODAY);
    assert.deepEqual(g.now.map(p => p.id), ["a"]);
    assert.deepEqual(g.next.map(p => p.id), ["b"]);
    assert.deepEqual(g.drafts.map(p => p.id), ["c"]);
    assert.deepEqual(g.finished.map(p => p.id).sort(), ["d", "e"]);
    assert.equal(bucketOf(now, "2026-10-05"), "now", "the first day counts as running");
    assert.equal(bucketOf(now, "2027-01-17"), "now", "race day is still running");
    assert.equal(bucketOf(now, "2027-01-18"), "finished");
});

test("legacy statuses read as before", () => {
    assert.equal(statusOf({ status: "generated" }), "draft");
    assert.equal(statusOf({ generatedPlan: {} }), "active");
    assert.equal(statusOf({}), "draft");
    assert.deepEqual(programCounts([{ status: "active" }, { status: "draft" }, { status: "draft" }]), { active: 1, paused: 0, draft: 2, archived: 0 });
});

test("phases are grouped in order", () => {
    const runs = phaseRuns([{ phase: "Base" }, { phase: "Base" }, { phase: "Build" }, { phase: "Taper" }]);
    assert.deepEqual(runs.map(r => [r.label, r.count]), [["Base", 2], ["Build", 1], ["Taper", 1]]);
});

test("a day cell reads miles first, rest as a word, strength as a mark", () => {
    assert.deepEqual(dayCell({ type: "easy", miles: 4.5, label: "Easy Run", extras: [] }).top, "4.5");
    assert.equal(dayCell({ type: "rest", miles: 0, label: "", extras: [] }).top, "Rest");
    assert.equal(dayCell({ type: "rest", miles: 0, label: "", extras: ["strength"] }).top, "S");
    assert.equal(dayCell({ type: "workout", miles: 6, label: "", extras: [] }).tone, "q");
    assert.match(dayCell({ type: "long", miles: 12, label: "", extras: ["strength"] }).sub, /long \+S/);
});

test("the season line places blocks, lanes and today", () => {
    const m = marathonProgram();
    const h = race("h", { settings: { ...raceSettings, trainingStartDate: "2026-11-16" }, generatedPlan: generateRacePlan({ ...raceSettings, trainingStartDate: "2026-11-16" }) });
    const season = seasonLayout([m, h, race("x", { status: "archived" })], TODAY);
    assert.equal(season.blocks.length, 2, "archived plans stay off the line");
    assert.ok(season.months.length >= 5);
    assert.ok(season.todayPct > 0 && season.todayPct < 100);
    const by = Object.fromEntries(season.blocks.map(b => [b.key, b]));
    assert.equal(by.marathon.tone, "act");
    assert.equal(by["race:h"].tone, "next");
    assert.ok(by["race:h"].left > by.marathon.left + by.marathon.width - 0.5, "no overlap, same lane");
    assert.equal(season.lanes, 1);
    assert.equal(seasonLayout([], TODAY), null);
});

test("two plans that overlap take two lanes and a warning", () => {
    const a = race("a");
    const b = race("b", { settings: { ...raceSettings, trainingStartDate: "2026-11-30" }, generatedPlan: generateRacePlan({ ...raceSettings, trainingStartDate: "2026-11-30" }) });
    assert.equal(seasonLayout([a, b], TODAY).lanes, 2);
    const note = seasonNote([a, b], TODAY);
    assert.equal(note.warn, true);
    assert.match(note.text, /overlap/);
});

test("the season note names the gap between two plans", () => {
    const m = marathonProgram();
    const h = race("h", { settings: { ...raceSettings, trainingStartDate: "2026-11-23" }, generatedPlan: generateRacePlan({ ...raceSettings, trainingStartDate: "2026-11-23" }) });
    const note = seasonNote([m, h], TODAY);
    assert.equal(note.warn, false);
    assert.match(note.text, /2 weeks between Indianapolis Monumental and Houston Half\. Nothing overlaps\./);
    assert.equal(seasonNote([m], TODAY).text, "Nothing overlaps.");
});

test("checks flag an overlap with another active plan and big mileage jumps", () => {
    const a = race("a");
    const b = race("b", { settings: { ...raceSettings, trainingStartDate: "2026-11-30" }, generatedPlan: generateRacePlan({ ...raceSettings, trainingStartDate: "2026-11-30" }) });
    const checks = programChecks(b, [a, b]);
    assert.equal(checks[0].warn, true);
    assert.match(checks[0].text, /Overlaps Houston Half/);
    const clean = programChecks(a, [a]);
    assert.equal(clean[0].warn, false);

    const jumpy = { ...a, weeks: [{ n: 1, miles: 20, days: [] }, { n: 2, miles: 30, days: [] }] };
    assert.ok(programChecks(jumpy, [jumpy]).some(c => c.warn && /Week 2 adds 10 mi over week 1/.test(c.text)));
    assert.ok(!programChecks({ ...a, weeks: [{ n: 1, miles: 20, days: [] }, { n: 2, miles: 22, days: [] }] }, []).some(c => /adds/.test(c.text)));
});

test("a plan with Strength and no Strength plan says so", () => {
    const withStrength = { ...race("s"), liftDays: 2 };
    assert.ok(programChecks(withStrength, [withStrength], { strengthAvailable: false }).some(c => /Strength/.test(c.text)));
    assert.ok(!programChecks(withStrength, [withStrength], { strengthAvailable: true }).some(c => /Strength/.test(c.text)));
});

test("date helpers", () => {
    assert.equal(daysBetween("2026-10-17", "2026-11-07"), 21);
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});
