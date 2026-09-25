/* ==========================================
   Southbound — Race-Day Fuel Schedule

   Turns a fueling plan (targets, gels, homemade-drink bottles, run
   distance/duration) into an exact schedule: the mile and clock time
   for every gel, which miles each bottle covers and how much to sip,
   and an hour-by-hour check against the targets.

   Pure functions only (no DOM, no imports) so the same math runs in
   the builder, the saved-plan view, and the unit tests
   (tests/fuelSchedule.test.mjs).
========================================== */

// Homemade-drink ingredients. carbsPerGram / sodiumPerGram are per gram
// of ingredient; gPerTsp converts grams to teaspoons for measuring.
export const DIY_CARB_SOURCES = {
    "table-sugar": { label: "Table Sugar", carbsPerGram: 1, gPerTsp: 4.2 },
    "maltodextrin": { label: "Maltodextrin", carbsPerGram: 0.95 },
    "honey": { label: "Honey", carbsPerGram: 0.82 },
    "fruit-juice": { label: "Fruit Juice", carbsPerGram: 0.11 },
    "sports-drink-powder": { label: "Sports Drink Powder", carbsPerGram: 0.90 },
    "other": { label: "Other", carbsPerGram: 1 }
};

// Table salt is ~39.3% sodium by weight. The other sources vary by
// product, so their amounts come from the label.
export const DIY_SODIUM_SOURCES = {
    "table-salt": { label: "Table Salt", sodiumPerGram: 393, gPerTsp: 5.7 },
    "salt-tabs": { label: "Salt Tabs", sodiumPerGram: 0 },
    "electrolyte-mix": { label: "Electrolyte Mix", sodiumPerGram: 0 },
    "other": { label: "Other", sodiumPerGram: 0 }
};

export const DEFAULT_FIRST_GEL_MIN = 30;
// A gel taken in the last ~15 minutes can't be absorbed in time to help.
export const FINAL_GEL_BUFFER_MIN = 15;
const OZ_TO_ML = 29.5735;
const OZ_PER_GULP = 1; // a typical running gulp is ~1 oz (~30 ml)

const round = (value, step = 1) => Math.round(value / step) * step;
const round1 = value => Math.round(value * 10) / 10;

// How much of an ingredient a drink needs. Returns grams (and teaspoons
// where the ingredient has a standard measure), or null grams when the
// amount has to come from the product's own label.
export function diyMix({ carbTarget = 0, sodiumTarget = 0, carbSource = "table-sugar", sodiumSource = "table-salt" }) {
    const carb = DIY_CARB_SOURCES[carbSource] || DIY_CARB_SOURCES["table-sugar"];
    const sodium = DIY_SODIUM_SOURCES[sodiumSource] || DIY_SODIUM_SOURCES["table-salt"];
    const carbGrams = round1(carbTarget / carb.carbsPerGram);
    const sodiumGrams = sodium.sodiumPerGram ? Math.round((sodiumTarget / sodium.sodiumPerGram) * 100) / 100 : null;
    return {
        carbLabel: carb.label,
        sodiumLabel: sodium.label,
        carbGrams,
        carbTsp: carb.gPerTsp ? carbGrams / carb.gPerTsp : null,
        sodiumGrams,
        sodiumTsp: sodium.gPerTsp && sodiumGrams != null ? sodiumGrams / sodium.gPerTsp : null
    };
}

// 2.3 -> "2 ¼", 0.125 -> "⅛". Rounds to the nearest eighth.
export function formatTsp(tsp) {
    if (tsp == null || !isFinite(tsp)) return "";
    const eighths = Math.round(tsp * 8);
    if (eighths === 0) return "a pinch";
    const whole = Math.floor(eighths / 8);
    const frac = { 0: "", 1: "⅛", 2: "¼", 3: "⅜", 4: "½", 5: "⅝", 6: "¾", 7: "⅞" }[eighths % 8];
    return [whole || "", frac].filter(Boolean).join(" ");
}

