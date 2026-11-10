// Unit tests for the marathon engine (js/marathonEngine.js): Eddie's rules
// (docs/MARATHON_RULES.md) on hand-picked runners, plus a sweep of 400
// random runners checked against the rules every plan must keep.
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMarathonPlan, checkSettings, normalize, fitnessFrom, pacesFrom, planCalendar, clockSeconds, RULES, STIMULI, CODES } from "../js/marathonEngine.js";
import { sanitizeWorkout, paceToSeconds } from "../js/runWorkout.js";
import { addDays, mondayOf } from "../js/coachingPlanModel.js";

const BASE = {
    startDate: "2026-12-07", raceDate: "2027-03-28", goalTime: "3:45:00", recentRace: { meters: 21097.5, seconds: 6300 },
    currentMiles: 30, longestRun: 10, runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN"
};
const make = extra => generateMarathonPlan({ ...BASE, ...extra });
const allDays = plan => plan.weeks.flatMap(w => w.days);
const gapDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const mid = range => { const [a, b] = range.split("-").map(paceToSeconds); return (a + b) / 2; };

test("settings: what stops a plan, in plain words", () => {
    assert.deepEqual(checkSettings(BASE), []);
    assert.ok(checkSettings({ ...BASE, raceDate: "" }).some(m => /race date/.test(m)));
    assert.ok(checkSettings({ ...BASE, runDays: ["TUE", "SUN"] }).some(m => /three run days/.test(m)));
    assert.ok(checkSettings({ ...BASE, currentMiles: 0 }).some(m => /miles/.test(m)));
    assert.ok(checkSettings({ ...BASE, raceDate: "2027-01-10" }).some(m => /at least 8 weeks/.test(m)));
    assert.ok(checkSettings({ ...BASE, startDate: "2026-01-05" }).some(m => /at most 30 weeks/.test(m)));
    assert.equal(make({ raceDate: "" }).weeks.length, 0);
    assert.equal(clockSeconds("3:30"), 12600);
    assert.equal(clockSeconds("3:05:30"), 11130);
    assert.equal(clockSeconds("fast"), 0);
});

test("tiers: injury history is careful, high mileage is experienced, new runners get one key session", () => {
    assert.equal(normalize({ ...BASE, injuryHistory: true, tier: "EXPERIENCED" }).tier, "CAREFUL");
    assert.equal(normalize({ ...BASE, currentMiles: 50 }).tier, "EXPERIENCED");
    assert.equal(normalize(BASE).tier, "NORMAL");
    assert.equal(normalize(BASE).keySessions, "BOTH");
    assert.equal(normalize({ ...BASE, firstMarathon: true }).keySessions, "ALTERNATE");
    assert.equal(normalize({ ...BASE, currentMiles: 18 }).keySessions, "ALTERNATE");
    assert.equal(normalize({ ...BASE, currentMiles: 18, keySessions: "BOTH" }).keySessions, "BOTH");
});

test("the speed day is early in the week and never next to the long run when there is a choice", () => {
    assert.equal(normalize(BASE).speedDay, "TUE");
    assert.equal(normalize({ ...BASE, runDays: ["WED", "FRI", "SAT"], longRunDay: "SAT" }).speedDay, "WED");
    assert.equal(normalize({ ...BASE, runDays: ["MON", "THU", "SAT", "SUN"], longRunDay: "SAT" }).speedDay, "MON");
    assert.equal(normalize({ ...BASE, speedDay: "THU" }).speedDay, "THU");
});

