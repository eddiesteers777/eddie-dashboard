// The "Hot out?" card on a coach-plan workout page: empty, 88F, 98F, below 68F, plus the Ask dialog.
// Serve the repo first: python3 -m http.server 8934. Run: node scripts/heat-states.mjs <outDir>
import fs from "node:fs";
import { chromium, newContext } from "./fakeBrowser.mjs";
import { blankPlan } from "../js/coachingPlanModel.js";
import { planDayFromMarathon } from "../js/marathonCoros.js";
import { PACES } from "../js/marathonData.js";
const OUT = process.argv[2] || "/tmp/heat"; fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync("./scripts/fakeBrowser.mjs", "utf8");
const ffSrc = src.slice(src.indexOf("const fakeFirestore = (docs) => `") + "const fakeFirestore = (docs) => `".length, src.indexOf("`;\nconst fakeFunctions"));
const gp = blankPlan("2026-10-26", 6);
const d = gp.weeks[0].days;
const workout = planDayFromMarathon({ session: "2mi WU; 3mi @ 6:43; 1mi CD", miles: 6, pace: "Threshold" }, PACES).workout;
d[1] = { ...d[1], type: "workout", miles: 6, session: "Tempo", workout };
gp.weeks[0].phase = "Base";
const plan = [{ id: "coach-p1", coachPlanId: "p1", coachVersion: 1, name: "Fall 10K", kind: "running", coachName: "Eddie", coachUid: "coach1", status: "active", source: "coach", generatedPlan: gp }];
const rows = { coachLinks: [{ coachUid: "coach1", coachName: "Eddie", clientUid: "client1" }] };
const b = await chromium.launch();
for (const w of [390, 1280]) {
  const ctx = await newContext(b, w, "client");
  const ff = ffSrc.replace("${JSON.stringify(docs)}", JSON.stringify({ "userProfiles/client1": { uid: "client1", role: "client", status: "active", isCoachApproved: false, services: ["online_coaching", "running"], displayName: "Test Client", coachUid: "coach1" } }))
    .replace("export const getDocs = async () => empty;", `const ROWS = ${JSON.stringify(rows)}; export const getDocs = async (q) => { const k = Object.keys(ROWS).find(c => q.path.startsWith(c)); const list = (ROWS[k]||[]).map((d,i)=>({ id: k+i, data: () => d })); return { docs: list, empty: !list.length, size: list.length, forEach(f){ list.forEach(f); }, docChanges: () => [] }; };`);
  await ctx.route(/gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js/, r => r.fulfill({ contentType: "text/javascript", body: ff }));
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem("sb-account-role", "client"); localStorage.setItem(k, v); } catch {} }, ["coach-plans", JSON.stringify(plan)]);
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.clock?.install?.({ time: new Date("2026-10-27T08:00:00") }).catch(() => {});
  await p.goto("http://127.0.0.1:8934/workout.html?program=coach-p1&date=2026-10-27");
  await p.waitForSelector("#woHeatInput", { timeout: 8000 });
  const shot = async name => { await p.locator(".wo-heat").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/heat-${name}-${w}.png` }); };
  await shot("empty");
  for (const [name, val] of [["88", "88"], ["98", "98"], ["cool", "60"]]) {
    await p.fill("#woHeatInput", val);
    const text = await p.locator("#woHeatOut").innerText();
    const info = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, small: [...document.querySelectorAll(".wo-heat button, .wo-heat input")].filter(e => e.getBoundingClientRect().height < 44).length }));
    console.log(w, val, JSON.stringify(info), text.replace(/\s+/g, " ").slice(0, 110));
    await shot(name);
  }
  await p.fill("#woHeatInput", "88");
  await p.click('[data-act="heat-ask"]');
  await p.waitForSelector("dialog[open] textarea");
  console.log(w, "dialog message:", (await p.inputValue("dialog textarea")).slice(0, 90), "| reason checked:", await p.evaluate(() => document.querySelector("dialog input[name=reason]:checked")?.value));
  await p.screenshot({ path: `${OUT}/heat-dialog-${w}.png` });
  console.log(w, "errors:", errs.slice(0, 3));
  await ctx.close();
}
await b.close();
