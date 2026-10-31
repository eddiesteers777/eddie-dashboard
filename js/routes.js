/* ==========================================
   Southbound — Build a Route (routes.html)

   Tap the map to drop points, drag to move them, tap a point to remove
   it. Every change re-snaps the route (Valhalla, pedestrian), then
   re-scores the surfaces (Overpass) and fetches heights. Distance,
   time (at YOUR pace), climb (a range) and the fuel plan follow.
   The maths is in js/route*.js (tested); this file is the page.
========================================== */

import { toast, sbConfirm, friendlyError } from "./ui.js";
import { boundsOf, boxContains, isLoop, lineMiles } from "./routeGeo.js";
import { scoreLine, scoreQuarters, xStretches, CLASS_WORDS } from "./routeScore.js";
import { fetchRoute, straightRoute, fetchHeights, fetchWays } from "./routeApi.js";
import { climbRange, CLIMB_NOTE } from "./routeElevation.js";
import { fuelPlan, fuelLines, DEFAULT_PACE, DEFAULT_GEL_G } from "./routeFuel.js";
import { explain } from "./routeExplain.js";
import { generateLoop, LOOP_MAX_ATTEMPTS } from "./routeLoop.js";
import { optimise } from "./routeOptimise.js";
import { buildGpx, gpxFileName } from "./routeGpx.js";
import { makeRecord, listRoutes, saveRoute, deleteRoute, VIEW_KEY, SETTINGS_KEY } from "./routeStore.js";
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
    revert: null, token: 0, settleTimer: null, surfaceError: "", routeError: "", loopNote: ""
};

/* ---------- saved settings ---------- */
const saved = read(SETTINGS_KEY);
if (saved && parsePace(String(saved.pace))) S.pace = parsePace(String(saved.pace));
if (saved && saved.gelG >= 10 && saved.gelG <= 50) S.gelG = saved.gelG;
$("rbPace").value = formatPace(S.pace);
$("rbGel").value = S.gelG;

/* ---------- map ---------- */
const view = read(VIEW_KEY);
const map = L.map("rbMap", { zoomControl: true, attributionControl: true, zoomSnap: 0.5 })
    .setView(view && Array.isArray(view.c) ? view.c : CALERA, view && view.z ? view.z : 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
const overlay = L.layerGroup().addTo(map);
const gapLayer = L.layerGroup().addTo(map);
const lineLayer = L.layerGroup().addTo(map);
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
        m.on("dragend", () => { const ll = m.getLatLng(); S.waypoints[i] = [ll.lat, ll.lng]; edited(); });
        m.on("click", () => removePoint(markers.indexOf(m)));
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
    gapLayer.clearLayers();
    for (const st of S.stretches) {
        L.polyline(st.coords, { color: CLASS_COLORS.X, weight: 7, opacity: 0.95, interactive: true })
            .bindTooltip(st.name ? `Major road: ${st.name}` : "Major road", { sticky: true }).addTo(gapLayer);
    }
}

function drawOverlay() {
    overlay.clearLayers();
    if (!dotsOn) return;
    const style = { A: { weight: 3, dashArray: "2 6" }, B: { weight: 3, dashArray: "8 4" }, C: { weight: 2 }, D: { weight: 2 }, X: { weight: 3 } };
    for (const w of S.ways) {
        if (w.cat === "C" || w.cat === "D") continue; // the map stays readable: only the paths and the hazards
        L.polyline(w.coords, { color: CLASS_COLORS[w.cat], opacity: 0.9, interactive: false, renderer: canvas, ...style[w.cat] }).addTo(overlay);
    }
}

/* ---------- busy / hint / notes ---------- */
function busy(text) { const el = $("rbBusy"); el.hidden = !text; el.textContent = text || ""; }
function hint() {
    const n = S.waypoints.length;
    $("rbHint").hidden = n >= 2;
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
}

function edited() {
    clearDerived();
    drawMarkers(); hint(); buttons();
    reroute();
}

function addPoint(latlng) {
    S.waypoints.push([latlng.lat, latlng.lng]);
    edited();
}

function removePoint(i) {
    if (i < 0) return;
    const removed = S.waypoints.splice(i, 1)[0];
    edited();
    toast("Point removed.", { type: "info", action: { label: "Undo", onClick: () => { S.waypoints.splice(i, 0, removed); edited(); } } });
}

map.on("click", e => addPoint(e.latlng));

