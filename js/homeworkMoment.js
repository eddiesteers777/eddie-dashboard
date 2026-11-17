/* ==========================================
   Southbound — the finish of a homework practice (2026-11-15)

   A player logs a practice and gets a moment, made for kids and teens:
   * every practice: the Southbound logo draws itself (four lines merge
     into the dot, the dot becomes a check), confetti in the logo's four
     colors, "Nice work, <name>!", and chips (+1 practice, streak, week).
   * the practice that finishes the week's target (or reaches a goal): a
     ring fills, a gold star pops, "Week complete", the week's days light up.
   A short chime and buzz go with it (the app's one sound switch). Reduced
   motion: the same card, still. Tap, Continue or Esc closes it. The saved
   log never waits on it. Pure parts are unit-tested
   (tests/homeworkMoment.test.mjs); the look is css/homeworkMoment.css.
========================================== */

import { progress, weekStart, addDays } from "./homeworkModel.js";
import { reducedMotion } from "./celebrate.js";
import { primeSound, playChime } from "./waterSound.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LINES = ["Nice work, {n}!", "That's how it's done, {n}!", "Locked in, {n}!", "Another one, {n}!", "Keep it rolling, {n}!"];

// Monday to Sunday of this week: which days have a practice of this homework.
export function weekDaysFor(hw, today) {
    const start = weekStart(today);
    const logged = new Set((hw?.logs || []).map(l => l.date));
    return Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        return { letter: "MTWTFSS"[i], on: logged.has(date) && date !== today, today: date === today, date };
    });
}

// What the moment says. `hw` is the homework AFTER the new practice was added; `wasComplete` was its
// progress before. A week/goal moment only the first time the target is reached.
export function momentFor({ hw, wasComplete = false, today, streak = 0, firstName = "" } = {}) {
    const p = progress(hw, today);
    const finish = p.complete && !wasComplete && p.kind !== "once";
    const name = String(firstName || "").trim().split(/\s+/)[0] || "you";
    const n = (hw?.logs || []).length;
    const chips = ["+1 practice"];
    if (streak >= 2) chips.push(`${streak}-day streak`);
    if (!finish && p.kind === "week" && p.target) chips.push(`${Math.min(p.done, p.target)} of ${p.target} this week`);
    if (!finish && p.kind === "goal" && p.target) chips.push(`Best ${p.done} of ${p.target}`);
    return {
        kind: finish ? "week" : "practice",
        kicker: finish ? (p.kind === "goal" ? "Goal reached" : "You did it") : "Practice logged",
        headline: finish ? (p.kind === "goal" ? "You hit the goal" : "Week complete") : LINES[Math.max(0, n - 1) % LINES.length].replace("{n}", name),
        title: hw?.title || "",
        chips,
        ring: finish && p.kind === "week" ? { done: Math.min(p.done, p.target), target: p.target } : null,
        days: finish && p.kind === "week" ? weekDaysFor(hw, today) : null,
        streak
    };
}

// ---- the picture ----

const LOGO = `<svg class="hwm-logo" viewBox="0 0 240 240" aria-hidden="true">
    <path pathLength="1" d="M20 56 C 90 56 100 120 120 120" style="--c:var(--primary);--d:0s"/>
    <path pathLength="1" d="M20 92 C 80 92 100 120 120 120" style="--c:var(--primary-dark);--d:.1s"/>
    <path pathLength="1" d="M20 128 C 80 128 100 120 120 120" style="--c:var(--sage);--d:.2s"/>
    <path pathLength="1" d="M20 164 C 90 164 100 120 120 120" style="--c:var(--gold);--d:.3s"/>
    <circle class="hwm-ring-pulse" cx="120" cy="120" r="34"/>
    <g class="hwm-dot"><circle cx="120" cy="120" r="34"/><path class="hwm-chk" pathLength="1" d="M104 121 l11 11 l21 -24"/></g></svg>`;

const STAR = `<svg class="hwm-star" viewBox="0 0 96 96" aria-hidden="true"><path d="M48 6l12 26 28 3-21 19 6 28-25-14-25 14 6-28L8 35l28-3z"/></svg>`;

