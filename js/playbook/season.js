// Season: games and practices on one week view. Data and rules live in seasonModel.js / teamModel.js.
import "./shell.js";
import * as T from "./teamModel.js";
import * as S from "./seasonModel.js";
import * as P from "./practiceModel.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const readTeam = () => { try { return T.loadTeam(localStorage.getItem(KEYS.team)); } catch { return T.emptyTeam(); } };
const plans = () => { try { return P.parsePracticeList(localStorage.getItem(KEYS.practices) || ""); } catch { return []; } };
const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };
const fmtDate = (d, o) => new Date(d + "T12:00:00").toLocaleDateString(undefined, o);
const fmtTime = t => { if (!t) return ""; const [hh, mm] = t.split(":").map(Number); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`; };
const SITE = { home: "Home", away: "Away", neutral: "Neutral" };

let team = readTeam(), today = T.todayKey(), selected = today, editing = null, kind = "game", site = "", planFor = null;

function save(next) {
    team = next;
    try { localStorage.setItem(KEYS.team, T.serializeTeam(team)); } catch { toast("Couldn't save on this device"); }
    render();
}
const scheduled = () => team.sessions.some(s => s.date >= today && s.kind !== "other") || team.sessions.some(s => s.opp || s.time || s.planId);

function renderNext() {
    const box = $("ssNext"), n = S.nextGame(team, today);
    box.hidden = !n; if (!n) return;
    const s = n.session, count = S.practiceDaysBefore(team, s);
    box.replaceChildren();
    const big = h("div", "ss-big"); big.append(h("b", "", String(n.days)), h("small", "", n.days === 1 ? "DAY" : "DAYS"));
    const where = [SITE[s.site], s.place].filter(Boolean).join(" · "), arrive = s.arrive ? `Arrive ${fmtTime(s.arrive)}` : "";
    box.append(big, h("div", "ss-k", `Next game · ${fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" })}${s.time ? " · " + fmtTime(s.time) : ""}`),
        h("h2", "", S.opponent(s) ? "vs " + S.opponent(s) : "Game"), h("p", "", [where, arrive].filter(Boolean).join(" · ") || "Add kickoff and place with Edit"));
    const chips = h("div", "ss-chips");
    if (count) chips.append(h("span", "ss-chip", `Scheduled practice days before it: ${count.have} of ${count.need}`));
    chips.append(h("span", "ss-chip", s.game && s.game.lineups.some(r => r.some(Boolean)) ? "Lineup set" : "Lineup not set"));
    box.append(chips);
    box.onclick = e => { if (e.target.closest("a,button")) return; selected = s.date; render(); };
}

function renderStrip(monday) {
    const strip = $("ssStrip"); strip.replaceChildren();
    for (const d of S.weekDays(team, monday)) {
        const b = h("button", "ss-tile" + (d.date === selected ? " sel" : "") + (d.date === today ? " today" : "") + (d.items.some(S.isGame) ? " game" : "")); b.type = "button";
        b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(d.date === selected));
        const game = d.items.some(S.isGame), prac = d.items.some(i => i.kind === "practice");
        b.setAttribute("aria-label", `${fmtDate(d.date, { weekday: "long", month: "long", day: "numeric" })}${game ? ", game" : ""}${prac ? ", practice" : ""}`);
        b.append(h("small", "", fmtDate(d.date, { weekday: "narrow" })), h("b", "", String(Number(d.date.slice(8)))), h("em", "", game ? "GAME" : prac ? "•" : ""));
        b.onclick = () => { selected = d.date; render(); };
        strip.append(b);
    }
}

