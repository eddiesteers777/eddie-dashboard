// Small read-only picture of a saved board (used by the drill pages).
import { markPath } from "./boardModel.js";
import { C, HEADS, MARK_STYLE } from "./theme.js";
import * as Art from "./pitchArt.js";
const NS = "http://www.w3.org/2000/svg", W = 68, H = 105;
const VB = { full: [0, 0, 68, 105], top: [0, 0, 68, 54], bottom: [0, 51, 68, 54] };

export function boardThumb(board) {
    const e = (n, a = {}, p) => { const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, a[k]); if (p) p.appendChild(x); return x; };
    const vb = VB[board.view] || VB.full;
    const svg = e("svg", { viewBox: vb.join(" "), role: "img", "aria-label": `Diagram: ${board.title}` });
    svg.style.cssText = `width:100%;height:auto;aspect-ratio:${vb[2]}/${vb[3]};border-radius:8px;display:block;background:${C.pitchA}`;
    const uid = "t" + Math.random().toString(36).slice(2, 7);
    const art = Art.addDefs(e, svg, uid);
    Art.drawPitch(e, svg, uid, { strokeW: .5 });
    const defs = art;
    for (const k in HEADS) { const m = e("marker", { id: "th-" + k, viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 3.4, markerHeight: 3.4, orient: "auto", markerUnits: "userSpaceOnUse" }, defs); e("path", { d: "M0 0L10 5L0 10z", fill: HEADS[k] }, m); }
    const st = Object.fromEntries(Object.entries(MARK_STYLE).map(([k, v]) => [k, [v.stroke, v.w, v.dash || "", v.head]]));
    for (const m of board.marks || []) {
        if (m.type === "zone") { const [a, b] = m.pts; e("rect", { x: Math.min(a.x, b.x) * W, y: Math.min(a.y, b.y) * H, width: Math.abs(a.x - b.x) * W, height: Math.abs(a.y - b.y) * H, fill: C.zoneFill, stroke: C.tan, "stroke-width": .5, "stroke-dasharray": "1.6 1" }, svg); }
        else if (m.type !== "text") { const [c, w, d, h] = st[m.type]; const a = { d: markPath(m, W, H), fill: "none", stroke: c, "stroke-width": w, "stroke-linecap": "round", "marker-end": `url(#th-${h})` }; if (d) a["stroke-dasharray"] = d; e("path", a, svg); }
    }
    const dot = (p, home) => { const g = e("g", { transform: `translate(${p.x * W} ${p.y * H})` }, svg); Art.drawPlayer(e, g, { home, num: p.num, id: uid, r: 2.5, numFs: 2.3 }); };
    if (board.showAway) board.away.forEach(p => dot(p, false));
    board.home.forEach(p => dot(p, true));
    { const g = e("g", { transform: `translate(${board.ball.x * W} ${board.ball.y * H})` }, svg); Art.drawBall(e, g, { id: uid, r: 1.8 }); }
    for (const m of board.marks || []) if (m.type === "text") { const t = e("text", { x: m.pts[0].x * W, y: m.pts[0].y * H, "text-anchor": "middle", fill: "#fff", stroke: "rgba(0,0,0,.5)", "stroke-width": .6, "paint-order": "stroke", "font-size": 3, "font-weight": 700, "font-family": "Albert Sans,sans-serif" }, svg); t.textContent = m.text; }
    return svg;
}
