/* ==========================================
   Southbound — route safety rating (pure)

   A traffic and infrastructure rating, NOT a crime rating. Each ~100 m
   of the route gets 0–100 from OpenStreetMap tags (what it runs on,
   road class and speed, lanes, sidewalk, crossings, lighting, surface,
   isolation) and the light at the time the runner reaches it.

   Missing data is never guessed. A tag that matters but isn't mapped
   makes the stretch "unknown": it is drawn with a hatch, not a colour,
   and its number assumes the worse case (no sidewalk, unlit), so an
   unknown stretch can never pass as green.

   Every screen that shows this carries SAFETY_NOTE. It's a planning
   estimate from map data, not a live safety guarantee.
========================================== */

import { pointToSegmentMi, cumulativeMiles } from "./routeGeo.js";
import { lightAt, isRushHour, sunTimes, clockText } from "./routeSun.js";

export const SAFETY_NOTE = "Planning estimate from map data — check the road yourself before you run.";
export const RUSH_NOTE = "Rush-hour estimate — not live traffic data.";
export const UNKNOWN_NOTE = "OSM has no lighting/sidewalk data here — check before you run.";

/* The six steps, safest first. `pattern` is what the map and the strip use besides colour. */
export const BANDS = [
    { id: "G", min: 90, name: "Green", color: "#1e8a4c", dash: null, words: "safest" },
    { id: "LG", min: 75, name: "Light green", color: "#76b852", dash: "18 4", words: "safe" },
    { id: "Y", min: 60, name: "Yellow", color: "#f2d03a", dash: "12 4 3 4", words: "mostly safe, watch" },
    { id: "O", min: 45, name: "Orange", color: "#eb7f1e", dash: "8 4", words: "caution" },
    { id: "LR", min: 30, name: "Light red", color: "#df4f72", dash: "5 3", words: "risky" },
    { id: "R", min: 0, name: "Red", color: "#a8192b", dash: "3 2", words: "avoid" }
];
export const UNKNOWN = { id: "?", name: "Unknown", color: "#8a8f94", words: "map data missing" };

export function bandFor(score) {
    return BANDS.find(b => score >= b.min) || BANDS[BANDS.length - 1];
}
const bandIndex = score => BANDS.indexOf(bandFor(score));

/* ---------- reading OSM tags ---------- */

const PATHS = new Set(["footway", "path", "pedestrian", "cycleway", "track", "bridleway", "steps"]);
const HIGHWAYS = new Set(["motorway", "motorway_link", "trunk", "trunk_link"]);
const BUSY_CLASSES = new Set(["primary", "primary_link", "secondary", "secondary_link"]);
const QUIET_CLASSES = new Set(["residential", "living_street", "unclassified", "service"]);
export const SAFETY_HIGHWAY_KINDS = ["footway", "path", "pedestrian", "cycleway", "track", "bridleway", "steps",
    "residential", "living_street", "unclassified", "service", "tertiary", "tertiary_link",
    "primary", "primary_link", "secondary", "secondary_link", "trunk", "trunk_link", "motorway", "motorway_link"];

/** OSM maxspeed -> mph, or null. A bare number is km/h (the OSM default). */
export function speedMph(raw) {
    if (raw == null || raw === "") return null;
    const m = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    return m[2] && /mph/i.test(m[2]) ? n : Math.round(n * 0.621371);
}

export function kindOf(tags = {}) {
    const hw = tags.highway || "";
    if (tags.foot === "no" || HIGHWAYS.has(hw)) return "highway";
    if (PATHS.has(hw)) return tags.footway === "sidewalk" || tags.footway === "crossing" ? "sidewalk" : "path";
    if (hw) return "road";
    return "none";
}

/** Sidewalk on a road: "both" | "one" | "none" | "unknown". "separate" (drawn as its own way) counts as there. */
export function sidewalkOf(tags = {}) {
    const yes = v => /^(yes|separate|both)$/.test(String(v || ""));
    const s = String(tags.sidewalk || "");
    if (/^(both|separate|yes)$/.test(s) || yes(tags["sidewalk:both"])) return "both";
    if (/^(left|right)$/.test(s)) return "one";
    const l = tags["sidewalk:left"], r = tags["sidewalk:right"];
    if (yes(l) && yes(r)) return "both";
    if (yes(l) || yes(r)) return "one";
    if (/^(no|none)$/.test(s) || tags["sidewalk:both"] === "no" || (l === "no" && r === "no")) return "none";
    return "unknown";
}

