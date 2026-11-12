// The Readiness card on Today, every state (watch, no watch with a log, no watch and nothing yet) at phone and desktop width,
// with a row open and the Connect sheet. Serve the repo first: python3 -m http.server 8934.
// Run: node scripts/readiness-states.mjs <outDir> [persona=client]. Prints the page errors and any sideways scroll it finds.
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const persona = process.argv[3] || "client";
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const health = {};
for (let i = 0; i < 28; i++) health[iso(-i)] = { hrv: { avg: [56, 58, 55, 52, 57, 54, 49][i % 7], baseline: 55, low: 50, high: 61 }, rhr: [47, 47, 48, 49, 47, 48, 48][i % 7], sleep: { asleepMin: [432, 410, 450, 395, 440, 425, 380][i % 7], wake: "06:10" } };
const checkins = {};
for (let i = 0; i < 20; i++) checkins[iso(-i)] = { energy: i === 0 ? 4 : 3 + (i % 3 ? 1 : 0), soreness: i < 4 ? 3 : 2, mood: 4 };
const log = { entries: [] };
[[-26, 14], [-24, 4], [-19, 6], [-17, 8], [-12, 6], [-10, 8], [-8, 5], [-6, 6], [-4, 7], [-3, 5], [-1, 8]].forEach(([d, m], i) => log.entries.push({ id: "r" + i, date: iso(d), miles: m, type: m >= 8 ? "Long" : "Easy", name: "Run" }));
const rpe = { "l:r10": { rpe: 7, at: Date.now(), scale: "cr10" }, "l:r8": { rpe: 6, at: Date.now(), scale: "cr10" } };

const scenarios = {
    watch: { "coros-health-history": health, "readiness-checkins": { [iso(0)]: checkins[iso(0)] } },
    log: { "running-log": log, "readiness-checkins": checkins, "session-rpe": rpe },
    empty: {}
};
const b = await chromium.launch();
const problems = [];
for (const [name, ls] of Object.entries(scenarios)) {
    for (const w of [390, 1280]) {
        const ctx = await newContext(b, w, persona);
        await ctx.addInitScript(items => { const n = new Date(); localStorage.setItem("sb-splash-day", `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`); for (const [k, v] of Object.entries(items)) localStorage.setItem(k, JSON.stringify(v)); }, ls);
        const page = await ctx.newPage();
        page.on("pageerror", e => problems.push(`${name}@${w}: ${e.message}`));
        await page.goto("http://localhost:8934/index.html");
        await page.waitForSelector("#readinessCard .rd-body", { timeout: 8000 }).catch(() => problems.push(`${name}@${w}: card never drew`));
        await page.waitForTimeout(600);
        const card = page.locator("#readinessCard");
        // Today fades its sections in as they scroll into view: scroll to the card and give it time before the picture.
        const shot = async file => { await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200); await card.screenshot({ path: file }); };
        await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);   // Today fades sections in as they scroll into view
        await shot(`${OUT}/${name}-${w}.png`);
        const first = await card.locator("[data-trend]").first().elementHandle().catch(() => null);
        if (first) {
            await card.locator("[data-trend]").first().click();
            await page.waitForTimeout(900);
            await shot(`${OUT}/${name}-${w}-open.png`);
            const chart = card.locator(".sb-chart").first();
            if (await chart.count()) { const box = await chart.boundingBox(); await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5); await page.waitForTimeout(300); await shot(`${OUT}/${name}-${w}-hover.png`); }
        }
        if (w === 390) {
            const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
            if (wide) problems.push(`${name}@${w}: sideways scroll`);
            const small = await page.evaluate(() => [...document.querySelectorAll("#readinessCard button, #readinessCard a")].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 40); }).map(e => e.textContent.trim().slice(0, 20)));
            if (small.length) problems.push(`${name}@${w}: short tap targets ${JSON.stringify(small)}`);
        }
        if (name === "log" && w === 390) {
            const conn = card.locator('[data-act="connect"]').first();
            if (await conn.count()) { await conn.click(); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/connect-sheet-390.png` }); }
        }
        await ctx.close();
    }
}
await b.close();
console.log(problems.length ? problems.join("\n") : "no page errors, no sideways scroll, no short taps");
