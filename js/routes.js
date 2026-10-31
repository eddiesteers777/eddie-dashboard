/* ==========================================
   Southbound — Build a Route (routes.html)

   Tap the map to drop points, drag to move them, tap a point to remove
   it. Every change re-snaps the route (Valhalla, pedestrian), then
   re-scores the surfaces (Overpass) and fetches heights. Distance,
   time (at YOUR pace), climb (a range) and the fuel plan follow.
   The maths is in js/route*.js (tested); this file is the page.
========================================== */

import { toast, sbConfirm, friendlyError } from "./ui.js";
import { boundsOf, boxContains, isLoop, lineMiles, cumulativeMiles, bestInsertIndex, distanceMarkers, nearestIndex, reversePoints, outAndBack } from "./routeGeo.js";
import { scoreLine, scoreQuarters, xStretches, CLASS_WORDS } from "./routeScore.js";
import { fetchRoute, straightRoute, fetchHeights, fetchMapData, searchPlaces } from "./routeApi.js";
import { routeFacts, scoreRoute, withGeometry, saferTime, safetyCosting, avoidBoxes, costText, crossingLines, headlineText, worstText, riskText, whyText, bandFor, BANDS, UNKNOWN, SAFETY_NOTE, RUSH_NOTE, UNKNOWN_NOTE } from "./routeSafety.js";
import { drawSafetyStrip, legendHtml, darkBand } from "./routeSafetyStrip.js";
import { sunTimes, lightAt, clockText } from "./routeSun.js";
import { climbRange, CLIMB_NOTE, profileSeries } from "./routeElevation.js";
import { readPrefs, costingFor, shiftTargets, prefsWords } from "./routePrefs.js";
import { drawProfile } from "./routeProfile.js";
import { fuelPlan, fuelLines, DEFAULT_PACE, DEFAULT_GEL_G } from "./routeFuel.js";
import { explain } from "./routeExplain.js";
import { generateLoop, LOOP_MAX_ATTEMPTS } from "./routeLoop.js";
import { optimise } from "./routeOptimise.js";
import { buildGpx, gpxFileName } from "./routeGpx.js";
import { makeRecord, listRoutes, saveRoute, deleteRoute, VIEW_KEY, SETTINGS_KEY } from "./routeStore.js";
import { ENTER_AT } from "./routeGlobe.js";
import { readSettings, settingsRecord, sidewalkFirst, LAYER_KEYS } from "./routeSettings.js";
import { calculateTargets, parsePace, formatPace } from "./fuelTargets.js";
import { readProfile, sessionFromProfile, PROFILE_KEY } from "./fuelProfile.js";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = (() => { try { return window.localStorage; } catch { return null; } })();
const read = key => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
const write = (key, value) => { try { store.setItem(key, JSON.stringify(value)); } catch { /* private window: fine */ } };

const CALERA = [33.101, -86.755];
const CLASS_COLORS = { A: "#3f8f5a", B: "#8fb36a", C: "#9aa39a", D: "#c9ad84", X: "#c4533f" };

const S = {
    waypoints: [], closed: false,
    coords: [], miles: 0, snapped: true,
    ways: [], waysBox: null,
    score: null, quarters: [], stretches: [],
    heights: null, heightsFor: null, climb: null, heightsFailed: false,
    pace: DEFAULT_PACE, gelG: DEFAULT_GEL_G,
    fuel: null, editingId: null, createdAt: null,
    prefs: readPrefs(null), history: [],
    globeOpen: false,
    // safety rating
    safetyData: null, facts: null, safe: null, safer: null, sel: -1, safeOn: false,
    runAt: 0, opts: { avoidBusy: false, preferLit: false, shortest: false }, avoid: [],
    safeBefore: null, costLine: "", avoidNote: "", compare: null, home: null,
    revert: null, token: 0, settleTimer: null, surfaceError: "", routeError: "", loopNote: ""
};

/* ---------- saved settings ---------- */
/* One record per account ("route-settings": synced, cleared on sign-out). js/routeSettings.js */
const saved = readSettings(read(SETTINGS_KEY));
if (saved.pace && parsePace(saved.pace)) S.pace = parsePace(saved.pace);
if (saved.gelG) S.gelG = saved.gelG;
S.prefs = saved.prefs;
S.layers = saved.layers;
S.opts = { ...saved.opts, shortest: false };
function saveSettings() {
    write(SETTINGS_KEY, settingsRecord({ pace: formatPace(S.pace), gelG: S.gelG, prefs: S.prefs, layers: S.layers, opts: S.opts }));
}
$("rbPace").value = formatPace(S.pace);
$("rbGel").value = S.gelG;

