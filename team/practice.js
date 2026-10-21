import * as D from "./drillModel.js";
import * as P from "./practiceModel.js";
import { SEED_DRILLS } from "./drillSeed.js";
import * as R from "./rosterModel.js";

const DRILL_KEY = "calera-board-drills", CUR_KEY = "calera-board-practice-current", LIST_KEY = "calera-board-practices", ID_KEY = "calera-board-practice-id";
const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

async function allowed() {
    try {
        const { waitForUser } = await import("../js/auth.js");
        const { isApprovedCoach } = await import("../js/userProfile.js");
        const user = await waitForUser();
        return Boolean(user) && (await isApprovedCoach());
    } catch { return false; }
}

let drills = [], byId = new Map(), pr = P.newPractice(), currentId = null, notes = [];

function loadDrills() {
    try { const l = D.parseDrills(localStorage.getItem(DRILL_KEY) || ""); if (l) return l; } catch {}
    return D.mergeSeeds([], SEED_DRILLS);
}
function persist() { try { localStorage.setItem(CUR_KEY, JSON.stringify(pr)); } catch {} }
const readList = () => { try { return P.parsePracticeList(localStorage.getItem(LIST_KEY) || ""); } catch { return []; } };
function writeList(l) { try { localStorage.setItem(LIST_KEY, P.serializePracticeList(l)); return true; } catch { toast("Couldn't save on this device"); return false; } }
function setCurrentId(id) { currentId = id; try { id ? localStorage.setItem(ID_KEY, id) : localStorage.removeItem(ID_KEY); } catch {} }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
const update = patch => { pr = { ...pr, ...patch }; persist(); renderSheet(); };

function renderRosterHint() {
    let n = 0;
    try { n = R.available(R.parseRoster(localStorage.getItem("calera-board-roster") || "") || []).length; } catch {}
    const b = $("useRoster");
    b.hidden = !n || n === pr.players;
    b.textContent = `Use my roster: ${n} here today`;
    b.onclick = () => { update({ players: Math.min(30, n) }); renderSetup(); };
}

function renderSetup() {
    renderRosterHint();
    $("title").value = pr.title; $("date").value = pr.date; $("start").value = pr.start;
    $("total").value = pr.total; $("players").value = pr.players;
    const g = $("game"); if (!g.options.length) P.GAME_OPTIONS.forEach(([v, l]) => g.add(new Option(l, v)));
    g.value = pr.gameInDays ? String(pr.gameInDays) : "";
    const eq = $("eq"); eq.replaceChildren();
    for (const [k, label] of P.EQUIPMENT) {
        const l = h("label"); const c = h("input"); c.type = "checkbox"; c.checked = pr.equipment.includes(k);
        c.onchange = () => update({ equipment: c.checked ? [...pr.equipment, k] : pr.equipment.filter(x => x !== k) });
        l.append(c, document.createTextNode(label)); eq.append(l);
    }
    const f = $("focus"); f.replaceChildren();
    for (const t of P.FOCUS_TOPICS) {
        const b = h("button", "tb-chip", t); b.type = "button"; b.setAttribute("aria-pressed", String(pr.focus.includes(t)));
        b.onclick = () => {
            if (!pr.focus.includes(t) && pr.focus.length >= 4) return toast("Pick up to 4");
            update({ focus: pr.focus.includes(t) ? pr.focus.filter(x => x !== t) : [...pr.focus, t] }); renderSetup();
        };
        f.append(b);
    }
    const sel = $("addSel"); sel.replaceChildren(new Option("Add a drill…", ""));
    for (const d of [...drills].sort((a, b) => a.topic.localeCompare(b.topic) || a.name.localeCompare(b.name))) sel.add(new Option(`${d.topic}: ${d.name} (${d.minutes} min)`, d.id));
}

