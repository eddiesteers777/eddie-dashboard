// Route safety rating: sun times, light, rush hour, OSM tag reading, per-piece scores,
// missing data, the overall trio, safer time, avoid boxes and crossings.
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { sunTimes, lightAt, isRushHour, clockText } from "../js/routeSun.js";
import {
    BANDS, bandFor, speedMph, kindOf, sidewalkOf, litOf, surfaceOf, crossingType, isBusyRoad,
    safetyDataFromOverpass, chunkRoute, findCrossings, routeFacts, scoreFacts, scoreRoute, overallOf,
    worstText, riskText, headlineText, whyText, saferTime, safetyCosting, avoidBoxes, withGeometry, costText, crossingLines,
    SAFETY_NOTE, RUSH_NOTE, UNKNOWN_NOTE
} from "../js/routeSafety.js";

const min = 60000;

test("sun: London midsummer sunrise 03:43 and sunset 20:21 UTC, within 5 minutes", () => {
    const s = sunTimes(Date.UTC(2026, 5, 21, 12), 51.5074, -0.1278);
    assert.ok(Math.abs(s.sunrise - Date.UTC(2026, 5, 21, 3, 43)) < 5 * min, new Date(s.sunrise).toISOString());
    assert.ok(Math.abs(s.sunset - Date.UTC(2026, 5, 21, 20, 21)) < 5 * min, new Date(s.sunset).toISOString());
});

test("sun: polar day and polar night", () => {
    assert.equal(sunTimes(Date.UTC(2026, 5, 21, 12), 78.2, 15.6).polar, "day");
    assert.equal(sunTimes(Date.UTC(2026, 11, 21, 12), 78.2, 15.6).polar, "night");
});

test("light: day, low light within 30 minutes of sunrise or sunset, night", () => {
    const sun = { sunrise: Date.UTC(2026, 9, 31, 12, 0), sunset: Date.UTC(2026, 9, 31, 23, 0) };
    assert.equal(lightAt(Date.UTC(2026, 9, 31, 17), sun), "day");
    assert.equal(lightAt(Date.UTC(2026, 9, 31, 12, 20), sun), "dusk");
    assert.equal(lightAt(Date.UTC(2026, 9, 31, 11, 40), sun), "dusk");
    assert.equal(lightAt(Date.UTC(2026, 9, 31, 22, 45), sun), "dusk");
    assert.equal(lightAt(Date.UTC(2026, 9, 31, 10), sun), "night");
    assert.equal(lightAt(Date.UTC(2026, 10, 1, 2), sun), "night");
});

test("rush hour: weekdays 7-9 am and 4-6 pm only (local time)", () => {
    assert.equal(isRushHour(new Date(2026, 9, 29, 7, 30).getTime()), true); // Thursday
    assert.equal(isRushHour(new Date(2026, 9, 29, 17, 59).getTime()), true);
    assert.equal(isRushHour(new Date(2026, 9, 29, 12).getTime()), false);
    assert.equal(isRushHour(new Date(2026, 9, 31, 8).getTime()), false); // Saturday
    assert.equal(clockText(new Date(2026, 9, 29, 21, 5).getTime()), "9:05 pm");
});

test("bands: six steps at 90 / 75 / 60 / 45 / 30 / 0", () => {
    assert.deepEqual([100, 90, 89, 75, 74, 60, 59, 45, 44, 30, 29, 0].map(s => bandFor(s).id), ["G", "G", "LG", "LG", "Y", "Y", "O", "O", "LR", "LR", "R", "R"]);
    assert.equal(new Set(BANDS.map(b => b.dash)).size, 6, "each band has its own line pattern");
});

