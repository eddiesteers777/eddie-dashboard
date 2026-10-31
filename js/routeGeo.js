/* ==========================================
   Southbound — route geometry (pure)

   Small, unit-tested helpers for the route builder (js/routes.js):
   Valhalla's polyline format, distance, thinning a line for saving.
   Points are [lat, lon]. Distances are miles.
========================================== */

const R_MI = 3958.8;

/** Valhalla's encoded line (precision 6) -> [[lat, lon], ...]. */
export function decodePolyline(str, precision = 6) {
    let index = 0, lat = 0, lng = 0;
    const out = [], factor = Math.pow(10, precision);
    while (index < str.length) {
        for (const axis of [0, 1]) {
            let shift = 0, result = 0, byte;
            do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
            const change = (result & 1) ? ~(result >> 1) : (result >> 1);
            if (axis === 0) lat += change; else lng += change;
        }
        out.push([lat / factor, lng / factor]);
    }
    return out;
}

export function haversine(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R_MI * Math.asin(Math.sqrt(h));
}

/** Distance in miles from point p to the segment a-b (flat-earth maths, fine at street scale). */
export function pointToSegmentMi(p, a, b) {
    const cosLat = Math.cos(p[0] * Math.PI / 180);
    const mx = 69.172 * cosLat, my = 69.0;
    const ax = (a[1] - p[1]) * mx, ay = (a[0] - p[0]) * my;
    const bx = (b[1] - p[1]) * mx, by = (b[0] - p[0]) * my;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2)) : 0;
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.sqrt(cx * cx + cy * cy);
}

/** Miles along the line, point by point: [0, d1, d1+d2, ...]. */
export function cumulativeMiles(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
    return cum;
}

export function lineMiles(coords) {
    const cum = cumulativeMiles(coords);
    return cum[cum.length - 1] || 0;
}

/** A loop returns to within 0.05 mi of where it began. */
export function isLoop(coords) {
    return coords.length > 2 && haversine(coords[0], coords[coords.length - 1]) < 0.05;
}

/** Keeps at most `max` points, always the first and last, evenly spaced. */
export function thinLine(coords, max = 300) {
    if (coords.length <= max) return coords.slice();
    const out = [];
    const step = (coords.length - 1) / (max - 1);
    for (let i = 0; i < max - 1; i++) out.push(coords[Math.round(i * step)]);
    out.push(coords[coords.length - 1]);
    return out;
}

/** The box around some points, padded by `pad` degrees: { s, w, n, e }. */
export function boundsOf(points, pad = 0.01) {
    const lats = points.map(p => p[0]), lons = points.map(p => p[1]);
    return { s: Math.min(...lats) - pad, w: Math.min(...lons) - pad, n: Math.max(...lats) + pad, e: Math.max(...lons) + pad };
}

export function boxContains(outer, inner) {
    return !!outer && outer.s <= inner.s && outer.w <= inner.w && outer.n >= inner.n && outer.e >= inner.e;
}

/**
 * The route cut into pieces of about `miles` each, one box per piece (padded by `pad` degrees).
 * A long loop's map data is fetched piece by piece: small corridor boxes instead of one big box
 * that holds the whole loop and everything inside it.
 */
export function corridorBoxes(coords, { miles = 1.5, pad = 0.004 } = {}) {
    if (!coords || coords.length < 2) return [];
    const cum = cumulativeMiles(coords);
    const out = [];
    let start = 0;
    for (let i = 1; i < coords.length; i++) {
        if (cum[i] - cum[start] >= miles || i === coords.length - 1) {
            out.push(boundsOf(coords.slice(start, i + 1), pad));
            start = i;
        }
    }
    return out;
}

/** The boxes in `needed` that no box in `have` fully covers. */
export const boxesMissing = (needed, have = []) => needed.filter(b => !have.some(h => boxContains(h, b)));

/** A box grown by d degrees on every side. */
export const growBox = (b, d) => ({ s: b.s - d, w: b.w - d, n: b.n + d, e: b.e + d });

/** Where a new point p goes in the waypoint list: the gap it adds least distance to. */
export function bestInsertIndex(waypoints, p, closed = false) {
    const n = waypoints.length;
    if (n < 2) return n;
    let best = n, bestCost = Infinity;
    const gaps = closed ? n : n - 1;
    for (let g = 0; g < gaps; g++) {
        const a = waypoints[g], b = waypoints[(g + 1) % n];
        const cost = haversine(a, p) + haversine(p, b) - haversine(a, b);
        if (cost < bestCost) { bestCost = cost; best = g + 1; }
    }
    return best;
}

/** A point at every whole `unit` (miles) along the line: [{ n, at: [lat, lon] }]. */
export function distanceMarkers(coords, unit = 1) {
    const out = [];
    if (coords.length < 2) return out;
    let acc = 0, next = unit;
    for (let i = 1; i < coords.length; i++) {
        const d = haversine(coords[i - 1], coords[i]);
        while (d > 0 && acc + d >= next) {
            const t = (next - acc) / d;
            out.push({ n: Math.round(next / unit), at: [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])] });
            next += unit;
        }
        acc += d;
    }
    return out;
}

/** Index of the line point nearest to p. */
export function nearestIndex(coords, p) {
    let best = 0, bd = Infinity;
    coords.forEach((c, i) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
}

/** Waypoints the other way round. A closed loop keeps its start. */
export function reversePoints(waypoints, closed = false) {
    if (!closed) return waypoints.slice().reverse();
    return [waypoints[0], ...waypoints.slice(1).reverse()];
}

/** Out and back: to the last point, then back through the same points to the start. */
export function outAndBack(waypoints) {
    if (waypoints.length < 2) return waypoints.slice();
    return [...waypoints, ...waypoints.slice(0, -1).reverse()];
}