export function formatClock(minutes) {
    const total = Math.max(0, Math.round(minutes));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Reads what the schedule needs off a saved plan object (the shape
// buildPlanObject() in js/fueling.js writes). Works for plans saved
// before the schedule existed, too.
export function scheduleInputFromPlan(plan) {
    const session = plan.session || {};
    const diy = plan.diyInputs || {};
    const includeDrink = plan.includeHomemadeDrink !== false && (diy.bottleCount || 0) > 0 && (diy.bottleSize || 0) > 0;
    return {
        durationMin: Number(plan.duration) || Number(session.duration) || 0,
        distanceMi: Number(session.distance) || Number(plan.marathonRef?.miles) || 0,
        items: (plan.items || []).map(i => ({ ...i })),
        drink: includeDrink ? {
            bottleCount: Math.max(1, Math.round(Number(diy.bottleCount) || 1)),
            bottleSize: Number(diy.bottleSize) || 0,
            carbs: Number(diy.carbTarget) || 0,
            sodium: Number(diy.sodiumTarget) || 0,
            carbSource: diy.carbSource || "table-sugar",
            sodiumSource: diy.sodiumSource || "table-salt"
        } : null,
        targets: {
            carbsPerHour: Number(plan.carbsPerHour) || 0,
            fluidPerHour: Number(plan.fluidPerHour) || 0,
            sodiumPerHour: Number(plan.sodiumPerHour) || 0
        },
        firstGelMin: plan.firstGelMin ?? DEFAULT_FIRST_GEL_MIN
    };
}

// Gel (and chew/bar) times, spread evenly between the first-gel time and
// FINAL_GEL_BUFFER_MIN before the end. Caffeinated servings go last,
// where the lift matters most.
function gelTimes(count, durationMin, firstGelMin) {
    if (count === 0) return [];
    const start = Math.min(Math.max(firstGelMin, 5), durationMin);
    const end = Math.max(start, durationMin - FINAL_GEL_BUFFER_MIN);
    if (count === 1) return [round((start + end) / 2)];
    const gap = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, i) => round(start + gap * i));
}

