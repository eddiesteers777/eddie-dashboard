// Tests for the plan screen's numbers (js/planScreenModel.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanView, openWeek, pickDay, dayChip, BLOCK_TEXT } from "../js/planScreenModel.js";
import { generateCoachPlan } from "../js/coachPlanGenerator.js";
import { generateMarathonPlan } from "../js/marathonEngine.js";

const RUN_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SUN"];
const SETUPS = {
    "5K": { raceType: "5K", startDate: "2026-12-07", raceDate: "2027-03-27", goalTime: "17:45", recentRace: { meters: 5000, seconds: 1080 }, currentMiles: 40, longestRun: 9, runDays: RUN_DAYS, longRunDay: "SUN", tuneUps: ["2027-02-07"] },
    "10K": { raceType: "10K", startDate: "2026-12-07", raceDate: "2027-03-27", goalTime: "38:00", recentRace: { meters: 10000, seconds: 2400 }, currentMiles: 35, longestRun: 9, runDays: RUN_DAYS, longRunDay: "SUN" },
    HALF: { raceType: "HALF", startDate: "2026-12-21", raceDate: "2027-03-28", goalTime: "1:40:00", recentRace: { meters: 10000, seconds: 2700 }, currentMiles: 25, longestRun: 7, runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN" },
    MARATHON: { raceType: "MARATHON", startDate: "2026-12-07", raceDate: "2027-03-28", goalTime: "3:35:00", recentRace: { meters: 21097.5, seconds: 6180 }, currentMiles: 30, longestRun: 10, runDays: ["MON", "TUE", "THU", "FRI", "SUN"], longRunDay: "SUN" }
};
const stored = key => generateCoachPlan({ ...SETUPS[key], engine: "marathon", mode: "race" }).plan;

test("every distance builds a view with blocks, colours and a legend", () => {
    for (const key of Object.keys(SETUPS)) {
        const plan = stored(key);
        const v = buildPlanView(plan, "2027-02-16", { generate: generateMarathonPlan });
        assert.ok(v, key);
        assert.equal(v.total, plan.weeks.length, key);
        assert.equal(v.raceLabel, { "5K": "5K", "10K": "10K", HALF: "Half marathon", MARATHON: "Marathon" }[key]);
        assert.ok(v.weeks.every(w => /^#[0-9a-f]{6}$/i.test(w.colour)), `${key} colours`);
        assert.ok(v.blocks.length >= 2, `${key} blocks`);
        for (const b of v.blocks) assert.ok(b.text, `${key} block "${b.name}" has a line of text`);
        assert.ok(v.legend.length >= 3, key);
        assert.ok(v.chips.some(c => /^Race pace /.test(c.text)), `${key} race pace chip`);
        assert.equal(v.peak, Math.round(Math.max(...v.weeks.map(w => w.miles))));
        assert.equal(v.richOk, true, key);
    }
});

test("key sessions, the 800s test and tune-ups come from the engine, matched by date", () => {
    const v = buildPlanView(stored("5K"), "2027-02-16", { generate: generateMarathonPlan });
    const days = v.weeks.flatMap(w => w.days);
    assert.ok(days.some(d => d.key), "key sessions exist");
    assert.ok(days.some(d => d.benchmark), "an 800s test exists");
    assert.equal(days.find(d => d.date === "2027-02-07")?.tuneUp, true);
    assert.ok(v.hasTune && v.hasTest);
    assert.equal(dayChip(days.find(d => d.benchmark)), "800s test");
    // a rest day is never a key session
    assert.ok(days.filter(d => d.type === "rest").every(d => !d.key));
});

test("down weeks come from the stored plan and the next one is named in a chip", () => {
    const plan = stored("5K");
    const v = buildPlanView(plan, "2027-02-16", { generate: generateMarathonPlan });
    assert.deepEqual(v.weeks.map(w => w.down), plan.weeks.map(w => Boolean(w.cutback)));
    const next = v.weeks.findIndex((w, i) => i > v.index && w.down);
    const chip = v.chips.find(c => c.gold);
    if (next > 0) assert.equal(chip.text, `Down week in ${next - v.index} wk`);
    else assert.equal(chip, undefined);
});

test("where today falls: before, in, after the plan, and the countdown", () => {
    const plan = stored("5K");
    const before = buildPlanView(plan, "2026-11-01", { generate: generateMarathonPlan });
    assert.equal(before.state, "before"); assert.equal(before.index, 0); assert.equal(before.donePct, 0);
    const inside = buildPlanView(plan, "2027-02-16", { generate: generateMarathonPlan });
    assert.equal(inside.state, "in"); assert.equal(inside.toRace, 39);
    assert.ok(inside.ring > 0 && inside.ring < 1);
    assert.ok(inside.weeks[inside.index].startDate <= "2027-02-16" && "2027-02-16" <= inside.weeks[inside.index].endDate);
    const after = buildPlanView(plan, "2027-06-01", { generate: generateMarathonPlan });
    assert.equal(after.state, "after"); assert.equal(after.index, after.total - 1); assert.equal(after.donePct, 100); assert.ok(after.toRace < 0);
    assert.equal(openWeek([], "2027-01-01").state, "none");
});

test("without the engine the screen still works from the stored plan", () => {
    const plan = stored("HALF");
    const v = buildPlanView(plan, "2027-02-16", { generate: null });
    assert.equal(v.richOk, false);
    assert.equal(v.blocks.length, 0);
    assert.equal(v.total, plan.weeks.length);
    assert.ok(v.weeks.every(w => w.colour));
    // a plan whose settings the engine refuses is treated the same way, not an error
    const bad = { ...plan, generator: { settings: { raceType: "5K" } } };
    assert.doesNotThrow(() => buildPlanView(bad, "2027-02-16", { generate: generateMarathonPlan }));
    assert.equal(buildPlanView({ weeks: [] }, "2027-02-16"), null);
    assert.equal(buildPlanView(null, "2027-02-16"), null);
});

test("done runs are counted and the day to open is today, else the first run", () => {
    const plan = stored("10K");
    const wk = plan.weeks[3];
    wk.days.find(d => d.type !== "rest").completed = true;
    const v = buildPlanView(plan, wk.days[2].date, { generate: generateMarathonPlan });
    assert.equal(v.doneRuns, 1);
    assert.equal(pickDay(v.weeks[3], wk.days[2].date).date, wk.days[2].date);
    assert.equal(pickDay(v.weeks[3], "2000-01-01").run, true);
    assert.equal(pickDay(null, "2027-01-01"), null);
});

test("hand edits show through: the stored miles and session win over the engine's", () => {
    const plan = stored("5K");
    const d = plan.weeks[5].days.find(x => x.type === "easy");
    d.miles = 9; d.session = "Easy with the team"; d.edited = true;
    const v = buildPlanView(plan, "2027-02-16", { generate: generateMarathonPlan });
    const shown = v.weeks[5].days.find(x => x.date === d.date);
    assert.equal(shown.miles, 9); assert.equal(shown.session, "Easy with the team"); assert.equal(shown.edited, true);
});

test("every block name any distance can produce has a line of text", () => {
    for (const key of Object.keys(SETUPS)) for (const tier of [20, 40, 60]) {
        const p = generateMarathonPlan({ ...SETUPS[key], currentMiles: tier });
        for (const b of p.summary?.blocks || []) assert.ok(BLOCK_TEXT[b.name], `${key} ${tier}: "${b.name}"`);
    }
});
