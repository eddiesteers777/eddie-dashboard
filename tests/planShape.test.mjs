// Unit tests for the shape of a coach plan (js/planShape.js) through the
// generator, plus a sweep of 300 random settings checked against the
// rules every plan must keep. Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCoachPlan, checkSettings, regeneratePlan, CODES, RACES, TRAINING_GOALS, EXPERIENCE, EQUIPMENT, STRENGTH_LEVELS } from "../js/coachPlanGenerator.js";
import { planPhases } from "../js/planShape.js";
import { sanitizeWorkout, plannedMiles } from "../js/runWorkout.js";
import { addDays, mondayOf } from "../js/coachingPlanModel.js";

const RUNS = ["easy", "long", "workout", "recovery", "race"];
const BASE = {
    mode: "race", raceType: "HALF", raceDate: "2027-01-24", goalTime: "", trainingGoal: "BASE_BUILD",
    startDate: "2026-10-05", endDate: "2026-12-27", trainDays: CODES, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "SUN",
    speedDays: 1, strengthDays: 0, crossDays: 0, currentMiles: 20, peakMiles: 35, longestRun: 8,
    experience: "RECREATIONAL", strengthLevel: "some", equipment: "gym"
};
const make = extra => generateCoachPlan({ ...BASE, ...extra }, { now: 1 });
const allDays = plan => plan.weeks.flatMap(w => w.days);
const runMiles = w => w.days.reduce((t, d) => t + (RUNS.includes(d.type) && d.type !== "race" ? d.miles : 0), 0);

test("weeks run Monday to Sunday; nothing before a mid-week start", () => {
    const { plan } = make({ startDate: "2026-10-07", strengthDays: 3, crossDays: 2 });   // a Wednesday
    assert.equal(plan.weeks[0].startDate, "2026-10-05");
    assert.ok(plan.weeks.every(w => w.days[0].day === "MON"));
    assert.ok(allDays(plan).filter(d => d.date < "2026-10-07").every(d => d.type === "rest" && !d.strength));
    assert.equal(allDays(plan).at(-1).date, "2027-01-24");
    assert.equal(allDays(plan).at(-1).type, "race");
});

test("phases: a short plan tapers briefly, a long one builds in stages", () => {
    const names = (race, weeks) => planPhases({ mode: "race", raceType: race }, weeks).map(p => p.phase[0]).join("");
    assert.equal(names("MARATHON", 6), "BBBRPT", "6 weeks: one taper week, not three");
    assert.equal(names("MARATHON", 20), "FFFBBBBBBBBRRRRPPTTT");
    assert.equal(names("HALF", 12), "FFBBBBBRRPTT");
    assert.equal(names("5K", 3), "BBT");
    const cut = planPhases({ mode: "race", raceType: "HALF" }, 16).map(p => (p.cutback ? "c" : "."));
    assert.equal(cut.join(""), "...c...c...c....", "three up, one down through the build");
    assert.deepEqual(planPhases({ mode: "training" }, 9).map(p => p.cutback), [false, false, false, true, false, false, false, true, false]);
});

test("weekly miles: start at current, grow gently, cut back, taper from the real peak", () => {
    const { plan, warnings } = make({ currentMiles: 20, peakMiles: 45, raceType: "MARATHON", raceDate: "2027-03-07", runDays: ["TUE", "WED", "THU", "SAT", "SUN"], speedDays: 2 });
    const miles = plan.weeks.map(runMiles);
    assert.ok(Math.abs(miles[0] - 20) <= 2, `starts near current: ${miles[0]}`);
    for (let i = 1; i < miles.length - 3; i++) {
        const before = Math.max(miles[i - 1], miles[i - 2] || 0);
        assert.ok(miles[i] <= Math.max(before * 1.2, before + 5), `week ${i + 1}: ${before} -> ${miles[i]}`);
    }
    const peak = Math.max(...miles);
    assert.ok(peak >= 40 && peak <= 46, `peak ${peak}`);
    assert.ok(plan.weeks.some(w => w.phase !== "Taper" && runMiles(w) < peak * 0.85 && runMiles(w) > 20), "cutback weeks");
    const taper = plan.weeks.filter(w => w.phase === "Taper").map(runMiles);
    assert.ok(taper.length === 3 && taper[0] > taper[1] && taper[1] > taper[2], taper.join());
    assert.deepEqual(warnings, []);
    // The long run builds to 20, one step at a time, and is never an easy day's twin.
    const longs = allDays(plan).filter(d => d.type === "long").map(d => d.miles);
    assert.equal(Math.max(...longs), 20);
    for (const w of plan.weeks) {
        const long = w.days.find(d => d.type === "long");
        if (long) assert.ok(w.days.filter(d => d.type === "easy").every(d => d.miles < long.miles), w.startDate);
    }
});