export function litOf(tags = {}) {
    const v = String(tags.lit || "");
    if (!v) return "unknown";
    if (v === "no" || v === "disused") return "no";
    return "yes"; // yes, 24/7, automatic, limited, sunset-sunrise, interval
}

export function surfaceOf(tags = {}) {
    const s = String(tags.surface || ""), sm = String(tags.smoothness || "");
    if (/^(bad|very_bad|horrible|very_horrible|impassable)$/.test(sm)) return "broken";
    if (/^(gravel|fine_gravel|pebblestone|dirt|ground|earth|sand|mud|unpaved|grass|rock|woodchips)$/.test(s)) return "loose";
    return s ? "paved" : "unknown";
}

export const isBusyRoad = (tags = {}) => BUSY_CLASSES.has(tags.highway) || (speedMph(tags.maxspeed) || 0) >= 40 || Number(tags.lanes) >= 4;

/** The type of a crossing node: "signal" | "marked" | "unmarked" | "unknown". */
export function crossingType(tags = {}) {
    const c = String(tags.crossing || ""), mk = String(tags["crossing:markings"] || "");
    if (c.includes("traffic_signals") || tags.highway === "traffic_signals" || tags["crossing:signals"] === "yes") return "signal";
    if (c === "unmarked" || mk === "no") return "unmarked";
    if (/marked|zebra|uncontrolled/.test(c) || tags.crossing_ref === "zebra" || mk) return "marked";
    return "unknown";
}

/* ---------- map data ---------- */

function bboxOf(coords) {
    let s = 90, w = 180, n = -90, e = -180;
    for (const [la, lo] of coords) { if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo; }
    return [s, w, n, e];
}

/** Overpass elements -> { ways: [{ kind, tags, coords, bbox, name }], crossings: [{ at, type }] } */
export function safetyDataFromOverpass(elements = []) {
    const ways = [], crossings = [];
    for (const el of elements) {
        const tags = el.tags || {};
        if (el.type === "node") {
            if (tags.highway === "crossing" || tags.highway === "traffic_signals" || tags.crossing) {
                crossings.push({ at: [el.lat, el.lon], type: crossingType(tags) });
            }
            continue;
        }
        if (!el.geometry || el.geometry.length < 2 || !tags.highway) continue;
        const coords = el.geometry.map(g => [g.lat, g.lon]);
        ways.push({ kind: kindOf(tags), tags, coords, bbox: bboxOf(coords), name: tags.name || tags.ref || "" });
    }
    return { ways, crossings };
}

const M = 1 / 1609.344; // one metre in miles
const near = (p, b, padDeg) => !(p[0] < b[0] - padDeg || p[0] > b[2] + padDeg || p[1] < b[1] - padDeg || p[1] > b[3] + padDeg);

function nearestWay(p, ways, maxMi, filter = null) {
    let best = maxMi, out = null;
    const pad = maxMi / 69 * 1.6;
    for (const w of ways) {
        if (filter && !filter(w)) continue;
        if (!near(p, w.bbox, pad)) continue;
        for (let s = 0; s < w.coords.length - 1; s++) {
            const d = pointToSegmentMi(p, w.coords[s], w.coords[s + 1]);
            if (d < best) { best = d; out = w; }
        }
    }
    return out;
}

/* ---------- the route in ~100 m pieces ---------- */

export const CHUNK_MI = 100 * M;

/** -> [{ i0, i1, startMi, endMi }] covering the whole line; a short tail joins the last piece. */
export function chunkRoute(coords, chunkMi = CHUNK_MI) {
    if (!coords || coords.length < 2) return [];
    const cum = cumulativeMiles(coords);
    const total = cum[cum.length - 1];
    const out = [];
    let i0 = 0;
    for (let j = 1; j < coords.length; j++) {
        if (cum[j] - cum[i0] >= chunkMi || j === coords.length - 1) {
            out.push({ i0, i1: j, startMi: cum[i0], endMi: cum[j] });
            i0 = j;
        }
    }
    const last = out[out.length - 1];
    if (out.length > 1 && last.endMi - last.startMi < chunkMi * 0.3) {
        out.pop(); out[out.length - 1].i1 = last.i1; out[out.length - 1].endMi = last.endMi;
    }
    if (out.length) out[out.length - 1].endMi = total;
    return out;
}

