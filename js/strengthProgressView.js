// Strength → Progress: every lift from strength-history over time (js/strengthProgress.js does the maths).
// Weights are stored in lb and shown in the Strength page's unit (strength-settings).
import { allProgress, weeklyVolume, addDaysIso } from "./strengthProgress.js";
import { SETTINGS_KEY, cleanSettings, toDisplay, unitLabel, setShort, volumeText } from "./strengthUnits.js";
import { icon } from "./icons.js";

const host = document.getElementById("strengthProgress");
let openKey = null;
let query = "";
let showAll = false;
const SHOW = 12;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } };
const unit = () => cleanSettings(read(SETTINGS_KEY, null)).unit;
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dateText = (iso, withYear = false) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const PR_WORDS = { e1rm: "Est. 1RM record", weight: "Heaviest yet", reps: "Most reps yet", volume: "Most volume", longest: "Longest yet" };

function headline(p, u) {
    if (p.mode === "time") return p.best.duration ? `Best ${clock(p.best.duration.value)}` : "";
    if (p.best.e1rm) return `Est. 1RM ${toDisplay(p.best.e1rm.value, u)} ${unitLabel(u)}`;
    if (p.best.reps) return `Best ${p.best.reps.value} reps`;
    return "";
}

function trendChip(t) {
    if (!t) return "";
    const sign = t.pct > 0 ? "+" : t.pct < 0 ? "−" : "±";
    const word = { up: "Up", down: "Down", steady: "Steady" }[t.word];
    return `<span class="sp-trend is-${t.word}" title="Best of the last 6 weeks vs the 6 before">${word} ${sign}${Math.abs(t.pct)}%</span>`;
}

function chartSvg(points) {
    const vals = points.map(p => p.v).filter(v => v != null);
    if (vals.length < 2) return "";
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.15;
    lo -= pad; hi += pad;
    const n = points.length;
    const x = i => (n === 1 ? 50 : 4 + (i / (n - 1)) * 92);
    const y = v => 4 + (1 - (v - lo) / (hi - lo)) * 52;
    const pts = points.map((p, i) => (p.v == null ? null : { x: x(i), y: y(p.v), pr: p.pr }));
    const line = pts.filter(Boolean).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const dots = pts.filter(Boolean).map(p => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${p.pr ? 1.6 : 1.1}" class="${p.pr ? "sp-dot-pr" : "sp-dot"}"/>`).join("");
    return `<svg class="sp-chart" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><polyline class="sp-line" points="${line}" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
}

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
    const time = p.mode === "time";
    const metric = s => (time ? s.bestDuration : s.e1rm != null ? toDisplay(s.e1rm, u) : s.mostReps);
    const what = time ? "Longest hold" : p.best.e1rm ? `Estimated 1-rep max (${unitLabel(u)})` : "Most reps in a set";
    const recent = p.sessions.slice(-30);
    const tiles = time
        ? [["Best", p.best.duration ? clock(p.best.duration.value) : "–"], ["Sessions", p.count], ["Since", dateText(p.first, true)]]
        : [
            p.best.e1rm ? ["Est. 1RM", `${toDisplay(p.best.e1rm.value, u)} ${unitLabel(u)}`, `${setShort(p.best.e1rm.top, u, { bodyweight: p.bw })} · ${dateText(p.best.e1rm.date)}`] : null,
            p.best.weight ? ["Heaviest", `${p.bw ? "BW + " : ""}${toDisplay(p.best.weight.value, u)} ${unitLabel(u)}`, dateText(p.best.weight.date)] : null,
            p.bw && p.best.reps ? ["Most reps", p.best.reps.value, dateText(p.best.reps.date)] : null,
            ["Sessions", p.count, `since ${dateText(p.first, true)}`]
        ].filter(Boolean);
    return `
        <button type="button" class="sp-back" data-sp-back>${icon("chevronLeft")} All lifts</button>
        <div class="sp-head">
            <div>
                <span class="strength-library-eyebrow">PROGRESS</span>
                <h2>${esc(p.name)}</h2>
                <p>${p.trend ? `Last 6 weeks vs the 6 before: ${trendChip(p.trend)}` : "Keep logging it to see how it's moving."}</p>
            </div>
        </div>
        <div class="sp-stats">
            ${tiles.map(t => `<div class="sp-stat"><strong>${esc(t[1])}</strong><span>${esc(t[0])}</span>${t[2] ? `<small>${esc(t[2])}</small>` : ""}</div>`).join("")}
        </div>
        ${recent.length > 1 ? `<figure class="sp-figure"><figcaption>${what}, last ${recent.length} sessions</figcaption>${chartSvg(recent.map(s => ({ v: metric(s), pr: s.pr.length > 0 })))}<div class="sp-axis"><span>${dateText(recent[0].date)}</span><span>${dateText(recent[recent.length - 1].date)}</span></div></figure>` : ""}
        <h3 class="sp-sub">Sessions</h3>
        <ol class="sp-sessions">
            ${[...p.sessions].reverse().slice(0, showAll ? undefined : SHOW).map(s => `
                <li class="sp-session">
                    <span class="sp-session-date">${dateText(s.date, true)}</span>
                    <span class="sp-session-main">
                        ${time ? `<strong>${clock(s.bestDuration)}</strong> best · ${s.sets} set${s.sets === 1 ? "" : "s"}`
                               : `<strong>${s.top ? esc(setShort(s.top, u, { bodyweight: p.bw })) : "–"}</strong> top set · ${s.sets} set${s.sets === 1 ? "" : "s"}${s.e1rm ? ` · est. 1RM ${toDisplay(s.e1rm, u)}` : ""}${s.volume ? ` · ${volumeText(s.volume, u)}` : ""}`}
                    </span>
                    ${s.pr.length ? `<span class="sp-badges">${s.pr.map(k => `<span class="sp-badge">${PR_WORDS[k]}</span>`).join("")}</span>` : ""}
                </li>`).join("")}
        </ol>
        ${!showAll && p.sessions.length > SHOW ? `<button type="button" class="sp-more" data-sp-more>Show all ${p.count} sessions</button>` : ""}
        <p class="sp-note">Est. 1RM uses the Epley formula on sets of 1–12 reps: a guide to compare sessions, not a test result.</p>`;
}

function render() {
    if (!host) return;
    const history = read("strength-history", {}) || {};
    const today = localToday();
    const u = unit();
    const all = allProgress(history, today);
    if (!all.length) {
        host.innerHTML = `
            <div class="sp-head"><div><span class="strength-library-eyebrow">PROGRESS</span><h2>Your lifts</h2></div></div>
            <div class="sp-empty-state">
                <strong>Nothing logged yet</strong>
                <p>Start a workout, tick your sets and tap Finish. Each lift shows up here with your best sets, estimated 1-rep max and records.</p>
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
    if (event.target.closest('[data-strength-view="progress"]')) render();
});
window.addEventListener("sb:strength-settings", render);
window.addEventListener("storage", e => { if (e.key === "strength-history" || e.key === SETTINGS_KEY) render(); });
window.addEventListener("eddieos:strength-history-updated", render);

render();
