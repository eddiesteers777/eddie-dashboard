/* ==========================================
   Southbound Running — Calendar

   Reads the marathon plan directly from
   marathonData.js rather than duplicating it.
   "Mark Complete" and inline edits write to the
   exact same training-progress / training-overrides
   keys the Marathon page itself uses, in the same
   shape, so nothing can drift out of sync.
========================================== */

import {
    START_DATE,
    RACE_DATE,
    DAY_MS,
    DAYS,
    PACES,
    weekStart,
    getCurrentWeek,
    getTrainingPhase,
    getAdjustedWeekDays,
    getUpcomingWorkouts,
    loadProgress,
    loadOverrides
} from "./marathonData.js";

import { getEntriesForDate, getRecentEntries } from "./runningLog.js";
import { getActiveProgramEntriesForDate } from "./activeProgramSources.js";
import { showsPersonalPlan } from "./role.js";
import { icon } from "./icons.js";

let currentView = "week";
let weekAnchor = new Date();
let monthAnchor = new Date();
monthAnchor.setDate(1);
let selectedDate = null;

function isoDate(date) {
    // Deliberately NOT toISOString().slice(0,10) -- that converts to
    // UTC, which silently shifts "today" to the wrong calendar day
    // in the evening for anyone west of UTC (all of the US). This
    // builds the date string from the same local-time components the
    // Date object itself reports.
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

/* ==========================================
   Pace-code -> range resolution

   day.pace holds short codes ("MP", "VO2max").
   PACES holds full labels with ranges. Codes with
   a clear match resolve to a real range; genuinely
   variable-pace codes (Progression, Fast finish,
   Race) are left unresolved on purpose rather than
   showing a fabricated number.
========================================== */

const PACE_CODE_TO_LABEL = {
    "recovery": "Recovery",
    "easy": "Easy",
    "long run": "Long Run",
    "mp": "Marathon Pace",
    "steady": "Steady",
    "threshold": "Threshold",
    "cruise": "Cruise Intervals",
    "10k pace": "10K Pace",
    "vo2max": "5K / VO₂max",
    "fartlek": "Hill Repeats / Fartlek",
    "hill effort": "Hill Repeats / Fartlek"
};

function resolvePaceRange(paceCode) {
    if (!paceCode) {
        return null;
    }

    const label = PACE_CODE_TO_LABEL[paceCode.toLowerCase()];

    if (!label) {
        return null;
    }

    const entry = PACES.find(p => p[0].toLowerCase() === label.toLowerCase());
    return entry ? entry[1] : null;
}

/* ==========================================
   Marathon day lookup for an arbitrary date
========================================== */

function marathonDayForDate(dateStr) {
    // The built-in marathon block is the coach's own race (js/role.js).
    if (!showsPersonalPlan()) {
        return null;
    }

    const date = new Date(dateStr + "T00:00:00");

    if (date < START_DATE || date > RACE_DATE) {
        return null;
    }

    const weekNumber = Math.floor((date - START_DATE) / (7 * DAY_MS)) + 1;

    try {
        const dayIndex = Math.round(
            (date - weekStart(weekNumber)) / DAY_MS
        );

        const days = getAdjustedWeekDays(weekNumber);
        const day = days[dayIndex];

        if (!day) {
            return null;
        }

        return {
            ...day,
            week: weekNumber,
            dayKey: DAYS[dayIndex]
        };
    } catch {
        return null;
    }
}

/* ==========================================
   Completion (training-progress) — same key,
   same shape, same write pattern the Marathon
   page itself uses.
========================================== */

function isCompleted(week, dayKey) {
    const progress = loadProgress();
    return !!(progress[week] && progress[week][dayKey]);
}

function toggleCompleted(week, dayKey) {
    const progress = loadProgress();

    if (!progress[week]) {
        progress[week] = {};
    }

    progress[week][dayKey] = !progress[week][dayKey];

    localStorage.setItem("training-progress", JSON.stringify(progress));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});

    return progress[week][dayKey];
}

/* ==========================================
   Inline edit (training-overrides) — same key,
   same shape as Marathon's own in-page edits.
========================================== */