/** Point at `mi` along the line. */
function pointAt(coords, cum, mi) {
    for (let j = 1; j < coords.length; j++) {
        if (cum[j] >= mi) {
            const span = cum[j] - cum[j - 1] || 1;
            const t = (mi - cum[j - 1]) / span;
            return [coords[j - 1][0] + t * (coords[j][0] - coords[j - 1][0]), coords[j - 1][1] + t * (coords[j][1] - coords[j - 1][1])];
        }
    }
    return coords[coords.length - 1];
}

/* Where the route crosses a busy road (at a real angle, not running beside it). */
function segIntersect(a, b, c, d) {
    const r = [b[1] - a[1], b[0] - a[0]], s = [d[1] - c[1], d[0] - c[0]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-14) return null;
    const qp = [c[1] - a[1], c[0] - a[0]];
    const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    const cos = Math.abs(r[0] * s[0] + r[1] * s[1]) / (Math.hypot(...r) * Math.hypot(...s));
    return { t, angleOk: cos < Math.cos(30 * Math.PI / 180) };
}

/** -> [{ mi, at, type, road, roadClass }] for each crossing of a primary/secondary road (or 40+ mph / 4+ lanes). */
export function findCrossings(coords, data) {
    if (!coords || coords.length < 2 || !data) return [];
    const cum = cumulativeMiles(coords);
    const busy = data.ways.filter(w => w.kind === "road" && isBusyRoad(w.tags));
    const hits = [];
    for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i], b = coords[i + 1];
        const sb = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
        for (const w of busy) {
            if (sb[2] < w.bbox[0] || sb[0] > w.bbox[2] || sb[3] < w.bbox[1] || sb[1] > w.bbox[3]) continue;
            for (let s = 0; s < w.coords.length - 1; s++) {
                const x = segIntersect(a, b, w.coords[s], w.coords[s + 1]);
                if (!x || !x.angleOk) continue;
                const mi = cum[i] + x.t * (cum[i + 1] - cum[i]);
                const at = [a[0] + x.t * (b[0] - a[0]), a[1] + x.t * (b[1] - a[1])];
                // Running along the road (where it bends) is not crossing it: 15 m before and after are still on it.
                const onRoad = q => w.coords.some((c, k) => k < w.coords.length - 1 && pointToSegmentMi(q, c, w.coords[k + 1]) < 6 * M);
                if (onRoad(pointAt(coords, cum, Math.max(0, mi - 15 * M))) && onRoad(pointAt(coords, cum, Math.min(cum[cum.length - 1], mi + 15 * M)))) continue;
                hits.push({ mi, at, way: w });
            }
        }
    }
    hits.sort((p, q) => p.mi - q.mi);
    const out = [];
    for (const h of hits) {
        if (out.some(o => Math.abs(o.mi - h.mi) < 40 * M)) continue; // the two carriageways of one road, or a double hit
        let type = "unknown", best = 20 * M;
        for (const c of data.crossings) {
            const d = pointToSegmentMi(c.at, h.at, h.at);
            if (d < best) { best = d; type = c.type; }
        }
        out.push({ mi: h.mi, at: h.at, type, road: h.way.name || "", roadClass: h.way.tags.highway, mapped: best < 20 * M });
    }
    return out;
}

/* ---------- facts: what each piece runs on (time-independent) ---------- */

/** The map facts for each ~100 m of the route. Computed once per route + map data; re-scored for any time. */
export function routeFacts(coords, data) {
    const chunks = chunkRoute(coords);
    if (!chunks.length || !data) return [];
    const cum = cumulativeMiles(coords);
    const crossings = findCrossings(coords, data);
    const roads = w => w.kind === "road" || w.kind === "highway";
    return chunks.map(ch => {
        const samples = [0.2, 0.5, 0.8].map(f => pointAt(coords, cum, ch.startMi + f * (ch.endMi - ch.startMi)));
        const votes = new Map();
        for (const p of samples) {
            const w = nearestWay(p, data.ways, 30 * M);
            if (w) votes.set(w, (votes.get(w) || 0) + 1);
        }
        let way = null, n = 0;
        for (const [w, c] of votes) if (c > n) { way = w; n = c; }
        const mid = samples[1];
        const kind = way ? way.kind : "none";
        const tags = way ? way.tags : {};
        let road = null;
        if (kind === "road" || kind === "highway") road = tags;
        else if (kind === "sidewalk") { const r = nearestWay(mid, data.ways, 25 * M, roads); road = r ? r.tags : null; }
        return {
            startMi: ch.startMi, endMi: ch.endMi, i0: ch.i0, i1: ch.i1,
            kind, name: way ? way.name : "",
            highway: tags.highway || "",
            road: road ? { highway: road.highway || "", mph: speedMph(road.maxspeed), lanes: Number(road.lanes) || null, name: road.name || road.ref || "" } : null,
            sidewalk: kind === "road" ? sidewalkOf(tags) : null,
            shoulder: kind === "road" && /^(yes|both|left|right)$/.test(String(tags.shoulder || "")),
            lit: way ? litOf(tags) : "unknown",
            surface: way ? surfaceOf(tags) : "unknown",
            isolated: !nearestWay(mid, data.ways, 60 * M, roads),
            crossings: crossings.filter(c => c.mi >= ch.startMi && c.mi < ch.endMi)
        };
    });
}

