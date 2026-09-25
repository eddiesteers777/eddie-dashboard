/* ==========================================
   Southbound Running — Generated Plan Calendar Adapter

   Phase 3 keeps the existing Marathon calendar engine intact.
   This adapter reads active generated plans from running-programs
   and layers them into the existing calendar/day-detail/summary DOM.
   No Marathon data is migrated or duplicated.
========================================== */

import {
    getActiveRunningPrograms,
    getActiveProgramEntriesForDate,
    getActiveProgramWeekStats,
    getActiveProgramUpcomingRuns,
    toggleRunningProgramDayCompleted
} from "./activeProgramSources.js";

let selectedDate = null;
let observer = null;
let refreshScheduled = false;
let temporarilyPaused = false;

function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getActivePrograms() {
    return getActiveRunningPrograms();
}

function formatMiles(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function getWeekBounds(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const offset = start.getDay() === 0 ? -6 : 1 - start.getDay();
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
}

function renderContext() {
    const context = document.getElementById("runningPlanContext");
    if (!context) return;

    const today = isoDate(new Date());
    // Start/end from the plan's own days when it has no race date (coach
    // plans built week by week, training plans).
    const bounds = program => {
        const dates = (program.generatedPlan?.weeks || []).flatMap(w => (w.days || []).map(d => d.date)).filter(Boolean).sort();
        return {
            start: program.generatedPlan?.trainingStartDate || dates[0],
            end: program.generatedPlan?.raceDate || dates[dates.length - 1]
        };
    };
    const programs = getActivePrograms().filter(program => {
        const { start, end } = bounds(program);
        return start && end && today >= start && today <= end;
    });

    if (!programs.length) return;

    if (programs.length === 1) {
        const program = programs[0];
        const isRacePlan = program.source !== "training-plan" && Boolean(program.generatedPlan?.raceDate);
        const weeks = program.generatedPlan?.weeks || [];
        const activeWeek = weeks.find(week =>
            (week.days || []).some(day => day.date === today)
            || (week.startDate <= today && week.endDate >= today)
        );
        let countdown = "";
        if (isRacePlan) {
            const race = new Date(`${program.generatedPlan.raceDate}T00:00:00`);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const daysToRace = Math.round((race - now) / 86400000);
            countdown = daysToRace >= 0 ? ` — ${daysToRace} days to race day` : "";
        }
        context.textContent = `${program.name} — Week ${activeWeek?.week || "—"} of ${program.generatedPlan.totalWeeks || weeks.length}${activeWeek?.phase ? ` — ${activeWeek.phase}` : ""}${countdown}`;
        context.dataset.generatedPlanContext = program.id;
        return;
    }

    const allTraining = programs.every(program => program.source === "training-plan");
    const allRace = programs.every(program => program.source !== "training-plan");
    context.textContent = allTraining
        ? `${programs.length} active training plans`
        : allRace
            ? `${programs.length} active race plans`
            : `${programs.length} active training programs`;
    context.dataset.generatedPlanContext = "multiple";
}

function activeEntries(dateStr) {
    return getActiveProgramEntriesForDate(dateStr);
}

function renderWeekCells() {
    document.querySelectorAll("#runningWeekView [data-cal-date]").forEach(cell => {
        const dateStr = cell.dataset.calDate;
        const entries = activeEntries(dateStr);
        if (!entries.length) return;

        let marker = cell.querySelector(".running-generated-plan-mark");
        if (!marker) {
            marker = document.createElement("span");
            marker.className = "running-generated-plan-mark";
            cell.appendChild(marker);
        }

        const runs = entries.filter(item => Number(item.entry.miles) > 0);
        const support = entries.filter(item => Number(item.entry.miles) === 0);
        // A "double" day (e.g. an easy run plus a lift session, which
        // Training Plans schedule on purpose) has both a run and a
        // support entry -- show both instead of silently dropping one.
        const parts = [];
        if (runs.length) parts.push(`${formatMiles(runs[0].entry.miles)} mi`);
        if (support.length) parts.push(support[0].entry.type === "strength" ? "Strength" : (support[0].entry.session || "Plan"));
        marker.textContent = parts.length ? parts.join(" + ") : "Plan";
        marker.title = entries.map(item => `${item.programName}: ${item.entry.session || item.entry.type}`).join("\n");

        cell.dataset.generatedPlanApplied = dateStr;
    });
}

function renderMonthCells() {
    document.querySelectorAll("#runningMonthView [data-cal-date]").forEach(cell => {
        const dateStr = cell.dataset.calDate;
        const entries = activeEntries(dateStr);
        if (!entries.length) return;

        let label = cell.querySelector(".running-generated-plan-source");
        if (!label) {
            label = document.createElement("span");
            label.className = "running-generated-plan-source";
            cell.appendChild(label);
        }

        const run = entries.find(item => Number(item.entry.miles) > 0);
        label.textContent = run ? `${formatMiles(run.entry.miles)} mi` : "Plan";
    });
}

function renderListRows() {
    document.querySelectorAll("#runningListView [data-cal-date]").forEach(row => {
        const dateStr = row.dataset.calDate;
        const entries = activeEntries(dateStr);
        if (!entries.length) return;

        let block = row.querySelector(".running-program-list-block");
        if (!block) {
            block = document.createElement("span");
            block.className = "running-program-list-block";
            block.style.display = "flex";
            block.style.flexDirection = "column";
            block.style.gap = "2px";
            row.querySelector(".running-list-row-main")?.appendChild(block);
        }

        block.innerHTML = entries.map(item => {
            const miles = Number(item.entry.miles) || 0;
            return `<span class="running-program-calendar-item"><strong>${miles ? `${formatMiles(miles)} mi` : ""}</strong><span>${escapeHtml(item.entry.session || item.entry.type || "Planned")}</span></span>`;
        }).join("");
    });
}

function renderDayDetail() {
    const panel = document.getElementById("runningDayDetail");
    if (!panel || !selectedDate) return;

    panel.querySelectorAll(".running-generated-day-detail, .running-generated-support-block").forEach(node => node.remove());

    const entries = activeEntries(selectedDate);
    if (!entries.length) return;

    const runs = entries.filter(item => Number(item.entry.miles) > 0);
    const support = entries.filter(item => Number(item.entry.miles) === 0);

    const runHtml = runs.map(item => {
        const complete = Boolean(item.entry.completed);
        return `<div class="running-generated-day-detail" data-generated-plan-id="${escapeHtml(item.programId)}" data-generated-plan-date="${escapeHtml(selectedDate)}">
            <div class="running-generated-day-detail-header">
                <span class="running-generated-day-detail-label">${escapeHtml(item.programName)} · Week ${item.week}</span>
                <button type="button" class="running-row-btn ${complete ? "primary" : ""} running-generated-complete-btn" data-toggle-generated-complete="${escapeHtml(item.programId)}" data-generated-date="${escapeHtml(selectedDate)}">
                    ${complete ? "✓ Completed" : "Mark Complete"}
                </button>
            </div>
            <div class="running-detail-plan-line"><strong>${formatMiles(item.entry.miles)} mi</strong> · ${escapeHtml(item.entry.session || "Planned Run")}</div>
            <div class="running-generated-day-detail-meta">${escapeHtml(item.phase || "")} · Planned race-plan workout</div>
        </div>`;
    }).join("");

    const supportHtml = support.length ? `<div class="running-generated-day-detail running-generated-support-block">
        <div class="running-generated-day-detail-label">Training support</div>
        ${support.map(item => `<div class="running-generated-day-detail-meta"><strong>${escapeHtml(item.entry.session || item.entry.type || "Support")}</strong> · ${escapeHtml(item.programName)}</div>`).join("")}
    </div>` : "";

    panel.insertAdjacentHTML("beforeend", runHtml + supportHtml);
}

function renderThisWeek() {
    const el = document.getElementById("runningThisWeek");
    if (!el) return;

    const { start, end } = getWeekBounds();
    const summaries = getActiveProgramWeekStats(isoDate(start), isoDate(end));
    if (!summaries.length) return;

    let block = el.querySelector(".running-generated-week-summary");
    if (!block) {
        block = document.createElement("div");
        block.className = "running-generated-week-summary";
        block.style.marginTop = "10px";
        el.appendChild(block);
    }

    block.innerHTML = summaries.map(summary => `
        <div class="running-summary-row">
            <span>${escapeHtml(summary.programName)}</span>
            <span>${summary.completed.toFixed(1)} / ${summary.planned.toFixed(1)} mi · ${summary.percent}%</span>
        </div>
    `).join("");
}

function renderUpcoming() {
    const el = document.getElementById("runningUpcoming");
    if (!el) return;

    const today = isoDate(new Date());
    const upcoming = getActiveProgramUpcomingRuns(today, 14).slice(0, 4);
    if (!upcoming.length) return;

    let block = el.querySelector(".running-generated-upcoming");
    if (!block) {
        block = document.createElement("div");
        block.className = "running-generated-upcoming";
        el.appendChild(block);
    }

    block.innerHTML = upcoming.map(item => `
        <div class="running-summary-row">
            <span>${new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            <span>${formatMiles(item.miles)} mi · ${escapeHtml(item.session || item.type || "Run")}</span>
        </div>
    `).join("");
}

function applyAll() {
    if (temporarilyPaused) return;
    if (observer) observer.disconnect();
    try {
        renderContext();
        renderWeekCells();
        renderMonthCells();
        renderListRows();
        renderDayDetail();
        renderThisWeek();
        renderUpcoming();
    } finally {
        if (observer) {
            [
                document.getElementById("runningWeekView"),
                document.getElementById("runningMonthView"),
                document.getElementById("runningListView"),
                document.getElementById("runningDayDetail"),
                document.getElementById("runningThisWeek"),
                document.getElementById("runningUpcoming")
            ].filter(Boolean).forEach(target => observer.observe(target, { childList: true, subtree: true }));
        }
    }
}

function scheduleRefresh() {
    if (refreshScheduled) return;
    refreshScheduled = true;
    setTimeout(() => {
        refreshScheduled = false;
        applyAll();
    }, 0);
}

function setupObserver() {
    const targets = [
        document.getElementById("runningWeekView"),
        document.getElementById("runningMonthView"),
        document.getElementById("runningListView"),
        document.getElementById("runningDayDetail"),
        document.getElementById("runningThisWeek"),
        document.getElementById("runningUpcoming")
    ].filter(Boolean);

    observer = new MutationObserver(() => scheduleRefresh());
    targets.forEach(target => observer.observe(target, { childList: true, subtree: true }));
}

document.addEventListener("click", event => {
    const target = event.target;
    const calendarCell = target.closest("[data-cal-date]");
    if (calendarCell) {
        selectedDate = calendarCell.dataset.calDate;
        scheduleRefresh();
        return;
    }

    const toggle = target.closest("[data-toggle-generated-complete]");
    if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        temporarilyPaused = true;
        toggleRunningProgramDayCompleted(toggle.dataset.toggleGeneratedComplete, toggle.dataset.generatedDate)
            .then(() => {
                temporarilyPaused = false;
                scheduleRefresh();
            })
            .catch(() => {
                temporarilyPaused = false;
                scheduleRefresh();
            });
    }
});

