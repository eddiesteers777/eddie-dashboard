/* ==========================================
   Southbound — route preferences (pure)

   The choices in the Route options panel, turned into Valhalla's own
   pedestrian costing settings and into which of OUR surface classes
   the sidewalk-first optimiser shifts toward. No popularity data:
   Southbound's preference is its A/B/C/D/X scoring.
     style:     "sidewalk" (default) | "direct"
     surface:   "any" (default) | "trail" | "paved"
     elevation: "any" (default) | "flat"
   "Seek hills" is left out on purpose: Valhalla can avoid hills but
   has no setting to look for them, and the page won't fake it.
========================================== */

export const DEFAULT_PREFS = Object.freeze({ sport: "running", style: "sidewalk", surface: "any", elevation: "any" });

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

export function readPrefs(raw) {
    const p = raw && typeof raw === "object" ? raw : {};
    return {
        sport: "running",
        style: pick(p.style, ["sidewalk", "direct"], DEFAULT_PREFS.style),
        surface: pick(p.surface, ["any", "trail", "paved"], DEFAULT_PREFS.surface),
        elevation: pick(p.elevation, ["any", "flat"], DEFAULT_PREFS.elevation)
    };
}

/** Valhalla costing_options.pedestrian for the prefs. Lower factor = preferred. */
export function costingFor(prefs) {
    const p = readPrefs(prefs);
    const o = { use_hills: p.elevation === "flat" ? 0 : 0.5 };
    if (p.style === "sidewalk") { o.walkway_factor = 0.6; o.sidewalk_factor = 0.7; }
    else { o.walkway_factor = 1; o.sidewalk_factor = 1; }
    if (p.surface === "trail") { o.walkway_factor = 0.4; o.use_tracks = 1; }
    if (p.surface === "paved") { o.use_tracks = 0; o.sidewalk_factor = Math.min(o.sidewalk_factor, 0.6); }
    return o;
}

/** The classes the optimiser shifts waypoints toward. */
export function shiftTargets(prefs) {
    const p = readPrefs(prefs);
    if (p.surface === "trail") return ["A"];
    if (p.surface === "paved") return ["B"];
    return ["A", "B"];
}

export function prefsWords(prefs) {
    const p = readPrefs(prefs);
    return [
        p.style === "sidewalk" ? "sidewalk-first" : "direct",
        { any: "any surface", trail: "prefer trails", paved: "prefer paved" }[p.surface],
        p.elevation === "flat" ? "avoid hills" : "hills as they come"
    ].join(" · ");
}
