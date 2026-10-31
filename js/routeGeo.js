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
