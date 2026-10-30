// Southbound 3D demos — natural-motion helpers (Step 1, branch only).
// Diagnosis: every joint in the current motions is driven by ONE curve
// (repCurve) with the same cosine ease. Hips, chest, arms and head all
// start, stop and turn around at exactly the same instant, at the same
// speed, and every rep is identical. That is what reads as "robotic" —
// real movement is staggered, breathing, and never perfectly repeated.
//
// These helpers change TIMING and SECONDARY motion only. They do not
// change any exercise's start or bottom position, so the existing QA
// graders (feet planted, thighs parallel, straight body line, joint
// speed under 1.5 m/s) should still pass — re-run qa.mjs to prove it.
// No mocap, no third-party assets, no licence change: own code only.
//
// Usage in a motion file (squat example):
//   import { staggerCurve, breath, sway, repVar } from "../motion-natural.js";
//   const sHip   = repCurve(u);                 // hips lead
//   const sChest = staggerCurve(u, 0.06, repCurve); // chest follows
//   const sArm   = staggerCurve(u, 0.12, repCurve); // arms lag most
//   const depth  = repVar(t, 0.02);             // rep 1 slightly deeper
//   const br     = breath(t, this.reps);        // 0 = inhale, 1 = exhale
//   const sw     = sway(t, this.reps, 0.006);   // metres, lateral

/** Cosine ease, same as the existing motions (kept for compatibility). */
export const ease = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)));

/**
 * Stagger a rep curve: shift its phase input by `delay` (in rep units,
 * 0.06 ≈ 6% of a rep). Endpoints are preserved: staggered(0) = curve(0)
 * and staggered(1) = curve(1), so start and bottom positions are unchanged.
 * Use small delays only (0.04–0.12); larger delays look like a limp.
 */
export function staggerCurve(u, delay, curve) {
    const shifted = Math.min(1, Math.max(0, u - delay));
    // Blend back to the unshifted curve near the ends so the loop stays seamless.
    const blend = u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1;
    return curve(u) * (1 - blend) + curve(shifted) * blend;
}

/**
 * Breathing tied to effort, not to a clock: 0 during the lowering phase,
 * rising to 1 during the lifting phase, returning to 0 at the top.
 * Feed it the rep curve value s: breath = s is wrong (it would peak at
 * the bottom). Instead this takes the rep phase u and the curve's phase
 * boundaries [a, b, c, d] and returns inhale on the way down, exhale on
 * the way up. Apply as a small chest rotation (1–2 degrees) and a
 * shoulder lift, never as a scale change.
 */
export function breathFromCurve(u, [a, b, c, d] = [0.08, 0.48, 0.56, 0.94]) {
    if (u < a) return 0;
    if (u < b) return 0.5 * (u - a) / (b - a);          // inhale while lowering
    if (u < c) return 0.5;                              // held at the bottom
    if (u < d) return 0.5 + 0.5 * (u - c) / (d - c);    // exhale while lifting
    return 1 - (u - d) / (1 - d) * 0.2;                 // settle back toward 0
}

/**
 * Lateral hip sway, in metres. Periodic over the whole clip (t = 0..1),
 * so the loop is seamless: sway(0) = sway(1) = 0. Keep amplitude tiny
 * (0.004–0.008 m); more than that reads as a wobble and risks the
 * straight-line / mass-over-feet graders.
 */
export function sway(t, reps, amp = 0.006) {
    return amp * Math.sin(2 * Math.PI * t * reps);
}

/**
 * Per-clip rep variation, periodic over the whole clip: repVar(0) =
 * repVar(1) = 1, with a gentle rise and fall across the clip (first rep
 * slightly deeper/faster, later reps slightly less). Keep amp small
 * (0.01–0.03 = 1–3%). This breaks the "every rep identical" robot
 * tell without breaking the loop or any grader's endpoint checks.
 */
export function repVar(t, amp = 0.02) {
    return 1 + amp * Math.sin(2 * Math.PI * t);
}

/**
 * Turnaround settle: a tiny extra dip just after a phase boundary,
 * so a joint does not reverse direction dead-stiff. Returns a small
 * added depth (0..settleAmp) peaking shortly after the boundary.
 * Use sparingly (settleAmp <= 0.02) and only on the hips, never on
 * planted feet or hands.
 */
export function settle(u, boundary, settleAmp = 0.015, width = 0.08) {
    const d = u - boundary;
    if (d < 0 || d > width) return 0;
    return settleAmp * Math.sin(Math.PI * d / width);
}
