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
  let lastRoute = null, overpassHits = 0, valhallaDown = false, lastCosting = null;
  await ctx.route(/valhalla1\.openstreetmap\.de\/route/, async r => {
    if (valhallaDown) return r.abort();
    try { lastCosting = JSON.parse(r.request().postData() || "{}").costing_options || null; } catch {}
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
  const small = await page.evaluate(() => [...document.querySelectorAll(".rb-page button:not(.rb-prefs:not(.is-open) button), .rb-page input, .rb-page summary, .rb-page .rb-link, .leaflet-control-zoom a")]
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

  // ----- drag the route line itself: a new point goes into the right gap -----
  await page.waitForFunction(() => !document.getElementById("rbBusy").hidden === false && window.__routeBuilder.coords.length > 10, null, { timeout: 25000 });
  const linePt = await page.evaluate(() => { const S = window.__routeBuilder; const c = S.coords[Math.floor(S.coords.length * 0.25)]; const p = S.map.latLngToContainerPoint(c); const r = document.getElementById("rbMap").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; });
  if (phone) {
    const cdp = await ctx.newCDPSession(page);
    const t = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await t("touchStart", linePt.x, linePt.y); for (let i = 1; i <= 8; i++) await t("touchMove", linePt.x - i * 5, linePt.y + i * 3); await t("touchEnd");
  } else { await page.mouse.move(linePt.x, linePt.y); await page.mouse.down(); for (let i = 1; i <= 8; i++) await page.mouse.move(linePt.x - i * 5, linePt.y + i * 3); await page.mouse.up(); }
  await page.waitForTimeout(600);
  const ins = await page.evaluate(() => window.__routeBuilder.waypoints.length);
  check(`${tag} dragging the route line adds a point (${phone ? "touch" : "mouse"})`, ins === 4, `points: ${ins}`);
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden, null, { timeout: 25000 });
  await page.locator("#rbUndo").click(); await page.waitForTimeout(300);
  check(`${tag} Undo takes back the last change`, (await page.evaluate(() => window.__routeBuilder.waypoints.length)) === 3);
  if (!phone) {
    await page.evaluate(() => window.scrollTo(0, 0)); // clicking Undo scrolled the page; the pin must be on screen
    await page.waitForTimeout(200);
    const pin = await page.locator(".rb-pin").nth(1).boundingBox();
    await page.mouse.click(pin.x + pin.width / 2, pin.y + pin.height / 2, { button: "right" }); await page.waitForTimeout(300);
    check(`${tag} right-click on a point deletes it`, (await page.evaluate(() => window.__routeBuilder.waypoints.length)) === 2);
    await page.locator("#rbUndo").click(); await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden, null, { timeout: 25000 });

  // ----- reverse, out and back -----
  const first = await page.evaluate(() => window.__routeBuilder.waypoints[0].slice());
  await page.locator("#rbReverse").click(); await page.waitForTimeout(300);
  const rev = await page.evaluate(() => window.__routeBuilder.waypoints.slice(-1)[0]);
  check(`${tag} Reverse flips the route`, rev[0] === first[0] && rev[1] === first[1]);
  await page.locator("#rbUndo").click(); await page.waitForTimeout(200);
  await page.locator("#rbOutBack").click(); await page.waitForTimeout(300);
  check(`${tag} Out and back returns to the start`, (await page.evaluate(() => { const w = window.__routeBuilder.waypoints; return w.length === 5 && w[4][0] === w[0][0]; })));
  await page.locator("#rbUndo").click(); await page.waitForTimeout(200);
  await page.waitForFunction(() => document.getElementById("rbBusy").hidden && window.__routeBuilder.coords.length > 10, null, { timeout: 25000 });
  await page.waitForFunction(() => !/…/.test(document.getElementById("rbClimb").textContent), null, { timeout: 40000 }).catch(() => {});
  const mk2 = await page.evaluate(() => ({ miles: window.__routeBuilder.miles, markers: document.querySelectorAll(".rb-mile").length, loss: document.getElementById("rbLoss").textContent, profile: !!document.querySelector("#rbProfile svg .rbp-line") }));
  check(`${tag} mile markers, loss range and the elevation profile`, mk2.markers === Math.floor(mk2.miles) && /ft/.test(mk2.loss) && mk2.profile, JSON.stringify(mk2));

  // ----- route options -----
  await page.locator("#rbPrefsOpen").click(); await page.waitForTimeout(350);
  const sheetShown = await page.evaluate(() => { const r = document.getElementById("rbPrefs").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && getComputedStyle(document.getElementById("rbPrefs")).visibility === "visible"; });
  check(`${tag} route options ${phone ? "sheet opens" : "panel opens on the left of the map"}`, sheetShown);
  await page.screenshot({ path: `${OUT}/options-${tag}.png` });
  await page.locator('[data-pref="elevation"] [data-v="flat"]').click();
  await page.waitForTimeout(1500);
  check(`${tag} "Avoid hills" goes to the router as use_hills 0`, lastCosting && lastCosting.pedestrian && lastCosting.pedestrian.use_hills === 0, JSON.stringify(lastCosting));
  await page.locator('[data-pref="surface"] [data-v="trail"]').click(); await page.waitForTimeout(800);
  check(`${tag} "Trails" goes to the router`, lastCosting && lastCosting.pedestrian.use_tracks === 1);
  await page.locator('[data-pref="surface"] [data-v="any"]').click();
  await page.locator("#rbPrefsClose").click();
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
  await page.waitForFunction(() => document.querySelectorAll("#rbProfile .rbp-band").length > 0, null, { timeout: 60000 }).catch(() => {});
  const bands = await page.evaluate(() => document.querySelectorAll("#rbProfile .rbp-band").length);
  check(`${tag} gel windows are plotted on the elevation profile`, bands >= 2, `${bands} windows`);
  await page.locator("#rbProfileWrap").scrollIntoViewIfNeeded();
  const pb = await page.locator("#rbProfile svg").boundingBox();
  if (pb) await page.mouse.move(pb.x + pb.width * 0.4, pb.y + pb.height * 0.5);
  await page.waitForTimeout(200);
  check(`${tag} hovering the profile shows mile and height`, /Mile \d/.test(await page.locator(".rbp-tip").innerText().catch(() => "")));
  await page.locator("#rbProfileWrap").screenshot({ path: `${OUT}/profile-${tag}.png` });

  // ----- routing down: straight lines, labelled (fresh page) -----
  valhallaDown = true;
  await page.goto(BASE, { waitUntil: "networkidle" });
  const b2 = await page.locator("#rbMap").boundingBox();
  for (const [fx, fy] of [[0.3, 0.5], [0.6, 0.4]]) { const x = b2.x + b2.width * fx, y = b2.y + b2.height * fy; if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(300); }
  await page.waitForFunction(() => !document.getElementById("rbNote").hidden, null, { timeout: 30000 }).catch(() => {});
  const fb = await page.evaluate(() => ({ note: document.getElementById("rbNote").textContent, snapped: window.__routeBuilder.snapped, ex: document.getElementById("rbExplain").innerText }));
  check(`${tag} routing down -> straight lines, labelled NOT snapped`, !fb.snapped && /NOT a snapped route/.test(fb.note) && /Not snapped/.test(fb.ex), fb.note.slice(0, 60));
  await page.screenshot({ path: `${OUT}/fallback-${tag}.png` });

  // ----- search (real Nominatim) -----
  valhallaDown = false;
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.fill("#rbSearchInput", "Calera, Alabama");
  await page.locator("#rbSearch button[type=submit]").click();
  await page.waitForSelector(".rb-result", { timeout: 20000 }).catch(() => {});
  const nRes = await page.locator(".rb-result").count();
  check(`${tag} search finds a place`, nRes > 0, `${nRes} results`);
  if (nRes) {
    await page.screenshot({ path: `${OUT}/search-${tag}.png` });
    await page.locator('.rb-result [data-act="start"]').first().click(); await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ n: window.__routeBuilder.waypoints.length, c: window.__routeBuilder.map.getCenter() }));
    check(`${tag} "Start here" jumps there and sets the start`, st.n === 1 && Math.abs(st.c.lat - 33.1) < 0.2, JSON.stringify(st));
  }

  // ----- globe: zoom out past continent level, then back; the route carries over -----
  await page.goto(BASE, { waitUntil: "networkidle" });
  const bx = await page.locator("#rbMap").boundingBox();
  for (const [fx, fy] of [[0.35, 0.5], [0.65, 0.45]]) { const xx = bx.x + bx.width * fx, yy = bx.y + bx.height * fy; if (phone) await page.touchscreen.tap(xx, yy); else await page.mouse.click(xx, yy); await page.waitForTimeout(300); }
  await page.waitForFunction(() => window.__routeBuilder.coords.length > 5 && document.getElementById("rbBusy").hidden, null, { timeout: 30000 });
  const beforeG = await page.evaluate(() => ({ n: window.__routeBuilder.waypoints.length, miles: window.__routeBuilder.miles }));
  await page.evaluate(() => window.__routeBuilder.map.setZoom(2));
  await page.waitForFunction(() => document.querySelector("#rbGlobe.is-on canvas"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const gOn = await page.evaluate(() => !!document.querySelector("#rbGlobe.is-on canvas") && document.getElementById("rbGlobe").getBoundingClientRect().height > 200);
  check(`${tag} zooming out opens the globe`, gOn);
  await page.screenshot({ path: `${OUT}/globe-${tag}.png` });
  await page.locator("#rbGlobeBack").click(); await page.waitForTimeout(800);
  const afterG = await page.evaluate(() => ({ n: window.__routeBuilder.waypoints.length, miles: window.__routeBuilder.miles, globe: !document.getElementById("rbGlobe").hidden, z: window.__routeBuilder.map.getZoom() }));
  check(`${tag} back to the flat map: points and route kept`, !afterG.globe && afterG.n === beforeG.n && afterG.miles === beforeG.miles && afterG.z >= 13, JSON.stringify(afterG));
  // zooming in on the globe hands back to the flat map by itself
  await page.evaluate(() => window.__routeBuilder.map.setZoom(2));
  await page.waitForFunction(() => window.__routeBuilder.globeMap && document.querySelector("#rbGlobe.is-on canvas"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__routeBuilder.globeMap.jumpTo({ zoom: 6 }));
  await page.waitForTimeout(1200);
  const autoBack = await page.evaluate(() => ({ globe: window.__routeBuilder.globeOpen, n: window.__routeBuilder.waypoints.length, z: window.__routeBuilder.map.getZoom() }));
  check(`${tag} zooming in on the globe returns to the flat map, route kept`, !autoBack.globe && autoBack.n === beforeG.n && autoBack.z >= 6, JSON.stringify(autoBack));

  check(`${tag} no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
