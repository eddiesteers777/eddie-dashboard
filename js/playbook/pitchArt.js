// Southbound Playbook: how the pitch, players and ball are drawn (shared by the board and the small diagrams).
// Plain SVG with gradients only, so the PNG export keeps every detail.
import { C } from "./theme.js";

export const W = 68, H = 105;
export const PLAYER_R = 2.7;      // smaller markers leave room to read the play
export const NUM_FS = 2.5;        // jersey number size
export const NAME_FS = 2.1;

// Turns one list of [x, y] points into a regular polygon path (the ball's panels).
const poly = (cx, cy, r, n, rot = -90) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = ((rot + (360 / n) * i) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return "M" + pts.map(p => p[0].toFixed(3) + " " + p[1].toFixed(3)).join("L") + "Z";
};

export function addDefs(e, svg, id = "pa") {
    const defs = e("defs", {}, svg);
    const grad = (name, attrs, stops) => {
        const g = e(attrs.r ? "radialGradient" : "linearGradient", { id: `${id}-${name}`, ...attrs }, defs);
        for (const [o, c, op] of stops) e("stop", { offset: o, "stop-color": c, "stop-opacity": op ?? 1 }, g);
    };
    grad("vig", { cx: "50%", cy: "50%", r: "75%" }, [[".55", "#000", 0], [1, "#000", .34]]);
    grad("sheen", { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, "#fff", .09], [".5", "#fff", 0], [1, "#000", .12]]);
    grad("home", { cx: "35%", cy: "28%", r: "85%" }, [[0, "#2C4A3A"], [1, C.home]]);
    grad("away", { cx: "35%", cy: "28%", r: "85%" }, [[0, "#FFFFFF"], [1, "#D9D2BF"]]);
    grad("ball", { cx: "36%", cy: "30%", r: "80%" }, [[0, "#FFFFFF"], [".7", "#F1EFEA"], [1, "#C9C6BE"]]);
    const net = e("pattern", { id: `${id}-net`, width: .7, height: .7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    e("path", { d: "M0 0H.7M0 0V.7", stroke: "#fff", "stroke-width": .08, opacity: .55, fill: "none" }, net);
    const sh = e("filter", { id: `${id}-soft`, x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    e("feGaussianBlur", { stdDeviation: .55 }, sh);
    return defs;
}

export function drawPitch(e, svg, id = "pa", { strokeW = .38 } = {}) {
    for (let i = 0; i < 12; i++) e("rect", { x: 0, y: (i * H) / 12, width: W, height: H / 12 + .05, fill: i % 2 ? C.pitchB : C.pitchA }, svg);
    e("rect", { width: W, height: H, fill: `url(#${id}-sheen)` }, svg);
    const L = { fill: "none", stroke: C.line, "stroke-width": strokeW, "stroke-linejoin": "round" };
    e("rect", { x: 2, y: 2, width: 64, height: 101, ...L }, svg);
    e("line", { x1: 2, y1: 52.5, x2: 66, y2: 52.5, ...L }, svg);
    e("circle", { cx: 34, cy: 52.5, r: 9.15, ...L }, svg);
    e("circle", { cx: 34, cy: 52.5, r: .55, fill: "#fff", opacity: .9 }, svg);
    for (const top of [true, false]) {
        const y0 = top ? 2 : 103, d = top ? 1 : -1;
        e("rect", { x: 13.85, y: top ? y0 : y0 - 16.5, width: 40.3, height: 16.5, ...L }, svg);
        e("rect", { x: 24.85, y: top ? y0 : y0 - 5.5, width: 18.3, height: 5.5, ...L }, svg);
        e("circle", { cx: 34, cy: y0 + d * 11, r: .45, fill: "#fff", opacity: .9 }, svg);
        e("path", { d: `M 27.4 ${y0 + d * 16.5} A 9.15 9.15 0 0 ${top ? 0 : 1} 40.6 ${y0 + d * 16.5}`, ...L }, svg);
        // goal with a net behind the line
        e("rect", { x: 30.5, y: top ? y0 - 1.7 : y0, width: 7, height: 1.7, fill: `url(#${id}-net)`, stroke: "#fff", "stroke-width": .22, opacity: .9 }, svg);
        for (const left of [true, false]) {
            const cx = left ? 2 : 66, cy = y0;
            e("path", { d: `M ${cx + (left ? 1 : -1)} ${cy} A 1 1 0 0 ${(left ? 1 : 0) ^ (top ? 0 : 1) ? 1 : 0} ${cx} ${cy + d}`, ...L }, svg);
        }
    }
    e("rect", { width: W, height: H, fill: `url(#${id}-vig)`, "pointer-events": "none" }, svg);
}

// One player: soft shadow, a lit disc, a thin ring in the team's trim, the number.
export function drawPlayer(e, g, { home, num, selected, id = "pa", r = PLAYER_R, numFs = NUM_FS }) {
    e("ellipse", { cx: .3, cy: r * .78, rx: r * .95, ry: r * .45, fill: "#000", opacity: .42, filter: `url(#${id}-soft)` }, g);
    if (selected) {
        e("circle", { r: r + 1.5, fill: C.tan, opacity: .22 }, g);
        e("circle", { r: r + 1.1, fill: "none", stroke: C.tanLight, "stroke-width": .55 }, g);
    }
    e("circle", { class: "ring", r, fill: `url(#${id}-${home ? "home" : "away"})`, stroke: home ? C.homeRing : C.awayRing, "stroke-width": .5 }, g);
    e("path", { d: `M ${-r * .78} ${-r * .3} A ${r * .84} ${r * .84} 0 0 1 ${r * .6} ${-r * .62}`, fill: "none", stroke: "#fff", "stroke-width": .28, "stroke-linecap": "round", opacity: home ? .28 : .7 }, g);
    const t = e("text", { y: numFs * .36, "text-anchor": "middle", fill: home ? C.homeText : C.awayText, style: `font-size:${numFs}px` }, g);
    t.textContent = num;
    return t;
}

// A proper soccer ball: white with shaded edge, a black centre pentagon, seams, and edge panels.
export function drawBall(e, g, { id = "pa", r = 2.05 } = {}) {
    e("ellipse", { cx: .35, cy: r * .85, rx: r * .95, ry: r * .38, fill: "#000", opacity: .45, filter: `url(#${id}-soft)` }, g);
    const clipId = `${id}-ballclip`;
    const cp = e("clipPath", { id: clipId }, g);
    e("circle", { r }, cp);
    e("circle", { r, fill: `url(#${id}-ball)` }, g);
    const inner = e("g", { "clip-path": `url(#${clipId})` }, g);
    const ink = "#14231B";
    e("path", { d: poly(0, 0, r * .36, 5), fill: ink }, inner);
    for (let i = 0; i < 5; i++) {
        // Each seam leaves a corner of the centre panel and meets an edge panel pointing back at the centre.
        const deg = -90 + 72 * i, a = (deg * Math.PI) / 180;
        const x1 = Math.cos(a) * r * .36, y1 = Math.sin(a) * r * .36, x2 = Math.cos(a) * r * .62, y2 = Math.sin(a) * r * .62;
        e("line", { x1, y1, x2, y2, stroke: ink, "stroke-width": .13, "stroke-linecap": "round" }, inner);
        e("path", { d: poly(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0, r * .4, 5, deg + 180), fill: ink }, inner);
        // seams that run along the outer panel to the next one
        for (const side of [-36, 36]) {
            const b = ((deg + side) * Math.PI) / 180;
            e("line", { x1: Math.cos(a) * r * .62, y1: Math.sin(a) * r * .62, x2: Math.cos(b) * r * .98, y2: Math.sin(b) * r * .98, stroke: ink, "stroke-width": .1, "stroke-linecap": "round", opacity: .75 }, inner);
        }
    }
    e("circle", { r, fill: "none", stroke: ink, "stroke-width": .14, opacity: .7 }, g);
    e("ellipse", { cx: -r * .3, cy: -r * .42, rx: r * .28, ry: r * .16, fill: "#fff", opacity: .35, transform: "rotate(-30)" }, g);
}
