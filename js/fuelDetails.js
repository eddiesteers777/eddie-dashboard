/* ==========================================================
   fuelDetails.js -- the "Your details" line on the Fueling page.

   Once the athlete profile holds the basics, the Athlete, Sodium
   and Preferences cards don't need to greet them with the same
   fields every time. They fold under one line that says what the
   plan is using, with an "Edit my details" button. Temperature,
   humidity and the run itself stay in view: those change every run.

   Pure: the page reads its inputs and hands the words in, so the
   rules are unit-tested (tests/fuelDetails.test.mjs).
   ========================================================== */

import { profileValue } from "./fuelProfile.js";

// Without these three the profile hasn't been filled in yet, so the cards stay open.
export const ESSENTIAL_KEYS = ["bodyWeight", "tolerance", "stomachSensitivity"];

/** Has this athlete told us the basics (not the page's starting assumptions)? */
export function profileKnowsEssentials(profile) {
    return ESSENTIAL_KEYS.every(key => {
        const v = profileValue(profile, key);
        return v != null && v !== "";
    });
}

const TOLERANCE = { low: "low fueling tolerance", moderate: "moderate fueling tolerance", high: "high fueling tolerance" };
const STOMACH = { sensitive: "sensitive stomach", normal: "normal stomach", iron: "iron stomach" };
const SWEAT = { low: "light sweater", moderate: "average sweater", high: "heavy sweater" };
const SALT = { light: "light salty sweat", average: "average salty sweat", heavy: "heavy salty sweat" };

const has = v => v !== "" && v != null && !(typeof v === "number" && Number.isNaN(v));

/**
 * The line under "Your details". `f` is what the page currently uses:
 *   weight (text, e.g. "165"), weightUnit, currentCarbIntake, tolerance,
 *   stomach, sweatRate, sweatRateMeasured (text), fluidUnit, sweatSodium,
 *   sweatSodiumMeasured, typicalSodiumIntake, preferences [], caffeine.
 * Only what is filled in is mentioned; nothing is guessed.
 */
export function detailsSummary(f = {}) {
    const parts = [];
    if (has(f.weight)) parts.push(`${f.weight} ${f.weightUnit || "lb"}`);
    if (TOLERANCE[f.tolerance]) parts.push(TOLERANCE[f.tolerance]);
    if (STOMACH[f.stomach]) parts.push(STOMACH[f.stomach]);
    if (has(f.currentCarbIntake) && Number(f.currentCarbIntake) > 0) parts.push(`${f.currentCarbIntake} g/hr carbs now`);
    if (has(f.sweatRateMeasured)) parts.push(`sweats ${f.sweatRateMeasured} ${f.fluidUnit || "oz"}/hr (measured)`);
    else if (SWEAT[f.sweatRate]) parts.push(SWEAT[f.sweatRate]);
    if (has(f.sweatSodiumMeasured)) parts.push(`sweat sodium ${f.sweatSodiumMeasured} mg/L (measured)`);
    else if (SALT[f.sweatSodium]) parts.push(SALT[f.sweatSodium]);
    if (has(f.typicalSodiumIntake) && Number(f.typicalSodiumIntake) > 0) parts.push(`${f.typicalSodiumIntake} mg/hr sodium now`);
    const likes = (f.preferences || []).filter(Boolean);
    if (likes.length) parts.push(`likes ${likes.join(", ")}`);
    if (f.caffeine) parts.push("caffeine on");
    return parts.join(" · ");
}

/** The button and the line beside it, for either state. */
export function detailsBarText(folded, summary) {
    return folded
        ? { lead: summary || "Filled in from your profile.", button: "Edit my details", expanded: false }
        : { lead: "Your details are below, filled in from your profile.", button: "Hide my details", expanded: true };
}

/**
 * Should the cards start folded? Only for an athlete whose profile has the
 * basics, who hasn't chosen to keep them open, and with nothing to fix.
 * `choice` = "open" | "folded" | null (what they picked last on this device).
 */
export function startsFolded({ known, choice = null, hasProblem = false } = {}) {
    if (!known || hasProblem) return false;
    return choice !== "open";
}
