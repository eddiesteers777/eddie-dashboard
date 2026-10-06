/* ==========================================
   Southbound — Featured Training classification (pure)

   Automatic classification deliberately stays conservative:
   repeated / interval-formatted sessions are Speed Work first;
   otherwise the existing day-kind logic can mark a Long Run.
   Coach overrides are handled outside this pure model.
========================================== */

import { kindOfDay } from "./readiness.js";

export const FEATURED_KEY = "featured-training-categories";
export const FEATURED_CATEGORIES = Object.freeze({
    LONG_RUN: "long_run",
    SPEED_WORK: "speed_work",
    NONE: "none"
});

const clean = value => String(value == null ? "" : value).trim();

export function autoCategory(day, planDay) {
    if (!day || !Number(day.miles) || day.race || planDay?.type === "race") return null;

    const session = clean(day.session);
    const sets = planDay?.workout?.sets || [];

    // Repeats / mixed repeats are an explicit speed signal. This wins
    // over kindOfDay(), which can call a hard 12+ mile day "long".
    const repeatedStructure = sets.some(s =>
        Number(s.repeat) > 1 || (Array.isArray(s.parts) && s.parts.length > 0)
    );
    const intervalWords = /\b(intervals?|repeats?|reps?|fartlek|speed\s+work|hill\s+repeats?)\b/i.test(session);
    const intervalFormat = /\b\d+\s*[x×]\s*\d/i.test(session);

    if (repeatedStructure || intervalWords || intervalFormat) return FEATURED_CATEGORIES.SPEED_WORK;

    if (kindOfDay(day, planDay) === "long" ||
        planDay?.type === "long" ||
        /\blong\s+run\b/i.test(session)) {
        return FEATURED_CATEGORIES.LONG_RUN;
    }

    return null;
}

export function categoryFor(day, planDay, overrides = {}) {
    const id = "marathon|" + (day?.date || "");
    const override = overrides[id];

    if (override === FEATURED_CATEGORIES.LONG_RUN ||
        override === FEATURED_CATEGORIES.SPEED_WORK ||
        override === FEATURED_CATEGORIES.NONE) {
        return override === FEATURED_CATEGORIES.NONE ? null : override;
    }

    return autoCategory(day, planDay);
}