/* ---------- map ---------- */
const view = read(VIEW_KEY);
const map = L.map("rbMap", { zoomControl: true, attributionControl: true, zoomSnap: 0.5, minZoom: 2, worldCopyJump: true })
    .setView(view && Array.isArray(view.c) ? view.c : CALERA, view && view.z ? view.z : 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
const overlay = L.layerGroup().addTo(map);
const gapLayer = L.layerGroup().addTo(map);
const lineLayer = L.layerGroup().addTo(map);
const safetyLayer = L.layerGroup().addTo(map);
const selLayer = L.layerGroup().addTo(map);
const extraLayer = L.layerGroup().addTo(map); // shortest vs safest, ways home
const mileLayer = L.layerGroup().addTo(map);
const hoverLayer = L.layerGroup().addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const canvas = L.canvas({ padding: 0.3 });
let markers = [];
let dotsOn = true;

map.on("moveend", () => { const c = map.getCenter(); write(VIEW_KEY, { c: [c.lat, c.lng], z: map.getZoom() }); });

function pinIcon(i, total) {
    const role = i === 0 ? "start" : (i === total - 1 && !S.closed ? "end" : "mid");
    return L.divIcon({ className: "rb-pin-wrap", html: `<span class="rb-pin rb-pin-${role}">${i + 1}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] });
}

function drawMarkers() {
    markerLayer.clearLayers();
    markers = S.waypoints.map((p, i) => {
        const m = L.marker(p, { draggable: true, icon: pinIcon(i, S.waypoints.length), keyboard: true, title: `Point ${i + 1}. Drag to move, tap to remove.` });
        m.on("dragstart", () => remember());
        m.on("dragend", () => { const ll = m.getLatLng(); S.waypoints[i] = [ll.lat, ll.lng]; edited(); });
        m.on("click", () => removePoint(markers.indexOf(m)));
        m.on("contextmenu", e => { L.DomEvent.preventDefault(e.originalEvent); removePoint(markers.indexOf(m)); });
        m.addTo(markerLayer);
        return m;
    });
}

function drawLine() {
    lineLayer.clearLayers();
    if (S.coords.length < 2) return;
    if (S.snapped) {
        L.polyline(S.coords, { color: "#ffffff", weight: 9, opacity: 0.9, interactive: false }).addTo(lineLayer);
        L.polyline(S.coords, { color: "#1b4d36", weight: 5, opacity: 1, interactive: false }).addTo(lineLayer);
    } else {
        L.polyline(S.coords, { color: "#d4aa62", weight: 5, dashArray: "8 8", interactive: false }).addTo(lineLayer);
    }
    // A wide, invisible copy of the line takes the press that drags a new point out of it.
    const hit = L.polyline(S.coords, { color: "#000", opacity: 0, weight: 26, interactive: true, bubblingMouseEvents: false, className: "rb-hitline" }).addTo(lineLayer);
    const hitEl = hit.getElement();
    if (hitEl) hitEl.addEventListener("pointerdown", startLineDrag);
    mileLayer.clearLayers();
    for (const m of S.layers.markers ? distanceMarkers(S.coords, 1) : []) {
        L.marker(m.at, { interactive: false, keyboard: false, icon: L.divIcon({ className: "rb-mile-wrap", html: `<span class="rb-mile">${m.n}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(mileLayer);
    }
    gapLayer.clearLayers();
    for (const st of S.safeOn || !S.layers.surface ? [] : S.stretches) {
        L.polyline(st.coords, { color: CLASS_COLORS.X, weight: 7, opacity: 0.95, interactive: true })
            .bindTooltip(st.name ? `Major road: ${st.name}` : "Major road", { sticky: true }).addTo(gapLayer);
    }
}

function drawOverlay() {
    overlay.clearLayers();
    if (!dotsOn || S.safeOn || !S.layers.surface) return; // the Safe Map reads best without the path dots
    const style = { A: { weight: 3, dashArray: "2 6" }, B: { weight: 3, dashArray: "8 4" }, C: { weight: 2 }, D: { weight: 2 }, X: { weight: 3 } };
    for (const w of S.ways) {
        if (w.cat === "C" || w.cat === "D") continue; // the map stays readable: only the paths and the hazards
        L.polyline(w.coords, { color: CLASS_COLORS[w.cat], opacity: 0.9, interactive: false, renderer: canvas, ...style[w.cat] }).addTo(overlay);
    }
}

/* ---------- drag the line to add a point ---------- */
let ghost = null;
function startLineDrag(e) {
    if (S.waypoints.length < 2 || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.stopPropagation(); e.preventDefault();
    const start = map.mouseEventToLatLng(e);
    map.dragging.disable();
    ghost = L.marker(start, { interactive: false, icon: L.divIcon({ className: "rb-pin-wrap", html: '<span class="rb-pin rb-pin-new">+</span>', iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(markerLayer);
    let last = start, moved = false;
    const x0 = e.clientX, y0 = e.clientY;
    const move = ev => { last = map.mouseEventToLatLng(ev); ghost.setLatLng(last); if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) moved = true; };
    const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        map.dragging.enable();
        quietUntil = Date.now() + 400;
        if (ghost) { markerLayer.removeLayer(ghost); ghost = null; }
        const p = [last.lat, last.lng];
        if (!moved && S.safeOn && S.safe) { selectSeg(segAt(p), { fromMap: true }); return; } // a tap on the Safe Map explains
        remember();
        S.waypoints.splice(bestInsertIndex(S.waypoints, p, S.closed), 0, p);
        edited();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
}

/* ---------- busy / hint / notes ---------- */
function busy(text) { const el = $("rbBusy"); el.hidden = !text; el.textContent = text || ""; }
function hint() {
    const n = S.waypoints.length;
    $("rbHint").hidden = n >= 2 || S.globeOpen;
    $("rbHint").textContent = n === 0 ? "Tap the map to drop your start." : "Tap again to add the next point.";
}
/* One note under the stats: a routing failure first, then a surface-data failure (with Try again), then the loop remark. */
function updateNote() {
    const el = $("rbNote");
    const text = S.routeError || S.surfaceError || S.loopNote;
    el.hidden = !text;
    const retry = !S.routeError && !!S.surfaceError;
    el.innerHTML = esc(text || "") + (retry ? ' <button type="button" class="rb-retry" id="rbRetry">Try again</button>' : "");
    const b = $("rbRetry");
    if (b) b.onclick = () => { S.surfaceError = ""; updateNote(); settle(true); };
}

/* ---------- editing ---------- */
function clearDerived() {
    S.score = null; S.quarters = []; S.stretches = []; S.heights = null; S.heightsFor = null; S.climb = null; S.heightsFailed = false; S.surfaceError = ""; S.routeError = ""; S.loopNote = "";
    S.revert = null; $("rbRevert").hidden = true; $("rbOptimiseOut").textContent = "";
    S.facts = null; S.safe = null; S.safer = null; S.sel = -1; S.compare = null; S.home = null; S.avoidNote = "";
    if (!S.safeBefore) S.costLine = "";
    selLayer.clearLayers(); extraLayer.clearLayers();
}

/* Undo: every change to the points pushes the state before it. */
function remember() {
    S.history.push({ waypoints: S.waypoints.map(p => p.slice()), closed: S.closed });
    if (S.history.length > 50) S.history.shift();
}

function edited() {
    clearDerived();
    drawMarkers(); hint(); buttons();
    reroute();
}

function addPoint(latlng) {
    remember();
    S.waypoints.push([latlng.lat, latlng.lng]);
    edited();
}

function removePoint(i) {
    if (i < 0) return;
    remember();
    S.waypoints.splice(i, 1);
    edited();
    toast("Point removed.", { type: "info", action: { label: "Undo", onClick: undo } });
}

let quietUntil = 0; // the click that ends a line drag must not also add a point
map.on("click", e => { if (Date.now() < quietUntil) return; addPoint(e.latlng); });

function undo() {
    const prev = S.history.pop();
    if (!prev) return;
    S.waypoints = prev.waypoints; setModeUi(prev.closed);
    edited();
}
$("rbUndo").onclick = undo;
$("rbReverse").onclick = () => {
    if (S.waypoints.length < 2) return;
    remember(); S.waypoints = reversePoints(S.waypoints, S.closed); edited();
    toast("Route reversed.", { type: "info" });
};
$("rbOutBack").onclick = () => {
    if (S.waypoints.length < 2 || S.closed) return;
    remember(); S.waypoints = outAndBack(S.waypoints); edited();
    toast("Out and back: same way home.", { type: "info", action: { label: "Undo", onClick: undo } });
};
$("rbClear").onclick = async () => {
    if (S.waypoints.length > 2 && !(await sbConfirm("Clear every point on this route?", { confirmLabel: "Clear", danger: true }))) return;
    remember();
    S.waypoints = []; S.editingId = null; S.createdAt = null; $("rbName").value = "";
    edited();
};
$("rbDots").onclick = () => {
    dotsOn = !dotsOn;
    $("rbDots").setAttribute("aria-pressed", String(dotsOn));
    $("rbDots").textContent = `Paths: ${dotsOn ? "on" : "off"}`;
    drawOverlay();
};
$("rbLocate").onclick = () => {
    if (!navigator.geolocation) { toast("This browser can't find your location.", { type: "info" }); return; }
    navigator.geolocation.getCurrentPosition(
        pos => map.setView([pos.coords.latitude, pos.coords.longitude], 16),
        () => toast("Couldn't get your location. Allow location for this site, or pan the map yourself.", { type: "info" }),
        { enableHighAccuracy: true, timeout: 10000 }
    );
};
$("rbCentre").onclick = () => addPoint(map.getCenter());

function setMode(loop) {
    if (loop !== S.closed) remember();
    setModeUi(loop);
    if (S.waypoints.length >= 2) edited(); else drawMarkers();
}
$("rbModeP2P").onclick = () => setMode(false);
$("rbModeLoop").onclick = () => setMode(true);

function buttons() {
    const n = S.waypoints.length, has = S.coords.length >= 2;
    $("rbUndo").disabled = S.history.length === 0;
    $("rbReverse").disabled = n < 2;
    $("rbOutBack").disabled = n < 2 || S.closed;
    $("rbClear").disabled = n === 0;
    $("rbSave").disabled = !has;
    $("rbGpx").disabled = !has;
    $("rbOptimise").disabled = !has || !S.ways.length;
}

/* ---------- routing ---------- */
async function reroute() {
    const my = ++S.token;
    clearTimeout(S.settleTimer);
    if (S.waypoints.length < 2) {
        S.coords = []; S.miles = 0; S.snapped = true;
        drawLine(); gapLayer.clearLayers(); mileLayer.clearLayers(); render(); busy(""); updateNote();
        return;
    }
    const locs = S.closed ? [...S.waypoints, S.waypoints[0]] : S.waypoints.slice();
    busy("Snapping the route to paths…");
    let result;
    try {
        try { result = await fetchRoute(locs, routeCosting(), avoidFor(locs)); }
        catch (err) {
            if (!avoidFor(locs)) throw err;
            result = await fetchRoute(locs, routeCosting()); // no way around: keep the route, and say so
            S.avoidNote = "No way around the busy roads between your points, so the route still uses them.";
        }
        S.routeError = "";
    } catch (err) {
        console.warn("Route builder: routing failed", err);
        result = straightRoute(locs);
        S.routeError = "The routing service isn't reachable. Showing straight lines between your points. This is NOT a snapped route, and the distance is straight-line only.";
    }
    if (my !== S.token) return; // a newer edit won
    S.coords = result.coords; S.miles = result.miles || lineMiles(result.coords); S.snapped = result.snapped;
    drawLine(); render(); buttons(); updateNote();
    busy("");
    S.settleTimer = setTimeout(() => settle(false), 700);
}

/* Surfaces and heights for the route as it is now. */
async function settle(force) {
    if (S.coords.length < 2) return;
    const my = S.token;
    const coords = S.coords;
    const needed = boundsOf(coords, 0.004);
    const surfaces = (async () => {
        if (!S.snapped) return;
        if (force || !boxContains(S.waysBox, needed)) {
            busy("Checking surfaces…");
            try {
                const box = boundsOf(coords, 0.01);
                const data = await fetchMapData(box);
                if (my !== S.token) return;
                S.ways = data.ways; S.safetyData = data.safety; S.waysBox = box; S.surfaceError = "";
                drawOverlay();
            } catch (err) {
                console.warn("Route builder: map data failed", err);
                if (my === S.token) S.surfaceError = "Couldn't load path and sidewalk data (the free map service may be busy).";
                return;
            }
        }
        if (my !== S.token) return;
        S.score = scoreLine(coords, S.ways);
        S.quarters = scoreQuarters(coords, S.ways);
        S.stretches = S.score ? xStretches(coords, S.ways) : [];
        computeSafety();
        drawLine();
    })();
    const heights = (async () => {
        if (!S.snapped) return;
        try {
            const h = await fetchHeights(coords);
            if (my !== S.token) return;
            S.heights = h; S.heightsFor = coords; S.climb = climbRange(h); S.heightsFailed = false;
        } catch (err) {
            console.warn("Route builder: heights failed", err);
            if (my === S.token) S.heightsFailed = true;
        }
    })();
    await Promise.all([surfaces, heights]);
    if (my !== S.token) return;
    busy("");
    render(); buttons(); updateNote();
}

/* ---------- loop ---------- */
$("rbMakeLoop").onclick = async () => {
    const target = parseFloat($("rbLoopMiles").value);
    if (!(target >= 0.5 && target <= 20)) { toast("Pick a loop length between 0.5 and 20 miles.", { type: "info" }); return; }
    const start = S.waypoints[0] || (() => { const c = map.getCenter(); return [c.lat, c.lng]; })();
    $("rbMakeLoop").disabled = true;
    try {
        const out = await generateLoop({
            start, targetMiles: target, route: locs => fetchRoute(locs, routeCosting()),
            onAttempt: (a, n) => busy(`Trying a loop: ${n} of ${LOOP_MAX_ATTEMPTS} (${a.miles.toFixed(1)} mi)…`)
        });
        remember();
        clearDerived();
        S.token++;
        S.waypoints = [start, ...out.best.points]; S.closed = true;
        S.coords = out.best.result.coords; S.miles = out.best.result.miles; S.snapped = true;
        setModeUi(true);
        drawMarkers(); drawLine(); hint(); render(); buttons(); busy("");
        map.fitBounds(L.latLngBounds(S.coords), { padding: [30, 30] });
        const off = Math.round(out.best.err * 100);
        S.loopNote = out.withinTarget ? "" : `Closest loop found: ${S.miles.toFixed(2)} mi, ${off}% from ${target} mi. Drag a point to adjust.`;
        updateNote();
        toast(out.withinTarget ? `Loop made: ${S.miles.toFixed(2)} mi.` : `Closest loop: ${S.miles.toFixed(2)} mi.`, { type: out.withinTarget ? "success" : "info" });
        S.settleTimer = setTimeout(() => settle(false), 300);
    } catch (err) {
        busy("");
        toast("Couldn't build a loop: the routing service isn't reachable. No loop was made.", { type: "error" });
        console.warn("Route builder: loop failed", err);
    } finally { $("rbMakeLoop").disabled = false; }
};
function setModeUi(loop) {
    S.closed = loop;
    $("rbModeLoop").classList.toggle("is-on", loop); $("rbModeLoop").setAttribute("aria-pressed", String(loop));
    $("rbModeP2P").classList.toggle("is-on", !loop); $("rbModeP2P").setAttribute("aria-pressed", String(!loop));
    $("rbLoopBar").hidden = !loop;
}

/* ---------- sidewalk-first ---------- */
const pct = n => `${n}%`;
$("rbOptimise").onclick = async () => {
    if (!S.ways.length || S.coords.length < 2) return;
    $("rbOptimise").disabled = true; busy("Looking for sidewalks and trails nearby…");
    const my = S.token;
    try {
        const out = await optimise({ waypoints: S.waypoints, coords: S.coords, miles: S.miles, ways: S.ways, route: locs => fetchRoute(locs, routeCosting(), avoidFor(locs)), targets: shiftTargets(S.prefs) });
        if (my !== S.token) return;
        const el = $("rbOptimiseOut");
        if (out.status === "none") {
            el.textContent = out.why === "no-path-nearby" ? "No path or sidewalk of the kind you prefer within 0.1 mi of your points, so nothing to shift. Your route stays as it is." : "Couldn't score this route yet.";
        } else {
            const b = out.before, a = out.after;
            const grew = b.miles ? Math.round(100 * (a.miles - b.miles) / b.miles) : 0;
            const nums = `Path + sidewalk ${pct(b.ab)} → ${pct(a.ab)}, major road ${pct(b.x)} → ${pct(a.x)}, distance ${b.miles.toFixed(2)} → ${a.miles.toFixed(2)} mi (${grew >= 0 ? "+" : ""}${grew}%).`;
            if (out.status === "kept") {
                S.revert = { waypoints: S.waypoints.map(p => p.slice()), coords: S.coords, miles: S.miles };
                remember();
                S.waypoints = out.waypoints; S.coords = out.result.coords; S.miles = out.result.miles;
                S.score = null; S.quarters = []; S.stretches = []; S.heights = null; S.heightsFor = null; S.climb = null;
                drawMarkers(); drawLine(); render();
                $("rbRevert").hidden = false;
                el.textContent = `Kept. ${nums}`;
                S.settleTimer = setTimeout(() => settle(false), 200);
            } else {
                el.textContent = `Not kept: it needs +5 points of path and sidewalk, no more than 25% extra distance, and no more major road. ${nums} Your route stays as it is.`;
            }
        }
    } catch (err) {
        console.warn("Route builder: optimiser failed", err);
        $("rbOptimiseOut").textContent = "Couldn't reach the routing service. Your route stays as it is.";
    } finally { busy(""); buttons(); }
};
$("rbRevert").onclick = () => {
    if (!S.revert) return;
    const r = S.revert;
    clearDerived();
    S.token++;
    S.waypoints = r.waypoints; S.coords = r.coords; S.miles = r.miles;
    drawMarkers(); drawLine(); render(); buttons();
    $("rbOptimiseOut").textContent = "Back to your route.";
    S.settleTimer = setTimeout(() => settle(false), 200);
};

/* ---------- fuel ---------- */
function calculatorFor(durationMin) {
    try {
        const { values } = sessionFromProfile(readProfile(store.getItem(PROFILE_KEY)));
        const t = calculateTargets({ ...values, duration: durationMin, mode: "training", workoutType: "long" });
        return { carbsPerHour: t.carbsPerHour, fluidLPerHour: t.fluidPerHour * 0.0295735 };
    } catch { return null; }
}

function readFuelInputs() {
    const pace = parsePace($("rbPace").value);
    const gel = Number($("rbGel").value);
    if (pace && pace >= 4 && pace <= 20) S.pace = pace;
    if (gel >= 10 && gel <= 50) S.gelG = gel;
    saveSettings();
}
$("rbPace").addEventListener("change", () => { readFuelInputs(); $("rbPace").value = formatPace(S.pace); render(); });
$("rbGel").addEventListener("change", () => { readFuelInputs(); render(); });

/* ---------- render ---------- */
const clock = min => { const h = Math.floor(min / 60), r = Math.round(min % 60); return h ? `${h} h ${String(r).padStart(2, "0")}` : `${r} min`; };

function render() {
    const has = S.coords.length >= 2;
    $("rbDist").textContent = has ? `${S.miles.toFixed(2)} mi` : "—";
    $("rbTime").textContent = has ? clock(S.miles * S.pace) : "—";
    $("rbClimb").textContent = !has ? "—" : S.climb ? S.climb.text.replace("about ", "") : (S.heightsFailed ? "n/a" : "…");
    $("rbClimb").title = S.climb ? CLIMB_NOTE : "";
    $("rbLoss").textContent = !has ? "—" : S.climb ? S.climb.downText.replace("about ", "") : (S.heightsFailed ? "n/a" : "…");
    $("rbX").textContent = S.score ? `${S.score.pcts.X}%` : (has && S.surfaceError ? "n/a" : (has ? "…" : "—"));
    $("rbAB").textContent = S.score ? `${S.score.ab}%` : (has && S.surfaceError ? "n/a" : (has ? "…" : "—"));

    // surface bar
    const sf = $("rbSurface");
    sf.hidden = !S.score || !S.layers.surface;
    if (S.score) {
        const p = S.score.pcts;
        $("rbBar").innerHTML = ["A", "B", "C", "D", "X"].filter(k => p[k]).map(k => `<span class="rb-seg rb-seg-${k}" style="width:${p[k]}%"></span>`).join("");
        $("rbBar").setAttribute("aria-label", `Surface split: ${S.score.summary}`);
        $("rbLegend").innerHTML = ["A", "B", "C", "D", "X"].filter(k => p[k]).map(k => `<li><i class="rb-dot rb-seg-${k}"></i>${esc(CLASS_WORDS[k])} ${p[k]}%</li>`).join("");
    }

    // explainer
    const ex = $("rbExplain");
    if (!has) ex.innerHTML = '<li class="rb-empty">Drop two points to see the route explained.</li>';
    else {
        const out = explain({ miles: S.miles, loop: S.closed || isLoop(S.coords), points: S.coords.length, climb: S.climb, overall: S.score, quarters: S.quarters });
        const lines = out.lines.slice();
        if (!S.snapped) lines.unshift("Not snapped: straight lines between your points.");
        if (!sidewalkFirst(S.prefs)) lines.unshift("Direct routing: sidewalk-first is off in Settings, so the route isn't steered to sidewalks and paths.");
        if (S.safe && S.layers.safe) lines.push(...crossingLines(S.safe.crossings).map(l => "Busy-road crossing, " + l.charAt(0).toLowerCase() + l.slice(1)));
        ex.innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join("");
    }

    // fuel
    S.fuel = null;
    const fl = $("rbFuel"), warn = $("rbFuelWarn");
    if (!has) { fl.innerHTML = '<li class="rb-empty">Fuel shows up once the route has a distance.</li>'; warn.hidden = true; renderProfile(); return; }
    const duration = S.miles * S.pace;
    const plan = fuelPlan({ miles: S.miles, pace: S.pace, gelG: S.gelG, calculator: calculatorFor(Math.round(duration)) });
    S.fuel = plan;
    fl.innerHTML = fuelLines(plan).map((l, i, all) => `<li${i === all.length - 1 ? ' class="rb-small"' : ""}>${esc(l)}</li>`).join("");
    warn.hidden = !plan.coachCheck;
    warn.textContent = plan.coachCheck ? "Over 150 minutes. Have your coach check this fuel plan before you use it." : "";
    renderProfile();
}

/* ---------- elevation profile with the gel windows on it ---------- */
const hoverDot = L.circleMarker([0, 0], { radius: 7, color: "#fff", weight: 2, fillColor: "#1b4d36", fillOpacity: 1, interactive: false });
function renderProfile() {
    const el = $("rbProfile"), noteEl = $("rbProfileNote");
    const ok = S.coords.length >= 2 && S.heights && S.heightsFor === S.coords && S.heights.length === S.coords.length;
    const series = ok ? profileSeries(cumulativeMiles(S.coords), S.heights) : [];
    const fuel = S.layers.fuel ? S.fuel : null; // fuel off in Settings: no gel windows on the profile either
    noteEl.textContent = series.length ? (fuel && fuel.windows.length ? "Shaded: gel windows at your pace." : (fuel && fuel.band.id === "water" ? "Under an hour: water only, no gels." : "")) :
        (S.coords.length < 2 ? "Appears once the route has heights." : S.heightsFailed ? "Heights unavailable right now." : (S.snapped ? "Loading heights…" : "Needs a snapped route."));
    drawProfile(el, series, fuel ? fuel.windows : [], {
        onHover: pt => {
            if (!pt) { hoverLayer.clearLayers(); return; }
            hoverDot.setLatLng(S.coords[pt.i]);
            if (!hoverLayer.hasLayer(hoverDot)) hoverDot.addTo(hoverLayer);
        }
    });
}
let resizeTimer = null;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderProfile, 150); });

/* ---------- safety rating ---------- */
/* Traffic + infrastructure + light, from OSM tags (js/routeSafety.js). A planning estimate, never a guarantee. */
/* Prefer lit only steers the route when the planned run is after dark (any part of it). */
function runIsDark() {
    if (S.safe) return S.safe.segments.some(s => s.light !== "day");
    const p = startOf(S.coords), sun = sunTimes(S.runAt, p[0], p[1]);
    return lightAt(S.runAt, sun) !== "day" || lightAt(S.runAt + S.miles * S.pace * 60000, sun) !== "day";
}
function routeCosting() {
    const dark = S.forceDark != null ? S.forceDark : runIsDark();
    S.forceDark = null;
    S.litRouted = S.opts.preferLit && dark;
    return safetyCosting(costingFor(S.prefs), { ...S.opts, preferLit: S.litRouted });
}
/* The no-go boxes for "Avoid busy roads", minus any that hold a point you placed (the router can't start inside one). */
function avoidFor(locs) {
    if (!S.opts.avoidBusy || !S.avoid.length) return null;
    const pad = 0.0008;
    const boxes = S.avoid.filter(poly => !locs.some(p => p[1] > poly[0][0] - pad && p[1] < poly[1][0] + pad && p[0] > poly[0][1] - pad && p[0] < poly[2][1] + pad));
    return boxes.length ? boxes : null;
}
const startOf = coords => coords && coords.length ? coords[0] : (c => [c.lat, c.lng])(map.getCenter());
const at = coords => ({ startMs: S.runAt, pace: S.pace, lat: startOf(coords)[0], lon: startOf(coords)[1] });

function computeSafety() {
    S.facts = S.safetyData && S.snapped && S.coords.length >= 2 ? routeFacts(S.coords, S.safetyData) : null;
    rescore();
}
function rescore() {
    if (!S.facts || !S.facts.length) { S.safe = null; S.safer = null; renderSafety(); return; }
    const sc = scoreRoute(S.facts, at(S.coords));
    S.safe = { ...sc, segments: withGeometry(sc.segments, S.coords) };
    S.safer = saferTime(S.facts, at(S.coords));
    if (S.safeBefore) {
        S.costLine = `${S.safeBefore.label}: ${costText(S.safeBefore, { miles: S.miles, avg: S.safe.overall.avg })}.`;
        S.safeBefore = null;
    }
    if (S.sel >= S.safe.segments.length) S.sel = -1;
    renderSafety();
    autoSafetyPass();
}
/* The routing toggles are settings, so they apply to every route, not only the one they were switched on for:
   once a route is scored, "Avoid busy roads" re-routes around its busy stretches (once per set of points),
   and "Prefer lit" re-routes when the planned time crosses into or out of the dark. */
function autoSafetyPass() {
    if (!S.safe || S.coords.length < 2 || !S.snapped) return;
    const key = JSON.stringify([S.waypoints, S.closed]);
    if (S.opts.avoidBusy && S.avoidKey !== key) {
        S.avoidKey = key;
        const boxes = avoidBoxes(S.safe.segments, S.waypoints);
        if (boxes.length) {
            S.avoid = boxes.concat(S.avoid).slice(0, 30);
            setTimeout(() => rerouteForSafety("Avoiding busy roads"), 0);
            return;
        }
    }
    const dark = runIsDark();
    if (S.opts.preferLit && !!S.litRouted !== dark && S.litKey !== key + dark) {
        S.litKey = key + dark; S.forceDark = dark;
        setTimeout(() => rerouteForSafety(dark ? "Preferring lit streets (your run is after dark)" : "Daylight run: lighting no longer steers the route"), 0);
    }
}

/* Data for lines that may reach past the box we have (compare, ways home). */
async function ensureData(lines) {
    const pts = lines.flat().concat(S.coords);
    if (!pts.length) return;
    const needed = boundsOf(pts, 0.004);
    if (boxContains(S.waysBox, needed)) return;
    const box = boundsOf(pts, 0.01);
    const data = await fetchMapData(box);
    S.ways = data.ways; S.safetyData = data.safety; S.waysBox = box;
    drawOverlay();
    computeSafety();
}

const keyOf = s => s.unknown.length ? "?" : s.band.id;
const colorOf = k => k === "?" ? UNKNOWN.color : BANDS.find(b => b.id === k).color;
const keyHtml = k => `<span class="rb-key${k === "?" ? " is-unknown" : darkBand(k) ? " is-dark" : ""}"${k === "?" ? "" : ` style="background:${colorOf(k)}"`}>${k}</span>`;
const LIGHT_WORDS = { day: "daylight", dusk: "low light", night: "dark" };

/* Safe Map: each stretch in its colour, its own dash pattern on a dark casing, a letter on the longer
   stretches, and a grey hatch where the map data is missing. */
let hatchReady = false;
function ensureHatch(path) {
    if (hatchReady) return;
    const svg = path && path._path && path._path.ownerSVGElement;
    if (!svg) return;
    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = '<pattern id="rbm-U" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)"><rect width="10" height="10" fill="#ffffff"/><rect width="5" height="10" fill="#6d7378"/></pattern>';
    svg.insertBefore(defs, svg.firstChild);
    hatchReady = true;
}
function drawSafeMap() {
    safetyLayer.clearLayers();
    if (!S.safeOn || !S.safe) return;
    const runs = [];
    for (const s of S.safe.segments) {
        const k = keyOf(s), last = runs[runs.length - 1];
        if (last && last.k === k) { last.coords = last.coords.concat(s.coords.slice(1)); last.to = s.endMi; last.n++; }
        else runs.push({ k, coords: s.coords.slice(), from: s.startMi, to: s.endMi, n: 1 });
    }
    for (const r of runs) {
        L.polyline(r.coords, { color: "#16202a", weight: 12, opacity: 0.9, interactive: false, lineCap: "butt" }).addTo(safetyLayer); // dark casing: the dashes and the yellow read on light tiles
        const band = BANDS.find(b => b.id === r.k);
        const line = L.polyline(r.coords, r.k === "?" ? { color: "url(#rbm-U)", weight: 8, opacity: 1, interactive: false, lineCap: "butt" }
            : { color: band.color, weight: 8, opacity: 1, dashArray: band.dash, lineCap: "butt", interactive: false }).addTo(safetyLayer);
        ensureHatch(line);
    }
    const total = S.miles || 1;
    const minRun = runs.length <= 12 ? 0.05 : Math.max(0.15, total / 40);
    runs.filter(r => r.to - r.from >= minRun).slice(0, 40).forEach(r => {
        const mid = r.coords[Math.floor(r.coords.length / 2)];
        L.marker(mid, { interactive: false, keyboard: false, icon: L.divIcon({ className: "rb-safe-letter-wrap", html: `<span class="rb-safe-letter" style="border-color:${colorOf(r.k)}">${r.k}</span>`, iconSize: [30, 20], iconAnchor: [15, 10] }) }).addTo(safetyLayer);
    });
}

function segAt(p) {
    const idx = nearestIndex(S.coords, p);
    return Math.max(0, S.safe.segments.findIndex(s => idx >= s.i0 && idx <= s.i1));
}
let strip = { select() {} };
function selectSeg(i, { fromMap = false } = {}) {
    if (!S.safe || i < 0) return;
    S.sel = i;
    const s = S.safe.segments[i];
    selLayer.clearLayers();
    L.polyline(s.coords, { color: "#ffffff", weight: 16, opacity: 1, interactive: false }).addTo(selLayer);
    L.polyline(s.coords, { color: s.unknown.length ? UNKNOWN.color : s.band.color, weight: 10, opacity: 1, interactive: false }).addTo(selLayer);
    strip.select(i);
    renderWhy();
    if (fromMap) $("rbWhy").scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function renderWhy() {
    const el = $("rbWhy");
    const s = S.safe && S.sel >= 0 ? S.safe.segments[S.sel] : null;
    el.hidden = !s;
    if (!s) return;
    const reach = S.runAt + ((s.startMi + s.endMi) / 2) * S.pace * 60000;
    el.innerHTML = `<b>${keyHtml(keyOf(s))}Mile ${s.startMi.toFixed(1)}–${s.endMi.toFixed(1)}</b>
        <div>${esc(whyText(s))}.</div>
        <p class="rb-small">You reach it about ${esc(clockText(reach))} (${LIGHT_WORDS[s.light]}${s.rush ? ", rush hour" : ""}).${s.unknown.length ? " " + esc(UNKNOWN_NOTE) : ""}</p>`;
}

function renderSafety() {
    const has = !!S.safe;
    const route = S.coords.length >= 2;
    $("rbSafeMap").disabled = !has;
    $("rbSafeBar").hidden = !has;
    $("rbStripWrap").hidden = !has;
    $("rbCompare").disabled = !has;
    $("rbHome").disabled = !has || S.miles < 1;
    paintSwitches();
    renderWhen();
    $("rbSafeCost").textContent = [S.costLine, S.avoidNote].filter(Boolean).join(" ");
    $("rbSafeOpts").textContent = `Routing: sidewalk-first ${sidewalkFirst(S.prefs) ? "on" : "off"}, avoid busy roads ${S.opts.avoidBusy ? "on" : "off"}, prefer lit at night ${S.opts.preferLit ? "on" : "off"}. Change these in Settings.${S.costLine ? " " + S.costLine : ""}`;
    if (!S.layers.safe) { // switched off in Settings: nothing of it shows (the scores still steer "Avoid busy roads")
        $("rbSafeMap").disabled = true; $("rbSafeBar").hidden = true; $("rbStripWrap").hidden = true;
        safetyLayer.clearLayers(); selLayer.clearLayers(); extraLayer.clearLayers();
        return;
    }
    if (!has) {
        $("rbCrossings").innerHTML = `<li class="rb-empty">${route ? (S.surfaceError ? "Needs the map data (not loaded)." : (S.snapped ? "Checking…" : "Needs a snapped route.")) : "Shows once the route is checked."}</li>`;
        $("rbRushNote").hidden = true; $("rbSaferTime").hidden = true;
        $("rbWhy").hidden = true;
        drawSafeMap();
        return;
    }
    const o = S.safe.overall;
    const badge = $("rbSafeBadge");
    badge.textContent = o.band.id;
    badge.style.background = o.band.color;
    badge.classList.toggle("is-dark", darkBand(o.band.id));
    $("rbSafeHead").textContent = `Safety ${headlineText(o)}`;
    $("rbSafeRisk").textContent = riskText(o);
    $("rbSafeWorst").textContent = worstText(o);
    $("rbSafeUnknown").hidden = !o.pctUnknown;
    $("rbSafeUnknown").textContent = o.pctUnknown ? `${o.pctUnknown}% of the route has missing map data (hatched, scored as the worse case). ${UNKNOWN_NOTE}` : "";
    const rush = S.safe.segments.some(s => s.rush && s.busy);
    $("rbRushNote").hidden = !rush;
    $("rbRushNote").textContent = rush ? `${RUSH_NOTE} Busy roads are scored one step lower on weekdays 7–9 am and 4–6 pm.` : "";
    $("rbSaferTime").hidden = !(S.safer && S.safer.text);
    $("rbSaferTime").textContent = S.safer ? S.safer.text : "";
    const lines = crossingLines(S.safe.crossings);
    $("rbCrossings").innerHTML = lines.length ? lines.map(l => `<li>${esc(l)}</li>`).join("") : '<li class="rb-empty">No crossings of a busy road on this route.</li>';
    strip = drawSafetyStrip($("rbStrip"), S.safe.segments, S.safe.crossings, { selected: S.sel, onPick: i => selectSeg(i) });
    drawSafeMap();
    if (S.sel >= 0) selectSeg(S.sel); else { selLayer.clearLayers(); renderWhy(); }
    renderCompare(); renderHome();
}

/* ---------- when will you run this? ---------- */
const pad2 = n => String(n).padStart(2, "0");
function initWhen() {
    const now = new Date(Date.now() + 30 * 60000);
    now.setMinutes(now.getMinutes() < 30 ? 0 : 30, 0, 0);
    $("rbRunDate").value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    setSlot(now.getHours() * 2 + now.getMinutes() / 30);
}
function setSlot(slot) {
    $("rbRunTime").value = String(slot);
    $("rbRunClock").value = `${pad2(Math.floor(slot / 2))}:${slot % 2 ? "30" : "00"}`;
    readWhen();
}
function readWhen() {
    const [y, m, d] = ($("rbRunDate").value || "").split("-").map(Number);
    const [hh, mm] = ($("rbRunClock").value || "06:00").split(":").map(Number);
    const t = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).getTime();
    S.runAt = Number.isFinite(t) ? t : Date.now();
}
function renderWhen() {
    const p = startOf(S.coords);
    const light = lightAt(S.runAt, sunTimes(S.runAt, p[0], p[1]));
    const day = new Date(S.runAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const finish = S.coords.length >= 2 ? ` · finish about ${clockText(S.runAt + S.miles * S.pace * 60000)}` : "";
    $("rbRunWhen").textContent = `${day}, ${clockText(S.runAt)} start (${LIGHT_WORDS[light]})${finish}`;
    $("rbRunTime").setAttribute("aria-valuetext", `${clockText(S.runAt)}, ${LIGHT_WORDS[light]}`);
}
let whenFrame = 0;
const whenChanged = () => { cancelAnimationFrame(whenFrame); whenFrame = requestAnimationFrame(() => { if (S.facts) rescore(); else renderWhen(); }); };
$("rbRunTime").addEventListener("input", () => { const v = Number($("rbRunTime").value); $("rbRunClock").value = `${pad2(Math.floor(v / 2))}:${v % 2 ? "30" : "00"}`; readWhen(); whenChanged(); });
$("rbRunClock").addEventListener("change", () => { readWhen(); const d = new Date(S.runAt); $("rbRunTime").value = String(d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0)); whenChanged(); });
$("rbRunDate").addEventListener("change", () => { readWhen(); whenChanged(); });

/* ---------- Safe Map toggle, avoid busy roads, prefer lit ---------- */
$("rbSafeMap").onclick = () => {
    S.safeOn = !S.safeOn;
    $("rbSafeMap").setAttribute("aria-pressed", String(S.safeOn));
    drawLine(); drawOverlay(); drawSafeMap();
};
function paintSwitches() {
    $("rbAvoidBusy").setAttribute("aria-pressed", String(S.opts.avoidBusy));
    $("rbPreferLit").setAttribute("aria-pressed", String(S.opts.preferLit));
    $("rbSidewalkFirst").setAttribute("aria-pressed", String(sidewalkFirst(S.prefs)));
    document.querySelectorAll("#rbLayers [data-layer]").forEach(b => b.setAttribute("aria-pressed", String(!!S.layers[b.dataset.layer])));
}
function rerouteForSafety(label) {
    if (S.coords.length < 2) { paintSwitches(); return; }
    S.safeBefore = S.safe ? { label, miles: S.miles, avg: S.safe.overall.avg } : null;
    clearDerived(); renderSafety(); reroute();
}
$("rbAvoidBusy").onclick = () => {
    S.opts.avoidBusy = !S.opts.avoidBusy;
    S.opts.shortest = false;
    S.avoid = S.opts.avoidBusy && S.safe ? avoidBoxes(S.safe.segments, S.waypoints) : [];
    S.avoidKey = JSON.stringify([S.waypoints, S.closed]);
    saveSettings();
    rerouteForSafety(S.opts.avoidBusy ? (S.avoid.length ? "Avoiding busy roads" : "No busy stretches to avoid; sidewalks and paths weighted up") : "Busy roads allowed again");
};
$("rbPreferLit").onclick = () => {
    S.opts.preferLit = !S.opts.preferLit;
    saveSettings();
    if (!runIsDark()) { paintSwitches(); renderSafety(); toast(S.opts.preferLit ? "Prefer lit is on. It steers the route when your planned run is after dark." : "Prefer lit is off.", { type: "info" }); return; }
    rerouteForSafety(S.opts.preferLit ? "Preferring lit streets" : "Lighting no longer preferred");
};

$("rbSidewalkFirst").onclick = () => {
    S.prefs = readPrefs({ ...S.prefs, style: sidewalkFirst(S.prefs) ? "direct" : "sidewalk" });
    saveSettings(); paintPrefs(); paintSwitches(); applyLayers();
    if (S.waypoints.length >= 2) edited();
};
document.querySelectorAll("#rbLayers [data-layer]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.layer;
    S.layers = { ...S.layers, [k]: !S.layers[k] };
    saveSettings(); paintSwitches(); applyLayers();
}));
/* A layer switched off in Settings is gone (hidden, not greyed) from the map, the panels and My Routes.
   The route itself, distance, save and GPX never depend on it. */
function applyLayers() {
    const on = S.layers;
    if (!on.safe && S.safeOn) { S.safeOn = false; $("rbSafeMap").setAttribute("aria-pressed", "false"); }
    $("rbSafeMap").hidden = !on.safe;
    $("rbSafetyCard").hidden = !on.safe;
    $("rbFuelCard").hidden = !on.fuel;
    $("rbProfileWrap").hidden = !on.profile;
    $("rbGlobeBtn").hidden = !on.globe;
    if (!on.globe && S.globeOpen) { const c = map.getCenter(); leaveGlobe([c.lat, c.lng], 13); }
    $("rbAboutCard").hidden = !on.surface;
    $("rbAB").parentElement.hidden = !on.surface;
    $("rbX").parentElement.hidden = !on.surface;
    $("rbDots").hidden = !on.surface;
    $("rbOptimise").hidden = !sidewalkFirst(S.prefs);
    if (!sidewalkFirst(S.prefs)) $("rbRevert").hidden = true;
    drawLine(); drawOverlay(); render(); renderSafety(); refreshSaved();
}

/* ---------- shortest vs safest ---------- */
function summary(r, coords) {
    const facts = routeFacts(coords, S.safetyData);
    const sc = scoreRoute(facts, at(coords));
    return { ...r, overall: sc.overall, segments: withGeometry(sc.segments, coords), dark: sc.segments.some(s => s.light !== "day") };
}
$("rbCompare").onclick = async () => {
    if (!S.safe) return;
    const my = S.token;
    const locs = S.closed ? [...S.waypoints, S.waypoints[0]] : S.waypoints.slice();
    $("rbCompare").disabled = true;
    busy("Building the shortest and the safest route…");
    try {
        const base = costingFor(S.prefs);
        const short0 = await fetchRoute(locs, safetyCosting(base, { shortest: true }));
        await ensureData([short0.coords]);
        const short = summary(short0, short0.coords);
        const boxes = avoidBoxes(short.segments, S.waypoints).concat(avoidBoxes(S.safe.segments, S.waypoints)).slice(0, 30);
        const safeCost = safetyCosting(base, { avoidBusy: true, preferLit: short.dark });
        let safe0;
        try { safe0 = await fetchRoute(locs, safeCost, boxes.length ? boxes : null); }
        catch { safe0 = await fetchRoute(locs, safeCost); }
        await ensureData([short0.coords, safe0.coords]);
        if (my !== S.token) return;
        S.compare = { short: summary(short0, short0.coords), safe: { ...summary(safe0, safe0.coords), boxes, preferLit: short.dark } };
        renderCompare();
    } catch (err) {
        console.warn("Route builder: compare failed", err);
        $("rbCompareOut").hidden = false;
        $("rbCompareOut").innerHTML = '<p class="rb-small rb-compare-note">Couldn\'t reach the routing service. Nothing changed.</p>';
    } finally { busy(""); $("rbCompare").disabled = !S.safe; }
};
function renderCompare() {
    const out = $("rbCompareOut");
    const c = S.compare;
    extraLayer.eachLayer(l => { if (l.options && l.options.rbCompare) extraLayer.removeLayer(l); });
    out.hidden = !c;
    if (!c) return;
    const col = (key, title, r) => `<div class="rb-compare-col"><h3>${title}</h3>
        <span>${r.miles.toFixed(2)} mi</span>
        <strong>${keyHtml(r.overall.band.id)}${esc(headlineText(r.overall))}</strong>
        <span>${esc(worstText(r.overall))}</span>
        <span>${esc(riskText(r.overall))}${r.overall.pctUnknown ? ` · ${r.overall.pctUnknown}% unknown` : ""}</span>
        <button type="button" class="sb-btn sb-btn-secondary" data-use="${key}">Use ${key}</button></div>`;
    const same = Math.abs(c.short.miles - c.safe.miles) < 0.02 && c.short.overall.avg === c.safe.overall.avg;
    out.innerHTML = col("shortest", "Shortest", c.short) + col("safest", "Safest", c.safe) +
        `<p class="rb-small rb-compare-note">${same ? "The shortest route is already the safest one the map data allows." : `Safest vs shortest: ${esc(costText(c.short, { miles: c.safe.miles, avg: c.safe.overall.avg }))}.`} Dashed on the map: grey shortest, gold safest. ${esc(SAFETY_NOTE)}</p>`;
    L.polyline(c.short.coords, { color: "#5b6670", weight: 5, dashArray: "2 8", opacity: 0.95, interactive: false, rbCompare: true }).addTo(extraLayer);
    L.polyline(c.safe.coords, { color: "#d2ad62", weight: 5, dashArray: "10 8", opacity: 0.95, interactive: false, rbCompare: true }).addTo(extraLayer);
    out.querySelectorAll("[data-use]").forEach(b => b.onclick = () => useCompared(b.dataset.use));
}
function useCompared(which) {
    const c = S.compare;
    if (!c) return;
    const r = which === "shortest" ? c.short : c.safe;
    remember();
    S.opts = which === "shortest" ? { avoidBusy: false, preferLit: false, shortest: true } : { avoidBusy: true, preferLit: !!c.safe.preferLit, shortest: false };
    S.avoid = which === "shortest" ? [] : c.safe.boxes;
    S.avoidKey = JSON.stringify([S.waypoints, S.closed]);
    saveSettings();
    clearDerived(); S.token++;
    S.coords = r.coords; S.miles = r.miles; S.snapped = true;
    drawLine(); render(); buttons(); renderSafety();
    toast(which === "shortest" ? "Using the shortest route." : "Using the safest route. Avoid busy roads is on.", { type: "info", action: { label: "Undo", onClick: undo } });
    S.settleTimer = setTimeout(() => settle(false), 200);
}

/* ---------- ways home from each mile marker ---------- */
$("rbHome").onclick = async () => {
    if (!S.safe) return;
    const my = S.token;
    const marks = distanceMarkers(S.coords, 1).slice(0, 26);
    const start = S.coords[0];
    const dark = S.safe.segments.some(s => s.light !== "day");
    const cost = safetyCosting(costingFor(S.prefs), { avoidBusy: true, preferLit: dark });
    $("rbHome").disabled = true;
    const rows = [];
    try {
        for (const m of marks) {
            busy(`Finding the way home from mile ${m.n} of ${marks.length}…`);
            let r = null;
            try { r = await fetchRoute([m.at, start], cost, avoidFor([m.at, start])); }
            catch { try { r = await fetchRoute([m.at, start], cost); } catch { r = null; } }
            if (my !== S.token) return;
            rows.push({ n: m.n, at: m.at, r });
        }
        await ensureData(rows.filter(x => x.r).map(x => x.r.coords));
        if (my !== S.token) return;
        S.home = rows.map(x => {
            if (!x.r) return { n: x.n, failed: true };
            const facts = routeFacts(x.r.coords, S.safetyData);
            const sc = scoreRoute(facts, { startMs: S.runAt + x.n * S.pace * 60000, pace: S.pace, lat: x.at[0], lon: x.at[1] });
            return { n: x.n, coords: x.r.coords, miles: x.r.miles, overall: sc.overall };
        });
        S.homeSel = -1;
        renderHome();
    } finally { busy(""); $("rbHome").disabled = !S.safe || S.miles < 1; }
};
function renderHome() {
    const box = $("rbHomeOut");
    extraLayer.eachLayer(l => { if (l.options && l.options.rbHome) extraLayer.removeLayer(l); });
    box.hidden = !S.home;
    if (!S.home) return;
    $("rbHomeList").innerHTML = S.home.length ? S.home.map((h, i) => h.failed
        ? `<li><button type="button" disabled>Mile ${h.n}: no route found</button></li>`
        : `<li><button type="button" data-i="${i}" aria-pressed="${i === S.homeSel}">${keyHtml(h.overall.band.id)}Mile ${h.n} → start: ${h.miles.toFixed(1)} mi · safety ${h.overall.avg}${h.overall.pctUnknown ? ` · ${h.overall.pctUnknown}% unknown` : ""}</button></li>`).join("")
        : '<li class="rb-empty">The route is under a mile, so there are no mile markers yet.</li>';
    $("rbHomeList").querySelectorAll("button[data-i]").forEach(b => b.onclick = () => {
        S.homeSel = Number(b.dataset.i); renderHome();
        const h = S.home[S.homeSel];
        map.fitBounds(L.latLngBounds(h.coords.concat(S.coords)), { padding: [30, 30] });
    });
    const h = S.home[S.homeSel];
    if (h && h.coords) {
        L.polyline(h.coords, { color: "#ffffff", weight: 9, opacity: 0.9, interactive: false, rbHome: true }).addTo(extraLayer);
        L.polyline(h.coords, { color: h.overall.band.color, weight: 5, dashArray: "6 6", opacity: 1, interactive: false, rbHome: true }).addTo(extraLayer);
    }
}

/* ---------- route options ---------- */
function paintPrefs() {
    document.querySelectorAll("#rbPrefs [data-pref]").forEach(group => {
        const v = S.prefs[group.dataset.pref];
        group.querySelectorAll("button").forEach(b => { const on = b.dataset.v === v; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
    });
    $("rbPrefsWords").textContent = prefsWords(S.prefs).replace(/^direct/, "direct routing (sidewalk-first off)");
}
document.querySelectorAll("#rbPrefs [data-pref]").forEach(group => group.addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b || S.prefs[group.dataset.pref] === b.dataset.v) return;
    S.prefs = readPrefs({ ...S.prefs, [group.dataset.pref]: b.dataset.v });
    saveSettings();
    paintPrefs();
    if (S.waypoints.length >= 2) edited();
}));
/* On a phone the options are a sheet over everything (so it lives on <body>, above the tab bar);
   on a computer they are a panel over the left of the map. */
