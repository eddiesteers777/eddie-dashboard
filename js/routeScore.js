/* ==========================================
   Southbound — route surface scoring (pure)

   Sidewalk-first. Each stretch of a route is matched to the nearest
   OpenStreetMap way within 30 m and given a class:
     A  traffic-free path / trail / greenway        score  3
     B  roadside sidewalk (or a road with one)      score  2
     C  quiet road / shoulder                       score  1
     D  not matched to anything mapped for walking  score  0
     X  major road, or foot=no                      score -99
   D often means a mapping gap, not bad ground: the page says so.
   Ported from the v9 sandbox, which was tested in three towns.
========================================== */

import { pointToSegmentMi, cumulativeMiles } from "./routeGeo.js";

export const CLASS_SCORES = { A: 3, B: 2, C: 1, D: 0, X: -99 };
export const CLASS_WORDS = {
    A: "path or trail", B: "sidewalk", C: "quiet road", D: "not mapped for walking", X: "major road"
};
const MATCH_MI = 0.01864; // 30 m
const KEYS = ["A", "B", "C", "D", "X"];

const sidewalkTagged = tags => /^(both|left|right|yes)$/.test(String(tags.sidewalk || "")) ||
    /^(both|left|right|yes)$/.test(String(tags["sidewalk:both"] || ""));

/** OSM tags -> "A" | "B" | "C" | "X" | null (not a way we score). */
export function categoryForWay(tags = {}) {
    const hw = tags.highway || "";
    if (tags.foot === "no") return "X";
    if (hw === "motorway" || hw === "trunk" || hw === "primary" || hw === "secondary") return "X";
    if (hw === "footway" || hw === "path" || hw === "pedestrian" || hw === "cycleway") {
        return tags.footway === "sidewalk" || tags.footway === "crossing" ? "B" : "A";
    }
    if (hw === "residential" || hw === "unclassified" || hw === "tertiary" || hw === "living_street") {
        return sidewalkTagged(tags) ? "B" : "C";
    }
    return null;
}

/** Overpass elements -> the ways we score: { cat, coords, name, bbox }. */
export function waysFromOverpass(elements = []) {
    const ways = [];
    for (const el of elements) {
        if (!el.geometry || el.geometry.length < 2) continue;
        const cat = categoryForWay(el.tags || {});
        if (!cat) continue;
        const coords = el.geometry.map(g => [g.lat, g.lon]);
        ways.push(makeWay(cat, coords, (el.tags && el.tags.name) || ""));
    }
    return ways;
}

export function makeWay(cat, coords, name = "") {
    const lats = coords.map(c => c[0]), lons = coords.map(c => c[1]);
    return { cat, coords, name, bbox: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)] };
}

/** Whole-number percentages that always add to 100. */
export function percentages(counts, total) {
    const pcts = {}, fracs = {};
    let sum = 0;
    for (const k of KEYS) {
        const raw = total ? 100 * counts[k] / total : 0;
        pcts[k] = Math.floor(raw); fracs[k] = raw - pcts[k]; sum += pcts[k];
    }
    KEYS.slice().sort((a, b) => fracs[b] - fracs[a]).slice(0, 100 - sum).forEach(k => { if (total) pcts[k]++; });
    return pcts;
}

const MARGIN = 0.0005; // degrees, a little over 30 m

/** Class of one point: { cat, way }. */
export function classifyPoint(p, ways) {
    let cat = "D", best = MATCH_MI, way = null;
    for (const w of ways) {
        const b = w.bbox;
        if (p[0] < b[0] - MARGIN || p[0] > b[2] + MARGIN || p[1] < b[1] - MARGIN || p[1] > b[3] + MARGIN) continue;
        for (let s = 0; s < w.coords.length - 1; s++) {
            const d = pointToSegmentMi(p, w.coords[s], w.coords[s + 1]);
            if (d < best) { best = d; cat = w.cat; way = w; }
        }
    }
    return { cat, way };
}

/** Scores a line against the ways (every 5th point). Null when there is nothing to score against. */
export function scoreLine(coords, ways, every = 5) {
    if (!ways || !ways.length || !coords || coords.length < 2) return null;
    const counts = { A: 0, B: 0, C: 0, D: 0, X: 0 };
    const highwayNames = [];
    let total = 0;
    for (let i = 0; i < coords.length; i += every) {
        total++;
        const { cat, way } = classifyPoint(coords[i], ways);
        counts[cat]++;
        if (cat === "X" && way && way.name && !highwayNames.includes(way.name)) highwayNames.push(way.name);
    }
    const pcts = percentages(counts, total);
    const score = KEYS.reduce((n, k) => n + counts[k] * CLASS_SCORES[k], 0);
    return {
        counts, total, pcts, score, highwayNames,
        ab: pcts.A + pcts.B,
        summary: `A ${pcts.A}% / B ${pcts.B}% / C ${pcts.C}% / D ${pcts.D}% / X ${pcts.X}%`
    };
}

/** The same score for each quarter of the route, by distance: [{ miles, score }]. */
export function scoreQuarters(coords, ways) {
    if (!coords || coords.length < 2) return [];
    const cum = cumulativeMiles(coords);
    const total = cum[cum.length - 1];
    const out = [];
    let q = 0, start = 0;
    for (let j = 1; j < coords.length && q < 4; j++) {
        if (cum[j] >= (q + 1) * total / 4 || j === coords.length - 1) {
            const seg = coords.slice(start, j + 1);
            out.push({ miles: cum[j] - cum[start], score: seg.length >= 2 ? scoreLine(seg, ways, 2) : null });
            q++; start = j;
        }
    }
    return out;
}

/**
 * The stretches of the route that run on a major road, so the map can mark them:
 * [{ coords, name }]. Samples every 3rd point, and each stretch reaches to the next
 * sample on either side so a single hit still has a length.
 */
export function xStretches(coords, ways, every = 3) {
    if (!ways || !ways.length || !coords || coords.length < 2) return [];
    const out = [];
    let run = null;
    for (let i = 0; i < coords.length; i += every) {
        const { cat, way } = classifyPoint(coords[i], ways);
        if (cat === "X") {
            if (!run) run = { from: Math.max(0, i - every), to: i, name: "" };
            run.to = Math.min(coords.length - 1, i + every);
            if (way && way.name && !run.name) run.name = way.name;
        } else if (run) { out.push(run); run = null; }
    }
    if (run) out.push(run);
    return out.map(r => ({ coords: coords.slice(r.from, r.to + 1), name: r.name }));
}
