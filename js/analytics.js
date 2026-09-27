/* ==========================================
   Southbound Analytics — the header and Personal Records

   The header counts down to race day from the Marathon plan; Personal
   Records fill in from your runs (js/personalRecords.js), and a time you
   type counts too. The training and body trends below them
   are js/trendsView.js (from what you actually ran and measured).
========================================== */

import {
    WEEKS,
    getCurrentWeek,
    getRaceCountdown,
    getTrainingPhase
} from "./marathonData.js";

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

function renderHero() {
    setText("countdownDays", getRaceCountdown());
    setText("trainingWeek", `Week ${getCurrentWeek()} of ${WEEKS.length}`);
    setText("trainingPhase", getTrainingPhase() || "—");
}

/* ==========================================
   Personal Records: filled in from your runs (js/personalRecords.js),
   the fastest of what's found and what you typed
========================================== */

const PR_KEY = "personal-records";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const prDay = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function loadPersonalRecords() {
    try {
        return JSON.parse(localStorage.getItem(PR_KEY) || "{}") || {};
    } catch (e) {
        return {};
    }
}

function savePersonalRecords(records) {
    localStorage.setItem(PR_KEY, JSON.stringify(records));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

function sourceText(pr) {
    if (pr.source === "typed") return "Typed in by you";
    if (!pr.source) return "Not found in your runs yet";
    const run = pr.name && pr.name !== "Run" ? esc(pr.name) : "a run";
    return `${pr.inside ? `Fastest ${esc(pr.label)} inside ${run}` : run} · ${prDay(pr.date)}`;
}

async function renderPersonalRecords() {
    const container = $("recordsGrid");
    if (!container) return;
    const [{ personalRecords }, { everyRun, stravaActs }] = await Promise.all([import("./personalRecords.js"), import("./trendsData.js")]);
    const typed = loadPersonalRecords();
    const list = personalRecords(everyRun(), stravaActs(), typed);

    container.innerHTML = list.map(pr => `
        <div class="record" data-field="${pr.id}">
            <span>${esc(pr.label)}</span>
            <h3 class="record-value" role="button" tabindex="0" title="Type your own time">${esc(pr.text || "Not set")}</h3>
            <input type="text" class="record-input" placeholder="e.g. 3:05:00" aria-label="${esc(pr.label)} time" value="${esc(typed[pr.id] || "")}" hidden>
            <small class="record-source">${sourceText(pr)}</small>
            ${pr.candidate ? `<button type="button" class="record-link" data-hide="${esc(pr.candidate)}">Not right? Hide it</button>` : ""}
            ${pr.hiddenCount ? `<button type="button" class="record-link" data-unhide>Show ${pr.hiddenCount} hidden</button>` : ""}
        </div>
    `).join("");

    container.querySelectorAll(".record").forEach(card => {
        const field = card.dataset.field;
        const value = card.querySelector(".record-value");
        const input = card.querySelector(".record-input");
        const edit = () => { value.hidden = true; input.hidden = false; input.focus(); input.select(); };
        value.addEventListener("click", edit);
        value.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit(); } });
        input.addEventListener("blur", () => {
            const records = loadPersonalRecords();
            records[field] = input.value.trim();
            savePersonalRecords(records);
            renderPersonalRecords();
        });
        input.addEventListener("keydown", e => { if (e.key === "Enter") input.blur(); });
        card.querySelector("[data-hide]")?.addEventListener("click", e => {
            const records = loadPersonalRecords();
            const hidden = { ...(records._hidden || {}) };
            hidden[field] = [...new Set([...(hidden[field] || []), e.currentTarget.dataset.hide])];
            savePersonalRecords({ ...records, _hidden: hidden });
            renderPersonalRecords();
        });
        card.querySelector("[data-unhide]")?.addEventListener("click", () => {
            const records = loadPersonalRecords();
            const hidden = { ...(records._hidden || {}) };
            delete hidden[field];
            savePersonalRecords({ ...records, _hidden: hidden });
            renderPersonalRecords();
        });
    });
}

// Each section is independent: a failure in one must never take down the other.
function safely(fn) {
    try {
        fn();
    } catch (error) {
        console.error(`Analytics: ${fn.name} failed`, error);
    }
}

function initAnalytics() {
    safely(renderHero);
    renderPersonalRecords().catch(error => console.error("Analytics: personal records failed", error));
    // New runs (COROS) or an imported Strava archive can set a new record.
    for (const e of ["sb:strava-updated", "eddieos:coros-history-updated"]) {
        window.addEventListener(e, () => renderPersonalRecords().catch(() => {}));
    }
}

$("viewMarathonPlan")?.addEventListener("click", () => {
    window.location.href = "marathon.html";
});

$("viewTodayWorkout")?.addEventListener("click", () => {
    window.location.href = "index.html";
});

document.addEventListener("DOMContentLoaded", initAnalytics);
