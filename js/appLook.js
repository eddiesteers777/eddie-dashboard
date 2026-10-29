// The app's foggy blue look (Eddie, 2026-10-29): fog-blue ground, blue glass, an instrument drawing per page,
// gold only as an accent. Adds css/appLook.css, a fixed background layer and one drawing per page.
// The drawing is a working instrument tied to the scroll position (js/appMotion.js does the maths): a compass
// for Today, a stopwatch for Train, a calendar for Plan, ... Motion follows scrolling only, never runs by itself,
// and stays still for people who ask for reduced motion. No layout change.
import { instrumentState } from "./appMotion.js";

const L = (a, w = ".6") => `fill="none" stroke="rgba(214,228,240,${a})" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"`;
const GOLD = "#D2AD62";
const ticks = (cx, cy, r, n, len) => Array.from({ length: n }, (_, i) => {
    const a = i / n * 2 * Math.PI;
    return `<line class="tk" data-i="${i}" x1="${cx + r * Math.sin(a)}" y1="${cy - r * Math.cos(a)}" x2="${cx + (r - len) * Math.sin(a)}" y2="${cy - (r - len) * Math.cos(a)}"/>`;
}).join("");
const BOTTLE = "M42 6 h16 v10 c 8 4 12 8 12 18 v34 H30 V34 c0 -10 4 -14 12 -18 Z";
const ART = {
    index: `<g ${L(.34)}><circle cx="62" cy="38" r="24"/><g data-m="dial">${ticks(62, 38, 24, 36, 2.2)}</g><g data-m="needle"><path d="M62 18 L66 38 L62 58 L58 38 Z" ${L(.5)}/><path d="M62 18 L66 38 L58 38 Z" fill="${GOLD}" stroke="none"/></g><circle cx="62" cy="38" r="1.6"/></g>`,
    train: `<g ${L(.34)}><circle cx="55" cy="42" r="26"/>${ticks(55, 42, 26, 60, 2)}<path d="M50 10 h10 M55 10 v6"/><g data-m="hand"><path d="M55 42 L55 20" ${L(.6, 1)} stroke="${GOLD}"/><circle cx="55" cy="42" r="1.8" fill="${GOLD}" stroke="none"/></g></g>`,
    plan: `<g ${L(.32)}><rect x="12" y="12" width="76" height="58" rx="3"/><path d="M12 26 H88"/>${[1, 2, 3, 4, 5, 6].map(i => `<line x1="${12 + i * 10.86}" y1="26" x2="${12 + i * 10.86}" y2="70"/>`).join("")}<path d="M12 40.7 H88 M12 55.3 H88"/>${Array.from({ length: 21 }, (_, i) => `<rect class="cell" data-i="${i}" x="${12 + (i % 7) * 10.86}" y="${26 + Math.floor(i / 7) * 14.67}" width="10.86" height="14.67" fill="none" stroke="none"/>`).join("")}</g>`,
    nutrition: `<defs><clipPath id="al-bc"><path d="${BOTTLE}"/></clipPath></defs><g ${L(.34)}><path d="${BOTTLE}"/></g><g clip-path="url(#al-bc)"><rect data-m="fill" x="28" y="68" width="44" height="64" fill="rgba(214,228,240,.42)"/><path data-m="wave" d="M28 0 q5 -2.5 11 0 t11 0 t11 0 t11 0 V6 H28 Z" fill="rgba(214,228,240,.4)"/></g><g ${L(.2, ".4")}><path d="M30 30 H40 M30 42 H40 M30 54 H40"/></g>`,
    habits: `<g ${L(.28, ".9")}><circle cx="58" cy="38" r="26"/><circle cx="58" cy="38" r="18"/><circle cx="58" cy="38" r="10"/></g><g fill="none" stroke-linecap="round" stroke-width="1.4" vector-effect="non-scaling-stroke"><circle class="rg" data-r="26" cx="58" cy="38" r="26" stroke="${GOLD}" transform="rotate(-90 58 38)"/><circle class="rg" data-r="18" cx="58" cy="38" r="18" stroke="rgba(214,228,240,.7)" transform="rotate(-90 58 38)"/><circle class="rg" data-r="10" cx="58" cy="38" r="10" stroke="rgba(214,228,240,.5)" transform="rotate(-90 58 38)"/></g>`,
    progress: `<g ${L(.2, ".4")}><path d="M0 16H100M0 66H100"/></g><g data-m="ecg"><path d="M-100 40 H-78 L-72 40 L-67 20 L-60 60 L-54 30 L-50 40 H-34 L-28 40 L-23 26 L-18 52 L-14 40 H0 H22 L28 40 L33 20 L40 60 L46 30 L50 40 H66 L72 40 L77 26 L82 52 L86 40 H100 H122 L128 40 L133 20 L140 60 L146 30 L150 40 H166 L172 40 L177 26 L182 52 L186 40 H200" ${L(.5)}/></g>`,
    messages: `<g ${L(.34)}><path d="M12 12 H88 V50 H52 L36 66 V50 H12 Z"/></g><g ${L(.45)}><path class="ln" d="M24 24 H76"/><path class="ln" d="M24 34 H62"/><path class="ln" d="M24 44 H48"/></g>`,
    coach: `<g ${L(.34)}><rect x="8" y="10" width="84" height="58" rx="3"/><line x1="50" y1="10" x2="50" y2="68"/><circle cx="50" cy="39" r="9"/><circle cx="68" cy="26" r="3"/><circle cx="30" cy="52" r="3"/><path d="M30 52 L68 26" stroke-dasharray="1 1.6"/></g><circle data-m="ball" r="2.2" cx="30" cy="52" fill="${GOLD}"/>`
};
ART.clients = ART.coach;

