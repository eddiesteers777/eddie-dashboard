/* ==========================================
   Southbound — saved routes (pure model + localStorage)

   One key per route: "route-<id>". The "route-" prefix is in cloud sync
   (js/cloudSync.js) and the sign-out lists (js/auth.js). A route is a
   NEW record: it never edits a plan, a fueling plan or any coach data.
   The line is thinned (<= 300 points) so the account's sync doc stays
   small; elevation is not stored, it is fetched again on export.
========================================== */

import { thinLine } from "./routeGeo.js";

export const ROUTE_PREFIX = "route-";
export const VIEW_KEY = "route-view"; // last map view; not a route
export const SETTINGS_KEY = "route-settings"; // pace + gel size; not a route

const round6 = n => Math.round(n * 1e6) / 1e6;

export function newRouteId(now = Date.now()) {
    return now.toString(36) + Math.random().toString(36).slice(2, 6);
}

export function makeRecord({ id, name, waypoints, coords, miles, loop, snapped, pace, gelG, prefs = null, fuel = null, surface = null, climb = null, now = Date.now(), createdAt = null }) {
    return {
        v: 1,
        id: id || newRouteId(now),
        name: String(name || "").trim().slice(0, 60) || "My route",
        createdAt: createdAt || now,
        updatedAt: now,
        miles: Math.round(miles * 100) / 100,
        loop: !!loop,
        snapped: snapped !== false,
        waypoints: waypoints.map(p => [round6(p[0]), round6(p[1])]),
        line: thinLine(coords, 300).map(p => [round6(p[0]), round6(p[1])]),
        pace: pace || null,
        gelG: gelG || null,
        prefs, // route options it was built with
        visibility: "private", // Southbound has no route sharing: always private
        fuel, // a "plan to review" snapshot: never an approved prescription
        surface, // { summary, ab, x } when it was checked
        climb // { lowFt, highFt } when fetched
    };
}

export function parseRecord(raw) {
    let r = raw;
    if (typeof raw === "string") { try { r = JSON.parse(raw); } catch { return null; } }
    if (!r || typeof r !== "object" || !r.id || !Array.isArray(r.waypoints) || !Array.isArray(r.line)) return null;
    return r;
}

export function isRouteKey(key) {
    return typeof key === "string" && key.startsWith(ROUTE_PREFIX) && key !== VIEW_KEY && key !== SETTINGS_KEY;
}

export function listRoutes(storage) {
    const out = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!isRouteKey(key)) continue;
        const r = parseRecord(storage.getItem(key));
        if (r) out.push(r);
    }
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export const saveRoute = (storage, record) => storage.setItem(ROUTE_PREFIX + record.id, JSON.stringify(record));
/** Cloud sync never carries a deleted key, so a delete leaves a marker the other devices can see. */
export const deleteRoute = (storage, id, now = Date.now()) => storage.setItem(ROUTE_PREFIX + id, JSON.stringify({ id, deleted: true, updatedAt: now }));
export const readRoute = (storage, id) => parseRecord(storage.getItem(ROUTE_PREFIX + id));
