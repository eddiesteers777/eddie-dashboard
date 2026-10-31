// Test helper: real OpenStreetMap data for a box, shaped like an Overpass "out geom" answer.
// The sandbox can't reach Overpass but can reach the main OSM API, so the safety check feeds the
// page real tags this way. Small boxes only (the OSM API caps a call at 0.25 square degrees).
// Never used by the app itself.

const API = "https://api.openstreetmap.org/api/0.6/map";

const attrs = s => Object.fromEntries([...s.matchAll(/(\w[\w:]*)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const unescape = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const tagsOf = body => Object.fromEntries([...body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g)].map(m => [unescape(m[1]), unescape(m[2])]));

/** OSM XML -> { elements } with ways carrying geometry and crossing nodes carrying lat/lon. */
export function osmXmlToOverpass(xml, kinds) {
    const nodes = new Map(), elements = [];
    for (const m of xml.matchAll(/<node ([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
        const a = attrs(m[1]);
        const n = { lat: Number(a.lat), lon: Number(a.lon) };
        nodes.set(a.id, n);
        if (m[3]) {
            const tags = tagsOf(m[3]);
            if (tags.highway === "crossing" || tags.highway === "traffic_signals" || tags.crossing) elements.push({ type: "node", id: Number(a.id), ...n, tags });
        }
    }
    for (const m of xml.matchAll(/<way ([^>]*)>([\s\S]*?)<\/way>/g)) {
        const tags = tagsOf(m[2]);
        if (!tags.highway || (kinds && !kinds.includes(tags.highway))) continue;
        const geometry = [...m[2].matchAll(/<nd ref="(\d+)"\s*\/>/g)].map(r => nodes.get(r[1])).filter(Boolean);
        if (geometry.length >= 2) elements.push({ type: "way", id: Number(attrs(m[1]).id), tags, geometry });
    }
    return { elements };
}

/** Fetches the box { s, w, n, e } from the OSM API. */
export async function fetchOsmBox(box, kinds) {
    const res = await fetch(`${API}?bbox=${box.w},${box.s},${box.e},${box.n}`);
    if (!res.ok) throw new Error("OSM API answered " + res.status);
    return osmXmlToOverpass(await res.text(), kinds);
}
