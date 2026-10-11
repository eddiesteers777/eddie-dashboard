// Unit tests for the race-day fuel schedule math (js/fuelSchedule.js).
// Run with: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildSchedule, scheduleInputFromPlan, diyMix, formatTsp, formatClock, FINAL_GEL_BUFFER_MIN
} from "../js/fuelSchedule.js";

const marathon = {
    durationMin: 185,
    distanceMi: 26.2,
    items: [
        { name: "Hammer Gel", carbs: 22, sodium: 60, qty: 4 },
        { name: "Caffeine Gel", carbs: 25, sodium: 60, caffeine: true, qty: 2 }
    ],
    drink: { bottleCount: 3, bottleSize: 20, carbs: 120, sodium: 900, carbSource: "table-sugar", sodiumSource: "table-salt" },
    targets: { carbsPerHour: 75, fluidPerHour: 22, sodiumPerHour: 500 },
    firstGelMin: 30
};

test("gels start at the first-gel time, end before the final buffer, evenly spaced", () => {
    const s = buildSchedule(marathon);
    assert.equal(s.gels.length, 6);
    assert.equal(s.gels[0].min, 30);
    assert.ok(s.gels.at(-1).min <= 185 - FINAL_GEL_BUFFER_MIN);
    const gaps = s.gels.slice(1).map((g, i) => g.min - s.gels[i].min);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `uneven gaps ${gaps}`);
});

test("gel miles follow the run's actual pace", () => {
    const s = buildSchedule(marathon);
    const pace = 185 / 26.2;
    for (const g of s.gels) assert.ok(Math.abs(g.mile - g.min / pace) <= 0.05, `gel ${g.n}`);
});

test("caffeinated gels are scheduled last", () => {
    const s = buildSchedule(marathon);
    assert.deepEqual(s.gels.map(g => g.caffeine), [false, false, false, false, true, true]);
});

test("bottles split the run into equal, back-to-back mile ranges covering the whole distance", () => {
    const s = buildSchedule(marathon);
    assert.equal(s.bottles.length, 3);
    assert.equal(s.bottles[0].startMile, 0);
    assert.equal(s.bottles.at(-1).endMile, 26.2);
    s.bottles.slice(1).forEach((b, i) => assert.equal(b.startMile, s.bottles[i].endMile));
    assert.equal(s.bottles[0].carbs, 40);
    assert.equal(s.bottles[0].sodium, 300);
    assert.equal(s.bottles[0].ozPerMile, Math.round(20 / (26.2 / 3) * 10) / 10);
});

test("per-bottle mix uses the chosen ingredient", () => {
    const sugar = buildSchedule(marathon).mix;
    assert.equal(sugar.carbGrams, 40);
    assert.equal(sugar.sodiumGrams, Math.round(300 / 393 * 100) / 100);
    const malto = buildSchedule({ ...marathon, drink: { ...marathon.drink, carbSource: "maltodextrin" } }).mix;
    assert.equal(malto.carbGrams, Math.round(40 / 0.95 * 10) / 10);
    assert.equal(malto.carbTsp, null, "no teaspoon conversion for maltodextrin");
});

test("totals add gels and drink; hour windows add back up to the totals", () => {
    const s = buildSchedule(marathon);
    assert.equal(s.totals.carbs, 4 * 22 + 2 * 25 + 120);
    assert.equal(s.totals.fluid, 60);
    const hourCarbs = s.hours.reduce((sum, h) => sum + h.carbs, 0);
    assert.ok(Math.abs(hourCarbs - s.totals.carbs) <= s.hours.length, `${hourCarbs} vs ${s.totals.carbs}`);
    assert.equal(s.hours.at(-1).toMin, 185, "a 5-minute leftover joins the last hour");
    assert.equal(s.hours.length, 3);
});

test("events read in order: bottles, gels, finish", () => {
    const s = buildSchedule(marathon);
    const mins = s.events.map(e => e.min);
    assert.deepEqual(mins, [...mins].sort((a, b) => a - b));
    assert.equal(s.events[0].text, "Start Bottle 1");
    assert.equal(s.events.at(-1).kind, "finish");
    assert.equal(s.events.filter(e => e.kind === "gel").length, 6);
});