test("quality days are spaced out and kept off the day before the long run", () => {
    const { plan } = make({ runDays: ["TUE", "WED", "THU", "SAT", "SUN"], speedDays: 2, currentMiles: 30, peakMiles: 40 });
    for (const w of plan.weeks.filter(w => w.phase !== "Taper")) {
        const q = w.days.filter(d => d.type === "workout").map(d => d.day);
        assert.ok(!q.includes("SAT"), `${w.startDate}: ${q}`);
        for (let i = 1; i < w.days.length; i++) assert.ok(!(w.days[i].type === "workout" && w.days[i - 1].type === "workout"), w.startDate);
    }
    assert.ok(plan.weeks.filter(w => w.phase !== "Taper").flatMap(w => w.days).filter(d => d.type === "workout").every(d => ["TUE", "THU"].includes(d.day)));
});

test("a brand-new runner: fewer, real runs; run/walk; an honest warning", () => {
    const { plan, warnings } = make({ currentMiles: 3, peakMiles: 100, longestRun: 1, experience: "NEW", runDays: CODES, speedDays: 2 });
    const runs = allDays(plan).filter(d => RUNS.includes(d.type) && d.type !== "race");
    assert.ok(runs.every(d => d.miles >= 1.5), "no run under 1.5 miles");
    assert.ok(plan.weeks[0].days.filter(d => RUNS.includes(d.type)).length <= 2, "3 miles a week is 2 runs, not 7");
    assert.ok(allDays(plan).some(d => /run\/walk/.test(d.session)));
    assert.ok(!allDays(plan).some(d => d.type === "workout" && d.date < "2026-11-01"), "no hard sessions on tiny weeks");
    assert.ok(warnings.some(w => /not the 100 you asked for/.test(w)));
    assert.ok(warnings.some(w => /longest run reaches/.test(w)));
});