// Move the drawing to where the scroll position says it should be.
function applyState(svg, state) {
    if (!state) return;
    const q = s => svg.querySelector(s), qa = s => [...svg.querySelectorAll(s)];
    if ("needle" in state) { q('[data-m="needle"]').setAttribute("transform", `rotate(${state.needle} 62 38)`); q('[data-m="dial"]').setAttribute("transform", `rotate(${state.dial} 62 38)`); }
    if ("hand" in state) { q('[data-m="hand"]').setAttribute("transform", `rotate(${state.hand} 55 42)`); qa(".tk").forEach(t => t.classList.toggle("on", +t.dataset.i === state.tick)); }
    if ("cell" in state) qa(".cell").forEach(c => { const i = +c.dataset.i; c.setAttribute("fill", i === state.cell ? "rgba(210,173,98,.45)" : i < state.cell ? "rgba(214,228,240,.12)" : "none"); });
    if ("fillY" in state) { q('[data-m="fill"]').setAttribute("y", state.fillY); q('[data-m="wave"]').setAttribute("transform", `translate(${state.waveX} ${state.fillY})`); }
    if ("rings" in state) qa(".rg").forEach((c, i) => { const C = 2 * Math.PI * +c.dataset.r; c.setAttribute("stroke-dasharray", C); c.setAttribute("stroke-dashoffset", C * (1 - state.rings[i])); });
    if ("ecgX" in state) q('[data-m="ecg"]').setAttribute("transform", `translate(${state.ecgX} 0)`);
    if ("lines" in state) qa(".ln").forEach((l, i) => { l.style.opacity = state.lines[i]; });
    if ("ball" in state) { const b = q('[data-m="ball"]'); b.setAttribute("cx", state.ball.x); b.setAttribute("cy", state.ball.y); }
}

function startMotion(svg, page) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let queued = false;
    const update = () => {
        queued = false;
        if (document.documentElement.classList.contains("sb-typing")) return;   // keep still while a keyboard is open
        const max = document.documentElement.scrollHeight - innerHeight;
        applyState(svg, instrumentState(page, still ? 0 : scrollY, max));
    };
    update();
    if (still) return;
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
}

export function applyAppLook() {
    if (document.documentElement.classList.contains("al-on") || document.documentElement.classList.contains("sb-guest")) return;
    if (!document.querySelector('link[href$="css/appLook.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL("../css/appLook.css", import.meta.url).href;
        document.head.append(link);
    }
    const page = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index";
    const bg = document.createElement("div");
    bg.className = "al-bg";
    bg.setAttribute("aria-hidden", "true");
    if (ART[page]) bg.innerHTML = `<svg viewBox="0 0 100 80" preserveAspectRatio="xMaxYMin meet">${ART[page]}</svg>`;
    document.body.prepend(bg);
    document.documentElement.classList.add("al-on");
    const svg = bg.querySelector("svg");
    if (svg) startMotion(svg, page);
}
