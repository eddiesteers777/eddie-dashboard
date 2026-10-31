/* ==========================================
   Southbound — route builder settings (pure)

   One record, saved under "route-settings" like the pace and route
   options before it. That key starts with "route-", so it syncs to the
   signed-in account's own cloud copy (js/cloudSync.js) and is cleared
   from the device on sign-out or an account switch (js/auth.js): it
   follows the account, never the browser.

   Every layer is on by default, so a new user sees the whole builder.
   Anything missing or unreadable falls back to the default.
========================================== */

import { readPrefs } from "./routePrefs.js";

export const DEFAULT_LAYERS = Object.freeze({
    safe: true,     // Safe Map: safety colours, overall rating, strip, safety card
    fuel: true,     // fuel plan and the gel windows on the profile
    profile: true,  // elevation profile
    markers: true,  // mile markers on the map
    surface: true,  // surface split, path + sidewalk / major road, explainer
    globe: true     // the Globe button and zoom-out globe
});
export const LAYER_KEYS = Object.keys(DEFAULT_LAYERS);

export const DEFAULT_OPTS = Object.freeze({ avoidBusy: false, preferLit: false });

/** Raw stored value (object or JSON) -> { pace, gelG, prefs, layers, opts }. pace/gelG stay null when unset. */
export function readSettings(raw) {
    let r = raw;
    if (typeof raw === "string") { try { r = JSON.parse(raw); } catch { r = null; } }
    const p = r && typeof r === "object" ? r : {};
    const layers = {};
    for (const k of LAYER_KEYS) layers[k] = typeof (p.layers || {})[k] === "boolean" ? p.layers[k] : DEFAULT_LAYERS[k];
    const o = p.opts && typeof p.opts === "object" ? p.opts : {};
    return {
        pace: p.pace != null ? String(p.pace) : null,
        gelG: Number(p.gelG) >= 10 && Number(p.gelG) <= 50 ? Number(p.gelG) : null,
        prefs: readPrefs(p.prefs),
        layers,
        opts: { avoidBusy: o.avoidBusy === true, preferLit: o.preferLit === true }
    };
}

/** The record to store. Only known fields, so nothing else rides along. */
export function settingsRecord({ pace, gelG, prefs, layers, opts }) {
    const s = readSettings({ pace, gelG, prefs, layers, opts });
    return { pace: s.pace, gelG: s.gelG, prefs: s.prefs, layers: s.layers, opts: s.opts };
}

/** "Sidewalk-first" is the prefs' style: on = "sidewalk", off = "direct". */
export const sidewalkFirst = prefs => readPrefs(prefs).style === "sidewalk";
