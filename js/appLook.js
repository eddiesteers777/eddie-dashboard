// The app's foggy blue look (Eddie, 2026-10-29): fog-blue ground, blue glass, an instrument drawing per page,
// gold only as an accent. Adds css/appLook.css, a fixed background layer and one drawing per page.
// The drawing is a working instrument tied to the scroll position (js/appMotion.js does the maths): a compass
// for Today (folded fabric and a solid compass, see below), the same fabric with a solid stopwatch for Train, a calendar for Plan, ... Motion follows scrolling only, never runs by itself,
// and stays still for people who ask for reduced motion. No layout change.
import { instrumentState, sloshStep, fabricState } from "./appMotion.js";

const L = (a, w = ".6") => `fill="none" stroke="rgba(214,228,240,${a})" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"`;
const GOLD = "#D2AD62";
const BOTTLE = "M42 6 h16 v10 c 8 4 12 8 12 18 v34 H30 V34 c0 -10 4 -14 12 -18 Z";
const ART = {
    plan: `<g ${L(.32)}><rect x="12" y="12" width="76" height="58" rx="3"/><path d="M12 26 H88"/>${[1, 2, 3, 4, 5, 6].map(i => `<line x1="${12 + i * 10.86}" y1="26" x2="${12 + i * 10.86}" y2="70"/>`).join("")}<path d="M12 40.7 H88 M12 55.3 H88"/>${Array.from({ length: 21 }, (_, i) => `<rect class="cell" data-i="${i}" x="${12 + (i % 7) * 10.86}" y="${26 + Math.floor(i / 7) * 14.67}" width="10.86" height="14.67" fill="none" stroke="none"/>`).join("")}</g>`,
    nutrition: `<defs><clipPath id="al-bc"><path d="${BOTTLE}"/></clipPath><linearGradient id="al-wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(214,228,240)" stop-opacity=".5"/><stop offset="1" stop-color="rgb(150,185,215)" stop-opacity=".2"/></linearGradient></defs><g clip-path="url(#al-bc)"><g data-m="water"><path data-m="w2" d="M-20 0 q5.5 -1.6 11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 V90 H-20 Z" fill="rgba(214,228,240,.2)"/><path data-m="w1" d="M-20 0 q5.5 -1.1 11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 V90 H-20 Z" fill="url(#al-wg)"/><path data-m="crest" d="M-20 0 q5.5 -1.1 11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 " fill="none" stroke="rgba(240,247,252,.75)" stroke-width=".5" vector-effect="non-scaling-stroke"/><g fill="none" stroke="rgba(235,244,250,.6)" stroke-width=".5" vector-effect="non-scaling-stroke">${[0, 1, 2, 3, 4].map(i => `<circle class="bb" data-i="${i}" cx="${[44, 52, 60, 47, 56][i]}" cy="80" r="${[.7, .5, .9, .5, .6][i]}"/>`).join("")}</g></g></g><g ${L(.4)}><path d="${BOTTLE}"/><path d="M33 38 V66" stroke="rgba(240,247,252,.35)" stroke-width="1.2"/></g><g ${L(.2, ".4")}><path d="M66 30 H70 M66 42 H70 M66 54 H70"/></g>`,
    fueling: `<g ${L(.34, ".9")}><path data-m="course" d="M6 60 C 22 18, 38 72, 54 42 S 82 14, 94 26"/></g><g ${L(.2, ".5")}><path d="M6 66 H94" stroke-dasharray="1 3"/></g>${[.14, .3, .46, .62, .78, .94].map(f => `<circle class="st" data-f="${f}" r="1.5" fill="none" stroke="rgba(214,228,240,.55)" stroke-width=".7" vector-effect="non-scaling-stroke"/>`).join("")}<circle data-m="runner" r="1.7" fill="${GOLD}"/>`,
    more: `<rect class="sq" data-cx="30.0" data-cy="30.0" data-r="-8" x="24" y="24" width="12" height="12" rx="2.6" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="66.5" data-cy="24.5" data-r="10" x="62" y="20" width="9" height="9" rx="2.0" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="51.0" data-cy="45.0" data-r="4" x="44" y="38" width="14" height="14" rx="3.1" fill="none" stroke="${GOLD}" stroke-width="1" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="79.5" data-cy="49.5" data-r="-12" x="74" y="44" width="11" height="11" rx="2.4" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="31.0" data-cy="61.0" data-r="9" x="26" y="56" width="10" height="10" rx="2.2" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="62.5" data-cy="66.5" data-r="-5" x="56" y="60" width="13" height="13" rx="2.9" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="40.5" data-cy="80.5" data-r="12" x="36" y="76" width="9" height="9" rx="2.0" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="76.0" data-cy="82.0" data-r="6" x="70" y="76" width="12" height="12" rx="2.6" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/><rect class="sq" data-cx="83.5" data-cy="31.5" data-r="-6" x="80" y="28" width="7" height="7" rx="1.5" fill="none" stroke="rgba(214,228,240,.4)" stroke-width="0.7" vector-effect="non-scaling-stroke"/>`,
    habits: `<g ${L(.28, ".9")}><circle cx="58" cy="38" r="26"/><circle cx="58" cy="38" r="18"/><circle cx="58" cy="38" r="10"/></g><g fill="none" stroke-linecap="round" stroke-width="1.4" vector-effect="non-scaling-stroke"><circle class="rg" data-r="26" cx="58" cy="38" r="26" stroke="${GOLD}" transform="rotate(-90 58 38)"/><circle class="rg" data-r="18" cx="58" cy="38" r="18" stroke="rgba(214,228,240,.7)" transform="rotate(-90 58 38)"/><circle class="rg" data-r="10" cx="58" cy="38" r="10" stroke="rgba(214,228,240,.5)" transform="rotate(-90 58 38)"/></g>`,
    progress: `<g ${L(.2, ".4")}><path d="M0 16H100M0 66H100"/></g><g data-m="ecg"><path d="M-100 40 H-78 L-72 40 L-67 20 L-60 60 L-54 30 L-50 40 H-34 L-28 40 L-23 26 L-18 52 L-14 40 H0 H22 L28 40 L33 20 L40 60 L46 30 L50 40 H66 L72 40 L77 26 L82 52 L86 40 H100 H122 L128 40 L133 20 L140 60 L146 30 L150 40 H166 L172 40 L177 26 L182 52 L186 40 H200" ${L(.5)}/></g>`,
    messages: `<g ${L(.34)}><path d="M12 12 H88 V50 H52 L36 66 V50 H12 Z"/></g><g ${L(.45)}><path class="ln" d="M24 24 H76"/><path class="ln" d="M24 34 H62"/><path class="ln" d="M24 44 H48"/></g>`,
    coach: `<g ${L(.34)}><rect x="8" y="10" width="84" height="58" rx="3"/><line x1="50" y1="10" x2="50" y2="68"/><circle cx="50" cy="39" r="9"/><circle cx="68" cy="26" r="3"/><circle cx="30" cy="52" r="3"/><path d="M30 52 L68 26" stroke-dasharray="1 1.6"/></g><circle data-m="ball" r="2.2" cx="30" cy="52" fill="${GOLD}"/>`
};
ART.clients = ART.coach;