function focusCalendarOnDate(dateStr) {
    if (!dateStr) return;

    const weekButton = document.querySelector('[data-running-view="week"]');
    weekButton?.click();

    const target = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(target.getTime())) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMonday = new Date(today);
    todayMonday.setDate(today.getDate() + (today.getDay() === 0 ? -6 : 1 - today.getDay()));
    const targetMonday = new Date(target);
    targetMonday.setDate(target.getDate() + (target.getDay() === 0 ? -6 : 1 - target.getDay()));
    const diffWeeks = Math.round((targetMonday - todayMonday) / (7 * 86400000));
    const buttonId = diffWeeks >= 0 ? "runningNext" : "runningPrev";
    const navButton = document.getElementById(buttonId);

    for (let i = 0; i < Math.abs(diffWeeks); i += 1) {
        navButton?.click();
    }

    selectedDate = dateStr;
    const selectedCell = [...document.querySelectorAll("#runningWeekView [data-cal-date]")]
        .find(cell => cell.dataset.calDate === dateStr);
    selectedCell?.click();
}

window.addEventListener("eddieos:running-program-added", event => {
    if (event.detail?.status !== "active") {
        scheduleRefresh();
        return;
    }
    const dateStr = event.detail?.startDate;
    if (dateStr) {
        focusCalendarOnDate(dateStr);
    }
    scheduleRefresh();
});

window.addEventListener("eddieos:running-programs-changed", () => scheduleRefresh());

setupObserver();
applyAll();