test("too few run days for the miles: easy runs stay sane and the coach is told", () => {
    const { plan, warnings } = make({ mode: "training", endDate: "2027-01-31", currentMiles: 45, peakMiles: 60, longestRun: 5, runDays: ["TUE", "THU", "SAT", "SUN"], longRunDay: "TUE", experience: "ADVANCED" });
    assert.ok(allDays(plan).filter(d => d.type === "easy").every(d => d.miles <= 12));
    assert.ok(warnings.some(w => /4 run days can't safely hold 60 miles a week/.test(w)), warnings.join(" | "));
    // Two run days: the long run still only grows (or cuts back), never wobbles down.
    const two = make({ raceType: "50K", raceDate: "2027-03-13", runDays: ["WED", "SUN"], currentMiles: 45, peakMiles: 45, longestRun: 10 }).plan;
    const longs = two.weeks.filter(w => w.phase !== "Taper").map(w => ({ cut: w.cutback, m: w.days.find(d => d.type === "long")?.miles || 0 }));
    let top = 0;
    for (const l of longs) { if (!l.cut) assert.ok(l.m >= top - 0.5, JSON.stringify(longs)); if (!l.cut) top = Math.max(top, l.m); }
});

test("ultras get a back-to-back weekend run; race week ends with a shakeout", () => {
    const { plan } = make({ raceType: "50K", raceDate: "2027-03-14", runDays: ["TUE", "WED", "THU", "SAT", "SUN"], longRunDay: "SAT", currentMiles: 35, peakMiles: 55, longestRun: 14, experience: "INTERMEDIATE" });
    const b2b = allDays(plan).filter(d => /Back-to-back/.test(d.session));
    assert.ok(b2b.length >= 8 && b2b.every(d => d.day === "SUN"), String(b2b.length));
    const raceWeek = plan.weeks.at(-1);
    assert.match(raceWeek.days.find(d => d.day === "SAT").session, /Shakeout/);
    assert.ok(raceWeek.days.find(d => d.day === "SAT").miles <= 3);
    assert.equal(raceWeek.days.at(-1).miles, 31.1);
});

test("a workout always fits its day", () => {
    const { plan } = make({ raceType: "MARATHON", raceDate: "2027-03-07", runDays: ["MON", "WED", "FRI"], longRunDay: "WED", speedDays: 2, currentMiles: 20, peakMiles: 25 });
    for (const d of allDays(plan).filter(d => d.workout)) {
        const pm = plannedMiles(d.workout);
        if (pm.exact) assert.ok(Math.abs(pm.miles - d.miles) <= 1.5, `${d.date}: day ${d.miles}, workout ${pm.miles}`);
    }
});

// ---- The sweep ----

let seed = 20260927;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const DAYSETS = [["TUE", "SAT"], ["WED", "SUN"], ["TUE", "THU", "SUN"], ["MON", "WED", "FRI"], ["TUE", "THU", "SAT", "SUN"],
    ["TUE", "WED", "THU", "SAT", "SUN"], ["MON", "TUE", "WED", "THU", "FRI"], ["MON", "TUE", "WED", "THU", "FRI", "SAT"], CODES];
function randomSettings() {
    const runDays = pick(DAYSETS);
    const trainDays = CODES.filter(c => runDays.includes(c) || rnd() < 0.4);
    const startDate = addDays("2026-10-05", pick([0, 0, 2, 4, 6]));
    const current = pick([0, 3, 8, 15, 25, 40, 60, 80]);
    const weeks = pick([3, 4, 6, 8, 12, 16, 20, 26]);
    return {
        mode: rnd() < 0.65 ? "race" : "training", raceType: pick(RACES)[0], raceDate: addDays(startDate, weeks * 7 - 1 - pick([0, 1, 3])),
        goalTime: pick(["", "", "22:00", "1:45", "3:30:00"]), trainingGoal: pick(TRAINING_GOALS)[0], startDate, endDate: addDays(startDate, weeks * 7 - 1 - pick([0, 2])),
        trainDays, runDays, longRunDay: rnd() < 0.8 ? (runDays.includes("SUN") ? "SUN" : runDays.includes("SAT") ? "SAT" : runDays.at(-1)) : pick(runDays),
        speedDays: pick([0, 1, 2]), strengthDays: pick([0, 1, 2, 3, 4]), crossDays: pick([0, 1, 2]),
        currentMiles: current, peakMiles: Math.min(150, Math.max(current, 3, pick([current, Math.round(current * 1.5), 30, 60, 100]))), longestRun: pick([1, 5, 10, 16]),
        experience: pick(EXPERIENCE)[0], strengthLevel: pick(STRENGTH_LEVELS)[0], equipment: pick(EQUIPMENT)[0]
    };
}

test("300 random settings: every plan keeps the rules", () => {
    let made = 0;
    for (let i = 0; i < 300; i++) {
        const s = randomSettings();
        if (checkSettings(s).length) continue;
        const { plan } = generateCoachPlan(s, { now: 1 });
        made++;
        const tag = JSON.stringify({ ...s, trainDays: undefined });
        const days = allDays(plan);
        for (let k = 1; k < days.length; k++) assert.equal(days[k].date, addDays(days[k - 1].date, 1), tag);
        assert.equal(days.at(-1).date, s.mode === "race" ? s.raceDate : s.endDate, tag);
        if (s.mode === "race") assert.equal(days.filter(d => d.type === "race").length, 1, tag);
        for (const d of days) {
            assert.ok(Number.isFinite(d.miles) && d.miles >= 0, tag);
            if (d.date < s.startDate) assert.equal(d.type, "rest", tag);
            if (RUNS.includes(d.type) && d.type !== "race") {
                assert.ok(s.runDays.includes(d.day), `run on a non-run day ${d.date} ${tag}`);
                assert.ok(d.miles >= 1.5, `run under 1.5 mi ${d.date} ${tag}`);
            }
            if (d.type !== "rest" && d.type !== "race") assert.ok(s.trainDays.includes(d.day) || s.runDays.includes(d.day), tag);
            if (d.strength) assert.ok(d.type !== "long" && d.type !== "race" && !(s.mode === "race" && d.date >= addDays(s.raceDate, -3)), tag);
            if (d.workout) assert.deepEqual(sanitizeWorkout(d.workout), d.workout, tag);
        }
        const full = plan.weeks.filter(w => w.days.length === 7 && w.days[0].date >= s.startDate && w.phase !== "Taper");
        const miles = full.map(runMiles);
        for (let k = 1; k < miles.length; k++) {
            const before = Math.max(miles[k - 1], miles[k - 2] || 0);
            assert.ok(miles[k] <= Math.max(before * 1.2, before + 5), `jump ${before} -> ${miles[k]} ${tag}`);
        }
        if (miles.length) assert.ok(Math.max(...miles) <= Math.max(s.peakMiles * 1.1 + 2, 8), `above peak ${tag}`);
        for (const w of full) {
            const q = w.days.filter(d => d.type === "workout").length;
            assert.ok(q <= s.speedDays, tag);
            for (let k = 1; k < 7; k++) assert.ok(!(w.days[k].type === "workout" && w.days[k - 1].type === "workout"), `quality back to back ${tag}`);
            const longs = w.days.filter(d => d.type === "long");
            assert.ok(longs.length <= 1 && longs.every(d => d.day === s.longRunDay), tag);
            assert.ok(w.days.filter(d => d.strength).length <= s.strengthDays, tag);
        }
        // Regenerating a part of it never fails either.
        regeneratePlan(plan, { ...s, peakMiles: Math.min(150, s.peakMiles + 5) }, { from: addDays(s.startDate, 10), scope: pick(["all", "runs", "strength"]), today: addDays(s.startDate, 10), done: new Set(), now: 2 });
    }
    assert.ok(made > 250, `made ${made}`);
});
