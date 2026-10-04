/* ==========================================
   Southbound — Daniels & Gilbert VDOT (pure)

   The same two equations the Pace Calculator uses (js/pace-calculator.js,
   a page script that can't import this; tests/athleteParams.test.mjs
   checks the two never drift apart):
     VO2 = -4.60 + 0.182258 v + 0.000104 v²      (v in m/min)
     %VO2max = 0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t)   (t in min)
     VDOT = VO2(race pace) / %VO2max(race time)
   Used by the athlete model as one curve shape for turning a race into
   another distance. It is NOT independent evidence from Riegel: both
   start from the same race (docs/PERFORMANCE_ENGINE_PLAN.md 3.7).
========================================== */

export const vo2AtVelocity = v => -4.60 + 0.182258 * v + 0.000104 * v * v;

export function velocityAtVo2(vo2) {
    const a = 0.000104, b = 0.182258, c = -4.60 - vo2;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

export const pctVo2MaxAtTime = tMinutes =>
    0.8 + 0.1894393 * Math.exp(-0.012778 * tMinutes) + 0.2989558 * Math.exp(-0.1932605 * tMinutes);

/** A race (meters, seconds) -> its VDOT. */
export function vdotFromRace(meters, seconds) {
    const t = seconds / 60;
    return vo2AtVelocity(meters / t) / pctVo2MaxAtTime(t);
}

/** The time (seconds) a runner of this VDOT would run `meters` in. */
export function timeForVdot(vdot, meters) {
    // VDOT falls as the time grows, so bisect between 2 m/s... 10 m/s.
    let lo = meters / 10, hi = meters / 1;
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (vdotFromRace(meters, mid) > vdot) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/** One race -> the equivalent time at another distance, by VDOT. */
export const vdotEquivalent = (fromMeters, fromSeconds, toMeters) => timeForVdot(vdotFromRace(fromMeters, fromSeconds), toMeters);