const phoneSheet = window.matchMedia("(max-width: 899px)");
function placePrefs() {
    const el = $("rbPrefs"), home = document.querySelector(".rb-mapwrap");
    const target = phoneSheet.matches ? document.body : home;
    if (el.parentElement !== target) target.appendChild(el);
}
placePrefs();
phoneSheet.addEventListener("change", placePrefs);
const setSheet = open => { $("rbPrefs").classList.toggle("is-open", open); document.documentElement.classList.toggle("rb-sheet-open", open && phoneSheet.matches); $("rbPrefsOpen").setAttribute("aria-expanded", String(open)); if (open) $("rbPrefs").querySelector("button:not([disabled])")?.focus(); };
$("rbPrefsOpen").onclick = () => setSheet(true);
$("rbPrefsClose").onclick = () => { setSheet(false); $("rbPrefsOpen").focus(); };
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("rbPrefs").classList.contains("is-open")) setSheet(false); });

/* ---------- search ---------- */
$("rbSearch").addEventListener("submit", async e => {
    e.preventDefault();
    const q = $("rbSearchInput").value.trim();
    const list = $("rbResults");
    if (q.length < 2) return;
    list.hidden = false;
    list.innerHTML = '<li class="rb-empty">Searching…</li>';
    try {
        const c = map.getCenter();
        const rows = await searchPlaces(q, [c.lat, c.lng]);
        if (!rows.length) { list.innerHTML = '<li class="rb-empty">No places found. Try a street and town.</li>'; return; }
        list.innerHTML = rows.map((r, i) => `<li class="rb-result" data-i="${i}"><span>${esc(r.name)}</span>
            <div class="rb-result-actions"><button type="button" class="sb-btn sb-btn-secondary" data-act="go">Go</button>
            <button type="button" class="sb-btn sb-btn-secondary" data-act="start">Start here</button>
            <button type="button" class="sb-btn sb-btn-secondary" data-act="add">Add point</button></div></li>`).join("");
        list.onclick = ev => {
            const btn = ev.target.closest("button[data-act]");
            if (!btn) return;
            const r = rows[Number(btn.closest("[data-i]").dataset.i)];
            if (S.globeOpen) leaveGlobe(r.at, 16); else map.setView(r.at, 16);
            if (btn.dataset.act === "start") { remember(); S.waypoints = [r.at.slice(), ...S.waypoints.slice(1)]; if (!S.waypoints.length) S.waypoints = [r.at.slice()]; edited(); }
            if (btn.dataset.act === "add") { remember(); S.waypoints.push(r.at.slice()); edited(); }
            list.hidden = true; list.innerHTML = "";
        };
    } catch (err) {
        console.warn("Route builder: search failed", err);
        list.innerHTML = '<li class="rb-empty">Search isn\'t reachable right now. Pan the map instead.</li>';
    }
});

