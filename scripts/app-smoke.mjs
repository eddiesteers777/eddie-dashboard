// App smoke test: opens every app page as a signed-in client and as a signed-in
// coach, at a computer width and a phone width, and reports page errors,
// sideways scroll, a background layer that catches taps, and visible buttons or
// links that something else covers. Firebase is faked (see fakeBrowser.mjs).
//   python3 -m http.server 8934 &   then   npm run smoke [-- page.html ...]
// Exits 1 when any page has an issue.
import { chromium, newContext, CLIENT, COACH } from "./fakeBrowser.mjs";

const BASE = process.env.BASE || "http://localhost:8934";
const only = process.argv.slice(2);
const pick = (list) => only.length ? list.filter(p => only.includes(p.split("?")[0])) : list;

async function look(ctx, path, width, height) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|net::|favicon/.test(m.text())) errors.push("console: " + m.text().slice(0, 100)); });
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
        const de = document.documentElement, bg = document.querySelector(".al-bg");
        const shown = [...document.querySelectorAll("main a,.container a,.clients-page a,a.card,button")].filter(e => {
            const b = e.getBoundingClientRect();
            return b.width > 20 && b.height > 20 && b.top > 0 && b.bottom < innerHeight - 90 && b.left >= 0 && b.right <= innerWidth && getComputedStyle(e).visibility !== "hidden";
        }).slice(0, 6);
        const covered = shown.filter(e => {
            const b = e.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
            return !(t && (e.contains(t) || t.contains(e)));
        }).length;
        return { sideways: de.scrollWidth - innerWidth, bgTaps: !!bg && getComputedStyle(bg).pointerEvents !== "none", covered };
    });
    await page.close();
    return { ...r, errors };
}

const browser = await chromium.launch();
let bad = 0, count = 0;
for (const [persona, pages] of [["client", pick(CLIENT)], ["coach", pick(COACH)]]) {
    for (const [width, height] of [[1280, 800], [390, 844]]) {
        const ctx = await newContext(browser, width, persona);
        for (const path of pages) {
            count++;
            const r = await look(ctx, path, width, height);
            const issues = [];
            if (r.errors.length) issues.push("errors: " + r.errors.slice(0, 2).join(" | "));
            if (r.sideways > 1) issues.push(`sideways scroll ${r.sideways}px`);
            if (r.bgTaps) issues.push("background layer takes taps");
            if (r.covered) issues.push(`${r.covered} covered button(s) or link(s)`);
            if (issues.length) { bad++; console.log(`${persona} ${width}px ${path}: ${issues.join("; ")}`); }
        }
        await ctx.close();
    }
}
await browser.close();
console.log(`\nsmoke: ${count} page views, ${bad} with issues.`);
process.exit(bad ? 1 : 0);