function ringHtml({ done, target }) {
    const seg = Math.max(1, Math.min(target, 7));
    const gap = 3, len = 100 / seg;
    const arcs = Array.from({ length: seg }, (_, i) => {
        const rot = -90 + (360 / seg) * i + 3;
        const dash = `${(len - gap).toFixed(1)} ${(100 - len + gap).toFixed(1)}`;
        const lit = i < done;
        return `<circle class="hwm-seg bg" cx="115" cy="115" r="96" pathLength="100" stroke-dasharray="${dash}" transform="rotate(${rot.toFixed(1)} 115 115)"/>${lit ? `<circle class="hwm-seg f" cx="115" cy="115" r="96" pathLength="100" stroke-dasharray="${dash}" stroke-dashoffset="${(len - gap).toFixed(1)}" transform="rotate(${rot.toFixed(1)} 115 115)" style="--d:${(0.1 + i * Math.min(0.45, 1.2 / seg)).toFixed(2)}s;--o:${(len - gap).toFixed(1)}"/>` : ""}`;
    }).join("");
    return `<div class="hwm-ringwrap"><svg viewBox="0 0 230 230" aria-hidden="true">${arcs}</svg><div class="hwm-num">${done}<small>of ${target} this week</small></div></div>`;
}

export function momentHtml(m) {
    const chips = m.chips.map(c => `<span class="hwm-chip${/streak/.test(c) ? " gold" : ""}">${esc(c)}</span>`).join("");
    const top = m.kind === "week"
        ? `${m.ring ? ringHtml(m.ring) : ""}${STAR}`
        : LOGO;
    const days = m.days ? `<div class="hwm-days" aria-hidden="true">${m.days.map(d => `<i class="${d.today ? "new" : d.on ? "on" : ""}">${d.letter}</i>`).join("")}</div>` : "";
    return `<div class="hwm-stack">${top}
        <div class="hwm-kick hwm-pop" style="--d:${m.kind === "week" ? "1.1s" : "1.5s"}">${esc(m.kicker)}</div>
        <div class="hwm-big hwm-rise" style="--d:${m.kind === "week" ? "1.25s" : "1.6s"}">${esc(m.headline)}</div>
        ${m.title ? `<div class="hwm-sub hwm-rise" style="--d:${m.kind === "week" ? "1.4s" : "1.75s"}">${esc(m.title)}</div>` : ""}
        ${days}
        <div class="hwm-chips hwm-rise" style="--d:${m.kind === "week" ? "1.55s" : "1.9s"}">${chips}</div>
        <button type="button" class="sb-btn sb-btn-primary hwm-go hwm-rise" style="--d:${m.kind === "week" ? "1.9s" : "2.2s"}">Keep going</button></div>`;
}

function confetti(n = 34) {
    const colors = ["var(--primary)", "var(--primary-dark)", "var(--sage)", "var(--gold)"];
    return `<div class="hwm-confetti" aria-hidden="true">${Array.from({ length: n }, (_, i) => {
        const a = Math.random() * Math.PI * 2, d = 110 + Math.random() * 190;
        return `<i style="background:${colors[i % 4]};--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d + 90).toFixed(0)}px;--r:${(Math.random() * 720 - 360) | 0}deg;--d:${(1.05 + Math.random() * 0.12).toFixed(2)}s${i % 3 === 0 ? ";border-radius:50%" : ""}"></i>`;
    }).join("")}</div>`;
}

let current = null;

// Shows the moment on top of the page. Resolves when it has gone.
export function celebrateHomework(info) {
    const m = momentFor(info);
    const still = reducedMotion();
    current?.remove();
    const el = document.createElement("div");
    el.className = `hwm hwm--${m.kind}${still ? " hwm--still" : ""}`;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `${m.kicker}. ${m.headline}`);
    el.innerHTML = `<div class="hwm-veil"></div>${still ? "" : confetti(m.kind === "week" ? 44 : 34)}${momentHtml(m)}`;
    document.body.appendChild(el);
    current = el;
    try { navigator.vibrate?.(m.kind === "week" ? [30, 40, 30, 40, 60] : [24]); } catch { /* not on iPhone; fine */ }
    primeSound();
    setTimeout(() => { if (el.isConnected && !el.classList.contains("is-out")) playChime(); }, still ? 0 : 900);
    return new Promise(resolve => {
        const close = () => {
            if (el.classList.contains("is-out")) return;
            el.classList.add("is-out");
            document.removeEventListener("keydown", onKey);
            setTimeout(() => { el.remove(); if (current === el) current = null; resolve(); }, 320);
        };
        const onKey = e => { if (e.key === "Escape") close(); };
        document.addEventListener("keydown", onKey);
        el.addEventListener("click", close);
        setTimeout(close, m.kind === "week" ? 9000 : 7000);
        el.querySelector(".hwm-go")?.focus({ preventScroll: true });
    });
}
