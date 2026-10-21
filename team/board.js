import * as M from "./boardModel.js";

const KEY = "calera-board-current";
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";

// ---- coach-only gate (nav hiding is UX; the board holds nothing in the cloud) ----
async function allowed() {
    try {
        const { waitForUser } = await import("../js/auth.js");
        const { isApprovedCoach } = await import("../js/userProfile.js");
        const user = await waitForUser();
        return Boolean(user) && (await isApprovedCoach());
    } catch { return false; }
}

let hist, selected = null;

function load() {
    try { const b = M.parseBoard(localStorage.getItem(KEY) || ""); if (b) return b; } catch {}
    return M.newBoard();
}
function save() { try { localStorage.setItem(KEY, M.serialize(hist.present)); } catch {} }
function apply(next) { hist = M.commit(hist, next); save(); render(); }

function el(name, attrs = {}, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}

const W = 68, H = 105;

function drawPitch(svg) {
    for (let i = 0; i < 10; i++) el("rect", { x: 0, y: i * 10.5, width: W, height: 10.5, fill: i % 2 ? "#3A8556" : "#3F8F5E" }, svg);
    const L = { fill: "none", stroke: "rgba(255,255,255,.9)", "stroke-width": ".45" };
    el("rect", { x: 2, y: 2, width: 64, height: 101, ...L }, svg);
    el("line", { x1: 2, y1: 52.5, x2: 66, y2: 52.5, ...L }, svg);
    el("circle", { cx: 34, cy: 52.5, r: 9.15, ...L }, svg);
    el("circle", { cx: 34, cy: 52.5, r: .6, fill: "#fff" }, svg);
    for (const top of [true, false]) {
        const y0 = top ? 2 : 103;
        const d = top ? 1 : -1;
        el("rect", { x: 13.85, y: top ? y0 : y0 - 16.5, width: 40.3, height: 16.5, ...L }, svg);
        el("rect", { x: 24.85, y: top ? y0 : y0 - 5.5, width: 18.3, height: 5.5, ...L }, svg);
        el("circle", { cx: 34, cy: y0 + d * 11, r: .5, fill: "#fff" }, svg);
        el("path", { d: `M ${27.4} ${y0 + d * 16.5} A 9.15 9.15 0 0 ${top ? 0 : 1} ${40.6} ${y0 + d * 16.5}`, ...L }, svg);
    }
}

function playerNode(p, side, svg) {
    const g = el("g", { class: "pl", "data-id": p.id, tabindex: 0, role: "button", "aria-label": `${side === "h" ? "Your" : "Opponent"} player ${p.num}${p.name ? " " + p.name : ""}` }, svg);
    g.setAttribute("transform", `translate(${p.x * W} ${p.y * H})`);
    const home = side === "h";
    if (p.id === selected) el("circle", { r: 4.9, fill: "none", stroke: "#7CC4FF", "stroke-width": 1, opacity: .95 }, g);
    el("circle", { class: "ring", r: 3.6, fill: home ? "#0B2A5B" : "#9AA5B4", stroke: "#fff", "stroke-width": .6 }, g);
    const t = el("text", { y: 1.25, "text-anchor": "middle", fill: "#fff" }, g);
    t.textContent = p.num;
    if (p.name) {
        const n = el("text", { class: "nm", y: 7, "text-anchor": "middle" }, g);
        n.textContent = p.name;
    }
    return g;
}

function render() {
    const b = hist.present;
    const svg = $("pitch");
    svg.replaceChildren();
    drawPitch(svg);
    if (b.showAway) b.away.forEach(p => playerNode(p, "a", svg));
    b.home.forEach(p => playerNode(p, "h", svg));
    const ball = el("g", { class: "pl", "data-ball": 1, tabindex: 0, role: "button", "aria-label": "Ball" }, svg);
    ball.setAttribute("transform", `translate(${b.ball.x * W} ${b.ball.y * H})`);
    el("circle", { r: 2.1, fill: "#fff", stroke: "#0B1F3F", "stroke-width": .5 }, ball);
    el("circle", { r: .8, fill: "#0B1F3F" }, ball);

    $("undo").disabled = !hist.past.length;
    $("redo").disabled = !hist.future.length;
    if (document.activeElement !== $("title")) $("title").value = b.title;
    $("scenario").value = b.scenario;
    $("showAway").checked = b.showAway;
    chips("homeChips", b.homeFormation, "home");
    chips("awayChips", b.awayFormation, "away");
    $("awayChips").hidden = !b.showAway;
    const sel = selected && M.findPlayer(b, selected);
    $("selForm").hidden = !sel;
    $("selEmpty").hidden = Boolean(sel);
    if (sel) {
        if (document.activeElement !== $("selNum")) $("selNum").value = sel.num;
        if (document.activeElement !== $("selName")) $("selName").value = sel.name;
    }
}

function chips(id, current, side) {
    const box = $(id);
    box.replaceChildren();
    for (const f of M.FORMATIONS) {
        const b = document.createElement("button");
        b.className = "tb-chip"; b.type = "button"; b.textContent = f;
        b.setAttribute("aria-pressed", String(f === current));
        b.onclick = () => apply(M.setFormation(hist.present, side, f));
        box.appendChild(b);
    }
}

