// Browser check of the How to sheet with the licensed (MuscleWiki) videos on,
// without a real key: the Cloud Function and the stream are mocked, and a
// local clip stands in for MuscleWiki's video. Real sheet code, real CSS.
//   python3 -m http.server 8934 &   then   node scripts/demo-check.mjs [outDir]
// See .claude/skills/exercise-demo-integration/SKILL.md.
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:8934";
const out = process.argv[2] || "demo-check-out";
mkdirSync(out, { recursive: true });
// WebM: Playwright's Chromium has no H.264.
const standIn = readFileSync(new URL("../videos/push-up.webm", import.meta.url));
const S = (g, a) => `https://api.musclewiki.com/stream/videos/branded/${g}-Bodyweight-push-up-${a}.mp4?token=eyJtest`;
const OK = {
    found: true,
    exercise: { name: "Push Up", steps: ["Get on the floor with your hands slightly wider than your shoulders.", "Lower your body until your chest nearly touches the floor.", "Push back up, keeping your body in a straight line."] },
    videos: [["male", "front"], ["male", "side"], ["female", "front"], ["female", "side"]].map(([g, a]) => ({ gender: g, angle: a, src: S(g, a), poster: null })),
    expiresAt: Date.now() + 900000
};
// What the fake getExerciseDemo answers, per exercise.
const ANSWERS = { "Push-Up": OK, "Bird Dog": { ...OK, exercise: { ...OK.exercise, name: "Bird Dog" } }, "Lat Pulldown": { found: false }, "Goblet Squat": "error:resource-exhausted" };

