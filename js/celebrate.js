/* ==========================================
   Southbound — completion moments (2026-10-17)

   celebrateRun({ kind, title, miles, durationSec, week, offline, next })
       a workout just marked done or logged: a full-screen blue moment
       (2026-11-02). The check draws, Southbound emojis in the app's blue
       burst out and fall (emoji/celebrate/), then it settles to a summary: miles,
       time, pace, "Run 3 of 4" for the week, one next step. Tap anywhere to
       skip the animation; the saved log never waits on it. Resolves
       "next" or "close" when it has gone, so the effort question
       (js/effortCard.js) opens after it, not over it.
   celebrateHabit(habit, { allDone, noun, count, streak })   a habit just
       checked off: small on purpose. The tick (css) is the reward and a tiny
       buzz goes with it; nothing covers the screen. Only the day's last
       habit opens the full-screen "Day complete" moment (same blue look as
       the run, its own emojis: water, sleep, strength).

   Light on purpose: CSS keyframes (css/style.css "COMPLETION MOMENTS"),
   no library. Reduced motion: the run summary shows with no motion;
   habits show nothing extra (the filled circle already says done).
   The toast stays the spoken message. The effects are aria-hidden; the summary
   is a dialog with real buttons. Pure parts: tests/celebrate.test.mjs.
========================================== */

import { sceneForIcon } from "./habitScenes.js";
import { habitIconId } from "./habitIconSet.js";
import { soundOn, setSoundOn, primeSound, playChime } from "./waterSound.js";

const KICKERS = { run: "Run complete", strength: "Strength complete", session: "Session complete" };

// What the run sheet says. Pure, so it's unit-tested.
export function celebrationFor({ kind = "run", title = "", miles = 0 } = {}) {
    const name = String(title || "").replace(/\s+/g, " ").trim();
    const mi = Number(miles);
    const detail = kind === "run" && mi > 0 ? `${Number.isInteger(mi) ? mi : mi.toFixed(1)} mi` : "";
    return { kicker: KICKERS[kind] || "Workout complete", title: name.length > 26 ? `${name.slice(0, 25)}…` : name, detail };
}

export function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function buzz(pattern) {
    try { navigator.vibrate?.(pattern); } catch { /* not on iPhone; fine */ }
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);
const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");
const CHECK = '<svg viewBox="0 0 64 64"><path pathLength="100" d="M16 34l12 12 22-26"/></svg>';

let current = null;
function mount(el, life) {
    current?.remove();
    document.body.appendChild(el);
    current = el;
    return new Promise(resolve => {
        setTimeout(() => el.classList.add("is-out"), life);
        setTimeout(() => { el.remove(); if (current === el) current = null; resolve(); }, life + 420);
    });
}

// Calm ones for any habit (a journal tick should not throw dumbbells).
const TICK_EMOJI = [["great_work", "high_five", "great_work", "high_five"], ["high_five", "great_work", "high_five", "great_work"]];
const DAY_EMOJI = ["hydrate", "sleep", "strong", "great_work", "high_five", "big_effort", "hydrate", "great_work", "sleep", "strong"];
const RUN_EMOJI = {
    run: ["finish", "pr", "great_work", "high_five", "long_run", "strong", "great_work", "finish", "pr", "high_five", "long_run", "strong"],
    strength: ["strong", "big_effort", "pr", "great_work", "high_five", "strong", "big_effort", "pr", "great_work", "high_five"],
    session: ["great_work", "high_five", "strong", "pr", "great_work", "high_five", "strong", "pr"]
};
export const celebrateEmojiSrc = id => `emoji/celebrate/sb_${id}.svg`;

