// Accessibility check with axe-core (Deque, MPL-2.0, a dev dependency used
// as is, never copied into the site). Opens every website page as a guest
// and every app page as a signed-in coach and a signed-in client, at a
// computer width and a phone width, and lists what axe finds.
//   python3 -m http.server 8934 &   then   npm run a11y [-- page.html ...]
// Firebase is faked in the browser (a signed-in user, empty data), so the
// real page code, CSS and header run without an account or network.
// Exits 1 when a serious or critical issue is found.
import { chromium, newContext, GUEST, CLIENT, COACH } from "./fakeBrowser.mjs";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8934";
const AXE = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function check(ctx, path) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${BASE}/${path}`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(700);
    const landed = page.url().replace(BASE + "/", "");
    await page.addScriptTag({ content: AXE });
    const violations = await page.evaluate(async (tags) => {
        // The round account button shows initials ("TC") and is named "Account: Test"; the
        // initials are decoration, so axe skips that one button.
        const r = await window.axe.run({ exclude: [[".account-btn"]] }, { runOnly: { type: "tag", values: tags } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.map(n => ({ target: n.target.join(" "), why: (n.any[0] || n.all[0] || n.none[0] || {}).message || "" })) }));
    }, TAGS);
    await page.close();
    return { landed, violations, errors };
}

const only = process.argv.slice(2);
const pick = (list) => only.length ? list.filter(p => only.includes(p.split("?")[0])) : list;
const runs = [["guest", pick(GUEST)], ["client", pick(CLIENT)], ["coach", pick(COACH)]];
const browser = await chromium.launch();
let serious = 0, total = 0;
for (const width of [1280, 390]) {
    for (const [persona, pages] of runs) {
        if (!pages.length) continue;
        const ctx = await newContext(browser, width, persona === "guest" ? null : persona);
        for (const path of pages) {
            const { landed, violations, errors } = await check(ctx, path);
            const moved = landed.split("#")[0] !== path ? `  (landed on ${landed})` : "";
            if (!violations.length && !moved) continue;
            console.log(`\n${persona} ${width}px ${path}${moved}`);
            for (const v of violations) {
                total++;
                if (v.impact === "serious" || v.impact === "critical") serious++;
                console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
                for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target}  ${n.why.slice(0, 120)}`);
            }
            if (errors.length && process.env.SHOW_ERRORS) console.log("  page errors:", errors.slice(0, 3).join(" | "));
        }
        await ctx.close();
    }
}
await browser.close();
console.log(`\naxe: ${total} issue types found, ${serious} serious or critical.`);
process.exit(serious ? 1 : 0);