const fakeFunctions = `
export const getFunctions = () => ({});
export const httpsCallable = () => async ({ name }) => {
    const a = (${JSON.stringify(ANSWERS)})[name];
    if (typeof a === "string") { const e = new Error("x"); e.code = "functions/" + a.split(":")[1]; throw e; }
    return { data: a || { found: false } };
};`;
const harness = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="css/style.css"></head><body style="background:var(--bg)">
<script type="module">
import { openExerciseDemo } from "./js/exerciseDemoSheet.js";
window.openDemo = (name, opts) => { openExerciseDemo(name, opts); };
window.READY = true;
</script></body></html>`;

const browser = await chromium.launch();
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };

for (const [label, width, height] of [["desktop", 1280, 900], ["phone", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", deviceScaleFactor: 2 });
    let failStream = false;
    await ctx.route("**/__demo.html", r => r.fulfill({ contentType: "text/html", body: harness }));
    await ctx.route("**/js/exerciseDemoConfig.js", r => r.fulfill({ contentType: "text/javascript", body: "export const REMOTE_DEMOS_ENABLED = true;" }));
    await ctx.route("**/js/firebase.js", r => r.fulfill({ contentType: "text/javascript", body: "export const app = {};" }));
    await ctx.route("https://www.gstatic.com/firebasejs/**/firebase-functions.js", r => r.fulfill({ contentType: "text/javascript", body: fakeFunctions }));
    await ctx.route("https://api.musclewiki.com/**", r => failStream
        ? r.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"Media token expired"}' })
        : r.fulfill({ status: 200, contentType: "video/webm", body: standIn }));
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(`${BASE}/__demo.html`);
    await page.waitForFunction("window.READY");

    // 1. A licensed video with male / female and front / side.
    await page.evaluate(() => openDemo("Push-Up", { note: "Elbows at 45 degrees." }));
    await page.waitForSelector(".dm-remote-video", { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector(".dm-remote-video")?.readyState >= 2, null, { timeout: 8000 }).catch(() => {});
    const r1 = await page.evaluate(() => {
        const frame = document.querySelector(".dm-remote-frame");
        const v = frame.querySelector("video");
        return {
            onlyVideo: frame.children.length === 1 && frame.firstElementChild === v,
            src: v.currentSrc || v.src, fit: getComputedStyle(v).objectFit,
            noDownload: v.getAttribute("controlslist")?.includes("nodownload"),
            genders: [...document.querySelectorAll("[data-gender]")].map(b => b.textContent.trim()),
            angles: [...document.querySelectorAll("[data-angle]")].map(b => b.textContent.trim()),
            steps: document.querySelectorAll(".dm-steps-plain li").length,
            credit: document.querySelector("[data-credit] a")?.href,
            small: [...document.querySelectorAll(".dm-dialog button")].filter(b => b.offsetParent && (b.getBoundingClientRect().height < 43.5 || b.getBoundingClientRect().width < 43.5)).map(b => (b.textContent.trim() || b.getAttribute("aria-label")) + " " + Math.round(b.getBoundingClientRect().width) + "x" + Math.round(b.getBoundingClientRect().height)),
            overflow: document.querySelector(".dm-dialog").scrollWidth > document.querySelector(".dm-dialog").clientWidth + 1
        };
    });
    check(`${label}: MuscleWiki video plays with nothing over it`, r1.onlyVideo && r1.fit === "contain" && r1.noDownload && /male-Bodyweight-push-up-front/.test(r1.src), r1.src);
    check(`${label}: Male/Female and Front/Side toggles`, r1.genders.join() === "Male,Female" && r1.angles.join() === "Front,Side");
    check(`${label}: MuscleWiki steps and credit`, r1.steps === 3 && r1.credit === "https://musclewiki.com/");
    check(`${label}: tap targets 44px+`, r1.small.length === 0, r1.small.join(", "));
    check(`${label}: no sideways scroll`, !r1.overflow);
    await page.screenshot({ path: join(out, `${label}-male-front.png`) });
    await page.click('[data-gender="female"]');
    await page.click('[data-angle="side"]');
    const src2 = await page.evaluate(() => document.querySelector(".dm-remote-video").src);
    check(`${label}: switching to female, side view`, /female-Bodyweight-push-up-side/.test(src2));
    const pref = await page.evaluate(() => localStorage.getItem("sb-demo-gender"));
    check(`${label}: demonstrator choice remembered`, pref === "female");
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `${label}-female-side.png`) });
    const state = () => page.evaluate(() => ({ paused: document.querySelector(".dm-remote-video").paused, label: document.querySelector('[data-demo="play"]').getAttribute("aria-label") }));
    const before = await state();
    await page.click('[data-demo="play"]');
    await page.waitForTimeout(200);
    const after = await state();
    check(`${label}: play / pause button toggles the video`, before.paused !== after.paused && after.label === (after.paused ? "Play demo" : "Pause demo"), JSON.stringify([before, after]));
    await page.click("[data-close]");
    await page.evaluate(() => localStorage.removeItem("sb-demo-gender"));

    // 2. The stream fails (expired token twice): our drawn figure takes over.
    failStream = true;
    await page.evaluate(() => openDemo("Bird Dog"));
    await page.waitForSelector(".dm-stage svg", { timeout: 8000 }).catch(() => {});
    const fig = await page.evaluate(() => ({ svg: Boolean(document.querySelector(".dm-stage svg")), remote: Boolean(document.querySelector(".dm-remote-video")), guide: document.querySelectorAll(".dm-steps h3").length }));
    check(`${label}: video fails → drawn figure`, fig.svg && !fig.remote && fig.guide === 3);
    await page.click("[data-close]");
    failStream = false;

    // 3. The server is out of quota: our 3D clip.
    await page.evaluate(() => openDemo("Goblet Squat"));
    await page.waitForSelector(".dm-stage svg, .dm-clip", { timeout: 8000 }).catch(() => {});
    const q = await page.evaluate(() => ({ local: Boolean(document.querySelector(".dm-stage svg, video.dm-clip")), remote: Boolean(document.querySelector(".dm-remote-video")) }));
    check(`${label}: quota error → our own demo`, q.local && !q.remote);
    await page.click("[data-close]");

    // 4. No demo anywhere: the sheet says so, coach note still shown.
    await page.evaluate(() => openDemo("Lat Pulldown", { note: "Pull to your upper chest." }));
    await page.waitForSelector(".dm-none", { timeout: 8000 }).catch(() => {});
    const none = await page.evaluate(() => ({ text: document.querySelector(".dm-none")?.textContent.trim(), note: Boolean(document.querySelector(".dm-note")) }));
    check(`${label}: no demo → a clear message`, /no video for this exercise yet/i.test(none.text || "") && none.note, none.text);
    await page.screenshot({ path: join(out, `${label}-no-demo.png`) });
    await page.click("[data-close]");
    check(`${label}: no page errors`, errors.length === 0, errors.join(" | "));
    await ctx.close();
}
await browser.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