function saveDayEdit(week, dayKey, { miles, session }) {
    const overrides = loadOverrides();

    if (!overrides[week]) {
        overrides[week] = {};
    }

    if (!overrides[week][dayKey]) {
        overrides[week][dayKey] = {};
    }

    overrides[week][dayKey].miles = miles;
    overrides[week][dayKey].session = session;

    localStorage.setItem("training-overrides", JSON.stringify(overrides));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

/* ==========================================
   Compact cell content
========================================== */

function cellLabel(day) {
    if (!day || !day.miles) {
        return "Rest";
    }

    return `${day.miles} ${day.pace || "mi"}`;
}

function cellGlyph(dateStr, day) {
    const todayStr = isoDate(new Date());

    if (day && isCompleted(day.week, day.dayKey)) {
        return icon("check");
    }

    if (dateStr === todayStr) {
        return icon("dot");
    }

    return "";
}

/* ==========================================
   Active plan context (header line)
========================================== */

// A client's own plans (Race / Training Plans from Programs, or one their
// coach set up) -- what the summary shows when the coach's personal
// marathon block doesn't apply.
function ownPlanEntries(fromDate, days) {
    const out = [];
    for (let i = 0; i < days; i++) {
        const date = new Date(fromDate.getTime() + i * DAY_MS);
        const dateStr = isoDate(date);
        for (const item of getActiveProgramEntriesForDate(dateStr)) {
            out.push({ date: dateStr, programName: item.programName, entry: item.entry || {} });
        }
    }
    return out;
}

function renderPlanContext() {
    const el = document.getElementById("runningPlanContext");

    if (!el) {
        return;
    }

    if (!showsPersonalPlan()) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const names = [...new Set(ownPlanEntries(today, 28).map(e => e.programName).filter(Boolean))];
        el.textContent = names.length
            ? `Current plan: ${names.join(" + ")}`
            : "Log your runs here. Your plan shows up once your coach adds one, or build your own in Programs.";
        return;
    }

    try {
        const week = getCurrentWeek();
        const phase = getTrainingPhase();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const race = new Date(RACE_DATE);
        race.setHours(0, 0, 0, 0);

        const daysToRace = Math.round((race - today) / DAY_MS);

        el.textContent = daysToRace >= 0
            ? `Indianapolis Monumental Marathon — Week ${week} of 16${phase ? " — " + phase : ""} — ${daysToRace} days to race day`
            : `Indianapolis Monumental Marathon — ${Math.abs(daysToRace)} days since race day`;
    } catch {
        el.textContent = "Indianapolis Monumental Marathon";
    }
}

/* ==========================================
   Week view
========================================== */

