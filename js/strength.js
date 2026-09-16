/* ==========================================
   EddieOS Strength — User Friendly Builder v2
========================================== */

import {
    getCurrentWeek,
    getWeek,
    CROSS_TRAINING
} from "./marathonData.js";

import { searchExercises } from "./exerciseSearch.js";

const STORAGE_KEY = "strength-plan";
const LIBRARY_KEY = "strength-exercise-library";
const DEFAULT_REST = 90;

let plan = { days: [], activeDay: null };
let searchDebounceTimer = null;
let lastSearchResults = [];
let expandedExercises = new Set();
let pendingRenameDayId = null;
let pendingGroupType = "superset";
let draggedExerciseId = null;
let restTimerInterval = null;
let restEndsAt = 0;

/* ==========================================
   Helpers / persistence
========================================== */

function uid() {
    return crypto.randomUUID();
}
function loadCustomLibrary() {
    try {
        const raw =
            localStorage.getItem(LIBRARY_KEY);

        const saved =
            raw
                ? JSON.parse(raw)
                : [];

        return Array.isArray(saved)
            ? saved
            : [];
    } catch {
        return [];
    }
}

function saveCustomLibrary(items) {
    localStorage.setItem(
        LIBRARY_KEY,
        JSON.stringify(items)
    );

    import("./cloudSync.js")
        .then(
            ({ pushToCloud }) =>
                pushToCloud()
        )
        .catch(() => {});
}

function customExerciseToSearchResult(exercise) {
    return {
        id: exercise.id,
        name: exercise.name,
        equipment:
            exercise.equipment ||
            "no equipment",
        level:
            exercise.level ||
            null,
        category:
            exercise.category ||
            "Custom",
        primaryMuscles:
            Array.isArray(
                exercise.primaryMuscles
            )
                ? exercise.primaryMuscles
                : [],
        secondaryMuscles:
            Array.isArray(
                exercise.secondaryMuscles
            )
                ? exercise.secondaryMuscles
                : [],
        instructions:
            Array.isArray(
                exercise.instructions
            )
                ? exercise.instructions
                : [],
        image:
            exercise.image ||
            null,
        isCustom: true
    };
}

function escapeQuery(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function searchCustomLibrary(query = "") {
    const term =
        escapeQuery(query);

    const items =
        loadCustomLibrary();

    if (!term) {
        return items.map(
            customExerciseToSearchResult
        );
    }

    return items
        .filter(exercise => {
            const haystack = [
                exercise.name,
                exercise.equipment,
                exercise.category,
                ...(exercise.primaryMuscles || []),
                ...(exercise.secondaryMuscles || [])
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(
                term
            );
        })
        .map(
            customExerciseToSearchResult
        );
}

function saveCustomExerciseFromForm() {
    const name =
        $("customExerciseName")?.value.trim();

    if (!name) {
        alert(
            "Give the exercise a name first."
        );
        return;
    }

    const equipment =
        $("customExerciseEquipment")?.value.trim();

    const category =
        $("customExerciseCategory")?.value.trim();

    const muscles =
        $("customExerciseMuscles")
            ?.value
            .split(",")
            .map(
                value =>
                    value.trim()
            )
            .filter(Boolean);

    const exercise = {
        id: `custom-${uid()}`,
        name,
        equipment:
            equipment ||
            "no equipment",
        category:
            category ||
            "Custom",
        primaryMuscles:
            muscles || [],
        secondaryMuscles: [],
        instructions: [],
        image: null,
        custom: true,
        createdAt: Date.now()
    };

    const library =
        loadCustomLibrary();

    library.push(exercise);
    saveCustomLibrary(library);

    closeCustomExerciseModal();

    // Refresh any currently open search.
    const query =
        $("exerciseSearchInput")
            ?.value ||
        "";

    searchExercisesForBuilder(
        query
    );
}


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

function activeDay() {
    return plan.days.find(
        day => day.id === plan.activeDay
    );
}

function normalizeSet(set = {}, mode = "reps") {
    return {
        id: set.id || uid(),
        weight: Number(set.weight) || 0,
        reps: Number(set.reps) || 0,
        duration: Number(set.duration) || 30,
        done: Boolean(set.done),
        rpe:
            set.rpe === "" ||
            set.rpe === null ||
            set.rpe === undefined
                ? ""
                : Number(set.rpe) || "",
        type: set.type || "working"
    };
}

function normalizeExercise(ex = {}) {
    const mode =
        ex.mode === "time"
            ? "time"
            : "reps";

    return {
        id: ex.id || uid(),
        exerciseId: ex.exerciseId ?? null,
        name: ex.name || "Exercise",
        equipment: ex.equipment || null,
        primaryMuscles: Array.isArray(ex.primaryMuscles)
            ? ex.primaryMuscles
            : [],
        image: ex.image || null,
        mode,
        restSeconds:
            Number(ex.restSeconds) || DEFAULT_REST,
        notes: ex.notes || "",
        groupId: ex.groupId || null,
        groupType:
            ex.groupType === "circuit"
                ? "circuit"
                : ex.groupType === "superset"
                    ? "superset"
                    : null,
        sets: Array.isArray(ex.sets) && ex.sets.length
            ? ex.sets.map(set =>
                normalizeSet(set, mode)
            )
            : [
                normalizeSet(
                    {
                        reps: mode === "time" ? 0 : 8,
                        duration: 30
                    },
                    mode
                ),
                normalizeSet(
                    {
                        reps: mode === "time" ? 0 : 8,
                        duration: 30
                    },
                    mode
                ),
                normalizeSet(
                    {
                        reps: mode === "time" ? 0 : 8,
                        duration: 30
                    },
                    mode
                )
            ]
    };
}

function normalizeDay(day = {}) {
    return {
        id: day.id || uid(),
        name: day.name || "Strength Day",
        estimatedMinutes:
            Number(day.estimatedMinutes) || 45,
        notes: day.notes || "",
        exercises: Array.isArray(day.exercises)
            ? day.exercises.map(normalizeExercise)
            : [],
        groupRounds: day.groupRounds || {}
    };
}

function loadPlan() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;

        if (saved && Array.isArray(saved.days)) {
            plan = {
                ...saved,
                days: saved.days.map(normalizeDay)
            };
        }
    } catch (error) {
        console.error(
            "Strength: could not read saved plan",
            error
        );
    }

    if (!plan.activeDay && plan.days.length) {
        plan.activeDay = plan.days[0].id;
    }
}

