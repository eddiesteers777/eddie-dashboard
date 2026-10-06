/* ==========================================
   Southbound — Featured Training classification (pure)

   Plan-aware classification is kept separate from actual-run
   classification. Featured Runs can therefore use completed COROS +
   Strava runs even when the athlete moved a workout off its planned day.
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

/**
 * Classifies a completed run. A nearby plan day is strong evidence, but the
 * actual run remains the source of truth: moved sessions and Strava-only runs
 * can still qualify.
 */
export function autoRunCategory(run, planDay, planCategory = null) {
    if (!run || !Number(run.distance) || run.race) return null;

    const name = clean(run.name);

    // Explicit workout language in the completed activity is useful even when
    // the run was moved or never had a matching plan entry.
    const speedWords = /\b(intervals?|repeats?|reps?|fartlek|tempo|threshold|progression|speed\s+work|hill\s+repeats?|track|marathon\s+pace|half\s+marathon\s+pace|5k\s+pace|10k\s+pace)\b/i;
    const longWords = /\blong\s+run\b|\bmarathon\s+long\b/i;

    // A matched plan day is stronger than a vague activity name such as
    // "Run", but never use a plan category when it is absent.
    if (planCategory === FEATURED_CATEGORIES.SPEED_WORK ||
        planCategory === FEATURED_CATEGORIES.LONG_RUN) {
        return planCategory;
    }

    if (speedWords.test(name)) return FEATURED_CATEGORIES.SPEED_WORK;
    if (longWords.test(name)) return FEATURED_CATEGORIES.LONG_RUN;

    // Conservative fallback for genuinely unplanned long efforts.
    const miles = Number(run.distance) / 1609.344;
    const minutes = Number(run.duration) / 60;
    if (miles >= 12 || (miles >= 8 && minutes >= 90)) return FEATURED_CATEGORIES.LONG_RUN;

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
