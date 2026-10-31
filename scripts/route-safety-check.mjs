// Route safety rating in a real browser, on REAL OpenStreetMap data: Safe Map, letters and hatch,
// tap for why, the overall trio, time of day (day, night, rush hour), avoid busy roads, prefer lit,
// shortest vs safest, crossings and ways home. Chattanooga (well mapped) and Calera (thinly mapped).
// Serve the repo first: python3 -m http.server 8934.  Run: node scripts/route-safety-check.mjs <outDir> [390|1280]
// Valhalla and the tiles are the real services. Overpass is blocked in this sandbox, so its answer is
// built from the main OSM API for the same box (scripts/osmToOverpass.mjs): real tags, same shape.
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
import { fetchOsmBox } from "./osmToOverpass.mjs";

const OUT = process.argv[2] || "/tmp/rs"; fs.mkdirSync(OUT, { recursive: true });
const widths = process.argv[3] ? [Number(process.argv[3])] : [390, 1280];
const BASE = "http://localhost:8934/routes.html";
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const cache = new Map();

const CHATT = { a: [35.0626, -85.3077], b: [35.0490, -85.3100] };
const CALERA = { a: [33.1029, -86.7510], b: [33.0950, -86.7570] };

async function build(page, pts) {
  for (const p of pts) {
    await page.evaluate(([lat, lon]) => window.__routeBuilder.map.setView([lat, lon], 16, { animate: false }), p);
    await page.click("#rbCentre");
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => !document.getElementById("rbSafeBar").hidden, null, { timeout: 60000 });
  await page.evaluate(() => { const S = window.__routeBuilder; S.map.fitBounds(window.L.latLngBounds(S.coords), { padding: [20, 20], animate: false }); });
}
async function setWhen(page, date, clock) {
  await page.evaluate(([d, c]) => {
    const di = document.getElementById("rbRunDate"), ci = document.getElementById("rbRunClock");
    di.value = d; di.dispatchEvent(new Event("change"));
    ci.value = c; ci.dispatchEvent(new Event("change"));
  }, [date, clock]);
  await page.waitForTimeout(300);
}
const bar = page => page.evaluate(() => ({
  head: document.getElementById("rbSafeHead").textContent, risk: document.getElementById("rbSafeRisk").textContent,
  worst: document.getElementById("rbSafeWorst").textContent, unknown: document.getElementById("rbSafeUnknown").hidden ? "" : document.getElementById("rbSafeUnknown").textContent,
  note: document.querySelector("#rbSafeBar [data-safety-note]").textContent, rush: document.getElementById("rbRushNote").hidden ? "" : document.getElementById("rbRushNote").textContent,
  safer: document.getElementById("rbSaferTime").hidden ? "" : document.getElementById("rbSaferTime").textContent,
  lit: !document.getElementById("rbPreferLit").hidden, when: document.getElementById("rbRunWhen").textContent,
  crossings: document.getElementById("rbCrossings").innerText, cost: document.getElementById("rbSafeCost").textContent,
  pctUnknown: window.__routeBuilder.safe && window.__routeBuilder.safe.overall.pctUnknown,
  avg: window.__routeBuilder.safe && window.__routeBuilder.safe.overall.avg
}));