test("paces: a recent race sets them; the goal is checked against it", () => {
    // 1:45 half points to about 3:38; a 3:45 goal is inside that, so race pace follows the goal.
    const fit = fitnessFrom(BASE);
    assert.equal(fit.source, "recent race");
    assert.ok(Math.abs(fit.predictedSec - 13070) < 120, `predicted ${fit.predictedSec}`);
    assert.equal(fit.mpFrom, "goal");
    const paces = pacesFrom(fit);
    assert.ok(Math.abs(mid(paces.marathon) - 13500 / 26.2) < 1);
    // Faster efforts are faster paces.
    const order = ["5K", "10K", "threshold", "half marathon", "marathon", "steady"].map(k => mid(paces[k]));
    assert.deepEqual(order, order.slice().sort((a, b) => a - b));
    assert.ok(paceToSeconds(paces.easy.split("-")[0]) > mid(paces.marathon));

    // A goal far beyond the recent race: paces follow fitness, and the coach is told.
    const stretch = make({ goalTime: "3:10:00" });
    assert.equal(stretch.fitness.mpFrom, "fitness");
    assert.ok(stretch.warnings.some(w => /faster than the recent race suggests/.test(w)));
    // Goal only.
    const goalOnly = make({ recentRace: null });
    assert.equal(goalOnly.fitness.source, "goal time");
    assert.ok(goalOnly.warnings.some(w => /goal time alone/.test(w)));
    // Nothing to go on: effort words, no paces.
    const none = make({ recentRace: null, goalTime: "" });
    assert.equal(none.paces, null);
    assert.ok(allDays(none).filter(d => d.workout).every(d => d.workout.sets.every(x => !x.pace && x.effort)));
});

test("blocks: four weeks each, a new stimulus every block, the fourth week is the down week", () => {
    const cal = planCalendar(16);
    assert.deepEqual(cal.map(w => w.kind), ["build", "build", "build", "down", "build", "build", "build", "down", "build", "build", "build", "down", "peak", "taper", "taper", "race"]);
    assert.deepEqual([...new Set(cal.map(w => w.stimulus))], ["SPEED", "THRESHOLD", "SPECIFIC", "PEAK"]);
    // Longer plans add blocks at the front; leftover weeks settle in first.
    assert.deepEqual([...new Set(planCalendar(24).map(w => w.stimulus))], ["BASE", "HILLS", "SPEED", "THRESHOLD", "SPECIFIC", "PEAK"]);
    assert.deepEqual(planCalendar(18).slice(0, 3).map(w => w.kind), ["leadin", "leadin", "build"]);
    // Short plans keep the marathon-specific block and a 2-week taper.
    const short = planCalendar(10);
    assert.deepEqual(short.slice(-3).map(w => w.kind), ["peak", "taper", "race"]);
    assert.ok(short.some(w => w.stimulus === "SPECIFIC"));
    for (let n = RULES.minWeeks; n <= RULES.maxWeeks; n++) {
        const c = planCalendar(n);
        assert.equal(c.length, n);
        assert.equal(c.at(-1).kind, "race");
        assert.equal(c.filter(w => w.kind === "peak").length, 1);
        for (let i = 1; i < n; i++) assert.ok(!(c[i].kind === "down" && c[i - 1].kind === "down"), "two down weeks in a row");
    }
});

test("a 16-week plan for a normal runner follows the rulebook", () => {
    const plan = make();
    assert.equal(plan.weeks.length, 16);
    assert.equal(plan.weeks[0].startDate, "2026-12-07");
    assert.deepEqual(plan.summary.blocks.map(b => b.name), ["Speed", "Threshold", "Marathon specific", "Peak and taper"]);
    // Down weeks: 20% under the high so far, an easy shorter long run, a lighter speed day.
    const down = plan.weeks[3], before = plan.weeks[2];
    assert.ok(down.down && down.miles < before.miles * 0.87 && down.miles > before.miles * 0.7);
    const longOf = w => w.days.find(d => d.type === "long");
    assert.ok(longOf(down).miles <= longOf(before).miles * 0.75);
    assert.equal(longOf(down).workout, null);
    const speedOf = w => w.days.find(d => d.type === "workout");
    assert.ok(speedOf(down).workout.sets[0].repeat < speedOf(plan.weeks[0]).workout.sets[0].repeat);
    // Mileage: builds from where they are, about half again at most.
    assert.equal(plan.weeks[0].miles, 30);
    assert.ok(plan.summary.peakMiles <= 30 * 1.5 + 1 && plan.summary.peakMiles >= 40);
    // The marathon-specific block has race pace inside the long run.
    for (const w of plan.weeks.slice(8, 11)) assert.match(longOf(w).session, /at race pace/);
    assert.ok(longOf(plan.weeks[12]).workout.sets[0].effort === "marathon", "the peak long run has race pace in it");
    // Taper: the miles come down every week.
    assert.ok(plan.weeks[13].miles < plan.weeks[12].miles && plan.weeks[14].miles < plan.weeks[13].miles && plan.weeks[15].miles < plan.weeks[14].miles);
});

