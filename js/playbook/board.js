import * as M from "./boardModel.js";
import * as L from "./boardLibrary.js";
import * as R from "./rosterModel.js";
import { KEYS, migrateOldKeys, applyTheme, toggleTheme, clearAll } from "./store.js";
import { C, HEADS, MARK_STYLE as STYLE } from "./theme.js";

const KEY = KEYS.board;
const LIB_KEY = KEYS.library;
const ID_KEY = KEYS.boardId;
const ROSTER_KEY = KEYS.roster;
const readRoster = () => { try { return R.parseRoster(localStorage.getItem(ROSTER_KEY) || "") || []; } catch { return []; } };
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";

let hist, selected = null, selectedMark = null, tool = "select";
const VBOX = { full: [0, 0, 68, 105], top: [0, 0, 68, 54], bottom: [0, 51, 68, 54] };
const TOOLS = [
    ["select", "Select", '<path d="M4 2l0 12 3-3 2 4 2-1-2-4 4 0z" fill="currentColor"/>'],
    ["pass", "Pass", '<path d="M2 11L18 4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 3l-5 0 2 4z" fill="currentColor"/>'],
    ["run", "Run", '<path d="M2 11L18 4" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2.4" fill="none"/><path d="M20 3l-5 0 2 4z" fill="currentColor"/>'],
    ["dribble", "Dribble", '<path d="M2 9q2-5 4 0t4 0t4 0t4 0" stroke="currentColor" stroke-width="2" fill="none"/>'],
    ["arrow", "Arrow", '<path d="M2 7h15" stroke="currentColor" stroke-width="3" fill="none"/><path d="M22 7l-6-5v10z" fill="currentColor"/>'],
    ["zone", "Zone", '<rect x="3" y="2" width="16" height="10" rx="1.5" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2" fill="none"/>'],
    ["text", "Note", '<path d="M4 3h14M11 3v10" stroke="currentColor" stroke-width="2.4" fill="none"/>']
];

