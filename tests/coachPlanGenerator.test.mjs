// Unit tests for the coach's plan generator (js/coachPlanGenerator.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    settingsFromProfile, checkSettings, generateCoachPlan, regeneratePlan, goalSeconds, normalGoal,
    pacesFor, strengthPool, editedParts, nextMonday
} from "../js/coachPlanGenerator.js";
import { blankPlan } from "../js/coachingPlanModel.js";

const TODAY = "2026-09-28";   // a Monday
const PROFILE = { weeklyMileage: 25, availabilityDays: ["tue", "wed", "thu", "sat", "sun"], strengthExperience: "some", targetEvent: "Indy Monumental Half", targetDate: "2026-12-20", primaryGoal: "Break 1:45 in the half" };
const days = plan => plan.weeks.flatMap(w => w.days);
const at = (plan, date) => days(plan).find(d => d.date === date);

test("settings from the client's profile", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    assert.deepEqual([s.mode, s.raceType, s.raceDate, s.goalTime], ["race", "HALF", "2026-12-20", "1:45:00"]);
    assert.deepEqual([s.startDate, s.runDays.join(","), s.longRunDay], ["2026-09-28", "TUE,WED,THU,SAT,SUN", "SUN"]);
    assert.deepEqual([s.currentMiles, s.peakMiles, s.longestRun, s.speedDays, s.strengthDays], [25, 34, 8, 2, 2]);
    // No race (or a race too soon), a lifter, no days given.
    const t = settingsFromProfile({ primarySport: "strength", strengthExperience: "experienced", targetDate: "2026-10-05", targetEvent: "5K" }, "2026-09-30");
    assert.deepEqual([t.mode, t.trainingGoal, t.strengthDays, t.startDate, t.endDate], ["training", "STRENGTH", 3, "2026-10-05", "2026-12-27"]);
    assert.deepEqual(t.runDays, ["TUE", "WED", "THU", "SAT", "SUN"]);
    assert.equal(nextMonday("2026-10-04"), "2026-10-05");
});

test("goal times read the way a runner writes them", () => {
    assert.equal(goalSeconds("1:45", "HALF"), 6300);
    assert.equal(goalSeconds("19:30", "5K"), 1170);
    assert.equal(goalSeconds("3:05", "MARATHON"), 11100);
    assert.equal(normalGoal("3:05", "MARATHON"), "3:05:00");
    assert.equal(normalGoal("sub 3", "MARATHON"), "");
    const p = pacesFor({ mode: "race", raceType: "HALF", goalTime: "1:45:00" });
    assert.equal(p["half marathon"], "7:56-8:06");
    assert.ok(p["5K"] < p.threshold && p.threshold < p["half marathon"] && p["half marathon"] < p.marathon);
    assert.equal(pacesFor({ mode: "race", raceType: "HALF", goalTime: "" }), null);
});

test("a race plan: structure, workouts with paces, race day", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    const { plan, summary } = generateCoachPlan(s, { now: 5 });
    assert.equal(plan.weeks.length, 12);
    assert.equal(plan.weeks[0].startDate, "2026-09-28");
    assert.equal(plan.raceDate, "2026-12-20");
    assert.deepEqual([at(plan, "2026-12-20").type, at(plan, "2026-12-20").miles], ["race", 13.1]);
    assert.equal(plan.weeks[0].phase, "Foundation");
    assert.equal(plan.weeks.at(-1).phase, "Taper");
    // Runs only on the chosen days; the long run on Sunday.
    assert.ok(days(plan).filter(d => !["rest", "strength", "cross"].includes(d.type)).every(d => s.runDays.includes(d.day)));
    assert.ok(days(plan).filter(d => d.type === "long").every(d => d.day === "SUN"));
    // Quality days are structured, sized to the day, with half-marathon-goal paces.
    const q = days(plan).filter(d => d.workout);
    assert.equal(q.length, summary.workouts);
    assert.ok(q.length >= 18);
    assert.ok(q.every(d => d.workout.warmup && d.workout.cooldown && d.workout.sets.length && d.workout.why));
    assert.ok(q.some(d => d.workout.sets.some(set => set.pace === "7:56-8:06")), "race-pace work at goal pace");
    assert.ok(q.every(d => d.session.length <= 300));
    // Every day fingerprinted.
    assert.equal(Object.keys(plan.generator.prints).length, days(plan).length);
    assert.equal(plan.generator.madeAt, 5);
    // Weekly miles add up.
    assert.ok(plan.weeks.every(w => Math.abs(w.plannedMiles - w.days.reduce((t, d) => t + (d.type === "rest" ? 0 : d.miles), 0)) < 0.01));
});

