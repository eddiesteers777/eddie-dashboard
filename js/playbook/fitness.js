// Day 1 baseline: a 1 mile result and a beep test with its own beeps. Model: fitnessModel.js.
import "./shell.js";
import * as F from "./fitnessModel.js";
import * as R from "./rosterModel.js";
import * as RUN from "./runModel.js";
import { unlockAudio, releaseAudio, SOUND_HINT, audioReport } from "./audioUnlock.js";
import { DAY_ONE_ITEMS } from "./conditioningModel.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };

let results = [];
try { results = F.parse(localStorage.getItem(KEYS.baseline) || ""); } catch {}
const save = () => { try { localStorage.setItem(KEYS.baseline, F.serialize(results)); return true; } catch { toast("Couldn't save on this device"); return false; } };
let roster = [];
try { roster = R.parseRoster(localStorage.getItem(KEYS.roster) || "") || []; } catch {}
const names = roster.map(p => String(p.name || "").split(" ")[0]).filter(Boolean);

function renderList() {
    const day = $("ftDate").value, list = $("ftList"); list.replaceChildren();
    const rows = results.filter(r => r.date === day).sort((a, b) => a.name.localeCompare(b.name));
    $("ftEmpty").hidden = rows.length > 0;
    for (const r of rows) {
        const li = h("li", "ft-item");
        const bits = [];
        if (r.mile) bits.push(`Mile ${r.mile.seconds ? F.clockText(r.mile.seconds) : "no time"}${r.mile.nonstop ? ", ran it all" : ", walked"}`);
        if (r.beep) bits.push(r.beep.level ? `Beep ${F.scoreText(r.beep.level, r.beep.shuttle)}` : "Beep: out in level 1");
        const del = h("button", "pb-btn", "Remove"); del.type = "button";
        del.setAttribute("aria-label", `Remove ${r.name}'s results`);
        del.onclick = () => { results = F.removeResult(results, r.name, r.date); save(); renderList(); };
        li.append(h("b", "", r.name), h("span", "", bits.join(" · ")), del);
        list.append(li);
    }
}

// ---- 1 mile ----
$("ftMileSave").onclick = () => {
    const name = $("ftMileName").value, time = $("ftMileTime").value.trim();
    const seconds = time ? F.parseClock(time) : null;
    if (!name.trim()) return toast("Add the player's first name");
    if (time && seconds === null) return toast("Time looks like 8:30");
    results = F.setResult(results, { name, date: $("ftDate").value, test: "mile", value: { seconds, nonstop: $("ftMileNonstop").checked } });
    if (save()) { toast(`Saved ${name.trim()}'s mile`); $("ftMileName").value = ""; $("ftMileTime").value = ""; $("ftMileNonstop").checked = true; renderList(); }
};

// ---- beep test ----
const sched = F.schedule();
let ctx = null, t0 = 0, timer = 0, raf = 0, nextIdx = 0, lock = null, running = false;
const out = new Set();

function beep(at, freq = 880, len = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.6, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + len + 0.02);
}
// Beeps are scheduled a little ahead on the audio clock so a busy phone doesn't make them drift.
function pump() {
    while (nextIdx < sched.length && t0 + sched[nextIdx].at < ctx.currentTime + 0.6) {
        const b = sched[nextIdx], at = t0 + b.at;
        if (b.last && nextIdx < sched.length - 1) { beep(at, 1320, 0.1); beep(at + 0.18, 1320, 0.1); beep(at + 0.36, 1320, 0.1); } else beep(at);
        nextIdx++;
    }
}
const position = () => F.positionAt(ctx.currentTime - t0, sched);

