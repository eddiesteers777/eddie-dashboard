import test from "node:test";
import assert from "node:assert/strict";
import { pdfModel, pdfSafe, pdfFileName } from "../js/fuelPdfModel.js";
import { POPULAR_SOURCES, sourcesByGroup, sourceLine, toLibraryItem, SOURCE_GROUPS } from "../js/fuelSources.js";
import { buildSchedule, scheduleInputFromPlan } from "../js/fuelSchedule.js";

const plan = {
    name: "Indianapolis Marathon", workout: "Race · 26.2 mi", duration: 185, mode: "race",
    carbsPerHour: 80, fluidPerHour: 24, sodiumPerHour: 600,
    items: [
        { id: 1, name: "Maurten Gel 100", category: "gels", carbs: 25, sodium: 20, qty: 6 },
        { id: 2, name: "Maurten Gel 100 CAF 100", category: "gels", carbs: 25, sodium: 20, caffeine: true, caffeineMg: 100, qty: 2 }
    ],
    includeHomemadeDrink: true,
    diyInputs: { bottleCount: 2, bottleSize: 20, carbTarget: 60, sodiumTarget: 500, carbSource: "maltodextrin", sodiumSource: "table-salt" },
    preWorkoutFood: "Bagel + honey 3 hours before", firstGelMin: 30, startTime: "07:00",
    session: { workoutType: "race", distance: 26.2, duration: 185, bodyWeight: 158, tolerance: "high", temperature: 55, humidity: 60 }
};

test("pdfSafe swaps what the PDF's fonts can't draw", () => {
    assert.equal(pdfSafe("3 ⅝ tsp → mile 7 ≈ 5"), "3 5/8 tsp -> mile 7 ~ 5");
    assert.equal(pdfSafe("(⅛ tsp) 3⅝"), "(1/8 tsp) 3 5/8");
    assert.equal(pdfSafe("Café · 20–30 mg"), "Café · 20–30 mg");
    assert.equal(pdfSafe("🏃 Run"), "Run");
    assert.equal(pdfSafe(null), "");
});

test("the file is named from the plan", () => {
    assert.equal(pdfFileName({ name: "Chicago Long Run!" }), "southbound-fuel-chicago-long-run.pdf");
    assert.equal(pdfFileName({}), "southbound-fuel-fueling-plan.pdf");
});

test("the model has the plan's header, targets, carry list, drink and schedule", () => {
    const m = pdfModel(plan, buildSchedule(scheduleInputFromPlan(plan)), { unit: "oz", today: new Date(2026, 9, 12) });
    assert.equal(m.header.title, "Indianapolis Marathon");
    assert.match(m.header.subtitle, /Race plan/);
    assert.equal(m.header.date, "October 12, 2026");
    assert.ok(m.header.stats.find(s => s.label === "Start" && s.value === "7:00 AM"));
    assert.deepEqual(m.targets.map(t => t.perHour), ["80 g/hr", "24 oz/hr", "600 mg/hr"]);
    assert.equal(m.caffeine, "200 mg");
    assert.deepEqual(m.carry.map(c => c.qty), [6, 2]);
    assert.equal(m.drink.bottles, 2);
    const gels = m.schedule.filter(r => r.kind === "gel");
    assert.equal(gels.length, 8);
    assert.ok(gels.at(-1).caffeine, "caffeinated gels last");
    assert.equal(gels[0].clock, "7:30 AM");
    assert.ok(m.hours.length >= 3);
    assert.ok(m.checklist[0].items.includes("6 × Maurten Gel 100"));
    assert.deepEqual(m.checklist.map(g => g.title), ["The night before", "Race morning", "On the start line"]);
    assert.ok(m.sources.groups.length === SOURCE_GROUPS.length);
    assert.deepEqual(m.sources.groups.map(g => g.id), SOURCE_GROUPS.map(g => g.id));
});

test("the coach's read of the plan comes from its own numbers", () => {
    const m = pdfModel(plan, buildSchedule(scheduleInputFromPlan(plan)), { unit: "oz" });
    assert.match(m.brief[0], /^Aim for 80 g of carbs an hour\. 8 gels and 2 bottles of your drink give you \d+ g over 3:05/);
    assert.match(m.brief[1], /First gel at 0:30 \(mile [\d.]+\), then about every \d+ min\. The two caffeinated gels come last/);
    assert.ok(m.brief.some(l => /Your bottles carry 40 oz of about \d+ oz\. Find the other \d+ oz at aid stations\./.test(l)));
    assert.ok(m.brief.some(l => /^Sodium is light/.test(l)), "sodium far under target is said");
    // A race gets what to do when it goes sideways; no practice log.
    assert.equal(m.isRace, true);
    assert.equal(m.practice, null);
    assert.equal(m.sideways.length, 4);
});

