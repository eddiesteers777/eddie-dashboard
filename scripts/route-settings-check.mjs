// Route builder Settings in a real browser: the panel at phone and desktop width, each switch hides
// its layer everywhere, the route (distance, save, GPX) still works with everything off, and the
// choices survive a reload. (Account sync and isolation: scripts/route-settings-account-check.mjs.)
// Serve the repo first: python3 -m http.server 8934.  Run: node scripts/route-settings-check.mjs <outDir> [390|1280]
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
import { fetchOsmBox } from "./osmToOverpass.mjs";

const OUT = process.argv[2] || "/tmp/rset"; fs.mkdirSync(OUT, { recursive: true });
const widths = process.argv[3] ? [Number(process.argv[3])] : [390, 1280];
const BASE = "http://localhost:8934/routes.html";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const cache = new Map();
const A = [35.0626, -85.3077], B = [35.0490, -85.3100];

const b = await chromium.launch();
for (const w of widths) {
  const phone = w < 700;
  const ctx = await newContext(b, w, "client", phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {});
  let lastCosting = null;
  await ctx.route(/valhalla1\.openstreetmap\.de\/route/, async r => {
    try { lastCosting = JSON.parse(r.request().postData() || "{}").costing_options || null; } catch {}
    r.fulfill({ response: await r.fetch() });
  });
  await ctx.route(/overpass-api\.de/, async r => {
    const q = decodeURIComponent((r.request().postData() || "").replace(/^data=/, ""));
    const m = q.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
    const box = { s: +m[1], w: +m[2], n: +m[3], e: +m[4] }, key = JSON.stringify(box);
    try { if (!cache.has(key)) cache.set(key, await fetchOsmBox(box)); r.fulfill({ contentType: "application/json", body: JSON.stringify(cache.get(key)) }); }
    catch { r.fulfill({ status: 504, body: "" }); }
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  const tag = `${w}`;
  await page.goto(BASE, { waitUntil: "networkidle" });
  for (const p of [A, B]) {
    await page.evaluate(([lat, lon]) => window.__routeBuilder.map.setView([lat, lon], 16, { animate: false }), p);
    await page.click("#rbCentre"); await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => !document.getElementById("rbSafeBar").hidden && !/…/.test(document.getElementById("rbClimb").textContent), null, { timeout: 60000 });
  await page.evaluate(() => { const S = window.__routeBuilder; S.map.fitBounds(window.L.latLngBounds(S.coords), { padding: [20, 20], animate: false }); });

  // defaults: the full builder
  const def = await page.evaluate(() => ({ all: [...document.querySelectorAll("#rbLayers [data-layer]")].map(b => b.getAttribute("aria-pressed")), sf: document.getElementById("rbSidewalkFirst").getAttribute("aria-pressed") }));
  check(`${tag} defaults: every layer on, sidewalk-first on`, def.all.length === 6 && def.all.every(v => v === "true") && def.sf === "true", JSON.stringify(def));

  // open the panel
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#rbPrefsOpen"); await page.waitForTimeout(400);
  const panel = await page.evaluate(() => {
    const el = document.getElementById("rbPrefs"), r = el.getBoundingClientRect();
    const small = [...el.querySelectorAll("button")].filter(b => b.offsetParent && !b.disabled).map(b => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 24), h: Math.round(q.height), w: Math.round(q.width) }; }).filter(x => x.h < 44 || x.w < 44);
    return { open: el.classList.contains("is-open"), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, left: Math.round(r.left), right: Math.round(r.right), small, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, overflowX: el.scrollWidth > el.clientWidth + 1 };
  });
  check(`${tag} Settings opens (${phone ? "bottom sheet" : "panel over the map"}), 44px targets, no sideways scroll`, panel.open && panel.small.length === 0 && panel.sw <= panel.cw && !panel.overflowX, JSON.stringify(panel));
  await page.screenshot({ path: `${OUT}/settings-${tag}.png` });
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const axe = await page.evaluate(async () => (await window.axe.run(document.getElementById("rbPrefs"), { resultTypes: ["violations"] })).violations
    .filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ")}`));
  check(`${tag} axe: Settings panel has no serious or critical issues`, axe.length === 0, axe.join(" | "));
  if (phone) { await page.evaluate(() => document.getElementById("rbPrefs").scrollTo(0, 1e5)); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/settings-bottom-${tag}.png` }); }

  const flip = async (sel) => { await page.locator(sel).scrollIntoViewIfNeeded(); await page.click(sel); await page.waitForTimeout(250); };
  const vis = () => page.evaluate(() => {
    const shown = id => { const e = document.getElementById(id); return !!e && !e.hidden && !e.closest("[hidden]"); };
    return {
      safeBtn: shown("rbSafeMap"), safeBar: shown("rbSafeBar"), strip: shown("rbStripWrap"), safeCard: shown("rbSafetyCard"), letters: document.querySelectorAll(".rb-safe-letter").length,
      crossLine: /Busy-road crossing/.test(document.getElementById("rbExplain").innerText),
      fuelCard: shown("rbFuelCard"), gelBands: document.querySelectorAll("#rbProfile .rbp-band").length, profile: shown("rbProfileWrap"),
      miles: document.querySelectorAll(".rb-mile").length, surface: shown("rbSurface"), about: shown("rbAboutCard"), ab: shown("rbAB"), x: shown("rbX"), dots: shown("rbDots"),
      globeBtn: shown("rbGlobeBtn"), optimise: shown("rbOptimise"), words: document.getElementById("rbPrefsWords").textContent,
      dist: document.getElementById("rbDist").textContent
    };
  });

  // Safe Map on first, so turning the layer off has something to remove
  await page.evaluate(() => document.getElementById("rbSafeMap").click()); await page.waitForTimeout(200);
  let v = await vis();
  check(`${tag} with everything on: safety, fuel, profile, markers, surface, globe all showing`, v.safeBar && v.strip && v.safeCard && v.letters > 0 && v.fuelCard && v.profile && v.miles > 0 && v.surface && v.about && v.ab && v.globeBtn, JSON.stringify(v));

  await flip("#rbLayers [data-layer='safe']"); v = await vis();
  check(`${tag} Safe Map off: button, bar, strip, card, map colours and crossing lines all gone`, !v.safeBtn && !v.safeBar && !v.strip && !v.safeCard && v.letters === 0 && !v.crossLine, JSON.stringify(v));
  await flip("#rbLayers [data-layer='fuel']"); v = await vis();
  check(`${tag} Fuel off: fuel card gone`, !v.fuelCard);
  await flip("#rbLayers [data-layer='markers']"); v = await vis();
  check(`${tag} Distance markers off: none on the map`, v.miles === 0);
  await flip("#rbLayers [data-layer='surface']"); v = await vis();
  check(`${tag} Surface off: split bar, explainer, path + sidewalk / major road boxes and the Paths button gone`, !v.surface && !v.about && !v.ab && !v.x && !v.dots, JSON.stringify(v));
  await flip("#rbLayers [data-layer='globe']"); v = await vis();
  check(`${tag} Globe off: Globe button gone`, !v.globeBtn);
  await flip("#rbLayers [data-layer='profile']"); v = await vis();
  check(`${tag} Elevation profile off: gone`, !v.profile);
  await flip("#rbSidewalkFirst");
  await page.waitForFunction(() => !document.getElementById("rbBusy").hidden === false, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  v = await vis();
  check(`${tag} Sidewalk-first off: routes direct (walkway/sidewalk factor 1) and says so`, lastCosting && lastCosting.pedestrian.walkway_factor === 1 && /direct routing \(sidewalk-first off\)/.test(v.words) && !v.optimise, `${JSON.stringify(lastCosting)} | ${v.words}`);
  // close the panel
  await page.click("#rbPrefsClose"); await page.waitForTimeout(300);

  // the globe can't open by zooming out now
  await page.evaluate(() => window.__routeBuilder.map.setZoom(2, { animate: false })); await page.waitForTimeout(800);
  const globe = await page.evaluate(() => window.__routeBuilder.globeOpen);
  check(`${tag} Globe off: zooming far out stays on the flat map`, globe === false);
  await page.evaluate(() => { const S = window.__routeBuilder; S.map.fitBounds(window.L.latLngBounds(S.coords), { padding: [20, 20], animate: false }); });

  // the route still works with everything off
  await page.waitForFunction(() => /mi$/.test(document.getElementById("rbDist").textContent), null, { timeout: 30000 });
  v = await vis();
  await page.locator("#rbName").scrollIntoViewIfNeeded();
  await page.fill("#rbName", "Settings test");
  await page.click("#rbSave"); await page.waitForTimeout(300);
  const row = await page.evaluate(() => (document.querySelector("#rbSaved .rb-saved-row span") || {}).textContent || "");
  const rec = await page.evaluate(() => { const k = Object.keys(localStorage).find(k => /^route-r/.test(k) || (/^route-/.test(k) && !/view|settings/.test(k))); return k ? JSON.parse(localStorage.getItem(k)) : null; });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("#rbGpx")]);
  const gpx = fs.readFileSync(await dl.path(), "utf8");
  check(`${tag} everything off: distance, save and GPX still work; My Routes shows no surface or safety`, /mi$/.test(v.dist) && rec && rec.fuel === null && rec.safety === null && /mi · point to point$/.test(row) && /<trkpt/.test(gpx), `${v.dist} | "${row}" | fuel ${rec && rec.fuel} safety ${rec && rec.safety}`);
  await page.screenshot({ path: `${OUT}/all-off-${tag}.png`, fullPage: true });

  // remembered after a reload (same account, same device)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("route-settings")));
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.evaluate(() => ({ layers: [...document.querySelectorAll("#rbLayers [data-layer]")].map(b => b.getAttribute("aria-pressed")), sf: document.getElementById("rbSidewalkFirst").getAttribute("aria-pressed"), fuel: !document.getElementById("rbFuelCard").hidden, globe: !document.getElementById("rbGlobeBtn").hidden }));
  check(`${tag} choices are remembered for the next route (reload)`, after.layers.every(x => x === "false") && after.sf === "false" && !after.fuel && !after.globe && stored.layers && stored.layers.safe === false, JSON.stringify({ after, stored }));

  // all back on
  await page.click("#rbPrefsOpen"); await page.waitForTimeout(300);
  for (const k of ["safe", "fuel", "profile", "markers", "surface", "globe"]) await flip(`#rbLayers [data-layer='${k}']`);
  await flip("#rbSidewalkFirst");
  const back = await page.evaluate(() => ["rbSafetyCard", "rbFuelCard", "rbProfileWrap", "rbAboutCard", "rbGlobeBtn"].every(id => !document.getElementById(id).hidden));
  check(`${tag} switching back on brings every panel back`, back);
  check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
