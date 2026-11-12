/* Southbound lockup: four lines flow under the word SOUTHBOUND and merge into
   a dot just before COACHING, which starts under the T. Everything is sized
   in em from the font size of the .sb-lock element, so it scales with it.
   Usage: <span class="sb-lock" style="font-size:21px"><span class="sb-lock-word">Southbound</span>
   <span class="sb-lock-sub">Coaching</span></span>, then call drawLockups(). */

const LINES = ["#E6EEF5", "#C7D6E4", "#9FB2C3", "#D2AD62"];
const DOT = "#D2AD62";
const SVGNS = "http://www.w3.org/2000/svg";
const L0 = 1.35;      // room left of the word for the lines (em)
const GAP = 0.26;    // between word and sub line (em)
const SUB = 0.58;    // sub line size (em)
const SCALE = 100;
// How each line swoops in (em from the lockup's top-left): start x,y; two control points; a midpoint;
// then the last control point relative to the line's start. Order: top, left, right, bottom.
const FLY = [
    [0.8, -14, 7, -10, -7, -6, -2.5, -2.2, -1.2, -0.6],
    [-16, 0.6, -11, -4, -7, 5, -3.5, 1.4, -1.8, -0.6],
    [16, 3.2, 11, 7.5, 6, 0.5, 1.2, 3.4, -1.8, 1.4],
    [1.5, 14, -5, 10, 7, 7, 0.4, 4.4, -2, 2]
];

const CSS = `
.sb-lock{position:relative;display:inline-block;padding-left:${L0}em;font-size:20px;line-height:1;text-decoration:none;color:inherit;white-space:nowrap}
.sb-lock-word{display:block;font-family:var(--font-brand,'Saira',sans-serif);font-weight:800;font-size:1em;line-height:1;letter-spacing:.02em;text-transform:uppercase;color:var(--cream,#F1EBDD)}
.sb-lock-sub{display:block;margin-top:${GAP}em;font:700 ${SUB}em/1 var(--font-body,'Albert Sans',sans-serif);letter-spacing:.36em;text-transform:uppercase;color:var(--gold,#D2AD62)}
.sb-lock>svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.sb-lock-draw path{stroke-dasharray:1;stroke-dashoffset:1;animation:sb-lock-draw 1.5s calc(.2s + var(--i,0)*.5s) cubic-bezier(.3,.6,.3,1) forwards}
.sb-lock-draw circle{transform-box:fill-box;transform-origin:center;opacity:0;animation:sb-lock-dot .55s 2.7s cubic-bezier(.2,.8,.3,1.4) forwards}
.sb-lock-draw circle.ring{animation:sb-lock-ring 1s 2.7s ease-out forwards}
.sb-lock-draw .sb-lock-word{animation:sb-lock-word .9s 1.5s ease-out both}
.sb-lock-draw .sb-lock-sub{animation:sb-lock-sub .8s 2.75s ease-out both}
.sb-lock-draw path.lead,.sb-lock-draw path.rest{stroke-dasharray:1 2;stroke-dashoffset:1;opacity:0;animation-duration:1.7s;animation-delay:calc(.15s + var(--i,0)*.3s);animation-fill-mode:forwards;animation-timing-function:cubic-bezier(.45,.05,.85,.5)}
.sb-lock-draw path.lead{animation-name:sb-lock-lead}
.sb-lock-draw path.rest{animation-name:sb-lock-rest}
@keyframes sb-lock-lead{0%,3%{opacity:0;stroke-dashoffset:1}4%{opacity:1}50%{opacity:1;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:0}}
@keyframes sb-lock-rest{0%,45%{opacity:0;stroke-dashoffset:1}47%{opacity:1}100%{opacity:1;stroke-dashoffset:0}}
@keyframes sb-lock-draw{to{stroke-dashoffset:0}}
@keyframes sb-lock-dot{0%{opacity:0;transform:scale(.2)}55%{opacity:1;transform:scale(1.7)}100%{opacity:1;transform:scale(1)}}
@keyframes sb-lock-ring{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(6)}}
@keyframes sb-lock-word{from{opacity:0;transform:translateY(.25em)}to{opacity:1;transform:none}}
@keyframes sb-lock-sub{from{opacity:0;transform:translateX(-.5em)}to{opacity:1;transform:none}}
@keyframes sb-glow-hit{0%{transform:scale(1);opacity:.8}35%{transform:scale(1.45);opacity:1}100%{transform:scale(1.1);opacity:.75}}
@media (prefers-reduced-motion:reduce){.sb-lock-draw path,.sb-lock-draw circle{animation:none;stroke-dashoffset:0;opacity:1}.sb-lock-draw path.lead{opacity:0}.sb-lock-draw path.rest{stroke-dashoffset:0;opacity:1}.sb-lock-draw circle.ring{display:none}.sb-lock-draw .sb-lock-word,.sb-lock-draw .sb-lock-sub{animation:none}}
`;

