/* ==========================================
   Southbound — sidewalk-first optimiser (pure)

   Shifts each waypoint to the nearest A or B way within 0.10 mi,
   re-routes, and keeps the result only if A+B rises by at least 5
   points AND the distance grows by no more than 25% AND the major-road
   share does not rise. Otherwise the
   original stays and the comparison is still shown. A heuristic that
   depends on how well OpenStreetMap is tagged near the route.
   `route(locs)` is the router, passed in: -> { coords, miles }.
========================================== */

import { haversine, isLoop } from "./routeGeo.js";
import { scoreLine } from "./routeScore.js";

export const SHIFT_MAX_MI = 0.10;
export const MIN_AB_GAIN = 5;
export const MAX_GROWTH = 1.25;

export function shiftWaypoints(waypoints, ways) {
    return waypoints.map(wp => {
        let bestPt = null, bestD = SHIFT_MAX_MI;
        for (const way of ways) {
            if (way.cat !== "A" && way.cat !== "B") continue;
            for (const c of way.coords) {
                const d = haversine(wp, c);
                if (d < bestD) { bestD = d; bestPt = c; }
            }
        }
        return bestPt || wp;
    });
}

/* The +5 and +25% rules are the sandbox's. The last one is new: a shift that puts MORE of the route
   on a major road is never kept, whatever it does for the sidewalk share. */
export function keepShifted(before, after) {
    return after.ab >= before.ab + MIN_AB_GAIN && after.miles <= before.miles * MAX_GROWTH && after.x <= before.x;
}

/**
 * -> { status: "none" | "kept" | "rejected", before, after?, waypoints?, result? }
 * before/after: { miles, ab, x, summary }.
 */
export async function optimise({ waypoints, coords, miles, ways, route }) {
    const origScore = scoreLine(coords, ways);
    if (!origScore) return { status: "none", why: "no-score" };
    const before = { miles, ab: origScore.ab, x: origScore.pcts.X, summary: origScore.summary };
    const shifted = shiftWaypoints(waypoints, ways);
    if (!shifted.some((p, i) => haversine(p, waypoints[i]) > 0.01)) return { status: "none", why: "no-path-nearby", before };
    const loop = isLoop(coords);
    const result = await route(loop ? [...shifted, shifted[0]] : shifted);
    const candScore = scoreLine(result.coords, ways);
    if (!candScore) return { status: "none", why: "no-score", before };
    const after = { miles: result.miles, ab: candScore.ab, x: candScore.pcts.X, summary: candScore.summary };
    return { status: keepShifted(before, after) ? "kept" : "rejected", before, after, waypoints: shifted, result };
}
