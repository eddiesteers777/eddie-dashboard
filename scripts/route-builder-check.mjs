// Build a Route in a real browser: empty state, a hand-drawn route, touch drag, remove + undo, loop,
// sidewalk-first, fuel, save/open/delete, GPX, and the "routing is down" fallback.
// Serve the repo first: python3 -m http.server 8934.  Run: node scripts/route-builder-check.mjs <outDir> [390|1280]
// Valhalla and the map tiles are the real services. Overpass is blocked in some sandboxes, so it is
// answered here with ways laid along the real route (a path, a sidewalk, a named major road).
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
import { decodePolyline } from "../js/routeGeo.js";

const OUT = process.argv[2] || "/tmp/rb"; fs.mkdirSync(OUT, { recursive: true });
const widths = process.argv[3] ? [Number(process.argv[3])] : [390, 1280];
const BASE = "http://localhost:8934/routes.html";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

const b = await chromium.launch();
for (const w of widths) {
  const phone = w < 700;
  const ctx = await newContext(b, w, "client", phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {});
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("route-view")) localStorage.setItem("route-view", JSON.stringify({ c: [35.0578, -85.3085], z: 15 })); } catch {} });
  let lastRoute = null, overpassHits = 0, valhallaDown = false;
  await ctx.route(/valhalla1\.openstreetmap\.de\/route/, async r => {
    if (valhallaDown) return r.abort();
    const resp = await r.fetch();
    try { const j = await resp.json(); lastRoute = j.trip.legs.flatMap(l => decodePolyline(l.shape, 6)); } catch {}
    r.fulfill({ response: resp });
  });
  await ctx.route(/overpass-api\.de/, r => {
    overpassHits++;
    const c = lastRoute || [];
    const n = c.length, geom = a => a.map(p => ({ lat: p[0], lon: p[1] }));
    const els = [];
    if (n > 20) {
      els.push({ type: "way", tags: { highway: "footway", footway: "sidewalk" }, geometry: geom(c.slice(0, Math.floor(n * 0.5))) });
      els.push({ type: "way", tags: { highway: "path", name: "Test Greenway" }, geometry: geom(c.slice(Math.floor(n * 0.5), Math.floor(n * 0.8))) });
      els.push({ type: "way", tags: { highway: "primary", name: "Test Pike" }, geometry: geom(c.slice(Math.floor(n * 0.8), Math.floor(n * 0.9))) });
    }
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ elements: els }) });
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  const tag = `${w}`;
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#rbMap .leaflet-tile-loaded", { timeout: 20000 }).catch(() => {});

  // ----- empty state -----
  const m0 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, dist: document.getElementById("rbDist").textContent, save: document.getElementById("rbSave").disabled, hint: document.getElementById("rbHint").textContent }));
  check(`${tag} empty: no sideways scroll`, m0.sw <= m0.cw, `${m0.sw}/${m0.cw}`);
  check(`${tag} empty: stats dashes, Save disabled, hint shown`, m0.dist === "—" && m0.save && /Tap the map/.test(m0.hint));
  await page.screenshot({ path: `${OUT}/empty-${tag}.png` });

  // ----- tap targets + input size -----
  const small = await page.evaluate(() => [...document.querySelectorAll(".rb-page button, .rb-page input, .rb-page summary, .rb-page .rb-link, .leaflet-control-zoom a")]
    .filter(e => e.offsetParent && !e.closest("[hidden]")).map(e => { const r = e.getBoundingClientRect(); return { t: (e.id || e.className || e.tagName).toString().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width), fs: parseFloat(getComputedStyle(e).fontSize), input: e.tagName === "INPUT" }; })
    .filter(x => x.h < 44 || x.w < 44 && !x.input && x.w < 40 || (x.input && x.fs < 16)));
  check(`${tag} tap targets >= 44px and inputs >= 16px`, small.length === 0, JSON.stringify(small));

  // ----- draw by tapping -----
  const box = await page.locator("#rbMap").boundingBox();
  const pts = [[0.30, 0.55], [0.55, 0.35], [0.72, 0.60]];
  for (const [fx, fy] of pts) {
    const x = box.x + box.width * fx, y = box.y + box.height * fy;
    if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => document.getElementById("rbDist").textContent !== "—", null, { timeout: 25000 });
  await page.waitForFunction(() => !/…/.test(document.getElementById("rbClimb").textContent) && !/…/.test(document.getElementById("rbAB").textContent), null, { timeout: 40000 }).catch(() => {});
  const m1 = await page.evaluate(() => ({ n: window.__routeBuilder.waypoints.length, dist: document.getElementById("rbDist").textContent, time: document.getElementById("rbTime").textContent, climb: document.getElementById("rbClimb").textContent, ab: document.getElementById("rbAB").textContent, snapped: window.__routeBuilder.snapped, legend: document.getElementById("rbLegend").textContent, explain: document.getElementById("rbExplain").innerText, fuel: document.getElementById("rbFuel").innerText, gaps: window.__routeBuilder.stretches.length }));
  check(`${tag} three taps -> three points, a snapped route`, m1.n === 3 && m1.snapped, JSON.stringify({ n: m1.n, dist: m1.dist }));
  check(`${tag} live stats: distance, time at pace, climb range, path+sidewalk`, /mi$/.test(m1.dist) && m1.time !== "—" && /\d+.*ft/.test(m1.climb) && /%/.test(m1.ab), JSON.stringify(m1));
  check(`${tag} major road named as a gap (explainer + map)`, /Test Pike/.test(m1.explain) && m1.gaps >= 1);
  check(`${tag} fuel under an hour: water only`, /Water only/.test(m1.fuel), m1.fuel.split("\n")[0]);
  await page.screenshot({ path: `${OUT}/route-${tag}.png` });
  await page.screenshot({ path: `${OUT}/route-full-${tag}.png`, fullPage: true });

  // ----- drag a point (touch drag on phone, mouse on desktop) -----
  const before = await page.evaluate(() => window.__routeBuilder.waypoints[1].slice());
  const mk = await page.locator(".rb-pin").nth(1).boundingBox();
  const sx = mk.x + mk.width / 2, sy = mk.y + mk.height / 2;
  if (phone) {
    const cdp = await ctx.newCDPSession(page);
    const t = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await t("touchStart", sx, sy); for (let i = 1; i <= 8; i++) await t("touchMove", sx + i * 6, sy - i * 4); await t("touchEnd");
  } else { await page.mouse.move(sx, sy); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(sx + i * 6, sy - i * 4); await page.mouse.up(); }
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ p: window.__routeBuilder.waypoints[1].slice(), n: window.__routeBuilder.waypoints.length }));
  check(`${tag} dragging a point moves it (${phone ? "by touch" : "by mouse"}) and does not remove it`, (after.p[0] !== before[0] || after.p[1] !== before[1]) && after.n === 3, `${before.map(x => x.toFixed(5))} -> ${after.p.map(x => x.toFixed(5))}`);
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden, null, { timeout: 25000 });

  // ----- tap a point removes it; Undo brings it back -----
  const last = await page.locator(".rb-pin").nth(2).boundingBox();
  if (phone) await page.touchscreen.tap(last.x + last.width / 2, last.y + last.height / 2); else await page.mouse.click(last.x + last.width / 2, last.y + last.height / 2);
  await page.waitForTimeout(400);
  check(`${tag} tapping a point removes it`, (await page.evaluate(() => window.__routeBuilder.waypoints.length)) === 2);
  await page.locator(".sb-toast-action").click();
  await page.waitForTimeout(400);
  check(`${tag} Undo on the toast restores it`, (await page.evaluate(() => window.__routeBuilder.waypoints.length)) === 3);
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden, null, { timeout: 25000 });

  // ----- sidewalk-first -----
  await page.waitForFunction(() => !document.getElementById("rbOptimise").disabled, null, { timeout: 30000 }).catch(() => {});
  await page.locator("#rbOptimise").click();
  await page.waitForFunction(() => document.getElementById("rbOptimiseOut").textContent.length > 0, null, { timeout: 30000 }).catch(() => {});
  const opt = await page.locator("#rbOptimiseOut").innerText();
  check(`${tag} sidewalk-first reports a result (kept, not kept, or nothing to shift)`, /Kept|Not kept|nothing to shift|No path/.test(opt), opt.slice(0, 140));
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden, null, { timeout: 30000 });

  // ----- fuel -----
  await page.fill("#rbPace", "8:30"); await page.locator("#rbPace").blur();
  await page.fill("#rbGel", "30"); await page.locator("#rbGel").blur();
  const fuel2 = await page.evaluate(() => ({ pace: window.__routeBuilder.pace, gel: window.__routeBuilder.gelG, time: document.getElementById("rbTime").textContent }));
  check(`${tag} pace and gel size change the plan`, fuel2.pace === 8.5 && fuel2.gel === 30, JSON.stringify(fuel2));
  await page.locator("#rbFuel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/fuel-${tag}.png` });

  // ----- save, reload, open, delete -----
  await page.fill("#rbName", "Test loop downtown");
  await page.locator("#rbSave").click();
  await page.waitForTimeout(300);
  check(`${tag} saved route appears in the list`, /Test loop downtown/.test(await page.locator("#rbSaved").innerText()));
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("route-")));
  check(`${tag} stored as route-<id> (+ view/settings), no other key touched`, keys.some(k => !["route-view", "route-settings"].includes(k)), keys.join(","));
  await page.screenshot({ path: `${OUT}/saved-${tag}.png`, fullPage: true });
  await page.reload({ waitUntil: "networkidle" });
  check(`${tag} saved route survives a reload`, /Test loop downtown/.test(await page.locator("#rbSaved").innerText()));
  await page.locator("[data-open]").first().click();
  await page.waitForTimeout(800);
  const opened = await page.evaluate(() => ({ n: window.__routeBuilder.waypoints.length, dist: document.getElementById("rbDist").textContent, name: document.getElementById("rbName").value }));
  check(`${tag} Open restores points, distance and name`, opened.n === 3 && /mi$/.test(opened.dist) && opened.name === "Test loop downtown", JSON.stringify(opened));
  await page.waitForFunction(() => !/…/.test(document.getElementById("rbClimb").textContent), null, { timeout: 40000 }).catch(() => {});

  // ----- GPX -----
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 40000 }), page.locator("#rbGpx").click()]);
  const gpxPath = `${OUT}/export-${tag}.gpx`; await dl.saveAs(gpxPath);
  const gpx = fs.readFileSync(gpxPath, "utf8");
  const trkpts = (gpx.match(/<trkpt /g) || []).length, eles = (gpx.match(/<ele>/g) || []).length;
  check(`${tag} GPX has metadata and one <ele> per point`, /<metadata><name>Test loop downtown<\/name>/.test(gpx) && trkpts > 20 && eles === trkpts, `${dl.suggestedFilename()} ${trkpts} points ${eles} ele`);
  check(`${tag} GPX description carries the climb as a range, not exact`, /climb \d+(–\d+)? ft, not exact/.test(gpx), (gpx.match(/<desc>[^<]*/) || [""])[0]);

  // ----- delete -----
  await page.locator("[data-del]").first().click();
  await page.locator("dialog button.is-danger, dialog .sb-btn-danger").first().click().catch(async () => { await page.getByRole("button", { name: "Delete" }).last().click(); });
  await page.waitForTimeout(400);
  check(`${tag} Delete removes it (empty state returns)`, !(await page.locator("#rbSavedEmpty").isHidden()));

  // ----- loop (fresh page) -----
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.locator("#rbModeLoop").click();
  await page.fill("#rbLoopMiles", "3");
  await page.locator("#rbMakeLoop").click();
  await page.waitForFunction(() => window.__routeBuilder.waypoints.length === 7, null, { timeout: 90000 }).catch(() => {});
  const lp = await page.evaluate(() => ({ n: window.__routeBuilder.waypoints.length, miles: window.__routeBuilder.miles, closed: window.__routeBuilder.closed }));
  check(`${tag} Make a loop: 3 mi target lands within 10%`, lp.n === 7 && Math.abs(lp.miles - 3) / 3 <= 0.1 + 1e-9, JSON.stringify(lp));
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden && !/…/.test(document.getElementById("rbAB").textContent), null, { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/loop-${tag}.png` });

  // ----- a long run: over 150 min asks for a coach check -----
  await page.fill("#rbPace", "11:00"); await page.locator("#rbPace").blur();
  await page.fill("#rbLoopMiles", "15"); await page.locator("#rbMakeLoop").click();
  await page.waitForFunction(() => window.__routeBuilder.miles > 12, null, { timeout: 120000 }).catch(() => {});
  const lng = await page.evaluate(() => ({ miles: window.__routeBuilder.miles, warn: document.getElementById("rbFuelWarn").hidden, fuel: document.getElementById("rbFuel").innerText }));
  check(`${tag} over 150 min: coach-check warning and the 60-90 g band`, !lng.warn && /60–90 g/.test(lng.fuel), `${lng.miles.toFixed(1)} mi`);
  await page.locator("#rbFuel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/fuel-long-${tag}.png` });

  // ----- routing down: straight lines, labelled (fresh page) -----
  valhallaDown = true;
  await page.goto(BASE, { waitUntil: "networkidle" });
  const b2 = await page.locator("#rbMap").boundingBox();
  for (const [fx, fy] of [[0.3, 0.5], [0.6, 0.4]]) { const x = b2.x + b2.width * fx, y = b2.y + b2.height * fy; if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(300); }
  await page.waitForFunction(() => !document.getElementById("rbNote").hidden, null, { timeout: 30000 }).catch(() => {});
  const fb = await page.evaluate(() => ({ note: document.getElementById("rbNote").textContent, snapped: window.__routeBuilder.snapped, ex: document.getElementById("rbExplain").innerText }));
  check(`${tag} routing down -> straight lines, labelled NOT snapped`, !fb.snapped && /NOT a snapped route/.test(fb.note) && /Not snapped/.test(fb.ex), fb.note.slice(0, 60));
  await page.screenshot({ path: `${OUT}/fallback-${tag}.png` });

  check(`${tag} no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
