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
    nutrition: `<defs><clipPath id="al-bc"><path d="${BOTTLE}"/></clipPath><linearGradient id="al-wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(214,228,240)" stop-opacity=".5"/><stop offset="1" stop-color="rgb(150,185,215)" stop-opacity=".2"/></linearGradient></defs><g clip-path="url(#al-bc)"><g data-m="water"><path data-m="w2" d="M-20 0 q5.5 -1.6 11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 V90 H-20 Z" fill="rgba(214,228,240,.2)"/><path data-m="w1" d="M-20 0 q5.5 -1.1 11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 V90 H-20 Z" fill="url(#al-wg)"/><path data-m="crest" d="M-20 0 q5.5 -1.1 11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 t11 0 " fill="none" stroke="rgba(240,247,252,.75)" stroke-width=".5" vector-effect="non-scaling-stroke"/><g fill="none" stroke="rgba(235,244,250,.6)" stroke-width=".5" vector-effect="non-scaling-stroke">${[0, 1, 2, 3, 4].map(i => `<circle class="bb" data-i="${i}" cx="${[44, 52, 60, 47, 56][i]}" cy="80" r="${[.7, .5, .9, .5, .6][i]}"/>`).join("")}</g></g></g><g ${L(.4)}><path d="${BOTTLE}"/><path d="M33 38 V66" stroke="rgba(240,247,252,.35)" stroke-width="1.2"/></g><g ${L(.2, ".4")}><path d="M66 30 H70 M66 42 H70 M66 54 H70"/></g>`,
};

