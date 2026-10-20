// Browser check of the 3D demo lab page (lab/demo3d/index.html):
// loads, plays and pauses, Male/Female, angles, half speed, Reduce Motion,
// the no-WebGL fallback, tap sizes and overflow at 1280px and 390px.
//   node lab/demo3d/tools/check.mjs [screenshotDir]
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import { createServer } from "node:http";
import { existsSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const shots = process.argv[2] || "/tmp/demo3d-shots";
mkdirSync(shots, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer((req, res) => {
    const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!p.startsWith(repo) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const url = `http://localhost:${server.address().port}/lab/demo3d/index.html`;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

let passed = 0, failed = 0;
const check = (ok, label) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); ok ? passed++ : failed++; };
const ready = page => page.waitForFunction(() => window.demo3d && document.querySelector("[data-loading]")?.hidden, null, { timeout: 120000 });
const time = page => page.evaluate(() => window.demo3d.state.time);
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(width, { reduced = false, noWebgl = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, serviceWorkers: "block", reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: width > 600 ? 1 : 2 });
    if (noWebgl) await ctx.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/.test(type) ? null : get.call(this, type, ...a); };
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);
    return { ctx, page, errors };
}

async function layout(page, label) {
    const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        small: [...document.querySelectorAll(".d3-pill, .d3-linkbtn")].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.height < 43.5 || r.width < 43.5).length
    }));
    check(m.overflow <= 0, `${label}: no sideways scroll`);
    check(m.small === 0, `${label}: every button is 44px or more`);
}

for (const [width, label] of [[1280, "desktop"], [390, "phone"]]) {
    const { ctx, page, errors } = await open(width);
    await ready(page);
    check(await page.locator(".d3-canvas").isVisible(), `${label}: the 3D stage shows`);
    check(await page.evaluate(() => window.demo3d.state.sex) === "male", `${label}: starts on the male athlete`);
    const t0 = await time(page); await wait(700); const t1 = await time(page);
    check(t1 > t0, `${label}: it plays (${t0.toFixed(2)}s → ${t1.toFixed(2)}s)`);
    await page.screenshot({ path: join(shots, `${label}-male.png`) });
    // Pause with the button, then with a tap on the stage.
    await page.click("[data-toggle]");
    const p0 = await time(page); await wait(500);
    check(Math.abs(await time(page) - p0) < 1e-6 && await page.getAttribute("[data-toggle]", "aria-pressed") === "false", `${label}: Pause stops it`);
    await page.click("[data-tap]");
    check(await page.evaluate(() => window.demo3d.state.playing), `${label}: tapping the stage plays it again`);
    // Female, then angles and speed.
    await page.click('[data-sex="female"]');
    await page.waitForFunction(() => window.demo3d.state.sex === "female" && document.querySelector("[data-loading]").hidden, null, { timeout: 120000 });
    check(await page.getAttribute('[data-sex="female"]', "aria-pressed") === "true", `${label}: switches to the female athlete`);
    await page.click('[data-view="side"]');
    check(await page.evaluate(() => window.demo3d.state.view) === "side", `${label}: side view`);
    await page.click("[data-toggle]"); // pause for a steady screenshot
    await page.evaluate(() => { const d = window.demo3d; d.setView("side"); });
    await page.screenshot({ path: join(shots, `${label}-female-side.png`) });
    await page.click('[data-view="front"]');
    await page.click("[data-speed]");
    check(await page.evaluate(() => window.demo3d.state.speed) === 0.5, `${label}: half speed`);
    // Muscles panel: opens with the app's muscle map and its chips, closes again.
    await page.click("[data-muscles]");
    await page.waitForSelector("[data-muscles-panel] .mm-chip", { timeout: 10000 });
    check(await page.getAttribute("[data-muscles]", "aria-expanded") === "true" && (await page.locator("[data-muscles-panel] .mm-chip.is-primary").count()) > 0 && (await page.locator("[data-muscles-panel] svg").count()) === 2, `${label}: Muscles opens the muscle map with main muscles`);
    await page.screenshot({ path: join(shots, `${label}-muscles.png`), fullPage: true });
    await page.click("[data-muscles]");
    check(await page.locator("[data-muscles-panel]").isHidden(), `${label}: Muscles closes again`);
    // Drag turns the athlete; a view button resets it.
    const box = await page.locator("[data-tap]").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
    check(await page.evaluate(() => window.demo3d.state.yawOffset) !== 0 && !(await page.evaluate(() => window.demo3d.state.playing)), `${label}: dragging turns the athlete without toggling play`);
    await layout(page, label);
    await page.screenshot({ path: join(shots, `${label}-page.png`), fullPage: true });
    check(errors.length === 0, `${label}: no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
    await ctx.close();
}

{   // Reduce Motion: starts paused at the bottom of the rep.
    const { ctx, page } = await open(390, { reduced: true });
    await ready(page);
    const s = await page.evaluate(() => window.demo3d.state);
    check(!s.playing && s.time > 1, `Reduce Motion: starts paused at the bottom (${s.time.toFixed(2)}s)`);
    await page.screenshot({ path: join(shots, "phone-reduced-motion.png") });
    await ctx.close();
}
{   // No WebGL: the drawn figure.
    const { ctx, page, errors } = await open(390, { noWebgl: true });
    await page.waitForSelector("#fallbackFigure svg", { timeout: 30000 });
    check(await page.evaluate(() => document.body.dataset.fallback) === "no-webgl" && await page.locator("#player").isHidden(), "No WebGL: the drawn figure takes over");
    check(errors.length === 0, `No WebGL: no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
    await page.screenshot({ path: join(shots, "phone-no-webgl.png") });
    await ctx.close();
}
{   // A model that won't load: the drawn figure.
    const { ctx, page } = await (async () => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
        await ctx.route("**/*.glb", r => r.abort());
        const page = await ctx.newPage(); await page.goto(url); return { ctx, page };
    })();
    await page.waitForSelector("#fallbackFigure svg", { timeout: 30000 });
    check(await page.evaluate(() => document.body.dataset.fallback) === "model", "Model fails to load: the drawn figure takes over");
    await ctx.close();
}

await browser.close(); server.close();
console.log(`\n${passed} passed, ${failed} failed. Screenshots in ${shots}`);
process.exit(failed ? 1 : 0);
