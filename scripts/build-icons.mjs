// Renders Southbound's PNG icons from the brand SVGs (scripts/trace-logo.py
// makes those from brand/southbound-logo-source.png). Needs Playwright's
// Chromium: `npx playwright install chromium` once, then
//   node scripts/build-icons.mjs
// Writes:
//   icons/icon-512.png, icons/icon-192.png   the app tile, rounded (manifest "any")
//   icons/icon-maskable-512.png              full-bleed cream, mark inside the safe zone
//   icons/apple-touch-icon.png (180)         full-bleed cream (iOS rounds it itself)
//   icons/favicon-32.png                     the tile, mark a little larger
//   icons/og-image.png (1200x630)            link previews: the lockup on forest
//   brand/southbound-profile-cream.png / -green.png (1024)   social profile pictures
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const FOREST = "#0E251B", CREAM = "#F3EFE6", BG = "#0F2019";
const svg = name => `data:image/svg+xml;base64,${Buffer.from(readFileSync(join(root, "brand", name))).toString("base64")}`;
const font = name => `data:font/woff2;base64,${readFileSync(join(root, "fonts", name)).toString("base64")}`;

// Mark centered on a square: `bg` fill (or transparent), mark `share` of the width.
const square = (size, bg, mark, share) => `
    <div style="width:${size}px;height:${size}px;background:${bg};display:grid;place-items:center">
        <img src="${svg(mark)}" style="width:${Math.round(size * share)}px;display:block">
    </div>`;

const JOBS = [
    ["icons/icon-512.png", 512, 512, `<img src="${svg("sb-tile.svg")}" style="width:512px;display:block">`],
    ["icons/icon-192.png", 192, 192, `<img src="${svg("sb-tile.svg")}" style="width:192px;display:block">`],
    ["icons/icon-maskable-512.png", 512, 512, square(512, CREAM, "sb-mark-forest.svg", 0.62)],
    ["icons/apple-touch-icon.png", 180, 180, square(180, CREAM, "sb-mark-forest.svg", 0.78)],
    ["icons/favicon-32.png", 32, 32, `<div style="width:32px;height:32px;border-radius:7px;background:${CREAM};display:grid;place-items:center"><img src="${svg("sb-mark-forest.svg")}" style="width:29px;display:block"></div>`],
    ["brand/southbound-profile-cream.png", 1024, 1024, square(1024, CREAM, "sb-mark-forest.svg", 0.7)],
    ["brand/southbound-profile-green.png", 1024, 1024, square(1024, "#173226", "sb-mark.svg", 0.7)],
    ["icons/og-image.png", 1200, 630, `
        <style>@font-face{font-family:Inter;src:url(${font("inter-latin-var.woff2")}) format("woff2");font-weight:100 900}</style>
        <div style="width:1200px;height:630px;box-sizing:border-box;background:radial-gradient(ellipse at 30% 20%,#1B3B2C 0%,${BG} 62%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px">
            <img src="${svg("southbound-logo.svg")}" style="width:860px;display:block">
            <div style="font:600 30px/1 Inter,sans-serif;letter-spacing:.32em;color:#B89B6E;text-transform:uppercase">Faster&nbsp;|&nbsp;Stronger&nbsp;|&nbsp;Smarter</div>
        </div>`]
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [out, width, height, body] of JOBS) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${body}</body></html>`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
    writeFileSync(join(root, out), png);
    console.log("wrote", out, `${width}x${height}`);
}
await browser.close();
