/* ==========================================
   EddieOS Marathon Controller
   Dynamic per-day training hub

   The Marathon day is the source of truth for:
   - Workout
   - Fueling link
   - Strength
   - Cross Training link
   - Mobility
   - Recovery
   - Notes

   Uses the existing localStorage keys only:
   - training-progress
   - training-overrides
   - fueling-plans
========================================== */

import {
    WEEKS,
    PHASES,
    PACES,
    DAYS,
    DAY_TIMES,
    weekStart,
    weekEnd,
    weekRange,
    getAdjustedWeekMileage,
    getAdjustedWeekDays,
    loadProgress,
    loadOverrides
} from "./marathonData.js";

console.log("EddieOS Marathon — dynamic day hub");

/* ==========================================
   State
========================================== */
let progress = loadProgress();
let overrides = loadOverrides();
let selectedWeek = 1;
const expandedDays = {};

/* ==========================================
   DOM helpers
========================================== */
const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}

function escapeAttr(value) {
    return escapeHTML(value).replace(/'/g, "&#39;");
}

/* ==========================================
   Robust data formatting

   Existing EddieOS data can contain strings,
   arrays, or objects. Never render an object
   directly; that is what causes [object Object].
========================================== */
function formatValue(value) {
    if (value == null) return "";

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value.map(formatValue).filter(Boolean).join(" — ");
    }

    if (typeof value === "object") {
        const preferredKeys = [
            "title", "name", "exercise", "label", "type", "activity",
            "workout", "description", "duration", "time", "intensity",
            "pace", "sets", "reps", "distance", "minutes", "details", "note"
        ];

        const parts = [];
        const seen = new Set();

        for (const key of preferredKeys) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const text = formatValue(value[key]);
                if (text && !seen.has(text)) {
                    parts.push(text);
                    seen.add(text);
                }
            }
        }

        if (parts.length) return parts.join(" — ");

        const fallback = Object.entries(value)
            .filter(([key]) => key !== "id")
            .map(([key, val]) => {
                const text = formatValue(val);
                return text ? `${key}: ${text}` : "";
            })
            .filter(Boolean);

        return fallback.join(" — ");
    }

    return String(value);
}

function asArray(value) {
    if (value == null || value === "") return [];
    return Array.isArray(value) ? value : [value];
}

function getExtras(day) {
    const legacy = day && day.extras && typeof day.extras === "object" ? day.extras : {};

    return {
        strength: asArray(day?.strength ?? legacy.strength),
        crossTraining: asArray(day?.crossTraining ?? legacy.crossTraining),
        mobility: asArray(day?.mobility ?? legacy.mobility),
        recovery: asArray(day?.recovery ?? legacy.recovery),
        notes: formatValue(day?.notes ?? legacy.notes ?? "")
    };
}

function hasExtraContent(day, week, dayKey) {
    const ex = getExtras(day);
    return Boolean(
        ex.strength.length ||
        ex.crossTraining.length ||
        ex.mobility.length ||
        ex.recovery.length ||
        ex.notes.trim() ||
        getFuelingPlan(week, dayKey)
    );
}

/* ==========================================
   Persistence
========================================== */
function saveProgress() {
    localStorage.setItem("training-progress", JSON.stringify(progress));
    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch((error) => console.warn("Cloud progress sync unavailable:", error));
}

function saveOverrides() {
    localStorage.setItem("training-overrides", JSON.stringify(overrides));
    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch((error) => console.warn("Cloud override sync unavailable:", error));
}

/* ==========================================
   Fueling integration
========================================== */
function loadFuelingPlans() {
    try {
        const raw = localStorage.getItem("fueling-plans");
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Unable to read fueling-plans:", error);
        return [];
    }
}

function getFuelingPlan(week, dayKey) {
    return loadFuelingPlans().find((plan) =>
        plan &&
        plan.marathonRef &&
        Number(plan.marathonRef.week) === Number(week) &&
        plan.marathonRef.dayKey === dayKey
    ) || null;
}