function renderOut() {
    const box = $("ftOut"); box.replaceChildren();
    for (const n of names) {
        const b = h("button", "pb-btn ft-name" + (out.has(n) ? " is-out" : ""), n); b.type = "button";
        b.disabled = !running || out.has(n);
        b.onclick = () => markOut(n);
        box.append(b);
    }
}
function markOut(name) {
    const n = String(name || "").trim();
    if (!n || !running || out.has(n)) return;
    const c = F.completed(position());
    results = F.setResult(results, { name: n, date: $("ftDate").value, test: "beep", value: c });
    out.add(n); save(); renderOut(); renderList();
    toast(c.level ? `${n}: ${F.scoreText(c.level, c.shuttle)}` : `${n}: out in level 1`);
}
function tick() {
    if (!running) return;
    const s = ctx.currentTime - t0;
    if (s < 0) { $("ftLevel").textContent = String(Math.ceil(-s)); $("ftMeta").textContent = "Get on the line"; }
    else {
        const p = position();
        $("ftLevel").textContent = `${p.level}.${p.shuttle}`;
        $("ftMeta").textContent = `Level ${p.level} · ${F.levelSpeed(p.level)} km/h`;
        if (p.done) return stop();
    }
    raf = requestAnimationFrame(tick);
}
async function keepAwake(on) {
    try {
        if (on && !lock && "wakeLock" in navigator) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
        if (!on && lock) { await lock.release(); lock = null; }
    } catch { /* the test still runs */ }
}
async function start() {
    $("ftStart").disabled = true;
    const u = await unlockAudio();
    $("ftStart").disabled = false;
    if (!u.ctx) return toast("This browser can't play the beeps");
    ctx = u.ctx;
    if (!u.running) toast(SOUND_HINT);
    t0 = ctx.currentTime + 4; nextIdx = 0; out.clear(); running = true;
    for (let i = 1; i <= 3; i++) beep(ctx.currentTime + i, 660, 0.15);
    beep(t0, 1000, 0.3);
    timer = setInterval(pump, 200); pump();
    $("ftStart").hidden = true; $("ftStop").hidden = false;
    keepAwake(true); renderOut(); tick();
}
function stop() {
    running = false; clearInterval(timer); cancelAnimationFrame(raf);
    releaseAudio(ctx);
    $("ftStart").hidden = false; $("ftStop").hidden = true;
    $("ftStart").textContent = "Start again"; $("ftMeta").textContent = "Stopped. Saved results are below.";
    keepAwake(false); renderOut();
}
$("ftStart").onclick = start;
$("ftStop").onclick = stop;
$("ftOutAdd").onclick = () => { markOut($("ftOutName").value); $("ftOutName").value = ""; };
document.addEventListener("visibilitychange", () => { if (running && !document.hidden) keepAwake(true); });

$("ftDate").value = todayIso();
$("ftDate").onchange = renderList;
$("ftNames").replaceChildren(...names.map(n => { const o = document.createElement("option"); o.value = n; return o; }));
renderOut(); renderList();

// Day 1 checklist: start a fresh Run practice from the fixed list, then open it.
$("ftPack").onclick = () => {
    try { localStorage.setItem(KEYS.run, RUN.serializeRun(RUN.newRun(DAY_ONE_ITEMS, "Day 1", Date.now()))); } catch { return toast("Couldn't start on this device"); }
    window.location.href = "playbook-run.html";
};

// A quick sound check, so a phone problem shows before the test starts.
$("ftSound").onclick = async () => {
    const u = await unlockAudio();
    if (!u.ctx) return toast("This browser can't play the beeps");
    const o = u.ctx.createOscillator(), g = u.ctx.createGain(), at = u.ctx.currentTime + 0.05;
    o.frequency.value = 880; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.6, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(g).connect(u.ctx.destination); o.start(at); o.stop(at + 0.45);
    $("ftDiag").textContent = audioReport(u); $("ftDiag").hidden = false;
    toast(u.running ? "Did you hear it? " + SOUND_HINT : SOUND_HINT);
    setTimeout(() => releaseAudio(u.ctx), 1200);
};

