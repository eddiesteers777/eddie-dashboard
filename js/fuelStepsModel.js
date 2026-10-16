/* ==========================================
   Southbound — the Fueling calculator one step at a time (a phone, 2026-10-15)

   Four steps: Your run, About you, What you carry, then Your plan (the review,
   the whole page laid out with an Edit button on every part). The page is one
   page on a computer; js/fuelSteps.js turns steps on below 1100px. Pure: no
   DOM, no storage, so it is unit tested (tests/fuelStepsModel.test.mjs).
========================================== */

export const LAST_STEP = 4;

export const STEPS = Object.freeze([
    { n: 1, title: "Your run", help: "Any two of distance, time and pace. The third follows.", next: "Next" },
    { n: 2, title: "About you", help: "Skip what you do not know. I estimate it and tell you.", next: "Next" },
    { n: 3, title: "What you carry", help: "Pick what you like. Gels are the default.", next: "See my plan" },
    { n: 4, title: "Your plan", help: "All of it in one place. Change any part with Edit.", next: "" }
]);

export const clampStep = n => Math.min(LAST_STEP, Math.max(1, Math.round(Number(n)) || 1));
export const stepInfo = n => STEPS[clampStep(n) - 1];
export const nextStep = n => clampStep(clampStep(n) + 1);
export const prevStep = n => clampStep(clampStep(n) - 1);

/**
 * Where to open: on the review when a plan is already showing and the person has not
 * touched anything yet (a resumed draft, a "Fuel this run" link); otherwise at the start.
 */
export function startingStep({ planShown = false, touched = false } = {}) {
    return planShown && !touched ? LAST_STEP : 1;
}

const has = v => v !== "" && v != null && !Number.isNaN(Number(v)) && Number(v) > 0;

/** The glass bar's words: the numbers as they stand, or what is missing. */
export function barText({ carbs, fluid, unit = "oz" } = {}) {
    if (!has(carbs)) return "Add a distance or time";
    return `${Math.round(Number(carbs))} g/hr${has(fluid) ? ` · ${Math.round(Number(fluid))} ${unit === "ml" ? "ml" : "oz"}/hr` : ""}`;
}

/** "Long run · 14 mi · 125 min · 8:56/mi": only what is filled in. */
export function runSummary({ type = "", distance = "", duration = "", pace = "" } = {}) {
    const parts = [];
    if (String(type).trim()) parts.push(String(type).trim());
    if (has(distance)) parts.push(`${Number(distance)} mi`);
    if (has(duration)) parts.push(`${Math.round(Number(duration))} min`);
    const p = String(pace).trim();
    if (p) parts.push(/[a-z/]/i.test(p) ? p : `${p}/mi`);
    return parts.join(" · ") || "Nothing yet";
}

/**
 * The review's rows: { key, step, title, summary }. `tune` is what js/fuelDetails.js tuneSummaries returns;
 * each row's `step` is where its Edit button goes.
 */
export function answerRows({ run = {}, tune = {} } = {}) {
    return [
        { key: "run", step: 1, title: "Your run", summary: runSummary(run) },
        { key: "you", step: 2, title: "You", summary: tune.you || "Not filled in yet, so it is estimated" },
        { key: "weather", step: 2, title: "The weather", summary: tune.conditions || "Not filled in yet, so it is estimated" },
        { key: "carry", step: 3, title: "What you carry", summary: tune.carry || "no preference · no caffeine" }
    ];
}