// Today: four still folds of blue fabric and one solid, tilted compass (Eddie, 2026-10-29), which sits still in the page header (2026-10-29 fix). Each fold is its own
// svg layer; the compass is real CSS 3D:
// a stack of rim discs, a face, a needle and a glass highlight.
// Four still layers of fabric, back to front: three big arcs sweeping in from the right (like the curve of a track)
// and a low wave at the bottom. Each has a soft shadow on its top edge and a thin edge light: gold, mist, the selected-tab cream, mist.
const BLUE = ["#6d8aa6", "#3f5870", "#2a3e52", "#1a2734"];
const FOLDS = [
    { d: "M114 -12 C 80 8, 52 40, 40 114 H114 Z", edge: "M114 -12 C 80 8, 52 40, 40 114", c: BLUE, rim: "gold" },
    { d: "M114 14 C 86 34, 62 62, 56 114 H114 Z", edge: "M114 14 C 86 34, 62 62, 56 114", c: BLUE, rim: "mist" },
    { d: "M114 42 C 94 58, 76 80, 72 114 H114 Z", edge: "M114 42 C 94 58, 76 80, 72 114", c: BLUE, rim: "cream" },
    { d: "M-12 80 C 20 70, 40 84, 60 100 C 66 106, 70 110, 74 114 H-12 Z", edge: "M-12 80 C 20 70, 40 84, 60 100 C 66 106, 70 110, 74 114", c: BLUE, rim: "mist" },
];
const RIM = { mist: ["rgba(214,228,240,.55)", "rgba(214,228,240,.2)"], cream: ["#E6CB8E", "#C7D6E4"], gold: ["rgba(210,173,98,.75)", "rgba(210,173,98,.15)"] };
const foldSvg = (f, i, flip) => `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="al-fg${i}" x1="0" y1="0" x2=".25" y2="1"><stop offset="0" stop-color="${f.c[0]}" stop-opacity=".8"/><stop offset=".2" stop-color="${f.c[1]}"/><stop offset=".6" stop-color="${f.c[2]}"/><stop offset="1" stop-color="${f.c[3]}"/></linearGradient><linearGradient id="al-fr${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${RIM[f.rim][1]}"/><stop offset=".5" stop-color="${RIM[f.rim][0]}"/><stop offset="1" stop-color="${RIM[f.rim][1]}"/></linearGradient><filter id="al-fs${i}" x="-10%" y="-20%" width="120%" height="140%"><feDropShadow dx="0" dy="-1.4" stdDeviation="1.8" flood-color="#000" flood-opacity=".5"/></filter></defs><g${flip ? ' transform="translate(100 0) scale(-1 1)"' : ""}><path filter="url(#al-fs${i})" fill="url(#al-fg${i})" d="${f.d}"/><path d="${f.edge}" fill="none" stroke="url(#al-fr${i})" stroke-width="${f.rim === "mist" ? 1 : 1.4}" stroke-linecap="round" vector-effect="non-scaling-stroke"/></g></svg>`;
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
const calendarHtml = () => {
    const rims = Array.from({ length: 10 }, (_, i) => `<div class="al-rim" style="transform:translateZ(${(i * 1.4).toFixed(1)}px)"></div>`).join("");
    const days = ["M", "T", "W", "T", "F", "S", "S"].map(d => `<b>${d}</b>`).join("");
    const cells = Array.from({ length: 21 }, (_, i) => `<i class="al-cell" data-i="${i}"></i>`).join("");
    const rings = [22, 50, 78].map(x => `<div class="al-bring" style="left:${x}%"></div>`).join("");
    return `<div class="al-cmp al-cal"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<div class="al-face"><div class="al-days">${days}</div><div class="al-grid">${cells}</div></div>${rings}<div class="al-glass"></div></div></div>`;
};
const bottleHtml = () => {
    // The bottle is extruded: 12 copies of its outline stacked in depth, then the water (the Fuel drawing: waves, crest,
    // bubbles, level from scroll) and a glass highlight in front. Two layers of waves move; the surface tilts with scroll speed.
    const vb = 'viewBox="26 2 48 70" preserveAspectRatio="xMidYMid meet"';
    const rims = Array.from({ length: 12 }, (_, i) => `<svg class="al-brim" ${vb} style="transform:translateZ(${(i * 1.6).toFixed(1)}px)"><path d="${BOTTLE}"/></svg>`).join("");
    return `<div class="al-cmp al-bt"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<svg class="al-bwater" ${vb}><defs><linearGradient id="al-brg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a8399"/><stop offset=".55" stop-color="#2a3b4c"/><stop offset="1" stop-color="#121b24"/></linearGradient></defs>${ART.nutrition}</svg><svg class="al-bglass" ${vb}><path d="${BOTTLE}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M34 32 V60" stroke="rgba(255,255,255,.4)" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></div></div>`;
};
const ringsHtml = () => {
    // Three thick rings (daily habit progress) drawn 8 copies deep; the front copy is bright, the ones behind are darker.
    const R = [[40, GOLD], [29, "rgba(214,228,240,.85)"], [18, "rgba(214,228,240,.6)"]];
    const copy = i => `<svg class="al-hring" viewBox="0 0 100 100" style="transform:translateZ(${(i * 1.5).toFixed(1)}px);${i < 7 ? "filter:brightness(.5)" : ""}">${R.map(([r, col], k) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(214,228,240,.16)" stroke-width="7"/><circle class="rg" data-k="${k}" data-r="${r}" cx="50" cy="50" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" transform="rotate(-90 50 50)"/>`).join("")}</svg>`;
    return `<div class="al-cmp al-rg"><div class="al-cmp-sh"></div><div class="al-cmp-b">${Array.from({ length: 8 }, (_, i) => copy(i)).join("")}</div></div>`;
};
const ECG_D = "M-100 40 H-78 L-72 40 L-67 20 L-60 60 L-54 30 L-50 40 H-34 L-28 40 L-23 26 L-18 52 L-14 40 H0 H22 L28 40 L33 20 L40 60 L46 30 L50 40 H66 L72 40 L77 26 L82 52 L86 40 H100 H122 L128 40 L133 20 L140 60 L146 30 L150 40 H166 L172 40 L177 26 L182 52 L186 40 H200";
const monitorHtml = () => {
    // A thick heart monitor: extruded slab, dark glass screen with a faint grid, a heartbeat line that slides as you scroll.
    const rims = Array.from({ length: 10 }, (_, i) => `<div class="al-rim" style="transform:translateZ(${(i * 1.5).toFixed(1)}px)"></div>`).join("");
    return `<div class="al-cmp al-mon"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<div class="al-face"><svg viewBox="0 8 100 64" preserveAspectRatio="none"><path d="M0 24H100M0 40H100M0 56H100M20 8V72M40 8V72M60 8V72M80 8V72" stroke="rgba(214,228,240,.1)" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/><g data-m="ecg"><path d="${ECG_D}" fill="none" stroke="rgba(226,236,245,.92)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g></svg><i class="al-led"></i><b class="al-bpm">BPM</b></div><div class="al-glass"></div></div></div>`;
};
const messagesHtml = () => {
    // A thick chat bubble with a tail; its three lines write in as you scroll.
    const rims = Array.from({ length: 10 }, (_, i) => { const z = `translateZ(${(i * 1.5).toFixed(1)}px)`; return `<div class="al-rim" style="transform:${z}"></div><div class="al-rim al-tl" style="transform:${z}"></div>`; }).join("");
    return `<div class="al-cmp al-msg"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<div class="al-face"><i class="ln"></i><i class="ln"></i><i class="ln"></i><i class="al-led"></i></div><div class="al-face al-tl al-tlf"></div><div class="al-glass"></div></div></div>`;
};
const boardHtml = () => {
    // A thick tactics board: pitch lines on a dark slab, a gold ball that travels the dotted pass as you scroll.
    const rims = Array.from({ length: 10 }, (_, i) => `<div class="al-rim" style="transform:translateZ(${(i * 1.5).toFixed(1)}px)"></div>`).join("");
    return `<div class="al-cmp al-brd"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<div class="al-face"><svg viewBox="0 4 100 70" preserveAspectRatio="none"><g fill="none" stroke="rgba(226,236,245,.7)" stroke-width="1.6" vector-effect="non-scaling-stroke"><rect x="8" y="10" width="84" height="58" rx="2"/><line x1="50" y1="10" x2="50" y2="68"/><circle cx="50" cy="39" r="9"/><path d="M8 26H20V52H8M92 26H80V52H92"/><circle cx="68" cy="26" r="2.6"/><circle cx="30" cy="52" r="2.6"/><path d="M30 52L68 26" stroke-dasharray="1 3" stroke="rgba(226,236,245,.5)"/></g><circle data-m="ball" r="3" cx="30" cy="52" fill="${GOLD}"/></svg></div><div class="al-glass"></div></div></div>`;
};
const courseHtml = () => {
    // A thick race-course slab: the course line with aid-station dots, and a gold runner who follows it as you scroll.
    const rims = Array.from({ length: 10 }, (_, i) => `<div class="al-rim" style="transform:translateZ(${(i * 1.5).toFixed(1)}px)"></div>`).join("");
    const dots = [.14, .3, .46, .62, .78, .94].map(f => `<circle class="st" data-f="${f}" r="2.4" fill="none" stroke="rgba(214,228,240,.55)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>`).join("");
    return `<div class="al-cmp al-brd al-crs"><div class="al-cmp-sh"></div><div class="al-cmp-b">${rims}<div class="al-face"><svg viewBox="0 4 100 72" preserveAspectRatio="xMidYMid meet"><path d="M6 70H94" fill="none" stroke="rgba(226,236,245,.25)" stroke-width="1.4" stroke-dasharray="1 3" vector-effect="non-scaling-stroke"/><path data-m="course" d="M6 60 C 22 18, 38 72, 54 42 S 82 14, 94 26" fill="none" stroke="rgba(226,236,245,.85)" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${dots}<circle data-m="runner" r="3.2" cx="6" cy="60" fill="${GOLD}"/></svg></div><div class="al-glass"></div></div></div>`;
};
const TILES = [[30, 30, -8, 12], [66.5, 24.5, 10, 9], [51, 45, 4, 14], [79.5, 49.5, -12, 11], [31, 61, 9, 10], [62.5, 66.5, -5, 13], [40.5, 80.5, 12, 9], [76, 82, 6, 12], [83.5, 31.5, -6, 7]];
const tilesHtml = () => {
    // Nine thick tiles scattered over the whole screen; each grows in, one after another, as you scroll.
    const tile = ([x, y, r, w]) => `<div class="al-tile" data-r="${r}" style="left:${x}%;top:${y}%;width:calc(var(--u)*${w});transform:translate(-50%,-50%) rotate(${r}deg) scale(.4)">${[0, 1, 2, 3].map(i => `<i style="transform:translateZ(${i * 1.6}px)"></i>`).join("")}<b></b></div>`;
    return `<div class="al-cmp al-tls"><div class="al-cmp-b">${TILES.map(tile).join("")}</div></div>`;
};
// Pages that wear the fabric: the solid object, how fast its hand turns per px scrolled, and whether the folds slope the other way.
const FABRIC = { index: { obj: compassHtml, spin: 0, flip: false, inHero: true }, train: { obj: stopwatchHtml, spin: 0.5, flip: true }, plan: { obj: calendarHtml, spin: 0, flip: false }, nutrition: { obj: bottleHtml, spin: 0, flip: true }, habits: { obj: ringsHtml, spin: 0, flip: false }, progress: { obj: monitorHtml, spin: 0, flip: true }, messages: { obj: messagesHtml, spin: 0, flip: false }, coach: { obj: boardHtml, spin: 0, flip: true }, clients: { obj: boardHtml, spin: 0, flip: true }, fueling: { obj: courseHtml, spin: 0, flip: false }, more: { obj: tilesHtml, spin: 0, flip: false } };

