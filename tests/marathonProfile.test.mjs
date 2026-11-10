// Tests for the marathon plan screen's pure parts: reading a race time, the
// setup a profile suggests, and the engine behind generateCoachPlan /
// regeneratePlan (settings.engine "marathon"). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { raceSeconds, marathonSettingsFromProfile, clockText } from "../js/marathonProfile.js";
import { generateCoachPlan, regeneratePlan, CODES } from "../js/coachPlanGenerator.js";
import { generateMarathonPlan } from "../js/marathonEngine.js";
import { sanitizeWorkout } from "../js/runWorkout.js";

const TODAY = "2026-11-10";
const PROFILE = { weeklyMileage: 30, longestRun: 10, runsPerWeek: 5, availabilityDays: ["mon", "tue", "thu", "fri", "sun"], eventType: "marathon", targetDate: "2027-03-28", primaryGoal: "Run 3:45", injuries: "" };

test("a race time reads as hours:minutes:seconds, or minutes:seconds for a short one", () => {
    assert.equal(raceSeconds("1:45:00"), 6300);
    assert.equal(raceSeconds("29:00"), 1740);
    assert.equal(raceSeconds("3:07:30"), 11250);
    for (const bad of ["", "fast", "45", "1:75:00", "1:2:3:4", "1:45:xx"]) assert.equal(raceSeconds(bad), 0, bad);
    assert.equal(clockText(6300), "1:45:00");
    assert.equal(clockText(1740), "29:00");
});

test("the setup follows the profile, and leaves out what the profile lacks", () => {
    const s = marathonSettingsFromProfile(PROFILE, TODAY);
    assert.equal(s.engine, "marathon");
    assert.equal(s.raceDate, "2027-03-28");
    assert.equal(s.goalTime, "3:45:00");
    assert.equal(s.currentMiles, 30);
    assert.equal(s.longestRun, 10);
    assert.deepEqual(s.runDays, ["MON", "TUE", "THU", "FRI", "SUN"]);
    assert.equal(s.longRunDay, "SUN");
    assert.equal(s.injuryHistory, false);
    assert.equal(s.recentRace, null);
    assert.equal(s.longTarget, 20);
    assert.equal(s.startDate, "2026-11-16");
    assert.deepEqual(generateMarathonPlan(s).problems, []);
    // Injuries on the profile mean the careful ramp; "first marathon" is picked up from the goal.
    const hurt = marathonSettingsFromProfile({ ...PROFILE, injuries: "Left knee, 2025", primaryGoal: "My first marathon" }, TODAY);
    assert.equal(hurt.injuryHistory, true);
    assert.equal(hurt.firstMarathon, true);
    // "None" answers are not injuries.
    assert.equal(marathonSettingsFromProfile({ ...PROFILE, injuries: "None" }, TODAY).injuryHistory, false);
    // A profile for another race opens as that race; asking for a different distance carries nothing over.
    const half = marathonSettingsFromProfile({ ...PROFILE, eventType: "half", targetDate: "2027-02-14" }, TODAY);
    assert.equal(half.raceType, "HALF");
    assert.equal(half.raceDate, "2027-02-14");
    const asMarathon = marathonSettingsFromProfile({ ...PROFILE, eventType: "half", targetDate: "2027-02-14" }, TODAY, "MARATHON");
    assert.equal(asMarathon.raceDate, "");
    assert.ok(generateMarathonPlan(asMarathon).problems.some(p => /race date/.test(p)));
    // A 5K or 10K profile opens as that race, with the long run left to the plan.
    const k = marathonSettingsFromProfile({ ...PROFILE, eventType: "5k", targetDate: "2027-02-14" }, TODAY);
    assert.equal(k.raceType, "5K");
    assert.equal(k.longTarget, 0);
    // An empty profile never throws.
    const none = marathonSettingsFromProfile({}, TODAY);
    assert.equal(none.currentMiles, 0);
    assert.ok(generateMarathonPlan(none).problems.length > 0);
});

const settings = extra => ({ ...marathonSettingsFromProfile(PROFILE, TODAY), recentRace: { meters: 21097.5, seconds: 6300 }, peakMiles: 46, strengthDays: 2, ...extra });