test("strength: on days they can train, never the long run or race week's last 3 days, lighter in taper", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    const { plan } = generateCoachPlan(s, { now: 1 });
    const lifts = days(plan).filter(d => d.strength);
    assert.ok(lifts.length >= 20);
    assert.ok(lifts.every(d => s.trainDays.includes(d.day)));
    assert.ok(lifts.every(d => d.type !== "long" && d.type !== "race"));
    assert.ok(lifts.every(d => d.date < "2026-12-17"), "nothing within 3 days of the race");
    assert.ok(plan.weeks.every(w => w.days.filter(d => d.strength).length <= 2));
    const taper = plan.weeks.filter(w => w.phase === "Taper").flatMap(w => w.days).filter(d => d.strength);
    assert.ok(taper.length && taper.every(d => /Lighter week/.test(d.strength.notes)));
    assert.ok(lifts.every(d => d.strength.exercises.length >= 3 && d.strength.title));
    // Bodyweight-only clients get bodyweight sessions; beginners no intermediate ones.
    const pool = strengthPool({ ...s, equipment: "bodyweight", strengthLevel: "none" });
    assert.ok(pool.main.length && pool.main.every(id => /bodyweight/i.test(id) || ["core-20", "calves-feet-15", "mobility-strength-20", "bodyweight-circuit-20", "runner-core-stability", "pre-long-run-support"].includes(id)), pool.main.join());
});

test("general training: exact run days, goal-matched lifting, cross-training on free days", () => {
    const s = { ...settingsFromProfile({ primarySport: "strength", availabilityDays: ["mon", "tue", "wed", "thu", "fri", "sat"], weeklyMileage: 12 }, TODAY), runDays: ["TUE", "THU", "SAT"], longRunDay: "SAT", crossDays: 1 };
    const { plan } = generateCoachPlan(s, { now: 1 });
    assert.equal(plan.weeks.length, 12);
    assert.equal(plan.raceDate, undefined);
    const runs = days(plan).filter(d => ["easy", "long", "workout", "recovery"].includes(d.type));
    assert.ok(runs.every(d => ["TUE", "THU", "SAT"].includes(d.day)));
    assert.ok(days(plan).filter(d => d.strength).some(d => /Lower Strength|Upper Strength|Full Body|Push|Pull/.test(d.strength.title)));
    const cross = days(plan).filter(d => d.type === "cross");
    assert.equal(cross.length, 12);
    assert.ok(cross.every(d => s.trainDays.includes(d.day)));
});

test("settings problems are explained", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    assert.deepEqual(checkSettings({ ...s, runDays: ["SUN"] }), ["Pick at least two run days."]);
    assert.deepEqual(checkSettings({ ...s, longRunDay: "MON" }), ["The long run day has to be one of the run days."]);
    assert.deepEqual(checkSettings({ ...s, raceDate: "2026-10-05" }), ["The race needs to be at least 3 weeks after the start."]);
    assert.deepEqual(checkSettings({ ...s, peakMiles: 10 }), ["Peak miles can't be lower than their current miles."]);
    assert.throws(() => generateCoachPlan({ ...s, runDays: [] }), /two run days/);
});

