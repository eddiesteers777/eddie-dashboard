// Season: games and practices on one week view. Data and rules live in seasonModel.js / teamModel.js.
import "./shell.js";
import * as T from "./teamModel.js";
import * as S from "./seasonModel.js";
import * as P from "./practiceModel.js";
import * as D from "./drillModel.js";
import { SEED_DRILLS } from "./drillSeed.js";
import * as Rules from "./seasonRules.js";
import { KEYS } from "./store.js";

const $ = id => document.getElementById(id);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const readTeam = () => { try { return T.loadTeam(localStorage.getItem(KEYS.team)); } catch { return T.emptyTeam(); } };
const plans = () => { try { return P.parsePracticeList(localStorage.getItem(KEYS.practices) || ""); } catch { return []; } };
const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); };
const fmtDate = (d, o) => new Date(d + "T12:00:00").toLocaleDateString(undefined, o);
const fmtTime = t => { if (!t) return ""; const [hh, mm] = t.split(":").map(Number); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`; };
const SITE = { home: "Home", away: "Away", neutral: "Neutral" };

let team = readTeam(), today = T.todayKey(), selected = today, editing = null, kind = "game", site = "", planFor = null, view = "month";

function save(next) {
    team = next;
    try { localStorage.setItem(KEYS.team, T.serializeTeam(team)); } catch { toast("Couldn't save on this device"); }
    render();
}
const scheduled = () => team.sessions.some(s => s.date >= today && s.kind !== "other") || team.sessions.some(s => s.opp || s.time || s.planId);

const sugs = () => Rules.suggestions(team, today);
function loadDrills() {
    try { const l = D.parseDrills(localStorage.getItem(KEYS.drills) || ""); if (l) return l; } catch {}
    return D.mergeSeeds([], SEED_DRILLS);
}
function sugRow(sg) {
    const r = h("div", "ss-sug"), t = h("div", "ss-sug-t");
    t.append(h("span", "ss-k", sg.action ? "Suggested, not applied" : "Heads up"), h("p", "", sg.text));
    const b = h("div", "ss-btns");
    const add = (label, fn, cls = "") => { const x = h("button", "pb-btn " + cls, label); x.type = "button"; x.onclick = fn; b.append(x); };
    if (sg.action) { add("Approve", () => approve(sg), "pb-primary"); add("Edit", () => { const s = team.sessions.find(x => x.id === sg.sid); if (s) openPlans(s); }); add("Skip", () => save(S.handle(team, sg.id))); }
    else add("Got it", () => save(S.handle(team, sg.id)));
    t.append(b); r.append(t); return r;
}
// Approve builds a NEW saved practice (the original plan is never changed) and attaches it.
function approve(sg) {
    const s = team.sessions.find(x => x.id === sg.sid); if (!s) return;
    const list = plans(), base = (s.planId && list.find(p => p.id === s.planId)?.practice) || P.newPractice();
    const light = sg.action === "light";
    const r = P.suggestPlan({ drills: loadDrills(), total: base.total, players: base.players, equipment: base.equipment, focus: base.focus, gameInDays: light ? 1 : 0, recovery: !light, variant: base.variant });
    if (!r.items.length) { toast("No drills fit for that. The plan was left as it is."); return; }
    const practice = { ...base, title: `${base.title || "Practice"} (${light ? "light" : "recovery"})`.slice(0, 60), date: s.date, items: r.items, gameInDays: light ? 1 : 0 };
    const saved = P.savePractice(list, practice, null);
    try { localStorage.setItem(KEYS.practices, P.serializePracticeList(saved.list)); } catch { toast("Couldn't save on this device"); return; }
    save(S.handle(S.setPlan(team, s.id, saved.id), sg.id)); toast("Plan built. Your original plan is unchanged.");
}

// Heads-up notes fold into one line, so the schedule stays on top. Tap it to read them.
let headsOpen = false;
function renderHeads() {
    const heads = $("ssHeads"), list = Rules.general(sugs()); heads.replaceChildren();
    if (!list.length) { headsOpen = false; return; }
    const b = h("button", "ss-headline"); b.type = "button"; b.setAttribute("aria-expanded", String(headsOpen));
    const k = h("span", "ss-k", "Heads up"), t = h("span", "", `${list.length} ${list.length === 1 ? "thing" : "things"} to check`), go = h("i", "", headsOpen ? "\u2303" : "\u203A"); go.setAttribute("aria-hidden", "true");
    b.append(k, t, go); b.onclick = () => { headsOpen = !headsOpen; renderHeads(); };
    heads.append(b);
    if (headsOpen) list.forEach(g => heads.append(sugRow(g)));
}

// On a phone the day's options sit below the calendar: if they are off the bottom of the screen, bring them up (never past the calendar's top).
function revealDay() {
    if (innerWidth >= 1000) return;
    const top = $("ssDay").getBoundingClientRect().top, room = innerHeight - 110;
    if (top <= room - 150) return;
    const dy = Math.min(top - room * 0.45, $("ssMonth").getBoundingClientRect().top - 70); // never push the calendar's top off the screen
    if (dy > 0) window.scrollBy({ top: dy, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function renderMonth() {
    $("ssMName").textContent = fmtDate(selected.slice(0, 7) + "-01", { month: "long", year: "numeric" });
    const grid = $("ssGrid"); grid.replaceChildren();
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) grid.append(h("div", "ss-dow", d));
    for (const week of S.monthWeeks(team, selected)) for (const d of week) {
        const c = h("button", "ss-cell" + (d.inMonth ? "" : " out") + (d.date === selected ? " sel" : "") + (d.date === today ? " today" : "")); c.type = "button";
        const items = d.items.filter(i => !i.cancelled), game = items.some(S.isGame), prac = items.some(i => i.kind === "practice"), cond = items.some(i => i.kind === "conditioning");
        c.setAttribute("aria-label", `${fmtDate(d.date, { weekday: "long", month: "long", day: "numeric" })}${game ? ", game" : ""}${prac ? ", practice" : ""}${cond ? ", conditioning" : ""}`);
        c.append(h("span", "ss-n", String(Number(d.date.slice(8)))));
        const lines = h("span", "ss-lines"), dots = h("span", "ss-dots");
        for (const s of items) {
            const isG = S.isGame(s), away = s.site === "away", cl = isG ? "g" : s.kind === "conditioning" ? "c" : "p", tm = s.time ? fmtTime(s.time).replace(":00", "").replace(" ", "").toLowerCase() + " " : "";
            lines.append(h("span", "ss-ev " + cl + (isG && away ? " away" : ""), isG ? `${tm}${away ? "@ " : ""}${S.opponent(s) || "Game"}` : `${tm}${s.kind === "conditioning" ? "Conditioning" : "Practice"}`));
            dots.append(h("span", "ss-dot" + (cl === "p" ? "" : " " + cl)));
        }
        c.append(lines, dots);
        c.onclick = () => { selected = d.date; render(); revealDay(); };
        grid.append(c);
    }
}

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
        const game = d.items.some(S.isGame), prac = d.items.some(i => i.kind === "practice" && !i.cancelled);
        b.setAttribute("aria-label", `${fmtDate(d.date, { weekday: "long", month: "long", day: "numeric" })}${game ? ", game" : ""}${prac ? ", practice" : ""}`);
        if (Rules.forDay(sugs(), d.date).length) b.classList.add("sug");
        b.append(h("small", "", fmtDate(d.date, { weekday: "narrow" })), h("b", "", String(Number(d.date.slice(8)))), h("em", "", game ? "GAME" : prac ? "•" : ""));
        b.onclick = () => { selected = d.date; render(); };
        strip.append(b);
    }
}

function itemCard(s) {
    const isG = s.kind === "game", isC = s.kind === "conditioning", card = h("article", "ss-card" + (isG ? " game" : isC ? " cond" : "")), label = isG ? "Game" : isC ? "Conditioning" : "Practice";
    card.append(h("div", "ss-k", `${label} · ${fmtDate(s.date, { weekday: "short", month: "short", day: "numeric" })}`));
    card.append(h("h3", "", isG ? (S.opponent(s) ? "vs " + S.opponent(s) : "Game") : label));
    const dl = h("dl"); const row = (k, v) => { if (v) { dl.append(h("dt", "", k), h("dd", "", v)); } };
    if (s.cancelled) row("Status", "Cancelled. It is not made up later.");
    row(isG ? "Kickoff" : "Start", fmtTime(s.time)); row("Where", [SITE[s.site], s.place].filter(Boolean).join(" · ")); row("Arrive", fmtTime(s.arrive));
    const cnt = isG ? S.practiceDaysBefore(team, s) : null; if (cnt) row("Before it", `${cnt.have} of ${cnt.need} scheduled practice days`);
    const plan = s.planId ? plans().find(p => p.id === s.planId) : null;
    if (isC) row("Work", s.note);
    if (!isG && !isC) row("Plan", plan ? `${plan.name} · ${plan.practice.total} min` : s.planId ? "That plan was deleted" : "No plan yet");
    if (isG) row("Lineup", s.game && s.game.lineups.some(r => r.some(Boolean)) ? "Set" : "Not set");
    card.append(dl);
    const btns = h("div", "ss-btns"); const b = (label, fn, cls = "") => { const x = h(fn.href ? "a" : "button", "pb-btn " + cls, label); if (fn.href) x.href = fn.href; else { x.type = "button"; x.onclick = fn; } btns.append(x); };
    if (!isG && s.cancelled) { b("Restore practice", () => save(S.setCancelled(team, s.id, false)), "pb-primary"); b("Edit", () => openEdit(s)); card.append(btns); return card; }
    if (isG) b("Set lineup", Object.assign(() => {}, { href: `playbook-game.html?date=${s.date}` }), "pb-primary");
    else if (isC) { b("Attendance", Object.assign(() => {}, { href: "playbook-team.html" }), "pb-primary"); b("Fitness check", Object.assign(() => {}, { href: "playbook-fitness.html" })); }
    else if (plan) { b("Run it", Object.assign(() => {}, { href: `playbook-run.html?plan=${encodeURIComponent(plan.id)}` }), "pb-primary"); b("Change plan", () => openPlans(s)); }
    else b("Pick a plan", () => openPlans(s), "pb-primary");
    b("Edit", () => openEdit(s));
    if (!isG && !isC) b("Cancel practice", () => save(S.setCancelled(team, s.id, true)));
    card.append(btns);
    return card;
}

function renderDay() {
    const box = $("ssDay"); box.replaceChildren();
    const day = S.weekDays(team, S.weekStart(selected)).find(d => d.date === selected);
    box.append(h("div", "ss-k ss-daytitle", fmtDate(selected, { weekday: "long", month: "long", day: "numeric" })));
    if (!day.items.length) box.append(h("p", "ss-none-t", scheduled() ? "Nothing on this day yet. What is it?" : "Nothing on the calendar yet. Tap a day, then pick what it is."));
    else day.items.forEach(s => { box.append(itemCard(s)); Rules.forDay(sugs(), selected).filter(g => g.sid === s.id).forEach(g => box.append(sugRow(g))); });
    // Big type buttons for whatever is not on this day yet (one of each type per day).
    const have = new Set(day.items.map(i => i.kind)), left = S.ADDABLE.filter(k => !have.has(k));
    if (left.length) {
        if (day.items.length) box.append(h("div", "ss-k ss-addk", "Add to this day"));
        const types = h("div", "ss-types");
        for (const k of left) { const x = h("button", "ss-type " + k); x.type = "button"; x.append(h("i", "ss-dot" + (k === "game" ? " g" : k === "conditioning" ? " c" : "")), h("span", "", T.KIND_LABELS[k])); x.onclick = () => openEdit(null, k); types.append(x); }
        box.append(types);
    }
    const tools = h("div", "ss-tools2");
    for (const [label, fn] of [["Repeat practices", openRepeat], ["Season dates", openWin]]) { const x = h("button", "ss-link", label); x.type = "button"; x.onclick = fn; tools.append(x); }
    box.append(tools);
    const rest = S.weekDays(team, S.weekStart(selected)).filter(d => d.date !== selected && d.items.length);
    if (rest.length && view === "week") {
        box.append(h("div", "ss-wk", "Rest of this week"));
        for (const d of rest) for (const s of d.items) {
            const r = h("button", "ss-row" + (s.kind === "game" ? " game" : "")); r.type = "button";
            const t = h("span", "ss-rt"); t.append(h("b", "", s.kind === "game" ? (S.opponent(s) ? "Game · vs " + S.opponent(s) : "Game") : T.KIND_LABELS[s.kind] || "Practice"), h("span", "", [fmtTime(s.time), s.planId ? "Plan attached" : s.kind === "practice" ? "No plan yet" : ""].filter(Boolean).join(" · ")));
            r.append(h("i", "", fmtDate(d.date, { weekday: "short", day: "numeric" })), t);
            r.onclick = () => { selected = d.date; render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
            box.append(r);
        }
    }
}

function render() {
    $("ssEmpty").hidden = true; $("ssBody").hidden = false; // the calendar is always there: an empty season is just an empty calendar
    const upcoming = team.sessions.filter(s => s.date >= today && s.kind !== "other");
    const ng = upcoming.filter(s => s.kind === "game").length, np = upcoming.filter(s => s.kind === "practice").length, nc = upcoming.filter(s => s.kind === "conditioning").length;
    $("ssSub").textContent = upcoming.length ? `${ng} ${ng === 1 ? "game" : "games"} · ${np} ${np === 1 ? "practice" : "practices"}${nc ? ` · ${nc} conditioning` : ""} ahead` : "";
    $("ssBody").classList.toggle("is-month", view === "month");
    const mon = S.weekStart(selected);
    $("ssRange").textContent = `${fmtDate(mon, { month: "short", day: "numeric" })} – ${fmtDate(S.addDays(mon, 6), { month: "short", day: "numeric" })}`;
    renderHeads();
    $("ssMonth").hidden = view !== "month"; $("ssWeekBar").hidden = view === "month"; $("ssStrip").hidden = view === "month";
    $("ssView").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === view)));
    renderNext(); if (view === "month") renderMonth(); else renderStrip(mon); renderDay();
}

// ---- add / edit ----
function setKind(k) {
    if (k === "repeat" || k === "dates") { $("ssDlg").close(); (k === "repeat" ? openRepeat : openWin)(); return; }
    kind = k;
    $("ssKind").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    $("fOpp").hidden = k !== "game"; $("fArrive").hidden = k !== "game"; $("ssSite").hidden = k !== "game"; $("fNote").hidden = k !== "conditioning";
    $("lblTime").textContent = "Other time"; $("lblTime2").textContent = k === "game" ? "Kickoff" : "Start";
    chipsReflect();
}
// Tap chips for the day and the time. The date and time boxes under them stay for anything else.
const TIMES = ["15:30", "16:00", "16:30", "17:00"];
function buildChips() {
    const day = $("chDay"), time = $("chTime"); day.replaceChildren(); time.replaceChildren();
    const first = selected < today ? today : selected;
    for (let i = 0; i < 6; i++) {
        const d = S.addDays(first, i), b = h("button", "ss-chip2", i === 0 && d === today ? "Today" : fmtDate(d, { weekday: "short", day: "numeric" })); b.type = "button"; b.dataset.v = d;
        b.onclick = () => { $("inDate").value = d; chipsReflect(); }; day.append(b);
    }
    for (const t of TIMES) { const b = h("button", "ss-chip2", fmtTime(t).replace(":00", "").replace(" ", " ")); b.type = "button"; b.dataset.v = t; b.onclick = () => { $("inTime").value = $("inTime").value === t ? "" : t; chipsReflect(); }; time.append(b); }
}
function chipsReflect() {
    document.querySelectorAll("#chDay .ss-chip2").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === $("inDate").value)));
    document.querySelectorAll("#chTime .ss-chip2").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === $("inTime").value)));
}
function setSite(v) { site = v; $("ssSite").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.s === v))); }
function openEdit(s, k = "game") {
    editing = s ? s.id : null;
    $("ssDlgTitle").textContent = s ? "Edit" : `Add ${T.KIND_LABELS[k] === "Conditioning" ? "conditioning" : T.KIND_LABELS[k].toLowerCase()} · ${fmtDate(selected, { weekday: "short", month: "short", day: "numeric" })}`;
    $("ssKind").hidden = Boolean(s); setKind(s ? s.kind : k);
    $("inOpp").value = s?.opp || s?.game?.opp || ""; $("inDate").value = s ? s.date : selected;
    $("inTime").value = s?.time || ""; $("inArrive").value = s?.arrive || ""; $("inPlace").value = s?.place || ""; $("inNote").value = s?.note || ""; setSite(s?.site || "");
    buildChips(); chipsReflect();
    $("ssErr").hidden = true; $("ssDelete").hidden = !s; $("ssDelete").textContent = "Delete";
    $("ssDlg").showModal();
}
function saveEdit() {
    const date = $("inDate").value;
    if (!date) { $("ssErr").textContent = "Pick a date."; $("ssErr").hidden = false; return; }
    const r = S.saveItem(team, { id: editing, date, kind, opp: $("inOpp").value, time: $("inTime").value, arrive: $("inArrive").value, site, place: $("inPlace").value, note: $("inNote").value });
    if (r.error) { $("ssErr").textContent = r.error === "taken" ? `There is already ${kind === "conditioning" ? "conditioning" : "a " + kind} on that date. Edit that one instead.` : "Couldn't save that."; $("ssErr").hidden = false; return; }
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
function openWin() { const w = S.seasonWindow(team); $("wnStart").value = w.start; $("wnEnd").value = w.end; $("wnErr").hidden = true; $("ssWinDlg").showModal(); }
function saveWin() {
    const a = $("wnStart").value, z = $("wnEnd").value, next = S.setWindow(team, a, z);
    if (next === team) { $("wnErr").textContent = "Pick a first practice date, and an end date that is not before it."; $("wnErr").hidden = false; return; }
    $("ssWinDlg").close(); save(next);
}
function doRepeat() {
    const days = [...$("rpDays").querySelectorAll("[aria-pressed=true]")].map(b => Number(b.dataset.d));
    const r = S.repeatPractices(team, $("rpFrom").value, $("rpTo").value, days, { time: $("rpTime").value, place: $("rpPlace").value });
    if (!days.length || !r.added) { $("rpErr").textContent = !days.length ? "Pick at least one day." : "Nothing to add. Check the dates (up to 4 months) or those days may already have practices."; $("rpErr").hidden = false; return; }
    $("ssRepDlg").close(); selected = $("rpFrom").value; save(r.team); toast(`Added ${r.added} practices`);
}

function wire() {
    $("ssAdd").onclick = $("ssE1").onclick = () => openEdit(null, "game");
    $("ssE3").onclick = openRepeat;
    $("inDate").addEventListener("input", chipsReflect); $("inTime").addEventListener("input", chipsReflect);
    $("ssView").querySelectorAll("button").forEach(b => { b.onclick = () => { view = b.dataset.v; render(); }; });
    $("ssMPrev").onclick = () => { selected = S.addMonths(selected, -1); render(); };
    $("ssMNext").onclick = () => { selected = S.addMonths(selected, 1); render(); };
    $("ssKind").querySelectorAll("button").forEach(b => { b.onclick = () => setKind(b.dataset.k); });
    $("ssSite").querySelectorAll("button").forEach(b => { b.onclick = () => setSite(site === b.dataset.s ? "" : b.dataset.s); });
    $("ssSave").onclick = saveEdit; $("ssCancel").onclick = () => $("ssDlg").close();
    $("ssDelete").onclick = () => {
        const b = $("ssDelete");
        if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "Delete"; }, 3000); return; }
        b.dataset.arm = ""; $("ssDlg").close(); save(S.removeItem(team, editing)); toast("Deleted");
    };
    $("wnSave").onclick = saveWin; $("wnCancel").onclick = () => $("ssWinDlg").close();
    $("rpGo").onclick = doRepeat; $("rpCancel").onclick = () => $("ssRepDlg").close(); $("ssPlanClose").onclick = () => $("ssPlanDlg").close();
    $("ssPrev").onclick = () => { selected = S.addDays(selected, -7); render(); };
    $("ssNextW").onclick = () => { selected = S.addDays(selected, 7); render(); };
    $("ssToday").onclick = () => { selected = today; render(); };
    window.addEventListener("pageshow", () => { team = readTeam(); today = T.todayKey(); render(); });
}
{ const n = S.nextGame(team, today); if (n && !team.sessions.some(s => s.date === today && s.kind !== "other")) selected = n.session.date; }
wire(); render();