function renderWeekView() {
    const container = document.getElementById("runningWeekView");
    const label = document.getElementById("runningRangeLabel");

    if (!container) {
        return;
    }

    const anchorDay = weekAnchor.getDay();
    const mondayOffset = anchorDay === 0 ? -6 : 1 - anchorDay;
    const monday = new Date(weekAnchor);
    monday.setDate(monday.getDate() + mondayOffset);

    const todayStr = isoDate(new Date());

    if (label) {
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);

        label.textContent =
            `${monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }

    const cells = [];

    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(date.getDate() + i);

        const dateStr = isoDate(date);
        const day = marathonDayForDate(dateStr);
        const casual = getEntriesForDate(dateStr);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;

        cells.push(`
            <button
                type="button"
                class="running-week-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}"
                data-cal-date="${dateStr}">

                <span class="running-week-cell-dayname">${DAYS[i]}</span>
                <span class="running-week-cell-glyph">${cellGlyph(dateStr, day)}</span>
                <span class="running-week-cell-label">${escapeHtml(cellLabel(day))}</span>
                ${casual.length ? `<span class="running-week-cell-dot"></span>` : ""}

            </button>
        `);
    }

    container.innerHTML = `<div class="running-week-grid">${cells.join("")}</div>`;
}

/* ==========================================
   Month view
========================================== */

function renderMonthView() {
    const container = document.getElementById("runningMonthView");
    const label = document.getElementById("runningRangeLabel");

    if (!container) {
        return;
    }

    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();

    if (currentView === "month" && label) {
        label.textContent = monthAnchor.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric"
        });
    }

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = isoDate(new Date());

    const cells = [];

    for (let i = 0; i < startOffset; i++) {
        cells.push(`<div class="running-month-cell empty"></div>`);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateStr = isoDate(date);
        const day = marathonDayForDate(dateStr);
        const casual = getEntriesForDate(dateStr);
        const isToday = dateStr === todayStr;
        const isSelected = dateStr === selectedDate;

        cells.push(`
            <button
                type="button"
                class="running-month-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${day ? "in-plan" : ""}"
                data-cal-date="${dateStr}">

                <span class="running-month-cell-num">${d}</span>
                ${day ? `<span class="running-month-cell-glyph">${cellGlyph(dateStr, day)}</span>` : ""}
                ${day ? `<span class="running-month-cell-label">${escapeHtml(cellLabel(day))}</span>` : ""}
                ${casual.length ? `<span class="running-week-cell-dot"></span>` : ""}

            </button>
        `);
    }

    container.innerHTML = `
        <div class="running-month-grid-header">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span>
            <span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
        <div class="running-month-grid">${cells.join("")}</div>
    `;
}

/* ==========================================
   List view — agenda style, 2 weeks back to
   2 weeks ahead of today
========================================== */

function renderListView() {
    const container = document.getElementById("runningListView");
    const label = document.getElementById("runningRangeLabel");

    if (!container) {
        return;
    }

    if (currentView === "list" && label) {
        label.textContent = "Last 14 days → next 14 days";
    }

    const rows = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let offset = -14; offset <= 14; offset++) {
        const date = new Date(today);
        date.setDate(date.getDate() + offset);

        const dateStr = isoDate(date);
        const day = marathonDayForDate(dateStr);
        const casual = getEntriesForDate(dateStr);

        if (!day && !casual.length) {
            continue;
        }

        const isToday = offset === 0;

        rows.push(`
            <button
                type="button"
                class="running-list-row ${isToday ? "today" : ""} ${dateStr === selectedDate ? "selected" : ""}"
                data-cal-date="${dateStr}">

                <span class="running-list-row-date">
                    ${date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </span>

                <span class="running-list-row-main">
                    ${day ? `<strong>${escapeHtml(cellLabel(day))}</strong> <span>${escapeHtml(day.session || "")}</span> ${cellGlyph(dateStr, day)}` : ""}
                    ${casual.map(c => `<span class="running-list-row-casual">+ ${c.miles.toFixed(1)} mi ${escapeHtml(c.type || "")}</span>`).join("")}
                </span>

            </button>
        `);
    }

    container.innerHTML = rows.length
        ? rows.join("")
        : `<div class="running-list-empty">Nothing in this window.</div>`;
}

/* ==========================================
   Day detail panel
========================================== */

function renderDayDetail(dateStr) {
    selectedDate = dateStr;

    const el = document.getElementById("runningDayDetail");

    if (!el) {
        return;
    }

    const day = marathonDayForDate(dateStr);
    const casual = getEntriesForDate(dateStr);
    const date = new Date(dateStr + "T00:00:00");
    const label = date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
    });

    const completed = day ? isCompleted(day.week, day.dayKey) : false;
    const range = day ? resolvePaceRange(day.pace) : null;

    const planBlock = day ? `
        <div class="running-detail-plan">

            <div class="running-detail-plan-label">Marathon Plan</div>

            <div class="running-detail-plan-main" id="runningDetailPlanView">
                <div class="running-detail-plan-line">
                    ${day.miles || 0} mi${day.session ? " @ " + escapeHtml(day.session) : ""}
                </div>
                ${range ? `
                    <div class="running-detail-plan-target">
                        Target: <span class="running-mono">${escapeHtml(range)}</span>
                    </div>
                ` : ""}
            </div>

            <div class="running-detail-plan-actions">
                <button type="button" class="running-row-btn" data-edit-plan-day="${dateStr}">
                    Edit
                </button>
                <button type="button" class="running-row-btn ${completed ? "primary" : ""}" data-toggle-complete="${dateStr}">
                    ${completed ? `${icon("check")} Completed` : "Mark Complete"}
                </button>
            </div>

        </div>
    ` : `
        <div class="running-detail-plan running-detail-rest">
            ${showsPersonalPlan() ? "No marathon workout scheduled — rest day, or outside the training block." : "Nothing planned from the marathon block for this day."}
        </div>
    `;

    const casualBlock = casual.length ? `
        <div class="running-detail-casual">
            ${casual.map(c => `
                <div class="running-detail-casual-row">
                    <strong>${c.miles.toFixed(1)} mi</strong>
                    <span>${escapeHtml(c.type || "Run")}${c.source === "coros" ? " · COROS" : ""}</span>
                    <button type="button" class="running-row-btn" data-edit-log-entry="${c.id}">Edit</button>
                </div>
            `).join("")}
        </div>
    ` : "";

    el.innerHTML = `
        <div class="running-detail-header">
            <span>${escapeHtml(label)}</span>
            <button type="button" class="running-row-btn primary" data-add-run-for="${dateStr}">
                + Add Run
            </button>
        </div>
        ${planBlock}
        ${casualBlock}
    `;
}

function renderPlanEditForm(dateStr, day) {
    const view = document.getElementById("runningDetailPlanView");

    if (!view) {
        return;
    }

    view.innerHTML = `
        <label class="running-field-label">Miles</label>
        <input type="number" id="runningEditMiles" class="running-input" value="${day.miles || 0}" min="0" step="0.1">

        <label class="running-field-label">Session</label>
        <input type="text" id="runningEditSession" class="running-input" value="${escapeHtml(day.session || "")}">

        <div class="running-modal-actions">
            <button type="button" class="running-btn-outline" data-cancel-plan-edit="${dateStr}">Cancel</button>
            <button type="button" class="running-row-btn primary" data-save-plan-edit="${dateStr}">Save</button>
        </div>
    `;
}

/* ==========================================
   Summary sections
========================================== */

function renderThisWeek() {
    const el = document.getElementById("runningThisWeek");

    if (!el) {
        return;
    }

    if (!showsPersonalPlan()) {
        // Miles actually logged Monday-Sunday this week.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY_MS);
        let logged = 0;
        let runs = 0;
        for (let i = 0; i < 7; i++) {
            const entries = getEntriesForDate(isoDate(new Date(monday.getTime() + i * DAY_MS)));
            entries.forEach(entry => { logged += Number(entry.miles) || 0; runs += 1; });
        }
        el.innerHTML = `
            <div class="running-summary-stat">
                <span class="running-summary-value">${logged.toFixed(1)} mi</span>
                <span class="running-summary-meta">${runs} run${runs === 1 ? "" : "s"} logged this week</span>
            </div>
        `;
        return;
    }

    try {
        const week = getCurrentWeek();
        const days = getAdjustedWeekDays(week);

        let planned = 0;
        let completedMiles = 0;

        days.forEach((day, i) => {
            const miles = Number(day.miles) || 0;
            planned += miles;

            if (isCompleted(week, DAYS[i])) {
                completedMiles += miles;
            }
        });

        const pct = planned ? Math.round((completedMiles / planned) * 100) : 0;

        el.innerHTML = `
            <div class="running-summary-stat">
                <span class="running-summary-value">${completedMiles.toFixed(1)} / ${planned.toFixed(1)} mi</span>
                <span class="running-summary-meta">${pct}% of this week done</span>
            </div>
        `;
    } catch {
        el.innerHTML = `<div class="running-summary-empty">Unavailable</div>`;
    }
}

function renderUpcoming() {
    const el = document.getElementById("runningUpcoming");

    if (!el) {
        return;
    }

    let upcoming = [];

    try {
        if (showsPersonalPlan()) {
            upcoming = getUpcomingWorkouts().slice(0, 4);
        } else {
            const tomorrow = new Date();
            tomorrow.setHours(0, 0, 0, 0);
            tomorrow.setTime(tomorrow.getTime() + DAY_MS);
            upcoming = ownPlanEntries(tomorrow, 21).slice(0, 4).map(e => ({
                date: `${e.date}T00:00:00`,
                miles: Number(e.entry.miles || e.entry.distance) || 0,
                session: e.entry.session || (e.entry.type === "strength" ? "Strength" : e.programName)
            }));
        }
    } catch {
        upcoming = [];
    }

    if (!upcoming.length) {
        el.innerHTML = `<div class="running-summary-empty">Nothing upcoming.</div>`;
        return;
    }

    el.innerHTML = upcoming.map(w => `
        <div class="running-summary-row">
            <span>${new Date(w.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            <span>${w.miles ? w.miles + " mi" : "Rest"}${w.session ? " · " + escapeHtml(w.session) : ""}</span>
        </div>
    `).join("");
}

function renderRecentRuns() {
    const el = document.getElementById("runningRecentRuns");

    if (!el) {
        return;
    }

    const recentLog = getRecentEntries(5).map(e => ({
        date: e.date,
        label: `${e.miles.toFixed(1)} mi · ${e.type || "Run"}`
    }));

    if (!recentLog.length) {
        el.innerHTML = `<div class="running-summary-empty">No runs logged yet.</div>`;
        return;
    }

    el.innerHTML = recentLog.map(r => `
        <div class="running-summary-row">
            <span>${new Date(r.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            <span>${escapeHtml(r.label)}</span>
        </div>
    `).join("");
}

/* ==========================================
   View switching + master render
========================================== */

function setView(view) {
    currentView = view;

    document.querySelectorAll("[data-running-view]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.runningView === view);
    });

    document.querySelectorAll(".running-view").forEach(panel => {
        panel.classList.remove("active");
    });

    const target = document.getElementById(
        view === "week" ? "runningWeekView" :
        view === "month" ? "runningMonthView" :
        "runningListView"
    );

    target?.classList.add("active");

    renderAll();
}

function renderAll() {
    renderPlanContext();

    if (currentView === "week") renderWeekView();
    if (currentView === "month") renderMonthView();
    if (currentView === "list") renderListView();

    renderThisWeek();
    renderUpcoming();
    renderRecentRuns();
}

/* ==========================================
   Event wiring
========================================== */

document.addEventListener("click", event => {
    const target = event.target;

    const viewBtn = target.closest("[data-running-view]");

    if (viewBtn) {
        setView(viewBtn.dataset.runningView);
        return;
    }

    if (target.matches("#runningPrev")) {
        if (currentView === "week") {
            weekAnchor.setDate(weekAnchor.getDate() - 7);
            renderWeekView();
        } else if (currentView === "month") {
            monthAnchor.setMonth(monthAnchor.getMonth() - 1);
            renderMonthView();
        } else {
            renderListView();
        }
        return;
    }

    if (target.matches("#runningNext")) {
        if (currentView === "week") {
            weekAnchor.setDate(weekAnchor.getDate() + 7);
            renderWeekView();
        } else if (currentView === "month") {
            monthAnchor.setMonth(monthAnchor.getMonth() + 1);
            renderMonthView();
        } else {
            renderListView();
        }
        return;
    }

    if (target.matches("#runningToday")) {
        weekAnchor = new Date();
        monthAnchor = new Date();
        monthAnchor.setDate(1);

        if (currentView === "week") renderWeekView();
        if (currentView === "month") renderMonthView();
        if (currentView === "list") renderListView();
        return;
    }

    const cell = target.closest("[data-cal-date]");

    if (cell) {
        renderDayDetail(cell.dataset.calDate);
        return;
    }

    if (target.matches("[data-add-run-for]")) {
        window.dispatchEvent(new CustomEvent(
            "eddieos:running-add-run-for-date",
            { detail: { date: target.dataset.addRunFor } }
        ));
        return;
    }

    const toggleCompleteBtn = target.closest("[data-toggle-complete]");

    if (toggleCompleteBtn) {
        const day = marathonDayForDate(toggleCompleteBtn.dataset.toggleComplete);

        if (day) {
            toggleCompleted(day.week, day.dayKey);
            renderDayDetail(toggleCompleteBtn.dataset.toggleComplete);

            if (currentView === "week") renderWeekView();
            if (currentView === "month") renderMonthView();
            if (currentView === "list") renderListView();

            renderThisWeek();
        }
        return;
    }

    if (target.matches("[data-edit-plan-day]")) {
        const dateStr = target.dataset.editPlanDay;
        const day = marathonDayForDate(dateStr);

        if (day) {
            renderPlanEditForm(dateStr, day);
        }
        return;
    }

    if (target.matches("[data-cancel-plan-edit]")) {
        renderDayDetail(target.dataset.cancelPlanEdit);
        return;
    }

    if (target.matches("[data-save-plan-edit]")) {
        const dateStr = target.dataset.savePlanEdit;
        const day = marathonDayForDate(dateStr);

        if (day) {
            const miles = Number(document.getElementById("runningEditMiles")?.value) || 0;
            const session = document.getElementById("runningEditSession")?.value || "";

            saveDayEdit(day.week, day.dayKey, { miles, session });
            renderDayDetail(dateStr);

            if (currentView === "week") renderWeekView();
            if (currentView === "month") renderMonthView();
            if (currentView === "list") renderListView();

            renderThisWeek();
            renderUpcoming();
        }
        return;
    }
});

window.addEventListener("eddieos:running-log-changed", () => {
    renderAll();

    if (selectedDate) {
        renderDayDetail(selectedDate);
    }
});

/* ==========================================
   Init
========================================== */

renderAll();