test("regenerate: edited and done days are kept, the past never changes", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    const { plan } = generateCoachPlan(s, { now: 1 });
    // The coach edits Oct 20 (a Tuesday workout) and removes Oct 21's strength.
    at(plan, "2026-10-20").miles = 9;
    at(plan, "2026-10-20").session = "Coach's own session";
    delete at(plan, "2026-10-21").strength;
    assert.deepEqual(editedParts(plan, "2026-10-20", at(plan, "2026-10-20")), { run: true, strength: false });
    assert.deepEqual(editedParts(plan, "2026-10-21", at(plan, "2026-10-21")), { run: false, strength: true });
    const before = JSON.parse(JSON.stringify(plan));
    const r = regeneratePlan(plan, { ...s, peakMiles: 42 }, { from: "2026-10-05", today: "2026-10-07", done: new Set(["2026-10-08"]), now: 9 });
    // Before today: untouched. Done: untouched.
    assert.deepEqual(at(r.plan, "2026-10-06"), at(before, "2026-10-06"));
    assert.deepEqual(at(r.plan, "2026-10-08"), at(before, "2026-10-08"));
    // Edited parts kept, the rest regenerated around them.
    assert.equal(at(r.plan, "2026-10-20").session, "Coach's own session");
    assert.equal(at(r.plan, "2026-10-21").strength, undefined);
    assert.ok(r.keptEdited.includes("2026-10-20"));
    assert.ok(Math.max(...r.plan.weeks.map(w => w.plannedMiles)) > Math.max(...before.weeks.map(w => w.plannedMiles)), "the higher peak took effect");
    assert.ok(r.changes.length > 10);
    assert.equal(r.plan.generator.settings.peakMiles, 42);
    assert.equal(r.plan.generator.madeAt, 9);
    // The kept edits stay recognized as edits next time.
    assert.equal(editedParts(r.plan, "2026-10-20", at(r.plan, "2026-10-20")).run, true);
    // Asking to replace edits does.
    const r2 = regeneratePlan(plan, s, { from: "2026-10-05", today: "2026-10-07", replaceEdits: true });
    assert.notEqual(at(r2.plan, "2026-10-20").session, "Coach's own session");
    assert.ok(at(r2.plan, "2026-10-21").strength);
});

test("regenerate only strength, or only a range", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    const { plan } = generateCoachPlan(s, { now: 1 });
    const r = regeneratePlan(plan, { ...s, equipment: "bodyweight" }, { from: TODAY, today: TODAY, scope: "strength" });
    const runs = p => days(p).map(d => [d.date, d.type === "strength" ? "rest" : d.type, d.miles, d.session === d.strength?.title ? "" : d.session].join("|"));
    assert.deepEqual(runs(r.plan), runs(plan), "runs untouched");
    const titles = new Set(days(r.plan).filter(d => d.strength).map(d => d.strength.title));
    assert.ok(![...titles].some(t => /Marathon Strength A|Glute/.test(t)), [...titles].join());
    // Only weeks 5-6 of a run change.
    const r2 = regeneratePlan(plan, { ...s, peakMiles: 40 }, { from: "2026-10-26", to: "2026-11-08", today: TODAY, scope: "runs" });
    for (const d of days(r2.plan)) {
        const was = at(plan, d.date);
        if (d.date < "2026-10-26" || d.date > "2026-11-08") assert.deepEqual(d, was, d.date);
    }
});