function savePlan() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(plan)
    );

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

/* ==========================================
   Hero
========================================== */

function renderWeekContext() {
    const el = $("strengthWeekContext");
    if (!el) return;

    try {
        const weekNumber = getCurrentWeek();
        const week = getWeek(weekNumber);

        el.textContent =
            week?.strength
                ? `Week ${weekNumber}: ${week.strength}`
                : "Build a lifting day below, whenever you're ready for it.";
    } catch {
        el.textContent =
            "Build a lifting day below, whenever you're ready for it.";
    }
}

function renderVolume() {
    const el = $("strengthVolumeValue");
    if (!el) return;

    let total = 0;

    plan.days.forEach(day => {
        day.exercises.forEach(exercise => {
            exercise.sets.forEach(set => {
                total +=
                    (Number(set.weight) || 0) *
                    (Number(set.reps) || 0);
            });
        });
    });

    el.textContent = total.toLocaleString();
}

/* ==========================================
   Day tabs
========================================== */

function renderDayTabs() {
    const container = $("strengthDayTabs");
    const empty = $("strengthEmptyState");
    const content = $("strengthDayContent");

    if (!container) return;

    if (!plan.days.length) {
        container.innerHTML = "";
        empty?.classList.add("visible");

        if (content) {
            content.innerHTML = "";
        }

        return;
    }

    empty?.classList.remove("visible");

    container.innerHTML = plan.days.map(day => `
        <div
            class="strength-day-tab ${
                day.id === plan.activeDay ? "active" : ""
            }"
            data-day-id="${day.id}"
            title="Double-click the name to rename"
        >
            <span>${escapeHtml(day.name)}</span>

            <button
                type="button"
                class="strength-day-tab-remove"
                data-remove-day="${day.id}"
                title="Delete day"
            >
                ×
            </button>
        </div>
    `).join("");
}

/* ==========================================
   Set / exercise rendering
========================================== */

function setTypeOptions(value) {
    return `
        <option value="working" ${
            value === "working" ? "selected" : ""
        }>Working</option>

        <option value="warmup" ${
            value === "warmup" ? "selected" : ""
        }>Warm-up</option>

        <option value="drop" ${
            value === "drop" ? "selected" : ""
        }>Drop</option>
    `;
}

function renderSetTable(exercise) {
    const timeMode = exercise.mode === "time";

    return `
        <div class="strength-table-scroll">
            <table class="strength-set-table">
                <thead>
                    <tr>
                        <th>Set</th>
                        <th>Type</th>
                        <th>Weight</th>
                        <th>${timeMode ? "Time" : "Reps"}</th>
                        <th>RPE</th>
                        <th></th>
                        <th></th>
                    </tr>
                </thead>

                <tbody>
                    ${exercise.sets.map((set, index) => `
                        <tr data-set-id="${set.id}">
                            <td class="strength-set-index">
                                ${index + 1}
                            </td>

                            <td>
                                <select
                                    class="strength-set-type"
                                    data-field="type"
                                    data-exercise-id="${exercise.id}"
                                    data-set-id="${set.id}"
                                >
                                    ${setTypeOptions(set.type)}
                                </select>
                            </td>

                            <td>
                                <input
                                    type="number"
                                    class="strength-set-input"
                                    data-field="weight"
                                    data-exercise-id="${exercise.id}"
                                    data-set-id="${set.id}"
                                    value="${set.weight}"
                                    min="0"
                                    step="5"
                                >
                                <span class="strength-set-unit">lb</span>
                            </td>

                            <td>
                                ${
                                    timeMode
                                        ? `
                                            <input
                                                type="number"
                                                class="strength-set-input"
                                                data-field="duration"
                                                data-exercise-id="${exercise.id}"
                                                data-set-id="${set.id}"
                                                value="${set.duration || 30}"
                                                min="1"
                                                step="5"
                                            >
                                            <span class="strength-set-unit">sec</span>
                                        `
                                        : `
                                            <input
                                                type="number"
                                                class="strength-set-input"
                                                data-field="reps"
                                                data-exercise-id="${exercise.id}"
                                                data-set-id="${set.id}"
                                                value="${set.reps}"
                                                min="0"
                                                step="1"
                                            >
                                        `
                                }
                            </td>

                            <td>
                                <select
                                    class="strength-set-rpe"
                                    data-field="rpe"
                                    data-exercise-id="${exercise.id}"
                                    data-set-id="${set.id}"
                                >
                                    <option value="">—</option>
                                    ${Array.from(
                                        { length: 10 },
                                        (_, i) => `
                                            <option
                                                value="${i + 1}"
                                                ${
                                                    Number(set.rpe) === i + 1
                                                        ? "selected"
                                                        : ""
                                                }
                                            >
                                                ${i + 1}
                                            </option>
                                        `
                                    ).join("")}
                                </select>
                            </td>

                            <td>
                                <button
                                    type="button"
                                    class="strength-set-done ${
                                        set.done ? "checked" : ""
                                    }"
                                    data-toggle-set="${set.id}"
                                    data-exercise-id="${exercise.id}"
                                    title="Complete set"
                                >
                                    ✓
                                </button>
                            </td>

                            <td>
                                <button
                                    type="button"
                                    class="strength-set-remove"
                                    data-remove-set="${set.id}"
                                    data-exercise-id="${exercise.id}"
                                    title="Remove set"
                                >
                                    ×
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