const clock = sec => {
    const t = Math.round(Number(sec));
    if (!Number.isFinite(t) || t <= 0) return "";
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

// The week from js/weekModel.js buildWeek(): how many runs are done of those planned. Pure.
export function weekRunProgress(week) {
    const runs = (week?.days || []).flatMap(d => d.items || []).filter(i => i.kind === "run" && i.source?.type !== "log");
    if (!runs.length) return null;
    const mi = list => Math.round(list.reduce((a, i) => a + (Number(i.miles) || 0), 0) * 10) / 10;
    const done = runs.filter(i => i.done);
    return { runsDone: done.length, runsPlanned: runs.length, milesDone: mi(done), milesPlanned: mi(runs) };
}

// A title as words of letters for the drop-in: emojis dropped (the scene or icon says it), words kept whole so a long
// custom habit name wraps between words, never inside one. Pure.
export function titleWords(title) {
    const clean = String(title ?? "").replace(/[\p{Extended_Pictographic}\u200d\ufe0f\u20e3]/gu, "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
    const letters = w => (seg ? [...seg.segment(w)].map(x => x.segment) : [...w]);
    return clean.split(" ").map(letters);
}

// The last seven days for the Day complete row, oldest first, today last. `isDone(dayKey)` says if a day was complete.
// Pure, so it's unit-tested.
export function weekDots(todayKey, isDone) {
    const [y, m, d] = String(todayKey).split("-").map(Number);
    const out = [];
    for (let i = 6; i >= 0; i--) {
        const dt = new Date(y, m - 1, d - i, 12);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        out.push({ key, letter: "SMTWTFS"[dt.getDay()], done: i === 0 ? true : Boolean(isDone(key)), today: i === 0 });
    }
    return out;
}

// What the full-screen summary shows. Pure, so it's unit-tested.
export function runSummaryFor(info = {}) {
    const base = celebrationFor(info);
    const mi = Number(info.miles) || 0;
    const secs = Number(info.durationSec) || 0;
    const stats = [];
    if (info.kind === "run" && mi > 0) stats.push({ value: Number.isInteger(mi) ? String(mi) : mi.toFixed(1), label: "miles" });
    if (clock(secs)) stats.push({ value: clock(secs), label: "time" });
    if (info.kind === "run" && mi > 0 && secs > 0) stats.push({ value: clock(secs / mi), label: "per mile" });
    const w = info.week;
    let week = null;
    if (w && w.runsPlanned > 0 && info.kind === "run") {
        const planned = Math.min(w.runsPlanned, 7);
        const done = Math.max(1, Math.min(w.runsDone, planned));
        week = {
            segments: Array.from({ length: planned }, (_, i) => (i < done - 1 ? "on" : i === done - 1 ? "now" : "")),
            left: `Run ${done} of ${w.runsPlanned}`,
            right: w.milesPlanned > 0 ? `${w.milesDone} of ${w.milesPlanned} mi` : "",
            line: done >= w.runsPlanned ? "That's every run this week." : `${w.runsPlanned - done} to go this week.`
        };
    }
    return {
        kicker: base.kicker,
        title: base.title,
        stats: stats.length ? stats : base.detail ? [{ value: base.detail.replace(/ mi$/, ""), label: "miles" }] : [],
        week,
        note: info.offline ? "Saved on this phone. It sends to your coach when you're back online." : "",
        next: info.next || ""
    };
}

// "6.2" -> { kind: "dec", a: 6, b: 2 }; "52:14" -> { kind: "clk", a: 52, b: 14 }; "5" -> { kind: "int", a: 5, b: 0 }.
// Anything else (4:00:05, 5/5, 96%) just shows as written. Pure.
export function countParts(value) {
    const v = String(value ?? "").trim();
    let m;
    if ((m = /^(\d{1,3})\.(\d)$/.exec(v))) return { kind: "dec", a: +m[1], b: +m[2] };
    if ((m = /^(\d{1,3}):(\d{2})$/.exec(v))) return { kind: "clk", a: +m[1], b: +m[2] };
    if ((m = /^(\d{1,3})$/.exec(v))) return { kind: "int", a: +m[1], b: 0 };
    return null;
}

const CHECK_SVG = '<svg viewBox="0 0 70 70"><polyline points="18 36 30 48 52 22" pathLength="40"/></svg>';
const BITS = 5;

// Decoration only: emojis burst from the check, squash where they land, then fall away; navy and blue slivers.
function fxHtml(ids, narrow, quick = false, cyPx = 250) {
    const n = ids.length;
    const vw = window.innerWidth || 390;
    const reach = narrow ? 110 : 220, extra = narrow ? 120 : 200;
    const burst = many(n, i => {
        // Angles from just below the check's sides, round over the top: the words and buttons sit below it.
        const a = Math.PI * (0.97 + (i + rnd(.1, .9)) / n * 1.06), d = reach + rnd(0, extra), s = Math.round(rnd(quick ? 52 : 60, quick ? 76 : 96));
        const maxX = vw / 2 - s / 2 - 10, minY = -(cyPx - s / 2 - 64), maxY = -s / 3;
        const dx = Math.max(-maxX, Math.min(maxX, Math.round(Math.cos(a) * d * (narrow ? 1.25 : 1.7))));
        const dy = Math.max(minY, Math.min(maxY, Math.round(Math.sin(a) * d * .9)));
        return `<img class="cr-burst" src="${esc(celebrateEmojiSrc(ids[i % n]))}" alt="" width="${s}" height="${s}" style="--z:${s}px;--dx:${dx}px;--dy:${dy}px;--r:${Math.round(rnd(-40, 40))}deg;--d:${rnd(.9, 1.05).toFixed(2)}s">`;
    });
    const bits = many(quick ? 14 : 26, i => {
        const a = rnd(0, Math.PI * 2), d = (narrow ? 90 : 170) + rnd(0, narrow ? 220 : 380);
        return `<i class="cr-bit cr-b${i % BITS}" style="--w:${rnd(3, 6).toFixed(1)}px;--dx:${Math.round(Math.cos(a) * d * 1.2)}px;--dy:${Math.round(Math.sin(a) * d * .9 + 90)}px;--r:${Math.round(rnd(-360, 360))}deg;--d:${rnd(.9, 1.2).toFixed(2)}s"></i>`;
    });
    return burst + bits;
}

// One stat. Where the number can count up (CSS counters, so skip and reduced motion jump to the end), the real text
// stays in the page for screen readers and the counter draws over it.
function statHtml(x, canCount) {
    // Pace never counts up: on the way to 8:23 it would pass paces nobody ran. It fades in once the others land.
    const c = canCount && x.label !== "per mile" ? countParts(x.value) : null;
    if (x.label === "per mile") return `<div class="cr-late"><b><span class="cr-txt">${esc(x.value)}</span></b><span>${esc(x.label)}</span></div>`;
    return `<div><b${c ? ` class="cr-cu cr-cu-${c.kind}" style="--a:${c.a};--b:${c.b}"` : ""}><span class="cr-txt">${esc(x.value)}</span></b><span>${esc(x.label)}</span></div>`;
}

// The day's last habit: the same full-screen moment, its own words. Pure.
export function daySummaryFor({ noun = "Habit", count = 0, streak = 0, days = null } = {}) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const stats = [];
    if (n > 0) stats.push({ value: `${n}/${n}`, label: `${noun.toLowerCase()}s` });
    if (streak > 1) stats.push({ value: String(streak), label: "day streak" });
    return { kicker: "Day complete", title: n > 0 ? `All ${n} done` : "All done", stats, week: null, days: Array.isArray(days) && days.length === 7 ? days : null, note: "", next: "" };
}

// An ordinary tick (Eddie, 2026-11-02: wants every one to pop like a run). The same screen, shorter: the habit's
// name, how many are done today, gone in about two seconds or on any tap. Pure.
// Long names end at a word with "…" (30 characters; two lines on a phone). A single long word is cut. Pure.
export function shortTitle(text, max = 30) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1), sp = cut.lastIndexOf(" ");
    return `${(sp > max * .5 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function tickSummaryFor({ name = "", done = 0, count = 0, noun = "Habit" } = {}) {
    const n = Math.max(0, Math.floor(Number(count) || 0)), d = Math.max(0, Math.floor(Number(done) || 0));
    const t = String(name || "").trim();
    return {
        kicker: `${noun} done`,
        title: shortTitle(t, 30),
        stats: n > 0 && d > 0 ? [{ value: `${Math.min(d, n)}/${n}`, label: "done today" }] : [],
        ring: n > 0 && d > 0 ? { from: Math.round((Math.min(d, n) - 1) / n * 100), to: Math.round(Math.min(d, n) / n * 100) } : null,
        week: null, note: "", next: ""
    };
}

export function celebrateRun(info = {}) {
    return openCelebration(runSummaryFor(info), RUN_EMOJI[info.kind] || RUN_EMOJI.run);
}

function ensureSceneStyles() {
    if (document.querySelector("link[data-habit-scenes]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../css/habitScenes.css", import.meta.url).href;
    link.dataset.habitScenes = "1";
    document.head.appendChild(link);
}

const speakerSvg = on => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/>${on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>'}</svg>`;