test("tags: speed, kind, sidewalk, lit, surface, crossing type, busy", () => {
    assert.equal(speedMph("35 mph"), 35);
    assert.equal(speedMph("50"), 31); // km/h
    assert.equal(speedMph("signals"), null);
    assert.equal(kindOf({ highway: "footway", footway: "sidewalk" }), "sidewalk");
    assert.equal(kindOf({ highway: "path" }), "path");
    assert.equal(kindOf({ highway: "trunk" }), "highway");
    assert.equal(kindOf({ highway: "residential", foot: "no" }), "highway");
    assert.equal(kindOf({ highway: "secondary" }), "road");
    assert.equal(sidewalkOf({ sidewalk: "both" }), "both");
    assert.equal(sidewalkOf({ sidewalk: "separate" }), "both");
    assert.equal(sidewalkOf({ sidewalk: "right" }), "one");
    assert.equal(sidewalkOf({ "sidewalk:left": "yes", "sidewalk:right": "no" }), "one");
    assert.equal(sidewalkOf({ sidewalk: "no" }), "none");
    assert.equal(sidewalkOf({}), "unknown");
    assert.equal(litOf({ lit: "24/7" }), "yes");
    assert.equal(litOf({ lit: "no" }), "no");
    assert.equal(litOf({}), "unknown");
    assert.equal(surfaceOf({ surface: "gravel" }), "loose");
    assert.equal(surfaceOf({ surface: "asphalt", smoothness: "bad" }), "broken");
    assert.equal(surfaceOf({ surface: "asphalt" }), "paved");
    assert.equal(crossingType({ highway: "crossing", crossing: "traffic_signals" }), "signal");
    assert.equal(crossingType({ highway: "crossing", crossing: "uncontrolled" }), "marked");
    assert.equal(crossingType({ highway: "crossing", crossing: "unmarked" }), "unmarked");
    assert.equal(crossingType({ highway: "crossing" }), "unknown");
    assert.ok(isBusyRoad({ highway: "secondary" }));
    assert.ok(isBusyRoad({ highway: "tertiary", maxspeed: "45 mph" }));
    assert.ok(!isBusyRoad({ highway: "residential", maxspeed: "25 mph" }));
});

const facts = over => ({ kind: "road", startMi: 0, endMi: 0.1, road: null, sidewalk: null, shoulder: false, lit: "yes", surface: "paved", isolated: false, crossings: [], ...over });
const road = (highway, mph = null, lanes = null) => ({ highway, mph, lanes, name: "" });

test("score: separation bases A 95, B 80, C 60, D 35-15, X 5", () => {
    assert.equal(scoreFacts(facts({ kind: "path" })).score, 95);
    assert.equal(scoreFacts(facts({ kind: "sidewalk", road: road("residential") })).score, 80);
    assert.equal(scoreFacts(facts({ road: road("residential"), sidewalk: "none" })).score, 60);
    assert.equal(scoreFacts(facts({ road: road("tertiary"), sidewalk: "none", shoulder: true })).score, 60);
    assert.equal(scoreFacts(facts({ road: road("tertiary"), sidewalk: "none" })).score, 20);
    const x = scoreFacts(facts({ kind: "highway", road: road("trunk") }), { light: "night" });
    assert.equal(x.score, 5); assert.equal(x.band.id, "R");
});

test("score: road class, speed and lanes", () => {
    assert.equal(scoreFacts(facts({ road: road("primary"), sidewalk: "both" })).score, 55); // busy road with sidewalk: Orange
    assert.equal(scoreFacts(facts({ road: road("secondary"), sidewalk: "both" })).score, 65);
    assert.equal(scoreFacts(facts({ road: road("tertiary", 45), sidewalk: "both" })).score, 55);
    assert.equal(scoreFacts(facts({ road: road("primary", 55, 4), sidewalk: "both" })).score, 40); // -30, -10
    const slow = scoreFacts(facts({ road: road("residential", 25), sidewalk: "both" }));
    assert.equal(slow.score, 85); assert.ok(slow.reasons.includes("25-mph street"));
    assert.ok(scoreFacts(facts({ road: road("primary", 40), sidewalk: "both" })).reasons.includes("40-mph primary road"));
});

test("score: sidewalk on one side, surface, crossings", () => {
    assert.equal(scoreFacts(facts({ road: road("residential"), sidewalk: "one" })).score, 75);
    assert.equal(scoreFacts(facts({ kind: "path", surface: "loose" })).score, 90);
    assert.equal(scoreFacts(facts({ kind: "path", crossings: [{ type: "signal", road: "US 31" }] })).score, 100);
    assert.equal(scoreFacts(facts({ kind: "path", crossings: [{ type: "unmarked" }] })).score, 85);
    const unk = scoreFacts(facts({ kind: "path", crossings: [{ type: "unknown" }] }));
    assert.equal(unk.score, 85); assert.deepEqual(unk.unknown, ["crossing"]);
});

