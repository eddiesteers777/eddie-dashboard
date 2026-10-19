// Bakes a motion onto each athlete and writes lab/demo3d/assets/<exercise>-<sex>.glb,
// plus review frames. Needs the athletes from tools/build_athletes.py.
//   node lab/demo3d/tools/bake.mjs <athletes_dir> [motion] [reviewDir]
let chromium;
try { ({ chromium } = await import("playwright")); } catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lab = resolve(here, "..");
const [athletes = "/tmp/athletes", motion = "squat", review = "/tmp/demo3d-review"] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const p = u.startsWith("/athletes/") ? join(resolve(athletes), u.slice(10)) : join(lab, u);
    if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
mkdirSync(join(lab, "assets"), { recursive: true }); mkdirSync(review, { recursive: true });
const ID = { squat: "bodyweight-squat" }[motion] || motion;
for (const sex of ["male", "female"]) {
    const page = await browser.newPage();
    page.on("pageerror", e => console.error(sex, e.message));
    page.on("console", m => { if (m.type() === "error") console.error(sex, m.text()); });
    await page.goto(`http://localhost:${port}/tools/bake.html?model=/athletes/athlete-${sex}.glb&motion=${motion}`);
    await page.waitForFunction("window.READY", null, { timeout: 120000 });
    const out = join(lab, "assets", `${ID}-${sex}.glb`);
    writeFileSync(out, Buffer.from(await page.evaluate(() => window.bake()), "base64"));
    writeFileSync(join(review, `${ID}-${sex}.track.json`), JSON.stringify(await page.evaluate(() => window.track(30))));
    for (const [name, t, yaw, ...rest] of [["top", 0, 35], ["bottom", 0.26, 35], ["side-bottom", 0.26, 90], ["front-bottom", 0.26, 0], ["face", 0, 20, 4, 0.9, 1.55]]) {
        const url = await page.evaluate(a => window.shot(...a), [t, yaw, ...rest]);
        writeFileSync(join(review, `${ID}-${sex}-${name}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
    console.log("baked", out, readFileSync(out).length);
    await page.close();
}
await browser.close(); server.close();