/* ---------- globe ---------- */
let globeMod = null;
async function enterGlobe() {
    if (S.globeOpen) return;
    S.globeOpen = true;
    const c = map.getCenter();
    const g = $("rbGlobe");
    g.hidden = false; $("rbGlobeBack").hidden = false; $("rbHint").hidden = true;
    busy("Opening the globe…");
    try {
        globeMod = globeMod || await import("./routeGlobe.js");
        const opened = await globeMod.openGlobe(g, { center: [c.lat, c.lng], zoom: Math.min(map.getZoom(), ENTER_AT), line: S.coords, points: S.waypoints, onLeave: (center, z) => leaveGlobe(center, z) });
        S.globeMap = opened.map; // read by the browser checks
        g.classList.add("is-on");
    } catch (err) {
        console.warn("Route builder: globe failed", err);
        toast("The globe couldn't open on this device. The flat map still works.", { type: "info" });
        leaveGlobe([c.lat, c.lng], ENTER_AT + 1);
    } finally { busy(""); }
}
function leaveGlobe(center, zoom) {
    if (!S.globeOpen) return;
    S.globeOpen = false;
    const g = $("rbGlobe");
    g.classList.remove("is-on");
    $("rbGlobeBack").hidden = true;
    map.setView(center, zoom, { animate: false });
    setTimeout(() => { if (!S.globeOpen) { g.hidden = true; globeMod && globeMod.closeGlobe(); } }, 250);
    hint();
}
map.on("zoomend", () => { if (S.layers.globe && !S.globeOpen && map.getZoom() <= ENTER_AT - 0.5) enterGlobe(); });
$("rbGlobeBtn").onclick = () => enterGlobe();
$("rbGlobeBack").onclick = () => { const c = map.getCenter(); leaveGlobe([c.lat, c.lng], Math.max(map.getZoom(), 13)); };