function fuelingSummary(plan) {
    if (!plan) return "";

    const parts = [];
    const carbs = plan.carbTotal ?? plan.carbsPerHour ?? plan.carbTarget;
    const fluid = plan.fluidTotal ?? plan.fluidPerHour ?? plan.fluidTarget;
    const sodium = plan.sodiumTotal ?? plan.sodiumPerHour ?? plan.sodiumTarget;

    if (carbs !== undefined && carbs !== "") parts.push(`Carbs ${formatValue(carbs)} g`);
    if (fluid !== undefined && fluid !== "") parts.push(`Fluid ${formatValue(fluid)}`);
    if (sodium !== undefined && sodium !== "") parts.push(`Sodium ${formatValue(sodium)} mg`);

    return parts.join(" • ");
}

function getFuelingHref(week, dayKey) {
    return `fueling.html?week=${encodeURIComponent(week)}&day=${encodeURIComponent(dayKey)}`;
}

function getCrossTrainingHref(week, dayKey) {
    return `cross-training.html?week=${encodeURIComponent(week)}&day=${encodeURIComponent(dayKey)}`;
}

/* ==========================================
   Progress
========================================== */
function weekDone(weekNumber) {
    const weekProgress = progress[weekNumber] || {};
    return DAYS.filter((day) => Boolean(weekProgress[day])).length;
}

function totalCompleted() {
    let count = 0;
    Object.values(progress).forEach((week) => {
        if (week && typeof week === "object") {
            count += Object.values(week).filter(Boolean).length;
        }
    });
    return count;
}

/* ==========================================
   Stats
========================================== */
function updateStats() {
    const now = new Date();
    const raceDay = weekEnd(WEEKS.length);
    const daysLeft = Math.ceil((raceDay - now) / 86400000);

    const countdown = $("mp-countdown");
    if (countdown) {
        countdown.textContent = daysLeft >= 0 ? `${daysLeft} days to race day` : "Race complete!";
    }

    let currentWeek = 1;
    for (let n = 1; n <= WEEKS.length; n++) {
        if (now >= weekStart(n) && now <= weekEnd(n)) currentWeek = n;
    }
    if (now > weekEnd(WEEKS.length)) currentWeek = WEEKS.length;
    if (now < weekStart(1)) currentWeek = 1;

    const weekDisplay = $("mp-stat-week");
    if (weekDisplay) weekDisplay.textContent = `${currentWeek} / ${WEEKS.length}`;

    const totalMiles = WEEKS.reduce(
        (total, _, index) => total + Number(getAdjustedWeekMileage(index + 1, overrides) || 0),
        0
    );

    const totalDisplay = $("mp-stat-total");
    if (totalDisplay) totalDisplay.textContent = Math.round(totalMiles);

    const peakDisplay = $("mp-stat-peak");
    if (peakDisplay) {
        const peak = Math.max(
            ...WEEKS.map((_, index) => Number(getAdjustedWeekMileage(index + 1, overrides) || 0))
        );
        peakDisplay.textContent = Math.round(peak);
    }

    const percentDisplay = $("mp-stat-pct");
    if (percentDisplay) {
        percentDisplay.textContent = `${Math.round((totalCompleted() / (WEEKS.length * DAYS.length)) * 100)}%`;
    }
}

/* ==========================================
   Week navigation
========================================== */
function renderWeekList() {
    const container = $("mp-weeklist");
    if (!container) return;

    container.innerHTML = "";

    for (let n = 1; n <= WEEKS.length; n++) {
        const chip = document.createElement("div");
        const completed = weekDone(n);

        chip.className = `mp-wchip${n === selectedWeek ? " active" : ""}${completed === 7 ? " done" : ""}`;
        chip.innerHTML = `<span class="mp-dot"></span>Wk ${n}`;
        chip.addEventListener("click", () => {
            selectedWeek = n;
            renderDetail();
            renderWeekList();
        });

        container.appendChild(chip);
    }
}

/* ==========================================
   Day override helpers
========================================== */
function ensureDayOverride(dayKey) {
    if (!overrides[selectedWeek] || typeof overrides[selectedWeek] !== "object") {
        overrides[selectedWeek] = {};
    }
    if (!overrides[selectedWeek][dayKey] || typeof overrides[selectedWeek][dayKey] !== "object") {
        overrides[selectedWeek][dayKey] = {};
    }
    return overrides[selectedWeek][dayKey];
}

function setDayField(dayKey, field, value) {
    const entry = ensureDayOverride(dayKey);
    entry[field] = value;
    saveOverrides();
}

function getCurrentDay(dayIndex) {
    const days = getAdjustedWeekDays(selectedWeek, overrides);
    return days[dayIndex] || {};
}

