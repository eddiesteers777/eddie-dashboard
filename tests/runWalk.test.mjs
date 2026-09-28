// Unit tests for run/walk plans (js/runWalk.js) on their own and through
// the coach generator, plus a sweep of every start / goal / length / set
// of days checked against the rules every run/walk plan must keep.
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeRunWalk, rungPlan, rungTime, session, sessionDays, isRunWalk, START_LEVELS, RUN_WALK_GOALS } from "../js/runWalk.js";
import { generateCoachPlan, checkSettings, regeneratePlan, settingsFromProfile, CODES } from "../js/coachPlanGenerator.js";
import { sanitizeWorkout, executionSteps } from "../js/runWorkout.js";
import { addDays } from "../js/coachingPlanModel.js";

const START = "2026-10-05";   // a Monday
const sunday = weeks => addDays(START, weeks * 7 - 1);
const BASE = {
    mode: "race", raceType: "5K", raceDate: sunday(9), endDate: sunday(10), goalTime: "", trainingGoal: "BASE_BUILD",
    startDate: START, trainDays: CODES, runDays: ["TUE", "THU", "SAT"], longRunDay: "SAT",
    speedDays: 0, strengthDays: 0, crossDays: 0, currentMiles: 0, peakMiles: 0, longestRun: 1,
    experience: "NEW", strengthLevel: "none", equipment: "bodyweight", start: "RUN1", runWalkGoal: "CONTINUOUS"
};
const sessions = w => w.days.filter(d => d.workout);
const main = d => d.workout.sets[0];
const running = d => main(d).amount * main(d).repeat;

test("a 9-week 5K from 'can run about 1 minute' builds like the classic plan", () => {
    const { weeks, warnings } = shapeRunWalk(BASE);
    assert.equal(weeks.length, 9);
    const first = sessions(weeks[0]);
    assert.equal(first.length, 3);
    assert.deepEqual([main(first[0]).amount, main(first[0]).repeat, main(first[0]).recovery.amount], [1, 8, 1.5]);
    // Non-stop 30 minutes in the last building week, then a lighter race week.
    assert.equal(main(sessions(weeks[7])[0]).repeat, 1);
    assert.equal(main(sessions(weeks[7])[0]).amount, 30);
    assert.equal(weeks[8].phase, "Taper");
    assert.ok(running(sessions(weeks[8])[0]) < 30);
    const race = weeks[8].days.find(d => d.type === "race");
    assert.equal(race.date, BASE.raceDate);
    assert.equal(race.miles, 3.1);
    assert.match(race.session, /start slower/i);
    assert.ok(warnings.some(w => /Builds to 30 minutes/.test(w)));
});

test("every session is a real workout the client's workout mode can time", () => {
    for (const d of shapeRunWalk(BASE).weeks.flatMap(sessions)) {
        assert.deepEqual(sanitizeWorkout(d.workout), d.workout);
        const steps = executionSteps(d.workout);
        assert.ok(steps.length >= 3);
        assert.ok(steps.every(s => s.seconds > 0), "every step has a timer");
        assert.equal(steps[0].phase, "warmup");
        assert.equal(steps.at(-1).phase, "cooldown");
        assert.ok(d.miles >= 0.5 && d.miles <= 6);
        assert.ok(d.session.length > 10);
    }
});

test("plan length is free: shorter climbs faster (and says so), longer repeats weeks", () => {
    const six = shapeRunWalk({ ...BASE, raceDate: sunday(6) });
    assert.equal(six.weeks.length, 6);
    assert.ok(six.warnings.some(w => /race day is run\/walk/.test(w)));
    assert.ok(six.warnings.some(w => /quick build/.test(w)));
    assert.match(six.weeks.at(-1).days.find(d => d.type === "race").session, /4 min run, 1 min walk/);
    const fourteen = shapeRunWalk({ ...BASE, raceDate: sunday(14) });
    assert.equal(main(sessions(fourteen.weeks[12])[0]).amount, 35, "time to reach 35 minutes");
    assert.ok(!fourteen.warnings.some(w => /quick build/.test(w)));
});

test("never more than two steps a week, and only one once the running is non-stop", () => {
    const ladder = [[1, 1, 3], [2, 1, 3], [3, 1, 2], [4, 1, 2], [20, 0, 1], [25, 0, 1], [30, 0, 1]];
    const plan = rungPlan(0, 6, 4, ladder);
    assert.equal(plan[0], 0);
    for (let i = 1; i < plan.length; i++) {
        assert.ok(plan[i] >= plan[i - 1]);
        assert.ok(plan[i] - plan[i - 1] <= (ladder[plan[i - 1]][2] === 1 ? 1 : 2));
    }
    // Enough weeks: one step at most, spread evenly, ends at the goal.
    const slow = rungPlan(0, 6, 12, ladder);
    assert.equal(slow.at(-1), 6);
    assert.ok(slow.every((r, i) => !i || r - slow[i - 1] <= 1));
});