/* ---------- save, open, export ---------- */
function refreshSaved() {
    const rows = listRoutes(store);
    $("rbSavedEmpty").hidden = rows.length > 0;
    $("rbSaved").innerHTML = rows.map(r => `
        <li class="rb-saved-row" data-id="${esc(r.id)}">
            <div class="rb-saved-main"><strong>${esc(r.name)}</strong>
            <span>${r.miles.toFixed(2)} mi · ${r.loop ? "loop" : "point to point"}${r.surface && S.layers.surface ? ` · ${r.surface.ab}% path + sidewalk` : ""}${r.safety && S.layers.safe ? ` · safety ${r.safety.avg} ${esc(r.safety.band)}` : ""}</span></div>
            <div class="rb-saved-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-open>Open</button>
                <button type="button" class="sb-btn sb-btn-tertiary" data-del aria-label="Delete ${esc(r.name)}">Delete</button>
            </div>
        </li>`).join("");
}

$("rbSave").onclick = () => {
    if (S.coords.length < 2) return;
    const name = $("rbName").value.trim();
    const rec = makeRecord({
        id: S.editingId, createdAt: S.createdAt, name, waypoints: S.waypoints, coords: S.coords, miles: S.miles,
        loop: S.closed, snapped: S.snapped, pace: S.pace, gelG: S.gelG, fuel: S.layers.fuel ? S.fuel : null, prefs: S.prefs,
        surface: S.score ? { summary: S.score.summary, ab: S.score.ab, x: S.score.pcts.X } : null,
        climb: S.climb ? { lowFt: S.climb.lowFt, highFt: S.climb.highFt } : null,
        safety: S.safe && S.layers.safe ? { avg: S.safe.overall.avg, band: S.safe.overall.band.id, pctRisk: S.safe.overall.pctRisk, pctUnknown: S.safe.overall.pctUnknown, at: S.runAt } : null
    });
    try {
        saveRoute(store, rec);
        S.editingId = rec.id; S.createdAt = rec.createdAt;
        $("rbName").value = rec.name;
        refreshSaved();
        toast(`Saved "${rec.name}".`);
    } catch (err) { toast(friendlyError(err, "save that route"), { type: "error" }); }
};