const CROSS_WORDS = { signal: "signal crossing", marked: "marked crossing", unmarked: "unmarked crossing", unknown: "crossing type not mapped" };
const roadWord = r => {
    const cls = { primary: "primary road", primary_link: "primary road", secondary: "secondary road", secondary_link: "secondary road" }[r.highway];
    return cls || "road";
};

/**
 * One piece's score at one light level. -> { score, band, unknown: [..], reasons: [..], busy }
 * light: "day" | "dusk" | "night"; rush: boolean (weekday rush-hour assumption).
 */
export function scoreFacts(f, { light = "day", rush = false } = {}) {
    const reasons = [], unknown = [];
    if (f.kind === "highway") {
        return { score: 5, band: bandFor(5), unknown, reasons: ["Divided highway or motorway (or walking not allowed)"], busy: true };
    }
    let s;
    const r = f.road;
    const busy = !!(r && (BUSY_CLASSES.has(r.highway) || (r.mph || 0) >= 40 || (r.lanes || 0) >= 4));
    const quiet = !!(r && QUIET_CLASSES.has(r.highway) && !busy);
    if (f.kind === "none") {
        s = 35; unknown.push("no mapped road or path"); reasons.push("Not on any mapped road or path");
    } else if (f.kind === "path") {
        s = 95; reasons.push("Traffic-free path");
    } else if (f.kind === "sidewalk") {
        s = 80; reasons.push("Sidewalk");
    } else { // road
        const sw = f.sidewalk;
        if (sw === "both") { s = 80; reasons.push("Sidewalk on both sides"); }
        else if (sw === "one") { s = 75; reasons.push("Sidewalk on one side only"); }
        else {
            if (sw === "unknown") unknown.push("sidewalk");
            const noun = sw === "unknown" ? "sidewalk not mapped" : "no sidewalk";
            if (f.shoulder) { s = 60; reasons.push(`Road with a shoulder, ${noun}`); }
            else if (quiet) { s = 60; reasons.push(`Quiet road, ${noun}`); }
            else { s = 20; reasons.push(`Road with no shoulder, ${noun}`); } // D 35, and -15 for no sidewalk
        }
    }
    // traffic beside you (the road you're on, or the road your sidewalk follows)
    if (r && f.kind !== "path" && f.kind !== "none") {
        const cls = /^primary/.test(r.highway) ? -25 : /^secondary/.test(r.highway) ? -15 : 0;
        const sp = r.mph == null ? 0 : r.mph >= 50 ? -30 : r.mph >= 45 ? -25 : r.mph >= 40 ? -20 : 0;
        const pen = Math.min(cls, sp);
        if (pen < 0) { s += pen; reasons.push(r.mph != null ? `${r.mph}-mph ${roadWord(r)}` : roadWord(r).replace(/^./, c => c.toUpperCase())); }
        if (r.mph != null && r.mph <= 25 && /^(residential|living_street|service)$/.test(r.highway)) { s += 5; reasons.push(`${r.mph}-mph street`); }
        if ((r.lanes || 0) >= 4) { s -= 10; reasons.push(`${r.lanes} lanes`); }
    }
    if (f.surface === "loose") { s -= 5; reasons.push("Gravel or loose surface"); }
    else if (f.surface === "broken") { s -= 5; reasons.push("Broken surface"); }
    for (const c of f.crossings || []) {
        const name = c.road ? ` (${c.road})` : "";
        if (c.type === "signal" || c.type === "marked") { s += 5; reasons.push(`${c.type === "signal" ? "Signal" : "Marked"} crossing of a busy road${name}`); }
        else if (c.type === "unmarked") { s -= 10; reasons.push(`Unmarked crossing of a busy road${name}`); }
        else { s -= 10; unknown.push("crossing"); reasons.push(`Crossing of a busy road${name}, crossing type not mapped`); }
    }
    if (light !== "day") {
        const night = light === "night";
        if (f.lit === "yes") { s += night ? 10 : 5; reasons.push(night ? "Lit at night" : "Lit, low light"); }
        else {
            s -= night ? 20 : 10;
            if (f.lit === "unknown") { unknown.push("lighting"); reasons.push(night ? "Lighting not mapped (scored as unlit at night)" : "Lighting not mapped, low light"); }
            else reasons.push(night ? "Unlit at night" : "Unlit, low light");
            if (night && f.isolated) { s -= 10; reasons.push("Isolated: no road within 60 m"); }
        }
    }
    s = Math.max(0, Math.min(100, Math.round(s)));
    if (rush && busy) {
        const i = bandIndex(s);
        if (i < BANDS.length - 1) s = Math.max(BANDS[i + 1].min, Math.min(s - 15, BANDS[i].min - 1));
        else s = Math.max(0, s - 15);
        reasons.push("Rush hour (estimate)");
    }
    return { score: s, band: bandFor(s), unknown, reasons, busy };
}

