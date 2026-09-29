// Unit tests for tailoring a plan with a chatbot (js/planPrompt.js): the
// prompt, reading the answer back (clean and messy), applying it, and the
// safety checks. Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, dayLine, workoutShorthand, readLine, readStrength, parseReply, applyReply, checkPlan } from "../js/planPrompt.js";
import { generateCoachPlan, CODES } from "../js/coachPlanGenerator.js";
import { timedMinutes } from "../js/runWorkout.js";

const HALF = {
    mode: "race", raceType: "HALF", raceDate: "2027-01-24", goalTime: "1:45:00", trainingGoal: "BASE_BUILD",
    startDate: "2026-10-05", endDate: "2026-12-27", trainDays: CODES, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "SUN",
    speedDays: 1, strengthDays: 2, crossDays: 1, currentMiles: 20, peakMiles: 35, longestRun: 8,
    experience: "RECREATIONAL", strengthLevel: "some", equipment: "gym"
};
const RUNWALK = { ...HALF, raceType: "5K", raceDate: "2026-12-06", start: "RUN1", runWalkGoal: "CONTINUOUS", runDays: ["MON", "WED", "SAT"], strengthDays: 1 };
const RECORD = {
    preferredName: "Sam", birthYear: 1992, phone: "555-0100", primarySport: "running", weeklyMileage: 20,
    primaryGoal: "Break 1:45 in the half", targetEvent: "Indy Half", targetDate: "2027-01-24",
    availabilityDays: ["tue", "wed", "thu", "sat", "sun"], injuries: "Left Achilles gets tight on hills"
};
const days = plan => plan.weeks.flatMap(w => w.days);
// What matters in a day, ignoring recoveries that can't happen (one rep).
const shape = d => JSON.stringify({
    t: d.type, m: d.miles, st: d.strength?.title || null,
    w: d.workout ? [d.workout.warmup && [d.workout.warmup.amount, d.workout.warmup.unit], (d.workout.sets || []).map(s => [s.repeat, s.amount, s.unit, s.pace || s.effort, s.repeat > 1 && s.recovery ? [s.recovery.amount, s.recovery.unit] : null]), d.workout.cooldown && [d.workout.cooldown.amount, d.workout.cooldown.unit]] : null
});

test("the prompt: first name only, the profile, the notes, every day in range, the format and the library", () => {
    const { plan } = generateCoachPlan(HALF, { now: 1 });
    const text = buildPrompt({ firstName: "Sam", record: RECORD, notes: "Sore knee: no hills for 2 weeks.", plan, from: "2026-10-12", today: "2026-10-01" });
    assert.match(text, /Name: Sam \(first name only\)/);
    assert.match(text, /Age: about 34/);
    assert.ok(!/1992|555-0100|@/.test(text.replace(/@ [\w:.-]+/g, "")), "no birth year, phone or email");
    assert.match(text, /Left Achilles gets tight on hills/);
    assert.match(text, /Sore knee: no hills for 2 weeks\./);
    assert.match(text, /Race day: 2027-01-24/);
    const lines = text.split("\n").filter(l => /^\d{4}-\d{2}-\d{2} \w{3} \|/.test(l));
    const inRange = days(plan).filter(d => d.date >= "2026-10-12");
    assert.equal(lines.length, inRange.length + 6, "every day from the start date, plus the 6 examples");
    assert.equal(lines.filter(l => l >= "2026-10-12").length, inRange.length);
    assert.match(text, /DATE \| TYPE \| MILES \| WORKOUT \| STRENGTH \| NOTE/);
    assert.match(text, /My strength library: .*Core 20/);
    const runsOnly = buildPrompt({ firstName: "Sam", record: RECORD, plan, from: "2026-10-12", scope: "runs" });
    assert.match(runsOnly, /Copy the STRENGTH column exactly/);
    assert.ok(!/My strength library/.test(runsOnly));
});

