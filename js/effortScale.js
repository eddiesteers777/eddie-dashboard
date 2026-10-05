/* ==========================================
   Southbound — the effort scale (pure)

   docs/ATHLETE_MODEL_AUDIT.md B5. Session effort ("How hard was it?",
   the workout and strength logs) is asked on the CR-10 scale, whose
   anchors are what session-RPE's validity rests on (Foster et al. 2001):
   1 very easy · 2 easy · 3 moderate · 4 somewhat hard · 5 hard ·
   7 very hard · 10 maximal; 6, 8 and 9 sit between anchors.

   Answers given before this (scale "sb1", Southbound's first words:
   2 and 3 both "Easy", 5 "Steady", 9 "Near max") are never rewritten.
   They're stored as given; only when they're compared with CR-10
   answers (the athlete model's effort vs expected, effort load) are
   they read on CR-10 with SB1_TO_CR10. A session-rpe answer says its
   scale; one without a scale is sb1. A workout log can't carry a scale
   (its fields are fixed by the Firestore rules), so a log saved before
   CR10_FROM is read as sb1.

   Timing (audit E2): the answer's delay after the run ended is kept
   (delayMin); one given more than a day later is "rated late" and counts
   half in the athlete's own effort baselines. Today's question waits
   until 15 minutes after a run ends (PROMPT_WAIT_MIN).
   Unit-tested in tests/effortScale.test.mjs.
========================================== */

export const SCALE = "cr10";
export const EFFORT_WORDS = Object.freeze({
    1: "Very easy", 2: "Easy", 3: "Moderate", 4: "Somewhat hard", 5: "Hard",
    6: "Hard to very hard", 7: "Very hard", 8: "Very hard to maximal", 9: "Nearly maximal", 10: "Maximal"
});
export const EFFORT_HINT = "1 very easy · 3 moderate · 5 hard · 7 very hard · 10 maximal";
/** The words the first scale used, for showing an old answer as it was given. */
export const SB1_WORDS = Object.freeze({ 1: "Very easy", 2: "Easy", 3: "Easy", 4: "Comfortable", 5: "Steady", 6: "Moderate", 7: "Hard", 8: "Very hard", 9: "Near max", 10: "All out" });
/** sb1 -> CR-10 by matching words: "Steady" 5 ≈ CR-10 3–4, "Moderate" 6 sat above it, "Near max" 9 ≈ 9. */
export const SB1_TO_CR10 = Object.freeze({ 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 4, 7: 5, 8: 7, 9: 9, 10: 10 });
/** Workout logs saved before this are on sb1 (they can't say which scale they used). */
export const CR10_FROM = Date.parse("2026-10-06T00:00:00Z");
export const LATE_MIN = 24 * 60;
export const PROMPT_WAIT_MIN = 15;

const valid = n => Number.isInteger(n) && n >= 1 && n <= 10;

/** A 1-10 answer on its scale -> the same effort on CR-10 (null when there's none). */
export function toCr10(rpe, scale = SCALE) {
    const n = Number(rpe);
    if (!valid(n)) return null;
    return scale === "sb1" ? SB1_TO_CR10[n] : n;
}

/** The scale a saved session-rpe answer was given on. */
export const scaleOf = record => (record?.scale === SCALE ? SCALE : "sb1");

/** The scale of a workout log's effort (results / the device's plan copy), from when it was saved. */
export function logScale(savedAt) {
    const ms = typeof savedAt === "number" ? savedAt : savedAt?.toMillis ? savedAt.toMillis() : Date.parse(savedAt || "");
    return Number.isFinite(ms) && ms >= CR10_FROM ? SCALE : "sb1";
}

/** Words for an answer as it was given. */
export const effortWords = (rpe, scale = SCALE) => (scale === "sb1" ? SB1_WORDS : EFFORT_WORDS)[Number(rpe)] || "";

/** When a session ended (ms), or null: its start plus elapsed (else moving) time. */
export function sessionEndMs(session) {
    const start = Date.parse(session?.start || "");
    const sec = Number(session?.elapsedSec) || Number(session?.movingSec) || 0;
    return Number.isFinite(start) ? start + sec * 1000 : null;
}

/** Minutes from the end of the run to the answer (null when either is unknown; never below 0). */
export function delayMinutes(answerAt, endMs) {
    return Number.isFinite(answerAt) && Number.isFinite(endMs) ? Math.max(0, Math.round((answerAt - endMs) / 60000)) : null;
}

export const isLate = delayMin => Number.isFinite(delayMin) && delayMin > LATE_MIN;