function startFabric(bg, spin, page) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nd = bg.querySelector(".al-nd");
    let queued = false, lastY = scrollY, sl = { angle: 0, vel: 0 }, settling = false;
    const water = () => {
        if (page !== "nutrition") return;
        const max = document.documentElement.scrollHeight - innerHeight;
        bg._tilt = sl.angle;
        applyState(bg, instrumentState("nutrition", Y(), max));
    };
    const settle = () => {   // a short ease-out after scrolling stops, not a loop
        sl = sloshStep(sl.angle, sl.vel, 0); water();
        if (Math.abs(sl.angle) > 0.02 || Math.abs(sl.vel) > 0.02) requestAnimationFrame(settle); else { settling = false; sl = { angle: 0, vel: 0 }; water(); }
    };
    // The fabric and the object never move (moving them made phones choppy); only the instrument's parts follow the scroll.
    const Y = () => still ? 0 : scrollY;
    const draw = () => {
        queued = false;
        if (document.documentElement.classList.contains("sb-typing")) return;   // keep still while a keyboard is open
        if (page === "nutrition" && !still) { sl = sloshStep(sl.angle, sl.vel, scrollY - lastY); if (!settling) { settling = true; requestAnimationFrame(settle); } }
        lastY = scrollY; water();
        const f = fabricState(Y(), spin);   // the fabric and the object stay still; only the moving parts follow the scroll
        if (nd) nd.style.transform = `rotate(${f.needle.toFixed(1)}deg)`;
        if (page === "progress") applyState(bg, instrumentState("progress", Y(), 1));
        if (page === "coach" || page === "clients") applyState(bg, instrumentState(page, Y(), document.documentElement.scrollHeight - innerHeight));
        if (page === "fueling") applyState(bg, instrumentState("fueling", Y(), document.documentElement.scrollHeight - innerHeight));
        if (page === "more") {   // tiles grow in one after another
            const sq = instrumentState("more", Y(), document.documentElement.scrollHeight - innerHeight).sq;
            bg.querySelectorAll(".al-tile").forEach((t, i) => { t.style.transform = `translate(-50%,-50%) rotate(${t.dataset.r}deg) scale(${sq[i].toFixed(3)})`; });
        }
        if (page === "messages") applyState(bg, instrumentState("messages", Y(), document.documentElement.scrollHeight - innerHeight));
        if (page === "habits") applyState(bg, instrumentState("habits", Y(), document.documentElement.scrollHeight - innerHeight));
        if (page === "plan") {   // the gold marker steps through the 21 days as you scroll
            const cell = instrumentState("plan", Y(), document.documentElement.scrollHeight - innerHeight).cell;
            bg.querySelectorAll(".al-cell").forEach((c, i) => { c.className = "al-cell" + (i === cell ? " on" : i < cell ? " done" : ""); });
        }
    };
    draw();
    if (!still) addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(draw); } }, { passive: true });
}

