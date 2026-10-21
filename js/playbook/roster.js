import "./shell.js";
import * as R from "./rosterModel.js";
import { KEYS, migrateOldKeys, applyTheme } from "./store.js";

const KEY = KEYS.roster;
const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };


let roster = [], editing = null;
function read() { try { return R.parseRoster(localStorage.getItem(KEY) || "") || []; } catch { return []; } }
function write(list) { roster = list; try { localStorage.setItem(KEY, R.serializeRoster(list)); } catch { toast("Couldn't save on this device"); } render(); }
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }

function render() {
    const here = R.available(roster).length;
    $("count").textContent = roster.length ? `${here} here of ${roster.length}` : "";
    $("empty").hidden = roster.length > 0;
    if (!roster.length && !render.pasted) { render.pasted = true; $("paste").open = true; }
    const list = $("list"); list.replaceChildren();
    for (const p of roster) {
        const li = h("li", "ro-row" + (p.here ? "" : " away"));
        const lab = h("label", "ro-here"); lab.title = "Here today";
        const c = h("input"); c.type = "checkbox"; c.checked = p.here; c.setAttribute("aria-label", `${p.name} is here today`);
        c.onchange = () => write(R.setHere(roster, p.id, c.checked));
        lab.append(c);
        const main = h("div", "ro-main");
        main.append(h("b", "", p.name), h("small", "", [R.POSITION_LABELS[p.pos], p.note].filter(Boolean).join(" · ")));
        const edit = h("button", "pb-btn", "Edit"); edit.type = "button"; edit.onclick = () => openEditor(p.id);
        li.append(lab, h("span", "ro-num", p.num == null ? "–" : "#" + p.num), main, edit);
        list.append(li);
    }
}

function openEditor(id) {
    editing = id || null;
    const p = id ? roster.find(x => x.id === id) : null, f = $("form").elements;
    $("edTitle").textContent = p ? "Edit player" : "New player";
    const sel = f.pos; if (!sel.options.length) R.POSITIONS.forEach(x => sel.add(new Option(R.POSITION_LABELS[x], x)));
    f.name.value = p ? p.name : ""; f.num.value = p && p.num != null ? p.num : ""; f.pos.value = p ? p.pos : "Any"; f.note.value = p ? p.note : "";
    $("edDelete").hidden = !p;
    $("editor").showModal();
}

function addFrom(text) {
    const r = R.addBulk(roster, text);
    if (!r.added) return 0;
    write(r.list);
    toast(r.added === 1 ? `Added ${R.parseBulk(text)[0].name} (${roster.length} on the team)` : `Added ${r.added} players (${roster.length} on the team)`);
    return r.added;
}

function wire() {
    $("quick").onsubmit = e => {
        e.preventDefault();
        const box = $("qName");
        if (addFrom(box.value)) box.value = "";
        box.focus();
    };
    const pasteCount = () => { const n = R.parseBulk($("pasteText").value).length; $("pasteCount").textContent = n ? `${n} player${n === 1 ? "" : "s"} ready` : ""; };
    $("pasteText").oninput = pasteCount;
    $("pasteAdd").onclick = () => {
        if (!addFrom($("pasteText").value)) return toast("Nothing to add yet");
        $("pasteText").value = ""; pasteCount(); $("paste").open = false;
    };
    $("add").onclick = () => openEditor(null);
    $("edCancel").onclick = () => $("editor").close();
    $("edDelete").onclick = e => {
        const b = e.currentTarget;
        if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Tap to confirm"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "Delete"; }, 3000); return; }
        write(R.deletePlayer(roster, editing)); $("editor").close(); toast("Deleted");
    };
    $("form").onsubmit = e => {
        e.preventDefault();
        const f = $("form").elements;
        const r = R.savePlayer(roster, { id: editing || "", name: f.name.value, num: f.num.value === "" ? null : f.num.value, pos: f.pos.value, note: f.note.value, here: editing ? roster.find(x => x.id === editing).here : true });
        if (!r.id) return toast("Add a name");
        write(r.list); $("editor").close(); toast("Saved");
    };
    $("more").onclick = () => $("moreDlg").showModal();
    $("mClose").onclick = () => $("moreDlg").close();
    $("bulkAdd").onclick = () => { const r = R.addBulk(roster, $("bulk").value); if (!r.added) return toast("Nothing to add"); $("bulk").value = ""; write(r.list); $("moreDlg").close(); toast(`Added ${r.added}`); };
    $("allHere").onclick = () => { write(roster.map(p => ({ ...p, here: true }))); $("moreDlg").close(); };
    $("noneHere").onclick = () => { write(roster.map(p => ({ ...p, here: false }))); $("moreDlg").close(); };
    $("backup").onclick = () => {
        if (!roster.length) return toast("Nothing to back up");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([R.serializeRoster(roster)], { type: "application/json" })); a.download = "southbound-playbook-roster.json";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        $("moreDlg").close(); toast("Backup saved");
    };
    $("restore").onchange = async e => {
        const file = e.target.files[0]; e.target.value = "";
        if (!file) return;
        const inc = R.parseRoster(await file.text());
        $("moreDlg").close();
        if (!inc) return toast("That isn't a roster file");
        write(inc); toast(`Restored ${inc.length} players`);
    };
}

(() => {
    migrateOldKeys(); applyTheme();
    roster = read();
    wire(); render();
})();
