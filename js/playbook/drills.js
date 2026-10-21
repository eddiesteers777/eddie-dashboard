import "./shell.js";
import * as D from "./drillModel.js";
import { SEED_DRILLS } from "./drillSeed.js";
import { loadLibrary } from "./boardLibrary.js";
import { boardThumb } from "./boardThumb.js";
import { KEYS, migrateOldKeys, applyTheme } from "./store.js";

const KEY = KEYS.drills, LIB_KEY = KEYS.library;
const $ = id => document.getElementById(id);


let drills = [], topic = "", editingId = null, openId = null;

function read() {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const l = D.parseDrills(raw); if (l) return l; }
    } catch {}
    return D.mergeSeeds([], SEED_DRILLS); // first visit: starter drills
}
function write(list) {
    drills = list;
    try { localStorage.setItem(KEY, D.serializeDrills(list)); } catch { toast("Couldn't save on this device"); }
    render();
}
const boards = () => { try { return loadLibrary(localStorage.getItem(LIB_KEY)).boards; } catch { return []; } };

function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200);
}
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

function render() {
    const list = D.filterDrills(drills, { topic, q: $("q").value, intensity: $("fInt").value, maxMinutes: Number($("fMin").value) });
    $("count").textContent = `${drills.length} drills`;
    const tbox = $("topics");
    if (!tbox.childElementCount) {
        for (const t of ["", ...D.TOPICS]) {
            const b = h("button", "pb-tool", t || "All"); b.type = "button"; b.dataset.t = t;
            b.onclick = () => { topic = t; render(); };
            tbox.appendChild(b);
        }
    }
    [...tbox.children].forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === topic)));
    const grid = $("grid"); grid.replaceChildren();
    $("none").hidden = list.length > 0;
    for (const d of list) {
        const c = h("button", "dr-card"); c.type = "button";
        c.append(h("span", "dr-tag", d.topic), h("b", "", d.name));
        const meta = h("span", "dr-meta", `${d.minutes} min · ${d.minPlayers}+ players`);
        meta.append(h("span", "dr-int " + d.intensity, d.intensity));
        c.append(meta);
        c.onclick = () => showDetail(d.id);
        grid.appendChild(c);
    }
}

function section(title, body) {
    const s = h("div", "dr-sec"); s.append(h("h3", "", title));
    if (Array.isArray(body)) { const ul = h("ul"); body.forEach(x => ul.append(h("li", "", x))); s.append(ul); } else s.append(h("p", "", body));
    return s;
}

function showDetail(id) {
    const d = drills.find(x => x.id === id); if (!d) return;
    openId = id;
    const dlg = $("detail"); dlg.replaceChildren();
    dlg.append(h("span", "dr-tag", d.topic), h("h2", "", d.name));
    const meta = h("p", "dr-meta", `${d.minutes} min · ${d.minPlayers}+ players${d.space ? " · " + d.space : ""}`);
    meta.append(h("span", "dr-int " + d.intensity, d.intensity));
    dlg.append(meta);
    const board = d.boardId && boards().find(b => b.id === d.boardId);
    const cols = h("div", "dr-cols" + (board ? " has-pic" : ""));
    const left = h("div");
    if (d.equipment.length) left.append(section("Equipment", d.equipment.join(", ")));
    if (d.setup) left.append(section("Setup", d.setup));
    if (d.how) left.append(section("How it runs", d.how));
    if (d.points.length) left.append(section("Coaching points", d.points));
    if (d.progressions.length) left.append(section("Make it harder", d.progressions));
    if (d.easier.length) left.append(section("Make it easier", d.easier));
    cols.append(left);
    if (board) { const pic = h("div", "dr-sec"); pic.append(h("h3", "", "Diagram"), boardThumb(board.board)); cols.append(pic); }
    dlg.append(cols);
    const act = h("div", "dr-detail-actions");
    const btn = (label, cls, fn) => { const b = h("button", "pb-btn " + cls, label); b.type = "button"; b.onclick = () => fn(b); act.append(b); return b; };
    if (board) { const a = h("a", "pb-btn", "Open diagram on board"); a.href = "board.html?board=" + encodeURIComponent(board.id); act.append(a); }
    btn("Print", "", () => window.print());
    btn("Edit", "", () => { dlg.close(); openEditor(id); });
    btn("Copy", "", () => { const r = D.duplicateDrill(drills, id); write(r.list); dlg.close(); toast("Copy added"); });
    btn("Delete", "", b => {
        if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Tap to confirm"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "Delete"; }, 3000); return; }
        write(D.deleteDrill(drills, id)); dlg.close(); toast("Deleted");
    });
    btn("Close", "", () => dlg.close());
    dlg.append(act);
    dlg.showModal();
}

function openEditor(id) {
    editingId = id || null;
    const d = id ? drills.find(x => x.id === id) : null;
    const f = $("form");
    $("edTitle").textContent = d ? "Edit drill" : "New drill";
    const sel = $("edTopic"); if (!sel.options.length) D.TOPICS.forEach(t => sel.add(new Option(t)));
    const bs = $("edBoard"); bs.replaceChildren(new Option("No diagram", ""));
    boards().forEach(b => bs.add(new Option(b.name, b.id)));
    const v = d || { name: "", topic: topic || "Passing", intensity: "Medium", minutes: 10, minPlayers: 6, space: "", equipment: [], setup: "", how: "", points: [], progressions: [], easier: [], boardId: "" };
    for (const k of ["name", "topic", "intensity", "minutes", "minPlayers", "space", "setup", "how", "boardId"]) f.elements[k].value = v[k];
    for (const k of ["equipment", "points", "progressions", "easier"]) f.elements[k].value = v[k].join("\n");
    $("editor").showModal();
}

function wire() {
    ["q", "fInt", "fMin"].forEach(id => $(id).addEventListener("input", render));
    $("newDrill").onclick = () => openEditor(null);
    $("edCancel").onclick = () => $("editor").close();
    $("form").onsubmit = e => {
        e.preventDefault();
        const f = $("form").elements, o = { id: editingId || "" };
        for (const k of ["name", "topic", "intensity", "minutes", "minPlayers", "space", "setup", "how", "boardId", "equipment", "points", "progressions", "easier"]) o[k] = f[k].value;
        const r = D.saveDrill(drills, o);
        if (!r.id) return toast("Give the drill a name");
        write(r.list); $("editor").close(); toast("Drill saved");
    };
    $("more").onclick = () => $("moreDlg").showModal();
    $("mClose").onclick = () => $("moreDlg").close();
    $("mBackup").onclick = () => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([D.serializeDrills(drills)], { type: "application/json" })); a.download = "southbound-playbook-drills.json";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        $("moreDlg").close(); toast("Backup saved");
    };
    $("mImport").onchange = async e => {
        const file = e.target.files[0]; e.target.value = "";
        if (!file) return;
        const inc = D.parseDrills(await file.text());
        $("moreDlg").close();
        if (!inc) return toast("That isn't a drills file");
        const before = drills.length; write(D.importDrills(drills, inc)); toast(`Added ${drills.length - before} drills`);
    };
    $("mSeeds").onclick = () => { const before = drills.length; write(D.mergeSeeds(drills, SEED_DRILLS)); $("moreDlg").close(); toast(drills.length > before ? `Added ${drills.length - before} starter drills` : "All starter drills are already here"); };
}

(() => {
    migrateOldKeys(); applyTheme();
    drills = read();
    wire(); render();
})();
