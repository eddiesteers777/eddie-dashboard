/* ==========================================
   Southbound — route services (network)

   Three free public services, the same ones the sandbox proved:
     Valhalla (FOSSGIS)  pedestrian routing and heights
     Overpass            sidewalks, paths and roads near the route
     OpenStreetMap       the map tiles (in js/routes.js)
   Nothing here is a Southbound server. Each call has a time limit and
   fails with a plain message; the page never pretends a route was
   snapped when it was not.
========================================== */

import { decodePolyline, haversine } from "./routeGeo.js";
import { waysFromOverpass } from "./routeScore.js";
import { safetyDataFromOverpass, SAFETY_HIGHWAY_KINDS } from "./routeSafety.js";

const VALHALLA = "https://valhalla1.openstreetmap.de";
const OVERPASS = "https://overpass-api.de/api/interpreter";

async function timedFetch(url, init, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...init, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
}

/** Pedestrian route through the points -> { coords, miles, snapped: true }. Throws on any failure. */
export async function fetchRoute(locs, costing = null, avoid = null) {
    const body = { locations: locs.map(p => ({ lat: p[0], lon: p[1] })), costing: "pedestrian", directions_options: { units: "miles" } };
    if (costing) body.costing_options = { pedestrian: costing };
    if (avoid && avoid.length) body.exclude_polygons = avoid; // [[lon, lat], ...] boxes the route must stay out of
    const res = await timedFetch(VALHALLA + "/route", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }, 20000);
    if (!res.ok) throw new Error("Routing answered " + res.status);
    const data = await res.json();
    const legs = data.trip && data.trip.legs;
    if (!legs || !legs.length) throw new Error("No route came back");
    let coords = [];
    legs.forEach(leg => { coords = coords.concat(decodePolyline(leg.shape, 6)); });
    return { coords, miles: data.trip.summary ? data.trip.summary.length : 0, snapped: true };
}

/** Straight lines between the points, labelled as such: used only when routing fails. */
export function straightRoute(locs) {
    let miles = 0;
    for (let i = 1; i < locs.length; i++) miles += haversine(locs[i - 1], locs[i]);
    return { coords: locs.map(p => p.slice()), miles, snapped: false };
}

/** Heights in metres, one per point of `coords` (asked for in chunks), or throws. */
export async function fetchHeights(coords) {
    const out = [];
    for (let i = 0; i < coords.length; i += 300) {
        const chunk = coords.slice(i, i + 300);
        const res = await timedFetch(VALHALLA + "/height", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shape: chunk.map(p => ({ lat: p[0], lon: p[1] })), range: true })
        }, 20000);
        if (!res.ok) throw new Error("Elevation answered " + res.status);
        const data = await res.json();
        const heights = data.range_height ? data.range_height.map(r => r[1]) : (data.height || []);
        if (heights.length !== chunk.length) throw new Error("Elevation came back incomplete");
        out.push(...heights);
    }
    return out;
}

/**
 * Map data near a box { s, w, n, e }: the scored ways for the surface split, and the
 * roads, paths and crossing points for the safety rating. Throws on failure.
 */
/** Overpass answers 200 with a "remark" when the query ran out of time or memory: that is a failure, not "no data". */
export function overpassElements(data) {
    if (!data || typeof data !== "object") throw new Error("Map data answer was empty");
    if (typeof data.remark === "string" && /error|timed out|out of memory/i.test(data.remark)) throw new Error("Map data: " + data.remark);
    return Array.isArray(data.elements) ? data.elements : [];
}

/** Several answers in one list, each element once (pieces overlap where they meet). */
export function mergeElements(lists) {
    const seen = new Set(), out = [];
    for (const list of lists) for (const e of list || []) {
        const k = e && e.id != null ? e.type + e.id : null;
        if (k) { if (seen.has(k)) continue; seen.add(k); }
        out.push(e);
    }
    return out;
}

export const mapDataFrom = elements => ({ ways: waysFromOverpass(elements), safety: safetyDataFromOverpass(elements) });

const wait = ms => new Promise(r => setTimeout(r, ms));
export const MAP_ATTEMPTS = 3;
const RETRY_WAIT_MS = [2000, 5000]; // before the 2nd and 3rd try

/** Raw Overpass elements for one box. Up to MAP_ATTEMPTS tries, waiting longer each time; onRetry(nextAttempt, attempts) before each retry. */
export async function fetchMapElements(box, { attempts = MAP_ATTEMPTS, onRetry = null, waits = RETRY_WAIT_MS } = {}) {
    const bbox = `${box.s},${box.w},${box.n},${box.e}`;
    const q = "[out:json][timeout:25];(" + SAFETY_HIGHWAY_KINDS.map(k => `way["highway"="${k}"](${bbox});`).join("") +
        `node["highway"="crossing"](${bbox});node["highway"="traffic_signals"](${bbox}););out geom;`;
    let last = null;
    for (let a = 1; a <= attempts; a++) {
        try {
            const res = await timedFetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q) }, 30000);
            if (!res.ok) throw new Error("Map data answered " + res.status);
            return { elements: overpassElements(await res.json()), tries: a };
        } catch (err) {
            last = err;
            if (a < attempts) { if (onRetry) onRetry(a + 1, attempts); await wait(waits[Math.min(a - 1, waits.length - 1)]); }
        }
    }
    throw last;
}

/**
 * Map data for several boxes (the route's pieces), two at a time so the free service isn't flooded.
 * Pieces that load are kept even when another fails, so "Try again" fetches only what is missing.
 * -> { elements, boxes (loaded), failed (boxes), tries (total requests) }
 */
export async function fetchMapPieces(boxes, { onRetry = null, onProgress = null, attempts = MAP_ATTEMPTS, waits } = {}) {
    const lists = [], loaded = [], failed = [];
    let next = 0, done = 0, tries = 0;
    const worker = async () => {
        while (next < boxes.length) {
            const i = next++;
            try {
                const r = await fetchMapElements(boxes[i], { attempts, waits, onRetry: onRetry ? (a, n) => onRetry(a, n, i, boxes.length) : null });
                lists.push(r.elements); loaded.push(boxes[i]); tries += r.tries;
            } catch (err) {
                console.warn("Route builder: map data piece failed", err);
                failed.push(boxes[i]); tries += attempts;
            }
            done++;
            if (onProgress) onProgress(done, boxes.length);
        }
    };
    await Promise.all([worker(), worker()]);
    return { elements: mergeElements(lists), boxes: loaded, failed, tries };
}

/** One box -> { ways, safety } (with retries). */
export async function fetchMapData(box) {
    return mapDataFrom((await fetchMapElements(box)).elements);
}

/**
 * Place search with OpenStreetMap's Nominatim: only when the person presses Search
 * (its usage policy allows no search-as-you-type). -> [{ name, at: [lat, lon] }]
 */
export async function searchPlaces(q, near = null) {
    const params = new URLSearchParams({ q, format: "jsonv2", limit: "5", addressdetails: "0" });
    if (near) params.set("viewbox", `${near[1] - 1},${near[0] + 1},${near[1] + 1},${near[0] - 1}`);
    const res = await timedFetch("https://nominatim.openstreetmap.org/search?" + params, { headers: { "Accept-Language": "en" } }, 15000);
    if (!res.ok) throw new Error("Search answered " + res.status);
    const rows = await res.json();
    return (Array.isArray(rows) ? rows : []).map(r => ({ name: r.display_name, at: [Number(r.lat), Number(r.lon)] }))
        .filter(r => Number.isFinite(r.at[0]) && Number.isFinite(r.at[1]));
}
