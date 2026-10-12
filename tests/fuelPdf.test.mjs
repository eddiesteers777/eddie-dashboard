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
    assert.ok(m.checklist.includes("6 × Maurten Gel 100"));
    assert.ok(m.sources.groups.length === SOURCE_GROUPS.length);
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
