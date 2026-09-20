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
                <button type="button" data-adjust="duration" data-delta="-5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">−5s</button>
                <input
                    type="number"
                    class="strength-workout-input"
                    data-field="duration"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.duration}">
                <button type="button" data-adjust="duration" data-delta="5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">+5s</button>
            </div>
        `
        : `
            <div class="strength-workout-adjust">
                <button type="button" data-adjust="weight" data-delta="-5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">−5</button>
                <button type="button" data-adjust="weight" data-delta="-2.5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">−2.5</button>
                <input
                    type="number"
                    class="strength-workout-input"
                    data-field="weight"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.weight}">
                <button type="button" data-adjust="weight" data-delta="2.5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">+2.5</button>
                <button type="button" data-adjust="weight" data-delta="5" data-set-id="${set.id}" data-exercise-id="${exercise.id}">+5</button>
            </div>

            <div class="strength-workout-adjust strength-workout-adjust-reps">
                <button type="button" data-adjust="reps" data-delta="-1" data-set-id="${set.id}" data-exercise-id="${exercise.id}">−1</button>
                <input
                    type="number"
                    class="strength-workout-input strength-workout-input-small"
                    data-field="reps"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.reps}">
                <button type="button" data-adjust="reps" data-delta="1" data-set-id="${set.id}" data-exercise-id="${exercise.id}">+1</button>
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
                ✓
            </button>

            <button
                type="button"
                class="strength-workout-remove-set"
                data-remove-workout-set="${set.id}"
                data-exercise-id="${exercise.id}"
                title="Remove set">
                ×
            </button>

        </div>
    `;
}

function formatPreviousSets(entry, isTime) {
    return entry.sets
        .map(s => isTime ? `${s.duration}s` : `${s.weight}×${s.reps}`)
        .join(", ");
}

function renderExerciseBlock(exercise) {
    const isTime = exercise.mode === "time";
    const previous = getPreviousPerformance(exercise);

    return `
        <div
            class="strength-workout-exercise"
            data-workout-exercise="${exercise.id}">

            <div class="strength-workout-exercise-header">

                <div class="strength-workout-exercise-title">
                    <strong>${escapeHtml(exercise.name)}</strong>
                    <span class="strength-workout-prev">
                        ${previous
                            ? "Last time: " + escapeHtml(formatPreviousSets(previous, isTime))
                            : "No previous session logged yet"}
                    </span>
                </div>

                <div class="strength-workout-exercise-actions">
                    <button
                        type="button"
                        class="strength-row-btn"
                        data-swap-exercise="${exercise.id}">
                        Swap
                    </button>
                    <button
                        type="button"
                        class="strength-row-btn"
                        data-remove-workout-exercise="${exercise.id}">
                        Remove
                    </button>
                </div>

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
                    + Add Set
                </button>

                ${!isTime ? `
                    <button
                        type="button"
                        class="strength-row-btn"
                        data-toggle-plates="${exercise.id}">
                        Plates
                    </button>
                ` : ""}

                <input
                    type="text"
                    class="strength-workout-notes"
                    data-workout-notes="${exercise.id}"
                    placeholder="Notes (felt strong, knee twinge, etc.)"
                    value="${escapeHtml(exercise.notes || "")}">

            </div>

            <div
                class="strength-plate-calc"
                id="plateCalc-${exercise.id}"
                style="display:none"></div>

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

    body.innerHTML = day.exercises
        .map(renderExerciseBlock)
        .join("");
}

/* ==========================================
   Open / close
========================================== */

function openWorkoutMode(dayId) {
    activeDayId = dayId;

    const overlay = $("strengthWorkoutOverlay");

    if (!overlay) {
        return;
    }

    overlay.classList.add("open");
    renderBody();
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

function meaningfulSetsFor(exercise) {
    return (exercise.sets || []).filter(set =>
        exercise.mode === "time"
            ? Number(set.duration) > 0
            : Number(set.weight) > 0 || Number(set.reps) > 0
    );
}

function formatSetLine(set, isTime) {
    if (isTime) {
        const seconds = Number(set.duration) || 0;
        return seconds >= 60 ? formatElapsed(seconds * 1000) : `${seconds} sec`;
    }

    const weight = Number(set.weight) || 0;
    const reps = Number(set.reps) || 0;

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
            const label = group.groupType === "circuit" ? "Circuit" : "Superset";

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

    if (target.matches("[data-toggle-workout-set]")) {
        updatePlan(day => {
            const exercise = findExercise(day, target.dataset.exerciseId);
            const set = exercise && findSet(exercise, target.dataset.toggleWorkoutSet);

            if (set) {
                set.done = !set.done;
                target.classList.toggle("checked", set.done);
                target.closest(".strength-workout-set-row")
                    ?.classList.toggle("done", set.done);
            }
        });
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
