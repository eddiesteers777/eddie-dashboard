/* ==========================================
   Southbound — fluid in ounces or millilitres

   Fluid is always stored in US fluid ounces (plans, bottles, library
   items, targets), so older data and every reader stay right; ml is only
   how it's shown and typed. The choice is `fueling-units` { fluid: "oz" |
   "ml" } (cloud-synced with the other fueling- keys).
========================================== */

export const UNITS_KEY = "fueling-units";
export const ML_PER_OZ = 29.5735;

export function fluidUnit() {
    try { return JSON.parse(localStorage.getItem(UNITS_KEY) || "{}")?.fluid === "ml" ? "ml" : "oz"; } catch { return "oz"; }
}

export function setFluidUnit(unit) {
    try { localStorage.setItem(UNITS_KEY, JSON.stringify({ fluid: unit === "ml" ? "ml" : "oz" })); } catch { /* storage full */ }
}

/** oz -> the number shown: oz to 0.1, ml to 5 (to 10 past 200). */
export function toFluid(oz, unit = "oz") {
    const v = Number(oz) || 0;
    if (unit !== "ml") return Math.round(v * 10) / 10;
    const ml = v * ML_PER_OZ;
    const step = ml >= 200 ? 10 : 5;
    return Math.round(ml / step) * step;
}

/** A typed number in the unit -> oz (kept to 0.01 so 500 ml comes back as 500). */
export function fromFluid(value, unit = "oz") {
    const v = Number(value);
    if (!isFinite(v)) return 0;
    return unit === "ml" ? Math.round(v / ML_PER_OZ * 100) / 100 : v;
}

/** 20 -> "20 oz" / "590 ml". */
export function fluidText(oz, unit = "oz") {
    return `${toFluid(oz, unit)} ${unit === "ml" ? "ml" : "oz"}`;
}

/** Words with {fluid:20} markers (js/fuelSchedule.js warnings) in the unit. */
export function fluidWords(text, unit = "oz") {
    return String(text ?? "").replace(/\{fluid:(-?[\d.]+)\}/g, (_, n) => fluidText(Number(n), unit));
}
