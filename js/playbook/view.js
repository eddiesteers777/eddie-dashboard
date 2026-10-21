// Read-only page for a shared board or practice plan (the plan lives in the link, never on a server).
import { applyTheme, KEYS, migrateOldKeys } from "./store.js";
import { slotPositions } from "./gameModel.js";
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

const POS = slotPositions;
function showGame(g) {
    const when = g.date ? new Date(g.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
    document.title = `Game day | Southbound Playbook`;
    $("vTitle").textContent = g.opp ? `Game day vs ${g.opp}` : "Game day";
    $("vMeta").textContent = [when, g.formation, `${g.periods === 4 ? "4 quarters" : "2 halves"} of ${g.minutes} min`].filter(Boolean).join(" · ");
    $("vCopy").hidden = true;
    const body = $("vBody");
    const pos = POS(g.formation);
    const t = h("table", "vw-table"), head = h("tr");
    head.append(h("th", "", "Pos"));
    for (let i = 0; i < g.periods; i++) head.append(h("th", "", g.periods === 4 ? "Q" + (i + 1) : i === 0 ? "1st half" : "2nd half"));
    t.append(head);
    pos.forEach((ps, s) => { const tr = h("tr"); tr.append(h("td", "", ps)); for (let p = 0; p < g.periods; p++) tr.append(h("td", "", g.lineups[p][s])); t.append(tr); });
    const bt = h("tr"); bt.append(h("td", "", "Bench")); for (let p = 0; p < g.periods; p++) bt.append(h("td", "", g.bench[p].join(", "))); t.append(bt);
    const wrap = h("div", "vw-scroll"); wrap.append(t); body.append(wrap);
    if (g.captain) body.append(h("p", "vw-line", "Captain: " + g.captain));
    if (g.duty.length) {
        body.append(h("h2", "vw-h", "Duty today"));
        const ul = h("ul", "vw-duty");
        for (const d of g.duty) { const li = h("li"); li.append(h("b", "", d.job + ": "), document.createTextNode(d.names.join(", "))); ul.append(li); }
        body.append(ul);
    }
}

(async () => {
    const token = location.hash.replace(/^#/, "");
    const shared = token ? parsePayload(await decodePayload(token)) : null;
    if (!shared) { $("vBad").hidden = false; $("vTitle").textContent = "Link not found"; return; }
    $("vActions").hidden = false;
    $("vPrint").onclick = () => window.print();
    shared.kind === "board" ? showBoard(shared.board) : shared.kind === "game" ? showGame(shared.game) : showPractice(shared);
})();
