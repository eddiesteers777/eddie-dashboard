// Strength → Progress: every lift from strength-history over time (js/strengthProgress.js does the maths).
// Weights are stored in lb and shown in the Strength page's unit (strength-settings).
import { allProgress, weeklyVolume, addDaysIso, historyFromResults, mergeHistories } from "./strengthProgress.js";
import { showsPersonalPlan } from "./role.js";
import { SETTINGS_KEY, cleanSettings, volumeText } from "./strengthUnits.js";
import { esc, dateText, headline, trendChip, liftBodyHtml, EPLEY_NOTE } from "./strengthProgressHtml.js";
import { icon } from "./icons.js";

const host = document.getElementById("strengthProgress");
let openKey = null;
let query = "";
let showAll = false;
const SHOW = 12;

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const unit = () => cleanSettings(read(SETTINGS_KEY, null)).unit;
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function weeksHtml(history, today, u) {
    const weeks = weeklyVolume(history, today, 8);
    const max = Math.max(1, ...weeks.map(w => w.volume));
    if (!weeks.some(w => w.volume || w.sessions)) return "";
    return `
        <div class="sp-weeks" role="img" aria-label="Volume for the last 8 weeks">
            ${weeks.map((w, i) => `<div class="sp-week${i === weeks.length - 1 ? " is-now" : ""}" title="Week of ${dateText(w.start)}: ${volumeText(w.volume, u)} · ${w.sessions} session${w.sessions === 1 ? "" : "s"}">
                <span class="sp-week-bar" style="height:${Math.max(w.volume ? 6 : 0, Math.round((w.volume / max) * 100))}%"></span>
                <span class="sp-week-label">${i === weeks.length - 1 ? "Now" : dateText(w.start)}</span>
            </div>`).join("")}
        </div>
        <p class="sp-note">Volume a week (weight × reps, warm-ups left out). This week: ${volumeText(weeks[weeks.length - 1].volume, u)}.</p>`;
}

function listHtml(all, history, today, u) {
    const q = query.trim().toLowerCase();
    const shown = q ? all.filter(p => p.name.toLowerCase().includes(q)) : all;
    const since = addDaysIso(today, -30);
    const records = all.reduce((n, p) => n + p.sessions.filter(s => s.date > since && s.pr.length).length, 0);
    const days = new Set(all.flatMap(p => p.sessions.filter(s => s.date > since).map(s => s.date))).size;
    return `
        <div class="sp-head">
            <div>
                <span class="strength-library-eyebrow">PROGRESS</span>
                <h2>Your lifts</h2>
                <p>From every workout you finish in Workout Mode. Tap a lift to see it over time.</p>
            </div>
        </div>
        <div class="sp-stats">
            <div class="sp-stat"><strong>${days}</strong><span>training day${days === 1 ? "" : "s"} in 30 days</span></div>
            <div class="sp-stat"><strong>${records}</strong><span>record${records === 1 ? "" : "s"} in 30 days</span></div>
            <div class="sp-stat"><strong>${all.length}</strong><span>lift${all.length === 1 ? "" : "s"} logged</span></div>
        </div>
        ${weeksHtml(history, today, u)}
        <label class="sp-search">
            <span class="sr-only">Find a lift</span>
            <input type="search" id="spSearch" placeholder="Find a lift…" value="${esc(query)}" autocomplete="off">
        </label>
        <div class="sp-list" id="spList">
            ${shown.length ? shown.map(p => `
                <button type="button" class="sp-row" data-sp-open="${esc(p.key)}">
                    <span class="sp-row-main">
                        <strong>${esc(p.name)}</strong>
                        <span>Last ${dateText(p.last)} · ${p.count} session${p.count === 1 ? "" : "s"}${p.prCount ? ` · ${p.prCount} record${p.prCount === 1 ? "" : "s"}` : ""}</span>
                    </span>
                    <span class="sp-row-side">
                        <span class="sp-row-best">${esc(headline(p, u))}</span>
                        ${trendChip(p.trend)}
                    </span>
                    <span class="sp-row-go" aria-hidden="true">${icon("chevronRight")}</span>
                </button>`).join("") : `<p class="sp-empty">No lift matches “${esc(query)}”.</p>`}
        </div>`;
}