test("the prompt's own examples read back cleanly (they teach the chatbot the format)", () => {
    const text = buildPrompt({ firstName: "Sam", record: {}, plan: generateCoachPlan(HALF, { now: 1 }).plan, from: "2026-10-05" });
    const examples = text.split("Examples:")[1].split("```")[1].trim().split("\n");
    assert.equal(examples.length, 6);
    for (const line of examples) {
        const r = readLine(line);
        assert.ok(r && !r.problem, line);
        assert.deepEqual(r.problems, [], line);
    }
    const rw = readLine(examples[3]);
    assert.equal(rw.rx.type, "easy");
    assert.equal(timedMinutes(rw.rx.workout), 30);
    assert.equal(rw.rx.workout.sets[0].recovery.note, "walk");
    assert.match(rw.rx.session, /^Run\/walk about 30 min: 6 × 2 min run, 1:30 walk/);
    assert.equal(readLine(examples[2]).strength.title, "Core 20");
    assert.equal(readLine(examples[1]).rx.workout.sets[0].effort, "threshold");
    assert.match(readLine(examples[1]).rx.session, /^Cruise intervals: /);
});

test("round trip: a whole generated plan, written out and read back, comes back the same", () => {
    for (const settings of [HALF, RUNWALK]) {
        const { plan } = generateCoachPlan(settings, { now: 1 });
        const text = days(plan).map(dayLine).join("\n");
        const read = parseReply(text, { plan, from: days(plan)[0].date });
        assert.equal(read.same, days(plan).length, "copied back as it was: every day left exactly as it is");
        assert.deepEqual([read.days, read.unread, read.problems], [[], [], []]);
        // And reading each line on its own gives the same days back.
        const each = days(plan).map(d => readLine(dayLine(d))).map(r => ({ date: r.date, rx: r.rx, strength: r.strength }));
        assert.ok(each.every((r, i) => !readLine(dayLine(days(plan)[i])).problems.length));
        const back = days(applyReply(plan, each));
        const before = days(plan);
        const different = before.filter((d, i) => shape(d) !== shape(back[i]));
        // Only the shakeout gains structured strides.
        assert.ok(different.every(d => /strides/.test(d.session)), different.map(dayLine).join("\n"));
    }
});

test("a line copied back with different spacing, bold or a table around it still counts as unchanged", () => {
    const { plan } = generateCoachPlan(HALF, { now: 1 });
    const day = days(plan).find(d => d.workout);
    const line = dayLine(day);
    const messy = `| **${line.replace(/ \| /g, "  |  ").replace(/ \w{3} \|/, " |")}** |`;
    const read = parseReply(messy, { plan, from: days(plan)[0].date });
    assert.equal(read.same, 1);
    assert.equal(read.days.length, 0);
});