// Today: four folds of blue fabric behind one solid, tilted compass (Eddie, 2026-10-29). Each fold is its own
// layer (an svg with one shaded band) so scrolling only moves composited layers; the compass is real CSS 3D:
// a stack of rim discs, a face, a needle and a glass highlight.
const FOLDS = [[50, 36, 66, 46, 60], [62, 52, 78, 60, 50], [72, 66, 86, 72, 40], [84, 78, 94, 84, 30]];
const foldSvg = ([a, b, c, d, t], i, flip) => `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="al-fg${i}" x1="0" y1="0" x2=".15" y2="1"><stop offset="0" stop-color="#5a7690" stop-opacity=".75"/><stop offset=".18" stop-color="#3a5166"/><stop offset=".6" stop-color="#26374a"/><stop offset="1" stop-color="#18232e"/></linearGradient><filter id="al-fs${i}" x="-10%" y="-20%" width="120%" height="140%"><feDropShadow dx="0" dy="-1.2" stdDeviation="1.4" flood-color="#000" flood-opacity=".45"/></filter></defs><path ${flip ? 'transform="translate(100 0) scale(-1 1)" ' : ""}filter="url(#al-fs${i})" fill="url(#al-fg${i})" d="M-20 ${a} C 25 ${b}, 75 ${c}, 120 ${d} L120 ${d + t} C 75 ${c + t * 1.3}, 25 ${b + t * 0.7}, -20 ${a + t} Z"/></svg>`;
const compassHtml = () => {
    let tk = ""; for (let i = 0; i < 60; i++) { const a = i / 60 * 2 * Math.PI, r2 = i % 5 ? 42 : 38; tk += `M${(50 + Math.sin(a) * 46).toFixed(2)} ${(50 - Math.cos(a) * 46).toFixed(2)} L${(50 + Math.sin(a) * r2).toFixed(2)} ${(50 - Math.cos(a) * r2).toFixed(2)} `; }
    const rims = Array.from({ length: 16 }, (_, i) => `<div class="al-rim" style="transform:translateZ(${(i * 1.4).toFixed(1)}px)"></div>`).join("");
    return `<div class="al-cmp"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<div class="al-face"><svg viewBox="0 0 100 100"><path d="${tk}" stroke="rgba(226,236,245,.55)" stroke-width="1.1" fill="none"/><circle cx="50" cy="50" r="30" fill="none" stroke="rgba(226,236,245,.18)" stroke-width=".8"/><text x="50" y="25" text-anchor="middle" font-size="7" font-family="var(--font-mono),monospace" fill="rgba(226,236,245,.7)">N</text></svg></div><div class="al-ndl"><svg viewBox="0 0 100 100"><g class="al-nd"><path d="M50 14 L56 50 L50 50 Z" fill="${GOLD}"/><path d="M50 14 L44 50 L50 50 Z" fill="#a8843f"/><path d="M50 86 L56 50 L50 50 Z" fill="#9fb3c6"/><path d="M50 86 L44 50 L50 50 Z" fill="#6f8599"/></g><circle cx="50" cy="50" r="4" fill="#cfd9e2"/><circle cx="50" cy="50" r="1.6" fill="#55687a"/></svg></div><div class="al-glass"></div></div></div>`;
};