function load() {
    try { const b = M.parseBoard(localStorage.getItem(KEY) || ""); if (b) return b; } catch {}
    return M.newBoard();
}
function readLib() { try { return L.loadLibrary(localStorage.getItem(LIB_KEY)); } catch { return L.emptyLibrary(); } }
function writeLib(lib) { try { localStorage.setItem(LIB_KEY, L.serializeLibrary(lib)); return true; } catch { toast("Couldn't save on this device"); return false; } }
let currentId = null;
function setCurrentId(id) { currentId = id; try { id ? localStorage.setItem(ID_KEY, id) : localStorage.removeItem(ID_KEY); } catch {} }
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
    for (let i = 0; i < 10; i++) el("rect", { x: 0, y: i * 10.5, width: W, height: 10.5, fill: i % 2 ? C.pitchB : C.pitchA }, svg);
    const L = { fill: "none", stroke: C.line, "stroke-width": ".45" };
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
    if (p.id === selected) el("circle", { r: 4.9, fill: "none", stroke: C.tan, "stroke-width": 1, opacity: .95 }, g);
    el("circle", { class: "ring", r: 3.6, fill: home ? C.home : C.away, stroke: home ? C.homeRing : C.awayRing, "stroke-width": .7 }, g);
    const t = el("text", { y: 1.25, "text-anchor": "middle", fill: home ? C.homeText : C.awayText }, g);
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
    const vb = VBOX[b.view] || VBOX.full;
    svg.setAttribute("viewBox", vb.join(" "));
    svg.style.aspectRatio = `${vb[2]} / ${vb[3]}`;
    svg.classList.toggle("drawing", tool !== "select");
    const defs = el("defs", {}, svg);
    for (const k in HEADS) {
        const m = el("marker", { id: "ah-" + k, viewBox: "0 0 10 10", refX: 6, refY: 5, markerWidth: 3.4, markerHeight: 3.4, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
        el("path", { d: "M0 0L10 5L0 10z", fill: HEADS[k] }, m);
    }
    drawPitch(svg);
    b.marks.filter(m => m.type !== "text").forEach(m => markNode(m, svg));
    if (b.showAway) b.away.forEach(p => playerNode(p, "a", svg));
    b.home.forEach(p => playerNode(p, "h", svg));
    const ball = el("g", { class: "pl", "data-ball": 1, tabindex: 0, role: "button", "aria-label": "Ball" }, svg);
    ball.setAttribute("transform", `translate(${b.ball.x * W} ${b.ball.y * H})`);
    el("circle", { r: 2.1, fill: C.ball, stroke: C.ballInk, "stroke-width": .5 }, ball);
    el("circle", { r: .8, fill: C.ballInk }, ball);

    b.marks.filter(m => m.type === "text").forEach(m => markNode(m, svg)); // notes sit above players
    $("phTitle").textContent = b.title;
    $("phMeta").textContent = `${b.scenario} · ${b.homeFormation}${b.showAway ? " vs " + b.awayFormation : ""} · ${new Date().toLocaleDateString()}`;
    $("undo").disabled = !hist.past.length;
    $("redo").disabled = !hist.future.length;
    if (document.activeElement !== $("title")) $("title").value = b.title;
    $("scenario").value = b.scenario;
    $("showAway").checked = b.showAway;
    chips("homeChips", b.homeFormation, "home");
    chips("awayChips", b.awayFormation, "away");
    $("awayChips").hidden = !b.showAway;
    const sel = selected && M.findPlayer(b, selected);
    const mk = selectedMark && b.marks.find(m => m.id === selectedMark);
    if (selectedMark && !mk) selectedMark = null;
    $("selForm").hidden = !sel;
    $("selMark").hidden = !mk;
    $("markTextWrap").hidden = !(mk && mk.type === "text");
    if (mk && mk.type === "text" && document.activeElement !== $("markText")) $("markText").value = mk.text;
    $("selEmpty").hidden = Boolean(sel || mk);
    $("clearMarks").disabled = !b.marks.length;
    renderTools();
    chips("viewChips", b.view, "view");
    if (sel) {
        const isHome = b.home.some(p => p.id === sel.id);
        $("selRosterWrap").hidden = !isHome;
        if (isHome) fillRosterSelect(b, sel);
        if (document.activeElement !== $("selNum")) $("selNum").value = sel.num;
        if (document.activeElement !== $("selName")) $("selName").value = sel.name;
    }
}

const VIEW_LABELS = { full: "Full pitch", top: "Attack half", bottom: "Defend half" };
function renderTools() {
    const box = $("tools");
    if (box.childElementCount === TOOLS.length) {
        [...box.children].forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
        return;
    }
    for (const [id, label, icon] of TOOLS) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "pb-tool"; b.dataset.tool = id;
        b.innerHTML = `<svg viewBox="0 0 24 14" aria-hidden="true">${icon}</svg>${label}`;
        b.onclick = () => { tool = id; if (id !== "select") { selected = null; selectedMark = null; } render(); };
        box.appendChild(b);
    }
    renderTools();
}

function markNode(m, svg) {
    const g = el("g", { class: "mk", "data-mark": m.id, tabindex: 0, role: "button", "aria-label": `${m.type === "text" ? "Note: " + m.text : m.type}` }, svg);
    const sel = m.id === selectedMark;
    if (m.type === "zone") {
        const [a, b] = m.pts;
        const r = { x: Math.min(a.x, b.x) * W, y: Math.min(a.y, b.y) * H, width: Math.abs(a.x - b.x) * W, height: Math.abs(a.y - b.y) * H, rx: 1 };
        el("rect", { ...r, fill: C.zoneFill, stroke: C.tan, "stroke-width": sel ? 1 : .5, "stroke-dasharray": "1.6 1" }, g);
    } else if (m.type === "text") {
        const t = el("text", { x: m.pts[0].x * W, y: m.pts[0].y * H, "text-anchor": "middle" }, g);
        t.textContent = m.text;
        if (sel) { const bb = { x: m.pts[0].x * W - 8, y: m.pts[0].y * H - 4, width: 16, height: 6 }; el("rect", { ...bb, fill: "none", stroke: C.tan, "stroke-width": .5, rx: 1 }, g); }
    } else {
        const d = M.markPath(m, W, H), st = STYLE[m.type];
        if (sel) el("path", { d, fill: "none", stroke: C.tan, "stroke-width": st.w + 1.6, opacity: .55, "stroke-linecap": "round" }, g);
        const a = { d, fill: "none", stroke: st.stroke, "stroke-width": st.w, "stroke-linecap": "round", "stroke-linejoin": "round", "marker-end": `url(#ah-${st.head})` };
        if (st.dash) a["stroke-dasharray"] = st.dash;
        el("path", a, g);
        el("path", { d, class: "hit" }, g);
    }
    if (m.type === "zone") el("rect", { x: Math.min(m.pts[0].x, m.pts[1].x) * W, y: Math.min(m.pts[0].y, m.pts[1].y) * H, width: Math.abs(m.pts[0].x - m.pts[1].x) * W, height: Math.abs(m.pts[0].y - m.pts[1].y) * H, fill: "transparent" }, g);
    return g;
}