test("the 800s test: the same session in week 2 and the peak week, 8 to 10 reps, 1 to 2 minutes easy", () => {
    for (const extra of [{}, { currentMiles: 55 }, { injuryHistory: true }]) {
        const plan = make(extra);
        const tests = allDays(plan).filter(d => d.benchmark);
        assert.equal(tests.length, 2);
        assert.deepEqual(plan.benchmarks, tests.map(d => d.date));
        assert.deepEqual(tests[0].workout, tests[1].workout);
        const set = tests[0].workout.sets[0];
        assert.ok(set.repeat >= 8 && set.repeat <= 10 && set.amount === 800 && set.unit === "m");
        assert.ok(set.recovery.unit === "min" && set.recovery.amount >= 1 && set.recovery.amount <= 2);
        assert.equal(plan.weeks.find(w => w.days.includes(tests[0])).index, 2);
        assert.equal(plan.weeks.find(w => w.days.includes(tests[1])).kind, "peak");
        assert.ok(tests.every(d => d.day === "TUE"));
    }
    // The coach's own numbers are kept.
    assert.equal(allDays(make({ reps800: 10, rest800: 60 })).find(d => d.benchmark).workout.sets[0].repeat, 10);
});

test("race week: 3 x 1 mile at race pace on the Tuesday, 2 minutes easy between", () => {
    for (const raceDate of ["2027-03-27", "2027-03-28"]) {   // Saturday and Sunday races
        const plan = make({ raceDate });
        const week = plan.weeks.at(-1);
        const day = week.days.find(d => d.raceWeek);
        assert.equal(day.day, "TUE");
        const set = day.workout.sets[0];
        assert.deepEqual([set.repeat, set.amount, set.unit, set.effort], [3, 1, "mi", "marathon"]);
        assert.deepEqual([set.recovery.amount, set.recovery.unit], [2, "min"]);
        assert.equal(set.pace, plan.paces.marathon);
        const race = week.days.find(d => d.type === "race");
        assert.equal(race.date, raceDate);
        assert.ok(week.days.filter(d => d.date > raceDate).every(d => d.type === "rest"));
        // Two days out is a rest day.
        assert.equal(week.days.find(d => d.date === addDays(raceDate, -2)).type, "rest");
    }
    // A mid-week race still gets the session about five days out, in the week before.
    const wed = make({ raceDate: "2027-03-24" });
    const day = allDays(wed).find(d => d.raceWeek);
    assert.ok(gapDays(day.date, "2027-03-24") >= 3 && gapDays(day.date, "2027-03-24") <= 6);
    assert.ok(allDays(wed).filter(d => d !== day && d.type === "workout").every(d => Math.abs(gapDays(d.date, day.date)) > 2));
});

test("long run: 20 miles or 3 hours, whichever comes first", () => {
    // A 29:00 5K runner's easy pace is about 12:00 a mile: three hours is under 15 miles.
    const slow = make({ recentRace: { meters: 5000, seconds: 1740 }, goalTime: "", currentMiles: 30 });
    assert.ok(slow.summary.longCap < 16 && slow.summary.longestRun <= slow.summary.longCap);
    assert.ok(slow.warnings.some(w => /3-hour rule/.test(w)));
    const fast = make({ currentMiles: 55, longestRun: 16, recentRace: { meters: 21097.5, seconds: 5100 }, goalTime: "3:00:00", runDays: ["MON", "TUE", "WED", "THU", "SAT", "SUN"] });
    assert.equal(fast.summary.longestRun, 20);
    assert.equal(fast.summary.longCap, 20);
});