function renderExercise(exercise) {
    const detailsOpen =
        expandedExercises.has(exercise.id);

    const groupBadge =
        exercise.groupId
            ? `<span class="strength-group-badge">
                ${
                    exercise.groupType === "circuit"
                        ? "Circuit"
                        : "Superset"
                }
              </span>`
            : "";

    return `
        <div
            class="strength-exercise-block ${
                exercise.groupId
                    ? "strength-group-member"
                    : ""
            }"
            data-exercise-id="${exercise.id}"
            draggable="true"
        >

            <div class="strength-exercise-header">

                <div
                    class="strength-drag-handle"
                    title="Drag to reorder"
                >
                    ⋮⋮
                </div>

                ${
                    exercise.image
                        ? `<img
                            class="strength-exercise-image"
                            src="${escapeHtml(exercise.image)}"
                            alt=""
                            loading="lazy"
                        >`
                        : `<div class="strength-exercise-image"></div>`
                }

                <div class="strength-exercise-info">

                    <div class="strength-exercise-name">
                        ${escapeHtml(exercise.name)}
                        ${groupBadge}
                    </div>

                    <div class="strength-exercise-tags">
                        ${
                            escapeHtml(
                                exercise.equipment ||
                                "No equipment"
                            )
                        }${
                            exercise.primaryMuscles?.length
                                ? " · " +
                                  escapeHtml(
                                      exercise.primaryMuscles.join(
                                          ", "
                                      )
                                  )
                                : ""
                        }
                    </div>

                </div>

                <div class="strength-exercise-actions">

                    <button
                        type="button"
                        class="strength-icon-btn"
                        data-move-up="${exercise.id}"
                        title="Move up"
                    >
                        ↑
                    </button>

                    <button
                        type="button"
                        class="strength-icon-btn"
                        data-move-down="${exercise.id}"
                        title="Move down"
                    >
                        ↓
                    </button>

                    <button
                        type="button"
                        class="strength-icon-btn"
                        data-duplicate-exercise="${exercise.id}"
                        title="Duplicate exercise"
                    >
                        ⧉
                    </button>

                    <button
                        type="button"
                        class="strength-exercise-remove"
                        data-remove-exercise="${exercise.id}"
                        title="Remove exercise"
                    >
                        ×
                    </button>

                </div>

            </div>

            <div class="strength-exercise-toolbar">

                <button
                    type="button"
                    class="strength-mode-btn ${
                        exercise.mode === "time" ? "active" : ""
                    }"
                    data-toggle-mode="${exercise.id}"
                >
                    ⏱ ${
                        exercise.mode === "time"
                            ? "Timed"
                            : "Reps"
                    }
                </button>

                <button
                    type="button"
                    class="strength-rest-btn"
                    data-rest-exercise="${exercise.id}"
                >
                    Rest ${exercise.restSeconds}s
                </button>

                <button
                    type="button"
                    class="strength-group-btn"
                    data-group-exercise="${exercise.id}"
                >
                    ${
                        exercise.groupId
                            ? "Edit Group"
                            : "+ Add to Group"
                    }
                </button>

                <button
                    type="button"
                    class="strength-note-btn"
                    data-toggle-notes="${exercise.id}"
                >
                    ${exercise.notes ? "Notes •" : "Notes"}
                </button>

                <button
                    type="button"
                    class="strength-collapse-btn"
                    data-toggle-details="${exercise.id}"
                >
                    ${detailsOpen ? "Hide details" : "Details"}
                </button>

            </div>

            ${
                detailsOpen
                    ? `
                        <div class="strength-exercise-details">

                            <label>
                                <span>Rest</span>

                                <select data-rest-select="${exercise.id}">
                                    ${[
                                        30, 45, 60, 75,
                                        90, 120, 150,
                                        180, 240
                                    ].map(value => `
                                        <option
                                            value="${value}"
                                            ${
                                                Number(exercise.restSeconds) === value
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            ${value}s
                                        </option>
                                    `).join("")}
                                </select>
                            </label>

                            <label class="strength-note-field">
                                <span>Exercise note</span>

                                <input
                                    type="text"
                                    data-exercise-note="${exercise.id}"
                                    value="${escapeHtml(exercise.notes)}"
                                    placeholder="e.g. Keep ribs down"
                                >
                            </label>

                            <p class="strength-mode-help">
                                ${
                                    exercise.mode === "time"
                                        ? "Timed mode is ideal for planks, wall sits, carries, mobility, and other bodyweight or interval exercises."
                                        : "Rep mode tracks weight and reps. RPE is optional when you want to record how hard the set felt."
                                }
                            </p>

                        </div>
                    `
                    : ""
            }

            ${renderSetTable(exercise)}

            <button
                type="button"
                class="strength-add-set-btn"
                data-add-set="${exercise.id}"
            >
                + Add Set
            </button>

        </div>
    `;
}

function renderGrouped(day) {
    const output = [];
    let index = 0;

    while (
        index <
        day.exercises.length
    ) {
        const first =
            day.exercises[index];

        if (!first.groupId) {
            output.push(
                renderExercise(first)
            );
            index++;
            continue;
        }

        const groupId =
            first.groupId;

        const groupType =
            first.groupType ||
            "superset";

        const members = [];

        while (
            index <
                day.exercises.length &&
            day.exercises[index].groupId === groupId
        ) {
            members.push(
                day.exercises[index]
            );
            index++;
        }

        output.push(`
            <div
                class="strength-group-block strength-group-${groupType}"
                data-group-id="${groupId}"
            >

                <div class="strength-group-header">

                    <div>
                        <span class="strength-group-label">
                            ${
                                groupType === "circuit"
                                    ? "Circuit"
                                    : "Superset"
                            }
                        </span>

                        <strong>
                            ${
                                groupType === "circuit"
                                    ? "Move through each exercise for the selected rounds."
                                    : "Perform each exercise back-to-back before resting."
                            }
                        </strong>
                    </div>

                    <div class="strength-group-actions">

                        ${
                            groupType === "circuit"
                                ? `
                                    <label class="strength-rounds-control">
                                        Rounds
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value="${
                                                Number(
                                                    day.groupRounds[groupId]
                                                ) || 3
                                            }"
                                            data-group-rounds="${groupId}"
                                        >
                                    </label>
                                `
                                : ""
                        }

                        <button
                            type="button"
                            class="strength-group-small-btn"
                            data-add-to-group="${groupId}"
                        >
                            + Exercise
                        </button>

                        <button
                            type="button"
                            class="strength-group-small-btn"
                            data-ungroup="${groupId}"
                        >
                            Ungroup
                        </button>

                    </div>

                </div>

                <div class="strength-group-exercises">
                    ${
                        members
                            .map(renderExercise)
                            .join("")
                    }
                </div>

            </div>
        `);
    }

    return output.join("");
}