$("rbUndo").onclick = () => { if (S.waypoints.length) { S.waypoints.pop(); edited(); } };
$("rbClear").onclick = async () => {
    if (S.waypoints.length > 2 && !(await sbConfirm("Clear every point on this route?", { confirmLabel: "Clear", danger: true }))) return;
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
    setModeUi(loop);
    if (S.waypoints.length >= 2) edited(); else drawMarkers();
}
$("rbModeP2P").onclick = () => setMode(false);
$("rbModeLoop").onclick = () => setMode(true);

function buttons() {
    const n = S.waypoints.length, has = S.coords.length >= 2;
    $("rbUndo").disabled = n === 0;
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
        drawLine(); gapLayer.clearLayers(); render(); busy(""); updateNote();
        return;
    }
    const locs = S.closed ? [...S.waypoints, S.waypoints[0]] : S.waypoints.slice();
    busy("Snapping the route to paths…");
    let result;
    try {
        result = await fetchRoute(locs);
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
                const ways = await fetchWays(box);
                if (my !== S.token) return;
                S.ways = ways; S.waysBox = box; S.surfaceError = "";
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
            start, targetMiles: target, route: fetchRoute,
            onAttempt: (a, n) => busy(`Trying a loop: ${n} of ${LOOP_MAX_ATTEMPTS} (${a.miles.toFixed(1)} mi)…`)
        });
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
        const out = await optimise({ waypoints: S.waypoints, coords: S.coords, miles: S.miles, ways: S.ways, route: fetchRoute });
        if (my !== S.token) return;
        const el = $("rbOptimiseOut");
        if (out.status === "none") {
            el.textContent = out.why === "no-path-nearby" ? "No path or sidewalk within 0.1 mi of your points, so nothing to shift. Your route stays as it is." : "Couldn't score this route yet.";
        } else {
            const b = out.before, a = out.after;
            const grew = b.miles ? Math.round(100 * (a.miles - b.miles) / b.miles) : 0;
            const nums = `Path + sidewalk ${pct(b.ab)} → ${pct(a.ab)}, major road ${pct(b.x)} → ${pct(a.x)}, distance ${b.miles.toFixed(2)} → ${a.miles.toFixed(2)} mi (${grew >= 0 ? "+" : ""}${grew}%).`;
            if (out.status === "kept") {
                S.revert = { waypoints: S.waypoints.map(p => p.slice()), coords: S.coords, miles: S.miles };
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
    write(SETTINGS_KEY, { pace: formatPace(S.pace), gelG: S.gelG });
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
    $("rbAB").textContent = S.score ? `${S.score.ab}%` : (has && S.surfaceError ? "n/a" : (has ? "…" : "—"));

    // surface bar
    const sf = $("rbSurface");
    sf.hidden = !S.score;
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
        ex.innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join("");
    }

    // fuel
    S.fuel = null;
    const fl = $("rbFuel"), warn = $("rbFuelWarn");
    if (!has) { fl.innerHTML = '<li class="rb-empty">Fuel shows up once the route has a distance.</li>'; warn.hidden = true; return; }
    const duration = S.miles * S.pace;
    const plan = fuelPlan({ miles: S.miles, pace: S.pace, gelG: S.gelG, calculator: calculatorFor(Math.round(duration)) });
    S.fuel = plan;
    fl.innerHTML = fuelLines(plan).map((l, i, all) => `<li${i === all.length - 1 ? ' class="rb-small"' : ""}>${esc(l)}</li>`).join("");
    warn.hidden = !plan.coachCheck;
    warn.textContent = plan.coachCheck ? "Over 150 minutes. Have your coach check this fuel plan before you use it." : "";
}

/* ---------- save, open, export ---------- */
function refreshSaved() {
    const rows = listRoutes(store);
    $("rbSavedEmpty").hidden = rows.length > 0;
    $("rbSaved").innerHTML = rows.map(r => `
        <li class="rb-saved-row" data-id="${esc(r.id)}">
            <div class="rb-saved-main"><strong>${esc(r.name)}</strong>
            <span>${r.miles.toFixed(2)} mi · ${r.loop ? "loop" : "point to point"}${r.surface ? ` · ${r.surface.ab}% path + sidewalk` : ""}</span></div>
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
        loop: S.closed, snapped: S.snapped, pace: S.pace, gelG: S.gelG, fuel: S.fuel,
        surface: S.score ? { summary: S.score.summary, ab: S.score.ab, x: S.score.pcts.X } : null,
        climb: S.climb ? { lowFt: S.climb.lowFt, highFt: S.climb.highFt } : null
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
        S.editingId = rec.id; S.createdAt = rec.createdAt;
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
refreshSaved(); hint(); render(); buttons();
window.__routeBuilder = S; S.map = map; // read by the browser checks