test("one key session a week: speed and the long run workout take turns", () => {
    const plan = make({ firstMarathon: true });
    for (const w of plan.weeks.filter(x => ["build", "peak"].includes(x.kind))) {
        const keys = w.days.filter(d => d.key);
        assert.ok(keys.length <= 1, `week ${w.index} has ${keys.length} key sessions`);
    }
    assert.ok(allDays(plan).some(d => d.type === "long" && d.key), "some long runs carry the work");
    assert.ok(allDays(plan).some(d => d.session === "Easy run + 6 strides"));
    // Both every week for the others.
    const both = make();
    const specific = both.weeks.filter(w => w.stimulus === "Marathon specific" && w.kind === "build");
    assert.ok(specific.every(w => w.days.filter(d => d.key).length === 2));
});

test("the careful ramp: up, hold, up, then a deeper down week", () => {
    const plan = make({ injuryHistory: true, currentMiles: 25, recentRace: null, goalTime: "4:15:00" });
    const t = plan.weeks.map(w => w.targetMiles);
    assert.equal(t[1], t[0], "the first week of the plan holds, the second is the pattern's hold");
    assert.ok(t[2] > t[1]);
    assert.ok(Math.abs(t[3] - t[2] * 0.75) <= 0.5);
    assert.ok(t[4] > t[2] && t[5] === t[4] && t[6] > t[5]);
});

test("warnings tell the coach what to look at", () => {
    assert.ok(make({ raceDate: "2027-02-14" }).warnings.some(w => /10-week plan/.test(w)));
    assert.ok(make({ currentMiles: 12, longestRun: 4, runDays: ["TUE", "THU", "SUN"] }).warnings.some(w => /long run reaches/.test(w)));
    assert.ok(make({ currentMiles: 18 }).warnings.some(w => /800s test is a big day/.test(w)));
    assert.ok(make({ runDays: ["SAT", "SUN", "MON"], longRunDay: "SUN" }).warnings.some(w => /next to the long run/.test(w)));
    assert.ok(make({ goalTime: "4:30:00" }).warnings.some(w => /faster than the goal/.test(w)));
});

test("the coach's peak miles: the plan climbs to it and arrives in the peak week", () => {
    for (const [peakMiles, extra] of [[45, {}], [52, {}], [38, { injuryHistory: true }], [75, { currentMiles: 50 }], [35, { raceDate: "2027-02-14" }]]) {
        const plan = make({ peakMiles, ...extra });
        const peakWeek = plan.weeks.find(w => w.kind === "peak");
        assert.ok(Math.abs(peakWeek.targetMiles - peakMiles) <= 0.5, `asked ${peakMiles}, peak week ${peakWeek.targetMiles}`);
        assert.ok(Math.max(...plan.weeks.map(w => w.targetMiles)) <= peakMiles + 0.5);
    }
    // A far-off peak is reached gradually: the plan climbs at its own pace, never above the ramp.
    const slow = make({ peakMiles: 36 }), fast = make({ peakMiles: 52 });
    const build = plan => plan.weeks.filter(w => w.kind === "build").map(w => w.targetMiles);
    assert.ok(build(slow).some((m, i, a) => i > 0 && m === a[i - 1]) || build(slow).at(-1) <= 36);
    assert.ok(fast.weeks.find(w => w.kind === "peak").targetMiles > slow.weeks.find(w => w.kind === "peak").targetMiles);
    // The peak can't be reached faster than the ramp allows: the coach is told.
    const tooFar = make({ peakMiles: 90, raceDate: "2027-02-28" });
    assert.ok(tooFar.warnings.some(w => /safely/.test(w)));
});

