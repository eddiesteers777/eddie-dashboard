/* ==========================================
   EddieOS Strength
========================================== */

import {
    getCurrentWeek,
    getWeek,
    CROSS_TRAINING
} from "./marathonData.js";

import { searchExercises } from "./exerciseSearch.js";

const STORAGE_KEY = "strength-plan";

let plan = { days: [], activeDay: null };
let searchDebounceTimer = null;
let lastSearchResults = [];

function uid() {
    return crypto.randomUUID();
}

/* ==========================================
   Persistence
========================================== */

function loadPlan() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;

        if (saved && Array.isArray(saved.days)) {
            plan = saved;
        }
    } catch (error) {
        console.error("Strength: could not read saved plan", error);
    }

    if (!plan.activeDay && plan.days.length) {
        plan.activeDay = plan.days[0].id;
    }
}

function savePlan() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

/* ==========================================
   Week context (pulled from the marathon plan's
   own strength-phase guidance -- this is real
   guidance already written for the training plan,
   not generic copy)
========================================== */

function renderWeekContext() {
    const el = document.getElementById("strengthWeekContext");

    if (!el) {
        return;
    }

    try {
        const weekNumber = getCurrentWeek();
        const week = getWeek(weekNumber);

        el.textContent = week?.strength
            ? `Week ${weekNumber}: ${week.strength}`
            : "Build a lifting day below, whenever you're ready for it.";
    } catch {
        el.textContent = "Build a lifting day below, whenever you're ready for it.";
    }
}

/* ==========================================
   Volume stat
========================================== */

function renderVolume() {
    const el = document.getElementById("strengthVolumeValue");

    if (!el) {
        return;
    }

    let total = 0;

    plan.days.forEach(day => {
        day.exercises.forEach(ex => {
            ex.sets.forEach(set => {
                total += (Number(set.weight) || 0) * (Number(set.reps) || 0);
            });
        });
    });

    el.textContent = total.toLocaleString();
}

/* ==========================================
   Day tabs
========================================== */

function renderDayTabs() {
    const container = document.getElementById("strengthDayTabs");
    const emptyState = document.getElementById("strengthEmptyState");
    const dayContent = document.getElementById("strengthDayContent");

    if (!container) {
        return;
    }

    if (!plan.days.length) {
        container.innerHTML = "";
        emptyState?.classList.add("visible");
        dayContent.innerHTML = "";
        return;
    }

    emptyState?.classList.remove("visible");

    container.innerHTML = plan.days.map(day => `
        <div
            class="strength-day-tab ${day.id === plan.activeDay ? "active" : ""}"
            data-day-id="${day.id}"
            title="Double-click to rename">
            <span>${escapeHtml(day.name)}</span>
            <button
                type="button"
                class="strength-day-tab-remove"
                data-remove-day="${day.id}"
                title="Delete day">
                ×
            </button>
        </div>
    `).join("");
}

/* ==========================================
   Day content (exercises + set tables)
========================================== */

