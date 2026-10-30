// My Plan, every state (plan, empty, failed, loading) at phone and desktop width, with optional axe/tap checks.
// Serve the repo first: python3 -m http.server 8934. Run: node scripts/plan-states.mjs <outDir> [plan,emptyCoach,emptyUnlinked,failed,failedFast,loading]. Env: W=390,1280 AXE=1 TAPS=1
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
import { blankPlan } from "../js/coachingPlanModel.js";
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync("./fakeBrowser.mjs", "utf8");
const ffSrc = src.slice(src.indexOf("const fakeFirestore = (docs) => `") + "const fakeFirestore = (docs) => `".length, src.indexOf("`;\nconst fakeFunctions"));
const gp = blankPlan("2026-10-26", 6);
const d = gp.weeks[0].days;
d[0] = { ...d[0], type: "easy", miles: 5, session: "Easy run", completed: true };
d[1] = { ...d[1], type: "workout", miles: 7, session: "3 x 1 mi at threshold" };
d[3] = { ...d[3], type: "easy", miles: 5, session: "Easy run" };
d[5] = { ...d[5], type: "long", miles: 12, session: "Long run" };
gp.weeks[0].phase = "Base";
const plan = [{ id: "coach-p1", coachPlanId: "p1", coachVersion: 1, name: "Fall 10K", kind: "running", coachName: "Eddie", coachUid: "coach1", status: "active", source: "coach", generatedPlan: gp }];
const scenarios = {
  plan:   { ls: { "coach-plans": JSON.stringify(plan) }, getDocs: (p) => p.includes("coachLinks") ? [{ coachUid: "coach1", coachName: "Eddie", clientUid: "client1" }] : [] },
  emptyCoach: { getDocs: (p) => p.includes("coachLinks") ? [{ coachUid: "coach1", coachName: "Eddie", clientUid: "client1" }] : [] },
  emptyUnlinked: { getDocs: () => [] },
  failed: { hang: true },
  failedFast: { reject: true },
  loading: { hang: true, shotAt: 1500 },
};
const which = (process.argv[3] || Object.keys(scenarios).join(",")).split(",");
const widths = process.env.W ? process.env.W.split(",").map(Number) : [360, 390, 1280];
const b = await chromium.launch();
for (const name of which) {
  const sc = scenarios[name];
  for (const w of (sc.shotAt ? [390, 1280] : widths)) {
    for (const reduce of (name === "plan" && w === 390 ? [false, true] : [false])) {
    const ctx = await newContext(b, w, "client");
    let ff = ffSrc.replace("${JSON.stringify(docs)}", JSON.stringify({ "userProfiles/client1": { uid: "client1", role: "client", status: "active", isCoachApproved: false, services: ["online_coaching","running","strength"], displayName: "Test Client", coachUid: "coach1" } }));
    const rows = {};
    if (sc.getDocs) for (const c of ["coachLinks", "coachingPlans", "changeRequests"]) rows[c] = sc.getDocs(c);
    ff = ff.replace("export const getDocs = async () => empty;",
      sc.hang ? `export const getDocs = (q) => new Promise(() => {});`
      : sc.reject ? `export const getDocs = async () => { throw Object.assign(new Error("unavailable"), { code: "unavailable" }); };`
      : `const ROWS = ${JSON.stringify(rows)}; export const getDocs = async (q) => { const k = Object.keys(ROWS).find(c => q.path.startsWith(c)); const list = (ROWS[k]||[]).map((d,i)=>({ id: k+i, data: () => d })); return { docs: list, empty: !list.length, size: list.length, forEach(f){ list.forEach(f); }, docChanges: () => [] }; };`);
    await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js/, r => r.fulfill({ contentType: "text/javascript", body: ff }));
    await ctx.addInitScript(([ls, uid]) => { try { localStorage.setItem("sb-account-role", "client"); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } catch {} }, [sc.ls || {}, "client1"]);
    const p = await ctx.newPage();
    if (reduce) await p.emulateMedia({ reducedMotion: "reduce" });
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.clock?.install?.({ time: new Date("2026-10-30T14:00:00") }).catch(() => {});
    await p.goto("http://127.0.0.1:8934/plan.html");
    // Mid-reveal probe
    if (name === "plan" || name.startsWith("empty")) {
      await p.waitForSelector("#planBody > *", { timeout: 8000 }).catch(() => {});
      const probe = await p.evaluate(() => { const el = document.querySelector("#planBody > *"); const cs = el && getComputedStyle(el); return { cls: document.getElementById("planBody").className, anim: cs?.animationName, dur: cs?.animationDuration }; });
      console.log(name, w, reduce ? "reduce" : "", "reveal:", JSON.stringify(probe));
    }
    if (sc.shotAt) { await p.waitForTimeout(sc.shotAt);
      const anims = await p.evaluate(() => document.getAnimations().filter(a => !a.effect?.target?.closest?.(".al-fabric, .al-bg")).map(a => (a.animationName || a.constructor.name) + ":" + (a.effect?.target?.className || "")).slice(0, 10));
      console.log(name, w, "running animations (excl. skeleton shimmer):", JSON.stringify(anims));
    } else if (name.startsWith("failed") && sc.hang) await p.waitForTimeout(16500);
    else await p.waitForTimeout(1500);
    const info = await p.evaluate(() => ({ loading: !document.getElementById("planLoading").hidden, text: document.querySelector("main").innerText.replace(/\s+/g, " ").slice(0, 160), overflow: document.documentElement.scrollWidth > innerWidth }));
    console.log(name, w, JSON.stringify(info), errs.slice(0, 3));
    if (process.env.TAPS) { const t = await p.evaluate(() => [...document.querySelectorAll("#planBody .sb-btn, #planBody a.sb-btn")].map(b => b.textContent.trim().slice(0,20) + ":" + Math.round(b.getBoundingClientRect().height))); console.log(name, w, "taps:", JSON.stringify(t));
      if (name === "failedFast") { await p.click("[data-retry]"); const mid = await p.evaluate(() => !document.getElementById("planLoading").hidden); await p.waitForTimeout(1500); const after = await p.evaluate(() => document.querySelector("#planBody").innerText.slice(0,30)); console.log("retry: loading shown", mid, "then", JSON.stringify(after)); } }
    if (process.env.AXE) { await p.waitForTimeout(800); await p.addScriptTag({ path: "node_modules/axe-core/axe.min.js" }); const r = await p.evaluate(async () => (await axe.run(document.querySelector("main"), { runOnly: ["wcag2a","wcag2aa"] })).violations.map(v => v.id + " x" + v.nodes.length + " " + v.nodes.slice(0,2).map(n=>n.target.join(" ")).join(" | "))); console.log(name, w, "axe:", JSON.stringify(r)); }
    await p.screenshot({ path: `${OUT}/${name}-${w}${reduce ? "-reduced" : ""}.png`, fullPage: false });
    await ctx.close();
  }}
}
await b.close();