test("long run target: 20 miles for a marathon unless the coach sets another", () => {
    const strong = make({ currentMiles: 40, longestRun: 14, peakMiles: 55, recentRace: { meters: 21097.5, seconds: 5400 }, goalTime: "3:10:00", runDays: ["MON", "TUE", "WED", "THU", "SAT", "SUN"] });
    assert.equal(strong.summary.longestRun, 20);
    assert.equal(make({ longTarget: 16, currentMiles: 40, peakMiles: 55, recentRace: { meters: 21097.5, seconds: 5400 }, goalTime: "3:10:00" }).summary.longestRun, 16);
    // A peak too low to hold a 20 mile run says so.
    const low = make({ peakMiles: 32, recentRace: { meters: 21097.5, seconds: 5400 }, goalTime: "3:10:00" });
    assert.ok(low.summary.longestRun < 20);
    assert.ok(low.warnings.some(w => /short of the 20 asked for/.test(w)));
    // Never over 20, whatever is asked.
    assert.equal(normalize({ ...BASE, longTarget: 26 }).longTarget, 20);
});

test("every stimulus has three weeks of speed sessions and long runs", () => {
    for (const [key, stim] of Object.entries(STIMULI)) {
        assert.equal(stim.speed.length, 3, key);
        assert.equal(stim.long.length, 3, key);
        for (const session of stim.speed) assert.ok(session.name && session.why && session.cue && session.sets.length, key);
    }
});

// ---------- the sweep ----------