function addExtra(dayKey, field, input) {
    const value = input.value.trim();
    if (!value) return;

    const dayOverride = ensureDayOverride(dayKey);
    const current = asArray(dayOverride[field]);
    current.push(value);
    dayOverride[field] = current;

    input.value = "";
    saveOverrides();
    renderDetail();
}

function removeExtra(dayKey, field, index) {
    const dayOverride = ensureDayOverride(dayKey);
    const current = asArray(dayOverride[field]).slice();

    if (index < 0 || index >= current.length) return;
    current.splice(index, 1);

    dayOverride[field] = current;
    saveOverrides();
    renderDetail();
}

function saveNotes(dayKey, textarea) {
    setDayField(dayKey, "notes", textarea.value.trim());
    renderDetail();
}

/* ==========================================
   Dynamic extra section renderer
========================================== */
function renderEditableList({ week, dayKey, field, label, icon, items, placeholder }) {
    const itemHTML = items.length
        ? items.map((item, index) => `
            <div class="mp-extra-item mp-extra-editable-item">
                <span>${escapeHTML(formatValue(item))}</span>
                <button
                    type="button"
                    class="mp-extra-remove"
                    data-remove-extra="true"
                    data-week="${week}"
                    data-day="${escapeAttr(dayKey)}"
                    data-field="${field}"
                    data-index="${index}"
                    title="Remove">
                    ×
                </button>
            </div>
        `).join("")
        : `<div class="mp-extra-empty">Nothing added yet.</div>`;

    return `
        <div class="mp-extra-group mp-extra-editor-group">
            <div class="mp-extra-title">${icon} ${label}</div>
            <div class="mp-extra-items">
                ${itemHTML}
            </div>
            <div class="mp-extra-add-row">
                <input
                    type="text"
                    class="mp-extra-input"
                    data-extra-input="true"
                    data-week="${week}"
                    data-day="${escapeAttr(dayKey)}"
                    data-field="${field}"
                    placeholder="${escapeAttr(placeholder)}"
                    autocomplete="off">
                <button
                    type="button"
                    class="mp-extra-add"
                    data-add-extra="true"
                    data-week="${week}"
                    data-day="${escapeAttr(dayKey)}"
                    data-field="${field}">
                    + Add
                </button>
            </div>
        </div>
    `;
}

function renderDayExtras(day, week, dayKey) {
    const ex = getExtras(day);
    const plan = getFuelingPlan(week, dayKey);

    const fuelingHTML = plan
        ? `
            <div class="mp-extra-group">
                <div class="mp-extra-title">⛽ Fueling</div>
                <div class="mp-extra-item">
                    <div>
                        <strong>Fueling Plan Saved ✓</strong>
                        ${fuelingSummary(plan) ? `<div style="margin-top:5px;opacity:.85">${escapeHTML(fuelingSummary(plan))}</div>` : ""}
                    </div>
                    <a
                        class="mp-extra-link"
                        href="${getFuelingHref(week, dayKey)}">
                        Edit →
                    </a>
                </div>
            </div>
        `
        : `
            <div class="mp-extra-group">
                <div class="mp-extra-title">⛽ Fueling</div>
                <div class="mp-extra-item">
                    <span>No fueling plan saved.</span>
                    <a
                        class="mp-extra-link"
                        href="${getFuelingHref(week, dayKey)}">
                        Build one →
                    </a>
                </div>
            </div>
        `;

    const crossTrainingHTML = ex.crossTraining.length
        ? `
            <div class="mp-extra-group">
                <div class="mp-extra-title">🚴 Cross Training</div>
                ${ex.crossTraining.map((item, index) => `
                    <div class="mp-extra-item mp-extra-editable-item">
                        <span>${escapeHTML(formatValue(item))}</span>
                        <button type="button" class="mp-extra-remove" data-remove-extra="true" data-week="${week}" data-day="${escapeAttr(dayKey)}" data-field="crossTraining" data-index="${index}" title="Remove">×</button>
                    </div>
                `).join("")}
                <div class="mp-extra-actions">
                    <a class="mp-extra-link" href="${getCrossTrainingHref(week, dayKey)}">Edit Cross Training →</a>
                </div>
            </div>
        `
        : `
            <div class="mp-extra-group">
                <div class="mp-extra-title">🚴 Cross Training</div>
                <div class="mp-extra-item">
                    <span>No cross training saved.</span>
                    <a class="mp-extra-link" href="${getCrossTrainingHref(week, dayKey)}">Add workout →</a>
                </div>
            </div>
        `;

    const notesHTML = `
        <div class="mp-extra-group">
            <div class="mp-extra-title">📝 Notes</div>
            <textarea
                class="mp-extra-notes"
                data-notes-input="true"
                data-week="${week}"
                data-day="${escapeAttr(dayKey)}"
                placeholder="Add anything specific about this workout...">${escapeHTML(ex.notes)}</textarea>
            <div class="mp-extra-actions">
                <button
                    type="button"
                    class="mp-extra-save-notes"
                    data-save-notes="true"
                    data-week="${week}"
                    data-day="${escapeAttr(dayKey)}">
                    Save Notes
                </button>
            </div>
        </div>
    `;

    return `
        <div class="mp-extra-grid">
            ${fuelingHTML}
            ${renderEditableList({ week, dayKey, field: "strength", label: "Strength", icon: "💪", items: ex.strength, placeholder: "e.g. RDL — 3 × 8" })}
            ${crossTrainingHTML}
            ${renderEditableList({ week, dayKey, field: "mobility", label: "Mobility", icon: "🧘", items: ex.mobility, placeholder: "e.g. Hip flexor stretch — 2 × 30 sec" })}
            ${renderEditableList({ week, dayKey, field: "recovery", label: "Recovery", icon: "❤️", items: ex.recovery, placeholder: "e.g. 10 min easy stretching" })}
            ${notesHTML}
        </div>
    `;
}