test("score: lighting only matters after dark; dusk is half", () => {
    const lit = facts({ kind: "sidewalk", road: road("residential"), lit: "yes" });
    const unlit = facts({ kind: "sidewalk", road: road("residential"), lit: "no" });
    assert.equal(scoreFacts(unlit, { light: "day" }).score, 80);
    assert.equal(scoreFacts(lit, { light: "night" }).score, 90);
    assert.equal(scoreFacts(unlit, { light: "night" }).score, 60);
    assert.equal(scoreFacts(lit, { light: "dusk" }).score, 85);
    assert.equal(scoreFacts(unlit, { light: "dusk" }).score, 70);
    assert.ok(scoreFacts(unlit, { light: "dusk" }).reasons.some(r => /low light/.test(r)));
    // isolated + unlit at night: a further -10
    assert.equal(scoreFacts({ ...unlit, kind: "path", isolated: true }, { light: "night" }).score, 65);
    assert.equal(scoreFacts({ ...lit, kind: "path", isolated: true }, { light: "night" }).score, 100);
});

test("missing data: never guessed, never green, scored as the worse case", () => {
    const noSidewalk = scoreFacts(facts({ road: road("residential"), sidewalk: "unknown" }));
    assert.deepEqual(noSidewalk.unknown, ["sidewalk"]);
    assert.equal(noSidewalk.score, 60);
    const busyUnknown = scoreFacts(facts({ road: road("primary"), sidewalk: "unknown" }));
    assert.equal(busyUnknown.score, 0); // no-sidewalk case on a primary road
    const dark = scoreFacts(facts({ kind: "path", lit: "unknown" }), { light: "night" });
    assert.deepEqual(dark.unknown, ["lighting"]);
    assert.equal(dark.score, 75);
    assert.equal(scoreFacts(facts({ kind: "path", lit: "unknown" }), { light: "day" }).unknown.length, 0, "lighting is irrelevant in daylight");
    const nowhere = scoreFacts(facts({ kind: "none", lit: "unknown" }));
    assert.ok(nowhere.unknown.length && nowhere.score < 75);
});

test("rush hour drops a busy road exactly one colour step, quiet roads not at all", () => {
    const busy = facts({ road: road("primary"), sidewalk: "both" }); // 55 Orange
    const r = scoreFacts(busy, { rush: true });
    assert.equal(r.band.id, "LR"); assert.ok(r.reasons.includes("Rush hour (estimate)"));
    assert.equal(scoreFacts(facts({ road: road("residential"), sidewalk: "both" }), { rush: true }).score, 80);
});

// a little town: a greenway, a sidewalk along a primary road, and a primary road crossed at a signal
const geom = pts => pts.map(([lat, lon]) => ({ lat, lon }));
const line = (lat0, lon0, lat1, lon1, n) => Array.from({ length: n + 1 }, (_, i) => [lat0 + (lat1 - lat0) * i / n, lon0 + (lon1 - lon0) * i / n]);
const ROUTE = line(33.1000, -86.7600, 33.1000, -86.7400, 200); // about 1.15 mi west to east
const ELEMENTS = [
    { type: "way", tags: { highway: "path", name: "Greenway" }, geometry: geom(line(33.1000, -86.7600, 33.1000, -86.7500, 10)) },
    { type: "way", tags: { highway: "footway", footway: "sidewalk" }, geometry: geom(line(33.1000, -86.7500, 33.1000, -86.7400, 10)) },
    { type: "way", tags: { highway: "primary", name: "Pike", maxspeed: "45 mph", lanes: "4" }, geometry: geom(line(33.10015, -86.7500, 33.10015, -86.7400, 10)) },
    { type: "way", tags: { highway: "secondary", name: "Cross St" }, geometry: geom(line(33.0990, -86.7550, 33.1010, -86.7550, 4)) },
    { type: "node", lat: 33.1000, lon: -86.75502, tags: { highway: "crossing", crossing: "traffic_signals" } }
];

test("data: Overpass ways and crossing nodes", () => {
    const d = safetyDataFromOverpass(ELEMENTS);
    assert.equal(d.ways.length, 4);
    assert.deepEqual(d.crossings.map(c => c.type), ["signal"]);
});