test("starting points: walking only starts at 30-second runs; 'can run 20 minutes' starts non-stop", () => {
    const walk = shapeRunWalk({ ...BASE, start: "WALK", raceDate: sunday(12) });
    assert.equal(main(sessions(walk.weeks[0])[0]).amount, 0.5);
    const twenty = shapeRunWalk({ ...BASE, start: "RUN20", raceDate: sunday(6) });
    assert.equal(main(sessions(twenty.weeks[0])[0]).repeat, 1);
    assert.equal(main(sessions(twenty.weeks[0])[0]).amount, 20);
});

test("run/walk for good keeps the walk breaks, up to 4 min run / 1 min walk", () => {
    const { weeks, warnings } = shapeRunWalk({ ...BASE, runWalkGoal: "INTERVALS" });
    const all = weeks.flatMap(sessions);
    assert.ok(all.every(d => main(d).repeat > 1 && main(d).recovery), "never non-stop");
    const last = sessions(weeks[7])[0];
    assert.deepEqual([main(last).amount, main(last).recovery.amount, main(last).repeat], [4, 1, 7]);
    assert.ok(warnings.some(w => /walk breaks on race day/.test(w)));
    assert.match(weeks[8].days.find(d => d.type === "race").session, /4 min run, 1 min walk/);
});

test("general fitness builds to 30 minutes non-stop and holds; a 10K goes further", () => {
    const fit = shapeRunWalk({ ...BASE, mode: "training", endDate: sunday(12) });
    assert.equal(fit.weeks.length, 12);
    assert.ok(!fit.weeks.some(w => w.days.some(d => d.type === "race")));
    assert.equal(main(sessions(fit.weeks.at(-1))[0]).amount, 30);
    const tenK = shapeRunWalk({ ...BASE, raceType: "10K", start: "RUN5", raceDate: sunday(14) });
    assert.ok(Math.max(...tenK.weeks.flatMap(sessions).map(running)) >= 50);
    assert.equal(tenK.weeks.at(-1).days.find(d => d.type === "race").miles, 6.2);
});

test("sessions are spread out: at most four a week, a day off between when possible, none the day before the race", () => {
    assert.deepEqual(sessionDays(CODES, 3).length, 3);
    const three = sessionDays(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], 3);
    const gap = (a, b) => { const d = Math.abs(CODES.indexOf(a) - CODES.indexOf(b)); return Math.min(d, 7 - d); };
    assert.ok(three.every((c, i) => three.slice(i + 1).every(o => gap(c, o) >= 2)));
    const many = shapeRunWalk({ ...BASE, runDays: CODES });
    assert.ok(many.weeks.every(w => sessions(w).length <= 4));
    assert.ok(many.warnings.some(w => /four days at most/.test(w)));
    const dayBefore = addDays(BASE.raceDate, -1);
    assert.ok(!many.weeks.at(-1).days.find(d => d.date === dayBefore).workout);
    const back = shapeRunWalk({ ...BASE, runDays: ["MON", "TUE", "WED"] });
    assert.ok(back.warnings.some(w => /back-to-back/.test(w)));
    const two = shapeRunWalk({ ...BASE, runDays: ["TUE", "SAT"] });
    assert.ok(two.warnings.some(w => /Two sessions a week/.test(w)));
});

test("through the generator: sessions, strength, checks, regenerate", () => {
    assert.ok(isRunWalk(BASE));
    assert.ok(!isRunWalk({ ...BASE, start: "RUNNING" }));
    assert.ok(!isRunWalk({ ...BASE, start: undefined }), "older saved settings are miles plans");
    assert.deepEqual(checkSettings(BASE), [], "no miles or long run day needed");
    assert.match(checkSettings({ ...BASE, raceType: "HALF" })[0], /5K or 10K/);
    const { plan, summary, warnings } = generateCoachPlan({ ...BASE, strengthDays: 2 }, { now: 1 });
    assert.equal(summary.weeks, 9);
    assert.ok(summary.workouts >= 25);
    assert.ok(summary.strength >= 10);
    assert.ok(warnings.length);
    const days = plan.weeks.flatMap(w => w.days);
    assert.ok(days.filter(d => d.workout).every(d => d.type === "easy" && /Run\/walk|Easy run/.test(d.session)));
    assert.ok(days.every(d => !d.strength || d.type !== "race"));
    assert.ok(days.filter(d => d.strength).every(d => !/marathon|long-run/i.test(d.strength.title)), "beginner strength, not marathon sessions");
    assert.ok(plan.weeks.every(w => w.plannedMiles > 0 && w.plannedMiles < 15));
    // Same settings again: nothing to change.
    const again = regeneratePlan(plan, plan.generator.settings, { from: START, today: START });
    assert.equal(again.changes?.length ?? 0, 0);
});