/* ---------- the whole route at a time ---------- */

/**
 * Scores every piece for a run that starts at `startMs` at `pace` min/mi (each piece gets
 * the light of the moment you reach it). -> { segments, overall, crossings, light }
 */
export function scoreRoute(facts, { startMs, pace, lat, lon }) {
    if (!facts || !facts.length) return null;
    const sun = sunTimes(startMs, lat, lon);
    const segments = facts.map(f => {
        const t = startMs + ((f.startMi + f.endMi) / 2) * pace * 60000;
        const light = lightAt(t, sun);
        const rush = isRushHour(t);
        return { ...f, light, rush, ...scoreFacts(f, { light, rush }) };
    });
    return { segments, overall: overallOf(segments), crossings: segments.flatMap(s => s.crossings), sun };
}

/** The trio: distance-weighted average, worst stretch, and the share at Orange or worse. */
export function overallOf(segments) {
    let total = 0, sum = 0, risk = 0, unk = 0;
    for (const s of segments) {
        const len = Math.max(0, s.endMi - s.startMi);
        total += len; sum += s.score * len;
        if (s.score < 60) risk += len;
        if (s.unknown.length) unk += len;
    }
    const avg = total ? Math.round(sum / total) : 0;
    // worst: the longest unbroken run of the lowest band on the route
    const worstIdx = Math.max(...segments.map(s => BANDS.indexOf(s.band)));
    let best = null, run = null;
    for (const s of segments) {
        if (BANDS.indexOf(s.band) === worstIdx) {
            if (!run) run = { startMi: s.startMi, endMi: s.endMi, low: s };
            else { run.endMi = s.endMi; if (s.score < run.low.score) run.low = s; }
        } else if (run) { if (!best || run.endMi - run.startMi > best.endMi - best.startMi) best = run; run = null; }
    }
    if (run && (!best || run.endMi - run.startMi > best.endMi - best.startMi)) best = run;
    const worst = best ? { band: BANDS[worstIdx], startMi: best.startMi, endMi: best.endMi, miles: best.endMi - best.startMi, reasons: best.low.reasons, unknown: best.low.unknown.length > 0, score: best.low.score } : null;
    return {
        avg, band: bandFor(avg), worst, miles: total,
        pctRisk: total ? Math.round(100 * risk / total) : 0,
        pctUnknown: total ? Math.round(100 * unk / total) : 0
    };
}

const mi1 = n => n.toFixed(1);
export const headlineText = o => `${o.avg} — ${o.band.name}`;
export function worstText(o) {
    const w = o.worst;
    if (!w) return "";
    const why = w.reasons.filter(r => !/^(Traffic-free path|Sidewalk$|Sidewalk on both sides|Lit|Signal|Marked|\d+-mph street)/.test(r)).slice(0, 3).map(r => r.charAt(0).toLowerCase() + r.slice(1)).join(", ") || w.band.words;
    return `Worst ${mi1(Math.max(0.1, w.miles))} mi: ${w.band.name}${w.unknown ? " (estimate, map data missing)" : ""} — ${why}, Mile ${mi1(w.startMi)}–${mi1(w.endMi)}`;
}
export const riskText = o => `${o.pctRisk}% at Orange or worse`;

