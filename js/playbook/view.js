// Read-only page for a shared board or practice plan (the plan lives in the link, never on a server).
import { applyTheme, KEYS, migrateOldKeys } from "./store.js";
import { slotPositions } from "./gameModel.js";
import { gameInfo, gameIcs, mapsUrl } from "./gameInfoModel.js";
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
const PART_ORDER = ["GK", "DEF", "MID", "FWD"];
// One card per half or quarter: names grouped by position, then the bench.
function periodCard(g, p) {
    const card = h("section", "vw-card");
    card.append(h("h2", "vw-h2", g.periods === 4 ? "Q" + (p + 1) : p === 0 ? "1st half" : "2nd half"));
    const by = new Map(PART_ORDER.map(k => [k, []]));
    POS(g.formation).forEach((ps, s) => { const n = g.lineups[p][s]; if (n && by.has(ps)) by.get(ps).push(n); });
    const grid = h("div", "vw-pl");
    for (const [k, names] of by) if (names.length) grid.append(h("span", "vw-pos", k), h("span", "", names.join(", ")));
    card.append(grid);
    if (g.bench[p].length) card.append(h("p", "vw-bench", "Bench: " + g.bench[p].join(", ")));
    return card;
}
function infoCard(g) {
    const info = gameInfo(g), card = h("section", "vw-card vw-info");
    const when = g.date ? new Date(g.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
    card.append(h("div", "vw-k", when || "Game day"));
    if (!info.hasAny) {
        card.append(h("h2", "vw-h2", "Time and field not set yet"), h("p", "vw-muted", "Ask your coach for kickoff and arrival time. The lineup is under the Lineup switch."));
        return card;
    }
    if (info.time) card.append(h("div", "vw-kick", info.time));
    const rows = h("div", "vw-rows");
    const row = (a, b) => { const r = h("div", "vw-row"); r.append(h("b", "", a)); if (b) r.append(h("small", "", b)); rows.append(r); };
    if (info.arrive) row(`Arrive by ${info.arrive}`);
    if (info.where) row(info.where);
    card.append(rows);
    const acts = h("div", "vw-acts");
    const ics = gameIcs(g);
    if (ics) {
        const b = h("button", "pb-btn pb-primary", "Add to calendar"); b.type = "button";
        b.onclick = () => {
            const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
            const a = h("a"); a.href = url; a.download = "game-day.ics"; document.body.append(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        };
        acts.append(b);
    }
    if (g.place) { const a = h("a", "pb-btn", "Directions"); a.href = mapsUrl(g.place); a.target = "_blank"; a.rel = "noopener"; acts.append(a); }
    if (acts.childElementCount) card.append(acts);
    return card;
}
function showGame(g) {
    document.title = `Game day | Southbound Playbook`;
    $("vTitle").textContent = g.opp ? `Game day vs ${g.opp}` : "Game day";
    $("vMeta").textContent = [g.formation, `${g.periods === 4 ? "4 quarters" : "2 halves"} of ${g.minutes} min`].join(" \u00b7 ");
    $("vCopy").hidden = true;
    const body = $("vBody");
    const seg = h("div", "vw-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Show");
    const bInfo = h("button", "", "Game info"), bLine = h("button", "", "Lineup"); bInfo.type = bLine.type = "button";
    seg.append(bInfo, bLine);
    const info = h("div", "vw-panel"), line = h("div", "vw-panel");
    info.append(infoCard(g));
    const first = g.lineups[0].filter(Boolean);
    if (first.length) { const c = h("section", "vw-card"); c.append(h("div", "vw-k", "Who plays first"), h("p", "vw-first", first.join(", "))); info.append(c); }
    if (g.captain || g.duty.length) {
        const c = h("section", "vw-card");
        if (g.captain) c.append(h("div", "vw-k", "Captain"), h("p", "vw-first", g.captain));
        if (g.duty.length) { c.append(h("div", "vw-k", "Duty today")); for (const d of g.duty) { const p = h("p", "vw-first"); p.append(h("b", "", d.job + ": "), document.createTextNode(d.names.join(", "))); c.append(p); } }
        info.append(c);
    }
    for (let p = 0; p < g.periods; p++) line.append(periodCard(g, p));
    const pick = which => { bInfo.setAttribute("aria-pressed", String(which === 0)); bLine.setAttribute("aria-pressed", String(which === 1)); info.hidden = which !== 0; line.hidden = which !== 1; };
    bInfo.onclick = () => pick(0); bLine.onclick = () => pick(1); pick(0);
    body.append(seg, info, line);
}

(async () => {
    const token = location.hash.replace(/^#/, "");
    const shared = token ? parsePayload(await decodePayload(token)) : null;
    if (!shared) { $("vBad").hidden = false; $("vTitle").textContent = "Link not found"; return; }
    $("vActions").hidden = false;
    $("vPrint").onclick = () => window.print();
    shared.kind === "board" ? showBoard(shared.board) : shared.kind === "game" ? showGame(shared.game) : showPractice(shared);
})();
