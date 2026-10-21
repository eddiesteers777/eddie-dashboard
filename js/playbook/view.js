// Read-only page for a shared board or practice plan (the plan lives in the link, never on a server).
import { applyTheme, KEYS, migrateOldKeys } from "./store.js";
import { decodePayload, parsePayload, importPractice } from "./shareModel.js";
import { boardThumb } from "./boardThumb.js";
import * as L from "./boardLibrary.js";
import * as D from "./drillModel.js";
import * as P from "./practiceModel.js";
import { SEED_DRILLS } from "./drillSeed.js";

migrateOldKeys();
applyTheme();
const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400); }
const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { toast("Couldn't save on this device"); return false; } };

function showBoard(board) {
    document.title = `${board.title} | Southbound Playbook`;
    $("vTitle").textContent = board.title;
    $("vMeta").textContent = [board.scenario, board.homeFormation + (board.showAway ? " vs " + board.awayFormation : "")].join(" · ");
    const wrap = h("div", "vw-board");
    wrap.append(boardThumb(board));
    $("vBody").append(wrap);
    $("vCopy").onclick = () => {
        const r = L.saveBoard(L.loadLibrary(get(KEYS.library)), board, null);
        if (set(KEYS.library, L.serializeLibrary(r.lib))) { set(KEYS.boardId, r.id); location.href = "playbook-board.html?board=" + encodeURIComponent(r.id); }
    };
}

function showPractice(shared) {
    const { practice, drills } = shared;
    const byId = new Map(drills.map(d => [d.id, d]));
    const items = practice.items.filter(i => byId.has(i.drillId));
    document.title = `${practice.title} | Southbound Playbook`;
    $("vTitle").textContent = practice.title;
    const date = practice.date ? new Date(practice.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "";
    $("vMeta").textContent = [date, `${practice.players} players`, `${P.planTotal(items)} min`].filter(Boolean).join(" · ");
    const body = $("vBody");
    const eq = P.planEquipment(items, byId);
    if (eq.length) body.append(h("p", "pr-needs", "Bring: " + eq.join(", ")));
    const times = P.startTimes(items, practice.start);
    const list = h("ol", "pr-list vw-list");
    items.forEach((it, i) => {
        const d = byId.get(it.drillId);
        const li = h("li", "pr-item " + d.intensity);
        const top = h("div", "pr-top");
        top.append(h("span", "pr-time", times[i] || `#${i + 1}`), h("b", "", d.name), h("span", "pr-mins", `${it.minutes} min`));
        li.append(top, h("span", "dr-tag", `${d.topic} · ${d.intensity}${d.space ? " · " + d.space : ""}`));
        if (d.setup) li.append(h("p", "", d.setup));
        if (d.how) li.append(h("p", "", d.how));
        if (d.points.length) { const ul = h("ul"); d.points.slice(0, 4).forEach(x => ul.append(h("li", "", x))); li.append(ul); }
        list.append(li);
    });
    body.append(list);
    $("vCopy").onclick = () => {
        let mine = null;
        try { mine = D.parseDrills(get(KEYS.drills) || ""); } catch {}
        const r = importPractice(mine || D.mergeSeeds([], SEED_DRILLS), P.parsePracticeList(get(KEYS.practices) || ""), shared);
        if (set(KEYS.drills, D.serializeDrills(r.drills)) && set(KEYS.practices, P.serializePracticeList(r.practices))) {
            set(KEYS.practice, JSON.stringify(r.practice)); set(KEYS.practiceId, r.practiceId);
            location.href = "playbook-practice.html";
        }
    };
}

(async () => {
    const token = location.hash.replace(/^#/, "");
    const shared = token ? parsePayload(await decodePayload(token)) : null;
    if (!shared) { $("vBad").hidden = false; $("vTitle").textContent = "Link not found"; return; }
    $("vActions").hidden = false;
    $("vPrint").onclick = () => window.print();
    shared.kind === "board" ? showBoard(shared.board) : showPractice(shared);
})();
