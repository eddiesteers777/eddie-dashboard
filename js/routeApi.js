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

const VALHALLA = "https://valhalla1.openstreetmap.de";
const OVERPASS = "https://overpass-api.de/api/interpreter";

async function timedFetch(url, init, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { ...init, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
}

/** Pedestrian route through the points -> { coords, miles, snapped: true }. Throws on any failure. */
export async function fetchRoute(locs, costing = null) {
    const body = { locations: locs.map(p => ({ lat: p[0], lon: p[1] })), costing: "pedestrian", directions_options: { units: "miles" } };
    if (costing) body.costing_options = { pedestrian: costing };
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

/** Ways near a box { s, w, n, e } -> scored ways. Throws on failure. */
export async function fetchWays(box) {
    const bbox = `${box.s},${box.w},${box.n},${box.e}`;
    const kinds = ["footway", "path", "cycleway", "pedestrian", "residential", "unclassified", "tertiary", "living_street", "primary", "secondary", "trunk", "motorway"];
    const q = "[out:json][timeout:25];(" + kinds.map(k => `way["highway"="${k}"](${bbox});`).join("") + ");out geom;";
    const res = await timedFetch(OVERPASS, { method: "POST", body: "data=" + encodeURIComponent(q) }, 30000);
    if (!res.ok) throw new Error("Map data answered " + res.status);
    const data = await res.json();
    return waysFromOverpass(data.elements || []);
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