// ---- 1 mile run mode ----
let mile = null, mileRaf = 0;
try { mile = F.parseMile(localStorage.getItem(KEYS.mileRun) || ""); } catch {}
const saveMile = () => { try { mile ? localStorage.setItem(KEYS.mileRun, F.serializeMile(mile)) : localStorage.removeItem(KEYS.mileRun); } catch {} };
const extraIdle = [];
const mileNames = () => {
    const all = [...names, ...extraIdle, ...(mile ? mile.names : []), ...(mile ? Object.keys(mile.finished) : [])];
    const seen = new Set();
    return all.filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};
// Writes (or rewrites) this player's mile result from the run state.
function writeMile(name) {
    const k = Object.keys(mile.finished).find(x => x.toLowerCase() === name.toLowerCase());
    if (!k) { results = F.clearTest(results, name, mile.date, "mile"); return; }
    results = F.setResult(results, { name: k, date: mile.date, test: "mile", value: { seconds: mile.finished[k], nonstop: !F.hasWalked(mile, k) } });
}
function renderMile() {
    const box = $("mlRows"); box.replaceChildren();
    const live = !!mile;
    for (const n of mileNames()) {
        const fin = live && Object.keys(mile.finished).find(x => x.toLowerCase() === n.toLowerCase());
        const walked = live && F.hasWalked(mile, n);
        const row = h("div", "ml-row" + (fin ? " is-done" : ""));
        const main = h("button", "pb-btn ml-name", fin ? `${n} · ${F.clockText(mile.finished[fin])}` : n); main.type = "button";
        main.disabled = !live || !!fin;
        main.setAttribute("aria-label", fin ? `${n} finished in ${F.clockText(mile.finished[fin])}` : `${n} finished`);
        main.onclick = () => { mile = F.finishMile(mile, n, Date.now()); saveMile(); writeMile(n); save(); renderMile(); renderList(); toast(`${n}: ${F.clockText(F.elapsedSec(mile, Date.now()))}`); };
        const wk = h("button", "pb-btn ml-walk" + (walked ? " on" : ""), walked ? "Walked ✓" : "Walked"); wk.type = "button";
        wk.disabled = !live; wk.setAttribute("aria-pressed", String(!!walked)); wk.setAttribute("aria-label", `${n} walked`);
        wk.onclick = () => { mile = F.toggleWalked(mile, n); saveMile(); if (fin) { writeMile(n); save(); renderList(); } renderMile(); };
        row.append(main, wk);
        if (fin) {
            const un = h("button", "pb-btn ml-undo", "Undo"); un.type = "button"; un.setAttribute("aria-label", `Undo ${n}'s finish`);
            un.onclick = () => { mile = F.undoFinish(mile, n); saveMile(); writeMile(n); save(); renderMile(); renderList(); };
            row.append(un);
        }
        box.append(row);
    }
    $("mlStart").hidden = live; $("mlEnd").hidden = !live;
}
function mileTick() {
    if (!mile) return;
    $("mlClock").textContent = F.clockText(F.elapsedSec(mile, Date.now()));
    const done = Object.keys(mile.finished).length, total = mileNames().length;
    $("mlMeta").textContent = `${done} of ${total} finished`;
    mileRaf = requestAnimationFrame(mileTick);
}
$("mlStart").onclick = () => {
    mile = F.newMile(Date.now(), $("ftDate").value);
    saveMile(); keepAwake(true); renderMile(); mileTick();
};
$("mlEnd").onclick = () => {
    cancelAnimationFrame(mileRaf); keepAwake(false);
    const done = Object.keys(mile.finished).length;
    mile = null; saveMile(); renderMile();
    $("mlClock").textContent = "0:00"; $("mlMeta").textContent = done ? `Saved ${done} result${done === 1 ? "" : "s"} below` : "Nothing saved";
};
$("mlAdd").onclick = () => {
    const n = $("mlAddName").value.trim(); if (!n) return;
    if (mile) { mile = F.addName(mile, n); saveMile(); } else { extraIdle.push(n); }
    $("mlAddName").value = ""; renderMile();
};
if (mile) { $("ftDate").value = mile.date; keepAwake(true); mileTick(); }
renderMile();