function detailHtml(p, u) {
    return `
        <button type="button" class="sp-back" data-sp-back>${icon("chevronLeft")} All lifts</button>
        <div class="sp-head">
            <div>
                <span class="strength-library-eyebrow">PROGRESS</span>
                <h2>${esc(p.name)}</h2>
                <p>${p.trend ? `Last 6 weeks vs the 6 before: ${trendChip(p.trend)}` : "Keep logging it to see how it's moving."}</p>
            </div>
        </div>
        ${liftBodyHtml(p, u, { showAll, show: SHOW })}
        <p class="sp-note">${EPLEY_NOTE}</p>`;
}

// A client's strength sessions logged on their coach's plan live in workoutResults, not in
// strength-history: read them once in a while and count them too (the coach's own don't exist).
let planLifts = {};
let planLiftsAt = 0;
async function loadPlanLifts(force = false) {
    if (showsPersonalPlan() || (!force && Date.now() - planLiftsAt < 60000)) return;
    planLiftsAt = Date.now();
    try {
        const { listMyResults } = await import("./workoutResults.js");
        const next = historyFromResults(await listMyResults());
        if (JSON.stringify(next) === JSON.stringify(planLifts)) return;
        planLifts = next;
        render();
    } catch (error) {
        console.warn("Couldn't read the strength sessions logged on your plan:", error);
    }
}

function render() {
    if (!host) return;
    const history = mergeHistories(read("strength-history", {}) || {}, planLifts);
    const today = localToday();
    const u = unit();
    const all = allProgress(history, today);
    if (!all.length) {
        host.innerHTML = `
            <div class="sp-head"><div><span class="strength-library-eyebrow">PROGRESS</span><h2>Your lifts</h2></div></div>
            <div class="sp-empty-state">
                <strong>Nothing logged yet</strong>
                <p>Start a workout, tick your sets and tap Finish${showsPersonalPlan() ? "" : ", or log a strength session from your coach's plan"}. Each lift shows up here with your best sets, estimated 1-rep max and records.</p>
            </div>`;
        return;
    }
    const p = openKey && all.find(x => x.key === openKey);
    if (openKey && !p) openKey = null;
    host.innerHTML = p ? detailHtml(p, u) : listHtml(all, history, today, u);
}

host?.addEventListener("click", event => {
    const open = event.target.closest("[data-sp-open]");
    if (open) {
        openKey = open.dataset.spOpen;
        showAll = false;
        render();
        host.querySelector("[data-sp-back]")?.focus();
        host.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
    }
    if (event.target.closest("[data-sp-more]")) {
        showAll = true;
        render();
        return;
    }
    if (event.target.closest("[data-sp-back]")) {
        const was = openKey;
        openKey = null;
        render();
        host.querySelector(`[data-sp-open="${CSS.escape(was || "")}"]`)?.focus();
    }
});

host?.addEventListener("input", event => {
    if (!event.target.matches("#spSearch")) return;
    query = event.target.value;
    const pos = event.target.selectionStart;
    render();
    const input = host.querySelector("#spSearch");
    if (input) { input.focus(); input.setSelectionRange(pos, pos); }
});

document.addEventListener("click", event => {
    if (event.target.closest('[data-strength-view="progress"]')) { render(); loadPlanLifts(); }
});
window.addEventListener("sb:strength-settings", render);
window.addEventListener("storage", e => { if (e.key === "strength-history" || e.key === SETTINGS_KEY) render(); });
window.addEventListener("eddieos:strength-history-updated", render);

render();
loadPlanLifts(true);
