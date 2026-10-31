// Long-route acceptance check (live test 2026-10-31): a 10 mi target loop must get its path + sidewalk
// and major-road figures and its own safety score, and the short route's score must never be shown for it.
// Also: a map-data failure keeps the route usable (distance, fuel, GPX) and offers Try again.
//
// Serve the repo first: python3 -m http.server 8934.  Run: node scripts/route-long-check.mjs <outDir> [390|1280]
// Valhalla (routing, loop, heights) and the tiles are the real services. Overpass is blocked in this
// sandbox, so its answer is built from the main OSM API for the same box (scripts/osmToOverpass.mjs:
// real tags, same shape). The mock also plays a busy Overpass: the first two requests answer 504 (to
// prove the retries) and any box bigger than ~2 x 2 mi answers 504 (a SIMULATION of a giant query
// timing out; the live service's real limit is not known from here).
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
import { fetchOsmBox } from "./osmToOverpass.mjs";

const OUT = process.argv[2] || "/tmp/rlong"; fs.mkdirSync(OUT, { recursive: true });
const widths = process.argv[3] ? [Number(process.argv[3])] : [390, 1280];
const BASE = "http://localhost:8934/routes.html";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

// Chattanooga: well mapped (sidewalks, crossings), so the figures mean something
const START = [35.0560, -85.3090], B = [35.0480, -85.3010];
const TILE = 0.01, BIG = 0.0009; // OSM API tiles; "giant query" threshold in square degrees (simulated)
const tileCache = new Map();
async function osmTile(s, w) {
  const key = `${s.toFixed(2)},${w.toFixed(2)}`;
  if (!tileCache.has(key)) tileCache.set(key, fetchOsmBox({ s, w, n: s + TILE, e: w + TILE }).catch(err => { tileCache.delete(key); throw err; }));
  return tileCache.get(key);
}
async function osmBox(box) { // a box from tiles, clipped to the box like Overpass would
  const lists = [];
  for (let s = Math.floor(box.s / TILE) * TILE; s < box.n; s += TILE)
    for (let w = Math.floor(box.w / TILE) * TILE; w < box.e; w += TILE) lists.push((await osmTile(+s.toFixed(2), +w.toFixed(2))).elements);
  const seen = new Set(), out = [];
  const inside = p => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e;
  for (const e of lists.flat()) {
    const k = e.type + e.id; if (seen.has(k)) continue;
    if (e.type === "node" ? !inside(e) : !e.geometry.some(inside)) continue;
    seen.add(k); out.push(e);
  }
  return { elements: out };
}

