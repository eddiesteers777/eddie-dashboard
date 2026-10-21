const q = new URLSearchParams(location.search), opt = q.get("opt") || "a", view = q.get("view") || "coach";
const app = document.getElementById("app");
const drill = `<span class="tag">Passing</span><h2>Wall passes, both feet</h2>
<p class="note"><span class="pill">Medium</span> &nbsp;10 min · 1+ players · wall or rebounder</p>
<h3>Setup</h3><p>Stand 3 steps from a wall. One ball.</p>
<h3>Coaching points</h3><ul><li>Plant foot beside the ball</li><li>Lock the ankle, strike through the middle</li><li>Receive and pass in one touch where you can</li></ul>`;
const diagram = `<div class="diagram" aria-label="Diagram"><b></b><i class="a" style="left:18%;top:62%"></i><i style="left:66%;top:24%"></i></div>`;
const who = `<span class="hw-lbl">Who is it for</span><div class="who"><button class="on">Maya</button><button>Eli</button><button>Jordan</button><button>Sam</button></div>`;
const cad = `<span class="hw-lbl">How often</span><div class="hw-seg"><button>Once</button><button class="on">Weekly</button><button>Daily</button><button>Goal</button></div>
<div class="hw-two"><div><label class="hw-lbl">Times a week</label><input class="sb-dialog-input" value="3"></div><div><label class="hw-lbl">Due</label><input class="sb-dialog-input" value="Oct 28"></div></div>`;
const note = `Setup: Stand 3 steps from a wall. One ball.\nFocus: Plant foot beside the ball · Lock the ankle, strike through the middle · One touch where you can`;
let html = "";
if (opt === "a") html = `<div class="wrap two"><div class="panel">${drill}<div class="btnrow"><button class="sb-btn sb-btn-primary">Assign as homework</button><button class="sb-btn sb-btn-secondary">Print</button><button class="sb-btn sb-btn-secondary">Edit</button></div></div>
<div class="panel"><span class="tag">Option A · Quick assign</span><h2>Assign to a player</h2>${who}<label class="hw-lbl">Title</label><input class="sb-dialog-input" value="Wall passes, both feet"><span class="hw-lbl">Skill</span><div class="hw-chips"><button class="hw-chip">First touch</button><button class="hw-chip on">Passing</button><button class="hw-chip">Dribbling</button></div>${cad}
<label class="hw-lbl">Note for Maya (filled from the drill, you can edit)</label><div class="preview">${note}</div><div class="btnrow"><button class="sb-btn sb-btn-primary">Assign to Maya</button><button class="sb-btn sb-btn-tertiary">Cancel</button></div>
<p class="note">Text only. Works with today's homework, no database change.</p></div></div>`;
if (opt === "b" && view === "coach") html = `<div class="wrap two"><div class="panel">${drill}${diagram}<div class="btnrow"><button class="sb-btn sb-btn-primary">Assign as homework</button><button class="sb-btn sb-btn-secondary">Print</button></div></div>
<div class="panel"><span class="tag">Option B · With the diagram</span><h2>Assign to a player</h2>${who}<label class="hw-lbl">Title</label><input class="sb-dialog-input" value="Wall passes, both feet"><div class="row" style="border:0;padding:0"><input type="checkbox" checked><span>Send the diagram too</span><span></span></div>${diagram}${cad}
<label class="hw-lbl">Note for Maya</label><div class="preview">${note}</div><div class="btnrow"><button class="sb-btn sb-btn-primary">Assign to Maya</button><button class="sb-btn sb-btn-tertiary">Cancel</button></div>
<p class="note">Maya sees the picture on her homework screen. Needs one Firestore rules change (you paste the file once).</p></div></div>`;
if (opt === "b" && view === "client") html = `<div class="wrap" style="max-width:420px"><div class="panel"><span class="tag">What Maya sees · Up next</span><h2>Wall passes, both feet</h2><p class="note">3 times this week · 10 min · due Oct 28</p>${diagram}<h3>Setup</h3><p>Stand 3 steps from a wall. One ball.</p><h3>Focus</h3><ul><li>Plant foot beside the ball</li><li>Lock the ankle, strike through the middle</li></ul><div class="btnrow"><button class="sb-btn sb-btn-primary">Mark done for today</button></div></div></div>`;
if (opt === "c") html = `<div class="wrap two"><div class="panel"><span class="tag">Practice planner</span><h2>Tuesday passing · 60 min</h2><div class="row"><span></span><span>Rondo 4v1</span><span class="note">12 min</span></div><div class="row"><span></span><span>Wall passes, both feet</span><span class="note">10 min</span></div><div class="row"><span></span><span>Triangle passing</span><span class="note">15 min</span></div><div class="row"><span></span><span>Small-sided 4v4</span><span class="note">20 min</span></div><div class="btnrow"><button class="sb-btn sb-btn-primary">Send as homework pack</button><button class="sb-btn sb-btn-secondary">Print</button></div></div>
<div class="panel"><span class="tag">Option C · Homework pack</span><h2>Pick drills for Maya</h2>${who}
<div class="row"><input type="checkbox" checked><span>Wall passes, both feet<br><span class="note">Weekly · 3 times · 10 min</span></span><span class="pill">Edit</span></div>
<div class="row"><input type="checkbox" checked><span>Triangle passing<br><span class="note">Weekly · 2 times · 15 min</span></span><span class="pill">Edit</span></div>
<div class="row"><input type="checkbox"><span>Rondo 4v1<br><span class="note">Needs 4+ players, so skipped</span></span><span class="pill">Edit</span></div>
<div class="row"><input type="checkbox"><span>Small-sided 4v4<br><span class="note">Needs 8 players, so skipped</span></span><span class="pill">Edit</span></div>
<label class="hw-lbl">Due</label><input class="sb-dialog-input" value="Oct 28"><div class="btnrow"><button class="sb-btn sb-btn-primary">Assign 2 to Maya</button></div>
<p class="note">Makes one homework item per drill. It only suggests drills a player can do alone. Same database as A.</p></div></div>`;
app.innerHTML = html;