test("flags a strong drink and a fluid shortfall", () => {
    const strong = buildSchedule({ ...marathon, drink: { ...marathon.drink, bottleSize: 10 } });
    assert.ok(strong.concentration > 10);
    assert.ok(strong.warnings.some(w => w.includes("carb mix")));
    assert.ok(strong.warnings.some(w => w.includes("aid stations")));
});

test("time-only runs still schedule, without miles", () => {
    const s = buildSchedule({ ...marathon, distanceMi: 0 });
    assert.equal(s.gels[0].mile, null);
    assert.equal(s.bottles[0].ozPerMile, null);
    assert.ok(s.warnings.some(w => w.includes("distance")));
});

test("single gel lands mid-window; no gels or drink is fine", () => {
    const one = buildSchedule({ ...marathon, durationMin: 90, items: [{ name: "Gel", carbs: 22, qty: 1 }] });
    assert.equal(one.gels[0].min, Math.round((30 + 75) / 2));
    const empty = buildSchedule({ durationMin: 45, distanceMi: 5, items: [], drink: null, targets: {} });
    assert.equal(empty.gels.length, 0);
    assert.equal(empty.bottles.length, 0);
    assert.equal(empty.events.at(-1).kind, "finish");
});

test("old saved plans (no schedule fields) still produce a schedule", () => {
    const plan = {
        duration: 120, carbsPerHour: 60, fluidPerHour: 20, sodiumPerHour: 400,
        marathonRef: { week: 10, dayKey: "Sun", miles: 15 },
        session: { distance: 15, duration: 120 },
        items: [{ name: "Gel", carbs: 25, sodium: 50, qty: 2 }],
        includeHomemadeDrink: true,
        diyInputs: { bottleSize: 20, bottleCount: 2, carbTarget: 70, sodiumTarget: 600, carbSource: "table-sugar", sodiumSource: "table-salt" }
    };
    const s = buildSchedule(scheduleInputFromPlan(plan));
    assert.equal(s.firstGelMin, 30);
    assert.equal(s.bottles.length, 2);
    assert.equal(s.bottles[1].endMile, 15);
    assert.equal(s.gels.length, 2);
});

test("drink is left out when unchecked or bottles are missing", () => {
    const base = { duration: 60, diyInputs: { bottleSize: 20, bottleCount: 1, carbTarget: 30 } };
    assert.equal(scheduleInputFromPlan({ ...base, includeHomemadeDrink: false }).drink, null);
    assert.equal(scheduleInputFromPlan({ duration: 60, diyInputs: { bottleSize: 0, bottleCount: 1 } }).drink, null);
});

test("formatting helpers", () => {
    assert.equal(formatTsp(2.3), "2 ¼");
    assert.equal(formatTsp(0.13), "⅛");
    assert.equal(formatTsp(0.02), "a pinch");
    assert.equal(formatTsp(3), "3");
    assert.equal(formatClock(185), "3:05");
    assert.equal(formatClock(7), "0:07");
    assert.equal(diyMix({ carbTarget: 0, sodiumTarget: 0 }).carbGrams, 0);
});

// ---- Fueling audit step 1: the duration rule, inputs, the drink, saved plans ----
import { parsePace, formatPace, resolveRun, estimateDurationMinutes, calculateTargets, baseCarbsPerHour, paceForLabel } from "../js/fuelTargets.js";
import { toFluid, fromFluid, fluidText, fluidWords } from "../js/fluidUnits.js";
import { drinkIncluded, firstGelValue, sodiumText, isSipped, parseStartTime, timeOfDay, drinkRecipe, recipeParts, carbSourceKey } from "../js/fuelSchedule.js";

test("paces are read per mile or per km, ranges by their middle, words not at all", () => {
    assert.equal(parsePace("8:30"), 8.5);
    assert.equal(parsePace("8:30/mi"), 8.5);
    assert.equal(parsePace(" 8:30 per mile "), 8.5);
    assert.equal(parsePace("8:15-8:45"), 8.5);
    assert.equal(parsePace("8"), 8);
    assert.ok(Math.abs(parsePace("5:17/km") - 8.505) < 0.01);
    for (const bad of ["", "Easy", "MP", "8:75", "2:00", "45:00", "abc", "-1"]) assert.equal(parsePace(bad), null, bad);
    assert.equal(formatPace(8.5), "8:30");
    assert.equal(formatPace(7.999), "8:00");
});

