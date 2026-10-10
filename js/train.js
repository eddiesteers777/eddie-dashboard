/* ==========================================
   Southbound — the Train page (train.html)

   Tabs for Running / Strength / Cross-Training (only the ones the
   account's services include): this week's numbers and where to go
   next. Below them, Recent Workouts: every completed session from all
   three, newest first (js/sessionStore.js loadFeed), each with Share
   (js/sessionShare.js) and, for sessions stored here (strength,
   cross-training), Edit. Running Log runs are edited on Running; watch
   runs come from the watch and aren't edited here.
========================================== */

import { loadFeed } from "./sessionStore.js";
import { weekTotals, sessionLine, milesText, localDay, minutesText, MILE } from "./completedSessions.js";
import { emptyHtml, toast } from "./ui.js";
import { volumeText, cleanSettings, SETTINGS_KEY } from "./strengthUnits.js";
import { icon } from "./icons.js";
import { can } from "./navAccess.js";

const PAGE = 15;
const TAB_KEY = "sb-train-tab";
const TABS = [
    { key: "run", label: "Running", cap: "running", icon: "activity" },
    { key: "strength", label: "Strength", cap: "strength", icon: "dumbbell" },
    { key: "cross", label: "Cross-Training", short: "Cross", cap: "crossTraining", icon: "bike" }
];
const FILTERS = [["all", "All"], ["run", "Runs"], ["strength", "Strength"], ["cross", "Cross-training"]];
const SOURCE = { coros: "From COROS", strava: "From Strava", log: "Running Log", plan: "Coach's plan", strength: "", cross: "" };

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const unit = () => { try { return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")).unit; } catch { return "lb"; } };
const volume = lb => volumeText(lb, unit());
const dayWords = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const state = { tab: null, filter: "all", shown: PAGE, feed: [], results: null, byId: new Map() };

function tabs() {
    const allowed = TABS.filter(t => can(t.cap));
    return allowed.length ? allowed : TABS;
}

/* ---------- tabs ---------- */

function drawTabs() {
    const list = tabs();
    let saved = null;
    try { saved = localStorage.getItem(TAB_KEY); } catch { saved = null; }
    if (!state.tab || !list.some(t => t.key === state.tab)) state.tab = list.find(t => t.key === saved)?.key || list[0].key;
    $("trainTabs").innerHTML = list.map(t => `
        <button type="button" role="tab" class="tr-tab" id="trTab-${t.key}" data-tab="${t.key}" aria-label="${t.label}" aria-selected="${t.key === state.tab}" aria-controls="trainPanel" tabindex="${t.key === state.tab ? 0 : -1}">
            ${icon(t.icon)}${t.short ? `<span class="tr-tab-long">${t.label}</span><span class="tr-tab-short" aria-hidden="true">${t.short}</span>` : `<span>${t.label}</span>`}
        </button>`).join("");
    $("trainPanel").setAttribute("aria-labelledby", `trTab-${state.tab}`);
    $("trainFilter").innerHTML = FILTERS.filter(([k]) => k === "all" || list.some(t => t.key === k)).map(([k, label]) =>
        `<button type="button" class="tr-filter-chip" data-filter="${k}" aria-pressed="${k === state.filter}">${label}</button>`).join("");
}

const tile = (value, label) => `<div class="tr-tile"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;

function drawPanel() {
    const week = weekTotals(state.feed, localDay());
    const since = `Since Monday, ${dayWords(week.from)}`;
    let body = "";
    if (state.tab === "run") {
        const w = week.run;
        body = `
            <div class="tr-tiles">${tile(w.meters ? (w.meters / MILE).toFixed(1) : "0", "Miles")}${tile(String(w.count), w.count === 1 ? "Run" : "Runs")}${tile(w.longest ? (w.longest / MILE).toFixed(1) : "—", "Longest (mi)")}</div>
            <div class="tr-actions">
                <a class="sb-btn sb-btn-primary" href="running.html">${icon("activity")} Open Running</a>
                <a class="sb-btn sb-btn-secondary" href="running.html?addRun=1">${icon("plus")} Log a run</a>
            </div>`;
    } else if (state.tab === "strength") {
        const w = week.strength;
        body = `
            <div class="tr-tiles">${tile(String(w.count), w.count === 1 ? "Workout" : "Workouts")}${tile(String(w.sets), "Sets")}${w.volumeLb > 0 ? tile(volume(w.volumeLb), "Volume") : tile("—", "Volume")}</div>
            <div class="tr-actions">
                <a class="sb-btn sb-btn-primary" href="strength.html">${icon("dumbbell")} Start a workout</a>
            </div>`;
    } else {
        const w = week.cross;
        body = `
            <div class="tr-tiles">${tile(String(w.count), w.count === 1 ? "Session" : "Sessions")}${tile(w.minutes ? String(w.minutes) : "0", "Minutes")}</div>
            <div class="tr-actions">
                <button type="button" class="sb-btn sb-btn-primary" data-log-cross>${icon("plus")} Log a session</button>
                <a class="sb-btn sb-btn-secondary" href="cross-training.html">${icon("bike")} Workout library</a>
            </div>`;
    }
    $("trainPanel").innerHTML = `<p class="tr-since">This week · ${esc(since)}</p>${body}`;
}

/* ---------- the feed ---------- */

function itemHtml(s) {
    const tags = [];
    if (s.type === "run" && s.run?.category) tags.push(s.run.category);
    if (SOURCE[s.source]) tags.push(SOURCE[s.source]);
    if (s.edited) tags.push("Edited");
    if (s.share?.count) tags.push(s.share.via === "save" ? "Image saved" : "Shared");
    const line = sessionLine(s, { volume }) || (s.type === "run" ? milesText(s.run?.meters) : "");
    const editable = s.source === "strength" || s.source === "cross";
    const iconName = s.type === "run" ? "activity" : s.type === "strength" ? "dumbbell" : "bike";
    return `
        <li class="tr-item is-${s.type}" data-id="${esc(s.id)}">
            <span class="tr-item-icon" aria-hidden="true">${icon(iconName)}</span>
            <div class="tr-item-main">
                <div class="tr-item-top"><strong>${esc(s.title)}</strong><time datetime="${esc(s.date)}">${esc(dayWords(s.date))}</time></div>
                ${line ? `<span class="tr-item-line">${esc(line)}</span>` : ""}
                ${tags.length ? `<span class="tr-item-tags">${tags.map(t => `<span>${esc(t)}</span>`).join("")}</span>` : ""}
            </div>
            <div class="tr-item-actions">
                <button type="button" class="sb-btn sb-btn-secondary tr-share" data-share="${esc(s.id)}" aria-label="Share ${esc(s.title)}, ${esc(dayWords(s.date))}">${icon("upload")}<span>Share</span></button>
                ${editable ? `<button type="button" class="sb-btn sb-btn-tertiary tr-edit" data-edit="${esc(s.id)}" aria-label="Edit ${esc(s.title)}">${icon("edit")}<span>Edit</span></button>` : ""}
                ${s.source === "log" ? `<a class="sb-btn sb-btn-tertiary tr-edit" href="running.html" aria-label="Edit on Running">${icon("edit")}<span>Edit</span></a>` : ""}
            </div>
        </li>`;
}

function emptyFor(filter) {
    if (filter === "run") return emptyHtml({ iconName: "activity", title: "No runs yet", text: "Runs from COROS, your Strava import and the Running Log show up here.", actionHref: "running.html?addRun=1", actionLabel: "Log a run" });
    if (filter === "strength") return emptyHtml({ iconName: "dumbbell", title: "No strength workouts yet", text: "Finish a workout on Strength and it's saved here, ready to share.", actionHref: "strength.html", actionLabel: "Go to Strength" });
    if (filter === "cross") return emptyHtml({ iconName: "bike", title: "No cross-training yet", text: "Log a ride, swim or class from the Cross-Training tab above." });
    return emptyHtml({ iconName: "activity", title: "No workouts yet", text: "Everything you finish (runs, strength workouts and cross-training) shows up here, newest first." });
}

function drawFeed() {
    const list = state.feed.filter(s => state.filter === "all" || s.type === state.filter);
    const feed = $("trainFeed");
    feed.removeAttribute("aria-busy");
    feed.innerHTML = list.length ? list.slice(0, state.shown).map(itemHtml).join("") : `<li class="tr-feed-empty">${emptyFor(state.filter)}</li>`;
    const more = $("trainMore");
    more.hidden = list.length <= state.shown;
    more.textContent = `Show more (${list.length - state.shown} older)`;
}

function drawAll() {
    state.byId = new Map(state.feed.map(s => [s.id, s]));
    drawTabs();
    drawPanel();
    drawFeed();
}

async function refresh({ account = false } = {}) {
    try {
        const { feed, results } = await loadFeed({ results: account, cachedResults: account ? null : state.results });
        if (account) state.results = results;
        state.feed = feed;
    } catch {
        if (!state.feed.length) {
            $("trainFeed").innerHTML = `<li class="tr-feed-empty">${emptyHtml({ iconName: "info", title: "Couldn't load your workouts", text: "Reload the page to try again." })}</li>`;
            return;
        }
    }
    drawAll();
}

/* ---------- actions ---------- */

document.addEventListener("click", async event => {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
        state.tab = tab.dataset.tab;
        try { localStorage.setItem(TAB_KEY, state.tab); } catch { /* device preference only */ }
        drawTabs(); drawPanel();
        $(`trTab-${state.tab}`)?.focus();
        return;
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) { state.filter = filter.dataset.filter; state.shown = PAGE; drawTabs(); drawFeed(); return; }
    if (event.target.closest("#trainMore")) { state.shown += PAGE; drawFeed(); return; }
    const share = event.target.closest("[data-share]");
    if (share) {
        const s = state.byId.get(share.dataset.share);
        if (!s) return;
        try { (await import("./sessionShare.js")).shareSession(s); }
        catch { toast("Couldn't open the share card. Check your connection and try again.", { type: "error" }); }
        return;
    }
    const edit = event.target.closest("button[data-edit]");
    if (edit) {
        const s = state.byId.get(edit.dataset.edit);
        if (s) (await import("./sessionDialogs.js")).openSessionEdit(s);
        return;
    }
    if (event.target.closest("[data-log-cross]")) {
        (await import("./sessionDialogs.js")).openCrossLog();
    }
});

// Arrow keys move between tabs.
document.addEventListener("keydown", event => {
    const tab = event.target.closest?.("[data-tab]");
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const keys = tabs().map(t => t.key);
    let i = keys.indexOf(tab.dataset.tab);
    i = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + keys.length) % keys.length;
    event.preventDefault();
    state.tab = keys[i];
    drawTabs(); drawPanel();
    $(`trTab-${state.tab}`)?.focus();
});

let pending = null;
const soon = () => { clearTimeout(pending); pending = setTimeout(() => refresh(), 150); };
["sb:sessions-changed", "eddieos:coros-history-updated", "sb:strava-updated", "eddieos:strength-history-updated"].forEach(name => window.addEventListener(name, soon));
// Another tab (or a cloud pull) changed a session.
window.addEventListener("storage", e => { if (!e.key || e.key.startsWith("workout-") || e.key === "running-log" || e.key === "coros-run-history") soon(); });

refresh().then(() => refresh({ account: true }));