function renderDayContent() {
    const container =
        $("strengthDayContent");

    const day = activeDay();

    if (!container || !day) {
        if (container) {
            container.innerHTML = "";
        }

        return;
    }

    if (!day.groupRounds) {
        day.groupRounds = {};
    }

    container.innerHTML = `

        <div class="strength-session-toolbar">

            <div class="strength-session-meta">

                <div>
                    <span class="strength-session-eyebrow">
                        WORKOUT BUILDER
                    </span>

                    <h2>
                        ${escapeHtml(day.name)}
                    </h2>
                </div>

                <label class="strength-duration-control">
                    <span>Target time</span>
                    <input
                        type="number"
                        min="5"
                        max="240"
                        step="5"
                        value="${day.estimatedMinutes}"
                        data-day-duration
                    >
                    <span>min</span>
                </label>

            </div>

            <div class="strength-session-actions">

                <button
                    type="button"
                    class="strength-builder-btn"
                    data-open-group="superset"
                >
                    + Superset
                </button>

                <button
                    type="button"
                    class="strength-builder-btn"
                    data-open-group="circuit"
                >
                    + Circuit
                </button>

                <button
                    type="button"
                    class="strength-builder-btn"
                    data-duplicate-day
                >
                    Duplicate Day
                </button>

            </div>

        </div>

        ${
            day.notes
                ? `<div class="strength-day-note">
                    ${escapeHtml(day.notes)}
                  </div>`
                : ""
        }

        <div
            class="strength-exercise-list"
            id="strengthExerciseList"
        >
            ${
                day.exercises.length
                    ? renderGrouped(day)
                    : `
                        <div class="strength-empty-exercise-message">
                            Add your first exercise to build this workout.
                        </div>
                    `
            }
        </div>

        <button
            type="button"
            class="strength-add-exercise-btn"
            id="addExerciseTrigger"
        >
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

/* ==========================================
   Day management
========================================== */

function createDay(
    name,
    exercises = []
) {
    const day = {
        id: uid(),
        name,
        estimatedMinutes: 45,
        notes: "",
        exercises: exercises.map(
            normalizeExercise
        ),
        groupRounds: {}
    };

    plan.days.push(day);
    plan.activeDay = day.id;

    savePlan();
    renderAll();

    return day.id;
}

function removeDay(dayId) {
    plan.days =
        plan.days.filter(
            day =>
                day.id !== dayId
        );

    if (
        plan.activeDay ===
        dayId
    ) {
        plan.activeDay =
            plan.days[0]?.id ||
            null;
    }

    savePlan();
    renderAll();
}

function duplicateDay() {
    const source = activeDay();
    if (!source) return;

    const copy =
        JSON.parse(
            JSON.stringify(source)
        );

    copy.id = uid();
    copy.name =
        `${source.name} Copy`;

    const groupMap = {};

    copy.exercises =
        copy.exercises.map(
            exercise => {
                const oldId =
                    exercise.id;

                exercise.id = uid();

                if (exercise.groupId) {
                    if (
                        !groupMap[
                            exercise.groupId
                        ]
                    ) {
                        groupMap[
                            exercise.groupId
                        ] = uid();
                    }

                    exercise.groupId =
                        groupMap[
                            exercise.groupId
                        ];
                }

                exercise.sets =
                    exercise.sets.map(
                        set => ({
                            ...set,
                            id: uid(),
                            done: false
                        })
                    );

                return exercise;
            }
        );

    const rounds = {};

    Object.entries(
        source.groupRounds || {}
    ).forEach(
        ([oldId, roundsValue]) => {
            const newId =
                groupMap[oldId];

            if (newId) {
                rounds[newId] =
                    roundsValue;
            }
        }
    );

    copy.groupRounds = rounds;

    plan.days.push(copy);
    plan.activeDay = copy.id;

    savePlan();
    renderAll();
}

function parseTemplateWorkout(text) {
    const match =
        text.match(
            /^(.+?)\s*-\s*(\d+)\s*×\s*(\d+)$/
        );

    return match
        ? {
            name:
                match[1].trim(),
            sets:
                Number(match[2]),
            reps:
                Number(match[3])
        }
        : {
            name: text,
            sets: 3,
            reps: 10
        };
}

function seedFromTemplate(
    templateKey
) {
    const template =
        CROSS_TRAINING[templateKey];

    if (!template) return;

    const exercises =
        template.workouts.map(
            line => {
                const parsed =
                    parseTemplateWorkout(
                        line
                    );

                return {
                    id: uid(),
                    exerciseId: null,
                    name: parsed.name,
                    equipment: null,
                    primaryMuscles: [],
                    image: null,
                    mode: "reps",
                    restSeconds: DEFAULT_REST,
                    notes: "",
                    sets:
                        Array.from(
                            {
                                length:
                                    parsed.sets
                            },
                            () =>
                                normalizeSet(
                                    {
                                        reps:
                                            parsed.reps,
                                        weight: 0,
                                        done: false
                                    }
                                )
                        )
                };
            }
        );

    createDay(
        template.title,
        exercises
    );
}

/* ==========================================
   Exercise search
========================================== */

function openCustomExerciseModal() {
    $("customExerciseOverlay")
        ?.classList.add("open");

    const input =
        $("customExerciseName");

    if (input) {
        input.value = "";
        input.focus();
    }

    const equipment =
        $("customExerciseEquipment");

    const muscles =
        $("customExerciseMuscles");

    const category =
        $("customExerciseCategory");

    if (equipment) equipment.value = "";
    if (muscles) muscles.value = "";
    if (category) category.value = "";
}

function closeCustomExerciseModal() {
    $("customExerciseOverlay")
        ?.classList.remove("open");
}

function openExerciseSearch() {
    const overlay =
        $("exerciseSearchOverlay");

    const input =
        $("exerciseSearchInput");

    const results =
        $("exerciseSearchResults");

    overlay?.classList.add("open");

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
    $("exerciseSearchOverlay")
        ?.classList.remove("open");
}

function renderSearchResults(
    results
) {
    const container =
        $("exerciseSearchResults");

    if (!container) return;

    lastSearchResults =
        results;

    container.innerHTML =
        results.length
            ? results.map(
                (ex, index) => `
                    <div
                        class="strength-result"
                        data-result-index="${index}"
                    >

                        ${
                            ex.image
                                ? `
                                    <img
                                        class="strength-result-image"
                                        src="${escapeHtml(ex.image)}"
                                        alt=""
                                        loading="lazy"
                                    >
                                `
                                : `<div class="strength-result-image"></div>`
                        }

                        <div class="strength-result-info">
                            <strong>
                                ${escapeHtml(ex.name)}
                                ${
                                    ex.isCustom
                                        ? `<span class="strength-custom-badge">My Library</span>`
                                        : ""
                                }
                            </strong>

                            <span>
                                ${escapeHtml(ex.equipment)}
                                ${
                                    ex.primaryMuscles.length
                                        ? " · " +
                                          escapeHtml(
                                              ex.primaryMuscles.join(
                                                  ", "
                                              )
                                          )
                                        : ""
                                }
                            </span>
                        </div>

                        <span class="strength-add-result">
                            +
                        </span>

                    </div>
                `
            ).join("")
            : `
                <div class="strength-search-empty">
                    No matches. Try a different search.
                </div>
            `;
}

async function searchExercisesForBuilder(query = "") {
    const custom =
        searchCustomLibrary(
            query
        );

    let publicResults = [];

    if (query.trim()) {
        publicResults =
            await searchExercises(
                query
            );
    }

    const seen = new Set();

    return [
        ...custom,
        ...publicResults
    ]
        .filter(exercise => {
            const key =
                String(
                    exercise.name
                )
                    .trim()
                    .toLowerCase();

            if (seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        })
        .slice(0, 25);
}

function addExercise(
    exercise
) {
    const day = activeDay();
    if (!day) return;

    const item =
        normalizeExercise({
            id: uid(),
            exerciseId: exercise.id,
            name: exercise.name,
            equipment: exercise.equipment,
            primaryMuscles:
                exercise.primaryMuscles,
            image: exercise.image,
            mode: "reps",
            restSeconds: DEFAULT_REST,
            notes: ""
        });

    day.exercises.push(item);

    expandedExercises.add(
        item.id
    );

    savePlan();
    closeExerciseSearch();
    renderAll();
}

/* ==========================================
   Exercise ordering
========================================== */

function moveExercise(
    id,
    delta
) {
    const day = activeDay();
    if (!day) return;

    const index =
        day.exercises.findIndex(
            ex =>
                ex.id === id
        );

    if (index < 0) return;

    const next =
        index + delta;

    if (
        next < 0 ||
        next >= day.exercises.length
    ) {
        return;
    }

    [
        day.exercises[index],
        day.exercises[next]
    ] = [
        day.exercises[next],
        day.exercises[index]
    ];

    cleanupGroups(day);
    savePlan();
    renderDayContent();
}

function cleanupGroups(day) {
    const counts = {};

    day.exercises.forEach(
        ex => {
            if (!ex.groupId) return;

            counts[ex.groupId] =
                (counts[ex.groupId] || 0) + 1;
        }
    );

    day.exercises.forEach(
        ex => {
            if (
                ex.groupId &&
                counts[ex.groupId] < 2
            ) {
                ex.groupId = null;
                ex.groupType = null;
            }
        }
    );
}

function reorderExercise(
    sourceId,
    targetId
) {
    const day = activeDay();
    if (!day) return;

    const from =
        day.exercises.findIndex(
            ex => ex.id === sourceId
        );

    const to =
        day.exercises.findIndex(
            ex => ex.id === targetId
        );

    if (
        from < 0 ||
        to < 0 ||
        from === to
    ) {
        return;
    }

    const [item] =
        day.exercises.splice(
            from,
            1
        );

    day.exercises.splice(
        to,
        0,
        item
    );

    cleanupGroups(day);
    savePlan();
    renderDayContent();
}

/* ==========================================
   Grouping
========================================== */

function openGroupModal(
    type
) {
    const overlay =
        $("strengthGroupOverlay");

    const list =
        $("strengthGroupExerciseList");

    const day = activeDay();

    if (
        !overlay ||
        !list ||
        !day
    ) {
        return;
    }

    pendingGroupType =
        type;

    const title =
        $("strengthGroupModalTitle");

    if (title) {
        title.textContent =
            `Create ${
                type === "circuit"
                    ? "Circuit"
                    : "Superset"
            }`;
    }

    list.innerHTML =
        day.exercises.map(
            exercise => `
                <label class="strength-group-option">

                    <input
                        type="checkbox"
                        value="${exercise.id}"
                        data-group-choice
                    >

                    <span>
                        <strong>
                            ${escapeHtml(exercise.name)}
                        </strong>

                        <small>
                            ${
                                exercise.groupId
                                    ? (
                                        exercise.groupType ===
                                        "circuit"
                                            ? "Already in circuit"
                                            : "Already in superset"
                                    )
                                    : "Not grouped"
                            }
                        </small>
                    </span>

                </label>
            `
        ).join("");

    overlay.classList.add(
        "open"
    );
}

function closeGroupModal() {
    $("strengthGroupOverlay")
        ?.classList.remove("open");
}

function createGroupFromModal() {
    const day = activeDay();

    if (!day) return;

    const ids =
        Array.from(
            document.querySelectorAll(
                "[data-group-choice]:checked"
            )
        ).map(
            input =>
                input.value
        );

    if (ids.length < 2) {
        alert(
            "Select at least two exercises."
        );

        return;
    }

    const selected =
        new Set(ids);

    const original =
        [...day.exercises];

    const members =
        original.filter(
            ex =>
                selected.has(
                    ex.id
                )
        );

    const groupId =
        uid();

    members.forEach(
        ex => {
            ex.groupId =
                groupId;

            ex.groupType =
                pendingGroupType;
        }
    );

    const firstIndex =
        original.findIndex(
            ex =>
                selected.has(
                    ex.id
                )
        );

    const remaining =
        original.filter(
            ex =>
                !selected.has(
                    ex.id
                )
        );

    remaining.splice(
        Math.min(
            firstIndex,
            remaining.length
        ),
        0,
        ...members
    );

    day.exercises =
        remaining;

    if (!day.groupRounds) {
        day.groupRounds = {};
    }

    if (
        pendingGroupType ===
        "circuit"
    ) {
        day.groupRounds[
            groupId
        ] = 3;
    }

    savePlan();
    closeGroupModal();
    renderAll();
}

function ungroup(
    groupId
) {
    const day = activeDay();
    if (!day) return;

    day.exercises.forEach(
        ex => {
            if (
                ex.groupId ===
                groupId
            ) {
                ex.groupId = null;
                ex.groupType = null;
            }
        }
    );

    delete day.groupRounds?.[
        groupId
    ];

    savePlan();
    renderAll();
}

/* ==========================================
   Rest timer
========================================== */

function stopRestTimer() {
    clearInterval(
        restTimerInterval
    );

    restTimerInterval =
        null;

    $("strengthRestTimer")
        ?.classList.remove(
            "visible"
        );
}

function formatTimer(
    totalSeconds
) {
    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const seconds =
        totalSeconds % 60;

    return `${minutes}:${String(
        seconds
    ).padStart(2, "0")}`;
}

function startRestTimer(
    seconds,
    exerciseName
) {
    stopRestTimer();

    restEndsAt =
        Date.now() +
        Number(seconds) * 1000;

    $("strengthRestTimerTitle").textContent =
        `Rest • ${exerciseName}`;

    $("strengthRestTimer").classList.add(
        "visible"
    );

    const tick = () => {
        const left =
            Math.max(
                0,
                Math.ceil(
                    (
                        restEndsAt -
                        Date.now()
                    ) / 1000
                )
            );

        $("strengthRestTimerValue").textContent =
            formatTimer(left);

        if (!left) {
            clearInterval(
                restTimerInterval
            );

            restTimerInterval =
                null;

            try {
                navigator.vibrate?.(
                    [200, 100, 200]
                );
            } catch {}

            return;
        }
    };

    tick();

    restTimerInterval =
        setInterval(
            tick,
            250
        );
}

/* ==========================================
   Rename day
========================================== */

function openRenameModal(dayId) {
    const day =
        plan.days.find(
            item =>
                item.id ===
                dayId
        );

    if (!day) return;

    pendingRenameDayId =
        dayId;

    $("renameDayInput").value =
        day.name;

    $("renameDayOverlay")
        .classList.add("open");

    $("renameDayInput").focus();
}

function closeRenameModal() {
    $("renameDayOverlay")
        ?.classList.remove("open");

    pendingRenameDayId =
        null;
}

function saveRename() {
    const day =
        plan.days.find(
            item =>
                item.id ===
                pendingRenameDayId
        );

    const value =
        $("renameDayInput")
            ?.value
            .trim();

    if (day && value) {
        day.name =
            value;

        savePlan();
        renderAll();
    }

    closeRenameModal();
}

/* ==========================================
   Click events
========================================== */

document.addEventListener(
    "click",
    event => {
        const target =
            event.target;

        const tab =
            target.closest(
                ".strength-day-tab"
            );

        if (
            tab &&
            !target.matches(
                ".strength-day-tab-remove"
            )
        ) {
            plan.activeDay =
                tab.dataset.dayId;

            savePlan();
            renderAll();
            return;
        }

        if (
            target.closest(
                ".strength-day-tab span"
            ) &&
            event.detail === 2
        ) {
            openRenameModal(
                target.closest(
                    ".strength-day-tab"
                ).dataset.dayId
            );

            return;
        }

        if (
            target.matches(
                ".strength-day-tab-remove"
            )
        ) {
            removeDay(
                target.dataset
                    .removeDay
            );

            return;
        }

        if (
            target.matches(
                "#addDayBtn"
            ) ||
            target.matches(
                "#emptyStateNewDayBtn"
            )
        ) {
            const newId =
                createDay(
                    `Day ${
                        plan.days.length + 1
                    }`
                );

            openRenameModal(
                newId
            );

            return;
        }

        const template =
            target.closest(
                ".strength-template-btn[data-template]"
            );

        if (template) {
            seedFromTemplate(
                template.dataset
                    .template
            );

            return;
        }

        if (
            target.matches(
                "#addExerciseTrigger"
            )
        ) {
            openExerciseSearch();
            return;
        }

        if (
            target.matches(
                "#openCustomExerciseBtn"
            )
        ) {
            openCustomExerciseModal();
            return;
        }

        if (
            target.matches(
                "#customExerciseSave"
            )
        ) {
            saveCustomExerciseFromForm();
            return;
        }

        if (
            target.matches(
                "#customExerciseClose"
            ) ||
            target.matches(
                "#customExerciseCancel"
            ) ||
            target.matches(
                "#customExerciseOverlay"
            )
        ) {
            closeCustomExerciseModal();
            return;
        }

        if (
            target.matches(
                "#exerciseSearchClose"
            ) ||
            target.matches(
                "#exerciseSearchOverlay"
            )
        ) {
            closeExerciseSearch();
            return;
        }

        const result =
            target.closest(
                ".strength-result"
            );

        if (result) {
            const exercise =
                lastSearchResults[
                    Number(
                        result.dataset
                            .resultIndex
                    )
                ];

            if (exercise) {
                addExercise(
                    exercise
                );
            }

            return;
        }

        if (
            target.matches(
                "[data-remove-exercise]"
            )
        ) {
            const day = activeDay();

            if (day) {
                day.exercises =
                    day.exercises.filter(
                        ex =>
                            ex.id !==
                            target.dataset
                                .removeExercise
                    );

                cleanupGroups(day);
                savePlan();
                renderAll();
            }

            return;
        }

        if (
            target.matches(
                "[data-duplicate-exercise]"
            )
        ) {
            const day = activeDay();

            const source =
                day?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .duplicateExercise
                );

            if (
                day &&
                source
            ) {
                const copy =
                    JSON.parse(
                        JSON.stringify(
                            source
                        )
                    );

                copy.id = uid();
                copy.name =
                    `${source.name} Copy`;
                copy.groupId = null;
                copy.groupType = null;

                copy.sets =
                    copy.sets.map(
                        set => ({
                            ...set,
                            id: uid(),
                            done: false
                        })
                    );

                const index =
                    day.exercises.findIndex(
                        ex =>
                            ex.id ===
                            source.id
                    );

                day.exercises.splice(
                    index + 1,
                    0,
                    copy
                );

                savePlan();
                renderAll();
            }

            return;
        }

        if (
            target.matches(
                "[data-move-up]"
            )
        ) {
            moveExercise(
                target.dataset
                    .moveUp,
                -1
            );

            return;
        }

        if (
            target.matches(
                "[data-move-down]"
            )
        ) {
            moveExercise(
                target.dataset
                    .moveDown,
                1
            );

            return;
        }

        if (
            target.matches(
                "[data-toggle-mode]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .toggleMode
                );

            if (exercise) {
                exercise.mode =
                    exercise.mode ===
                    "time"
                        ? "reps"
                        : "time";

                exercise.sets.forEach(
                    set => {
                        if (
                            exercise.mode ===
                            "time" &&
                            !set.duration
                        ) {
                            set.duration =
                                30;
                        }
                    }
                );

                savePlan();
                renderDayContent();
            }

            return;
        }

        if (
            target.matches(
                "[data-toggle-details]"
            )
        ) {
            const id =
                target.dataset
                    .toggleDetails;

            if (
                expandedExercises.has(
                    id
                )
            ) {
                expandedExercises.delete(
                    id
                );
            } else {
                expandedExercises.add(
                    id
                );
            }

            renderDayContent();
            return;
        }

        if (
            target.matches(
                "[data-toggle-notes]"
            )
        ) {
            const id =
                target.dataset
                    .toggleNotes;

            expandedExercises.add(id);
            renderDayContent();

            requestAnimationFrame(
                () =>
                    document
                        .querySelector(
                            `[data-exercise-note="${id}"]`
                        )
                        ?.focus()
            );

            return;
        }

        if (
            target.matches(
                "[data-rest-exercise]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .restExercise
                );

            if (exercise) {
                startRestTimer(
                    exercise.restSeconds,
                    exercise.name
                );
            }

            return;
        }

        if (
            target.matches(
                "[data-open-group]"
            )
        ) {
            openGroupModal(
                target.dataset.openGroup
            );

            return;
        }

        if (
            target.matches(
                "[data-group-exercise]"
            )
        ) {
            openGroupModal(
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .groupExercise
                )?.groupType ||
                "superset"
            );

            return;
        }

        if (
            target.matches(
                "[data-ungroup]"
            )
        ) {
            ungroup(
                target.dataset
                    .ungroup
            );

            return;
        }

        if (
            target.matches(
                "[data-add-to-group]"
            )
        ) {
            openGroupModal(
                "superset"
            );

            return;
        }

        if (
            target.matches(
                "[data-duplicate-day]"
            )
        ) {
            duplicateDay();
            return;
        }

        if (
            target.matches(
                "[data-toggle-set]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .exerciseId
                );

            const set =
                exercise?.sets.find(
                    item =>
                        item.id ===
                        target.dataset
                            .toggleSet
                );

            if (exercise && set) {
                set.done =
                    !set.done;

                savePlan();

                target.classList.toggle(
                    "checked",
                    set.done
                );

                if (set.done) {
                    startRestTimer(
                        exercise.restSeconds,
                        exercise.name
                    );
                } else {
                    stopRestTimer();
                }
            }

            return;
        }

        if (
            target.matches(
                "[data-add-set]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .addSet
                );

            if (exercise) {
                const last =
                    exercise.sets[
                        exercise.sets.length - 1
                    ];

                exercise.sets.push(
                    normalizeSet({
                        weight:
                            last?.weight || 0,
                        reps:
                            exercise.mode ===
                            "time"
                                ? 0
                                : last?.reps || 8,
                        duration:
                            last?.duration || 30
                    })
                );

                savePlan();
                renderDayContent();
            }

            return;
        }

        if (
            target.matches(
                "[data-remove-set]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .exerciseId
                );

            if (exercise) {
                exercise.sets =
                    exercise.sets.filter(
                        set =>
                            set.id !==
                            target.dataset
                                .removeSet
                    );

                savePlan();
                renderDayContent();
                renderVolume();
            }

            return;
        }

        if (
            target.matches(
                "#strengthGroupSave"
            )
        ) {
            createGroupFromModal();
            return;
        }

        if (
            target.matches(
                "#strengthGroupClose"
            ) ||
            target.matches(
                "#strengthGroupCancel"
            ) ||
            target.matches(
                "#strengthGroupOverlay"
            )
        ) {
            closeGroupModal();
            return;
        }

        if (
            target.matches(
                "#strengthRestTimerSkip"
            ) ||
            target.matches(
                "#strengthRestTimerClose"
            )
        ) {
            stopRestTimer();
            return;
        }

        if (
            target.matches(
                "#renameDayCancel"
            ) ||
            target.matches(
                "#renameDayOverlay"
            )
        ) {
            closeRenameModal();
            return;
        }

        if (
            target.matches(
                "#renameDaySave"
            )
        ) {
            saveRename();
        }
    }
);

/* ==========================================
   Drag / drop
========================================== */

document.addEventListener(
    "dragstart",
    event => {
        const block =
            event.target.closest(
                ".strength-exercise-block"
            );

        if (!block) return;

        draggedExerciseId =
            block.dataset
                .exerciseId;

        block.classList.add(
            "dragging"
        );

        try {
            event.dataTransfer.effectAllowed =
                "move";
            event.dataTransfer.setData(
                "text/plain",
                draggedExerciseId
            );
        } catch {}
    }
);

document.addEventListener(
    "dragend",
    event => {
        event.target
            .closest(
                ".strength-exercise-block"
            )
            ?.classList.remove(
                "dragging"
            );

        document
            .querySelectorAll(
                ".strength-exercise-block.drag-over"
            )
            .forEach(
                element =>
                    element.classList.remove(
                        "drag-over"
                    )
            );

        draggedExerciseId =
            null;
    }
);

document.addEventListener(
    "dragover",
    event => {
        const block =
            event.target.closest(
                ".strength-exercise-block"
            );

        if (
            !block ||
            !draggedExerciseId ||
            block.dataset.exerciseId ===
                draggedExerciseId
        ) {
            return;
        }

        event.preventDefault();

        block.classList.add(
            "drag-over"
        );
    }
);

document.addEventListener(
    "drop",
    event => {
        const block =
            event.target.closest(
                ".strength-exercise-block"
            );

        if (
            !block ||
            !draggedExerciseId
        ) {
            return;
        }

        event.preventDefault();

        reorderExercise(
            draggedExerciseId,
            block.dataset
                .exerciseId
        );
    }
);

/* ==========================================
   Inputs / changes
========================================== */

document.addEventListener(
    "input",
    event => {
        const target =
            event.target;

        if (
            target.matches(
                ".strength-set-input"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .exerciseId
                );

            const set =
                exercise?.sets.find(
                    item =>
                        item.id ===
                        target.dataset
                            .setId
                );

            if (set) {
                set[
                    target.dataset
                        .field
                ] =
                    Number(
                        target.value
                    ) || 0;

                savePlan();

                if (
                    target.dataset.field ===
                    "weight"
                ) {
                    renderVolume();
                }
            }

            return;
        }

        if (
            target.matches(
                "#exerciseSearchInput"
            )
        ) {
            const query =
                target.value;

            clearTimeout(
                searchDebounceTimer
            );

            const results =
                $("exerciseSearchResults");

            if (!query.trim()) {
                results.innerHTML = "";
                return;
            }

            results.innerHTML = `
                <div class="strength-search-loading">
                    Searching…
                </div>
            `;

            searchDebounceTimer =
                setTimeout(
                    () =>
                        searchExercisesForBuilder(
                            query
                        )
                            .then(
                                renderSearchResults
                            )
                            .catch(
                                error => {
                                    console.error(
                                        error
                                    );

                                    results.innerHTML = `
                                        <div class="strength-search-empty">
                                            Exercise database could not be loaded.
                                        </div>
                                    `;
                                }
                            ),
                    300
                );

            return;
        }

        if (
            target.matches(
                "[data-day-duration]"
            )
        ) {
            const day = activeDay();

            if (day) {
                day.estimatedMinutes =
                    Math.max(
                        5,
                        Number(
                            target.value
                        ) || 45
                    );

                savePlan();
            }

            return;
        }

        if (
            target.matches(
                "[data-exercise-note]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .exerciseNote
                );

            if (exercise) {
                exercise.notes =
                    target.value;

                savePlan();
            }
        }
    }
);

document.addEventListener(
    "change",
    event => {
        const target =
            event.target;

        if (
            target.matches(
                ".strength-set-type, .strength-set-rpe"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .exerciseId
                );

            const set =
                exercise?.sets.find(
                    item =>
                        item.id ===
                        target.dataset
                            .setId
                );

            if (set) {
                if (
                    target.dataset.field ===
                    "rpe"
                ) {
                    set.rpe =
                        target.value
                            ? Number(
                                target.value
                            )
                            : "";
                } else {
                    set.type =
                        target.value;
                }

                savePlan();
            }

            return;
        }

        if (
            target.matches(
                "[data-rest-select]"
            )
        ) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .restSelect
                );

            if (exercise) {
                exercise.restSeconds =
                    Number(
                        target.value
                    ) ||
                    DEFAULT_REST;

                savePlan();
                renderDayContent();
            }

            return;
        }

        if (
            target.matches(
                "[data-group-rounds]"
            )
        ) {
            const day =
                activeDay();

            if (day) {
                if (!day.groupRounds) {
                    day.groupRounds = {};
                }

                day.groupRounds[
                    target.dataset
                        .groupRounds
                ] =
                    Math.max(
                        1,
                        Number(
                            target.value
                        ) || 3
                    );

                savePlan();
            }

            return;
        }
    }
);


/* ==========================================
   Workout Library integration
========================================== */

window.addEventListener(
    "eddieos:use-strength-workout",
    event => {
        const workout =
            event.detail?.workout;

        const mode =
            event.detail?.mode ||
            "new";

        if (
            !workout ||
            !Array.isArray(
                workout.exercises
            )
        ) {
            return;
        }

        const groupMap = {};
        const groupRounds = {};

        const exercises =
            workout.exercises.map(
                exercise => {
                    let groupId = null;

                    if (exercise.group) {
                        if (
                            !groupMap[
                                exercise.group
                            ]
                        ) {
                            groupMap[
                                exercise.group
                            ] =
                                uid();
                        }

                        groupId =
                            groupMap[
                                exercise.group
                            ];
                    }

                    return {
                        id: uid(),
                        exerciseId:
                            exercise.exerciseId ||
                            null,
                        name:
                            exercise.name ||
                            "Exercise",
                        equipment:
                            exercise.equipment ||
                            null,
                        primaryMuscles:
                            exercise.primaryMuscles ||
                            [],
                        image:
                            exercise.image ||
                            null,
                        mode:
                            exercise.mode ===
                            "time"
                                ? "time"
                                : "reps",
                        restSeconds:
                            Number(
                                exercise.restSeconds
                            ) || 90,
                        notes:
                            exercise.notes ||
                            "",
                        groupId,
                        groupType:
                            groupId
                                ? exercise.groupType ===
                                  "circuit"
                                    ? "circuit"
                                    : "superset"
                                : null,
                        sets:
                            Array.from(
                                {
                                    length:
                                        Math.max(
                                            1,
                                            Number(
                                                exercise.sets
                                            ) || 1
                                        )
                                },
                                () => ({
                                    id: uid(),
                                    weight:
                                        Number(
                                            exercise.weight
                                        ) || 0,
                                    reps:
                                        exercise.mode ===
                                        "time"
                                            ? 0
                                            : Number(
                                                exercise.reps
                                            ) || 0,
                                    duration:
                                        Number(
                                            exercise.duration
                                        ) || 30,
                                    done: false,
                                    rpe:
                                        exercise.rpe ||
                                        "",
                                    type:
                                        "working"
                                })
                            )
                    };
                }
            );

        Object.entries(
            groupMap
        ).forEach(
            ([sourceGroup, newGroupId]) => {
                const sourceExercise =
                    workout.exercises.find(
                        exercise =>
                            exercise.group ===
                            sourceGroup
                    );

                if (
                    sourceExercise?.groupType ===
                    "circuit"
                ) {
                    groupRounds[
                        newGroupId
                    ] =
                        Number(
                            workout.rounds
                        ) || 3;
                }
            }
        );

        if (mode === "current") {
            const day =
                activeDay();

            if (!day) {
                alert(
                    "Create or select a Strength day first."
                );
                return;
            }

            day.exercises.push(
                ...exercises
            );

            if (!day.groupRounds) {
                day.groupRounds = {};
            }

            Object.assign(
                day.groupRounds,
                groupRounds
            );

            savePlan();
            renderAll();
            return;
        }

        const newId =
            createDay(
                workout.name,
                exercises
            );

        const newDay =
            plan.days.find(
                day =>
                    day.id === newId
            );

        if (newDay) {
            newDay.estimatedMinutes =
                Number(
                    workout.minutes
                ) || 45;

            newDay.groupRounds =
                groupRounds;

            savePlan();
            renderAll();
        }
    }
);

/* ==========================================
   Init
========================================== */

loadPlan();
renderAll();

import("./cloudSync.js")
    .then(
        ({ initCloudSync }) =>
            initCloudSync().then(
                () => {
                    loadPlan();
                    renderAll();
                }
            )
    )
    .catch(() => {});
