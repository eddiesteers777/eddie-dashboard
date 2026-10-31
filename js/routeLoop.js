/* ==========================================
   Southbound — "make it a loop" (pure)

   Six points around the start, snapped by the router, with the radius
   bracketed and bisected until the loop is within 10% of the target
   distance. Keeps the CLOSEST attempt, not the last (the v4 sandbox
   kept the last and swung 6.4 / 3.7 / 2.4 / 3.8 mi on a town grid).
   A heuristic, not a promise. `route(locs)` is the router, passed in
   so this runs without a network: it returns { coords, miles }.
========================================== */

export const LOOP_TOLERANCE = 0.10;
export const LOOP_MAX_ATTEMPTS = 6;

/** Six points around `start`, a little uneven so it isn't a circle. */
export function loopPoints(start, radiusMi) {
    const cosLat = Math.cos(start[0] * Math.PI / 180);
    const pts = [];
    for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * 2 * Math.PI;
        const r = radiusMi * (k % 2 === 0 ? 1.0 : 0.9);
        pts.push([start[0] + (r * Math.sin(ang)) / 69.0, start[1] + (r * Math.cos(ang)) / (69.172 * cosLat)]);
    }
    return pts;
}

/** The next radius to try, from the bracket so far. */
export function nextRadius(radius, miles, target, bracket) {
    if (miles < target) { if (bracket.lo === null || radius > bracket.lo) bracket.lo = radius; }
    else if (bracket.hi === null || radius < bracket.hi) bracket.hi = radius;
    let next;
    if (bracket.lo !== null && bracket.hi !== null) next = (bracket.lo + bracket.hi) / 2;
    else {
        next = radius * (target / miles);
        if (bracket.lo !== null && next <= bracket.lo) next = (bracket.lo + radius) / 2;
        if (bracket.hi !== null && next >= bracket.hi) next = (bracket.hi + radius) / 2;
    }
    return Math.min(5, Math.max(0.1, next));
}

/** -> { best: { points, result, err }, attempts: [{ radius, miles, err }] }; throws if the router does. */
export async function generateLoop({ start, targetMiles, route, onAttempt = () => {} }) {
    let radius = targetMiles / (2 * Math.PI);
    const bracket = { lo: null, hi: null };
    const attempts = [];
    let best = null;
    for (let n = 1; n <= LOOP_MAX_ATTEMPTS; n++) {
        const points = loopPoints(start, radius);
        const result = await route([start, ...points, start]);
        const err = Math.abs(result.miles - targetMiles) / targetMiles;
        attempts.push({ radius, miles: result.miles, err });
        onAttempt(attempts[attempts.length - 1], n);
        if (!best || err < best.err) best = { points, result, err };
        if (err <= LOOP_TOLERANCE) break;
        radius = nextRadius(radius, result.miles, targetMiles, bracket);
    }
    return { best, attempts, withinTarget: best.err <= LOOP_TOLERANCE };
}