$("rbSaved").addEventListener("click", async e => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const rec = listRoutes(store).find(r => r.id === row.dataset.id);
    if (!rec) return;
    if (e.target.closest("[data-open]")) {
        clearDerived(); S.token++;
        S.waypoints = rec.waypoints.map(p => p.slice()); S.closed = !!rec.loop;
        S.coords = rec.line.map(p => p.slice()); S.miles = rec.miles; S.snapped = rec.snapped !== false;
        S.editingId = rec.id; S.createdAt = rec.createdAt; S.history = [];
        if (rec.prefs) { S.prefs = readPrefs({ ...rec.prefs, style: S.prefs.style }); paintPrefs(); } // sidewalk-first stays as set in Settings
        if (rec.pace) { S.pace = rec.pace; $("rbPace").value = formatPace(rec.pace); }
        if (rec.gelG) { S.gelG = rec.gelG; $("rbGel").value = rec.gelG; }
        $("rbName").value = rec.name;
        setModeUi(S.closed);
        drawMarkers(); drawLine(); hint(); render(); buttons();
        map.fitBounds(L.latLngBounds(S.coords), { padding: [30, 30] });
        S.settleTimer = setTimeout(() => settle(false), 300);
        document.getElementById("rbMap").scrollIntoView({ block: "center", behavior: "smooth" });
    } else if (e.target.closest("[data-del]")) {
        if (await sbConfirm(`Delete "${rec.name}"?`, { confirmLabel: "Delete", danger: true })) {
            deleteRoute(store, rec.id);
            if (S.editingId === rec.id) S.editingId = null;
            refreshSaved();
        }
    }
});

