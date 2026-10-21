import "./shell.js";
import * as G from "./gameModel.js";
import * as T from "./teamModel.js";
import * as R from "./rosterModel.js";
import * as S from "./sampleModel.js";
import * as Art from "./pitchArt.js";
import { formationSlots, FORMATIONS } from "./boardModel.js";
import { gamePayload, encodePayload } from "./shareModel.js";
import { shareLink } from "./shareUi.js";
import { sbConfirm } from "../ui.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const readTeam = () => { try { return T.loadTeam(localStorage.getItem(KEYS.team)); } catch { return T.emptyTeam(); } };
const readRoster = () => { try { return R.parseRoster(localStorage.getItem(KEYS.roster) || "") || []; } catch { return []; } };

let team = readTeam(), roster = readRoster();
let date = T.todayKey(), period = 0;
const nameOf = rid => roster.find(p => p.id === rid)?.name || "";
const numOf = rid => roster.find(p => p.id === rid)?.num;

function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
const session = () => T.findSession(team, date, "game");

// The saved plan, or a fresh one whose squad is who is here (from attendance marks if any, else the roster's "here today").
function game() {
    const s = session();
    if (s?.game) return s.game;
    const marks = s?.marks || {};
    const squad = roster.filter(p => (Object.keys(marks).length ? marks[p.id] === "here" || marks[p.id] === "late" : p.here)).map(p => p.id);
    return G.setSquad(G.newGame(), squad);
}
function save(next) {
    const o = T.openSession(team, date, "game");
    team = T.setGame(o.team, o.id, next);
    try { localStorage.setItem(KEYS.team, T.serializeTeam(team)); } catch { toast("Couldn't save on this device"); }
    render();
}

function pitch(g) {
    const NS = "http://www.w3.org/2000/svg", W = 68, H = 105;
    const e = (n, a = {}, p) => { const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, a[k]); if (p) p.appendChild(x); return x; };
    const svg = e("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Lineup, ${G.periodName(g, period)}` });
    svg.style.cssText = `width:100%;height:auto;aspect-ratio:${W}/${H};border-radius:10px;display:block`;
    const uid = "g" + Math.random().toString(36).slice(2, 7);
    Art.addDefs(e, svg, uid); Art.drawPitch(e, svg, uid, { strokeW: .5 });
    const row = g.lineups[period] || [];
    formationSlots(g.formation).forEach((s, i) => {
        const rid = row[i], gr = e("g", { transform: `translate(${s.x * W} ${(0.1 + (s.y - 0.55) * 2.05) * H})` }, svg);
        if (!rid) { e("circle", { r: 2.7, fill: "rgba(0,0,0,.25)", stroke: "rgba(255,255,255,.55)", "stroke-width": .4, "stroke-dasharray": "1 .8" }, gr); return; }
        Art.drawPlayer(e, gr, { home: true, num: numOf(rid) ?? i + 1, id: uid, r: Art.PLAYER_R, numFs: Art.NUM_FS });
        const t = e("text", { y: Art.PLAYER_R + 2.6, "text-anchor": "middle", fill: "#fff", stroke: "rgba(0,0,0,.6)", "stroke-width": .55, "paint-order": "stroke", "font-size": Art.NAME_FS, "font-weight": 700, "font-family": "Albert Sans,sans-serif" }, gr);
        t.textContent = nameOf(rid);
    });
    return svg;
}