function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test("sweep: 400 random runners, every plan keeps the rules", () => {
    const r = rng(20261110);
    const pick = list => list[Math.floor(r() * list.length)];
    const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    for (let n = 0; n < 400; n++) {
        const count = int(3, 7);
        const runDays = CODES.slice().sort(() => r() - 0.5).slice(0, count);
        const startDate = addDays("2026-09-01", int(0, 60));
        const weeks = int(RULES.minWeeks, RULES.maxWeeks);
        const raceDate = addDays(mondayOf(startDate), (weeks - 1) * 7 + pick([5, 6, 6, 6, 2]));
        const currentMiles = int(8, 80);
        const settings = {
            startDate, raceDate, runDays, longRunDay: pick(runDays), currentMiles, longestRun: pick([0, int(3, 18)]),
            goalTime: pick(["", "", "2:55:00", "3:30:00", "4:15:00", "5:30:00"]),
            recentRace: pick([null, { meters: 5000, seconds: int(960, 2100) }, { meters: 21097.5, seconds: int(4500, 9600) }, { meters: 10000, seconds: int(2000, 4300) }]),
            tier: pick([undefined, "CAREFUL", "NORMAL", "EXPERIENCED"]), injuryHistory: r() < 0.2, firstMarathon: r() < 0.3,
            keySessions: pick([undefined, "BOTH", "ALTERNATE"]), peakMiles: pick([0, 0, int(20, 100)])
        };
        const label = `#${n} ${JSON.stringify(settings)}`;
        assert.deepEqual(checkSettings(settings), [], label);
        const plan = generateMarathonPlan(settings);
        const s = plan.settings, tier = RULES.tiers[s.tier];
        assert.equal(plan.weeks.length, weeks, label);

        let prevHigh = 0;
        plan.weeks.forEach((w, i) => {
            assert.equal(w.startDate, addDays(mondayOf(startDate), i * 7), label);
            assert.deepEqual(w.days.map(d => d.day), CODES, label);
            assert.equal(w.miles, w.days.reduce((t, d) => t + (d.type === "race" ? 0 : d.miles), 0), label);
            for (const d of w.days) {
                if (d.type === "rest") { assert.equal(d.miles, 0, label); continue; }
                assert.ok(d.session, label);
                assert.ok(d.type === "race" || runDays.includes(d.day), `${label} runs on a day off (${d.date})`);
                assert.ok(d.date >= startDate, `${label} runs before the start`);
                assert.ok(d.miles >= 2 && d.miles * 2 === Math.round(d.miles * 2) || d.type === "race", `${label} ${d.date} ${d.miles} mi`);
                if (d.workout) assert.deepEqual(d.workout, sanitizeWorkout(d.workout), `${label} workout isn't clean`);
                if (d.type === "long") {
                    assert.ok(d.miles <= RULES.longCapMiles, `${label} long run ${d.miles}`);
                    assert.ok(d.miles <= plan.summary.longCap, `${label} long run over the 3-hour cap`);
                }
            }
            // Mileage: an up week never adds more than the ramp (plus rounding) to the high so far.
            if (["build", "peak"].includes(w.kind) && i > 0) {
                assert.ok(w.targetMiles <= Math.max(prevHigh * (1 + tier.ramp), prevHigh + RULES.stepMin) + 0.5, `${label} week ${w.index} jumps ${prevHigh} -> ${w.targetMiles}`);
            }
            if (w.kind === "down") {
                assert.ok(w.targetMiles < prevHigh, label);
                assert.ok(!w.days.some(d => d.benchmark), `${label} tests in a down week`);
                assert.ok(!w.days.some(d => d.type === "long" && d.workout), `${label} long run workout in a down week`);
                assert.ok(plan.weeks[i - 1].kind !== "down", label);
            }
            if (["leadin", "build", "peak"].includes(w.kind)) prevHigh = Math.max(prevHigh, w.targetMiles);
            if (s.keySessions === "ALTERNATE" && ["build", "peak"].includes(w.kind)) assert.ok(w.days.filter(d => d.key).length <= 1, `${label} week ${w.index} two key sessions`);
        });

        // A new stimulus every block.
        const blocks = plan.summary.blocks;
        for (let i = 1; i < blocks.length; i++) assert.notEqual(blocks[i].name, blocks[i - 1].name, label);
        for (const b of blocks.slice(0, -1)) assert.ok(b.to - b.from + 1 <= 4, label);

        // The race, and the race-pace day before it.
        const days = allDays(plan);
        const race = days.filter(d => d.type === "race");
        assert.equal(race.length, 1, label);
        assert.equal(race[0].date, raceDate, label);
        const rp = days.filter(d => d.raceWeek);
        if (rp.length) {
            const gap = gapDays(rp[0].date, raceDate);
            assert.ok(gap >= 3 && gap <= 6, `${label} race-pace day ${gap} days out`);
            assert.equal(rp[0].workout.sets[0].repeat, 3, label);
        }
        // No hard day in the last three days.
        assert.ok(days.filter(d => d.type === "workout").every(d => gapDays(d.date, raceDate) >= 3), label);
        // The 800s days match each other.
        const tests = days.filter(d => d.benchmark);
        assert.ok(tests.length <= 2, label);
        if (tests.length === 2) {
            assert.deepEqual(tests[0].workout, tests[1].workout, label);
            assert.ok(gapDays(tests[0].date, tests[1].date) >= RULES.benchmarkGapWeeks * 7, label);
        }
        // Speed and the long run are apart whenever the run days allow it.
        const clear = runDays.filter(c => c !== s.longRunDay && Math.min(Math.abs(CODES.indexOf(c) - CODES.indexOf(s.longRunDay)), 7 - Math.abs(CODES.indexOf(c) - CODES.indexOf(s.longRunDay))) >= 2);
        if (clear.length) assert.ok(clear.includes(s.speedDay), `${label} speed day ${s.speedDay}`);
        // The taper comes down.
        const taper = plan.weeks.filter(w => ["peak", "taper"].includes(w.kind)).map(w => w.targetMiles);
        for (let i = 1; i < taper.length; i++) assert.ok(taper[i] < taper[i - 1], label);
    }
});
