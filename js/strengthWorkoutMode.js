/* ==========================================
   EddieOS Strength — Workout Mode

   A condensed, gym-friendly view of a single
   day, separate from the full plan Editor.
   Still fully editable (weight, reps, duration,
   swapping exercises) but stripped of the
   library/scheduling chrome that makes sense
   when building a plan at a desk, not mid-set
   at the gym.
========================================== */

import {
    getPreviousPerformance,
    logExercise
} from "./strengthHistory.js";

const PLAN_KEY = "strength-plan";
const BAR_WEIGHT = 45;
const PLATE_SIZES = [45, 35, 25, 10, 5, 2.5];

let activeDayId = null;
let timerStartedAt = null;
let timerInterval = null;
let swappingExerciseId = null;
let lastSwapResults = {};
let swapDebounceTimer = null;
let expandedExerciseIds = new Set();

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ==========================================
   Icons -- small inline SVGs instead of plain
   ASCII symbols (×, ✓, −, +), so Workout Mode
   doesn't look like it's using leftover text
   characters for its controls.
========================================== */

const ICONS = {
    chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    swap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>`,
    scale: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5 3 12l3.5 5.5M17.5 6.5 21 12l-3.5 5.5"></path><line x1="6.5" y1="6.5" x2="17.5" y2="6.5"></line><line x1="12" y1="6.5" x2="12" y2="19"></line><line x1="8" y1="19" x2="16" y2="19"></line></svg>`
};

function icon(name, extraClass = "") {
    return `<span class="strength-workout-icon ${extraClass}">${ICONS[name] || ""}</span>`;
}

/* ==========================================
   Plan access (reads/writes the same
   strength-plan data the Editor uses)
========================================== */

