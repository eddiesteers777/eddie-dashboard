/* ==========================================
   Southbound — which state My Plan (plan.html) shows. Pure, tested
   (tests/planLoadState.test.mjs).

   Three states are kept apart on purpose:
     - still loading (the skeleton, no motion),
     - failed to load (says so, with Try again),
     - loaded: the plan, or a plain empty state.
   A read that failed must never be shown as "no plan".
========================================== */

// A read that hasn't answered in this long counts as failed, so the page
// never sits on Loading for good (same limit as Today's coach card).
export const READ_LIMIT_MS = 12000;

export function within(promise, ms = READ_LIMIT_MS) {
    let timer;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timed out")), ms); })
    ]).finally(() => clearTimeout(timer));
}

// What to show once the reads have answered (or failed).
//   hasContent:  a plan or workouts are on this device
//   headers:     the coach's published plan headers, or null if that read failed
//   coaches:     the coach links, or null if that read failed
// Returns "plan" | "arriving" | "failed" | "empty-coach" | "empty-unlinked".
export function planView({ hasContent, headers, coaches }) {
    if (hasContent) return "plan";
    // The coach published a plan that isn't on this device yet: it is being
    // downloaded (js/coachPlanSync.js reloads the page when it lands).
    if (Array.isArray(headers) && headers.some(h => h && h.status !== "archived")) return "arriving";
    // Without both reads we can't say "no plan" truthfully.
    if (!Array.isArray(headers) || !Array.isArray(coaches)) return "failed";
    return coaches.length ? "empty-coach" : "empty-unlinked";
}
