// Drill diagram picture and step player (DOM). Pure data and rules live in drillDiagramModel.js.
import { GRID, marksAt, markD } from "./drillDiagramModel.js";

const NS = "http://www.w3.org/2000/svg";
const COLOR = { pass: "#EFE8DA", run: "#D2AD62", dribble: "#D2AD62", press: "#8FC3E8" };
const DASH = { run: "1.6 1.6", press: "1.6 1.6" };
const HEAD = { pass: "dd-h-pass", run: "dd-h-run", dribble: "dd-h-run", press: "dd-h-press" };

const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
};
const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

// An SVG of the diagram as it looks at step `i` (0-based).
export function diagramSvg(diagram, i, title = "Drill diagram") {
    const svg = el("svg", { viewBox: `0 0 ${GRID.w} ${GRID.h}`, role: "img", "aria-label": title, class: "dd-svg" });
    const defs = el("defs", {}, svg);
    for (const [id, color] of [["dd-h-pass", COLOR.pass], ["dd-h-run", COLOR.run], ["dd-h-press", COLOR.press]]) {
        const m = el("marker", { id, viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 4, markerHeight: 4, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
        el("path", { d: "M0 1 L9 5 L0 9z", fill: color }, m);
    }
    el("rect", { width: GRID.w, height: GRID.h, class: "dd-pitch" }, svg);
    el("rect", { x: 3, y: 3, width: 94, height: 64, class: "dd-line", fill: "none" }, svg);
    if (diagram.zone) { const [x, y, w, ht] = diagram.zone; el("rect", { x, y, width: w, height: ht, class: "dd-zone" }, svg); }
    for (const [x, y, w, ht] of diagram.goals) el("rect", { x, y, width: w, height: ht, class: "dd-goal" }, svg);
    if (diagram.label && diagram.zone) {
        const [x, y, w, ht] = diagram.zone;
        const t = el("text", { x: x + w / 2, y: y + ht / 2 + 1, class: "dd-label", "text-anchor": "middle" }, svg);
        t.textContent = diagram.label;
    }
    for (const [x, y] of diagram.cones) el("path", { d: `M${x} ${y - 2.4} l2.2 4 h-4.4z`, class: "dd-cone" }, svg);
    for (const m of marksAt(diagram, i)) {
        el("path", {
            d: markD(m), fill: "none", stroke: COLOR[m.kind], "stroke-width": m.now ? 1 : .8, "stroke-linecap": "round",
            "stroke-dasharray": DASH[m.kind] || "", "marker-end": `url(#${HEAD[m.kind]})`, opacity: m.now ? 1 : .4
        }, svg);
    }
    const dot = (p, cls, text) => {
        el("circle", { cx: p.x, cy: p.y, r: 3, class: "dd-p " + cls }, svg);
        const label = text || p.n;
        if (label) { const t = el("text", { x: p.x, y: p.y + 1.1, class: "dd-num", "text-anchor": "middle" }, svg); t.textContent = label; }
    };
    diagram.d.forEach(p => dot(p, "dd-d"));
    diagram.n.forEach(p => dot(p, "dd-n"));
    diagram.k.forEach(p => dot(p, "dd-k"));
    diagram.a.forEach(p => dot(p, "dd-a"));
    if (diagram.ball) el("circle", { cx: diagram.ball[0], cy: diagram.ball[1], r: 1.7, class: "dd-ball" }, svg);
    return svg;
}

function legend(diagram) {
    const row = h("div", "dd-legend");
    const item = (cls, text) => { const s = h("span"); s.append(h("i", cls), text); row.append(s); };
    if (diagram.a.length) item("dd-a", "Your team");
    if (diagram.d.length) item("dd-d", "Defenders");
    if (diagram.k.length) item("dd-k", "Keeper");
    if (diagram.n.length) item("dd-n", "Neutral");
    if (diagram.cones.length) item("dd-cone-i", "Cone");
    return row;
}

// Step player: tap Step 1, 2, 3 and the arrows build. The print view lists every step under one picture.
export function diagramPanel(diagram, title) {
    const wrap = h("div", "dd");
    const live = h("div", "dd-live");
    const pic = h("div", "dd-pic");
    const caption = h("p", "dd-cap");
    caption.setAttribute("aria-live", "polite");
    const bar = h("div", "dd-steps");
    const buttons = [];
    const show = i => {
        pic.replaceChildren(diagramSvg(diagram, i, `${title}: step ${i + 1}`));
        caption.textContent = diagram.steps[i].say;
        buttons.forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-pressed", k === i ? "true" : "false"); });
    };
    diagram.steps.forEach((s, i) => {
        const b = h("button", "dd-step", `Step ${i + 1}`);
        b.type = "button";
        b.onclick = () => show(i);
        buttons.push(b); bar.append(b);
    });
    live.append(pic, legend(diagram));
    if (diagram.steps.length > 1) live.append(bar);
    live.append(caption);
    const print = h("div", "dd-print");
    print.append(diagramSvg(diagram, diagram.steps.length - 1, title));
    const ol = h("ol", "dd-list");
    diagram.steps.forEach(s => ol.append(h("li", "", s.say)));
    print.append(ol);
    wrap.append(live, print);
    show(0);
    return wrap;
}