function fillRosterSelect(b, sel) {
    const box = $("selRoster"), roster = readRoster();
    const placed = new Set(b.home.filter(p => p.rid && p.id !== sel.id).map(p => p.rid));
    box.replaceChildren(new Option(roster.length ? "Not from roster" : "Roster is empty", ""));
    for (const p of roster) if (p.id === sel.rid || (p.here && !placed.has(p.id))) box.add(new Option(p.name + (p.num != null ? ` #${p.num}` : "") + (p.here ? "" : " (away)"), p.id));
    box.value = sel.rid || "";
}

function renderLineup() {
    const b = hist.present, roster = readRoster();
    const here = R.available(roster);
    $("luHint").textContent = roster.length ? `${here.length} of ${roster.length} players are here today. Fill puts them in your ${b.homeFormation} by position.` : "Your roster is empty. Add players first, then fill the lineup.";
    $("luAuto").disabled = !here.length;
    const roles = R.slotRoles(b.homeFormation), list = $("luList"); list.replaceChildren();
    b.home.forEach((p, i) => {
        const li = document.createElement("li"); li.className = "lu-slot";
        const r = document.createElement("b"); r.textContent = roles[i];
        const n = document.createElement("span"); n.textContent = `#${p.num}`;
        const nm = document.createElement("span"); nm.textContent = p.name || "empty";
        li.append(r, n, nm); list.append(li);
    });
    const placed = new Set(b.home.map(p => p.rid).filter(Boolean));
    const bench = here.filter(p => !placed.has(p.id)).map(p => p.name);
    $("luBench").textContent = bench.length ? bench.join(", ") : roster.length ? "Everyone who is here is in the lineup." : "";
}