test("adaptable: the two typed most recently work out the third (test 1)", () => {
    const a = resolveRun({ distance: 18, pace: "8:30", order: ["pace", "distance"] });
    assert.equal(a.minutes, 153);
    assert.equal(a.computed, "duration");
    // Then the duration is typed: distance + duration now set the pace.
    const b = resolveRun({ distance: 18, pace: "8:30", duration: 150, order: ["duration", "distance"] });
    assert.equal(b.computed, "pace");
    assert.equal(b.minutes, 150);
    assert.equal(formatPace(b.paceMin), "8:20");
    // Pace + duration set the distance.
    const c = resolveRun({ distance: 18, pace: "8:00", duration: 160, order: ["pace", "duration"] });
    assert.equal(c.computed, "distance");
    assert.equal(c.distance, 20);
    // Untracked typed fields (an older plan) still count, after the tracked ones.
    assert.equal(resolveRun({ distance: 18, duration: 90 }).computed, "pace");
    assert.equal(estimateDurationMinutes({ distance: 18, pace: "8:30", workoutType: "long" }), 153);
});

test("one field: a duration alone is enough, a distance uses a typical pace, nothing makes no plan (test 10)", () => {
    assert.equal(resolveRun({ duration: 75 }).minutes, 75);
    const d = resolveRun({ distance: 12, workoutType: "long" });
    assert.equal(d.source, "distance-typical");
    assert.equal(d.minutes, 99);
    const none = resolveRun({});
    assert.equal(none.minutes, null);
    assert.equal(resolveRun({ pace: "8:00" }).minutes, null, "a pace alone isn't a run");
});

