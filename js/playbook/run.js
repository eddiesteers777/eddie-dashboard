// Run practice: the plan as a checklist with one pinned timer. State lives in runModel.js.
import "./shell.js";
import * as D from "./drillModel.js";
import * as P from "./practiceModel.js";
import * as R from "./runModel.js";
import { SEED_DRILLS } from "./drillSeed.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
let run = null, lock = null, buzzed = -1;

function loadDrills() {
    try { const l = D.parseDrills(localStorage.getItem(KEYS.drills) || ""); if (l) return l; } catch {}
    return D.mergeSeeds([], SEED_DRILLS);
}
function planFrom(practice, drills) {
    const by = new Map(drills.map(d => [d.id, d]));
    return R.newRun(practice.items.filter(i => by.has(i.drillId)).map(i => {
        const d = by.get(i.drillId);
        return { name: d.name, minutes: i.minutes, note: d.points && d.points[0] ? d.points[0] : "" };
    }), practice.title, Date.now());
}
const save = () => { try { run ? localStorage.setItem(KEYS.run, R.serializeRun(run)) : localStorage.removeItem(KEYS.run); } catch {} };
const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };
const now = () => Date.now();

async function keepAwake(on) {
    try {
        if (on && !lock && "wakeLock" in navigator) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
        if (!on && lock) { await lock.release(); lock = null; }
    } catch { /* not allowed: the timer still works */ }
}
const apply = next => { run = next; save(); render(); };