export function buildSchedule(input) {
    const durationMin = Math.max(0, Number(input.durationMin) || 0);
    const distanceMi = Math.max(0, Number(input.distanceMi) || 0);
    const minPerMile = durationMin > 0 && distanceMi > 0 ? durationMin / distanceMi : null;
    const mileAt = min => (minPerMile ? round1(min / minPerMile) : null);
    const targets = input.targets || {};
    const firstGelMin = Number(input.firstGelMin) || DEFAULT_FIRST_GEL_MIN;

    // ---- Gels ----
    const servings = [];
    (input.items || []).forEach(item => {
        for (let i = 0; i < (Number(item.qty) || 0); i++) servings.push(item);
    });
    servings.sort((a, b) => Number(!!a.caffeine) - Number(!!b.caffeine));
    const times = gelTimes(servings.length, durationMin, firstGelMin);
    const gels = servings.map((item, i) => ({
        n: i + 1,
        name: item.name,
        carbs: Number(item.carbs) || 0,
        sodium: Number(item.sodium) || 0,
        fluid: Number(item.fluid) || 0,
        caffeine: !!item.caffeine,
        min: times[i],
        mile: mileAt(times[i])
    }));

    // ---- Bottles: evenly across the whole run ----
    const drink = input.drink;
    const bottles = [];
    let mix = null;
    if (drink && durationMin > 0) {
        const count = drink.bottleCount;
        const perBottleMin = durationMin / count;
        const perBottleMi = distanceMi ? distanceMi / count : null;
        const carbsEach = drink.carbs / count;
        const sodiumEach = drink.sodium / count;
        mix = diyMix({
            carbTarget: carbsEach,
            sodiumTarget: sodiumEach,
            carbSource: drink.carbSource,
            sodiumSource: drink.sodiumSource
        });
        for (let i = 0; i < count; i++) {
            const startMin = perBottleMin * i;
            const endMin = perBottleMin * (i + 1);
            bottles.push({
                n: i + 1,
                startMin: round(startMin),
                endMin: round(endMin),
                startMile: mileAt(startMin),
                endMile: mileAt(endMin),
                oz: drink.bottleSize,
                carbs: Math.round(carbsEach),
                sodium: Math.round(sodiumEach),
                ozPerMile: perBottleMi ? round1(drink.bottleSize / perBottleMi) : null,
                ozPer10Min: round1(drink.bottleSize / (perBottleMin / 10)),
                gulpsPerMile: perBottleMi ? Math.max(1, Math.round(drink.bottleSize / perBottleMi / OZ_PER_GULP)) : null
            });
        }
    }

    // ---- Hour by hour ----
    const drinkRate = drink && durationMin > 0
        ? { carbs: drink.carbs / durationMin, sodium: drink.sodium / durationMin, fluid: (drink.bottleSize * drink.bottleCount) / durationMin }
        : { carbs: 0, sodium: 0, fluid: 0 };
    // Hour-long windows; a leftover under 20 minutes joins the last hour
    // instead of showing up as a misleadingly "low" stub.
    const windows = [];
    for (let from = 0; from < durationMin; from += 60) windows.push([from, Math.min(from + 60, durationMin)]);
    if (windows.length > 1 && windows[windows.length - 1][1] - windows[windows.length - 1][0] < 20) {
        const [, lastTo] = windows.pop();
        windows[windows.length - 1][1] = lastTo;
    }
    const hours = [];
    for (const [from, to] of windows) {
        const span = to - from;
        const inWindow = gels.filter(g => g.min >= from && (g.min < to || (to === durationMin && g.min <= to)));
        const carbs = Math.round(inWindow.reduce((s, g) => s + g.carbs, 0) + drinkRate.carbs * span);
        const targetCarbs = Math.round((targets.carbsPerHour || 0) * span / 60);
        hours.push({
            n: hours.length + 1,
            fromMin: from,
            toMin: to,
            fromMile: mileAt(from),
            toMile: mileAt(to),
            carbs,
            sodium: Math.round(inWindow.reduce((s, g) => s + g.sodium, 0) + drinkRate.sodium * span),
            fluid: Math.round(inWindow.reduce((s, g) => s + g.fluid, 0) + drinkRate.fluid * span),
            targetCarbs,
            targetSodium: Math.round((targets.sodiumPerHour || 0) * span / 60),
            targetFluid: Math.round((targets.fluidPerHour || 0) * span / 60),
            gels: inWindow.length,
            status: !targetCarbs ? "none"
                : carbs < targetCarbs * 0.85 ? "low"
                : carbs > targetCarbs * 1.15 ? "high"
                : "ok"
        });
    }

    // ---- One chronological checklist ----
    const events = [];
    if (bottles.length) events.push({ min: 0, mile: distanceMi ? 0 : null, kind: "bottle", bottle: 1, text: `Start Bottle 1` });
    else events.push({ min: 0, mile: distanceMi ? 0 : null, kind: "start", text: "Start" });
    bottles.slice(1).forEach(b => events.push({ min: b.startMin, mile: b.startMile, kind: "bottle", bottle: b.n, text: `Finish Bottle ${b.n - 1} · start Bottle ${b.n}` }));
    gels.forEach(g => events.push({ min: g.min, mile: g.mile, kind: "gel", gel: g.n, text: g.name, caffeine: g.caffeine, carbs: g.carbs, sodium: g.sodium }));
    events.push({ min: durationMin, mile: distanceMi || null, kind: "finish", text: bottles.length ? `Finish · Bottle ${bottles.length} empty` : "Finish" });
    events.sort((a, b) => a.min - b.min || (a.kind === "bottle" ? -1 : 1));

    const fluidFromDrink = drink ? drink.bottleSize * drink.bottleCount : 0;
    const totals = {
        carbs: Math.round(gels.reduce((s, g) => s + g.carbs, 0) + (drink?.carbs || 0)),
        sodium: Math.round(gels.reduce((s, g) => s + g.sodium, 0) + (drink?.sodium || 0)),
        fluid: Math.round(gels.reduce((s, g) => s + g.fluid, 0) + fluidFromDrink)
    };
    const hoursTotal = durationMin / 60;
    const concentration = drink && drink.bottleSize
        ? round1((drink.carbs / drink.bottleCount) / (drink.bottleSize * OZ_TO_ML) * 100)
        : null;
    const targetFluid = Math.round((targets.fluidPerHour || 0) * hoursTotal);

    // Plain-language flags for anything worth a second look.
    const warnings = [];
    const gelGap = gels.length > 1 ? gels[1].min - gels[0].min : null;
    if (gelGap !== null && gelGap < 15) {
        warnings.push(`Gels are only ${gelGap} min apart. That's a lot to absorb -- consider fewer gels and a stronger drink, or an earlier first gel.`);
    }
    if (concentration !== null && concentration > 10) {
        warnings.push(`Your drink is a ${concentration}% carb mix -- stronger than the 6-8% most stomachs handle easily. Practice it in training first, or spread it over more water.`);
    }
    if (drink && targetFluid && fluidFromDrink < targetFluid * 0.8) {
        warnings.push(`Your bottles hold ${fluidFromDrink} oz of the ${targetFluid} oz fluid target. Plan on about ${targetFluid - fluidFromDrink} oz of water from aid stations.`);
    }
    if (!minPerMile && durationMin) {
        warnings.push("Add the run's distance to see mile markers, not just times.");
    }

    return {
        durationMin,
        distanceMi,
        minPerMile,
        firstGelMin,
        gels,
        bottles,
        mix,
        concentration,
        warnings,
        hours,
        events,
        totals,
        targetTotals: {
            carbs: Math.round((targets.carbsPerHour || 0) * hoursTotal),
            sodium: Math.round((targets.sodiumPerHour || 0) * hoursTotal),
            fluid: targetFluid
        }
    };
}
