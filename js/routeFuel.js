/* ==========================================
   Southbound — fuel plan for a route (pure)

   Duration is the route's miles x the runner's own pace (never
   Valhalla's walking time). Carbs, gels and water are RANGES.
   Bands (Eddie, 2026-10-31):
     under 60 min   water only
     60-150 min     30-60 g carbs an hour
     over 150 min   60-90 g an hour, and a coach check
     water          0.4-0.8 L an hour
   The Fueling page's own number for the same run (js/fuelTargets.js)
   is passed in and shown next to the range; this module does not
   replace that formula. A plan here is "to review", never approved.
========================================== */

export const DEFAULT_PACE = 9;
export const DEFAULT_GEL_G = 25;
export const WATER_L_PER_HOUR = [0.4, 0.8];

export function bandFor(durationMin) {
    if (durationMin < 60) return { id: "water", lo: 0, hi: 0, words: "Under an hour: water only" };
    if (durationMin <= 150) return { id: "mid", lo: 30, hi: 60, words: "60 to 150 minutes: 30 to 60 g of carbs an hour" };
    return { id: "high", lo: 60, hi: 90, words: "Over 150 minutes: 60 to 90 g of carbs an hour" };
}

/**
 * miles, pace (min/mi), gel size (g), and optionally what the Fueling page
 * gives for this run: { carbsPerHour, fluidLPerHour }.
 */
export function fuelPlan({ miles, pace = DEFAULT_PACE, gelG = DEFAULT_GEL_G, calculator = null }) {
    const m = Number(miles), p = Number(pace), g = Number(gelG);
    if (!(m > 0) || !(p >= 4 && p <= 20) || !(g >= 10 && g <= 50)) return null;
    const durationMin = m * p;
    const hours = durationMin / 60;
    const band = bandFor(durationMin);
    const totalLo = Math.round(band.lo * hours), totalHi = Math.round(band.hi * hours);
    const gelsLo = totalLo ? Math.ceil(totalLo / g) : 0;
    const gelsHi = totalHi ? Math.ceil(totalHi / g) : 0;
    const waterLo = Math.round(WATER_L_PER_HOUR[0] * hours * 10) / 10;
    const waterHi = Math.round(WATER_L_PER_HOUR[1] * hours * 10) / 10;

    // Gel k is due between minute 30k and 45k (first at 30-45, then every 30-45),
    // shown only while there is still 15 minutes of run left to use it.
    const windows = [];
    if (band.id !== "water") {
        for (let k = 1; 30 * k <= durationMin - 15 && k <= Math.max(gelsHi, 1); k++) {
            const from = 30 * k, to = Math.min(45 * k, Math.floor(durationMin - 15));
            windows.push({ n: k, fromMin: from, toMin: to, fromMile: from / p, toMile: to / p });
        }
    }

    let calcCarbs = null, calcWithin = null, calcFluidL = null;
    if (calculator && Number.isFinite(calculator.carbsPerHour)) {
        calcCarbs = Math.round(calculator.carbsPerHour);
        calcWithin = calcCarbs >= band.lo && calcCarbs <= band.hi;
    }
    if (calculator && Number.isFinite(calculator.fluidLPerHour)) calcFluidL = Math.round(calculator.fluidLPerHour * 10) / 10;

    return {
        miles: m, pace: p, gelG: g, durationMin: Math.round(durationMin), band,
        totalLo, totalHi, gelsLo, gelsHi, waterLo, waterHi, windows,
        calcCarbs, calcWithin, calcFluidL,
        coachCheck: band.id === "high",
        status: "review"
    };
}

const clock = min => {
    const h = Math.floor(min / 60), r = Math.round(min % 60);
    return h ? `${h} h ${String(r).padStart(2, "0")}` : `${r} min`;
};
const mi = n => (Math.round(n * 10) / 10).toFixed(1);

/** Plain lines for the Fuel card. */
export function fuelLines(plan) {
    if (!plan) return [];
    const out = [`${mi(plan.miles)} mi at ${plan.pace} min/mi is about ${clock(plan.durationMin)}.`];
    if (plan.band.id === "water") {
        out.push("Carbs: none needed. Water only.");
    } else {
        out.push(`Carbs: ${plan.band.lo}–${plan.band.hi} g an hour, about ${plan.totalLo}–${plan.totalHi} g in all.`);
        out.push(`Gels: about ${plan.gelsLo}–${plan.gelsHi} of ${plan.gelG} g.`);
        for (const w of plan.windows) {
            out.push(`Gel ${w.n}: ${clock(w.fromMin)} to ${clock(w.toMin)} in (mile ${mi(w.fromMile)}–${mi(w.toMile)}).`);
        }
    }
    out.push(`Water: ${plan.waterLo}–${plan.waterHi} L in all (0.4–0.8 L an hour; more in heat).`);
    if (plan.calcCarbs === 0 && plan.band.id === "water") {
        out.push("Your Fueling page agrees: no carbs needed for this run.");
    } else if (plan.calcCarbs != null) {
        out.push(plan.calcWithin
            ? `Your Fueling page gives ${plan.calcCarbs} g an hour for this run.`
            : `Your Fueling page gives ${plan.calcCarbs} g an hour for this run, outside this range. Check it on the Fueling page.`);
    }
    if (plan.coachCheck) out.push("Over 150 minutes: have your coach check this before you use it.");
    out.push("A plan to review, not a coach-approved prescription. Try it in training first, never new on race day.");
    return out;
}