test("a profile that barely runs starts on run/walk", () => {
    const s = settingsFromProfile({ weeklyMileage: 0, primaryGoal: "Run my first 5K", targetEvent: "Turkey Trot 5K", targetDate: sunday(9), availabilityDays: ["mon", "tue", "wed", "thu", "sat"] }, "2026-10-01");
    assert.equal(s.start, "RUN1");
    assert.equal(s.mode, "race");
    assert.equal(s.raceType, "5K");
    assert.equal(s.runDays.length, 3);
    const runner = settingsFromProfile({ weeklyMileage: 25, primaryGoal: "Sub-2 half" }, "2026-10-01");
    assert.equal(runner.start, "RUNNING");
    const unknown = settingsFromProfile({}, "2026-10-01");
    assert.equal(unknown.start, "RUNNING", "no mileage given is not 'barely runs'");
    // A long race from scratch: general training instead, 5K to pick.
    const marathon = settingsFromProfile({ weeklyMileage: 0, targetEvent: "Chicago Marathon", targetDate: sunday(20) }, "2026-10-01");
    assert.equal(marathon.mode, "training");
});

test("sweep: every start, goal, length and set of days keeps the rules", () => {
    const daySets = [["TUE", "THU", "SAT"], ["MON", "WED", "FRI", "SUN"], ["SAT", "SUN"], CODES, ["MON", "TUE", "WED"]];
    let plans = 0;
    for (const [start] of START_LEVELS.filter(([k]) => k !== "RUNNING")) {
        for (const [goal] of RUN_WALK_GOALS) {
            for (const kind of ["5K", "10K", "training"]) {
                for (let weeks = 4; weeks <= 16; weeks++) {
                    for (const runDays of daySets) {
                        const s = { ...BASE, start, runWalkGoal: goal, runDays,
                            mode: kind === "training" ? "training" : "race", raceType: kind === "10K" ? "10K" : "5K",
                            raceDate: sunday(weeks), endDate: sunday(weeks), strengthDays: weeks % 3 };
                        const { plan } = generateCoachPlan(s, { now: 1 });
                        plans++;
                        const shaped = shapeRunWalk(s).weeks;
                        let prev = -1;
                        shaped.forEach((w, wi) => {
                            const raceWeek = s.mode === "race" && wi === shaped.length - 1;
                            if (!raceWeek) {
                                assert.ok(w.rung >= prev, `never steps back (${start} ${goal} ${kind} ${weeks}w)`);
                                if (prev >= 0) assert.ok(w.rung - prev <= 2);
                                prev = w.rung;
                            }
                            assert.ok(sessions(w).length <= 4);
                            assert.ok(sessions(w).length >= Math.min(2, runDays.length) - (raceWeek ? 2 : 0));
                        });
                        const days = plan.weeks.flatMap(w => w.days);
                        for (const d of days.filter(x => x.workout)) {
                            const { total } = rungTime([main(d).amount, main(d).recovery?.amount || 0, main(d).repeat]);
                            assert.ok(total <= 75, "no session over 75 minutes");
                            assert.ok(executionSteps(d.workout).every(x => x.seconds > 0));
                        }
                        if (s.mode === "race") {
                            assert.equal(days.at(-1).type, "race");
                            assert.ok(!days.find(d => d.date === addDays(s.raceDate, -1)).workout);
                        }
                    }
                }
            }
        }
    }
    assert.ok(plans > 1500);
});

test("the text reads well", () => {
    assert.equal(session([1, 1.5, 8]).session, "Run/walk about 29 min: 8 × 1 min run, 1:30 walk");
    assert.equal(session([30, 0, 1]).session, "Easy run 30 min (5 min walk before and after)");
    assert.equal(session([0.5, 1.5, 10]).session, "Run/walk about 29 min: 10 × 30 sec run, 1:30 walk");
});

test("a timed session reads by time; a distance one doesn't", async () => {
    const { timedMinutes } = await import("../js/runWorkout.js");
    assert.equal(timedMinutes(session([1, 1.5, 8]).workout), 29);
    assert.equal(timedMinutes(session([30, 0, 1]).workout), 40);
    assert.equal(timedMinutes({ warmup: { amount: 1, unit: "mi" }, sets: [{ repeat: 4, amount: 5, unit: "min" }] }), null);
    assert.equal(timedMinutes(null), null);
});

test("Regenerate's preview says what changed in a run/walk week", async () => {
    const { compactChange } = await import("../js/coachPlanGenerator.js");
    const a = { date: "2026-10-12", type: "easy", miles: 2, ...session([2, 1.5, 6]) };
    const b = { date: "2026-10-12", type: "easy", miles: 2, ...session([3, 1.5, 5]) };
    assert.equal(compactChange(a, b), "Run/walk: 6 × 2 min run, 1:30 walk → 5 × 3 min run, 1:30 walk");
});