// Shrink a long title until every word fits on the screen and it takes at most two lines.
function fitTitle(el) {
    const h = el.querySelector(".cr-title"), box = el.querySelector(".cr-letters");
    if (!h || !box) return;
    const words = [...box.querySelectorAll(".cr-w")];
    let size = parseFloat(getComputedStyle(h).fontSize) || 48;
    const fits = () => {
        const width = box.clientWidth;
        if (words.some(w => w.offsetWidth > width + 1)) return false;
        return new Set(words.map(w => w.offsetTop)).size <= 2;
    };
    for (let i = 0; i < 30 && size > 22 && !fits(); i++) { size -= 2; h.style.fontSize = `${size}px`; }
}

function openCelebration(m, ids, quick = false, scene = null) {
    if (typeof document === "undefined") return Promise.resolve("close");
    const still = reducedMotion();
    const narrow = (window.innerWidth || 390) < 700;
    const canCount = !still && typeof CSS !== "undefined" && typeof CSS.registerProperty === "function";
    const el = document.createElement("div");
    el.className = `sb-cr${quick ? " is-quick" : ""}${scene ? " has-scene" : ""}${still ? " is-still" : ""}${canCount ? " can-count" : ""}`;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", `${m.kicker}${m.title ? `: ${m.title}` : ""}`);
    if (scene) { ensureSceneStyles(); el.style.setProperty("--ckd", `${scene.ckAt}s`); }
    const cy = narrow ? 31 : 36;
    el.style.setProperty("--cy", `${cy}%`);
    let k = 0;
    const words = titleWords(m.title);
    const letters = words.map(w => `<span class="cr-w">${w.map(c => `<span style="--k:${k++}">${esc(c)}</span>`).join("")}</span>`).join("");
    const daysHtml = m.days ? `<div class="cr-days" aria-label="Last seven days"><div class="cr-dots">${m.days.map((d, i) => `<span class="cr-dot${d.done ? " is-done" : ""}${d.today ? " is-today" : ""}" style="--i:${i}"><i></i><small>${esc(d.letter)}</small></span>`).join("")}</div></div>` : "";
    const ring = quick && !scene?.name?.startsWith("lap") && m.ring ? `<svg class="cr-prog" viewBox="0 0 100 100" aria-hidden="true"><circle class="cr-prog-bg" cx="50" cy="50" r="47"/><circle class="cr-prog-on" cx="50" cy="50" r="47" pathLength="100" style="--from:${m.ring.from};--to:${m.ring.to}"/></svg>` : "";
    const weekHtml = m.week ? `<div class="cr-week"><small>This week</small>
            <div class="cr-strip" style="--n:${m.week.segments.length}">${m.week.segments.map(s => `<i class="${s ? `is-${s}` : ""}"></i>`).join("")}</div>
            <div class="cr-sl"><b>${esc(m.week.left)}</b><span>${esc(m.week.right)}</span></div>
            <p class="cr-line">${esc(m.week.line)}</p></div>` : "";
    el.innerHTML = `<div class="cr-wash" aria-hidden="true"></div><span class="cr-edge" aria-hidden="true"></span>
        <div class="cr-fx" aria-hidden="true">${still || scene ? "" : fxHtml(quick ? ids.slice(0, 4) : ids, narrow, quick, (window.innerHeight || 800) * cy / 100)}</div>
        ${quick ? "" : `<button type="button" class="cr-snd" data-cr-snd aria-pressed="${soundOn()}" aria-label="${soundOn() ? "Sound on. Tap to mute" : "Sound off. Tap to turn on"}">${speakerSvg(soundOn())}</button>`}
        <div class="cr-core">
            <div class="cr-lens" aria-hidden="true">${ring}${still || scene ? "" : `<span class="cr-ring" style="--d:.8s"></span><span class="cr-ring" style="--d:1.1s"></span><span class="cr-ring" style="--d:1.4s"></span>`}<i></i>${scene ? `<div class="sc sc-${scene.name}">${scene.html}</div>` : ""}${CHECK_SVG}</div>
            <p class="cr-kick">${esc(m.kicker)}</p>
            ${m.title ? `<h2 class="cr-title" aria-label="${esc(m.title)}"><span class="cr-letters" aria-hidden="true">${letters}</span></h2>` : ""}
            ${m.stats.length ? `<div class="cr-stats" style="--n:${m.stats.length}">${m.stats.map(x => statHtml(x, canCount)).join("")}</div>` : ""}
            ${weekHtml}${daysHtml}
            ${m.note ? `<p class="cr-offline">${esc(m.note)}</p>` : ""}
            ${quick ? "" : `<div class="cr-actions">
                <button type="button" class="cr-go" data-cr="next">${esc(m.next || "Done")}</button>
                ${m.next ? `<button type="button" class="cr-close" data-cr="close">Close</button>` : ""}
            </div>`}
        </div>
        ${still || quick ? "" : `<p class="cr-tap" aria-hidden="true">Tap anywhere to skip</p>`}`;
    if (!still) buzz([14, 50, 24]);
    // The water screen's chime on the full screens (shares its mute). Started from the tap that got us here.
    if (!quick) { primeSound(); setTimeout(() => { if (el.isConnected && !el.classList.contains("is-out")) playChime(); }, still ? 0 : 750); }
    return new Promise(resolve => {
        const returnTo = document.activeElement;
        current?.remove();
        document.body.appendChild(el);
        current = el;
        fitTitle(el);
        let over = false;
        const finish = result => {
            if (over) return;
            over = true;
            document.removeEventListener("keydown", onKey, true);
            clearTimeout(auto);
            el.classList.add("is-out");
            setTimeout(() => { el.remove(); if (current === el) current = null; try { returnTo?.focus?.({ preventScroll: true }); } catch { /* gone */ } resolve(result); }, still ? 120 : 380);
        };
        const onKey = e => { if (e.key === "Escape") { e.preventDefault(); finish("close"); } };
        document.addEventListener("keydown", onKey, true);
        el.addEventListener("click", e => {
            const snd = e.target.closest("[data-cr-snd]");
            if (snd) { setSoundOn(!soundOn()); const on = soundOn(); snd.innerHTML = speakerSvg(on); snd.setAttribute("aria-pressed", String(on)); snd.setAttribute("aria-label", on ? "Sound on. Tap to mute" : "Sound off. Tap to turn on"); if (on) { primeSound(); playChime(); } return; }
            const b = e.target.closest("[data-cr]");
            if (b) finish(b.dataset.cr === "close" ? "close" : "next");
            else if (quick) finish("close");   // a quick pop: any tap puts you straight back to ticking
            else el.classList.add("is-skip");   // a tap on the screen skips the animation, nothing else
        });
        const auto = setTimeout(() => finish("close"), quick ? (still ? 1800 : scene ? Math.round((scene.ckAt + 1.4) * 1000) : 2500) : 25000);
        if (quick) { el.tabIndex = -1; el.focus({ preventScroll: true }); } else el.querySelector(".cr-go")?.focus({ preventScroll: true });
    });
}