const fmt = s => JSON.stringify(s);
const b = await chromium.launch();
for (const w of widths) {
  const phone = w < 700, tag = `${w}`;
  const ctx = await newContext(b, w, "client", { timezoneId: "America/New_York", ...(phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  const op = { requests: 0, busy: 2, failAll: false, big: 0 };
  await ctx.route(/overpass-api\.de/, async r => {
    op.requests++;
    const q = decodeURIComponent((r.request().postData() || "").replace(/^data=/, ""));
    const m = q.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
    const box = { s: +m[1], w: +m[2], n: +m[3], e: +m[4] };
    if (op.failAll) return r.fulfill({ status: 504, body: "" });
    if (op.busy > 0) { op.busy--; return r.fulfill({ status: 504, body: "" }); }
    if ((box.n - box.s) * (box.e - box.w) > BIG) { op.big++; return r.fulfill({ status: 504, body: "" }); }
    try { r.fulfill({ contentType: "application/json", body: JSON.stringify(await osmBox(box)) }); }
    catch (err) { console.log("  (OSM API failed: " + err.message + ")"); r.fulfill({ status: 504, body: "" }); }
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => { const ci = document.getElementById("rbRunClock"), di = document.getElementById("rbRunDate"); di.value = "2026-10-29"; di.dispatchEvent(new Event("change")); ci.value = "12:00"; ci.dispatchEvent(new Event("change")); });

  const figures = () => page.evaluate(() => {
    const S = window.__routeBuilder, t = id => document.getElementById(id).textContent.trim();
    return { miles: +S.miles.toFixed(2), points: S.coords.length, dist: t("rbDist"), pathSidewalk: t("rbAB"), majorRoad: t("rbX"),
      head: t("rbSafeHead"), worst: t("rbSafeWorst"), risk: t("rbSafeRisk"), log: S.mapLog };
  });

  // ----- 1. short route: two points, then Loop (about 1–2 mi) -----
  for (const p of [START, B]) {
    await page.evaluate(([lat, lon]) => { window.__routeBuilder.map.setView([lat, lon], 16, { animate: false }); }, p);
    await page.click("#rbCentre"); await page.waitForTimeout(200);
  }
  await page.click("#rbModeLoop");
  const t0 = Date.now();
  await page.waitForFunction(() => window.__routeBuilder.safe && window.__routeBuilder.score, null, { timeout: 90000 });
  const short = await figures();
  short.seconds = Math.round((Date.now() - t0) / 1000);
  check(`${tag} short loop: path + sidewalk, major road and the safety trio load`, short.miles >= 1 && short.miles <= 2.6 && /%$/.test(short.pathSidewalk) && /%$/.test(short.majorRoad) && /^Safety \d+ — /.test(short.head) && /^Worst /.test(short.worst) && /% at Orange or worse$/.test(short.risk), fmt(short));
  check(`${tag} short loop: the busy service was retried, not shown as an error`, short.log && short.log.requests > short.log.parts && short.log.failed === 0, fmt(short.log));
  await page.locator("#rbSafeBar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/1-short-${tag}.png` });

  // ----- 2. generate the 10 mi target loop, watching the safety bar and the surface stats the whole way -----
  await page.evaluate(() => {
    window.__samples = [];
    const S = window.__routeBuilder, t = id => document.getElementById(id).textContent.trim();
    window.__sampler = setInterval(() => window.__samples.push({ ms: Date.now(), miles: S.miles, head: t("rbSafeHead"), worst: t("rbSafeWorst"), ab: t("rbAB"), x: t("rbX"),
      barShown: !document.getElementById("rbSafeBar").hidden, safeEnd: S.safe ? S.safe.segments[S.safe.segments.length - 1].endMi : null, scoreFor: S.score ? S.coords.length : null }), 50);
  });
  op.busy = 2; // busy again for the long route
  await page.fill("#rbLoopMiles", "10");
  const t1 = Date.now();
  await page.click("#rbMakeLoop");
  // catch the "retrying" state on screen
  await page.waitForFunction(() => /retrying/.test(document.getElementById("rbAB").textContent), null, { timeout: 120000 }).catch(() => {});
  await page.locator(".rb-stats").scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/2-long-retrying-${tag}.png` });
  await page.waitForFunction(() => window.__routeBuilder.miles > 5 && window.__routeBuilder.safe && window.__routeBuilder.score, null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(400);
  const samples = await page.evaluate(() => { clearInterval(window.__sampler); return window.__samples; });
  const long = await figures();
  long.seconds = Math.round((Date.now() - t1) / 1000);
  check(`${tag} 10 mi target loop: about 9–11 mi with hundreds of points`, long.miles > 8 && long.miles < 11.5 && long.points > 200, `${long.miles} mi, ${long.points} points`);
  check(`${tag} 10 mi loop: PATH + SIDEWALK and MAJOR ROAD are real percentages, not n/a`, /^\d+%$/.test(long.pathSidewalk) && /^\d+%$/.test(long.majorRoad), `${long.pathSidewalk} / ${long.majorRoad}`);
  check(`${tag} 10 mi loop: its own safety trio`, /^Safety \d+ — /.test(long.head) && /^Worst /.test(long.worst) && /% at Orange or worse$/.test(long.risk), `${long.head} | ${long.worst} | ${long.risk}`);
  check(`${tag} 10 mi loop: map data came in pieces, with retries, none failed`, long.log && long.log.parts > 1 && long.log.failed === 0, fmt(long.log));
  check(`${tag} 10 mi loop: no piece needed a giant box`, op.big === 0, `big-box requests: ${op.big}`);

  // before / during / after: once the loop is on the page, never the short route's numbers
  const onLoop = samples.filter(s => s.miles > 5);
  const stale = onLoop.filter(s => (/^Safety \d+/.test(s.head) && !(s.safeEnd && Math.abs(s.safeEnd - s.miles) < 0.3)) || s.head === short.head && s.worst === short.worst);
  const staleSurf = onLoop.filter(s => /%$/.test(s.ab) && s.scoreFor == null);
  const during = [...new Set(onLoop.filter(s => !/^Safety \d+/.test(s.head)).map(s => s.head))];
  const duringSurf = [...new Set(onLoop.filter(s => !/%$/.test(s.ab)).map(s => s.ab))];
  const before = samples.filter(s => s.miles <= 5).map(s => s.head);
  check(`${tag} transition: the short score is never shown for the loop (${onLoop.length} samples every 50 ms)`, onLoop.length > 0 && stale.length === 0 && staleSurf.length === 0, `stale safety ${stale.length}, stale surface ${staleSurf.length}`);
  check(`${tag} transition: a waiting state shows in between`, during.length > 0 && during.every(h => /^Scoring safety…$|^Safety: retrying/.test(h)) && duringSurf.every(t => /^(calculating|retrying)…$/.test(t)), `before: "${before[before.length - 1] || ""}" | during: ${fmt(during)} ${fmt(duringSurf)} | after: "${long.head}"`);
  await page.locator("#rbSafeBar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/3-long-done-${tag}.png` });
  await page.evaluate(() => { const S = window.__routeBuilder; S.map.fitBounds(window.L.latLngBounds(S.coords), { padding: [20, 20], animate: false }); });
  await page.locator(".rb-mapwrap").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/3b-long-map-${tag}.png` });

  // ----- 3. the service stays down: route still usable, Try again offered, never an old score -----
  op.failAll = true;
  await page.evaluate(() => { const S = window.__routeBuilder; S.map.setView([35.0700, -85.2700], 15, { animate: false }); }); // new ground, nothing cached
  await page.click("#rbClear");
  await page.waitForTimeout(300);
  await page.locator('dialog[open] button:has-text("Clear")').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.click("#rbModeP2P");
  for (const p of [[35.0700, -85.2700], [35.0640, -85.2620]]) {
    await page.evaluate(([lat, lon]) => { window.__routeBuilder.map.setView([lat, lon], 16, { animate: false }); }, p);
    await page.click("#rbCentre"); await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => /unavailable/.test(document.getElementById("rbSafeHead").textContent), null, { timeout: 90000 }).catch(() => {});
  const down = await page.evaluate(() => ({ head: document.getElementById("rbSafeHead").textContent, retry: !!document.getElementById("rbSafeRetry"), noteRetry: !!document.getElementById("rbRetry"),
    note: document.getElementById("rbNote").textContent, dist: document.getElementById("rbDist").textContent, ab: document.getElementById("rbAB").textContent,
    fuel: document.getElementById("rbFuel").innerText, gpx: !document.getElementById("rbGpx").disabled, badge: document.getElementById("rbSafeBadge").textContent }));
  check(`${tag} service down: "Safety: unavailable for this route" with Try again, no number or colour`, down.head === "Safety: unavailable for this route" && down.retry && down.badge === "?", fmt(down.head));
  check(`${tag} service down: error kept with its Try again; surfaces say n/a`, /Couldn't load path and sidewalk data/.test(down.note) && down.noteRetry && down.ab === "n/a", down.note);
  check(`${tag} service down: distance, fuel and GPX still work`, /mi$/.test(down.dist) && !/once the route has a distance/.test(down.fuel) && down.gpx, `${down.dist}, gpx ${down.gpx}`);
  if (down.gpx) {
    await page.locator("#rbSave").scrollIntoViewIfNeeded().catch(() => {});
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }).catch(() => null), page.click("#rbGpx")]);
    const gpx = dl ? fs.readFileSync(await dl.path(), "utf8") : "";
    check(`${tag} service down: the GPX file downloads with the route`, (gpx.match(/<trkpt/g) || []).length > 10, `${(gpx.match(/<trkpt/g) || []).length} points`);
  }
  await page.locator("#rbSafeBar").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/4-down-${tag}.png` });
  op.failAll = false;
  await page.click("#rbSafeRetry");
  await page.waitForFunction(() => window.__routeBuilder.safe && window.__routeBuilder.score, null, { timeout: 90000 }).catch(() => {});
  const back = await figures();
  check(`${tag} Try again after the service is back: figures and score load`, /%$/.test(back.pathSidewalk) && /^Safety \d+ — /.test(back.head), `${back.pathSidewalk} | ${back.head}`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`${tag} no sideways scroll`, !overflow);
  const real = errors.filter(e => !/Failed to fetch|NetworkError|504/.test(e));
  check(`${tag} no page errors`, real.length === 0, real.join(" | "));
  console.log(`\n${tag} FIGURES\n  short: ${fmt(short)}\n  long:  ${fmt(long)}\n  overpass requests: ${op.requests}`);
  fs.writeFileSync(`${OUT}/figures-${tag}.json`, JSON.stringify({ short, long, down, back, samples: samples.length, overpassRequests: op.requests }, null, 2));
  await ctx.close();
}
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
