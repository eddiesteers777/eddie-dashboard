/* ==========================================
   Southbound — daily nutrition goals (pure)

   The coach keeps his own numbers. A client starts from a sensible
   starting point instead of the coach's: scaled to their body weight
   when they've entered one on the Fueling page, general otherwise,
   and clearly labelled as a starting point until they set their own.

   Saved per person as "nutrition-goals" (cloud-synced with the rest of
   their nutrition). js/nutrition.js reads and writes it; unit-tested in
   tests/nutritionGoals.test.mjs.
========================================== */

export const GOAL_KEYS = ["calories", "protein", "carbs", "fat", "water", "sodium"];

// Eddie's own targets (a marathon build), unchanged.
export const COACH_GOALS = { calories: 3200, protein: 180, carbs: 450, fat: 70, water: 100, sodium: 3000 };

// No body weight yet: a moderate, active-adult starting point.
export const GENERAL_GOALS = { calories: 2200, protein: 110, carbs: 275, fat: 70, water: 80, sodium: 2300 };

const roundTo = (n, step) => Math.round(n / step) * step;

/**
 * A client's starting point. With a body weight (lb): about 1.6 g/kg
 * protein, 5 g/kg carbs for regular training, 0.8 g/kg fat, calories
 * from those, and roughly half their weight in ounces of water.
 */
export function startingGoals(bodyWeightLb) {
    const lb = Number(bodyWeightLb);
    if (!(lb >= 70 && lb <= 400)) return { ...GENERAL_GOALS };
    const protein = roundTo(lb * 0.75, 5);
    const carbs = roundTo(lb * 2.3, 25);
    const fat = roundTo(lb * 0.35, 5);
    return {
        calories: roundTo(protein * 4 + carbs * 4 + fat * 9, 50),
        protein,
        carbs,
        fat,
        water: Math.max(64, roundTo(lb * 0.5, 8)),
        sodium: 2300
    };
}

/**
 * The goals to show: what they saved, filling any gaps from their
 * defaults. -> { goals, custom } (custom = they've set at least one).
 */
export function resolveGoals(saved, { isCoach = false, bodyWeightLb = null } = {}) {
    const defaults = isCoach ? COACH_GOALS : startingGoals(bodyWeightLb);
    const goals = { ...defaults };
    let custom = false;
    for (const key of GOAL_KEYS) {
        const v = Number(saved?.[key]);
        if (v > 0 && v < 100000) { goals[key] = v; custom = true; }
    }
    return { goals, custom };
}

// One goal changed -> the object to save (only real, positive numbers).
export function withGoal(saved, key, value) {
    const v = Number(value);
    if (!GOAL_KEYS.includes(key) || !(v > 0 && v < 100000)) return null;
    return { ...(saved && typeof saved === "object" ? saved : {}), [key]: Math.round(v) };
}