function renderSheet() {
    const items = pr.items.filter(i => byId.has(i.drillId));
    $("sub").textContent = `${items.length} drills · ${P.planTotal(items)} min`;
    $("shTitle").textContent = pr.title || "Practice";
    const date = pr.date ? new Date(pr.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "";
    $("shMeta").textContent = [date, `${pr.players} players`, `${pr.total} min`, P.GAME_OPTIONS.find(o => o[0] === (pr.gameInDays ? String(pr.gameInDays) : ""))[1]].filter(Boolean).join(" · ");
    const eq = P.planEquipment(items, byId);
    $("shEq").textContent = eq.length ? "Bring: " + eq.join(", ") : "";
    $("empty").hidden = items.length > 0;
    $("notes").textContent = notes.join(" ");
    const times = P.startTimes(items, pr.start);
    const list = $("list"); list.replaceChildren();
    items.forEach((it, i) => {
        const d = byId.get(it.drillId);
        const li = h("li", "pr-item " + d.intensity);
        const top = h("div", "pr-top");
        top.append(h("span", "pr-time", times[i] || `#${i + 1}`), h("b", "", d.name), h("span", "pr-mins", `${it.minutes} min`));
        li.append(top, h("span", "dr-tag", `${d.topic} · ${d.intensity}${d.space ? " · " + d.space : ""}`));
        if (d.setup) li.append(h("p", "", d.setup));
        if (d.how) li.append(h("p", "", d.how));
        if (d.points.length) { const ul = h("ul"); d.points.slice(0, 3).forEach(x => ul.append(h("li", "", x))); li.append(ul); }
        if (d.easier.length) li.append(h("p", "dr-meta", "Easier: " + d.easier[0]));
        const ctl = h("div", "pr-ctl");
        const b = (label, aria, fn, dis) => { const x = h("button", "tb-btn", label); x.type = "button"; x.setAttribute("aria-label", aria); x.disabled = Boolean(dis); x.onclick = fn; ctl.append(x); };
        b("−5", "5 minutes less", () => update({ items: P.setMinutes(pr.items, i, it.minutes - 5) }), it.minutes <= 5);
        b("+5", "5 minutes more", () => update({ items: P.setMinutes(pr.items, i, it.minutes + 5) }));
        b("↑", "Move up", () => update({ items: P.moveItem(pr.items, i, -1) }), i === 0);
        b("↓", "Move down", () => update({ items: P.moveItem(pr.items, i, 1) }), i === items.length - 1);
        b("Remove", "Remove drill", () => update({ items: P.removeItem(pr.items, i) }));
        li.append(ctl); list.append(li);
    });
    const sum = P.planTotal(items);
    const t = $("totalLine");
    t.textContent = items.length ? `Planned ${sum} min of ${pr.total}${sum === pr.total ? "" : sum > pr.total ? ` (${sum - pr.total} over)` : ` (${pr.total - sum} free)`}` : "";
    t.classList.toggle("off", items.length > 0 && sum > pr.total);
}

function build(variantStep) {
    const variant = variantStep ? pr.variant + 1 : pr.variant;
    const r = P.suggestPlan({ drills, total: pr.total, players: pr.players, equipment: pr.equipment, focus: pr.focus, gameInDays: pr.gameInDays, variant });
    notes = r.notes;
    update({ items: r.items, variant });
    if (!r.items.length) toast("No drills fit. Check players and equipment.");
}

function renderMine() {
    const list = readList(), box = $("mineList"); box.replaceChildren();
    $("mineEmpty").hidden = list.length > 0;
    $("saveBtn").textContent = currentId && list.some(p => p.id === currentId) ? `Update "${list.find(p => p.id === currentId).name}"` : "Save this practice";
    for (const it of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
        const li = h("li", "tb-item" + (it.id === currentId ? " cur" : ""));
        li.append(h("b", "", it.name), h("small", "", `${it.practice.items.length} drills · ${it.practice.total} min${it.practice.date ? " · " + it.practice.date : ""}`));
        const row = h("div", "tb-row");
        const b = (label, fn) => { const x = h("button", "tb-btn", label); x.type = "button"; x.onclick = () => fn(x); row.append(x); };
        b("Open", () => { pr = it.practice; notes = []; setCurrentId(it.id); persist(); renderSetup(); renderSheet(); $("mineDlg").close(); toast("Opened " + it.name); });
        b("Copy", () => { const r = P.savePractice(readList(), { ...it.practice, title: (it.name + " copy").slice(0, 60) }, null); if (writeList(r.list)) { renderMine(); toast("Copy saved"); } });
        b("Delete", x => {
            if (x.dataset.arm !== "1") { x.dataset.arm = "1"; x.textContent = "Tap to confirm"; setTimeout(() => { x.dataset.arm = ""; x.textContent = "Delete"; }, 3000); return; }
            if (writeList(P.deletePractice(readList(), it.id))) { if (currentId === it.id) setCurrentId(null); renderMine(); toast("Deleted"); }
        });
        li.append(row); box.append(li);
    }
}

function wire() {
    $("title").onchange = e => update({ title: e.target.value.trim() || "Practice" });
    $("date").onchange = e => update({ date: e.target.value });
    $("start").onchange = e => update({ start: e.target.value });
    $("total").onchange = e => { update({ total: Math.min(180, Math.max(20, Math.round(Number(e.target.value)) || 75)) }); renderSetup(); };
    $("players").onchange = e => { update({ players: Math.min(30, Math.max(1, Math.round(Number(e.target.value)) || 18)) }); renderSetup(); };
    $("game").onchange = e => update({ gameInDays: Number(e.target.value) || 0 });
    $("build").onclick = () => build(false);
    $("again").onclick = () => build(true);
    $("addBtn").onclick = () => { const d = byId.get($("addSel").value); if (d) { update({ items: P.addItem(pr.items, d) }); $("addSel").value = ""; } };
    $("print").onclick = () => window.print();
    $("mine").onclick = () => { renderMine(); $("mineDlg").showModal(); };
    $("mineClose").onclick = () => $("mineDlg").close();
    $("saveBtn").onclick = () => { const r = P.savePractice(readList(), pr, currentId); if (writeList(r.list)) { setCurrentId(r.id); renderMine(); toast("Saved"); } };
}

(async () => {
    if (!(await allowed())) { location.replace("../index.html"); return; }
    drills = loadDrills(); byId = new Map(drills.map(d => [d.id, d]));
    try { const c = P.parsePractice(JSON.parse(localStorage.getItem(CUR_KEY) || "null")); if (c) pr = c; const id = localStorage.getItem(ID_KEY); if (id && readList().some(p => p.id === id)) currentId = id; } catch {}
    $("gate").hidden = true; $("app").hidden = false;
    wire(); renderSetup(); renderSheet();
})();