/** "Orange because: 40-mph road, sidewalk on one side only, unlit, rush hour" */
export function whyText(seg) {
    const name = seg.unknown.length ? `Unknown (estimate ${seg.band.name}, ${seg.score})` : `${seg.band.name} (${seg.score})`;
    return `${name} because: ${seg.reasons.map((r, i) => i ? r.charAt(0).toLowerCase() + r.slice(1) : r).join(", ")}`;
}

/**
 * Same route, other start times that day (every 30 min, 5 am to 10 pm). When one scores
 * at least 10 points better, a line saying so. -> { best, chosen, text } or null
 */
export function saferTime(facts, { startMs, pace, lat, lon }) {
    if (!facts || !facts.length) return null;
    const chosen = scoreRoute(facts, { startMs, pace, lat, lon }).overall;
    const day = new Date(startMs); day.setHours(5, 0, 0, 0);
    let best = null;
    for (let k = 0; k <= 34; k++) {
        const t = day.getTime() + k * 30 * 60000;
        const o = scoreRoute(facts, { startMs: t, pace, lat, lon }).overall;
        if (!best || o.avg > best.avg) best = { ...o, at: t };
    }
    if (!best || best.avg - chosen.avg < 10) return { best, chosen, text: "" };
    return { best, chosen, text: `Same route scores ${best.avg} at ${clockText(best.at)}, ${chosen.avg} at ${clockText(startMs)}. Consider ${best.at < startMs ? "the earlier" : "the later"} time, or turn on Prefer lit at night.` };
}

/* ---------- re-routing for safety ---------- */

/** Valhalla pedestrian costing with the safety toggles on top of the route options. */
export function safetyCosting(base, { avoidBusy = false, preferLit = false, shortest = false } = {}) {
    const o = { ...(base || {}) };
    if (avoidBusy) { o.walkway_factor = Math.min(o.walkway_factor ?? 1, 0.5); o.sidewalk_factor = Math.min(o.sidewalk_factor ?? 1, 0.6); }
    if (preferLit) o.use_lit = 1;
    if (shortest) o.shortest = true;
    return o;
}

/**
 * Boxes to keep the router off: the pieces on or beside a busy road scoring Orange or
 * worse (and any highway), skipping anything within 80 m of a point you placed (the
 * router can't start inside a no-go box). Worst first, at most `max`.
 * -> [[[lon, lat], ...5 corners]]
 */
export function avoidBoxes(segments, waypoints = [], max = 30) {
    const pad = 0.0002; // about 20 m
    const picked = (segments || [])
        .filter(s => s.kind === "highway" || (s.busy && s.score < 60 && s.kind !== "path"))
        .filter(s => !waypoints.some(p => (s.coords || []).some(q => pointToSegmentMi(p, q, q) < 80 * M)))
        .sort((a, b) => a.score - b.score)
        .slice(0, max);
    return picked.map(s => {
        const [S, W, N, E] = s.bbox;
        return [[W - pad, S - pad], [E + pad, S - pad], [E + pad, N + pad], [W - pad, N + pad], [W - pad, S - pad]];
    });
}

/** Adds each piece's corners (bbox and end points) from the line; used for avoid boxes and the map. */
export function withGeometry(segments, coords) {
    return (segments || []).map(s => {
        const pts = coords.slice(s.i0, s.i1 + 1);
        return { ...s, coords: pts, bbox: bboxOf(pts), startPt: pts[0], endPt: pts[pts.length - 1] };
    });
}

/** "0.4 mi longer, 18 points safer" */
export function costText(before, after) {
    if (!before || !after) return "";
    const d = after.miles - before.miles, p = after.avg - before.avg;
    const dist = Math.abs(d) < 0.05 ? "about the same distance" : `${Math.abs(d).toFixed(1)} mi ${d > 0 ? "longer" : "shorter"}`;
    const safe = p === 0 ? "no change in safety" : `${Math.abs(p)} point${Math.abs(p) === 1 ? "" : "s"} ${p > 0 ? "safer" : "less safe"}`;
    return `${dist}, ${safe}`;
}

/** Crossing lines for the explainer: "Mile 1.2: crosses Highway 31 (primary road), signal crossing". */
export function crossingLines(crossings) {
    return (crossings || []).map(c => `Mile ${mi1(c.mi)}: crosses ${c.road || "a busy road"} (${roadWord({ highway: c.roadClass })}), ${CROSS_WORDS[c.type]}`);
}