function chips(id, current, side) {
    const box = $(id);
    box.replaceChildren();
    if (side === "view") {
        for (const v of M.VIEWS) {
            const b = document.createElement("button");
            b.className = "pb-chip"; b.type = "button"; b.textContent = VIEW_LABELS[v];
            b.setAttribute("aria-pressed", String(v === current));
            b.onclick = () => apply(M.setView(hist.present, v));
            box.appendChild(b);
        }
        return;
    }
    for (const f of M.FORMATIONS) {
        const b = document.createElement("button");
        b.className = "pb-chip"; b.type = "button"; b.textContent = f;
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
    let drag = null, draw = null;
    const finishDraw = () => {
        const d = draw; draw = null;
        svg.querySelector(".preview")?.remove();
        if (!d) return;
        const mark = M.makeMark(tool, d.pts, M.nextMarkId(hist.present));
        if (!mark) { render(); return; }
        selectedMark = mark.id;
        const wasText = mark.type === "text";
        if (wasText) tool = "select";
        apply(M.addMark(hist.present, mark));
        if (wasText) { $("markText").focus(); $("markText").select(); }
    };
    svg.addEventListener("pointerdown", e => {
        if (tool !== "select") {
            e.preventDefault();
            svg.setPointerCapture(e.pointerId);
            draw = { pts: [toBoard(svg, e)] };
            return;
        }
        const g = e.target.closest(".pl");
        const mk = !g && e.target.closest(".mk");
        if (!g && !mk) { selected = null; selectedMark = null; render(); return; }
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        const start = toBoard(svg, e);
        if (mk) {
            const id = mk.dataset.mark;
            selected = null; selectedMark = id;
            render();
            drag = { mark: id, g: svg.querySelector(`[data-mark="${id}"]`), start, moved: false, base: hist.present, pending: hist.present };
            return;
        }
        selectedMark = null;
        const id = g.dataset.id || null;
        const cur = id ? M.findPlayer(hist.present, id) : hist.present.ball;
        drag = { id, g, dx: cur.x - start.x, dy: cur.y - start.y, moved: false, base: hist.present, pending: hist.present };
        if (id && selected !== id) { selected = id; render(); drag.g = svg.querySelector(`[data-id="${id}"]`); }
    });
    svg.addEventListener("pointermove", e => {
        if (draw) {
            const p = toBoard(svg, e);
            const l = draw.pts[draw.pts.length - 1];
            if (Math.hypot(p.x - l.x, p.y - l.y) < 0.004) return;
            draw.pts.push(p);
            svg.querySelector(".preview")?.remove();
            const m = tool === "text" ? null : M.makeMark(tool, draw.pts, "pv");
            if (m) {
                const n = markNode(m, svg); n.classList.add("preview"); n.style.pointerEvents = "none"; n.style.opacity = ".8";
            }
            return;
        }
        if (!drag) return;
        const p = toBoard(svg, e);
        if (drag.mark) {
            drag.pending = M.moveMark(drag.base, drag.mark, p.x - drag.start.x, p.y - drag.start.y);
            drag.moved = true;
            const m = drag.pending.marks.find(x => x.id === drag.mark);
            const old = drag.base.marks.find(x => x.id === drag.mark);
            drag.g.setAttribute("transform", `translate(${(m.pts[0].x - old.pts[0].x) * W} ${(m.pts[0].y - old.pts[0].y) * H})`);
            return;
        }
        const x = p.x + drag.dx, y = p.y + drag.dy;
        drag.pending = drag.id ? M.movePlayer(drag.base, drag.id, x, y) : M.moveBall(drag.base, x, y);
        drag.moved = true;
        const now = drag.id ? M.findPlayer(drag.pending, drag.id) : drag.pending.ball;
        drag.g.setAttribute("transform", `translate(${now.x * W} ${now.y * H})`);
    });
    const end = () => {
        if (draw) return finishDraw();
        if (!drag) return;
        const d = drag; drag = null;
        if (d.moved) apply(d.pending); else render();
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", () => { if (draw) { draw = null; render(); } else end(); });
    // keyboard: arrows nudge the focused player or ball
    svg.addEventListener("keydown", e => {
        const g = e.target.closest?.(".pl");
        const mk = e.target.closest?.(".mk");
        if (mk && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selected = null; selectedMark = mk.dataset.mark; render(); return; }
        const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!g || !step) return;
        e.preventDefault();
        const id = g.dataset.id || null;
        const cur = id ? M.findPlayer(hist.present, id) : hist.present.ball;
        const x = cur.x + step[0] * 0.02, y = cur.y + step[1] * 0.02;
        if (id) { selected = id; selectedMark = null; }
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
    svg.querySelectorAll(".hit").forEach(n => n.remove());
    svg.querySelectorAll(".mk text").forEach(t => { t.setAttribute("fill", "#fff"); t.setAttribute("stroke", "rgba(0,0,0,.5)"); t.setAttribute("stroke-width", ".7"); t.setAttribute("paint-order", "stroke"); t.setAttribute("style", "font-size:3px;font-weight:700"); });
    const scale = 10;
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement("canvas");
    const vb = $("pitch").viewBox.baseVal;
    c.width = vb.width * scale; c.height = vb.height * scale;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    download(slug(hist.present.title) + ".png", blob);
}

const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : new Date(t).toLocaleDateString(); };

function renderBoards() {
    const lib = readLib();
    const list = $("bdList");
    list.replaceChildren();
    const items = L.sortedBoards(lib);
    $("bdEmpty").hidden = items.length > 0;
    const cur = lib.boards.find(b => b.id === currentId);
    $("bdSave").textContent = cur ? `Update "${cur.name}"` : "Save this board";
    for (const it of items) {
        const li = document.createElement("li");
        li.className = "pb-item" + (it.id === currentId ? " cur" : "");
        const b = it.board;
        li.innerHTML = `<b></b><small></small><div class="pb-row"></div>`;
        li.querySelector("b").textContent = it.name;
        li.querySelector("small").textContent = `${b.scenario} · ${b.homeFormation} · ${ago(it.updatedAt)}`;
        const row = li.querySelector(".pb-row");
        const btn = (label, fn) => { const x = document.createElement("button"); x.type = "button"; x.className = "pb-btn"; x.textContent = label; x.onclick = () => fn(x); row.appendChild(x); return x; };
        btn("Open", () => { selected = null; selectedMark = null; tool = "select"; setCurrentId(it.id); apply(it.board); $("boardsDlg").close(); toast("Opened " + it.name); });
        btn("Copy", () => { const r = L.duplicateBoard(readLib(), it.id); if (writeLib(r.lib)) { renderBoards(); toast("Copy saved"); } });
        btn("Delete", x => {
            if (x.dataset.arm !== "1") { x.dataset.arm = "1"; x.textContent = "Tap to confirm"; setTimeout(() => { x.dataset.arm = ""; x.textContent = "Delete"; }, 3000); return; }
            if (writeLib(L.deleteBoard(readLib(), it.id))) { if (currentId === it.id) setCurrentId(null); renderBoards(); toast("Deleted"); }
        });
        list.appendChild(li);
    }
}

function wireBoards() {
    const dlg = $("boardsDlg");
    $("boards").onclick = () => { renderBoards(); dlg.showModal(); };
    $("bdClose").onclick = () => dlg.close();
    $("bdSave").onclick = () => {
        const r = L.saveBoard(readLib(), hist.present, currentId);
        if (writeLib(r.lib)) { setCurrentId(r.id); renderBoards(); toast("Saved"); }
    };
    $("bdBackup").onclick = () => {
        const lib = readLib();
        if (!lib.boards.length) return toast("Nothing saved yet");
        download("southbound-playbook-boards.json", new Blob([L.serializeLibrary(lib)], { type: "application/json" }));
        toast("Backup saved");
    };
    $("bdRestore").onchange = async e => {
        const f = e.target.files[0]; e.target.value = "";
        if (!f) return;
        const inc = L.parseLibrary(await f.text());
        if (!inc || !inc.boards.length) return toast("That isn't a boards backup");
        if (writeLib(L.mergeLibrary(readLib(), inc))) { renderBoards(); toast(`Added ${inc.boards.length} board${inc.boards.length > 1 ? "s" : ""}`); }
    };
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
    $("selRoster").onchange = e => {
        if (!selected) return;
        apply(M.assignPlayer(hist.present, selected, e.target.value ? readRoster().find(p => p.id === e.target.value) : null));
    };
    $("lineupBtn").onclick = () => { renderLineup(); $("lineupDlg").showModal(); };
    $("luClose").onclick = () => $("lineupDlg").close();
    $("luAuto").onclick = () => { apply(M.applyLineup(hist.present, R.autoLineup(readRoster(), hist.present.homeFormation))); renderLineup(); toast("Lineup filled. Undo brings back the old one."); };
    $("luClear").onclick = () => { apply(M.clearLineup(hist.present)); renderLineup(); };
    $("selName").oninput = () => selected && apply(M.editPlayer(hist.present, selected, { name: $("selName").value }));
    $("markText").oninput = () => selectedMark && apply(M.updateMark(hist.present, selectedMark, { text: $("markText").value || " " }));
    $("markDel").onclick = () => { if (selectedMark) { const id = selectedMark; selectedMark = null; apply(M.removeMark(hist.present, id)); } };
    $("clearMarks").onclick = () => { selectedMark = null; apply(M.clearMarks(hist.present)); toast("Drawings cleared. Undo brings them back."); };
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && tool !== "select") { tool = "select"; render(); }
        if ((e.key === "Delete" || e.key === "Backspace") && selectedMark && !e.target.matches("input,select,textarea")) { e.preventDefault(); $("markDel").click(); }
    });
    $("reset").onclick = () => { selected = null; selectedMark = null; tool = "select"; setCurrentId(null); apply(M.newBoard()); toast("Board reset. Undo brings it back."); };
    $("expPrint").onclick = () => { $("exportDlg").close(); setTimeout(() => window.print(), 50); };
    wireBoards();
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
        selected = null; selectedMark = null; setCurrentId(null); apply(b); toast("Board opened");
    };
}

(() => {
    migrateOldKeys();
    applyTheme();
    hist = M.createHistory(load());
    try { const id = localStorage.getItem(ID_KEY); if (id && readLib().boards.some(b => b.id === id)) currentId = id; } catch {}
    wire(); setupDrag(); render();
    // drills.html links here with ?board=<saved board id>
    const want = new URLSearchParams(location.search).get("board");
    const found = want && readLib().boards.find(b => b.id === want);
    if (found) { setCurrentId(found.id); apply(found.board); toast("Opened " + found.name); history.replaceState(null, "", location.pathname); }
})();