test("regenerate after the race date moves; filling a blank or hand-built plan", () => {
    const s = settingsFromProfile(PROFILE, TODAY);
    const { plan } = generateCoachPlan(s, { now: 1 });
    const later = regeneratePlan(plan, { ...s, raceDate: "2027-01-10" }, { from: TODAY, today: TODAY });
    assert.equal(later.plan.raceDate, "2027-01-10");
    assert.equal(at(later.plan, "2027-01-10").type, "race");
    assert.equal(at(later.plan, "2026-12-20").type === "race", false);
    const earlier = regeneratePlan(plan, { ...s, raceDate: "2026-12-06" }, { from: TODAY, today: TODAY });
    assert.ok(days(earlier.plan).every(d => d.date <= "2026-12-06"), "unedited days after the new race date are gone");
    // A blank plan fills in; a hand-built day is kept unless asked.
    const blank = blankPlan(TODAY, 4);
    blank.weeks[0].days[1] = { ...blank.weeks[0].days[1], type: "easy", miles: 4, session: "My custom run" };
    const filled = regeneratePlan(blank, { ...s, mode: "training", endDate: "2026-10-25" }, { from: TODAY, today: TODAY });
    assert.equal(at(filled.plan, "2026-09-29").session, "My custom run");
    assert.ok(days(filled.plan).filter(d => d.type !== "rest").length > 10);
    assert.ok(filled.plan.generator.prints["2026-10-01"]);
});

test("what changed on a day, in a few words", async () => {
    const { compactChange } = await import("../js/coachPlanGenerator.js");
    const lift = title => ({ title, minutes: 30, goal: "", notes: "", exercises: [{ name: "Squat", sets: 3, reps: "8", weight: null, rpe: null, rir: null, restSec: 90, superset: false, note: "", video: "" }] });
    const wo = { type: "workout", miles: 5, session: "Cruise intervals: 1 mi warm-up · 3 × 8 min", workout: { sets: [] } };
    assert.equal(compactChange(wo, { ...wo, miles: 5.5 }), "Cruise intervals: 5 → 5.5 mi");
    assert.equal(compactChange(wo, { ...wo, session: "Mile repeats: 1 mi warm-up" }), "Mile repeats: Cruise intervals → Mile repeats");
    assert.equal(compactChange({ type: "easy", miles: 4, session: "Easy" }, { type: "rest", miles: 0, session: "" }), "4 mi Easy → Rest");
    assert.equal(compactChange({ type: "easy", miles: 4, session: "Easy", strength: lift("Core 20") }, { type: "easy", miles: 4, session: "Easy", strength: lift("Marathon Strength A") }), "strength: Core 20 → Marathon Strength A");
    assert.equal(compactChange({ type: "rest" }, { type: "strength", miles: 0, session: "Core 20", strength: lift("Core 20") }), "+ strength (Core 20)");
});

test("the profile's tap answers set up Generate: race, runs a week, longest run, run/walk start, equipment", () => {
    const today = "2026-09-29";
    const s = settingsFromProfile({ primarySport: "running", availabilityDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], weeklyMileage: 25,
        runsPerWeek: 4, longestRun: 9, eventType: "half", targetEvent: "Spring race", targetDate: "2027-03-21", equipment: ["dumbbells", "bands"], primaryGoal: "Run well" }, today);
    assert.equal(s.raceType, "HALF", "from the event type, even when the name doesn't say");
    assert.equal(s.mode, "race");
    assert.deepEqual(s.runDays, ["MON", "WED", "FRI", "SUN"], "4 runs, spread out, the long run on the weekend");
    assert.equal(s.longRunDay, "SUN");
    assert.equal(s.longestRun, 9);
    assert.equal(s.equipment, "dumbbells");
    const walker = settingsFromProfile({ primarySport: "running", availabilityDays: ["tue", "thu", "sat"], weeklyMileage: 0, runStart: "run5" }, today);
    assert.equal(walker.start, "RUN5", "their own answer, not a guess");
    assert.equal(settingsFromProfile({ primarySport: "running", weeklyMileage: 2, runStart: "running" }, today).start, "RUNNING");
    assert.equal(settingsFromProfile({ primarySport: "running", equipment: ["bodyweight"] }, today).equipment, "bodyweight");
    assert.equal(settingsFromProfile({ primarySport: "running", equipment: ["barbell"] }, today).equipment, "gym");
});
