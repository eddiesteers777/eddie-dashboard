// Game day: the live clock for one game. The model is liveModel.js; the lineup comes from the game plan (gameModel.js).
import "./shell.js";
import * as G from "./gameModel.js";
import * as L from "./liveModel.js";
import * as T from "./teamModel.js";
import * as R from "./rosterModel.js";
import * as S from "./seasonModel.js";
import { clock } from "./runModel.js";
import { sbConfirm } from "../ui.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const readTeam = () => { try { return T.loadTeam(localStorage.getItem(KEYS.team)); } catch { return T.emptyTeam(); } };
const readRoster = () => { try { return R.parseRoster(localStorage.getItem(KEYS.roster) || "") || []; } catch { return []; } };
const team = readTeam(), roster = readRoster();
const nameOf = rid => roster.find(p => p.id === rid)?.name || "";
const numOf = rid => roster.find(p => p.id === rid)?.num;
const label = rid => (nameOf(rid) ? nameOf(rid) : "?");

// Which game: ?date=, else a game today, else the next game on the schedule.
const today = T.todayKey();
let date = new URLSearchParams(location.search).get("date");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) date = T.findSession(team, today, "game") ? today : (S.nextGame(team, today)?.session.date || today);
const session = T.findSession(team, date, "game");
const game = session?.game && session.game.lineups.flat().some(Boolean) ? session.game : null;

let live = null, lock = null, buzzed = -1, tick = 0;
const save = () => { try { live ? localStorage.setItem(KEYS.live, L.serializeLive(live)) : localStorage.removeItem(KEYS.live); } catch { /* clock still runs this visit */ } };
const apply = next => { live = next; save(); render(); };
const now = () => Date.now();

async function keepAwake(on) {
    try {
        if (on && !lock && "wakeLock" in navigator) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
        if (!on && lock) { await lock.release(); lock = null; }
    } catch { /* not allowed: the clock still works */ }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && live?.status === "running") keepAwake(true); });

function show(empty) {
    $("lvEmpty").hidden = !empty; $("lvBody").hidden = empty;
}

