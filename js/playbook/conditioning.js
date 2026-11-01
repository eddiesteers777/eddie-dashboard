// Conditioning block: the coach sets the work and rest, this runs the timer with its own beeps.
// Model: conditioningModel.js. Saved on this device only.
import "./shell.js";
import * as C from "./conditioningModel.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };

let rows = [];
try { rows = JSON.parse(localStorage.getItem(KEYS.conditioning) || "null")?.block || []; } catch {}
rows = rows.length ? rows.slice(0, C.MAX_EXERCISES) : [{ name: "", rounds: 1, work: "", rest: "" }];
const persist = () => { try { localStorage.setItem(KEYS.conditioning, C.serialize(rows)); } catch { toast("Couldn't save on this device"); } };

function field(label, key, i, attrs) {
    const w = h("label", "cd-f"); w.append(h("span", "", label));
    const input = h("input"); Object.assign(input, attrs); input.value = rows[i][key] ?? "";
    input.oninput = () => { rows[i][key] = input.value; summary(); persist(); };
    w.append(input); return w;
}
function renderRows() {
    const box = $("cdRows"); box.replaceChildren();
    rows.forEach((r, i) => {
        const row = h("div", "cd-row");
        row.append(field("Exercise", "name", i, { type: "text", maxLength: 40, autocomplete: "off" }),
            field("Rounds", "rounds", i, { type: "number", inputMode: "numeric", min: 1, max: 30 }),
            field("Work (sec)", "work", i, { type: "number", inputMode: "numeric", min: 1, max: 600 }),
            field("Rest (sec)", "rest", i, { type: "number", inputMode: "numeric", min: 0, max: 600 }));
        const del = h("button", "pb-btn", "Remove"); del.type = "button"; del.setAttribute("aria-label", `Remove exercise ${i + 1}`);
        del.onclick = () => { rows.splice(i, 1); if (!rows.length) rows.push({ name: "", rounds: 1, work: "", rest: "" }); persist(); renderRows(); summary(); };
        row.append(del); box.append(row);
    });
}
function summary() {
    const total = C.totalSeconds(rows), n = C.cleanBlock(rows).length;
    $("cdTotal").textContent = n ? `${n} exercise${n === 1 ? "" : "s"} · ${C.clock(total)} of timed work and rest` : "Add a name and a work time to begin.";
    $("cdStart").disabled = !n;
}
$("cdAdd").onclick = () => { if (rows.length >= C.MAX_EXERCISES) return toast("That is the most exercises in one block"); rows.push({ name: "", rounds: 1, work: "", rest: "" }); persist(); renderRows(); summary(); };

// ---- run ----
let ctx = null, ph = [], startedAt = 0, pausedAt = 0, offset = 0, raf = 0, lastIndex = -1, lastTick = -1, lock = null;
const beep = (freq, len = 0.12) => {
    if (!ctx) return;
    const at = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.6, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + len + 0.02);
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const elapsed = () => ((pausedAt || performance.now()) - startedAt) / 1000 + offset;
async function keepAwake(on) {
    try {
        if (on && !lock && "wakeLock" in navigator) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
        if (!on && lock) { await lock.release(); lock = null; }
    } catch { /* the timer still runs */ }
}
function frame() {
    const p = C.at(elapsed(), ph);
    if (p.done) { finish(); return; }
    if (p.index !== lastIndex) {
        lastIndex = p.index; lastTick = -1;
        beep(p.phase.kind === "work" ? 1000 : 600, 0.25); buzz(p.phase.kind === "work" ? [200] : [80, 60, 80]);
    }
    if (p.left <= 3 && p.left !== lastTick) { lastTick = p.left; beep(720, 0.08); }
    $("cdPhase").textContent = p.phase.kind === "work" ? p.phase.label : "Rest";
    $("cdPhase").dataset.kind = p.phase.kind;
    $("cdClock").textContent = String(p.left);
    $("cdMeta").textContent = p.phase.kind === "work" ? `Round ${p.phase.round} of ${p.phase.rounds}` : "Breathe";
    const nx = ph[p.index + 1];
    $("cdNext").textContent = nx ? `Next: ${nx.kind === "rest" ? "Rest " + nx.seconds + "s" : nx.label + " " + nx.seconds + "s"}` : "Last one";
    raf = requestAnimationFrame(frame);
}
function begin() {
    ph = C.phases(rows); if (!ph.length) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = AC ? new AC() : null; ctx && ctx.resume && ctx.resume(); } catch { ctx = null; }
    startedAt = performance.now(); pausedAt = 0; offset = 0; lastIndex = -1; lastTick = -1;
    $("cdEdit").hidden = true; $("cdRun").hidden = false; $("cdPause").textContent = "Pause";
    keepAwake(true); frame();
}
function end() { cancelAnimationFrame(raf); try { ctx && ctx.close(); } catch {} ctx = null; keepAwake(false); $("cdRun").hidden = true; $("cdEdit").hidden = false; }
function finish() { beep(1320, 0.4); buzz([300, 100, 300]); end(); toast("Block done"); }
$("cdStart").onclick = begin;
$("cdStop").onclick = end;
$("cdPause").onclick = () => {
    if (pausedAt) { startedAt += performance.now() - pausedAt; pausedAt = 0; $("cdPause").textContent = "Pause"; frame(); }
    else { pausedAt = performance.now(); cancelAnimationFrame(raf); $("cdPause").textContent = "Resume"; }
};
document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("cdRun").hidden && !pausedAt) keepAwake(true); });

renderRows(); summary();
