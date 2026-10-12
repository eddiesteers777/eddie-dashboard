// Renders the How to 3D clips (js/exerciseClips.js) into videos/:
//   node scripts/build-clips/build.mjs [squat plank pushup pullup]
// 1. Downloads three.js r160 + its X Bot athlete (Mixamo, used as rendered
//    video only) into scripts/build-clips/vendor/ (git-ignored) once.
// 2. Serves this folder, opens render.html in headless Chromium (Playwright,
//    software WebGL) and saves every frame: 1080 x 1080, 30 fps, one loop.
// 3. encode.py (needs PyAV + Pillow) writes videos/<id>.mp4 / .webm / .jpg.
// The poses are exercises.js (world-space targets, two-bone IK, fixed hands
// and feet so nothing slides); the athlete's look and the lights are scene.js.
// Takes a few minutes per clip on a laptop CPU.
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import { createServer } from "node:http";
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const RAW = "https://raw.githubusercontent.com/mrdoob/three.js/r160/";
const VENDOR = [
    "build/three.module.js",
    "examples/jsm/loaders/GLTFLoader.js",
    "examples/jsm/utils/BufferGeometryUtils.js",
    "examples/jsm/environments/RoomEnvironment.js",
    "examples/models/gltf/Xbot.glb"
];
const IDS = { squat: "barbell-back-squat", plank: "plank", pushup: "push-up", pullup: "pull-up" };
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(IDS);

for (const f of VENDOR) {
    const to = join(here, "vendor", f);
    if (existsSync(to)) continue;
    mkdirSync(dirname(to), { recursive: true });
    const res = await fetch(RAW + f);
    if (!res.ok) throw new Error(`download ${f}: ${res.status}`);
    writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = createServer((req, res) => {
    const path = join(here, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!path.startsWith(here) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(readFileSync(path));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const ex of which) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    page.on("pageerror", e => console.error(ex, e.message));
    await page.goto(`http://localhost:${port}/render.html?ex=${ex}&size=1080`);
    await page.waitForFunction("window.READY", null, { timeout: 120000 });
    const n = Math.round((await page.evaluate(() => window.seconds())) * 30);
    const frames = join(here, "vendor", "frames", ex);
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    for (let i = 0; i < n; i++) {
        const url = await page.evaluate(t => window.renderAt(t), i / n);
        writeFileSync(join(frames, `f${String(i).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
    }
    await page.close();
    mkdirSync(join(root, "videos"), { recursive: true });
    execFileSync(process.env.PYTHON || "python3", [join(here, "encode.py"), frames, join(root, "videos", IDS[ex])], { stdio: "inherit" });
}
await browser.close();
server.close();