test("chunks: about 100 m, covering the whole line", () => {
    const ch = chunkRoute(ROUTE);
    assert.ok(ch.length >= 17 && ch.length <= 19, String(ch.length));
    assert.equal(ch[0].startMi, 0);
    for (let i = 1; i < ch.length; i++) assert.equal(ch[i].startMi, ch[i - 1].endMi);
});

test("crossings: the secondary road is crossed once, at a signal; running beside the primary is not a crossing", () => {
    const d = safetyDataFromOverpass(ELEMENTS);
    const c = findCrossings(ROUTE, d);
    assert.equal(c.length, 1);
    assert.equal(c[0].road, "Cross St"); assert.equal(c[0].type, "signal");
    assert.ok(Math.abs(c[0].mi - 0.29) < 0.03, String(c[0].mi));
    assert.match(crossingLines(c)[0], /^Mile 0\.3: crosses Cross St \(secondary road\), signal crossing$/);
});

test("crossings: following a busy road around a bend is not a crossing", () => {
    const bend = [...line(33.1000, -86.7600, 33.1000, -86.7550, 20), ...line(33.1000, -86.7550, 33.1050, -86.7550, 20).slice(1)];
    const d = safetyDataFromOverpass([{ type: "way", tags: { highway: "primary", name: "Pike" }, geometry: geom(bend) }]);
    assert.equal(findCrossings(bend, d).length, 0);
});

test("route: greenway pieces Green, sidewalk-by-a-45-mph-4-lane-road pieces Light red, trio reported", () => {
    const f = routeFacts(ROUTE, safetyDataFromOverpass(ELEMENTS));
    const noon = Date.UTC(2026, 9, 31, 17); // noon in Alabama on a Saturday: daylight, no rush hour
    const s = scoreRoute(f, { startMs: noon, pace: 9, lat: 33.1, lon: -86.75 });
    const first = s.segments[0], last = s.segments[s.segments.length - 1];
    assert.equal(first.kind, "path"); assert.equal(first.band.id, "G");
    assert.equal(last.kind, "sidewalk"); assert.equal(last.score, 45); // 80 - 25 (45 mph) - 10 (4 lanes)
    const o = s.overall;
    assert.ok(o.avg > 45 && o.avg < 95, String(o.avg));
    assert.ok(o.pctRisk > 0 && o.pctRisk < 100);
    assert.match(headlineText(o), /^\d+ — /);
    assert.match(worstText(o), /^Worst \d\.\d mi: Orange — 45-mph primary road, 4 lanes, Mile 0\.\d–1\.\d$/);
    assert.match(riskText(o), /^\d+% at Orange or worse$/);
    assert.match(whyText(last), /^Orange \(45\) because: Sidewalk, 45-mph primary road, 4 lanes$/);
});

test("route at night: unmapped lighting makes pieces unknown and lowers them; daylight doesn't", () => {
    const f = routeFacts(ROUTE, safetyDataFromOverpass(ELEMENTS));
    const day = scoreRoute(f, { startMs: Date.UTC(2026, 9, 31, 17), pace: 9, lat: 33.1, lon: -86.75 });
    const night = scoreRoute(f, { startMs: Date.UTC(2026, 10, 1, 3), pace: 9, lat: 33.1, lon: -86.75 });
    assert.equal(day.overall.pctUnknown, 0);
    assert.equal(night.overall.pctUnknown, 100);
    assert.ok(night.overall.avg < day.overall.avg);
    assert.ok(night.segments.every(s => s.light === "night"));
});

test("safer time: the same route at 10 pm points to a daylight time", () => {
    const f = routeFacts(ROUTE, safetyDataFromOverpass(ELEMENTS));
    const out = saferTime(f, { startMs: Date.UTC(2026, 10, 1, 3), pace: 9, lat: 33.1, lon: -86.75 });
    assert.ok(out.best.avg - out.chosen.avg >= 10);
    assert.match(out.text, /^Same route scores \d+ at \d+:\d\d (am|pm), \d+ at \d+:\d\d (am|pm)\. Consider the (earlier|later) time/);
    const noon = saferTime(f, { startMs: Date.UTC(2026, 9, 31, 17), pace: 9, lat: 33.1, lon: -86.75 });
    assert.equal(noon.text, "");
});

