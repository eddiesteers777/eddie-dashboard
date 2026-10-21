// Small read-only picture of a saved board (used by the drill pages).
import { markPath } from "./boardModel.js";
import { C, HEADS, MARK_STYLE } from "./theme.js";
const NS = "http://www.w3.org/2000/svg", W = 68, H = 105;
const VB = { full: [0, 0, 68, 105], top: [0, 0, 68, 54], bottom: [0, 51, 68, 54] };

export function boardThumb(board) {
    const e = (n, a = {}, p) => { const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, a[k]); if (p) p.appendChild(x); return x; };
    const vb = VB[board.view] || VB.full;
    const svg = e("svg", { viewBox: vb.join(" "), role: "img", "aria-label": `Diagram: ${board.title}` });
    svg.style.cssText = `width:100%;height:auto;aspect-ratio:${vb[2]}/${vb[3]};border-radius:8px;display:block;background:${C.pitchA}`;
    const L = { fill: "none", stroke: C.line, "stroke-width": ".5" };
    for (let i = 0; i < 10; i++) e("rect", { x: 0, y: i * 10.5, width: W, height: 10.5, fill: i % 2 ? C.pitchB : C.pitchA }, svg);
    e("rect", { x: 2, y: 2, width: 64, height: 101, ...L }, svg);
    e("line", { x1: 2, y1: 52.5, x2: 66, y2: 52.5, ...L }, svg);
    e("circle", { cx: 34, cy: 52.5, r: 9.15, ...L }, svg);
    e("rect", { x: 13.85, y: 2, width: 40.3, height: 16.5, ...L }, svg);
    e("rect", { x: 13.85, y: 86.5, width: 40.3, height: 16.5, ...L }, svg);
    const defs = e("defs", {}, svg);
    for (const k in HEADS) { const m = e("marker", { id: "th-" + k, viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 3.4, markerHeight: 3.4, orient: "auto", markerUnits: "userSpaceOnUse" }, defs); e("path", { d: "M0 0L10 5L0 10z", fill: HEADS[k] }, m); }
    const st = Object.fromEntries(Object.entries(MARK_STYLE).map(([k, v]) => [k, [v.stroke, v.w, v.dash || "", v.head]]));
    for (const m of board.marks || []) {
        if (m.type === "zone") { const [a, b] = m.pts; e("rect", { x: Math.min(a.x, b.x) * W, y: Math.min(a.y, b.y) * H, width: Math.abs(a.x - b.x) * W, height: Math.abs(a.y - b.y) * H, fill: C.zoneFill, stroke: C.tan, "stroke-width": .5, "stroke-dasharray": "1.6 1" }, svg); }
        else if (m.type !== "text") { const [c, w, d, h] = st[m.type]; const a = { d: markPath(m, W, H), fill: "none", stroke: c, "stroke-width": w, "stroke-linecap": "round", "marker-end": `url(#th-${h})` }; if (d) a["stroke-dasharray"] = d; e("path", a, svg); }
    }
    const dot = (p, home) => { e("circle", { cx: p.x * W, cy: p.y * H, r: 3, fill: home ? C.home : C.away, stroke: home ? C.homeRing : C.awayRing, "stroke-width": .5 }, svg); const t = e("text", { x: p.x * W, y: p.y * H + 1.1, "text-anchor": "middle", fill: home ? C.homeText : C.awayText, "font-size": 3, "font-weight": 700, "font-family": "Albert Sans,sans-serif" }, svg); t.textContent = p.num; };
    if (board.showAway) board.away.forEach(p => dot(p, false));
    board.home.forEach(p => dot(p, true));
    e("circle", { cx: board.ball.x * W, cy: board.ball.y * H, r: 1.8, fill: C.ball, stroke: C.ballInk, "stroke-width": .4 }, svg);
    for (const m of board.marks || []) if (m.type === "text") { const t = e("text", { x: m.pts[0].x * W, y: m.pts[0].y * H, "text-anchor": "middle", fill: "#fff", stroke: "rgba(0,0,0,.5)", "stroke-width": .6, "paint-order": "stroke", "font-size": 3, "font-weight": 700, "font-family": "Albert Sans,sans-serif" }, svg); t.textContent = m.text; }
    return svg;
}