const b = await chromium.launch();
for (const w of widths) {
  const phone = w < 700;
  const ctx = await newContext(b, w, "client", phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {});
  let lastCosting = null, lastAvoid = 0;
  await ctx.route(/valhalla1\.openstreetmap\.de\/route/, async r => {
    try { const body = JSON.parse(r.request().postData() || "{}"); lastCosting = body.costing_options || null; lastAvoid = (body.exclude_polygons || []).length; } catch {}
    r.fulfill({ response: await r.fetch() });
  });
  await ctx.route(/overpass-api\.de/, async r => {
    const q = decodeURIComponent((r.request().postData() || "").replace(/^data=/, ""));
    const m = q.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
    const box = { s: +m[1], w: +m[2], n: +m[3], e: +m[4] };
    const key = JSON.stringify(box);
    try {
      if (!cache.has(key)) cache.set(key, await fetchOsmBox(box));
      r.fulfill({ contentType: "application/json", body: JSON.stringify(cache.get(key)) });
    } catch (err) { console.log("  (OSM API failed: " + err.message + ")"); r.fulfill({ status: 504, body: "" }); }
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  const tag = `${w}`;
  await page.goto(BASE, { waitUntil: "networkidle" });

  // ----- Chattanooga, Thursday noon -----
  await setWhen(page, "2026-10-29", "12:00");
  await build(page, [CHATT.a, CHATT.b]);
  const noon = await bar(page);
  check(`${tag} trio shown: headline, worst stretch, % at Orange or worse`, /^Safety \d+ — /.test(noon.head) && /^Worst \d+\.\d mi: /.test(noon.worst) && /^\d+% at Orange or worse$/.test(noon.risk), JSON.stringify([noon.head, noon.worst, noon.risk]));
  check(`${tag} planning-estimate note on the safety bar`, noon.note === "Planning estimate from map data — check the road yourself before you run.");
  check(`${tag} busy-road crossings listed with their type`, /Mile \d\.\d: crosses .+ (signal crossing|marked crossing|unmarked crossing|crossing type not mapped)/.test(noon.crossings), noon.crossings.split("\n")[0]);
  check(`${tag} noon: no rush note, Prefer lit hidden`, !noon.rush && !noon.lit);
  const strip = await page.evaluate(() => ({ segs: document.querySelectorAll("#rbStrip .rbs-seg").length, letters: [...document.querySelectorAll("#rbStrip .rbs-letter")].map(t => t.textContent), cross: document.querySelectorAll("#rbStrip .rbs-cross").length, legend: document.querySelectorAll("#rbSafeLegend li").length }));
  check(`${tag} safety strip: stretches, letters, crossings, 7-entry legend`, strip.segs > 5 && strip.letters.length > 0 && strip.cross > 0 && strip.legend === 7, JSON.stringify(strip));

  // Safe Map
  await page.click("#rbSafeMap");
  await page.waitForTimeout(300);
  const sm = await page.evaluate(() => ({ pressed: document.getElementById("rbSafeMap").getAttribute("aria-pressed"), lines: document.querySelectorAll(".leaflet-overlay-pane path[stroke-dasharray], .leaflet-overlay-pane path[stroke^='url(']").length, letters: [...document.querySelectorAll(".rb-safe-letter")].map(e => e.textContent) }));
  check(`${tag} Safe Map on: coloured stretches with dash patterns and letters on the map`, sm.pressed === "true" && sm.lines > 0 && sm.letters.length > 0, JSON.stringify(sm));
  // tap the line for why (no point is added)
  const n0 = await page.evaluate(() => window.__routeBuilder.waypoints.length);
  const pt = await page.evaluate(() => { const S = window.__routeBuilder; const p = S.map.latLngToContainerPoint(S.coords[Math.floor(S.coords.length * 0.45)]); const r = document.getElementById("rbMap").getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; });
  if (phone) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(500);
  const why = await page.evaluate(() => ({ hidden: document.getElementById("rbWhy").hidden, text: document.getElementById("rbWhy").innerText, n: window.__routeBuilder.waypoints.length }));
  check(`${tag} tap the Safe Map line: why panel with the exact inputs, no point added`, !why.hidden && /because: /.test(why.text) && why.n === n0, why.text.replace(/\s+/g, " ").slice(0, 160));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator(".rb-mapwrap").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/safe-map-${tag}.png` });
  // strip tap picks a stretch too
  await page.locator("#rbStrip svg").scrollIntoViewIfNeeded();
  const sb = await page.locator("#rbStrip svg").boundingBox();
  await page.locator("#rbStrip svg").click({ position: { x: sb.width * 0.9, y: 20 } });
  const why2 = await page.evaluate(() => document.getElementById("rbWhy").innerText);
  check(`${tag} tap the strip: why panel follows`, /Mile \d\.\d–\d\.\d/.test(why2) && why2 !== why.text, why2.split("\n")[0]);

  // ----- night -----
  await setWhen(page, "2026-10-29", "21:00");
  const night = await bar(page);
  check(`${tag} 9 pm: re-scored lower, missing lighting shown as unknown`, night.avg < noon.avg && night.pctUnknown > noon.pctUnknown && /missing map data/.test(night.unknown), JSON.stringify({ noon: noon.avg, night: night.avg, unk: night.pctUnknown }));
  check(`${tag} 9 pm: Prefer lit at night appears`, night.lit);
  check(`${tag} 9 pm: a safer time is suggested`, /^Same route scores \d+ at .+, \d+ at 9:00 pm\./.test(night.safer), night.safer);
  await page.locator("#rbSafetyCard").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/safe-night-${tag}.png` });
  // ----- rush hour -----
  await setWhen(page, "2026-10-29", "17:00");
  const rush = await bar(page);
  check(`${tag} 5 pm Thursday: rush-hour estimate labelled, busy roads lower`, /^Rush-hour estimate — not live traffic data\./.test(rush.rush) && rush.avg <= noon.avg, `${rush.avg} vs ${noon.avg}`);
  await setWhen(page, "2026-10-29", "21:00");

  // ----- prefer lit -----
  await page.click("#rbPreferLit");
  await page.waitForFunction(() => /Preferring lit|Lighting/.test(document.getElementById("rbSafeCost").textContent), null, { timeout: 60000 }).catch(() => {});
  const lit = await bar(page);
  check(`${tag} Prefer lit: re-routed with use_lit, cost shown`, lastCosting && lastCosting.pedestrian.use_lit === 1 && /^Preferring lit streets: .*(longer|shorter|same distance).*(safer|less safe|no change)/.test(lit.cost), lit.cost);
  await page.click("#rbPreferLit");
  await page.waitForFunction(() => /no longer/.test(document.getElementById("rbSafeCost").textContent), null, { timeout: 60000 }).catch(() => {});
  await setWhen(page, "2026-10-29", "12:00");

  // ----- avoid busy roads -----
  await page.click("#rbAvoidBusy");
  await page.waitForFunction(() => /^(Avoiding busy roads|No busy stretches)/.test(document.getElementById("rbSafeCost").textContent), null, { timeout: 60000 }).catch(() => {});
  const avoid = await bar(page);
  check(`${tag} Avoid busy roads: re-routed around busy stretches, cost shown`, (lastAvoid > 0 || /No busy/.test(avoid.cost)) && /(longer|shorter|same distance).*(safer|less safe|no change)/.test(avoid.cost), `${lastAvoid} boxes; ${avoid.cost} ${avoid.head}`);
  await page.click("#rbAvoidBusy");
  await page.waitForFunction(() => /allowed again/.test(document.getElementById("rbSafeCost").textContent), null, { timeout: 60000 }).catch(() => {});

  // ----- shortest vs safest -----
  await page.click("#rbCompare");
  await page.waitForFunction(() => document.querySelectorAll("#rbCompareOut .rb-compare-col").length === 2, null, { timeout: 90000 }).catch(() => {});
  const cmp = await page.evaluate(() => ({ cols: [...document.querySelectorAll("#rbCompareOut .rb-compare-col")].map(c => c.innerText.replace(/\s+/g, " ")), note: (document.querySelector("#rbCompareOut .rb-compare-note") || {}).textContent || "" }));
  check(`${tag} shortest vs safest: both with headline, worst and % at risk`, cmp.cols.length === 2 && cmp.cols.every(c => /Safety|— /.test(c) && /Worst/.test(c) && /% at Orange or worse/.test(c)), JSON.stringify(cmp.cols));
  await page.locator("#rbCompareOut").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/safe-compare-${tag}.png` });
  await page.click("#rbCompareOut [data-use='safest']");
  await page.waitForFunction(() => !document.getElementById("rbSafeBar").hidden && window.__routeBuilder.safe, null, { timeout: 60000 }).catch(() => {});
  const used = await page.evaluate(() => document.getElementById("rbAvoidBusy").getAttribute("aria-pressed"));
  check(`${tag} Use safest: route swapped, Avoid busy roads switched on`, used === "true");

  // ----- ways home -----
  await page.waitForFunction(() => !document.getElementById("rbHome").disabled, null, { timeout: 60000 }).catch(() => {});
  const homeOn = await page.evaluate(() => !document.getElementById("rbHome").disabled);
  if (homeOn) {
    await page.click("#rbHome");
    await page.waitForFunction(() => !document.getElementById("rbHomeOut").hidden, null, { timeout: 90000 }).catch(() => {});
    const home = await page.evaluate(() => [...document.querySelectorAll("#rbHomeList button")].map(b => b.textContent));
    check(`${tag} ways home: one row per mile marker with distance and safety`, home.length >= 1 && /^\S+Mile 1 → start: \d+\.\d mi · safety \d+/.test(home[0]), JSON.stringify(home));
    if (home.length) { await page.click("#rbHomeList button[data-i='0']"); await page.waitForTimeout(400); }
    await page.locator("#rbHomeOut").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/safe-home-${tag}.png` });
  } else check(`${tag} ways home: one row per mile marker`, false, "button stayed disabled (route under a mile?)");

  // ----- accessibility of the filled-in safety screens (axe) -----
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector(".rb-page"), { resultTypes: ["violations"] })).violations
    .filter(v => v.impact === "serious" || v.impact === "critical").map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ")}`));
  check(`${tag} axe: no serious or critical issues with the safety rating showing`, axe.length === 0, axe.join(" | "));

  // ----- layout -----
  const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`${tag} no sideways scroll`, lay.sw <= lay.cw, `${lay.sw}/${lay.cw}`);
  const small = await page.evaluate(() => [...document.querySelectorAll("#rbSafeMap, #rbSafetyCard button, #rbSafetyCard input, #rbSafetyCard summary")]
    .filter(e => e.offsetParent && !e.closest("[hidden]")).map(e => { const r = e.getBoundingClientRect(); return { t: (e.id || e.className || e.tagName).toString().slice(0, 30), h: Math.round(r.height), fs: parseFloat(getComputedStyle(e).fontSize), input: e.tagName === "INPUT" && e.type !== "range" }; })
    .filter(x => x.h < 44 || (x.input && x.fs < 16)));
  check(`${tag} safety controls: 44px targets, 16px inputs`, small.length === 0, JSON.stringify(small));
  await page.screenshot({ path: `${OUT}/safe-full-${tag}.png`, fullPage: true });

  // ----- Calera: thin OSM data shows as unknown, never green -----
  const p2 = await ctx.newPage();
  p2.on("pageerror", e => errors.push(String(e)));
  await p2.goto(BASE, { waitUntil: "networkidle" });
  await setWhen(p2, "2026-10-31", "12:00");
  await build(p2, [CALERA.a, CALERA.b]);
  await p2.click("#rbSafeMap");
  await p2.waitForTimeout(300);
  const cal = await bar(p2);
  const hatch = await p2.evaluate(() => ({ hatch: document.querySelectorAll(".leaflet-overlay-pane path[stroke='url(#rbm-U)']").length, green: window.__routeBuilder.safe.segments.filter(s => s.unknown.length && s.band.id === "G").length, stripQ: [...document.querySelectorAll("#rbStrip .rbs-letter")].some(t => t.textContent === "?") }));
  check(`${tag} Calera: missing sidewalk data hatched with "?", note shown`, cal.pctUnknown > 50 && hatch.hatch > 0 && hatch.stripQ && /OSM has no lighting\/sidewalk data here — check before you run\./.test(cal.unknown), JSON.stringify({ unk: cal.pctUnknown, ...hatch }));
  await p2.locator(".rb-mapwrap").scrollIntoViewIfNeeded();
  await p2.screenshot({ path: `${OUT}/safe-calera-${tag}.png` });
  check(`${tag} no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
