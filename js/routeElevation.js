/* ==========================================
   Southbound — route climb as a range (pure)

   One route gives a different climb from each source (the same
   Chattanooga loop read ~443 ft raw from Valhalla, ~376 ft smoothed,
   269 ft on COROS). So the builder never shows one number as exact and
   never shows the raw point-to-point sum. It shows a range from two
   filters on the same Valhalla heights:
     light:  3-point average, 2 ft hysteresis (the v9 sandbox rule)
     strong: 7-point average, 10 ft hysteresis
   and says plainly that a watch will read differently.
========================================== */

const FT_PER_M = 3.28084;

/** Climb in feet with a moving average of `window` points either side and a hysteresis `threshold` (ft). */
export function smoothedGainFt(heightsFt, window, threshold) {
    if (!heightsFt || heightsFt.length < 2) return 0;
    const sm = heightsFt.map((_, i) => {
        const s = heightsFt.slice(Math.max(0, i - window), i + window + 1);
        return s.reduce((a, b) => a + b, 0) / s.length;
    });
    let gain = 0, ref = sm[0];
    for (let j = 1; j < sm.length; j++) {
        if (sm[j] - ref > threshold) { gain += sm[j] - ref; ref = sm[j]; }
        else if (ref - sm[j] > threshold) ref = sm[j];
    }
    return gain;
}

const round10 = n => Math.round(n / 10) * 10;

/** Heights in metres, one per route point -> { lowFt, highFt, text } or null. */
export function climbRange(heightsM) {
    if (!heightsM || heightsM.length < 2) return null;
    const ft = heightsM.map(m => m * FT_PER_M);
    const light = smoothedGainFt(ft, 1, 2);
    const strong = smoothedGainFt(ft, 3, 10);
    const lowFt = round10(Math.min(light, strong)), highFt = round10(Math.max(light, strong));
    const text = lowFt === highFt ? `about ${lowFt} ft` : `about ${lowFt}–${highFt} ft`;
    const down = ft.map(v => -v);
    const dl = smoothedGainFt(down, 1, 2), ds = smoothedGainFt(down, 3, 10);
    const downLowFt = round10(Math.min(dl, ds)), downHighFt = round10(Math.max(dl, ds));
    const downText = downLowFt === downHighFt ? `about ${downLowFt} ft` : `about ${downLowFt}–${downHighFt} ft`;
    return { lowFt, highFt, text, downLowFt, downHighFt, downText };
}

export const CLIMB_NOTE = "A range from Valhalla elevation data. Your watch will read a different number; none of them is exact.";

/**
 * The profile to draw: at most `max` points of { mi, ft }, lightly smoothed
 * (3-point average) so GPS-style wobble does not look like hills.
 */
export function profileSeries(cumMiles, heightsM, max = 400) {
    if (!heightsM || heightsM.length < 2 || cumMiles.length !== heightsM.length) return [];
    const ft = heightsM.map(m => m * FT_PER_M);
    const sm = ft.map((_, i) => { const s = ft.slice(Math.max(0, i - 1), i + 2); return s.reduce((a, b) => a + b, 0) / s.length; });
    const step = Math.max(1, Math.ceil(ft.length / max));
    const out = [];
    for (let i = 0; i < ft.length; i += step) out.push({ i, mi: cumMiles[i], ft: sm[i] });
    if (out[out.length - 1].i !== ft.length - 1) out.push({ i: ft.length - 1, mi: cumMiles[ft.length - 1], ft: sm[ft.length - 1] });
    return out;
}