function ensureStyle() {
    if (document.getElementById("sb-lock-style")) return;
    const s = document.createElement("style");
    s.id = "sb-lock-style";
    s.textContent = CSS;
    document.head.appendChild(s);
}

function mk(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
}

export function drawLockup(el, { animate = false } = {}) {
    if (!el || el.querySelector(":scope > svg")) return;
    ensureStyle();
    const bold = el.hasAttribute("data-bold");
    const L = bold ? 1.8 : L0;
    el.style.paddingLeft = L + "em";
    const word = el.querySelector(".sb-lock-word");
    const sub = el.querySelector(".sb-lock-sub");
    if (!word || !sub) return;

    // Width of "Sou" (em): the sub line starts under the T.
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;letter-spacing:inherit;text-transform:inherit";
    probe.className = "sb-lock-word";
    probe.style.display = "inline-block";
    probe.textContent = "Sou";
    el.appendChild(probe);
    const fs = parseFloat(getComputedStyle(word).fontSize) || 20;
    const sou = probe.getBoundingClientRect().width / fs;
    probe.remove();
    sub.style.marginLeft = sou + "em";

    const tx = L + sou;                         // x where the T starts
    const yb = 1 + GAP + SUB / 2;               // centre of the sub line
    const h = 1 + GAP + SUB;
    const dotX = tx - 0.95, r = bold ? 0.12 : 0.075, sw = bold ? 0.25 : 0.15, step = bold ? 0.33 : 0.22;
    const u = v => +(v * SCALE).toFixed(1);

    const svg = mk("svg", { viewBox: `0 0 ${u(tx)} ${u(h)}`, width: tx * fs, height: h * fs, "aria-hidden": "true" });
    svg.style.width = tx + "em";
    svg.style.height = h + "em";
    LINES.forEach((c, i) => {
        const y = (bold ? 0.14 : 0.1) + i * step;
        const fly = bold && animate ? FLY[i] : null;   // animated splash: each line comes in from its own side
        const rest = `C${u(L * 0.9)} ${u(y)} ${u(L * 0.6)} ${u(yb)} ${u(L + 0.3)} ${u(yb)} L${u(dotX - 0.1)} ${u(yb)}`;
        const line = d => mk("path", { d, fill: "none", stroke: c, "stroke-width": u(sw), "stroke-linecap": "round", pathLength: 1, style: `--i:${i}` });
        if (fly) {
            // splash: the flight in (lead) fades away once the line has arrived; the rest stays
            const lead = line(`M${u(fly[0])} ${u(fly[1])} C${u(fly[2])} ${u(fly[3])} ${u(fly[4])} ${u(fly[5])} ${u(fly[6])} ${u(fly[7])} S${u(sw / 2 + fly[8])} ${u(y + fly[9])} ${u(sw / 2)} ${u(y)}`);
            lead.setAttribute("class", "lead");
            const tail = line(`M${u(sw / 2)} ${u(y)} ` + rest);
            tail.setAttribute("class", "rest");
            svg.appendChild(lead);
            svg.appendChild(tail);
        } else {
            svg.appendChild(line(`M${u(sw / 2)} ${u(y)} ` + rest));
        }
    });
    if (animate) svg.appendChild(mk("circle", { class: "ring", cx: u(dotX), cy: u(yb), r: u(r * 1.15 + 0.03), fill: "none", stroke: DOT, "stroke-width": u(0.04) }));
    svg.appendChild(mk("circle", { cx: u(dotX), cy: u(yb), r: u(r * 1.15 + 0.03), fill: DOT }));
    el.insertBefore(svg, el.firstChild);
    el.classList.add("sb-lock-ready");
    if (animate) {
        el.classList.add("sb-lock-draw");
        const splash = el.closest(".eos-splash");
        if (splash) setTimeout(() => splash.classList.add("sb-hit"), 2700);
    }
}

export function drawLockups(root = document, opts) {
    const go = () => root.querySelectorAll(".sb-lock").forEach(el => {
        try { drawLockup(el, opts); } catch (e) {}
        el.classList.add("sb-lock-ready");
    });
    // Load the two faces first: fonts.ready can resolve before they were asked for,
    // which drew the lines for fallback letters and showed raw text.
    if (document.fonts && document.fonts.load) {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        Promise.race([
            Promise.all([document.fonts.load("800 20px Saira"), document.fonts.load("700 12px 'Albert Sans'")]),
            wait(1500)
        ]).then(go, go);
    } else go();
}