// ---- dragging (mouse, touch and pen share pointer events) ----
function toBoard(svg, e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x / W, y: p.y / H };
}
function setupDrag() {
    const svg = $("pitch");
    let drag = null;
    svg.addEventListener("pointerdown", e => {
        const g = e.target.closest(".pl");
        if (!g) { selected = null; render(); return; }
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        const id = g.dataset.id || null;
        const start = toBoard(svg, e);
        const cur = id ? M.findPlayer(hist.present, id) : hist.present.ball;
        drag = { id, g, dx: cur.x - start.x, dy: cur.y - start.y, moved: false, base: hist.present, pending: hist.present };
        if (id && selected !== id) { selected = id; render(); drag.g = svg.querySelector(`[data-id="${id}"]`); }
    });
    svg.addEventListener("pointermove", e => {
        if (!drag) return;
        const p = toBoard(svg, e);
        const x = p.x + drag.dx, y = p.y + drag.dy;
        drag.pending = drag.id ? M.movePlayer(drag.base, drag.id, x, y) : M.moveBall(drag.base, x, y);
        drag.moved = true;
        const now = drag.id ? M.findPlayer(drag.pending, drag.id) : drag.pending.ball;
        drag.g.setAttribute("transform", `translate(${now.x * W} ${now.y * H})`);
    });
    const end = () => {
        if (!drag) return;
        const d = drag; drag = null;
        if (d.moved) apply(d.pending); else render();
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    // keyboard: arrows nudge the focused player or ball
    svg.addEventListener("keydown", e => {
        const g = e.target.closest?.(".pl");
        const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!g || !step) return;
        e.preventDefault();
        const id = g.dataset.id || null;
        const cur = id ? M.findPlayer(hist.present, id) : hist.present.ball;
        const x = cur.x + step[0] * 0.02, y = cur.y + step[1] * 0.02;
        if (id) selected = id;
        apply(id ? M.movePlayer(hist.present, id, x, y) : M.moveBall(hist.present, x, y));
        svg.querySelector(id ? `[data-id="${id}"]` : "[data-ball]")?.focus();
    });
}

function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}

// ---- export ----
function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const slug = s => (s || "board").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "board";

async function exportPng() {
    const svg = $("pitch").cloneNode(true);
    svg.setAttribute("xmlns", NS);
    svg.querySelectorAll("text").forEach(t => t.setAttribute("font-family", "Albert Sans, Arial, sans-serif"));
    svg.querySelectorAll(".nm").forEach(t => { t.setAttribute("style", "font-size:2.4px;font-weight:600"); t.setAttribute("fill", "#fff"); t.setAttribute("stroke", "rgba(0,0,0,.55)"); t.setAttribute("stroke-width", ".6"); t.setAttribute("paint-order", "stroke"); });
    svg.querySelectorAll("text:not(.nm)").forEach(t => t.setAttribute("style", "font-size:3.4px;font-weight:700"));
    svg.removeAttribute("style");
    const scale = 10;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas");
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    download(slug(hist.present.title) + ".png", blob);
}

function wire() {
    $("undo").onclick = () => { hist = M.undo(hist); save(); render(); };
    $("redo").onclick = () => { hist = M.redo(hist); save(); render(); };
    document.addEventListener("keydown", e => {
        if (!(e.ctrlKey || e.metaKey) || e.target.matches("input,select,textarea")) return;
        if (e.key === "z") { e.preventDefault(); $(e.shiftKey ? "redo" : "undo").click(); }
        if (e.key === "y") { e.preventDefault(); $("redo").click(); }
    });
    $("showAway").onchange = e => apply(M.setShowAway(hist.present, e.target.checked));
    $("scenario").onchange = e => apply(M.setMeta(hist.present, { scenario: e.target.value }));
    $("title").onchange = e => apply(M.setMeta(hist.present, { title: e.target.value.trim() || "Untitled board" }));
    const edit = () => selected && apply(M.editPlayer(hist.present, selected, { num: $("selNum").value === "" ? undefined : $("selNum").value, name: $("selName").value }));
    $("selNum").onchange = edit; $("selName").onchange = edit;
    $("selName").oninput = () => selected && apply(M.editPlayer(hist.present, selected, { name: $("selName").value }));
    $("reset").onclick = () => { selected = null; apply(M.newBoard()); toast("Board reset. Undo brings it back."); };
    const dlg = $("exportDlg");
    $("export").onclick = () => dlg.showModal();
    $("expClose").onclick = () => dlg.close();
    $("expPng").onclick = async () => { try { await exportPng(); dlg.close(); toast("Image saved"); } catch { toast("Couldn't make the image"); } };
    $("expJson").onclick = () => { download(slug(hist.present.title) + ".json", new Blob([M.serialize(hist.present)], { type: "application/json" })); dlg.close(); toast("Board file saved"); };
    $("impJson").onchange = async e => {
        const f = e.target.files[0]; e.target.value = "";
        if (!f) return;
        const b = M.parseBoard(await f.text());
        dlg.close();
        if (!b) return toast("That file isn't a board");
        selected = null; apply(b); toast("Board opened");
    };
}

(async () => {
    if (!(await allowed())) { location.replace("../index.html"); return; }
    hist = M.createHistory(load());
    $("gate").hidden = true; $("app").hidden = false;
    wire(); setupDrag(); render();
})();
