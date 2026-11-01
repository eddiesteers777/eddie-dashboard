// Build a Route as a guest (public shell, no sign-in, Save replaced by a sign-in card) and as a signed-in client (app shell):
// tabs, tap sizes, no sideways scroll, no page errors, screenshots. Serve the repo first: python3 -m http.server 8934.
// Run: node scripts/route-public-check.mjs <outDir>
import fs from "node:fs";
import { chromium, newContext } from "/home/user/eddie-dashboard/scripts/fakeBrowser.mjs";
const OUT=process.argv[2]; fs.mkdirSync(OUT,{recursive:true}); const b=await chromium.launch(); const res=[];
const ck=(n,ok,d="")=>{res.push(ok);console.log(`${ok?"PASS":"FAIL"}  ${n}${d?"  -> "+d:""}`)};
async function run(w, persona) {
  const phone=w<700; const tag=`${persona?"app":"guest"}-${w}`;
  const ctx=await newContext(b,w,persona,phone?{hasTouch:true,isMobile:true,deviceScaleFactor:2}:{});
  await ctx.addInitScript(()=>{try{localStorage.setItem("route-view",JSON.stringify({c:[35.0578,-85.3085],z:15}))}catch{}});
  await ctx.route(/overpass-api\.de/, r=>r.fulfill({contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:'{"elements":[]}'}));
  const p=await ctx.newPage(); const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:8934/routes.html",{waitUntil:"networkidle"});
  await p.waitForSelector("#rbMap .leaflet-tile-loaded",{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(1200);
  const m=await p.evaluate(()=>({pub:!!document.querySelector(".pub-navbar, #publicHeader *"),appHdr:!!document.querySelector("#header .eos-nav, #header nav, .eos-bottomnav"),url:location.pathname,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,save:getComputedStyle(document.getElementById("rbSave")).display,guest:!!document.querySelector(".rb-guest")&&getComputedStyle(document.querySelector(".rb-guest")).display!=="none",ftr:!!document.querySelector(".pub-footer"),saved:getComputedStyle(document.getElementById("rbSavedCard")).display, bg:document.documentElement.classList.contains("pl-on")}));
  if(persona){ ck(`${tag} app shell, no public header/footer`, m.appHdr && !m.ftr && !m.guest && !m.bg, JSON.stringify(m)); }
  else { ck(`${tag} public shell: header, footer, no app nav, stays on page`, m.pub && !m.appHdr && m.ftr && m.url.endsWith("routes.html") && m.bg, JSON.stringify(m)); ck(`${tag} Save hidden, sign-in card shown, saved list hidden`, m.save==="none" && m.guest && m.saved==="none"); }
  ck(`${tag} no sideways scroll`, m.sw<=m.cw, `${m.sw}/${m.cw}`);
  await p.screenshot({path:`${OUT}/${tag}-empty-top.png`});
  const box=await p.locator("#rbMap").boundingBox();
  for (const [fx,fy] of [[.3,.62],[.55,.45],[.72,.64]]) { const x=box.x+box.width*fx,y=box.y+box.height*fy; if(phone) await p.touchscreen.tap(x,y); else await p.mouse.click(x,y); await p.waitForTimeout(300);}
  await p.waitForFunction(()=>document.getElementById("rbDist").textContent!=="—",null,{timeout:30000}).catch(()=>{});
  await p.waitForTimeout(3500);
  ck(`${tag} three taps make a route`, await p.evaluate(()=>window.__routeBuilder.waypoints.length===3 && document.getElementById("rbDist").textContent!=="—"));
  // tabs
  const tabs=await p.evaluate(()=>[...document.querySelectorAll("#rbTabs [data-tab]")].map(t=>t.dataset.tab));
  let vis=[];
  for (const t of tabs){ await p.locator(`#rbTab-${t}`).click(); vis.push(await p.evaluate(t=>[...document.querySelectorAll("[data-panel]")].filter(x=>!x.hidden).map(x=>x.dataset.panel).join("+"),t)); }
  ck(`${tag} each tab shows exactly its own panel`, vis.join()===tabs.join(), vis.join());
  // keyboard
  await p.locator("#rbTab-route").click(); await p.locator("#rbTab-route").focus(); await p.keyboard.press("ArrowRight");
  ck(`${tag} arrow key moves to the next tab`, await p.evaluate(()=>document.getElementById("rbTab-safety").getAttribute("aria-selected")==="true"));
  await p.locator("#rbTab-route").click();
  // tap sizes
  const small=await p.evaluate(()=>[...document.querySelectorAll(".rb-page button, .rb-page input, .rb-page .rb-link, .rb-guest a")].filter(e=>e.offsetParent&&!e.closest("[hidden]")&&!e.closest(".rb-prefs")&&!e.closest(".leaflet-control-container")).map(e=>{const r=e.getBoundingClientRect();return{t:(e.id||e.className||e.tagName).toString().slice(0,24),h:Math.round(r.height),fs:parseFloat(getComputedStyle(e).fontSize),i:e.tagName==="INPUT"}}).filter(x=>x.h<44||(x.i&&x.fs<16)));
  ck(`${tag} tap targets >= 44px`, small.length===0, JSON.stringify(small));
  await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(200);
  await p.screenshot({path:`${OUT}/${tag}-route-top.png`});
  const tabTop=await p.evaluate(()=>document.getElementById("rbTabs").getBoundingClientRect().top+scrollY);
  await p.evaluate(y=>scrollTo(0,y-70),tabTop); await p.waitForTimeout(300); await p.screenshot({path:`${OUT}/${tag}-tab-route.png`});
  for (const t of ["safety","fuel","save"]) { await p.locator(`#rbTab-${t}`).click(); await p.waitForTimeout(500); await p.evaluate(y=>scrollTo(0,y-70),tabTop); await p.screenshot({path:`${OUT}/${tag}-tab-${t}.png`}); }
  ck(`${tag} no page errors`, errs.length===0, errs.join(" | ").slice(0,200));
  await ctx.close();
}
for (const w of [390,1280]) { await run(w,null); await run(w,"client"); }
await b.close(); console.log(res.every(Boolean)?"ALL PASS":"SOME FAIL");
