const q = new URLSearchParams(location.search), opt = q.get("opt") || "a";
const app = document.getElementById("app");
const items = [["6:00 pm","Dynamic warm-up","8 min"],["6:08 pm","Rondo 4v1","12 min"],["6:20 pm","Triangle passing","15 min"],["6:35 pm","Small-sided 4v4","20 min"],["6:55 pm","Cool-down and talk","5 min"]];
const list = (diagrams) => items.map(i => `<div class="row"><span class="note">${i[0]}</span><span>${i[1]}</span><span class="note">${i[2]}</span></div>`).join("");
const sess = `<div class="panel"><span class="tag">Thursday · Oct 22 · 6:00 pm</span><h2>Group · U12 passing</h2><p class="note">6 players booked: Maya, Eli, Jordan, Sam, Ava, Noah</p>`;
let html = "";
if (opt === "a") html = `<div class="wrap two">
${sess}<div class="btnrow"><button class="sb-btn sb-btn-primary">Attach a practice plan</button></div></div>
<div class="panel"><span class="tag">Option A · Coach attaches</span><h2>Pick a plan</h2>
<div class="row"><input type="radio" name="p" checked><span>Tuesday passing<br><span class="note">5 drills · 60 min · saved Oct 19</span></span><span class="pill">Preview</span></div>
<div class="row"><input type="radio" name="p"><span>Finishing circuit<br><span class="note">4 drills · 50 min · saved Oct 12</span></span><span class="pill">Preview</span></div>
<div class="row"><input type="radio" name="p"><span>Build from scratch in Practice planner</span><span></span></div>
<label class="hw-lbl">Show the players</label><div class="hw-seg"><button class="on">Plan and times</button><button>Just the focus</button></div>
<div class="btnrow"><button class="sb-btn sb-btn-primary">Attach to Oct 22</button><button class="sb-btn sb-btn-tertiary">Cancel</button></div>
<p class="note">Players only see drill names, times and bring-list. No private notes. Needs a new collection and a Firestore rules change.</p></div></div>
<div class="wrap" style="max-width:440px;margin-top:20px"><div class="panel"><span class="tag">What Maya sees on the Soccer tab · next session</span><h2>Thursday 6:00 pm</h2><p class="note">Group · U12 passing</p><h3>Today's plan · 60 min</h3>${list()}<h3>Bring</h3><p>Ball, water, shin guards</p><h3>Homework before you come</h3><p>Wall passes, both feet: 2 of 3 done this week</p></div></div>`;
if (opt === "b") html = `<div class="wrap" style="max-width:520px"><div class="panel"><span class="tag">Option B · Coach dashboard, session day (private)</span><h2>Today</h2>
<h3>6:00 pm · Group · U12 passing</h3><p class="note">6 booked · 1 homework behind (Sam)</p>${list()}<h3>Equipment</h3><p>8 cones, 4 balls, 2 sets of bibs</p>
<div class="btnrow"><button class="sb-btn sb-btn-primary">Open plan</button><button class="sb-btn sb-btn-secondary">Print</button></div>
<p class="note">Only you see it. Plan comes from your Playbook on this device or account sync. No rules change.</p></div></div>`;
app.innerHTML = html;