function renderDayContent() {
    const container = document.getElementById("strengthDayContent");

    if (!container) {
        return;
    }

    const day = plan.days.find(d => d.id === plan.activeDay);

    if (!day) {
        container.innerHTML = "";
        return;
    }

    const blocks = day.exercises.map(exercise => `
        <div class="strength-exercise-block" data-exercise-id="${exercise.id}">

            <div class="strength-exercise-header">

                ${exercise.image
                    ? `<img class="strength-exercise-image" src="${exercise.image}" alt="" loading="lazy">`
                    : `<div class="strength-exercise-image"></div>`}

                <div class="strength-exercise-info">
                    <div class="strength-exercise-name">${escapeHtml(exercise.name)}</div>
                    <div class="strength-exercise-tags">
                        ${escapeHtml(exercise.equipment || "")}${exercise.primaryMuscles?.length ? " · " + escapeHtml(exercise.primaryMuscles.join(", ")) : ""}
                    </div>
                </div>

                <button
                    type="button"
                    class="strength-exercise-remove"
                    data-remove-exercise="${exercise.id}"
                    title="Remove exercise">
                    ×
                </button>

            </div>

            <table class="strength-set-table">
                <thead>
                    <tr>
                        <th>Set</th>
                        <th>Weight</th>
                        <th>Reps</th>
                        <th></th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${exercise.sets.map((set, index) => `
                        <tr data-set-id="${set.id}">
                            <td class="strength-set-index">${index + 1}</td>
                            <td>
                                <input
                                    type="number"
                                    class="strength-set-input"
                                    data-field="weight"
                                    data-exercise-id="${exercise.id}"
                                    data-set-id="${set.id}"
                                    value="${set.weight}"
                                    min="0"
                                    step="5">
                                <span class="strength-set-unit">lb</span>
                            </td>
                            <td>
                                <input
                                    type="number"
                                    class="strength-set-input"
                                    data-field="reps"
                                    data-exercise-id="${exercise.id}"
                                    data-set-id="${set.id}"
                                    value="${set.reps}"
                                    min="0"
                                    step="1">
                            </td>
                            <td>
                                <button
                                    type="button"
                                    class="strength-set-done ${set.done ? "checked" : ""}"
                                    data-toggle-set="${set.id}"
                                    data-exercise-id="${exercise.id}"
                                    title="Mark set complete">
                                    ✓
                                </button>
                            </td>
                            <td>
                                <button
                                    type="button"
                                    class="strength-set-remove"
                                    data-remove-set="${set.id}"
                                    data-exercise-id="${exercise.id}"
                                    title="Remove set">
                                    ×
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>

            <button
                type="button"
                class="strength-add-set-btn"
                data-add-set="${exercise.id}">
                + Add Set
            </button>

        </div>
    `).join("");

    container.innerHTML = blocks + `
        <button
            type="button"
            class="strength-add-exercise-btn"
            id="addExerciseTrigger">
            + Add Exercise
        </button>
    `;
}

function renderAll() {
    renderWeekContext();
    renderVolume();
    renderDayTabs();
    renderDayContent();
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
   Day management
========================================== */

function createDay(name, seedExercises = []) {
    const day = {
        id: uid(),
        name,
        exercises: seedExercises
    };

    plan.days.push(day);
    plan.activeDay = day.id;

    savePlan();
    renderAll();

    return day.id;
}

function removeDay(dayId) {
    plan.days = plan.days.filter(d => d.id !== dayId);

    if (plan.activeDay === dayId) {
        plan.activeDay = plan.days[0]?.id || null;
    }

    savePlan();
    renderAll();
}

function parseTemplateWorkout(text) {
    // Templates are written as "Exercise Name - 3 × 8".
    const match = text.match(/^(.+?)\s*-\s*(\d+)\s*×\s*(\d+)$/);

    if (!match) {
        return { name: text, sets: 3, reps: 10 };
    }

    return {
        name: match[1].trim(),
        sets: Number(match[2]),
        reps: Number(match[3])
    };
}

function seedFromTemplate(templateKey) {
    const template = CROSS_TRAINING[templateKey];

    if (!template) {
        return;
    }

    const exercises = template.workouts.map(line => {
        const parsed = parseTemplateWorkout(line);

        return {
            id: uid(),
            exerciseId: null,
            name: parsed.name,
            equipment: null,
            primaryMuscles: [],
            image: null,
            sets: Array.from({ length: parsed.sets }, () => ({
                id: uid(),
                weight: 0,
                reps: parsed.reps,
                done: false
            }))
        };
    });

    createDay(template.title, exercises);
}

/* ==========================================
   Exercise search modal
========================================== */

function openExerciseSearch() {
    const overlay = document.getElementById("exerciseSearchOverlay");
    const input = document.getElementById("exerciseSearchInput");
    const results = document.getElementById("exerciseSearchResults");

    if (!overlay) {
        return;
    }

    overlay.classList.add("open");

    if (input) {
        input.value = "";
        input.focus();
    }

    if (results) {
        results.innerHTML = "";
    }

    lastSearchResults = [];
}

function closeExerciseSearch() {
    document.getElementById("exerciseSearchOverlay")
        ?.classList.remove("open");
}

function renderSearchResults(results) {
    const container = document.getElementById("exerciseSearchResults");

    if (!container) {
        return;
    }

    lastSearchResults = results;

    if (!results.length) {
        container.innerHTML = `
            <div class="strength-search-empty">
                No matches. Try a different search.
            </div>
        `;
        return;
    }

    container.innerHTML = results.map((ex, index) => `
        <div class="strength-result" data-result-index="${index}">

            ${ex.image
                ? `<img class="strength-result-image" src="${ex.image}" alt="" loading="lazy">`
                : `<div class="strength-result-image"></div>`}

            <div class="strength-result-info">
                <strong>${escapeHtml(ex.name)}</strong>
                <span>
                    ${escapeHtml(ex.equipment)}${ex.primaryMuscles.length ? " · " + escapeHtml(ex.primaryMuscles.join(", ")) : ""}
                </span>
            </div>

        </div>
    `).join("");
}

function addExerciseToActiveDay(exercise) {
    const day = plan.days.find(d => d.id === plan.activeDay);

    if (!day) {
        return;
    }

    day.exercises.push({
        id: uid(),
        exerciseId: exercise.id,
        name: exercise.name,
        equipment: exercise.equipment,
        primaryMuscles: exercise.primaryMuscles,
        image: exercise.image,
        sets: [
            { id: uid(), weight: 0, reps: 8, done: false },
            { id: uid(), weight: 0, reps: 8, done: false },
            { id: uid(), weight: 0, reps: 8, done: false }
        ]
    });

    savePlan();
    closeExerciseSearch();
    renderDayContent();
    renderVolume();
}

/* ==========================================
   Rename day modal
========================================== */

let pendingRenameDayId = null;

function openRenameModal(dayId) {
    const day = plan.days.find(d => d.id === dayId);

    if (!day) {
        return;
    }

    pendingRenameDayId = dayId;

    const overlay = document.getElementById("renameDayOverlay");
    const input = document.getElementById("renameDayInput");

    if (input) {
        input.value = day.name;
    }

    overlay?.classList.add("open");
    input?.focus();
}

function closeRenameModal() {
    document.getElementById("renameDayOverlay")?.classList.remove("open");
    pendingRenameDayId = null;
}

function saveRename() {
    const day = plan.days.find(d => d.id === pendingRenameDayId);
    const input = document.getElementById("renameDayInput");

    if (!day || !input) {
        closeRenameModal();
        return;
    }

    const value = input.value.trim();

    if (value) {
        day.name = value;
        savePlan();
        renderDayTabs();
    }

    closeRenameModal();
}

/* ==========================================
   Event wiring
========================================== */

document.addEventListener("click", e => {

    /* Select a day tab */
    const tabEl = e.target.closest(".strength-day-tab");
    if (tabEl && !e.target.matches(".strength-day-tab-remove")) {
        plan.activeDay = tabEl.dataset.dayId;
        savePlan();
        renderDayTabs();
        renderDayContent();
        return;
    }

    /* Double-click-free rename: tap the day name text specifically */
    if (e.target.closest(".strength-day-tab span") && e.detail === 2) {
        const id = e.target.closest(".strength-day-tab").dataset.dayId;
        openRenameModal(id);
        return;
    }

    /* Remove a day */
    if (e.target.matches(".strength-day-tab-remove")) {
        removeDay(e.target.dataset.removeDay);
        return;
    }

    /* New day (bar button or empty-state button) */
    if (e.target.matches("#addDayBtn") || e.target.matches("#emptyStateNewDayBtn")) {
        const newId = createDay(`Day ${plan.days.length + 1}`);
        openRenameModal(newId);
        return;
    }

    /* Template quick-start */
    const templateBtn = e.target.closest(".strength-template-btn[data-template]");
    if (templateBtn) {
        seedFromTemplate(templateBtn.dataset.template);
        return;
    }

    /* Open exercise search */
    if (e.target.matches("#addExerciseTrigger")) {
        openExerciseSearch();
        return;
    }

    /* Close exercise search */
    if (e.target.matches("#exerciseSearchClose")) {
        closeExerciseSearch();
        return;
    }

    if (e.target.matches("#exerciseSearchOverlay")) {
        closeExerciseSearch();
        return;
    }

    /* Pick a search result */
    const resultEl = e.target.closest(".strength-result");
    if (resultEl) {
        const exercise = lastSearchResults[Number(resultEl.dataset.resultIndex)];
        if (exercise) {
            addExerciseToActiveDay(exercise);
        }
        return;
    }

    /* Remove an exercise */
    if (e.target.matches("[data-remove-exercise]")) {
        const day = plan.days.find(d => d.id === plan.activeDay);
        if (day) {
            day.exercises = day.exercises.filter(
                ex => ex.id !== e.target.dataset.removeExercise
            );
            savePlan();
            renderDayContent();
            renderVolume();
        }
        return;
    }

    /* Add a set */
    if (e.target.matches("[data-add-set]")) {
        const day = plan.days.find(d => d.id === plan.activeDay);
        const exercise = day?.exercises.find(
            ex => ex.id === e.target.dataset.addSet
        );

        if (exercise) {
            const last = exercise.sets[exercise.sets.length - 1];

            exercise.sets.push({
                id: uid(),
                weight: last?.weight || 0,
                reps: last?.reps || 8,
                done: false
            });

            savePlan();
            renderDayContent();
        }
        return;
    }

    /* Remove a set */
    if (e.target.matches("[data-remove-set]")) {
        const day = plan.days.find(d => d.id === plan.activeDay);
        const exercise = day?.exercises.find(
            ex => ex.id === e.target.dataset.exerciseId
        );

        if (exercise) {
            exercise.sets = exercise.sets.filter(
                s => s.id !== e.target.dataset.removeSet
            );
            savePlan();
            renderDayContent();
            renderVolume();
        }
        return;
    }

    /* Toggle a set done */
    if (e.target.matches("[data-toggle-set]")) {
        const day = plan.days.find(d => d.id === plan.activeDay);
        const exercise = day?.exercises.find(
            ex => ex.id === e.target.dataset.exerciseId
        );
        const set = exercise?.sets.find(
            s => s.id === e.target.dataset.toggleSet
        );

        if (set) {
            set.done = !set.done;
            savePlan();
            e.target.classList.toggle("checked", set.done);
        }
        return;
    }

    /* Rename modal actions */
    if (e.target.matches("#renameDayCancel") || e.target.matches("#renameDayOverlay")) {
        closeRenameModal();
        return;
    }

    if (e.target.matches("#renameDaySave")) {
        saveRename();
        return;
    }

});

document.addEventListener("input", e => {

    /* Weight / reps fields */
    if (e.target.matches(".strength-set-input")) {
        const day = plan.days.find(d => d.id === plan.activeDay);
        const exercise = day?.exercises.find(
            ex => ex.id === e.target.dataset.exerciseId
        );
        const set = exercise?.sets.find(
            s => s.id === e.target.dataset.setId
        );

        if (set) {
            set[e.target.dataset.field] = Number(e.target.value) || 0;
            savePlan();
            renderVolume();
        }
        return;
    }

    /* Exercise search input (debounced) */
    if (e.target.matches("#exerciseSearchInput")) {
        const query = e.target.value;

        clearTimeout(searchDebounceTimer);

        const results = document.getElementById("exerciseSearchResults");

        if (!query.trim()) {
            if (results) results.innerHTML = "";
            return;
        }

        if (results) {
            results.innerHTML = `
                <div class="strength-search-loading">Searching…</div>
            `;
        }

        searchDebounceTimer = setTimeout(() => {
            searchExercises(query).then(renderSearchResults);
        }, 350);
    }

});

document.getElementById("renameDayInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        saveRename();
    }
});

/* ==========================================
   Init
========================================== */

loadPlan();
renderAll();

import("./cloudSync.js").then(({ initCloudSync }) => {
    initCloudSync().then(() => {
        loadPlan();
        renderAll();
    });
}).catch(() => {});