// A habit ticked: small on purpose. The tick itself is the reward (css: the check draws, the fill rises, the count
// moves) plus a tiny buzz; no overlay, so day 30 feels the same as day 1. Only the day's LAST habit opens the
// full-screen "Day complete" moment. Resolves when that has gone (immediately for an ordinary tick).
export function celebrateHabit(habit, { allDone = false, noun = "Habit", count = 0, streak = 0, done = 0, days = null } = {}) {
    if (typeof document === "undefined") return Promise.resolve("close");
    if (!allDone) {
        if (!habit?.name) { tickBuzz(); return Promise.resolve("close"); }
        // Its own scene when the habit's drawn icon has one (js/habitScenes.js); not with reduced motion.
        let scene = null;
        try { scene = reducedMotion() ? null : sceneForIcon(habitIconId(habit)); } catch { /* plain pop */ }
        const m = tickSummaryFor({ name: habit.name, done, count, noun });
        if (scene) m.kicker = scene.kicker;
        return openCelebration(m, TICK_EMOJI[Math.floor(Math.random() * TICK_EMOJI.length)], true, scene);
    }
    return openCelebration(daySummaryFor({ noun, count, streak, days }), DAY_EMOJI);
}

export function tickBuzz() {
    if (!reducedMotion()) buzz(8);
}