test("blank, zero, negative and huge inputs give no NaN, no Infinity and a plain message (test 10)", () => {
    const cases = [
        { distance: "", pace: "", duration: "" },
        { distance: 0, pace: "0:00", duration: 0 },
        { distance: -5, pace: "8:00" },
        { distance: 1e9, pace: "8:00" },
        { distance: 10, duration: 1e9 },
        { distance: 10, duration: 5, order: ["duration", "distance"] },
        { distance: "abc", pace: "fast" }
    ];
    for (const c of cases) {
        const r = resolveRun(c);
        assert.ok(r.minutes === null || (Number.isFinite(r.minutes) && r.minutes > 0), JSON.stringify(c));
        if (r.paceMin != null) assert.ok(Number.isFinite(r.paceMin), JSON.stringify(c));
        if (r.minutes) for (const v of Object.values(calculateTargets({ duration: r.minutes }))) assert.ok(Number.isFinite(v), JSON.stringify(c));
    }
    assert.ok(resolveRun({ distance: -5, pace: "8:00" }).problems.length);
    assert.ok(resolveRun({ distance: 10, pace: "fast" }).problems.some(p => /Couldn't read the pace/.test(p)));
    assert.ok(resolveRun({ distance: 10, duration: 5, order: ["duration", "distance"] }).problems.some(p => /a mile/.test(p)));
});

test("carbs rise gradually with the run's length: no jump at 75 or 150 min", () => {
    for (const mode of ["training", "race"]) {
        let prev = 0;
        for (let d = 30; d <= 300; d += 1) {
            const v = baseCarbsPerHour(d, mode);
            assert.ok(v >= prev - 1e-9, `${mode} never drops (${d})`);
            assert.ok(v - prev <= 2.01, `${mode} rises at most 2 g/hr a minute (${d}: ${prev} -> ${v})`);
            prev = v;
        }
    }
    assert.equal(baseCarbsPerHour(40), 0);
    assert.equal(baseCarbsPerHour(90), 40);
    assert.ok(baseCarbsPerHour(151, "race") - baseCarbsPerHour(149, "race") < 1, "the old 45 -> 75 cliff is gone");
    assert.ok(baseCarbsPerHour(200, "race") > baseCarbsPerHour(200, "training"), "a race asks a little more on long runs");
    assert.equal(baseCarbsPerHour(90, "race"), baseCarbsPerHour(90, "training"));
});

test("one pace table: the plan's own ranges first, then the shared words", () => {
    const PACES = [["Easy", "8:15–9:00 /mi"], ["Long Run", "7:50–8:40 /mi"], ["Marathon Pace", "6:58–7:05 /mi"], ["Hill Repeats / Fartlek", "Run by effort"]];
    assert.equal(formatPace(paceForLabel("Long Run", PACES)), "8:15");
    assert.equal(formatPace(paceForLabel("marathon pace", PACES)), "7:02");
    assert.equal(paceForLabel("Fartlek", PACES), 8.3, "a range it can't read falls back to the table");
    assert.equal(paceForLabel("Threshold"), 6.7);
    assert.equal(paceForLabel(""), null);
});

test("the drink counts in the totals and the schedule by the same rule (defect 6)", () => {
    assert.equal(drinkIncluded(true, { bottleSize: 0, bottleCount: 2 }), false);
    assert.equal(drinkIncluded(true, { bottleSize: 20, bottleCount: 2 }), true);
    assert.equal(drinkIncluded(false, { bottleSize: 20, bottleCount: 2 }), false);
    const plan = { duration: 120, carbsPerHour: 60, includeHomemadeDrink: true, diyInputs: { bottleSize: 0, bottleCount: 2, carbTarget: 60 } };
    assert.equal(scheduleInputFromPlan(plan).drink, null);
});

test("first gel at 0 is the earliest (5 min), not 30; blank is the default (defect 12)", () => {
    assert.equal(firstGelValue(0), 5);
    assert.equal(firstGelValue("0"), 5);
    assert.equal(firstGelValue(""), 30);
    assert.equal(firstGelValue(null), 30);
    assert.equal(firstGelValue(45), 45);
    const s = buildSchedule({ ...marathon, firstGelMin: 0 });
    assert.equal(s.gels[0].min, 5);
});

test("an electrolyte mix is described by its sodium, never “0 g salt” (defect 7)", () => {
    assert.equal(sodiumText({ sodiumSource: "electrolyte-mix", sodiumTarget: 500, saltGrams: null }), "500 mg sodium from Electrolyte Mix (see its label)");
    assert.equal(sodiumText({ sodiumSource: "electrolyte-mix", sodiumTarget: 500, saltGrams: 0 }), "500 mg sodium from Electrolyte Mix (see its label)");
    assert.equal(sodiumText({ sodiumSource: "table-salt", sodiumTarget: 500, saltGrams: 1.27, saltTsp: 0.25 }), "1.27 g salt (¼ tsp)");
    assert.equal(sodiumText({ sodiumSource: "table-salt", sodiumTarget: 393 }), "1 g salt");
});

test("saved plans from before still give the same schedule (test 11)", () => {
    // The shapes buildPlanObject() wrote before this change.
    const old = [
        { duration: 90, session: { workoutType: "long", duration: 90, distance: 18, pace: "8:30" }, items: [{ name: "Gel", carbs: 22, sodium: 60, qty: 2 }], carbsPerHour: 45, fluidPerHour: 22, sodiumPerHour: 450, firstGelMin: 30, includeHomemadeDrink: true, diyInputs: { bottleSize: 20, bottleCount: 2, carbTarget: 60, sodiumTarget: 400, carbSource: "table-sugar", sodiumSource: "table-salt" } },
        { duration: 149, session: { workoutType: "long", duration: 0, distance: 18 }, items: [], carbsPerHour: 45, fluidPerHour: 22, sodiumPerHour: 450 },
        { duration: 185, marathonRef: { miles: 26.2 }, items: [{ name: "Gel", carbs: 25, sodium: 50, qty: 6 }], carbsPerHour: 75, fluidPerHour: 24, sodiumPerHour: 500, firstGelMin: 40 }
    ];
    const expected = [
        { durationMin: 90, distanceMi: 18, gels: [30, 75], firstGelMin: 30 },
        { durationMin: 149, distanceMi: 18, gels: [], firstGelMin: 30 },
        { durationMin: 185, distanceMi: 26.2, gels: [40, 66, 92, 118, 144, 170], firstGelMin: 40 }
    ];
    old.forEach((p, i) => {
        const s = buildSchedule(scheduleInputFromPlan(p));
        assert.equal(s.durationMin, expected[i].durationMin);
        assert.equal(s.distanceMi, expected[i].distanceMi);
        assert.equal(s.firstGelMin, expected[i].firstGelMin);
        assert.deepEqual(s.gels.map(g => g.min), expected[i].gels);
    });
});

test("drink mixes and tablets are sipped over the run, not taken like gels (test 9)", () => {
    const s = buildSchedule({
        durationMin: 120, distanceMi: 15,
        items: [
            { name: "Gel", category: "gels", carbs: 25, sodium: 50, qty: 2 },
            { name: "Isotonic Drink Mix", category: "drinkmix", carbs: 22, sodium: 300, fluid: 16, qty: 2 },
            { name: "Electrolyte Tablet", category: "other", carbs: 0, sodium: 250, fluid: 0, qty: 1 }
        ],
        targets: { carbsPerHour: 45, fluidPerHour: 22, sodiumPerHour: 500 }, firstGelMin: 30
    });
    assert.equal(s.gels.length, 2, "only the gels take a moment");
    assert.equal(s.sips.length, 3);
    assert.deepEqual(s.sips.map(d => [d.startMin, d.endMin]), [[0, 40], [40, 80], [80, 120]]);
    assert.ok(s.events.some(e => e.kind === "sip" && e.text === "Isotonic Drink Mix"));
    // Every gram counted once: hour by hour adds up to the totals.
    const sum = k => s.hours.reduce((n, h) => n + h[k], 0);
    assert.equal(s.totals.carbs, 25 * 2 + 22 * 2);
    assert.ok(Math.abs(sum("carbs") - s.totals.carbs) <= 1);
    assert.ok(Math.abs(sum("sodium") - s.totals.sodium) <= 1);
    assert.ok(Math.abs(sum("fluid") - s.totals.fluid) <= 1);
    assert.equal(isSipped({ category: "gels", carbs: 25 }), false);
    assert.equal(isSipped({ category: "other", carbs: 0, sodium: 250 }), true);
});

test("caffeine in mg: per serving, in total, and unknown ones counted, never guessed (test 8)", () => {
    const s = buildSchedule({
        durationMin: 150, distanceMi: 18,
        items: [
            { name: "Gel", carbs: 25, sodium: 50, qty: 2 },
            { name: "Caf Gel", carbs: 25, sodium: 50, caffeineMg: 100, caffeine: true, qty: 1 },
            { name: "Old Caf Gel", carbs: 25, sodium: 50, caffeine: true, qty: 1 }
        ],
        targets: { carbsPerHour: 45 }
    });
    assert.equal(s.totals.caffeineMg, 100);
    assert.equal(s.totals.caffeineUnknown, 1);
    assert.equal(s.totals.carbs, 100, "caffeine doesn't change carbs");
    assert.deepEqual(s.gels.map(g => g.caffeine), [false, false, true, true], "caffeinated last");
    assert.equal(s.gels.find(g => g.name === "Caf Gel").caffeineMg, 100);
});

test("fluid is stored in oz and shown in oz or ml", () => {
    assert.equal(toFluid(20, "oz"), 20);
    assert.equal(toFluid(20, "ml"), 590);
    assert.equal(toFluid(4, "ml"), 120);
    assert.equal(fromFluid(500, "ml"), 16.91);
    assert.equal(toFluid(fromFluid(500, "ml"), "ml"), 500, "500 ml comes back as 500 ml");
    assert.equal(fluidText(16.9, "oz"), "16.9 oz");
    assert.equal(fluidWords("Bottles hold {fluid:40} of {fluid:68}", "ml"), "Bottles hold 1180 ml of 2010 ml");
    assert.equal(fluidWords("Bottles hold {fluid:40}", "oz"), "Bottles hold 40 oz");
});

test("start time: clock times on every checkpoint and the finish (test 4)", () => {
    assert.equal(parseStartTime("07:00"), 420);
    assert.equal(parseStartTime("7:05 pm"), 1145);
    assert.equal(parseStartTime("12:00 AM"), 0);
    for (const bad of ["", "7", "25:00", "7:60", "13:00 pm", "abc"]) assert.equal(parseStartTime(bad), null, bad);
    assert.equal(timeOfDay(465), "7:45 AM");
    assert.equal(timeOfDay(12 * 60), "12:00 PM");
    assert.equal(timeOfDay(1440 + 30), "12:30 AM", "past midnight wraps");
    const s = buildSchedule({ ...marathon, startMin: 420 });
    assert.equal(s.startTod, "7:00 AM");
    assert.equal(s.finishTod, "10:05 AM");
    const gel1 = s.events.find(e => e.kind === "gel" && e.gel === 1);
    assert.equal(gel1.tod, "7:30 AM");
    // No start time: no clock times anywhere.
    const plain = buildSchedule(marathon);
    assert.equal(plain.startTod, "");
    assert.ok(plain.events.every(e => e.tod === ""));
    // Saved plans carry it through.
    assert.equal(scheduleInputFromPlan({ duration: 60, startTime: "06:30" }).startMin, 390);
    assert.equal(scheduleInputFromPlan({ duration: 60, session: { startTime: "6:30" } }).startMin, 390);
    assert.equal(scheduleInputFromPlan({ duration: 60 }).startMin, null);
});

test("every checkpoint says what's next to take in, how long and how far (test 2 for one pace)", () => {
    const s = buildSchedule({
        durationMin: 153, distanceMi: 18, startMin: 420,
        items: [{ name: "Gel", carbs: 25, sodium: 50, qty: 4 }],
        targets: { carbsPerHour: 45 }, firstGelMin: 30
    });
    const start = s.events[0];
    assert.equal(start.kind, "start");
    assert.deepEqual([start.next.kind, start.next.n, start.next.inMin, start.next.inMi, start.next.tod], ["gel", 1, 30, 3.5, "7:30 AM"]);
    const gels = s.events.filter(e => e.kind === "gel");
    assert.equal(gels[0].next.n, 2);
    assert.equal(gels[0].next.inMin, gels[1].min - gels[0].min);
    assert.ok(Math.abs(gels[0].next.inMi - (gels[1].mile - gels[0].mile)) <= 0.1);
    assert.equal(gels.at(-1).next, null, "nothing after the last gel");
    // 18 mi at 8:30: a gel at 1:16 or 1:17 lands at mile 8.9 / 9.1.
    const two = buildSchedule({ durationMin: 153, distanceMi: 18, items: [{ name: "Gel", carbs: 25, qty: 2 }], firstGelMin: 77, targets: {} });
    assert.equal(two.gels[0].mile, 9.1);
});

test("homemade drink: two carb sources, per bottle and whole batch (test 5)", () => {
    const r = drinkRecipe({ carbTarget: 60, sodiumTarget: 0, bottleCount: 2, bottleSize: 20, carbSource: "maltodextrin", carbSource2: "table-sugar", carbShare2: 0.5 });
    assert.deepEqual(r.carbs.map(c => [c.key, c.carbs, c.grams, c.bottle.grams]), [["maltodextrin", 30, 31.6, 15.8], ["table-sugar", 30, 30, 15]]);
    assert.equal(r.totals.carbs, 60);
    assert.ok(Math.abs(r.carbs[1].tsp - 30 / 4.2) < 0.01);
    assert.equal(r.carbs[0].tsp, null, "maltodextrin has no teaspoon measure");
    // The same source twice is one source.
    assert.equal(drinkRecipe({ carbTarget: 60, carbSource: "honey", carbSource2: "honey" }).carbs.length, 1);
    assert.deepEqual(recipeParts(r), ["15.8 g maltodextrin", "15 g table sugar (3 ⅝ tsp)"]);
    assert.deepEqual(recipeParts(r, { batch: true }), ["31.6 g maltodextrin", "30 g table sugar (7 ⅛ tsp)"]);
});

test("electrolyte powder covers what it can and salt only the rest (test 6)", () => {
    const r = drinkRecipe({ carbTarget: 0, sodiumTarget: 500, bottleCount: 1, electroMg: 300, electroScoops: 1 });
    assert.equal(r.electrolyte.mg, 300);
    assert.equal(r.sodium.mg, 200);
    assert.equal(r.sodium.grams, 0.51);
    assert.equal(r.totals.sodium, 500, "each source counted once");
    // The powder alone past the target: no salt, the extra said.
    const over = drinkRecipe({ sodiumTarget: 500, bottleCount: 2, electroMg: 400, electroScoops: 1 });
    assert.equal(over.sodium, null);
    assert.equal(over.over, 300);
    assert.equal(over.totals.sodium, 800);
    // Sodium from a product with no fixed measure: in mg, never "0 g salt".
    const tabs = drinkRecipe({ sodiumTarget: 500, sodiumSource: "salt-tabs" });
    assert.equal(tabs.sodium.grams, null);
    assert.deepEqual(recipeParts(tabs), ["500 mg sodium from salt tabs (see its label)"]);
    // In the schedule: the bottle's mix, and the powder's extra sodium counted.
    const s = buildSchedule(scheduleInputFromPlan({
        duration: 120, carbsPerHour: 45, sodiumPerHour: 400, includeHomemadeDrink: true,
        diyInputs: { bottleSize: 20, bottleCount: 2, carbTarget: 60, sodiumTarget: 500, carbSource: "maltodextrin", carbSource2: "table-sugar", carbShare2: 0.5, electroMg: 400, electroScoops: 1, sodiumSource: "table-salt" }
    }));
    assert.deepEqual(recipeParts(s.mix.recipe), ["15.8 g maltodextrin", "15 g table sugar (3 ⅝ tsp)", "1 scoop electrolyte powder (400 mg sodium)"]);
    assert.equal(s.totals.sodium, 800);
    assert.equal(s.bottles[0].sodium, 400);
});

test("the menu's old carb names read as the right ingredient", () => {
    assert.equal(carbSourceKey("juice"), "fruit-juice");
    assert.equal(carbSourceKey("sports-powder"), "sports-drink-powder");
    assert.equal(carbSourceKey("nonsense"), "table-sugar");
    assert.equal(diyMix({ carbTarget: 11, carbSource: "juice" }).carbGrams, 100, "juice is 11% carbs, not sugar");
});

// ---- Pace segments: mile markers follow the workout's own paces ----
import { workoutSegments, segmentTimeline, segmentsVary } from "../js/paceSegments.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";

const longWorkout = {
    warmup: { amount: 2, unit: "mi", pace: "9:00" },
    sets: [{ repeat: 6, amount: 1, unit: "mi", pace: "6:50", recovery: { amount: 0.25, unit: "mi", note: "jog" } }],
    cooldown: { amount: 8.75, unit: "mi", pace: "9:00" }
};

test("workoutSegments: warm-up, reps with recoveries between, cool-down, each at its pace", () => {
    const segs = workoutSegments(longWorkout);
    assert.equal(segs.length, 1 + 6 + 5 + 1, "no recovery after the last rep");
    assert.deepEqual(segs.map(s => s.label).slice(0, 4), ["Warm-up", "Rep 1 of 6", "Recovery", "Rep 2 of 6"]);
    assert.equal(segs[1].pace, 6.83);
    assert.ok(segs[2].pace > 9, "a jog runs a little slower than easy");
    assert.equal(Math.round(segs.reduce((t, s) => t + s.miles, 0) * 100) / 100, 18);
    assert.ok(segmentsVary(segs));
    // Timed steps, walks, rests and effort words.
    const runWalk = workoutSegments({ sets: [{ repeat: 2, amount: 1, unit: "min", effort: "easy", recovery: { amount: 1.5, unit: "min", note: "walk" } }] });
    assert.equal(runWalk[1].pace, 17, "a walk at 17:00/mi");
    assert.equal(runWalk[0].minutes, 1);
    const rest = workoutSegments({ sets: [{ repeat: 2, amount: 400, unit: "m", effort: "5K", recovery: { amount: 2, unit: "min", note: "rest" } }] });
    assert.equal(rest[1].miles, 0, "standing rest covers no ground");
    assert.equal(rest[1].minutes, 2);
    assert.deepEqual(workoutSegments(null), []);
    assert.ok(!segmentsVary(workoutSegments({ sets: [{ repeat: 1, amount: 6, unit: "mi", pace: "8:00" }] })), "one pace: nothing to follow");
});

test("buildSchedule: with segments each checkpoint follows the stretch it falls in", () => {
    // Audit test 2: minute 76.5 of 18 mi at 8:30 is mile 9.0 at an even pace.
    const base = { durationMin: 153, distanceMi: 18, items: [{ name: "Gel", carbs: 25, qty: 4 }], targets: { carbsPerHour: 50 } };
    const even = segmentTimeline(null, 153, 18);
    assert.equal(even, null);
    const t = segmentTimeline(workoutSegments(longWorkout), 153, 18);
    assert.equal(t.mileAt(0), 0);
    assert.equal(t.mileAt(153), 18);
    assert.equal(t.partAt(10), "Warm-up");
    assert.equal(t.partAt(30), "Rep 2 of 6");
    assert.equal(t.partAt(120), "Cool-down");
    // The warm-up runs slower than the average, so its miles come later in time...
    assert.ok(t.mileAt(18) < 2, "2 mi at 9:00 takes more than 18 of 153 scaled minutes");
    // ...and the fast reps pull later minutes further down the road.
    assert.ok(t.mileAt(76.5) > 9.4, `mile at 76.5 is ${t.mileAt(76.5)}`);

    const plain = buildSchedule(base);
    const paced = buildSchedule({ ...base, segments: workoutSegments(longWorkout) });
    assert.deepEqual(plain.gels.map(g => g.min), paced.gels.map(g => g.min), "same times; only the miles move");
    assert.notDeepEqual(plain.gels.map(g => g.mile), paced.gels.map(g => g.mile));
    assert.equal(paced.gels[1].part, "Rep 6 of 6");
    assert.equal(plain.gels[1].part, "");
    assert.ok(paced.paced && !paced.paced.mismatch);
    assert.equal(plain.paced, null);
    const gelEvent = paced.events.find(e => e.kind === "gel");
    assert.ok(gelEvent.part, "events say where in the workout they land");
    assert.equal(paced.events.at(-1).mile, 18, "the finish is the run's distance");
});

test("buildSchedule: segments that don't describe the run are left out, and say why", () => {
    const s = buildSchedule({ durationMin: 100, distanceMi: 12, items: [{ name: "Gel", carbs: 25, qty: 2 }], targets: { carbsPerHour: 40 }, segments: workoutSegments(longWorkout) });
    assert.deepEqual(s.paced, { mismatch: true, partsMiles: 18 });
    assert.equal(s.gels[0].mile, Math.round(s.gels[0].min / (100 / 12) * 10) / 10, "even pace");
    // Within 25%: scaled to the run's own distance and time.
    const close = buildSchedule({ durationMin: 140, distanceMi: 16, items: [{ name: "Gel", carbs: 25, qty: 2 }], targets: { carbsPerHour: 40 }, segments: workoutSegments(longWorkout) });
    assert.ok(close.paced && !close.paced.mismatch);
    assert.equal(close.events.at(-1).mile, 16);
});

test("pace segments: a Marathon plan day, bottles and saved plans", () => {
    const PACES = [["Easy", "8:15–9:00 /mi"], ["Threshold", "6:35–6:50 /mi"]];
    const day = planDayFromMarathon({ session: "Mile repeats: 6x1mi @ Threshold w/ 0.25mi jog", miles: 10, pace: "Threshold" }, PACES);
    const segs = workoutSegments(day.workout, { paces: PACES });
    assert.equal(segs[0].label, "Warm-up");
    assert.ok(segs[0].pace > 8.5 && segs[1].pace < 6.9, "easy warm-up, threshold reps from the plan's own table");
    // Bottles: sip guidance per mile follows the miles each bottle really covers.
    const input = {
        durationMin: 153, distanceMi: 18, items: [], targets: { carbsPerHour: 50, fluidPerHour: 20 },
        drink: { bottleCount: 2, bottleSize: 20, carbs: 100, sodium: 600, carbSource: "table-sugar", sodiumSource: "table-salt" }
    };
    const plain = buildSchedule(input), paced = buildSchedule({ ...input, segments: workoutSegments(longWorkout) });
    assert.equal(plain.bottles[0].ozPerMile, plain.bottles[1].ozPerMile);
    assert.notEqual(paced.bottles[0].ozPerMile, paced.bottles[1].ozPerMile);
    // Saved on the session; older plans have none.
    const plan = { duration: 153, session: { distance: 18, segments: workoutSegments(longWorkout) }, items: [{ name: "Gel", carbs: 25, qty: 3 }], carbsPerHour: 50 };
    assert.equal(scheduleInputFromPlan(plan).segments.length, 13);
    assert.ok(buildSchedule(scheduleInputFromPlan(plan)).paced);
    assert.equal(scheduleInputFromPlan({ duration: 60, session: { distance: 7 } }).segments, null);
});
