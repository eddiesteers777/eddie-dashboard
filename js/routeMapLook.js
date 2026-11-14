/* ==========================================
   Southbound — map looks for Build a Route (routes.html)

   Three looks, all free OpenStreetMap-based tiles that need no key:
   Light (the standard map), Dark (the same tiles darkened with CSS, the
   look before 2026-11-14) and Terrain (OpenTopoMap contours and hill
   shading). The choice is a device preference, not account data.
   Satellite is left out on purpose: free imagery tiles carry terms
   Southbound has not checked.
========================================== */

export const LOOK_KEY = "sb-route-look";

export const LOOKS = [
    { id: "light", label: "Light", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19, attribution: "© OpenStreetMap contributors" },
    { id: "dark", label: "Dark", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19, attribution: "© OpenStreetMap contributors" },
    { id: "terrain", label: "Terrain", url: "https://tile.opentopomap.org/{z}/{x}/{y}.png", maxZoom: 17, attribution: "Map data © OpenStreetMap contributors, SRTM. Style © OpenTopoMap (CC-BY-SA)" }
];

export const DEFAULT_LOOK = "dark";

/** A look by id; anything unknown (or missing) falls back to the default. */
export function lookFor(id) {
    return LOOKS.find(l => l.id === id) || LOOKS.find(l => l.id === DEFAULT_LOOK);
}