test("avoid boxes: busy Orange-or-worse pieces only, none near a point you placed, at most 30", () => {
    const f = routeFacts(ROUTE, safetyDataFromOverpass(ELEMENTS));
    const segs = withGeometry(scoreRoute(f, { startMs: Date.UTC(2026, 9, 31, 17), pace: 9, lat: 33.1, lon: -86.75 }).segments, ROUTE);
    const all = avoidBoxes(segs, []);
    assert.ok(all.length >= 6 && all.length <= 10, String(all.length));
    assert.equal(all[0].length, 5); assert.deepEqual(all[0][0], all[0][4]);
    const kept = avoidBoxes(segs, [ROUTE[ROUTE.length - 1]]);
    assert.ok(kept.length < all.length, "the box at the end point is dropped");
    assert.ok(avoidBoxes(segs, [], 3).length === 3);
});

test("costing and cost words", () => {
    assert.deepEqual(safetyCosting({ walkway_factor: 1, sidewalk_factor: 1, use_hills: 0.5 }, { avoidBusy: true, preferLit: true }),
        { walkway_factor: 0.5, sidewalk_factor: 0.6, use_hills: 0.5, use_lit: 1 });
    assert.equal(safetyCosting({}, { shortest: true }).shortest, true);
    assert.equal(costText({ miles: 3.0, avg: 60 }, { miles: 3.4, avg: 78 }), "0.4 mi longer, 18 points safer");
    assert.equal(costText({ miles: 3.0, avg: 60 }, { miles: 3.02, avg: 59 }), "about the same distance, 1 point less safe");
});

test("the notes say what this is", () => {
    assert.equal(SAFETY_NOTE, "Planning estimate from map data — check the road yourself before you run.");
    assert.equal(RUSH_NOTE, "Rush-hour estimate — not live traffic data.");
    assert.equal(UNKNOWN_NOTE, "OSM has no lighting/sidewalk data here — check before you run.");
});

const arbFacts = fc.record({
    kind: fc.constantFrom("path", "sidewalk", "road", "highway", "none"),
    road: fc.option(fc.record({ highway: fc.constantFrom("residential", "tertiary", "primary", "secondary", "service"), mph: fc.option(fc.integer({ min: 5, max: 75 })), lanes: fc.option(fc.integer({ min: 1, max: 8 })), name: fc.constant("") })),
    sidewalk: fc.constantFrom("both", "one", "none", "unknown", null),
    shoulder: fc.boolean(), lit: fc.constantFrom("yes", "no", "unknown"), surface: fc.constantFrom("paved", "loose", "broken", "unknown"),
    isolated: fc.boolean(), crossings: fc.array(fc.record({ type: fc.constantFrom("signal", "marked", "unmarked", "unknown"), road: fc.constant("") }), { maxLength: 2 })
});
const arbCtx = fc.record({ light: fc.constantFrom("day", "dusk", "night"), rush: fc.boolean() });

test("property: every score is 0–100 and its band matches", () => {
    fc.assert(fc.property(arbFacts, arbCtx, (f, ctx) => {
        const s = scoreFacts(f, ctx);
        return Number.isInteger(s.score) && s.score >= 0 && s.score <= 100 && s.band === bandFor(s.score);
    }));
});

test("property: going from day to night never makes a piece safer unless it is mapped as lit", () => {
    fc.assert(fc.property(arbFacts, f => {
        if (f.lit === "yes") return true;
        return scoreFacts(f, { light: "night" }).score <= scoreFacts(f, { light: "day" }).score;
    }));
});

test("property: rush hour never raises a score", () => {
    fc.assert(fc.property(arbFacts, arbCtx, (f, ctx) => scoreFacts(f, { ...ctx, rush: true }).score <= scoreFacts(f, { ...ctx, rush: false }).score));
});

test("property: an unknown piece's number assumes the worse case, so mapping the tag as present never lowers it", () => {
    fc.assert(fc.property(arbFacts, arbCtx, (f, ctx) => {
        if (f.kind !== "road" || f.sidewalk !== "unknown") return true;
        return scoreFacts({ ...f, sidewalk: "both" }, ctx).score >= scoreFacts(f, ctx).score;
    }));
});