function itemCard(s) {
    const card = h("article", "ss-card" + (s.kind === "game" ? " game" : "")), isG = s.kind === "game";
    card.append(h("div", "ss-k", `${isG ? "Game" : "Practice"} · ${fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" })}`));
    card.append(h("h3", "", isG ? (S.opponent(s) ? "vs " + S.opponent(s) : "Game") : "Practice"));
    const dl = h("dl"); const row = (k, v) => { if (v) { dl.append(h("dt", "", k), h("dd", "", v)); } };
    row(isG ? "Kickoff" : "Start", fmtTime(s.time)); row("Where", [SITE[s.site], s.place].filter(Boolean).join(" · ")); row("Arrive", fmtTime(s.arrive));
    const cnt = isG ? S.practiceDaysBefore(team, s) : null; if (cnt) row("Before it", `${cnt.have} of ${cnt.need} scheduled practice days`);
    const plan = s.planId ? plans().find(p => p.id === s.planId) : null;
    if (!isG) row("Plan", plan ? `${plan.name} · ${plan.practice.total} min` : s.planId ? "That plan was deleted" : "No plan yet");
    if (isG) row("Lineup", s.game && s.game.lineups.some(r => r.some(Boolean)) ? "Set" : "Not set");
    card.append(dl);
    const btns = h("div", "ss-btns"); const b = (label, fn, cls = "") => { const x = h(fn.href ? "a" : "button", "pb-btn " + cls, label); if (fn.href) x.href = fn.href; else { x.type = "button"; x.onclick = fn; } btns.append(x); };
    if (isG) b("Set lineup", Object.assign(() => {}, { href: `playbook-game.html?date=${s.date}` }), "pb-primary");
    else if (plan) { b("Run it", Object.assign(() => {}, { href: `playbook-run.html?plan=${encodeURIComponent(plan.id)}` }), "pb-primary"); b("Change plan", () => openPlans(s)); }
    else b("Pick a plan", () => openPlans(s), "pb-primary");
    b("Edit", () => openEdit(s));
    card.append(btns);
    return card;
}

function renderDay() {
    const box = $("ssDay"); box.replaceChildren();
    const day = S.weekDays(team, S.weekStart(selected)).find(d => d.date === selected);
    if (!day.items.length) {
        const e = h("div", "ss-none"); e.append(h("p", "", `Nothing on ${fmtDate(selected, { weekday: "long", month: "short", day: "numeric" })}.`));
        const r = h("div", "ss-btns");
        for (const [label, k] of [["Add game", "game"], ["Add practice", "practice"]]) { const x = h("button", "pb-btn", label); x.type = "button"; x.onclick = () => openEdit(null, k); r.append(x); }
        e.append(r); box.append(e);
    } else day.items.forEach(s => box.append(itemCard(s)));
    const rest = S.weekDays(team, S.weekStart(selected)).filter(d => d.date !== selected && d.items.length);
    if (rest.length) {
        box.append(h("div", "ss-wk", "Rest of this week"));
        for (const d of rest) for (const s of d.items) {
            const r = h("button", "ss-row" + (s.kind === "game" ? " game" : "")); r.type = "button";
            const t = h("span", "ss-rt"); t.append(h("b", "", s.kind === "game" ? (S.opponent(s) ? "Game · vs " + S.opponent(s) : "Game") : "Practice"), h("span", "", [fmtTime(s.time), s.planId ? "Plan attached" : s.kind === "practice" ? "No plan yet" : ""].filter(Boolean).join(" · ")));
            r.append(h("i", "", fmtDate(d.date, { weekday: "short", day: "numeric" })), t);
            r.onclick = () => { selected = d.date; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
            box.append(r);
        }
    }
}

function render() {
    const has = scheduled();
    $("ssEmpty").hidden = has; $("ssBody").hidden = !has;
    const upcoming = team.sessions.filter(s => s.date >= today && s.kind !== "other");
    const ng = upcoming.filter(s => s.kind === "game").length, np = upcoming.filter(s => s.kind === "practice").length;
    $("ssSub").textContent = upcoming.length ? `${ng} ${ng === 1 ? "game" : "games"} · ${np} ${np === 1 ? "practice" : "practices"} ahead` : "";
    if (!has) return;
    const mon = S.weekStart(selected);
    $("ssRange").textContent = `${fmtDate(mon, { month: "short", day: "numeric" })} – ${fmtDate(S.addDays(mon, 6), { month: "short", day: "numeric" })}`;
    renderNext(); renderStrip(mon); renderDay();
}

// ---- add / edit ----
function setKind(k) {
    kind = k;
    $("ssKind").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    $("fOpp").hidden = k !== "game"; $("fArrive").hidden = k !== "game"; $("ssSite").hidden = k !== "game";
    $("lblTime").textContent = k === "game" ? "Kickoff" : "Start time";
}
function setSite(v) { site = v; $("ssSite").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.s === v))); }
function openEdit(s, k = "game") {
    editing = s ? s.id : null;
    $("ssDlgTitle").textContent = s ? "Edit" : "Add to the schedule";
    $("ssKind").hidden = Boolean(s); setKind(s ? s.kind : k);
    $("inOpp").value = s?.opp || s?.game?.opp || ""; $("inDate").value = s ? s.date : selected;
    $("inTime").value = s?.time || ""; $("inArrive").value = s?.arrive || ""; $("inPlace").value = s?.place || ""; setSite(s?.site || "");
    $("ssErr").hidden = true; $("ssDelete").hidden = !s; $("ssDelete").textContent = "Delete";
    $("ssDlg").showModal();
}
function saveEdit() {
    const date = $("inDate").value;
    if (!date) { $("ssErr").textContent = "Pick a date."; $("ssErr").hidden = false; return; }
    const r = S.saveItem(team, { id: editing, date, kind, opp: $("inOpp").value, time: $("inTime").value, arrive: $("inArrive").value, site, place: $("inPlace").value });
    if (r.error) { $("ssErr").textContent = r.error === "taken" ? `There is already a ${kind} on that date. Edit that one instead.` : "Couldn't save that."; $("ssErr").hidden = false; return; }
    selected = date; $("ssDlg").close(); save(r.team);
}
function openPlans(s) {
    planFor = s.id; const list = plans(), box = $("ssPlanList"); box.replaceChildren(); $("ssPlanEmpty").hidden = list.length > 0;
    if (s.planId) { const li = h("li", "pb-item"); const b = h("button", "pb-btn", "Remove the plan from this practice"); b.type = "button"; b.onclick = () => { $("ssPlanDlg").close(); save(S.setPlan(team, planFor, "")); }; li.append(b); box.append(li); }
    for (const it of [...list].sort((a, b) => b.updatedAt - a.updatedAt)) {
        const li = h("li", "pb-item" + (it.id === s.planId ? " cur" : "")); li.append(h("b", "", it.name), h("small", "", `${it.practice.items.length} drills · ${it.practice.total} min`));
        const b = h("button", "pb-btn pb-primary", "Use this"); b.type = "button"; b.onclick = () => { $("ssPlanDlg").close(); save(S.setPlan(team, planFor, it.id)); toast("Plan attached"); };
        li.append(b); box.append(li);
    }
    $("ssPlanDlg").showModal();
}
function openRepeat() {
    const box = $("rpDays"); box.replaceChildren();
    ["M", "T", "W", "T", "F", "S", "S"].forEach((l, i) => { const b = h("button", "", l); b.type = "button"; b.dataset.d = String(i + 1); b.setAttribute("aria-label", ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]); b.setAttribute("aria-pressed", String(i < 5)); b.onclick = () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); box.append(b); });
    $("rpFrom").value = selected; $("rpTo").value = S.addDays(selected, 27); $("rpErr").hidden = true; $("ssRepDlg").showModal();
}
function doRepeat() {
    const days = [...$("rpDays").querySelectorAll("[aria-pressed=true]")].map(b => Number(b.dataset.d));
    const r = S.repeatPractices(team, $("rpFrom").value, $("rpTo").value, days, { time: $("rpTime").value, place: $("rpPlace").value });
    if (!days.length || !r.added) { $("rpErr").textContent = !days.length ? "Pick at least one day." : "Nothing to add. Check the dates (up to 4 months) or those days may already have practices."; $("rpErr").hidden = false; return; }
    $("ssRepDlg").close(); selected = $("rpFrom").value; save(r.team); toast(`Added ${r.added} practices`);
}