const stopwatchHtml = () => {
    let tk = ""; for (let i = 0; i < 60; i++) { const a = i / 60 * 2 * Math.PI, r2 = i % 5 ? 43 : 37; tk += `M${(50 + Math.sin(a) * 46).toFixed(2)} ${(50 - Math.cos(a) * 46).toFixed(2)} L${(50 + Math.sin(a) * r2).toFixed(2)} ${(50 - Math.cos(a) * r2).toFixed(2)} `; }
    const rims = Array.from({ length: 16 }, (_, i) => `<div class="al-rim" style="transform:translateZ(${(i * 1.4).toFixed(1)}px)"></div>`).join("");
    // Two pusher buttons (top crown, 45-degree start button), a small sub-dial at six o'clock and a gold sweep hand.
    return `<div class="al-cmp al-sw"><div class="al-cmp-sh"></div><div class="al-cmp-b"><div class="al-crown"></div><div class="al-pusher"></div>${rims}<div class="al-face"><svg viewBox="0 0 100 100"><path d="${tk}" stroke="rgba(226,236,245,.6)" stroke-width="1.3" fill="none"/><circle cx="50" cy="69" r="10" fill="rgba(10,18,26,.35)" stroke="rgba(226,236,245,.3)" stroke-width=".8"/><path d="M50 60 V63 M50 75 V78 M41 69 H44 M56 69 H59" stroke="rgba(226,236,245,.45)" stroke-width=".8"/><path d="M50 69 L54 65" stroke="${GOLD}" stroke-width="1" fill="none"/><text x="50" y="31" text-anchor="middle" font-size="5.2" font-family="var(--font-mono),monospace" letter-spacing="1" fill="rgba(226,236,245,.5)">SB</text></svg></div><div class="al-ndl"><svg viewBox="0 0 100 100"><g class="al-nd"><path d="M49 56 L49 16 L51 16 L51 56 Z" fill="${GOLD}"/><path d="M50 12 L53 18 L47 18 Z" fill="${GOLD}"/></g><circle cx="50" cy="50" r="4.5" fill="#cfd9e2"/><circle cx="50" cy="50" r="1.8" fill="#55687a"/></svg></div><div class="al-glass"></div></div></div>`;
};
// Pages that wear the fabric: the solid object, how fast its hand turns per px scrolled, and whether the folds slope the other way.
const FABRIC = { index: { obj: compassHtml, spin: 0.15, flip: false }, train: { obj: stopwatchHtml, spin: 0.5, flip: true } };

function startFabric(bg, spin) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const folds = [...bg.querySelectorAll(".al-fold")], body = bg.querySelector(".al-cmp-b"), nd = bg.querySelector(".al-nd");
    let queued = false;
    const draw = () => {
        queued = false;
        if (document.documentElement.classList.contains("sb-typing")) return;   // keep still while a keyboard is open
        const f = fabricState(still ? 0 : scrollY, spin);
        folds.forEach((g, i) => { g.style.transform = `translate3d(0,${f.folds[i].toFixed(1)}px,0)`; });
        body.style.transform = `rotateX(${f.rx.toFixed(2)}deg) rotateY(${f.ry.toFixed(2)}deg) rotateZ(-6deg)`;
        nd.style.transform = `rotate(${f.needle.toFixed(1)}deg)`;
    };
    draw();
    if (!still) addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(draw); } }, { passive: true });
}