$("rbGpx").onclick = async () => {
    if (S.coords.length < 2) return;
    const out = $("rbGpxOut");
    out.textContent = "Getting heights for the file…";
    // Heights count only if they were fetched for this exact line.
    if (!(S.heights && S.heightsFor === S.coords)) {
        try {
            const my = S.coords;
            const h = await fetchHeights(my);
            if (my === S.coords) { S.heights = h; S.heightsFor = my; S.climb = climbRange(h); render(); }
        } catch (err) { console.warn("Route builder: heights for GPX failed", err); }
    }
    const withHeights = S.heights && S.heightsFor === S.coords && S.heights.length === S.coords.length;
    const name = $("rbName").value.trim() || "Southbound route";
    const gpx = buildGpx({ name, coords: S.coords, heightsM: withHeights ? S.heights : null, miles: S.miles, climbText: S.climb ? S.climb.text.replace("about ", "") : "" });
    const url = URL.createObjectURL(new Blob([gpx.text], { type: "application/gpx+xml" }));
    const a = document.createElement("a");
    a.href = url; a.download = gpxFileName(name);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    out.textContent = `Exported ${a.download}: ${gpx.points} points, ${S.miles.toFixed(2)} mi, ${gpx.hasEle ? "with elevation (the climb is a range, not exact)" : "no elevation (the height service wasn't reachable)"}.`;
};

/* ---------- start ---------- */
document.querySelectorAll("[data-safety-note]").forEach(el => { el.textContent = SAFETY_NOTE; });
$("rbSafeLegend").innerHTML = legendHtml();
initWhen();
paintSwitches();
refreshSaved(); paintPrefs(); hint(); render(); buttons(); renderSafety(); applyLayers();
window.__routeBuilder = S; S.map = map; // read by the browser checks