function endClock(r) {
    if (r.status !== "running") return "";
    const left = R.remaining(r, now()), rest = r.items.reduce((a, it, i) => (r.done[i] || r.skipped[i] || i === r.active ? a : a + it.minutes + r.extra[i]), 0);
    const d = new Date(now() + Math.max(0, left) + rest * 60000);
    return "Ends " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function renderList() {
    const list = $("rnList"); list.replaceChildren();
    run.items.forEach((it, i) => {
        const isNow = i === run.active, done = run.done[i];
        const li = h("li", "rn-item" + (isNow ? " now" : "") + (done ? " done" : "") + (run.skipped[i] ? " skipped" : ""));
        const ck = h("button", "rn-ck"); ck.type = "button";
        ck.setAttribute("aria-label", done ? `Un-check ${it.name}` : `Mark ${it.name} done`);
        ck.setAttribute("aria-pressed", String(done));
        ck.textContent = done ? "✓" : "";
        ck.onclick = () => apply(done ? R.undo(run, i, now()) : (i === run.active ? R.complete(run, now()) : { ...run, done: run.done.map((d, k) => (k === i ? true : d)), skipped: run.skipped.map((d, k) => (k === i ? false : d)) }));
        const body = h("button", "rn-body"); body.type = "button";
        body.onclick = () => { if (!done) apply(R.goTo(run, i, now())); };
        const sub = done ? "Done" : run.skipped[i] ? "Skipped" : isNow ? (run.status === "ready" ? "Up now" : "Running now") : "Up next";
        body.append(h("b", "", it.name), h("span", "", sub + (it.note && isNow ? " · " + it.note : "")));
        li.append(ck, body, h("em", "", `${it.minutes + run.extra[i]}m`));
        list.append(li);
    });
}

function renderDock() {
    const dock = $("rnDock"), finished = R.isFinished(run), n = now();
    dock.classList.toggle("fin", finished);
    const btns = $("rnBtns"); btns.replaceChildren();
    const b = (label, fn, cls = "") => { const x = h("button", "pb-btn " + cls, label); x.type = "button"; x.onclick = fn; btns.append(x); return x; };
    if (finished) {
        $("rnName").textContent = "Practice done";
        $("rnState").textContent = `${R.doneCount(run)} of ${run.items.length} checked off`;
        $("rnClock").textContent = "Nice work";
        $("rnFill").style.width = "100%";
        b("Start over", () => apply(R.newRun(run.items, run.title, now())), "pb-primary");
        return;
    }
    $("rnName").textContent = run.items[run.active].name;
    if (run.status === "ready") {
        $("rnState").textContent = "Ready";
        b("Start", () => apply(R.start(run, now())), "pb-primary rn-wide");
    } else {
        $("rnState").textContent = run.status === "paused" ? "Paused" : endClock(run);
        b("◀", () => apply(R.step(run, -1, now())), "rn-sq").setAttribute("aria-label", "Previous activity");
        b(run.status === "paused" ? "Resume" : "Pause", () => apply(run.status === "paused" ? R.resume(run, now()) : R.pause(run, now())));
        b("+1 min", () => apply(R.addMinute(run, now())));
        b("Done ✓", () => apply(R.complete(run, now())), "pb-primary");
        b("▶", () => apply(R.step(run, 1, now())), "rn-sq").setAttribute("aria-label", "Next activity");
    }
    paintTime(n);
}
function paintTime(n) {
    if (!run || R.isFinished(run)) return;
    const left = R.remaining(run, n);
    $("rnClock").textContent = R.clock(left);
    $("rnDock").classList.toggle("over", left < 0);
    $("rnFill").style.width = Math.round(R.used(run, n) * 100) + "%";
    if (left <= 0 && run.status === "running" && buzzed !== run.active) { buzzed = run.active; try { navigator.vibrate && navigator.vibrate([300, 120, 300]); } catch {} }
    document.title = (run.status === "running" ? R.clock(left) + " · " : "") + "Run practice | Southbound Playbook";
}

function render() {
    $("rnEmpty").hidden = Boolean(run); $("rnRun").hidden = !run; $("rnReset").hidden = !run;
    if (!run) { $("rnTitle").textContent = "Run practice"; $("rnMeta").textContent = ""; keepAwake(false); return; }
    $("rnTitle").textContent = run.title;
    $("rnMeta").textContent = `${run.items.length} activities · ${R.plannedMinutes(run)} min · ${R.doneCount(run)} done`;
    renderList(); renderDock();
    keepAwake(run.status === "running");
}

function openMine() {
    let list = []; try { list = P.parsePracticeList(localStorage.getItem(KEYS.practices) || ""); } catch {}
    const box = $("rnMineList"); box.replaceChildren(); $("rnMineEmpty").hidden = list.length > 0;
    for (const it of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
        const li = h("li", "pb-item"); li.append(h("b", "", it.name), h("small", "", `${it.practice.items.length} drills · ${it.practice.total} min`));
        const row = h("div", "pb-row"), b = h("button", "pb-btn pb-primary", "Run this"); b.type = "button";
        b.onclick = () => { const r = planFrom(it.practice, loadDrills()); if (!r.items.length) return toast("That plan has no drills"); $("rnDlg").close(); buzzed = -1; apply(r); };
        row.append(b); li.append(row); box.append(li);
    }
    $("rnDlg").showModal();
}

function init() {
    // Coming from the Season page: run that saved practice from the start.
    const want = new URLSearchParams(location.search).get("plan");
    if (want) {
        try {
            const hit = P.parsePracticeList(localStorage.getItem(KEYS.practices) || "").find(p => p.id === want);
            const r = hit ? planFrom(hit.practice, loadDrills()) : null;
            if (r && r.items.length) { run = r; save(); } else toast("That plan has no drills");
        } catch {}
        try { history.replaceState(null, "", "playbook-run.html"); } catch {}
    }
    let saved = null; try { saved = R.parseRun(localStorage.getItem(KEYS.run) || ""); } catch {}
    if (run) { /* started from the Season page */ }
    else if (saved) run = saved;
    else {
        let pr = null; try { pr = P.parsePractice(JSON.parse(localStorage.getItem(KEYS.practice) || "null")); } catch {}
        const r = pr ? planFrom(pr, loadDrills()) : null;
        run = r && r.items.length ? r : null;
        if (run) save();
    }
    $("rnMine").onclick = openMine; $("rnMineClose").onclick = () => $("rnDlg").close();
    $("rnReset").onclick = () => {
        const b = $("rnReset");
        if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Tap again to start over"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "Start over"; }, 3000); return; }
        b.dataset.arm = ""; b.textContent = "Start over";
        let pr = null; try { pr = P.parsePractice(JSON.parse(localStorage.getItem(KEYS.practice) || "null")); } catch {}
        const r = pr ? planFrom(pr, loadDrills()) : null;
        buzzed = -1; apply(r && r.items.length ? r : null);
    };
    render();
    setInterval(() => { if (run && run.status === "running") { paintTime(now()); const l = $("rnState"); if (l && !R.isFinished(run)) l.textContent = endClock(run); } }, 500);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && run) { paintTime(now()); keepAwake(run.status === "running"); } });
}
init();