// Move the drawing to where the scroll position says it should be.
function applyState(svg, state) {
    if (!state) return;
    const q = s => svg.querySelector(s), qa = s => [...svg.querySelectorAll(s)];
    if ("needle" in state) { q('[data-m="needle"]').setAttribute("transform", `rotate(${state.needle} 62 38)`); q('[data-m="dial"]').setAttribute("transform", `rotate(${state.dial} 62 38)`); }
    if ("cell" in state) qa(".cell").forEach(c => { const i = +c.dataset.i; c.setAttribute("fill", i === state.cell ? "rgba(210,173,98,.45)" : i < state.cell ? "rgba(214,228,240,.12)" : "none"); });
    if ("fillY" in state) {
        const y = state.fillY, tilt = svg._tilt || 0;
        q('[data-m="water"]').setAttribute("transform", `translate(0 ${y}) rotate(${tilt} 50 0)`);
        q('[data-m="w1"]').setAttribute("transform", `translate(${state.waveX} 0)`);
        q('[data-m="crest"]').setAttribute("transform", `translate(${state.waveX} 0)`);
        q('[data-m="w2"]').setAttribute("transform", `translate(${state.waveX2} 0)`);
        qa(".bb").forEach((c, i) => c.setAttribute("cy", (74 - y) - state.bub[i] * (72 - y)));
    }
    if ("run" in state) {
        const c = q('[data-m="course"]'), len = c.getTotalLength(), at = f => c.getPointAtLength(f * len);
        qa(".st").forEach(e => { const f = +e.dataset.f, pt = at(f); e.setAttribute("cx", pt.x); e.setAttribute("cy", pt.y); const hit = f <= state.run; e.setAttribute("fill", hit ? GOLD : "none"); e.setAttribute("stroke", hit ? GOLD : "rgba(214,228,240,.55)"); });
        const r = at(state.run), d = q('[data-m="runner"]'); d.setAttribute("cx", r.x); d.setAttribute("cy", r.y);
    }
    if ("sq" in state) qa(".sq").forEach((e, i) => { const k = state.sq[i], { cx, cy, r } = e.dataset; e.setAttribute("transform", `translate(${cx} ${cy}) rotate(${r}) scale(${k}) translate(${-cx} ${-cy})`); e.setAttribute("fill", k > 0.95 ? "rgba(214,228,240,.1)" : "none"); });
    if ("rings" in state) qa(".rg").forEach((c, i) => { const C = 2 * Math.PI * +c.dataset.r; c.setAttribute("stroke-dasharray", C); c.setAttribute("stroke-dashoffset", C * (1 - state.rings[i])); });
    if ("ecgX" in state) q('[data-m="ecg"]').setAttribute("transform", `translate(${state.ecgX} 0)`);
    if ("lines" in state) qa(".ln").forEach((l, i) => { l.style.opacity = state.lines[i]; });
    if ("ball" in state) { const b = q('[data-m="ball"]'); b.setAttribute("cx", state.ball.x); b.setAttribute("cy", state.ball.y); }
}

function startMotion(svg, page) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let queued = false, lastY = scrollY, sl = { angle: 0, vel: 0 }, settling = false;
    const draw = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        applyState(svg, instrumentState(page, still ? 0 : scrollY, max));
    };
    // Water only: tilt with the scroll speed, then settle level (a short ease-out, not a loop).
    const settle = () => {
        sl = sloshStep(sl.angle, sl.vel, 0); svg._tilt = sl.angle; draw();
        if (Math.abs(sl.angle) > 0.02 || Math.abs(sl.vel) > 0.02) requestAnimationFrame(settle); else { settling = false; svg._tilt = 0; draw(); }
    };
    const update = () => {
        queued = false;
        if (document.documentElement.classList.contains("sb-typing")) return;   // keep still while a keyboard is open
        if (page === "nutrition") { sl = sloshStep(sl.angle, sl.vel, scrollY - lastY); svg._tilt = sl.angle; if (!settling) { settling = true; requestAnimationFrame(settle); } }
        lastY = scrollY;
        draw();
    };
    draw();
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
    if (FABRIC[page]) {
        const { obj, spin, flip } = FABRIC[page];
        bg.innerHTML = FOLDS.map((f, i) => `<div class="al-fold">${foldSvg(f, i, flip)}</div>`).join("") + obj();
        document.body.prepend(bg);
        document.documentElement.classList.add("al-on");
        startFabric(bg, spin);
        return;
    }
    if (ART[page]) bg.innerHTML = page === "more" ? `<svg class="al-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${ART[page]}</svg>` : `<svg viewBox="0 0 100 80" preserveAspectRatio="xMaxYMin meet">${ART[page]}</svg>`;
    document.body.prepend(bg);
    document.documentElement.classList.add("al-on");
    const svg = bg.querySelector("svg");
    if (svg) startMotion(svg, page);
}