function wire() {
    $("ssAddGame").onclick = $("ssE1").onclick = () => openEdit(null, "game");
    $("ssAddPrac").onclick = $("ssE2").onclick = () => openEdit(null, "practice");
    $("ssRepeat").onclick = $("ssE3").onclick = openRepeat;
    $("ssKind").querySelectorAll("button").forEach(b => { b.onclick = () => setKind(b.dataset.k); });
    $("ssSite").querySelectorAll("button").forEach(b => { b.onclick = () => setSite(site === b.dataset.s ? "" : b.dataset.s); });
    $("ssSave").onclick = saveEdit; $("ssCancel").onclick = () => $("ssDlg").close();
    $("ssDelete").onclick = () => {
        const b = $("ssDelete");
        if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "Delete"; }, 3000); return; }
        b.dataset.arm = ""; $("ssDlg").close(); save(S.removeItem(team, editing)); toast("Deleted");
    };
    $("rpGo").onclick = doRepeat; $("rpCancel").onclick = () => $("ssRepDlg").close(); $("ssPlanClose").onclick = () => $("ssPlanDlg").close();
    $("ssPrev").onclick = () => { selected = S.addDays(selected, -7); render(); };
    $("ssNextW").onclick = () => { selected = S.addDays(selected, 7); render(); };
    $("ssToday").onclick = () => { selected = today; render(); };
    window.addEventListener("pageshow", () => { team = readTeam(); today = T.todayKey(); render(); });
}
{ const n = S.nextGame(team, today); if (n && !team.sessions.some(s => s.date === today && s.kind !== "other")) selected = n.session.date; }
wire(); render();