test("generateCoachPlan builds a marathon plan from the engine, with strength laid on", () => {
    const { plan, summary, warnings } = generateCoachPlan(settings());
    assert.equal(summary.weeks, 19);
    assert.equal(plan.raceDate, "2027-03-28");
    assert.equal(plan.generator.settings.engine, "marathon");
    assert.ok(summary.workouts >= 20 && summary.strength > 0);
    assert.ok(Array.isArray(warnings));
    const days = plan.weeks.flatMap(w => w.days);
    assert.ok(days.every(d => d.type !== "rest" || (d.session === "" && !d.workout)), "rest days are blank, like the other generator");
    for (const d of days.filter(x => x.workout)) assert.deepEqual(d.workout, sanitizeWorkout(d.workout));
    // The engine's race-week session survives, with its pace.
    const race = plan.weeks.at(-1);
    const rp = race.days.find(d => d.workout?.sets?.[0]?.repeat === 3 && d.workout.sets[0].amount === 1);
    assert.ok(rp && rp.workout.sets[0].pace, "race week has 3 x 1 mile at race pace");
    assert.equal(race.days.find(d => d.type === "race").date, "2027-03-28");
    // Down weeks are light weeks for strength too.
    assert.ok(plan.weeks.some(w => w.cutback));
    // Mileage: every week's plannedMiles is filled in.
    assert.ok(plan.weeks.every(w => typeof w.plannedMiles === "number"));
    // Problems come back as an error in plain words.
    assert.throws(() => generateCoachPlan(settings({ raceDate: "" })), /race date/i);
    assert.throws(() => generateCoachPlan(settings({ currentMiles: 0 })), /miles/i);
});

test("regeneratePlan works on a marathon plan: hand edits are kept, the engine stays", () => {
    const made = generateCoachPlan(settings()).plan;
    // The coach shortens Thursday's run in week 3 by hand.
    const edited = JSON.parse(JSON.stringify(made));
    const day = edited.weeks[2].days.find(d => d.day === "THU");
    day.miles = day.miles + 1.5; day.session = "Easy run, hilly";
    const result = regeneratePlan(edited, settings({ peakMiles: 50 }), { from: "2026-11-16", scope: "all", replaceEdits: false, today: TODAY, done: new Set() });
    assert.equal(result.plan.generator.settings.engine, "marathon");
    assert.ok(result.changes.length > 0, "a new peak changes later weeks");
    assert.ok(result.keptEdited.includes(day.date), "the hand-edited day is kept");
    assert.equal(result.plan.weeks[2].days.find(d => d.day === "THU").session, "Easy run, hilly");
    // A day the client already did never changes.
    const done = new Set(made.weeks.slice(0, 3).flatMap(w => w.days).filter(d => d.type !== "rest").map(d => d.date));
    const again = regeneratePlan(made, settings({ peakMiles: 50 }), { from: "2026-11-16", scope: "all", today: TODAY, done });
    for (const week of made.weeks.slice(0, 3)) for (const d of week.days) assert.deepEqual(again.plan.weeks.flatMap(w => w.days).find(x => x.date === d.date).miles, d.miles);
});

test("the old generator is untouched by the engine path", () => {
    const old = generateCoachPlan({
        mode: "race", raceType: "MARATHON", raceDate: "2027-03-28", goalTime: "3:45:00", startDate: "2026-11-16", endDate: "2027-03-28",
        trainDays: CODES, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "SUN", speedDays: 1, strengthDays: 0, crossDays: 0,
        currentMiles: 30, peakMiles: 45, longestRun: 10, experience: "RECREATIONAL", strengthLevel: "some", equipment: "gym"
    });
    assert.equal(old.plan.generator.settings.engine, undefined);
    assert.ok(old.plan.weeks.some(w => /Foundation|Build|Peak/.test(w.phase)));
});

test("a half marathon goes through the coach generator and the profile pre-fill", () => {
    const st = marathonSettingsFromProfile({ ...PROFILE, eventType: "half marathon", targetDate: "2027-03-28" }, TODAY, "HALF");
    assert.equal(st.raceType, "HALF");
    assert.equal(st.distance, "HALF");
    assert.equal(st.longTarget, 10);
    assert.equal(marathonSettingsFromProfile(PROFILE, TODAY).raceType, "MARATHON");
    assert.equal(marathonSettingsFromProfile(PROFILE, TODAY, "HALF").raceDate, "");   // the profile's race is a marathon
    const { plan } = generateCoachPlan({ ...st, raceDate: "2027-03-28", startDate: "2026-12-21", currentMiles: 25, longestRun: 7, goalTime: "1:45:00", runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN", strengthDays: 0 });
    const days = plan.weeks.flatMap(w => w.days);
    assert.equal(Math.max(...days.filter(d => d.type === "long").map(d => d.miles)), 10);
    assert.match(days.find(d => d.type === "race").session, /half marathon/i);
    assert.equal(plan.generator.settings.raceType, "HALF");
});