/* ==========================================
   Week detail
========================================== */
function renderDetail() {
    const container = $("mp-detail");
    if (!container) return;

    const week = WEEKS[selectedWeek - 1];
    if (!week) return;

    const days = getAdjustedWeekDays(selectedWeek, overrides);
    const mileage = Number(getAdjustedWeekMileage(selectedWeek, overrides) || 0);
    const phaseInfo = PHASES[week.phase] || { label: "Training", color: "#4EA8FF" };

    const rows = days.map((day, index) => {
        const dayKey = DAYS[index];
        const completed = Boolean(progress[selectedWeek] && progress[selectedWeek][dayKey]);
        const expandedKey = `${selectedWeek}-${dayKey}`;
        const expanded = Boolean(expandedDays[expandedKey]);
        const hasContent = hasExtraContent(day, selectedWeek, dayKey);

        return `
            <div class="mp-day-wrapper">
                <div
                    class="mp-day-row ${completed ? "mp-day-done" : ""}"
                    data-expand-day="${escapeAttr(dayKey)}"
                    data-expand-key="${escapeAttr(expandedKey)}">

                    <div class="mp-check ${completed ? "checked" : ""}" data-toggle="${escapeAttr(dayKey)}">
                        ${completed ? "✓" : ""}
                    </div>

                    <div class="mp-day-abbr">${dayKey}</div>

                    <input
                        class="mp-day-session-input"
                        data-day="${escapeAttr(dayKey)}"
                        data-field="session"
                        value="${escapeAttr(formatValue(day.session))}"
                        spellcheck="false">

                    <div class="mp-mile-box">
                        <input
                            type="number"
                            step="0.1"
                            min="0"
                            class="mp-day-miles-input"
                            data-day="${escapeAttr(dayKey)}"
                            data-field="miles"
                            value="${escapeAttr(day.miles)}">
                        mi
                    </div>

                    <div class="mp-pace-chip">${escapeHTML(formatValue(day.pace))}</div>

                    <div class="mp-day-timing">${escapeHTML(DAY_TIMES[index] || "")}</div>

                    <button
                        type="button"
                        class="mp-day-expand-toggle ${hasContent ? "mp-has-notes" : ""} ${expanded ? "mp-expand-open" : ""}"
                        data-expand-day-button="true"
                        data-week="${selectedWeek}"
                        data-day="${escapeAttr(dayKey)}"
                        aria-expanded="${expanded ? "true" : "false"}"
                        title="Open day details">
                        ${expanded ? "▲" : "▼"}
                    </button>
                </div>

                <div class="mp-day-extras ${expanded ? "mp-day-extras-open" : ""}" data-day-extras="true" data-week="${selectedWeek}" data-day="${escapeAttr(dayKey)}">
                    ${expanded ? renderDayExtras(day, selectedWeek, dayKey) : ""}
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div class="mp-detail-head">
            <div>
                <span
                    class="mp-phase-pill"
                    style="background:${phaseInfo.color}22;color:${phaseInfo.color}">
                    ${escapeHTML(phaseInfo.label)}
                </span>
                <h2 class="mp-week-title">Week ${selectedWeek}</h2>
                <div class="mp-week-dates">${escapeHTML(weekRange(selectedWeek))}</div>
            </div>

            <div class="mp-week-progress">
                <div class="mp-week-miles">${mileage} mi</div>
                <div>${weekDone(selectedWeek)}/7 completed</div>
            </div>
        </div>

        <div class="mp-days">${rows}</div>

        <div class="mp-mental">"${escapeHTML(week.mental || "")}"</div>

        <div class="mp-notes-grid">
            <div class="mp-note-card">
                <div class="mp-note-label">Purpose</div>
                <div class="mp-note-body">${escapeHTML(week.purpose || "")}</div>
            </div>
            <div class="mp-note-card">
                <div class="mp-note-label">Fueling</div>
                <div class="mp-note-body">${escapeHTML(week.fueling || "")}</div>
            </div>
            <div class="mp-note-card">
                <div class="mp-note-label">Heat / humidity</div>
                <div class="mp-note-body">${escapeHTML(week.heat || "")}</div>
            </div>
            <div class="mp-note-card">
                <div class="mp-note-label">Strength phase</div>
                <div class="mp-note-body">${escapeHTML(week.strength || "")}</div>
            </div>
        </div>

        <button type="button" class="mp-drawer-toggle" id="mp-pace-toggle">Pace reference ▼</button>
        <button type="button" class="mp-drawer-toggle" id="mp-reset-week-btn">Reset this week's edits</button>
        <button type="button" class="mp-reset-btn" id="mp-reset-btn">Reset all progress</button>
        <div class="mp-drawer" id="mp-pace-drawer">
            <table class="mp-pace-table">
                ${PACES.map((p) => `<tr><td>${escapeHTML(p[0])}</td><td class="mp-mono">${escapeHTML(p[1])}</td></tr>`).join("")}
            </table>
        </div>
    `;

    attachDetailEvents();
}

/* ==========================================
   Events — delegated so dynamic controls
   always keep working after a re-render.
========================================== */
function attachDetailEvents() {
    const container = $("mp-detail");
    if (!container || container.dataset.eventsBound === "true") return;

    container.dataset.eventsBound = "true";

    container.addEventListener("click", (event) => {
        const target = event.target;

        const check = target.closest("[data-toggle]");
        if (check) {
            event.stopPropagation();
            const dayKey = check.getAttribute("data-toggle");

            if (!progress[selectedWeek]) progress[selectedWeek] = {};
            progress[selectedWeek][dayKey] = !progress[selectedWeek][dayKey];

            saveProgress();
            renderDetail();
            renderWeekList();
            updateStats();
            return;
        }

        const expandButton = target.closest("[data-expand-day-button]");
        if (expandButton) {
            event.stopPropagation();
            const dayKey = expandButton.getAttribute("data-day");
            const key = `${selectedWeek}-${dayKey}`;
            expandedDays[key] = !expandedDays[key];
            renderDetail();
            return;
        }

        const dayRow = target.closest("[data-expand-day]");
        if (dayRow && !target.closest("input, textarea, button, a, .mp-check")) {
            const dayKey = dayRow.getAttribute("data-expand-day");
            const key = `${selectedWeek}-${dayKey}`;
            expandedDays[key] = !expandedDays[key];
            renderDetail();
            return;
        }

        const addButton = target.closest("[data-add-extra]");
        if (addButton) {
            const dayKey = addButton.getAttribute("data-day");
            const field = addButton.getAttribute("data-field");
            const input = container.querySelector(`input[data-extra-input="true"][data-day="${CSS.escape(dayKey)}"][data-field="${CSS.escape(field)}"]`);
            if (input) addExtra(dayKey, field, input);
            return;
        }

        const removeButton = target.closest("[data-remove-extra]");
        if (removeButton) {
            const dayKey = removeButton.getAttribute("data-day");
            const field = removeButton.getAttribute("data-field");
            const index = Number(removeButton.getAttribute("data-index"));
            removeExtra(dayKey, field, index);
            return;
        }

        const saveNotesButton = target.closest("[data-save-notes]");
        if (saveNotesButton) {
            const dayKey = saveNotesButton.getAttribute("data-day");
            const textarea = container.querySelector(`textarea[data-notes-input="true"][data-day="${CSS.escape(dayKey)}"]`);
            if (textarea) saveNotes(dayKey, textarea);
            return;
        }

        if (target.closest("#mp-pace-toggle")) {
            $("mp-pace-drawer")?.classList.toggle("open");
            return;
        }

        if (target.closest("#mp-reset-week-btn")) {
            if (overrides[selectedWeek] && confirm("Reset this week's mileage/workout edits back to the default plan?")) {
                delete overrides[selectedWeek];
                saveOverrides();
                renderDetail();
                renderChart();
                updateStats();
            }
            return;
        }

        if (target.closest("#mp-reset-btn")) {
            if (confirm("Reset all logged progress? This can't be undone.")) {
                progress = {};
                saveProgress();
                renderDetail();
                renderWeekList();
                renderChart();
                updateStats();
            }
        }
    });

    container.addEventListener("keydown", (event) => {
        const input = event.target;
        if (input.matches("[data-extra-input]")) {
            if (event.key === "Enter") {
                event.preventDefault();
                const button = container.querySelector(
                    `[data-add-extra="true"][data-day="${CSS.escape(input.getAttribute("data-day"))}"][data-field="${CSS.escape(input.getAttribute("data-field"))}"]`
                );
                button?.click();
            }
        }
    });

    container.addEventListener("change", (event) => {
        const input = event.target;

        if (input.matches(".mp-day-session-input, .mp-day-miles-input")) {
            const dayKey = input.getAttribute("data-day");
            const field = input.getAttribute("data-field");
            let value = input.value;

            if (field === "miles") {
                value = Number(value);
                if (Number.isNaN(value) || value < 0) value = 0;
            } else {
                value = value.trim();
            }

            setDayField(dayKey, field, value);
            renderDetail();
            renderChart();
            updateStats();
        }
    });
}

/* ==========================================
   Chart
========================================== */
function renderChart() {
    const svg = $("mp-chart-svg");
    if (!svg) return;

    const width = 900;
    const height = 120;
    const milesList = WEEKS.map((_, index) => Number(getAdjustedWeekMileage(index + 1, overrides) || 0));
    const maxMiles = Math.max(1, ...milesList);

    const html = WEEKS.map((week, index) => {
        const weekNumber = index + 1;
        const miles = milesList[index];
        const barHeight = (miles / maxMiles) * 80;
        const x = 40 + index * 52;
        const y = 100 - barHeight;
        const color = (PHASES[week.phase] || {}).color || "#4EA8FF";

        return `
            <g class="mp-bar" data-week="${weekNumber}" style="cursor:pointer">
                <rect x="${x}" y="${y}" width="35" height="${barHeight}" rx="4" fill="${color}"></rect>
                <text x="${x + 17}" y="115" text-anchor="middle" font-size="10">${weekNumber}</text>
            </g>
        `;
    }).join("");

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = html;

    svg.querySelectorAll(".mp-bar").forEach((bar) => {
        bar.addEventListener("click", () => {
            selectedWeek = Number(bar.dataset.week);
            renderDetail();
            renderWeekList();
        });
    });
}

/* ==========================================
   Initialization
========================================== */
function determineCurrentWeek() {
    const now = new Date();
    for (let n = 1; n <= WEEKS.length; n++) {
        if (now >= weekStart(n) && now <= weekEnd(n)) return n;
    }
    if (now > weekEnd(WEEKS.length)) return WEEKS.length;
    return 1;
}

function refreshFromStorage() {
    progress = loadProgress();
    overrides = loadOverrides();
    renderWeekList();
    renderChart();
    renderDetail();
    updateStats();
}

function init() {
    selectedWeek = determineCurrentWeek();
    refreshFromStorage();
}

// Render immediately from localStorage so the Marathon page is usable
// even if Firebase authentication/cloud pull is slow.
init();

// Then hydrate with the cloud copy, using the site's existing sync system.
import("./cloudSync.js")
    .then(({ initCloudSync }) => initCloudSync())
    .then(() => {
        refreshFromStorage();
    })
    .catch((error) => {
        console.warn("Cloud sync initialization skipped:", error);
    });