function render() {
    if (!game) {
        show(true);
        $("sub").textContent = "";
        $("lvEmptyH").textContent = roster.length ? "No lineup for this game yet" : "Add your players first";
        $("lvEmptyP").textContent = roster.length ? "Pick who plays each half or quarter on Lineup, then come back. The clock and the changes start from it." : "The clock needs a roster and a lineup. Add first names, then set the lineup.";
        const go = $("lvEmptyGo"); go.textContent = roster.length ? "Set a lineup" : "Add players"; go.href = roster.length ? `playbook-game.html?date=${date}` : "playbook-roster.html";
        document.body.classList.remove("pb-live-on");
        return;
    }
    show(false);
    const opp = game.opp || session.opp || "";
    $("sub").textContent = opp ? `vs ${opp}` : "";
    $("lvThemName").textContent = opp || "Them";
    $("lvEdit").href = `playbook-game.html?date=${date}`;
    const over = L.isOver(live, now()), fin = L.isFinal(live);
    document.body.classList.toggle("pb-live-on", live.status === "running" || live.status === "paused" || over);
    $("lvPeriod").textContent = fin ? "Full time" : G.periodName(game, live.period);
    $("lvState").textContent = fin ? "" : over ? "Period over" : live.status === "running" ? "Live" : live.status === "paused" ? "Paused" : "Ready";
    $("lvState").dataset.s = over ? "over" : live.status;
    $("lvUs").textContent = live.us; $("lvThem").textContent = live.them;
    const main = $("lvMain"), minute = $("lvMinute");
    minute.hidden = fin;
    const last = live.period + 1 >= game.periods;
    main.textContent = fin ? "New game clock" : over ? (last ? "Full time" : `Start ${G.periodName(game, live.period + 1)}`) : live.status === "ready" ? "Start" : live.status === "running" ? "Pause" : "Resume";
    $("lvTime").textContent = fin ? "–" : clock(L.remaining(live, now()));

    // The changes: before the break (next period) or, in a ready period, what was made going in.
    const into = over || (live.status === "running" && L.remaining(live, now()) <= 120000) ? live.period + 1 : live.status === "ready" && live.period > 0 ? live.period : -1;
    const ch = into > 0 && into < game.periods ? L.changeInto(game, into) : null;
    $("lvChange").hidden = !ch;
    $("lvChange").classList.toggle("due", over);
    if (ch) {
        $("lvChangeK").textContent = over ? `Make these changes now · ${G.periodName(game, into)}` : live.status === "ready" ? `Changes made for the ${G.periodName(game, into).toLowerCase()}` : `Changes at the break · ${G.periodName(game, into)}`;
        $("lvOff").textContent = ch.off.map(label).join(", ") || "no one";
        $("lvOn").textContent = ch.on.map(label).join(", ") || "no one";
    }

    // Who is on the field this period, in formation order.
    const pos = G.slotPositions(game.formation), row = game.lineups[Math.min(live.period, game.periods - 1)] || [];
    const field = $("lvField"); field.replaceChildren();
    const offIds = ch && over ? new Set(ch.off) : new Set();
    row.forEach((rid, i) => {
        if (!rid) return;
        const t = h("div", "lv-p" + (offIds.has(rid) ? " off" : ""));
        t.append(h("span", "lv-pos", pos[i]), h("b", "", String(numOf(rid) ?? "")), h("span", "lv-pn", label(rid)));
        field.append(t);
    });
    const bench = G.benchFor(game, Math.min(live.period, game.periods - 1)).map(label);
    $("lvBench").textContent = bench.length ? `Bench: ${bench.join(", ")}` : "Nobody on the bench.";
}

// The clock text and the buzz at zero update every second without redrawing the page.
function frame() {
    if (!live || !game) return;
    const left = L.remaining(live, now());
    if (live.status === "running") {
        $("lvTime").textContent = clock(left);
        if (left <= 0 && buzzed !== live.period) { buzzed = live.period; try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([400, 150, 400]); } catch {} render(); }
        else if (left <= 120000 && !$("lvChange").classList.contains("due")) render();
    }
}

function wire() {
    $("lvMain").onclick = () => {
        if (L.isFinal(live)) return apply(L.newLive(game, date));
        if (L.isOver(live, now())) { const next = L.nextPeriod(live, game); buzzed = -1; keepAwake(false); return apply(L.isFinal(next) ? next : L.start(next, now())); }
        if (live.status === "ready") { keepAwake(true); return apply(L.start(live, now())); }
        if (live.status === "running") { keepAwake(false); return apply(L.pause(live, now())); }
        keepAwake(true); apply(L.resume(live, now()));
    };
    $("lvMinute").onclick = () => apply(L.addMinute(live, now(), 1));
    $("usUp").onclick = () => apply(L.goal(live, "us", 1)); $("usDn").onclick = () => apply(L.goal(live, "us", -1));
    $("themUp").onclick = () => apply(L.goal(live, "them", 1)); $("themDn").onclick = () => apply(L.goal(live, "them", -1));
    $("lvReset").onclick = async () => {
        if (!(await sbConfirm("The clock goes back to the start of the game and the score to 0 to 0.", { title: "Reset the clock?", confirmLabel: "Reset", danger: true }))) return;
        buzzed = -1; keepAwake(false); apply(L.newLive(game, date));
    };
}

if (game) {
    let saved = null;
    try { saved = L.parseLive(localStorage.getItem(KEYS.live) || ""); } catch { /* none */ }
    live = L.fits(saved, date, game) ? saved : L.newLive(game, date);
    if (live.status === "running") keepAwake(true);
    wire();
    tick = setInterval(frame, 500);
}
render();
