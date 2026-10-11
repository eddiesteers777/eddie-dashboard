/* ==========================================
   Southbound — pace segments for the fuel schedule (pure)

   A workout isn't run at one pace: "1.5 mi easy, 6 × 1 mi at 6:40 with
   quarter-mile jogs, 1.5 mi easy" covers its miles unevenly in time. The
   fuel schedule places gels by the clock, so the mile each gel falls at
   should follow the workout's own paces, not one average.

   workoutSegments(workout, { paces }) turns a structured workout (the
   js/runWorkout.js shape, from a coach plan day or the Marathon plan via
   planDayFromMarathon) into an ordered list of stretches:
     { label, miles, minutes, pace (min/mi) }
   Every stretch gets a pace: its own target (a range's middle), else its
   effort word through the plan's pace table, else easy; a jog recovery
   runs a little slower than easy, a walk at 17:00/mi, a standing rest
   covers no ground.

   segmentTimeline(segments, durationMin, distanceMi) lines those up and
   scales them to the run as planned (the page's duration and distance),
   so the shape follows the workout while the totals stay the run's.
   Returns null when the parts don't describe this run (their miles are
   more than 25% off the run's distance). mileAt(min) / partAt(min) read
   it. No DOM or storage; unit-tested in tests/fuelSchedule.test.mjs.
========================================== */

import { parsePace, paceForLabel } from "./fuelTargets.js";

const MILES_PER = { mi: 1, km: 0.621371, m: 1 / 1609.344 };
const WALK_PACE = 17;
const MAX_SEGMENTS = 400;
// How far the parts' miles may sit from the run's distance and still describe it.
export const SEGMENT_TOLERANCE = 0.25;

const round2 = n => Math.round(n * 100) / 100;

function stepPace(step, { paces, easy, recovery = false }) {
    const own = parsePace(step?.pace);
    if (own) return own;
    const word = String(step?.effort || step?.note || "").trim().toLowerCase();
    if (recovery || /\b(jog|recover|recovery)\b/.test(word)) {
        if (/\bwalk/.test(word)) return WALK_PACE;
        if (/\b(rest|stand|standing)\b/.test(word)) return Infinity;
        return round2(easy * 1.08);
    }
    if (/\bwalk/.test(word)) return WALK_PACE;
    return paceForLabel(word, paces) || paceForLabel(word.split(/\s+/)[0], paces) || easy;
}

// One stretch: distance steps know their miles, timed ones their minutes.
function stretch(step, pace, label) {
    const amount = Number(step?.amount) || 0;
    if (!(amount > 0)) return null;
    if (step.unit === "min") {
        return { label, minutes: amount, miles: isFinite(pace) ? amount / pace : 0, pace: isFinite(pace) ? pace : null };
    }
    if (!isFinite(pace)) return null;
    const miles = amount * (MILES_PER[step.unit] ?? 1);
    return { label, miles, minutes: miles * pace, pace };
}

/** A structured workout -> [{ label, miles, minutes, pace }] in order (empty when there's nothing to read). */
export function workoutSegments(workout, { paces = null } = {}) {
    if (!workout || typeof workout !== "object") return [];
    const easy = paceForLabel("easy", paces) || 8.6;
    const ctx = { paces, easy };
    const out = [];
    const push = s => { if (s && out.length < MAX_SEGMENTS) out.push(s); };
    if (workout.warmup) push(stretch(workout.warmup, workout.warmup.pace ? stepPace(workout.warmup, ctx) : easy, "Warm-up"));
    (Array.isArray(workout.sets) ? workout.sets : []).forEach(set => {
        const reps = Math.max(1, Math.round(Number(set.repeat) || 1));
        for (let rep = 1; rep <= reps; rep++) {
            const repLabel = reps > 1 ? `Rep ${rep} of ${reps}` : "Main set";
            if (Array.isArray(set.parts) && set.parts.length) {
                set.parts.forEach(p => push(stretch(p, stepPace(p, { ...ctx, recovery: !!p.recovery }), p.recovery ? "Recovery" : repLabel)));
            } else {
                push(stretch(set, stepPace(set, ctx), repLabel));
            }
            if (set.recovery && rep < reps) push(stretch(set.recovery, stepPace(set.recovery, { ...ctx, recovery: true }), "Recovery"));
        }
    });
    if (workout.cooldown) push(stretch(workout.cooldown, workout.cooldown.pace ? stepPace(workout.cooldown, ctx) : easy, "Cool-down"));
    return out.map(s => ({ label: s.label, miles: round2(s.miles), minutes: round2(s.minutes), pace: s.pace == null ? null : round2(s.pace) }));
}

/** True when the stretches run at more than one pace (otherwise an even pace says the same). */
export function segmentsVary(segments) {
    const paces = (segments || []).map(s => s.pace).filter(p => p > 0);
    return paces.length > 1 && Math.max(...paces) - Math.min(...paces) >= 0.15;
}

/**
 * Stretches scaled to the run -> { points: [{ min, mi, label }], partsMiles, mileAt, partAt },
 * or null when they don't describe it.
 */
export function segmentTimeline(segments, durationMin, distanceMi) {
    const list = (segments || []).filter(s => (Number(s.minutes) || 0) > 0);
    const T = list.reduce((t, s) => t + Number(s.minutes), 0);
    const D = list.reduce((t, s) => t + (Number(s.miles) || 0), 0);
    if (!list.length || !(T > 0) || !(D > 0) || !(durationMin > 0) || !(distanceMi > 0)) return null;
    if (Math.abs(D - distanceMi) / distanceMi > SEGMENT_TOLERANCE) return { mismatch: true, partsMiles: round2(D) };
    const ts = durationMin / T, ds = distanceMi / D;
    const points = [{ min: 0, mi: 0, label: list[0].label }];
    let min = 0, mi = 0;
    for (const s of list) {
        min += Number(s.minutes) * ts;
        mi += (Number(s.miles) || 0) * ds;
        points.push({ min, mi, label: s.label });
    }
    // The segment a minute falls in: the first point at or past it.
    const index = t => {
        if (t <= 0) return 1;
        const i = points.findIndex(p => p.min >= t - 1e-9);
        return i < 0 ? points.length - 1 : Math.max(1, i);
    };
    const mileAt = t => {
        if (t >= durationMin) return distanceMi;
        const i = index(t);
        const a = points[i - 1], b = points[i];
        return b.min > a.min ? a.mi + (b.mi - a.mi) * (t - a.min) / (b.min - a.min) : b.mi;
    };
    const partAt = t => points[index(Math.min(t, durationMin))].label;
    return { mismatch: false, points, partsMiles: round2(D), mileAt, partAt };
}