test("the course map and pocket card list every gel and bottle", () => {
    const s = buildSchedule(scheduleInputFromPlan(plan));
    const m = pdfModel(plan, s, { unit: "oz" });
    assert.equal(m.map.gels.length, 8);
    assert.equal(m.map.gels.filter(g => g.caffeine).length, 2);
    assert.equal(m.map.bottles.length, 2);
    assert.equal(m.map.distanceMi, 26.2);
    assert.equal(m.pocket.length, s.events.length);
    assert.equal(m.pocket[0].what, "BOTTLE 1");
    assert.equal(m.pocket.at(-1).what, "FINISH");
    assert.ok(m.pocket.some(r => r.what === "GEL 8 · CAF"));
    assert.equal(m.pocket[0].clock, "7:00 AM");
});

test("a training run gets a practice log and training words", () => {
    const training = { ...plan, mode: "training", name: "Long run", items: [plan.items[0]], diyInputs: { ...plan.diyInputs, bottleCount: 1 } };
    const m = pdfModel(training, buildSchedule(scheduleInputFromPlan(training)), { unit: "oz" });
    assert.equal(m.isRace, false);
    assert.deepEqual(m.sideways, []);
    assert.deepEqual(m.practice.map(p => p.label), ["Gels taken", "Bottles finished", "Stomach", "Energy late in the run", "What to change next time"]);
    assert.equal(m.practice[0].of, 6);
    assert.deepEqual(m.checklist.map(g => g.title), ["The night before", "Before you go", "Out the door"]);
    assert.ok(m.warnings.every(w => !/aid stations/.test(w)), "no aid stations on a training run");
});

test("no bottles: the plan says where to drink instead", () => {
    const gelsOnly = { ...plan, includeHomemadeDrink: false, diyInputs: null };
    const m = pdfModel(gelsOnly, buildSchedule(scheduleInputFromPlan(gelsOnly)), { unit: "oz" });
    assert.ok(m.brief.some(l => /^No bottles in this plan: drink about 24 oz an hour at aid stations/.test(l)));
    assert.equal(m.header.stats.find(st => st.label === "Fluid").value, "None carried");
    const one = { ...gelsOnly, items: [{ ...plan.items[0], qty: 1 }] };
    assert.match(pdfModel(one, buildSchedule(scheduleInputFromPlan(one))).brief[0], /1 gel gives you/);
});

test("ml plans speak ml; no sources when asked", () => {
    const m = pdfModel(plan, buildSchedule(scheduleInputFromPlan(plan)), { unit: "ml", sources: false });
    assert.match(m.targets[1].perHour, /ml\/hr/);
    assert.equal(m.sources, null);
});

test("popular sources: every item in a group, sensible numbers, unique ids", () => {
    const ids = new Set(POPULAR_SOURCES.map(s => s.id));
    assert.equal(ids.size, POPULAR_SOURCES.length);
    for (const s of POPULAR_SOURCES) {
        assert.ok(SOURCE_GROUPS.some(g => g.id === s.group), s.id);
        assert.ok(s.carbs >= 0 && s.carbs <= 100, s.id);
        assert.ok(s.sodium == null || (s.sodium >= 0 && s.sodium <= 1500), s.id);
        assert.ok(["gels", "drinkmix", "chews", "bars", "other"].includes(s.category), s.id);
    }
    assert.equal(sourcesByGroup().reduce((n, g) => n + g.items.length, 0), POPULAR_SOURCES.length);
    const caf = POPULAR_SOURCES.find(s => s.id === "maurten-gel-100-caf");
    assert.equal(sourceLine(caf), "25 g carbs · 20 mg sodium · 100 mg caffeine");
    assert.equal(sourceLine(POPULAR_SOURCES.find(s => s.id === "pf-30-gel")), "30 g carbs · little sodium");
});

test("a source becomes a library item the calculator understands", () => {
    const item = toLibraryItem(POPULAR_SOURCES.find(s => s.id === "tailwind"), 42);
    assert.deepEqual(item, { id: 42, name: "Tailwind Endurance Fuel", category: "drinkmix", carbs: 25, sodium: 303, fluid: 20, caffeine: false, caffeineMg: 0, serving: "1 scoop in 16–24 oz", price: "", sourceId: "tailwind" });
    assert.equal(toLibraryItem(POPULAR_SOURCES.find(s => s.id === "pf-30-gel"), 1).sodium, 0);
});

test("the PDF's own fonts ship with the site and are kept offline", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const src = readFileSync(new URL("../js/fuelPdf.js", import.meta.url), "utf8");
    const files = [...src.matchAll(/"([\w-]+\.ttf)"/g)].map(m => m[1]);
    assert.deepEqual(files.sort(), ["BebasNeue.ttf", "Inter-Bold.ttf", "Inter-Regular.ttf", "JetBrainsMono-Medium.ttf", "Saira-ExtraBold.ttf"]);
    const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
    for (const f of files) {
        assert.ok(existsSync(new URL(`../fonts/pdf/${f}`, import.meta.url)), f);
        assert.ok(sw.includes(`fonts/pdf/${f}`), `${f} precached`);
    }
});
