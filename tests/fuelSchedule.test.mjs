// Unit tests for the race-day fuel schedule math (js/fuelSchedule.js).
// Run with: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildSchedule, scheduleInputFromPlan, diyMix, formatTsp, formatClock, FINAL_GEL_BUFFER_MIN
} from "../js/fuelSchedule.js";
import {
    parsePaceMinutes, formatPaceMinutes, durationFromDistanceAndPace
} from "../js/fuelTargets.js";

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

test("mixed carb recipe splits carb target into maltodextrin and table sugar", () => {
    const mix = diyMix({
        carbTarget: 97,
        sodiumTarget: 2058,
        carbSource: "blend",
        maltodextrinPercent: 50,
        sodiumSource: "table-salt",
        existingSodium: 1620
    });
    assert.equal(mix.maltodextrinCarbs, 48.5);
    assert.equal(mix.tableSugarCarbs, 48.5);
    assert.equal(mix.maltodextrinGrams, Math.round((48.5 / 0.95) * 10) / 10);
    assert.equal(mix.tableSugarGrams, 48.5);
    assert.equal(mix.sodiumShortfall, 438);
    assert.equal(mix.sodiumGrams, Math.round((438 / 393) * 100) / 100);
});

test("schedule can pass blend percentages and existing electrolyte sodium into per-bottle recipe", () => {
    const s = buildSchedule({
        durationMin: 160,
        distanceMi: 20,
        items: [{ name: "Hammer Gel", carbs: 21, sodium: 25, qty: 3 }],
        drink: {
            bottleCount: 3,
            bottleSize: 15,
            carbs: 97,
            sodium: 2058,
            carbSource: "blend",
            maltodextrinPercent: 50,
            sodiumSource: "table-salt",
            existingSodium: 1620
        },
        targets: { carbsPerHour: 60, fluidPerHour: 25, sodiumPerHour: 800 }
    });
    assert.equal(s.bottles.length, 3);
    assert.equal(s.mix.sodiumShortfall, Math.max(0, Math.round(2058 / 3) - Math.round(1620 / 3)));
    assert.ok(s.warnings.some(w => w.includes("aid stations")), "flags when bottle fluid does not cover the whole fluid target");
});

test("DIY mix subtracts sodium already supplied by the electrolyte product", () => {
    const mix = diyMix({
        carbTarget: 97,
        sodiumTarget: 2058,
        carbSource: "blend",
        maltodextrinPercent: 50,
        sodiumSource: "table-salt",
        existingSodium: 1620
    });
    assert.equal(mix.sodiumShortfall, 438);
    assert.equal(mix.sodiumGrams, Math.round((438 / 393) * 100) / 100);
});

test("distance plus explicit pace determines run duration for mile checkpoint calculations", () => {
    const distanceMi = 20;
    const paceMinPerMile = 8;
    const durationMin = Math.round(distanceMi * paceMinPerMile);
    const s = buildSchedule({
        durationMin,
        distanceMi,
        items: [{ name: "Hammer Gel", carbs: 21, sodium: 25, qty: 3 }],
        drink: { bottleCount: 3, bottleSize: 15, carbs: 97, sodium: 2058, carbSource: "blend", maltodextrinPercent: 50, sodiumSource: "table-salt", existingSodium: 1620 },
        targets: { carbsPerHour: 60, fluidPerHour: 25, sodiumPerHour: 800 }
    });
    assert.equal(s.durationMin, 160);
    assert.equal(s.bottles.at(-1).endMile, 20);
    assert.equal(s.gels.length, 3);
    assert.ok(s.gels.every(g => g.mile !== null));
    assert.equal(s.mix.sodiumShortfall, 146, "per bottle: 686 mg target minus 540 mg electrolyte sodium");
});


test("distance plus average pace calculates duration without a separate pace calculator", () => {
    assert.equal(parsePaceMinutes("8:15"), 8.25);
    assert.equal(parsePaceMinutes("8"), 8);
    assert.equal(parsePaceMinutes("8.25"), 8.25);
    assert.equal(parsePaceMinutes("8:75"), null);
    assert.equal(formatPaceMinutes(8.25), "8:15");
    assert.equal(durationFromDistanceAndPace(20, "8:00"), 160);
    assert.equal(durationFromDistanceAndPace(20, "8:15"), 165);
    assert.equal(durationFromDistanceAndPace(13.1, "8:15"), 108);
    assert.equal(durationFromDistanceAndPace(0, "8:15"), null);
});

test("DIY blend reports actual maltodextrin and sugar grams and subtracts electrolyte sodium", () => {
    const mix = diyMix({
        carbTarget: 97,
        sodiumTarget: 2058,
        carbSource: "blend",
        maltodextrinPercent: 50,
        sodiumSource: "table-salt",
        existingSodium: 1620
    });
    assert.equal(mix.maltodextrinGrams, 51.1);
    assert.equal(mix.tableSugarGrams, 48.5);
    assert.equal(mix.sodiumShortfall, 438);
    assert.equal(mix.sodiumGrams, 1.11);
    assert.equal(mix.isBlend, true);
});

test("legacy DIY source names still resolve to their intended recipe ingredients", () => {
    assert.equal(diyMix({ carbTarget: 20, carbSource: "juice" }).carbLabel, "Fruit Juice");
    assert.equal(diyMix({ carbTarget: 20, carbSource: "sports-powder" }).carbLabel, "Sports Drink Powder");
});

test("pace parser accepts mm:ss and decimal-minute formats", async () => {
    const { parsePaceMinutes, durationFromDistanceAndPace, formatPaceMinutes } = await import("../js/fuelTargets.js");
    assert.equal(parsePaceMinutes("8:15"), 8.25);
    assert.equal(parsePaceMinutes("8.25"), 8.25);
    assert.equal(durationFromDistanceAndPace(20, "8:00"), 160);
    assert.equal(formatPaceMinutes(8.25), "8:15");
    assert.equal(parsePaceMinutes("abc"), null);
});


test("DIY drink schedule splits caffeine by selected bottle and counts total sodium once", () => {
    const s = buildSchedule({
        durationMin: 160,
        distanceMi: 20,
        items: [{ name: "Hammer Gel", carbs: 21, sodium: 25, qty: 3 }],
        drink: {
            bottleCount: 3,
            bottleSize: 15,
            carbs: 97,
            sodium: 2058,
            carbSource: "blend",
            maltodextrinPercent: 50,
            sodiumSource: "table-salt",
            existingSodium: 1620,
            caffeinePerBottleMg: 60,
            caffeineBottleNumbers: "2,3"
        },
        targets: { carbsPerHour: 60, fluidPerHour: 25, sodiumPerHour: 800 },
        firstGelMin: 30
    });
    assert.equal(s.totals.carbs, 160);
    assert.equal(s.totals.sodium, 2133);
    assert.equal(s.totals.caffeineMg, 120);
    assert.deepEqual(s.bottles.map(b => b.caffeineMg), [0, 60, 60]);
    assert.equal(s.bottles[1].startMile, 6.7);
    assert.equal(s.bottles[2].endMile, 20);
    assert.equal(s.mix.existingSodium, 540);
    assert.equal(s.mix.sodiumGrams, 0.37);
});
