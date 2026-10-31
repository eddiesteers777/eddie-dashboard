/* ==========================================
   Southbound — globe view for Build a Route

   Zoomed out past continent level, the flat Leaflet map hands over to a
   3D globe (MapLibre GL 5, BSD-3, vendor/maplibre/, loaded only when
   first needed). OpenStreetMap raster tiles at low detail; detail loads
   as you zoom in. The globe is for looking, not editing: zoom back in
   (or tap Back to map) and the flat map returns at the same place with
   the same points, route and scores (they live in the page state, never
   in the globe).
========================================== */

let loading = null;
function loadLibrary() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
        const css = document.createElement("link");
        css.rel = "stylesheet"; css.href = "vendor/maplibre/maplibre-gl.css";
        document.head.appendChild(css);
        const s = document.createElement("script");
        s.src = "vendor/maplibre/maplibre-gl.js";
        s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("Globe library missing")));
        s.onerror = () => { loading = null; reject(new Error("Couldn't load the globe")); };
        document.head.appendChild(s);
    });
    return loading;
}

/* Leaflet zooms count 256 px tiles, MapLibre 512 px: one level apart. */
export const toGlobeZoom = leafletZoom => Math.max(0, leafletZoom - 1);
export const toLeafletZoom = globeZoom => globeZoom + 1;
export const ENTER_AT = 3;   // Leaflet zoom at or below this opens the globe
export const LEAVE_AT = 4.5; // globe zoom at or above this goes back to the flat map

let map = null;

/**
 * Opens the globe in `container`.
 * opts: { center:[lat,lon], zoom (Leaflet), line:[[lat,lon]...], points:[[lat,lon]...], onLeave(center, leafletZoom) }
 */
export async function openGlobe(container, opts) {
    const gl = await loadLibrary();
    const lnglat = p => [p[1], p[0]];
    const data = {
        line: { type: "Feature", geometry: { type: "LineString", coordinates: (opts.line || []).map(lnglat) } },
        points: { type: "FeatureCollection", features: (opts.points || []).map(p => ({ type: "Feature", geometry: { type: "Point", coordinates: lnglat(p) } })) }
    };
    if (map) { map.remove(); map = null; }
    map = new gl.Map({
        container,
        style: {
            version: 8,
            projection: { type: "globe" },
            sources: {
                osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
                line: { type: "geojson", data: data.line },
                points: { type: "geojson", data: data.points }
            },
            layers: [
                { id: "space", type: "background", paint: { "background-color": "#0b1a14" } },
                { id: "osm", type: "raster", source: "osm" },
                { id: "line-casing", type: "line", source: "line", paint: { "line-color": "#ffffff", "line-width": 6 } },
                { id: "line", type: "line", source: "line", paint: { "line-color": "#1b4d36", "line-width": 3 } },
                { id: "points", type: "circle", source: "points", paint: { "circle-radius": 5, "circle-color": "#d6b98e", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } }
            ]
        },
        center: lnglat(opts.center),
        zoom: toGlobeZoom(opts.zoom),
        attributionControl: { compact: true },
        maxPitch: 0,
        renderWorldCopies: false
    });
    map.addControl(new gl.NavigationControl({ showCompass: false }), "top-left");
    let left = false;
    const leave = () => {
        if (left || !map) return;
        left = true;
        const c = map.getCenter();
        opts.onLeave([c.lat, c.lng], Math.max(toLeafletZoom(map.getZoom()), ENTER_AT + 1));
    };
    map.on("zoomend", () => { if (map && map.getZoom() >= LEAVE_AT) leave(); });
    await new Promise(r => map.once("load", r));
    return { leave, map };
}

export function closeGlobe() {
    if (map) { map.remove(); map = null; }
}
