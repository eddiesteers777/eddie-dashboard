/* ==========================================
   Southbound — My Routes library (pure helpers, routes.html)

   Thumbnails, search, filter and sort for the saved-route cards.
   No storage, no DOM: js/routes.js calls these and draws the cards.
========================================== */

export const FILTERS = [
    { id: "all", label: "All" },
    { id: "short", label: "Under 5 mi" },
    { id: "mid", label: "5 to 10 mi" },
    { id: "long", label: "10+ mi" },
    { id: "loop", label: "Loops" }
];

export const SORTS = [
    { id: "new", label: "Newest" },
    { id: "az", label: "Name A to Z" },
    { id: "near", label: "Shortest" },
    { id: "far", label: "Longest" }
];

/** Does this route belong under this filter chip? */
export function matchesFilter(r, id) {
    const m = Number(r.miles) || 0;
    if (id === "short") return m < 5;
    if (id === "mid") return m >= 5 && m < 10;
    if (id === "long") return m >= 10;
    if (id === "loop") return !!r.loop;
    return true;
}

export function filterRoutes(routes, { query = "", filter = "all", sort = "new" } = {}) {
    const q = String(query || "").trim().toLowerCase();
    const out = routes.filter(r => matchesFilter(r, filter) && (!q || String(r.name || "").toLowerCase().includes(q)));
    const by = {
        new: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
        az: (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }),
        near: (a, b) => (a.miles || 0) - (b.miles || 0),
        far: (a, b) => (b.miles || 0) - (a.miles || 0)
    }[sort] || (() => 0);
    return out.sort(by);
}

/** An SVG path (viewBox 0 0 w h) of the route's shape, fitted and padded. Longitude is scaled by cos(latitude) so a loop is not squashed. */
export function thumbPath(line, w = 120, h = 80, pad = 8) {
    const pts = (line || []).filter(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
    if (pts.length < 2) return "";
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos(lat0 * Math.PI / 180);
    const xs = pts.map(p => p[1] * k), ys = pts.map(p => -p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanX = maxX - minX || 1e-9, spanY = maxY - minY || 1e-9;
    const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
    const offX = (w - spanX * scale) / 2, offY = (h - spanY * scale) / 2;
    return pts.map((p, i) => {
        const x = offX + (xs[i] - minX) * scale, y = offY + (ys[i] - minY) * scale;
        return (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    }).join("");
}

/** "Loop" or "Point to point". */
export function shapeLabel(r) {
    return r.loop ? "Loop" : "Point to point";
}