function loadPlan() {
    try {
        const raw = localStorage.getItem(PLAN_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && Array.isArray(parsed.days)
            ? parsed
            : { days: [] };
    } catch {
        return { days: [] };
    }
}

function savePlan(plan) {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function getActiveDay() {
    const plan = loadPlan();
    return plan.days.find(d => d.id === activeDayId) || null;
}

function dayExists(dayId) {
    return loadPlan().days.some(d => d.id === dayId);
}

function updatePlan(mutator) {
    const plan = loadPlan();
    const day = plan.days.find(d => d.id === activeDayId);

    if (!day) {
        return;
    }

    mutator(day);
    savePlan(plan);
}

function findExercise(day, exerciseId) {
    return day.exercises.find(ex => ex.id === exerciseId);
}

function findSet(exercise, setId) {
    return exercise.sets.find(s => s.id === setId);
}

/* ==========================================
   Timer
========================================== */

function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
}

function startTimer() {
    timerStartedAt = Date.now();
    clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        const el = $("workoutModeTimer");

        if (el) {
            el.textContent = formatElapsed(Date.now() - timerStartedAt);
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

/* ==========================================
   Plate calculator
========================================== */

function calculatePlates(targetWeight) {
    let perSide = Math.max(0, (Number(targetWeight) - BAR_WEIGHT) / 2);
    const plates = [];

    for (const size of PLATE_SIZES) {
        while (perSide >= size - 0.01) {
            plates.push(size);
            perSide -= size;
        }
    }

    return plates;
}

function renderPlateCalc(weight) {
    const numWeight = Number(weight) || 0;

    if (numWeight <= BAR_WEIGHT) {
        return `
            <div class="strength-plate-result">
                Just the bar (${BAR_WEIGHT} lb) or lighter — no plates needed.
            </div>
        `;
    }

    const perSide = (numWeight - BAR_WEIGHT) / 2;
    const plates = calculatePlates(numWeight);

    return `
        <div class="strength-plate-result">
            <strong>${perSide.toFixed(1)} lb per side</strong>
            <div class="strength-plate-chips">
                ${plates.map(p => `<span class="strength-plate-chip">${p}</span>`).join("")}
            </div>
        </div>
    `;
}

/* ==========================================
   Rendering
========================================== */

function renderSetRow(exercise, set, index) {
    const isTime = exercise.mode === "time";

    const numberControls = isTime
        ? `
            <div class="strength-workout-adjust">
                <button type="button" data-adjust="duration" data-delta="-5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">${icon("minus")}</button>
                <input
                    type="number"
                    class="strength-workout-input"
                    data-field="duration"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.duration}">
                <button type="button" data-adjust="duration" data-delta="5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">${icon("plus")}</button>
            </div>
        `
        : `
            <div class="strength-workout-adjust">
                <button type="button" data-adjust="weight" data-delta="-5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">${icon("minus")}</button>
                <input
                    type="number"
                    class="strength-workout-input"
                    data-field="weight"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.weight}">
                <button type="button" data-adjust="weight" data-delta="5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">${icon("plus")}</button>
            </div>

            <div class="strength-workout-adjust strength-workout-adjust-reps">
                <button type="button" data-adjust="reps" data-delta="-1" data-set-id="${set.id}" data-exercise-id="${exercise.id}">${icon("minus")}</button>
                <input
                    type="number"
                    class="strength-workout-input strength-workout-input-small"
                    data-field="reps"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.reps}">
                <button type="button" data-adjust="reps" data-delta="1" data-set-id="${set.id}" data-exercise-id="${exercise.id}">${icon("plus")}</button>
            </div>
        `;

    return `
        <div
            class="strength-workout-set-row ${set.done ? "done" : ""}"
            data-set-row="${set.id}">

            <span class="strength-workout-set-index">${index + 1}</span>

            ${numberControls}

            <button
                type="button"
                class="strength-workout-done-btn ${set.done ? "checked" : ""}"
                data-toggle-workout-set="${set.id}"
                data-exercise-id="${exercise.id}"
                title="Mark set complete">
                ${icon("check")}
            </button>

            <button
                type="button"
                class="strength-workout-remove-set"
                data-remove-workout-set="${set.id}"
                data-exercise-id="${exercise.id}"
                title="Remove set">
                ${icon("close")}
            </button>

        </div>
    `;
}

function formatPreviousSets(entry, isTime) {
    return entry.sets
        .map(s => isTime ? `${s.duration}s` : `${s.weight}×${s.reps}`)
        .join(", ");
}

// Collapsed by default -- just a name, a one-line summary of what's
// logged, and a done tally -- so a whole day's exercises fit on
// screen at once. Tapping the summary row expands it in place to
// reveal the full set editor, notes, and add-set/swap/remove.
function renderExerciseBlock(exercise) {
    const isTime = exercise.mode === "time";
    const previous = getPreviousPerformance(exercise);
    const doneCount = exercise.sets.filter(set => set.done).length;
    const totalCount = exercise.sets.length;
    const allDone = totalCount > 0 && doneCount === totalCount;
    const expanded = expandedExerciseIds.has(exercise.id);
    const currentSummary = totalCount
        ? formatPreviousSets({ sets: exercise.sets }, isTime)
        : "No sets yet";

    return `
        <div
            class="strength-workout-exercise ${allDone ? "strength-workout-exercise-complete" : ""} ${expanded ? "expanded" : ""}"
            data-workout-exercise="${exercise.id}">

            <button
                type="button"
                class="strength-workout-exercise-summary"
                data-toggle-exercise="${exercise.id}">

                <span class="strength-workout-exercise-chevron">${icon("chevron")}</span>

                <span class="strength-workout-exercise-summary-text">
                    <strong>${escapeHtml(exercise.name)}</strong>
                    <span class="strength-workout-mini-sets">${escapeHtml(currentSummary)}</span>
                </span>

                <span class="strength-workout-set-tally ${allDone ? "complete" : ""}">
                    ${allDone ? icon("check") : `${doneCount}/${totalCount}`}
                </span>

            </button>

            <div
                class="strength-workout-exercise-body"
                style="display:${expanded ? "block" : "none"}">

                <div class="strength-workout-prev">
                    ${previous
                        ? "Last time: " + escapeHtml(formatPreviousSets(previous, isTime))
                        : "No previous session logged yet"}
                </div>

                <div
                    class="strength-workout-swap-panel"
                    id="swapPanel-${exercise.id}"
                    style="display:${swappingExerciseId === exercise.id ? "block" : "none"}">

                    <input
                        type="text"
                        class="strength-workout-input strength-workout-swap-input"
                        data-swap-input="${exercise.id}"
                        placeholder="Search a replacement exercise...">

                    <div
                        class="strength-workout-swap-results"
                        id="swapResults-${exercise.id}"></div>

                    <button
                        type="button"
                        class="strength-row-btn"
                        data-cancel-swap="${exercise.id}">
                        Cancel
                    </button>

                </div>

                <div class="strength-workout-sets">
                    ${exercise.sets.map((set, i) => renderSetRow(exercise, set, i)).join("")}
                </div>

                <div class="strength-workout-exercise-footer">

                    <button
                        type="button"
                        class="strength-row-btn"
                        data-workout-add-set="${exercise.id}">
                        ${icon("plus")} Add Set
                    </button>

                    ${!isTime ? `
                        <button
                            type="button"
                            class="strength-row-btn"
                            data-toggle-plates="${exercise.id}">
                            ${icon("scale")} Plates
                        </button>
                    ` : ""}

                    <button
                        type="button"
                        class="strength-row-btn"
                        data-swap-exercise="${exercise.id}">
                        ${icon("swap")} Swap
                    </button>

                    <button
                        type="button"
                        class="strength-row-btn strength-row-btn-danger"
                        data-remove-workout-exercise="${exercise.id}">
                        ${icon("close")} Remove
                    </button>

                </div>

                <input
                    type="text"
                    class="strength-workout-notes"
                    data-workout-notes="${exercise.id}"
                    placeholder="Notes (felt strong, knee twinge, etc.)"
                    value="${escapeHtml(exercise.notes || "")}">

                <div
                    class="strength-plate-calc"
                    id="plateCalc-${exercise.id}"
                    style="display:none"></div>

            </div>

        </div>
    `;
}

function renderExercise(exercise) {
    const wrapper = document.querySelector(
        `[data-workout-exercise="${exercise.id}"]`
    );

    if (wrapper) {
        wrapper.outerHTML = renderExerciseBlock(exercise);
    }
}

function groupLabel(groupType) {
    return groupType === "circuit"
        ? "Circuit"
        : groupType === "warmup"
            ? "Warmup"
            : "Superset";
}

// Groups exercises that share a groupId (built as a superset,
// circuit, or warmup in the plan editor) into one connected card,
// so a workout done as a circuit still looks like one unit instead
// of a string of unrelated exercise cards. Each exercise inside
// renders collapsed by default (see renderExerciseBlock), so a
// whole day's worth fits on screen without much scrolling.
function renderDayBody(day) {
    const blocks = [];
    let index = 0;

    while (index < day.exercises.length) {
        const first = day.exercises[index];

        if (!first.groupId) {
            blocks.push(renderExerciseBlock(first));
            index++;
            continue;
        }

        const groupId = first.groupId;
        const groupType = first.groupType || "superset";
        const members = [];

        while (
            index < day.exercises.length &&
            day.exercises[index].groupId === groupId
        ) {
            members.push(day.exercises[index]);
            index++;
        }

        const plannedRounds = Number(day.groupRounds?.[groupId]) || null;

        blocks.push(`
            <div
                class="strength-workout-group strength-workout-group-${groupType}"
                data-workout-group="${groupId}">

                <div class="strength-workout-group-header">
                    <span class="strength-workout-group-label">
                        ${groupLabel(groupType)}
                    </span>
                    ${plannedRounds
                        ? `<span class="strength-workout-group-rounds">${plannedRounds} round${plannedRounds === 1 ? "" : "s"} planned</span>`
                        : ""}
                </div>

                ${members.map(renderExerciseBlock).join("")}

            </div>
        `);
    }

    return blocks.join("");
}

function renderBody() {
    const body = $("workoutModeBody");
    const nameEl = $("workoutModeDayName");
    const day = getActiveDay();

    if (!body || !day) {
        return;
    }

    if (nameEl) {
        nameEl.textContent = day.name;
    }

    if (!day.exercises.length) {
        body.innerHTML = `
            <div class="strength-workout-empty">
                This day has no exercises yet.
            </div>
        `;
        return;
    }

    body.innerHTML = renderDayBody(day);
}

/* ==========================================
   Open / close
========================================== */

function openWorkoutMode(dayId) {
    activeDayId = dayId;
    expandedExerciseIds = new Set();

    const overlay = $("strengthWorkoutOverlay");

    if (!overlay) {
        return;
    }

    overlay.classList.add("open");
    renderBody();
    updateProgress();
    startTimer();

    const timerEl = $("workoutModeTimer");

    if (timerEl) {
        timerEl.textContent = "0:00";
    }
}

function closeWorkoutMode() {
    const overlay = $("strengthWorkoutOverlay");

    overlay?.classList.remove("open");
    stopTimer();
    activeDayId = null;
}

// Share of exercises with at least one set checked off -- a simple,
// glanceable "how far into this workout am I" signal that doesn't
// get thrown off by exercises having different numbers of sets.
function computeProgress(day) {
    if (!day.exercises.length) {
        return 0;
    }

    const doneCount = day.exercises.filter(exercise =>
        (exercise.sets || []).some(set => set.done)
    ).length;

    return Math.round((doneCount / day.exercises.length) * 100);
}

function updateProgress() {
    const day = getActiveDay();
    const fill = $("workoutModeProgressFill");

    if (!day || !fill) {
        return;
    }

    fill.style.width = `${computeProgress(day)}%`;
}

function meaningfulSetsFor(exercise) {
    const sets = exercise.sets || [];

    const withData = sets.filter(set =>
        exercise.mode === "time"
            ? Number(set.duration) > 0
            : Number(set.weight) > 0 || Number(set.reps) > 0
    );

    if (withData.length) {
        return withData;
    }

    // Warmup drills (band circuits, mobility work) often have
    // nothing to log -- just a checkbox. Count them as done if
    // they were checked off at all, so they still show up.
    return exercise.groupType === "warmup"
        ? sets.filter(set => set.done)
        : withData;
}

function formatSetLine(set, isTime) {
    if (isTime) {
        const seconds = Number(set.duration) || 0;

        if (!seconds) {
            return "Done";
        }

        return seconds >= 60 ? formatElapsed(seconds * 1000) : `${seconds} sec`;
    }

    const weight = Number(set.weight) || 0;
    const reps = Number(set.reps) || 0;

    if (!weight && !reps) {
        return "Done";
    }

    return weight > 0 ? `${weight} lb × ${reps}` : `${reps} reps`;
}

// One completed exercise's worth of summary text -- a single clean
// line when every set was the same (bodyweight reps, a held plank),
// a bulleted breakdown when the sets differ (an ascending pyramid).
function formatExerciseBlock(exercise) {
    const isTime = exercise.mode === "time";
    const sets = meaningfulSetsFor(exercise);

    if (!sets.length) {
        return null;
    }

    const setLines = sets.map(set => formatSetLine(set, isTime));
    const allSame = setLines.every(line => line === setLines[0]);
    const notes = exercise.notes?.trim();

    if (allSame) {
        const suffix = sets.length > 1 ? ` × ${sets.length}` : "";

        return {
            text: `${exercise.name} — ${setLines[0]}${suffix}${notes ? ` (${notes})` : ""}`,
            rounds: sets.length
        };
    }

    const text = [
        exercise.name,
        ...setLines.map(line => `  - ${line}`),
        notes ? `  Note: ${notes}` : null
    ].filter(Boolean).join("\n");

    return { text, rounds: sets.length };
}

// Groups exercises that share a groupId (a superset/circuit built
// in the plan editor) into one block, in the order they appear in
// the day, so the summary reads as a unit with a shared round count
// instead of as unrelated exercises.
function groupExercisesForSummary(day) {
    const groups = [];
    const indexByGroupId = new Map();

    day.exercises.forEach(exercise => {
        if (!exercise.groupId) {
            groups.push({ solo: true, exercise });
            return;
        }

        if (indexByGroupId.has(exercise.groupId)) {
            groups[indexByGroupId.get(exercise.groupId)].exercises.push(exercise);
            return;
        }

        indexByGroupId.set(exercise.groupId, groups.length);
        groups.push({
            solo: false,
            groupType: exercise.groupType,
            exercises: [exercise]
        });
    });

    return groups;
}

function buildWorkoutSummary(day, elapsedMs) {
    const blocks = groupExercisesForSummary(day)
        .map(group => {
            if (group.solo) {
                return formatExerciseBlock(group.exercise)?.text || null;
            }

            const entries = group.exercises
                .map(formatExerciseBlock)
                .filter(Boolean);

            if (!entries.length) {
                return null;
            }

            const rounds = Math.max(...entries.map(entry => entry.rounds));
            const label = groupLabel(group.groupType);

            return [
                `${label} — ${rounds} round${rounds === 1 ? "" : "s"}`,
                ...entries.map(entry => entry.text)
            ].join("\n");
        })
        .filter(Boolean);

    if (!blocks.length) {
        return null;
    }

    return [
        `${day.name} — ${formatElapsed(elapsedMs)}`,
        ...blocks
    ].join("\n\n");
}

function openSummaryModal(text) {
    const overlay = $("strengthSummaryOverlay");
    const textarea = $("strengthSummaryText");

    if (!overlay || !textarea) {
        return;
    }

    textarea.value = text;
    overlay.classList.add("open");
}

function closeSummaryModal() {
    $("strengthSummaryOverlay")?.classList.remove("open");
}

async function copySummaryText() {
    const textarea = $("strengthSummaryText");
    const button = $("strengthSummaryCopy");

    if (!textarea) {
        return;
    }

    try {
        await navigator.clipboard.writeText(textarea.value);
    } catch {
        textarea.select();
        document.execCommand("copy");
    }

    if (button) {
        const original = button.textContent;
        button.textContent = "Copied!";
        setTimeout(() => {
            button.textContent = original;
        }, 1500);
    }
}

function finishWorkout() {
    const day = getActiveDay();
    const elapsedMs = timerStartedAt ? Date.now() - timerStartedAt : 0;
    const summary = day ? buildWorkoutSummary(day, elapsedMs) : null;

    if (day) {
        day.exercises.forEach(logExercise);
    }

    closeWorkoutMode();

    if (summary) {
        openSummaryModal(summary);
    }
}

function openSwapPanel(exerciseId) {
    swappingExerciseId = exerciseId;

    const day = getActiveDay();
    const exercise = day && findExercise(day, exerciseId);

    if (exercise) {
        renderExercise(exercise);
    }

    const input = document.querySelector(
        `[data-swap-input="${exerciseId}"]`
    );

    input?.focus();
}

function closeSwapPanel(exerciseId) {
    swappingExerciseId = null;
    lastSwapResults[exerciseId] = [];

    const day = getActiveDay();
    const exercise = day && findExercise(day, exerciseId);

    if (exercise) {
        renderExercise(exercise);
    }
}

function renderSwapResults(exerciseId, results) {
    const container = $(`swapResults-${exerciseId}`);

    if (!container) {
        return;
    }

    lastSwapResults[exerciseId] = results;

    if (!results.length) {
        container.innerHTML = `
            <div class="strength-search-empty">No matches.</div>
        `;
        return;
    }

    container.innerHTML = results.map((ex, index) => `
        <div
            class="strength-result"
            data-swap-exercise-id="${exerciseId}"
            data-swap-result-index="${index}">

            ${ex.image
                ? `<img class="strength-result-image" src="${ex.image}" alt="" loading="lazy">`
                : `<div class="strength-result-image"></div>`}

            <div class="strength-result-info">
                <strong>${escapeHtml(ex.name)}</strong>
                <span>${escapeHtml(ex.equipment)}</span>
            </div>

        </div>
    `).join("");
}

function applySwap(exerciseId, picked) {
    updatePlan(day => {
        const exercise = findExercise(day, exerciseId);

        if (!exercise) {
            return;
        }

        exercise.exerciseId = picked.id;
        exercise.name = picked.name;
        exercise.equipment = picked.equipment;
        exercise.primaryMuscles = picked.primaryMuscles;
        exercise.image = picked.image;
    });

    swappingExerciseId = null;
    lastSwapResults[exerciseId] = [];
    renderBody();
}

/* ==========================================
   Event wiring
========================================== */

window.addEventListener(
    "eddieos:strength-start-workout",
    event => {
        const dayId = event.detail?.dayId;

        if (dayId) {
            openWorkoutMode(dayId);
        }
    }
);

// Lets a link from elsewhere (the dashboard's "Start Workout" card
// for a scheduled session) open straight into Workout Mode instead
// of just landing on the Strength page.
(function openFromUrlParam() {
    const url = new URL(window.location.href);
    const dayId = url.searchParams.get("startWorkout");

    if (!dayId) {
        return;
    }

    url.searchParams.delete("startWorkout");
    history.replaceState({}, "", url.toString());

    if (dayExists(dayId)) {
        openWorkoutMode(dayId);
    }
})();

document.addEventListener("click", event => {
    const target = event.target;

    if (!target.closest("#strengthWorkoutOverlay")) {
        return;
    }

    if (target.matches("#workoutModeClose") || target.matches("#strengthWorkoutOverlay")) {
        closeWorkoutMode();
        return;
    }

    if (target.matches("#workoutModeFinish")) {
        finishWorkout();
        return;
    }

    if (target.closest("[data-toggle-exercise]")) {
        const exerciseId = target.closest("[data-toggle-exercise]").dataset.toggleExercise;

        if (expandedExerciseIds.has(exerciseId)) {
            expandedExerciseIds.delete(exerciseId);
        } else {
            expandedExerciseIds.add(exerciseId);
        }

        const day = getActiveDay();
        const exercise = day && findExercise(day, exerciseId);

        if (exercise) {
            renderExercise(exercise);
        }

        return;
    }

    if (target.matches("[data-toggle-workout-set]")) {
        updatePlan(day => {
            const exercise = findExercise(day, target.dataset.exerciseId);
            const set = exercise && findSet(exercise, target.dataset.toggleWorkoutSet);

            if (set) {
                set.done = !set.done;
                renderExercise(exercise);
            }
        });
        updateProgress();
        return;
    }

    if (target.matches("[data-remove-workout-set]")) {
        updatePlan(day => {
            const exercise = findExercise(day, target.dataset.exerciseId);

            if (exercise) {
                exercise.sets = exercise.sets.filter(
                    s => s.id !== target.dataset.removeWorkoutSet
                );
                renderExercise(exercise);
            }
        });
        updateProgress();
        return;
    }

    if (target.matches("[data-workout-add-set]")) {
        updatePlan(day => {
            const exercise = findExercise(day, target.dataset.workoutAddSet);

            if (exercise) {
                const last = exercise.sets[exercise.sets.length - 1];

                exercise.sets.push({
                    id: crypto.randomUUID(),
                    weight: last?.weight || 0,
                    reps: last?.reps || 8,
                    duration: last?.duration || 30,
                    done: false,
                    rpe: "",
                    type: "working"
                });

                renderExercise(exercise);
            }
        });
        return;
    }

    if (target.matches("[data-remove-workout-exercise]")) {
        updatePlan(day => {
            day.exercises = day.exercises.filter(
                ex => ex.id !== target.dataset.removeWorkoutExercise
            );
        });
        renderBody();
        updateProgress();
        return;
    }

    if (target.matches("[data-swap-exercise]")) {
        openSwapPanel(target.dataset.swapExercise);
        return;
    }

    if (target.matches("[data-cancel-swap]")) {
        closeSwapPanel(target.dataset.cancelSwap);
        return;
    }

    const swapResult = target.closest("[data-swap-result-index]");

    if (swapResult) {
        const exerciseId = swapResult.dataset.swapExerciseId;
        const index = Number(swapResult.dataset.swapResultIndex);
        const picked = (lastSwapResults[exerciseId] || [])[index];

        if (picked) {
            applySwap(exerciseId, picked);
        }
        return;
    }

    if (target.matches("[data-toggle-plates]")) {
        const exerciseId = target.dataset.togglePlates;
        const panel = $(`plateCalc-${exerciseId}`);

        if (!panel) {
            return;
        }

        const isOpen = panel.style.display !== "none";

        if (isOpen) {
            panel.style.display = "none";
            return;
        }

        const day = getActiveDay();
        const exercise = day && findExercise(day, exerciseId);
        const firstSet = exercise?.sets?.[0];

        panel.innerHTML = renderPlateCalc(firstSet?.weight || 0);
        panel.style.display = "block";
        return;
    }

    const adjustBtn = target.closest("[data-adjust]");

    if (adjustBtn) {
        const field = adjustBtn.dataset.adjust;
        const delta = Number(adjustBtn.dataset.delta);
        const setId = adjustBtn.dataset.setId;
        const exerciseId = adjustBtn.dataset.exerciseId;

        updatePlan(day => {
            const exercise = findExercise(day, exerciseId);
            const set = exercise && findSet(exercise, setId);

            if (!set) {
                return;
            }

            set[field] = Math.max(0, (Number(set[field]) || 0) + delta);

            const input = document.querySelector(
                `.strength-workout-input[data-field="${field}"][data-set-id="${setId}"]`
            );

            if (input) {
                input.value = set[field];
            }

            const platePanel = $(`plateCalc-${exerciseId}`);

            if (field === "weight" && platePanel && platePanel.style.display !== "none") {
                platePanel.innerHTML = renderPlateCalc(set.weight);
            }
        });
    }
});

document.addEventListener("input", event => {
    const target = event.target;

    if (!target.closest("#strengthWorkoutOverlay")) {
        return;
    }

    if (target.matches(".strength-workout-input")) {
        const field = target.dataset.field;
        const setId = target.dataset.setId;
        const exerciseId = target.dataset.exerciseId;

        updatePlan(day => {
            const exercise = findExercise(day, exerciseId);
            const set = exercise && findSet(exercise, setId);

            if (set) {
                set[field] = Number(target.value) || 0;
            }
        });
        return;
    }

    if (target.matches("[data-workout-notes]")) {
        const exerciseId = target.dataset.workoutNotes;

        updatePlan(day => {
            const exercise = findExercise(day, exerciseId);

            if (exercise) {
                exercise.notes = target.value;
            }
        });
        return;
    }

    if (target.matches("[data-swap-input]")) {
        const exerciseId = target.dataset.swapInput;
        const query = target.value;

        clearTimeout(swapDebounceTimer);

        const container = $(`swapResults-${exerciseId}`);

        if (!query.trim()) {
            if (container) container.innerHTML = "";
            return;
        }

        if (container) {
            container.innerHTML = `
                <div class="strength-search-loading">Searching…</div>
            `;
        }

        swapDebounceTimer = setTimeout(() => {
            import("./exerciseSearch.js").then(({ searchExercises }) => {
                searchExercises(query).then(results => {
                    renderSwapResults(exerciseId, results);
                });
            });
        }, 350);
    }
});

document.addEventListener("click", event => {
    const target = event.target;

    if (!target.closest("#strengthSummaryOverlay")) {
        return;
    }

    if (target.matches("#strengthSummaryDone") || target.matches("#strengthSummaryOverlay")) {
        closeSummaryModal();
        return;
    }

    if (target.matches("#strengthSummaryCopy")) {
        copySummaryText();
    }
});