function render() {
    const has = roster.length > 0;
    $("noRoster").hidden = has; $("body").hidden = !has;
    $("print").hidden = $("auto").hidden = $("share").hidden = !has;
    if (!has) { $("sub").textContent = ""; return; }
    const g = game();
    if (period >= g.periods) period = 0;
    $("sub").textContent = g.opp ? `vs ${g.opp}` : "";
    $("date").value = date; if (document.activeElement !== $("opp")) $("opp").value = g.opp;
    $("formation").value = g.formation; $("periods").value = String(g.periods);
    if (document.activeElement !== $("mins")) $("mins").value = g.minutes;
    $("squadCount").textContent = `${g.squad.length} of ${roster.length}`;

    const squad = $("squad"); squad.replaceChildren();
    for (const p of roster) {
        const on = g.squad.includes(p.id);
        const b = h("button", "gm-chip" + (on ? " on" : ""), p.name); b.type = "button"; b.setAttribute("aria-pressed", String(on));
        b.onclick = () => save(G.toggleSquad(g, p.id));
        squad.append(b);
    }

    const tabs = $("periodTabs"); tabs.replaceChildren();
    for (let i = 0; i < g.periods; i++) {
        const b = h("button", "gm-ptab", G.periodName(g, i)); b.type = "button"; b.setAttribute("aria-pressed", String(i === period));
        b.onclick = () => { period = i; render(); };
        tabs.append(b);
    }
    $("pitch").replaceChildren(pitch(g));

    const pos = G.slotPositions(g.formation), row = g.lineups[period] || [], slots = $("slots"); slots.replaceChildren();
    pos.forEach((ps, i) => {
        const li = h("li", "gm-slot"), sel = h("select"); sel.setAttribute("aria-label", `${ps} slot ${i + 1}`);
        sel.add(new Option("Empty", ""));
        for (const r of g.squad) sel.add(new Option(nameOf(r) + (row.includes(r) && row[i] !== r ? " (swap)" : ""), r));
        sel.value = row[i] || "";
        sel.onchange = () => save(G.setSlot(g, period, i, sel.value));
        li.append(h("span", "gm-pos", ps), sel); slots.append(li);
    });
    const bench = G.benchFor(g, period).map(nameOf);
    $("benchLine").textContent = g.squad.length ? (bench.length ? `On the bench: ${bench.join(", ")}` : "Nobody on the bench") : "Pick your squad above.";

    const ch = $("changes"); ch.replaceChildren();
    const list = G.changes(g).filter(c => c.on.length || c.off.length);
    for (const c of list) {
        const li = h("li", "gm-change");
        li.append(h("b", "", G.periodName(g, c.period)), h("span", "", `Off: ${c.off.map(nameOf).join(", ") || "no one"}`), h("span", "", `On: ${c.on.map(nameOf).join(", ") || "no one"}`));
        ch.append(li);
    }
    if (!list.length) ch.append(h("li", "pb-hint", g.lineups.flat().some(Boolean) ? "No changes between periods." : "Tap Fair lineup and the changes show up here."));

    const m = G.minutes(g), full = g.minutes * g.periods, mins = $("mins2"); mins.replaceChildren();
    for (const r of [...g.squad].sort((a, b) => m[b] - m[a] || nameOf(a).localeCompare(nameOf(b)))) {
        const li = h("li", "gm-min");
        const bar = h("i"); bar.style.width = (full ? (m[r] / full) * 100 : 0) + "%";
        li.append(h("span", "gm-min-n", nameOf(r)), h("span", "gm-bar").appendChild(bar).parentNode, h("span", "gm-min-v", m[r] + " min"));
        mins.append(li);
    }
    const sp = G.spread(g);
    $("spread").textContent = g.squad.length && g.lineups.flat().some(Boolean) ? (sp.max - sp.min <= g.minutes ? "Fair: within one period" : `Most ${sp.max} · least ${sp.min}`) : "";
    printCard(g);
}

function printCard(g) {
    const box = $("card"); box.replaceChildren();
    box.append(h("h2", "", `Lineup card · ${new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric" })}${g.opp ? " · vs " + g.opp : ""}`));
    box.append(h("p", "gm-card-sub", `${g.formation} · ${g.periods === 4 ? "4 quarters" : "2 halves"} of ${g.minutes} min`));
    const t = h("table"), head = h("tr"); head.append(h("th", "", "Pos"));
    for (let i = 0; i < g.periods; i++) head.append(h("th", "", G.periodName(g, i)));
    t.append(head);
    const pos = G.slotPositions(g.formation);
    pos.forEach((ps, s) => {
        const tr = h("tr"); tr.append(h("td", "", ps));
        for (let p = 0; p < g.periods; p++) { const r = g.lineups[p]?.[s]; tr.append(h("td", "", r ? `${numOf(r) != null ? "#" + numOf(r) + " " : ""}${nameOf(r)}` : "")); }
        t.append(tr);
    });
    const bt = h("tr"); bt.append(h("td", "", "Bench"));
    for (let p = 0; p < g.periods; p++) bt.append(h("td", "", G.benchFor(g, p).map(nameOf).join(", ")));
    t.append(bt); box.append(t);
    const m = G.minutes(g);
    box.append(h("p", "gm-card-min", "Minutes: " + g.squad.map(r => `${nameOf(r)} ${m[r]}`).join(" · ")));
}

function wire() {
    $("date").onchange = e => { if (e.target.value) { date = e.target.value; period = 0; render(); } };
    $("opp").oninput = e => save(G.setOpponent(game(), e.target.value));
    $("formation").onchange = e => save(G.setFormation(game(), e.target.value));
    $("periods").onchange = e => save(G.setPeriods(game(), Number(e.target.value)));
    $("mins").onchange = e => save(G.setMinutes(game(), e.target.value));
    $("auto").onclick = () => {
        const g = game();
        if (!g.squad.length) return toast("Pick who's playing first");
        save(G.autoPlan(g, roster)); toast("Lineup filled. Everyone gets a fair share of minutes.");
    };
    $("print").onclick = () => window.print();
    $("share").onclick = async () => {
        const g = game();
        if (!g.lineups.flat().some(Boolean)) return toast("Fill the lineup first");
        const ok = await sbConfirm("This link shows your players' first names and today's lineup. It has no attendance, make-up runs or contact info. Anyone with the link can see it, so send it only to your team's parents and players.", { title: "Share with your team?", confirmLabel: "Get link" });
        if (!ok) return;
        const s = session();
        await shareLink(await encodePayload(gamePayload(date, g, roster, team, s)), { title: g.opp ? `Game day vs ${g.opp}` : "Game day", text: "Lineup and duty for our next game", copied: "Link copied. Send it to your team." }, toast);
    };
    $("sampleLoad").onclick = () => {
        const r = S.loadSample(roster, team);
        if (!r) return;
        try { localStorage.setItem(KEYS.roster, R.serializeRoster(r.roster)); roster = r.roster; localStorage.setItem(KEYS.team, T.serializeTeam(r.team)); team = r.team; } catch {}
        render(); toast("Sample team added. Remove it from the Roster tab.");
    };
}
const sel = $("formation"); FORMATIONS.forEach(f => sel.add(new Option(f, f)));
wire(); render();