test("a messy answer: table, bold, bullets, weekdays first, US dates, missing miles, duplicates, other dates", () => {
    const { plan } = generateCoachPlan(HALF, { now: 1 });
    const reply = [
        "Here's the updated plan for Sam:",
        "```",
        "| Date | Type | Miles | Workout | Strength | Note |",
        "|---|---|---|---|---|---|",
        "| **2026-10-13 Tue** | easy | 4 | Easy + 4 strides | none | |",
        "- 2026-10-14 | strength | | | Core 20 (lighter) |",
        "Thu 2026-10-15 | workout | 6 | Tempo: 1.5mi WU; 20min @ tempo; 1.5mi CD | Upper: 3x10 Push-up; 3x8 Dumbbell row @ 30 lb; 3x30s Plank | Steady, not straining.",
        "10/17/2026 | long | 9 | Long run, last 2mi @ 8:40 | keep |",
        "2026-10-18 Sun | cross | Bike 45min easy | none",
        "2026-10-18 Sun | rest | | | none |",
        "2026-10-16 Fri | jog-ish | 3 | ??? | none |",
        "2026-09-01 Tue | easy | 3 | Easy | none |",
        "2026-10-06 Tue | easy | 5 | Easy | none |",
        "2026-10-20 Tue | easy | 5 | Easy | none |",
        "```",
        "I lowered Thursday and kept the long run."
    ].join("\n");
    const read = parseReply(reply, { plan, from: "2026-10-12", done: new Set(["2026-10-20"]) });
    const by = Object.fromEntries(read.days.map(d => [d.date, d]));
    assert.deepEqual(Object.keys(by).sort(), ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-17", "2026-10-18"]);
    assert.equal(by["2026-10-13"].rx.workout.sets.at(-1).effort, "strides", "4 strides are strides, not 4 miles");
    assert.equal(by["2026-10-14"].strength.title, "Core 20");
    assert.equal(by["2026-10-15"].strength.exercises.length, 3);
    assert.equal(by["2026-10-15"].strength.exercises[1].weight, 30);
    assert.equal(by["2026-10-15"].rx.workout.why, "Steady, not straining.");
    assert.equal(by["2026-10-17"].strength, undefined, "keep");
    assert.equal(by["2026-10-17"].rx.workout.sets.at(-1).pace, "8:40");
    assert.equal(by["2026-10-18"].rx.type, "cross", "miles left out: the workout moved over");
    assert.equal(by["2026-10-18"].rx.session, "Bike 45min easy");
    assert.ok(read.problems.some(p => p.date === "2026-10-18" && /twice/.test(p.why)));
    assert.ok(read.unread.some(u => /jog-ish/.test(u.why)));
    assert.deepEqual(read.skipped.map(s => s.why).sort(), ["before the dates you asked about", "marked done by the client", "not a date in this plan"]);
});

test("applying: done days and other dates untouched, strength kept / dropped / added, runs only", () => {
    const { plan } = generateCoachPlan(HALF, { now: 1 });
    const all = days(plan);
    const withStrength = all.find(d => d.strength && d.type === "easy" && d.date > "2026-10-12");
    const restDay = all.find(d => d.type === "rest" && !d.strength && d.date > "2026-10-12");
    all[0].completed = true;
    const lines = [
        `${withStrength.date} | easy | 3 | Easy | keep | `,
        `${restDay.date} | rest |  |  | Core 20 | `
    ].join("\n");
    const next = applyReply(plan, parseReply(lines, { plan, from: "2026-10-12" }).days);
    const n = Object.fromEntries(days(next).map(d => [d.date, d]));
    assert.equal(n[withStrength.date].strength.title, withStrength.strength.title);
    assert.equal(n[withStrength.date].miles, 3);
    assert.equal(n[restDay.date].type, "strength", "a rest day with a session becomes a strength day");
    assert.equal(n[restDay.date].session, "Core 20");
    assert.equal(days(next)[0].completed, true, "the client's marks stay");
    const dropped = applyReply(plan, parseReply(`${withStrength.date} | strength |  |  | none | `, { plan, from: "2026-10-12" }).days);
    assert.equal(days(dropped).find(d => d.date === withStrength.date).type, "rest");
    const runsOnly = applyReply(plan, parseReply(`${withStrength.date} | easy | 3 | Easy | none | `, { plan, from: "2026-10-12", scope: "runs" }).days);
    assert.equal(days(runsOnly).find(d => d.date === withStrength.date).strength.title, withStrength.strength.title);
    assert.notEqual(plan.weeks[1].plannedMiles, undefined);
});

test("strength column: library names, lighter, custom exercises, nonsense", () => {
    assert.equal(readStrength("Marathon Strength Light").value.title, "Marathon Strength Light");
    assert.match(readStrength("Full Body 30 (lighter)").value.notes, /Lighter week/);
    assert.equal(readStrength("none").value, null);
    assert.equal(readStrength("").value, undefined);
    const custom = readStrength("Hotel: 3x12 Goblet squat @ 20 kg; 2x10/side Split squat; 3x45s Side plank").value;
    assert.equal(custom.title, "Hotel");
    assert.deepEqual(custom.exercises.map(e => [e.sets, e.reps, e.name, e.weight]), [[3, "12", "Goblet squat", 44], [2, "10/side", "Split squat", null], [3, "45s", "Side plank", null]]);
    const junk = readStrength("something nice for the legs");
    assert.equal(junk.value, undefined);
    assert.match(junk.problem, /wasn't understood/);
});

test("the shorthand writer", () => {
    assert.equal(workoutShorthand({ warmup: { amount: 1.5, unit: "mi" }, sets: [{ repeat: 6, amount: 800, unit: "m", effort: "5K", recovery: { amount: 400, unit: "m", note: "easy jog" } }], cooldown: { amount: 1, unit: "mi" } }), "1.5mi WU; 6x800m @ 5K; 400m jog; 1mi CD");
    assert.equal(workoutShorthand({ warmup: { amount: 5, unit: "min" }, sets: [{ repeat: 8, amount: 1, unit: "min", effort: "easy", recovery: { amount: 1.5, unit: "min", note: "walk" } }], cooldown: { amount: 5, unit: "min" } }), "5min WU; 8x1min @ easy; 90s walk; 5min CD");
    assert.equal(workoutShorthand({ sets: [{ repeat: 6, amount: 0.5, unit: "min", effort: "fast, relaxed", recovery: { amount: 1, unit: "min", note: "walk / jog" } }] }), "6x30s @ fast; 1min walk");
});

test("safety checks", () => {
    const { plan } = generateCoachPlan(HALF, { now: 1 });
    assert.deepEqual(checkPlan(plan, { from: "2026-10-05" }), [], "the generator's own plan is fine");
    const all = days(plan);
    const wk3 = plan.weeks[2].days;
    const bump = applyReply(plan, wk3.filter(d => d.type === "easy").map(d => ({ date: d.date, rx: { type: "easy", miles: 11, session: "Easy" } })));
    assert.ok(checkPlan(bump, { from: "2026-10-05" }).some(w => /Week 3 jumps/.test(w)));
    const long = all.find(d => d.type === "long" && d.date > "2026-10-12");
    const hard = applyReply(plan, [{ date: long.date.replace(/\d{2}$/, x => String(Number(x) - 1).padStart(2, "0")), rx: { type: "workout", miles: 6, session: "Tempo" } }]);
    assert.ok(checkPlan(hard, { from: "2026-10-05" }).some(w => /back to back/.test(w)));
    const race = applyReply(plan, [{ date: "2027-01-24", rx: { type: "easy", miles: 3, session: "Easy" } }]);
    assert.ok(checkPlan(race, { from: "2026-10-05" }).some(w => /Race day .* isn't a race/.test(w)));
    const busy = applyReply(plan, plan.weeks[4].days.map(d => ({ date: d.date, rx: { type: "easy", miles: 3, session: "Easy" } })));
    const warnings = checkPlan(busy, { from: "2026-10-05", record: { availabilityDays: ["tue", "thu", "sat", "sun"] } });
    assert.ok(warnings.some(w => /Week 5 has no rest day/.test(w)));
    assert.ok(warnings.some(w => /can't train/.test(w)));
});

test("the prompt uses training answers but never health answers or contacts", () => {
    const plan = generateCoachPlan(HALF);
    const record = { ...RECORD, runsPerWeek: 4, longestRun: 10, equipment: ["dumbbells"], injuryAreas: ["knee"], injuryStatus: "recovering",
        healthFlags: ["heart"], healthNote: "Beta blockers", healthCheckedAt: 1, emergencyName: "Pat Smith", emergencyPhone: "555-0199",
        guardianName: "Jo Smith", guardianPhone: "555-0111" };
    const text = buildPrompt({ firstName: "Sam", record, plan, from: HALF.startDate, today: HALF.startDate });
    assert.ok(text.includes("- Runs a week: 4") && text.includes("- Longest recent run: 10 mi") && text.includes("- Equipment: Dumbbells"));
    assert.ok(/Injuries \/ limits: .*Knee · Getting better/.test(text));
    for (const secret of ["Beta blockers", "heart", "Pat Smith", "555-0199", "Jo Smith", "555-0111"]) assert.ok(!text.includes(secret), secret);
});