// Move the drawing to where the scroll position says it should be.
function applyState(svg, state) {
    if (!state) return;
    const q = s => svg.querySelector(s), qa = s => [...svg.querySelectorAll(s)];
    if ("needle" in state) { q('[data-m="needle"]').setAttribute("transform", `rotate(${state.needle} 62 38)`); q('[data-m="dial"]').setAttribute("transform", `rotate(${state.dial} 62 38)`); }
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
    if ("rings" in state) qa(".rg").forEach((c, i) => { const C = 2 * Math.PI * +c.dataset.r, k = c.dataset.k ?? i; c.setAttribute("stroke-dasharray", C); c.setAttribute("stroke-dashoffset", C * (1 - state.rings[k])); });
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
        const { obj, spin, flip, inHero } = FABRIC[page];
        // Today: the compass stands still in the page header, beside the greeting, in place of the brand tile.
        // Behind the page it showed through the glass cards on the right (From Your Coach on a computer).
        const hero = inHero && document.querySelector(".eos-today-hero");
        bg.innerHTML = FOLDS.map((f, i) => `<div class="al-fold">${foldSvg(f, i, flip)}</div>`).join("") + (hero ? "" : obj());
        if (hero) {
            const art = document.createElement("div");
            art.className = "al-bg al-hero-art";
            art.setAttribute("aria-hidden", "true");
            art.innerHTML = obj();
            hero.append(art);
            hero.classList.add("al-has-art");
        }
        document.body.prepend(bg);
        document.documentElement.classList.add("al-on");
        startFabric(bg, spin, page);
        return;
    }
    if (ART[page]) bg.innerHTML = page === "more" ? `<svg class="al-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${ART[page]}</svg>` : `<svg viewBox="0 0 100 80" preserveAspectRatio="xMaxYMin meet">${ART[page]}</svg>`;
    document.body.prepend(bg);
    document.documentElement.classList.add("al-on");
    const svg = bg.querySelector("svg");
    if (svg) startMotion(svg, page);
}
