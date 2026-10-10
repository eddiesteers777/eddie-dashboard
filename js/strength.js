/* ==========================================
   Southbound Strength — User Friendly Builder v2
========================================== */

import {
    getCurrentWeek,
    getWeek,
    CROSS_TRAINING
} from "./marathonData.js";

import { searchExercises } from "./exerciseSearch.js";
import { showsPersonalPlan } from "./role.js";
import { icon } from "./icons.js";
import { toast } from "./ui.js";

const STORAGE_KEY = "strength-plan";
const LIBRARY_KEY = "strength-exercise-library";
const DEFAULT_REST = 90;

let plan = { days: [], activeDay: null };
let searchDebounceTimer = null;
let lastSearchResults = [];
let expandedExercises = new Set();
let pendingRenameDayId = null;
let pendingGroupType = "superset";
let pendingGroupId = null;
let draggedExerciseId = null;
let restTimerInterval = null;
let restEndsAt = 0;

/* ==========================================
   Helpers / persistence
========================================== */

function uid() {
    return crypto.randomUUID();
}

const GROUP_TYPES = ["circuit", "superset", "warmup"];

function normalizeGroupType(type) {
    return GROUP_TYPES.includes(type) ? type : null;
}

function groupTypeLabel(type) {
    return type === "circuit"
        ? "Circuit"
        : type === "warmup"
            ? "Warmup"
            : "Superset";
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
        toast("Give the exercise a name first.", { type: "info" });
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
        groupType: normalizeGroupType(ex.groupType),
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

    window.dispatchEvent(
        new CustomEvent(
            "eddieos:strength-plan-updated"
        )
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

    // The marathon block's weekly strength focus is the coach's own
    // plan (js/role.js).
    if (!showsPersonalPlan()) {
        el.textContent = "Build a lifting day below, whenever you're ready for it.";
        return;
    }

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
                ${icon("close")}
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
                                    ${icon("check")}
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
                                    ${icon("close")}
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}


function formatExerciseRest(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return "";
    if (total < 60) return total + "s";

    const minutes = Math.floor(total / 60);
    const remainder = total % 60;

    return minutes + ":" + String(remainder).padStart(2, "0");
}

function formatExercisePrescription(exercise) {
    const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    const count = sets.length;

    if (!count) return "No sets";

    const isTime = exercise.mode === "time";
    const values = sets.map(set =>
        isTime
            ? (Number(set.duration) || 0) + " sec"
            : String(Number(set.reps) || 0)
    );

    const sameValue = values.every(value => value === values[0]);

    let summary = sameValue
        ? count + " × " + values[0]
        : count + " sets";

    if (!isTime) {
        const loads = sets
            .map(set => Number(set.weight) || 0)
            .filter(value => value > 0);

        const uniqueLoads = [...new Set(loads)];

        if (uniqueLoads.length === 1) {
            summary += " · " + uniqueLoads[0] + " lb";
        } else if (uniqueLoads.length > 1) {
            summary += " · Varying load";
        }
    }

    const rpes = sets.map(set => Number(set.rpe));

    if (
        rpes.every(Number.isFinite) &&
        rpes[0] > 0 &&
        rpes.every(value => value === rpes[0])
    ) {
        summary += " · RPE " + rpes[0];
    }

    const rest = Number(exercise.restSeconds) || 0;

    if (rest) {
        summary += " · " + formatExerciseRest(rest);
    }

    return summary;
}

function renderExercise(exercise) {
    const detailsOpen =
        expandedExercises.has(exercise.id);

    const groupBadge =
        exercise.groupId
            ? '<span class="strength-group-badge strength-group-badge-' +
              (exercise.groupType || "superset") +
              '">' +
              escapeHtml(groupTypeLabel(exercise.groupType)) +
              "</span>"
            : "";

    const exerciseTags = [
        exercise.equipment || "No equipment",
        ...(exercise.primaryMuscles || [])
    ].filter(Boolean).join(" · ");

    const imageHtml = exercise.image
        ? '<img class="strength-exercise-image" src="' +
          escapeHtml(exercise.image) +
          '" alt="" loading="lazy">'
        : "";

    const restOptions = [
        30, 45, 60, 75, 90, 120, 150, 180, 240
    ].map(value =>
        '<option value="' +
        value +
        '"' +
        (Number(exercise.restSeconds) === value ? " selected" : "") +
        ">" +
        value +
        "s</option>"
    ).join("");

    const detailHtml = detailsOpen
        ? [
            '<div class="strength-exercise-editor">',
                '<div class="strength-exercise-editor-top">',
                    '<div class="strength-exercise-toolbar">',

                        '<button type="button" class="strength-mode-btn ' +
                            (exercise.mode === "time" ? "active" : "") +
                            '" data-toggle-mode="' + exercise.id + '">' +
                            icon("timer") + " " +
                            (exercise.mode === "time" ? "Timed" : "Reps") +
                        "</button>",

                        '<button type="button" class="strength-rest-btn" data-rest-exercise="' +
                            exercise.id + '">' +
                            "Rest " + exercise.restSeconds + "s" +
                        "</button>",

                        '<button type="button" class="strength-group-btn" data-group-exercise="' +
                            exercise.id + '">' +
                            (exercise.groupId ? "Edit Group" : "+ Add to Group") +
                        "</button>",

                        '<button type="button" class="strength-note-btn" data-toggle-notes="' +
                            exercise.id + '">' +
                            (exercise.notes ? "Notes •" : "Notes") +
                        "</button>",

                    "</div>",

                    '<div class="strength-exercise-actions">',

                        '<button type="button" class="strength-icon-btn" ' +
                            'data-duplicate-exercise="' + exercise.id + '" ' +
                            'title="Duplicate exercise" ' +
                            'aria-label="Duplicate ' + escapeHtml(exercise.name) + '">' +
                            icon("copy") +
                        "</button>",

                        '<button type="button" class="strength-icon-btn strength-icon-btn-danger" ' +
                            'data-remove-exercise="' + exercise.id + '" ' +
                            'title="Remove exercise" ' +
                            'aria-label="Remove ' + escapeHtml(exercise.name) + '">' +
                            icon("close") +
                        "</button>",

                    "</div>",
                "</div>",

                '<div class="strength-exercise-details">',

                    "<label>",
                        "<span>Rest</span>",
                        '<select data-rest-select="' + exercise.id + '">',
                            restOptions,
                        "</select>",
                    "</label>",

                    '<label class="strength-note-field">',
                        "<span>Exercise note</span>",
                        '<input type="text" ' +
                            'data-exercise-note="' + exercise.id + '" ' +
                            'value="' + escapeHtml(exercise.notes) + '" ' +
                            'placeholder="e.g. Keep ribs down">',
                    "</label>",

                    '<p class="strength-mode-help">' +
                        (exercise.mode === "time"
                            ? "Timed mode is ideal for planks, carries, mobility, and other duration-based work."
                            : "Rep mode tracks weight and reps. RPE is optional when you want to prescribe or record effort.") +
                    "</p>",

                "</div>",

                renderSetTable(exercise),

                '<button type="button" class="strength-add-set-btn" data-add-set="' +
                    exercise.id + '">+ Add Set</button>',

            "</div>"
        ].join("")
        : "";

    return [
        '<div class="strength-exercise-block ' +
            (exercise.groupId ? "strength-group-member " : "") +
            (detailsOpen ? "is-expanded" : "") +
            '" data-exercise-id="' + exercise.id + '" draggable="false">',

            '<button type="button" class="strength-exercise-summary" ' +
                'data-toggle-details="' + exercise.id + '" ' +
                'aria-expanded="' + (detailsOpen ? "true" : "false") + '" ' +
                'aria-label="' + (detailsOpen ? "Collapse" : "Edit") + " " +
                escapeHtml(exercise.name) + '">',

                '<span class="strength-drag-handle" draggable="true" ' +
                    'title="Drag to reorder" aria-label="Drag to reorder exercise">' +
                    icon("moreVertical") +
                    icon("moreVertical") +
                "</span>",

                '<span class="strength-exercise-summary-main">' +
                    imageHtml +
                    '<span class="strength-exercise-info">' +
                        '<span class="strength-exercise-name">' +
                            escapeHtml(exercise.name) +
                            groupBadge +
                        "</span>" +
                        '<span class="strength-exercise-tags">' +
                            escapeHtml(exerciseTags) +
                        "</span>" +
                        '<span class="strength-exercise-prescription">' +
                            escapeHtml(formatExercisePrescription(exercise)) +
                        "</span>" +
                    "</span>" +
                "</span>",

                '<span class="strength-exercise-chevron" aria-hidden="true">' +
                    icon(detailsOpen ? "chevronUp" : "chevronDown") +
                "</span>",

            "</button>",

            detailHtml,

        "</div>"
    ].join("");
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
                            ${groupTypeLabel(groupType)}
                        </span>

                        <strong>
                            ${
                                groupType === "circuit"
                                    ? "Move through each exercise for the selected rounds."
                                    : groupType === "warmup"
                                        ? "A quick circuit to get warm before the session starts."
                                        : "Perform each exercise back-to-back before resting."
                            }
                        </strong>
                    </div>

                    <div class="strength-group-actions">

                        ${
                            groupType === "circuit" || groupType === "warmup"
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
                                                ) || (groupType === "warmup" ? 1 : 3)
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
                        THIS WORKOUT
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
                    data-open-group="warmup"
                >
                    + Warmup
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
                        <button type="button" class="strength-empty-exercise-message" data-open-picker>
                            <strong>Add your first exercises</strong>
                            <span>Pick several at once, or start from a template in the Workout Library.</span>
                        </button>
                    `
            }
        </div>

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

// The picker (2026-10-11 rework, after Hevy / Strong): tap rows to tick them,
// then "Add N exercises" or "Add as superset" once. Recent exercises show
// before anything is typed. Nothing is added behind the picker while it's open.
let pickerSelected = new Map();   // name (lower case) -> search result

function pickerKey(ex) {
    return String(ex?.name || "").trim().toLowerCase();
}

/** Exercises already used in any workout (newest workouts first) + My Library, for an empty search. */
function recentExercises() {
    const seen = new Set();
    const out = [];
    const days = [...(plan.days || [])].reverse();
    for (const day of days) {
        for (const ex of day.exercises || []) {
            const key = pickerKey(ex);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push({
                id: ex.exerciseId || ex.id,
                name: ex.name,
                equipment: ex.equipment || "",
                primaryMuscles: ex.primaryMuscles || [],
                image: ex.image || null,
                recent: true
            });
        }
    }
    for (const ex of searchCustomLibrary("")) {
        const key = pickerKey(ex);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(ex);
    }
    return out.slice(0, 20);
}

function renderPickerFooter() {
    const footer = $("exercisePickerFooter");
    if (!footer) return;
    const n = pickerSelected.size;
    footer.hidden = n === 0;
    const add = $("exercisePickerAdd");
    const sup = $("exercisePickerSuperset");
    if (add) add.textContent = n === 1 ? "Add 1 exercise" : `Add ${n} exercises`;
    if (sup) sup.hidden = n < 2;
    const count = $("exercisePickerCount");
    if (count) count.textContent = n ? `${n} selected` : "";
}

function showRecentInPicker() {
    const recent = recentExercises();
    renderSearchResults(recent, {
        heading: recent.length ? "Recent and My Library" : "",
        empty: "Search 800+ exercises by name, muscle or equipment."
    });
}

function openExerciseSearch() {
    const overlay =
        $("exerciseSearchOverlay");

    const input =
        $("exerciseSearchInput");

    pickerSelected = new Map();
    overlay?.classList.add("open");
    document.documentElement.classList.add("strength-picker-open");

    if (input) {
        input.value = "";
        // Focusing at once on a phone pops the keyboard over the recents; only on computers.
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) input.focus();
    }

    lastSearchResults = [];
    showRecentInPicker();
    renderPickerFooter();
}

function closeExerciseSearch() {
    $("exerciseSearchOverlay")
        ?.classList.remove("open");
    document.documentElement.classList.remove("strength-picker-open");
    pickerSelected = new Map();
}

function renderSearchResults(
    results,
    { heading = "", empty = "No matches. Try a different search, or add it to My Library." } = {}
) {
    const container =
        $("exerciseSearchResults");

    if (!container) return;

    lastSearchResults = results;

    const day = activeDay();
    const existing = new Set(
        (day?.exercises || [])
            .map(ex => pickerKey(ex))
            .filter(Boolean)
    );

    container.innerHTML =
        (heading && results.length ? `<p class="strength-picker-heading">${escapeHtml(heading)}</p>` : "") +
        (results.length
            ? results.map(
                (ex, index) => {
                    const key = pickerKey(ex);
                    const picked = pickerSelected.has(key);
                    const inWorkout = existing.has(key);
                    const meta = [ex.equipment, (ex.primaryMuscles || []).join(", ")].filter(Boolean).join(" · ");
                    return `
                    <button
                        type="button"
                        class="strength-result${picked ? " is-picked" : ""}${inWorkout ? " is-added" : ""}"
                        data-pick-result="${index}"
                        aria-pressed="${picked}"
                    >
                        ${
                            ex.image
                                ? `<img class="strength-result-image" src="${escapeHtml(ex.image)}" alt="" loading="lazy">`
                                : `<span class="strength-result-image strength-result-image-empty">${icon("dumbbell")}</span>`
                        }
                        <span class="strength-result-info">
                            <strong>
                                ${escapeHtml(ex.name)}
                                ${ex.isCustom ? `<span class="strength-custom-badge">My Library</span>` : ""}
                            </strong>
                            <span>${escapeHtml(meta)}${inWorkout ? `${meta ? " · " : ""}<em>in this workout</em>` : ""}</span>
                        </span>
                        <span class="strength-result-check" aria-hidden="true">${icon("check")}</span>
                    </button>`;
                }
            ).join("")
            : `
                <div class="strength-search-empty">
                    ${escapeHtml(empty)}
                </div>
            `);
}

function togglePick(index) {
    const ex = lastSearchResults[index];
    if (!ex) return;
    const key = pickerKey(ex);
    if (pickerSelected.has(key)) pickerSelected.delete(key);
    else pickerSelected.set(key, ex);
    const row = document.querySelector(`[data-pick-result="${index}"]`);
    if (row) {
        const picked = pickerSelected.has(key);
        row.classList.toggle("is-picked", picked);
        row.setAttribute("aria-pressed", String(picked));
    }
    renderPickerFooter();
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

function addExercises(
    exercises,
    { superset = false } = {}
) {
    const day = activeDay();
    if (!day || !exercises.length) return;

    const groupId = superset && exercises.length > 1 ? uid() : null;
    const items = exercises.map(exercise =>
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
            notes: "",
            groupId,
            groupType: groupId ? "superset" : null
        })
    );

    day.exercises.push(...items);

    savePlan();
    closeExerciseSearch();
    renderAll();
    revealExercises(items.map(item => item.id));

    const ids = new Set(items.map(item => item.id));
    toast(
        items.length === 1
            ? `${items[0].name} added.`
            : `${items.length} exercises added${groupId ? " as a superset" : ""}.`,
        {
            type: "success",
            action: {
                label: "Undo",
                onClick: () => {
                    const current = plan.days.find(d => d.id === day.id);
                    if (!current) return;
                    current.exercises = current.exercises.filter(ex => !ids.has(ex.id));
                    cleanupGroups(current);
                    savePlan();
                    renderAll();
                }
            }
        }
    );
}

// Kept for anything that adds one exercise directly.
function addExercise(exercise) {
    addExercises([exercise]);
}

/** Scroll the builder to the first of these exercises and flash them so it's clear where they went. */
function revealExercises(ids) {
    requestAnimationFrame(() => {
        const cards = ids
            .map(id => document.querySelector(`#strengthExerciseList .strength-exercise-block[data-exercise-id="${id}"]`))
            .filter(Boolean);
        if (!cards.length) return;
        cards[0].scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        cards.forEach(card => {
            card.classList.add("is-new");
            setTimeout(() => card.classList.remove("is-new"), 1600);
        });
    });
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

function getGroupMembers(groupId, day = activeDay()) {
    if (!day || !groupId) {
        return [];
    }

    return day.exercises.filter(
        exercise => exercise.groupId === groupId
    );
}

function openGroupModal(
    type,
    groupId = null
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
        normalizeGroupType(type) ||
        "superset";

    pendingGroupId =
        groupId || null;

    const existingMembers =
        getGroupMembers(groupId, day);

    const availableExercises =
        day.exercises.filter(
            exercise =>
                groupId
                    ? !exercise.groupId
                    : !exercise.groupId
        );

    const title =
        $("strengthGroupModalTitle");

    const help =
        overlay.querySelector(
            ".strength-group-modal-help"
        );

    const saveButton =
        $("strengthGroupSave");

    if (pendingGroupId) {
        if (title) {
            title.textContent =
                `Add to ${groupTypeLabel(pendingGroupType)}`;
        }

        if (help) {
            const memberNames =
                existingMembers
                    .map(exercise => exercise.name)
                    .join(" + ");

            help.textContent =
                memberNames
                    ? `Add another exercise to ${memberNames}. The existing group members stay selected automatically.`
                    : "Choose one or more ungrouped exercises to add to this group.";
        }

        if (saveButton) {
            saveButton.textContent =
                "Add Exercise";
            saveButton.disabled =
                availableExercises.length === 0;
        }
    } else {
        if (title) {
            title.textContent =
                `Create ${groupTypeLabel(pendingGroupType)}`;
        }

        if (help) {
            help.textContent =
                "Select two or more ungrouped exercises. Southbound keeps their current order when it creates the group.";
        }

        if (saveButton) {
            saveButton.textContent =
                "Create Group";
            saveButton.disabled =
                availableExercises.length < 2;
        }
    }

    if (!availableExercises.length) {
        list.innerHTML = `
            <div class="strength-group-empty">
                <strong>No ungrouped exercises available.</strong>
                <span>Add another exercise to this workout first.</span>
            </div>
        `;
    } else {
        list.innerHTML =
            availableExercises.map(
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
                                Ready to add
                            </small>
                        </span>

                    </label>
                `
            ).join("");
    }

    overlay.classList.add(
        "open"
    );
}

function closeGroupModal() {
    $("strengthGroupOverlay")
        ?.classList.remove("open");

    pendingGroupId = null;
}

function createGroupFromModal() {
    const day = activeDay();

    if (!day) return;

    const ids =
        Array.from(
            document.querySelectorAll(
                "#strengthGroupOverlay [data-group-choice]:checked"
            )
        ).map(
            input =>
                input.value
        );

    if (pendingGroupId) {
        addExercisesToGroupFromModal(
            pendingGroupId,
            ids
        );

        return;
    }

    if (ids.length < 2) {
        toast("Select at least two exercises.", { type: "info" });

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
                ) &&
                !ex.groupId
        );

    if (members.length < 2) {
        toast("Select at least two ungrouped exercises.", { type: "info" });

        return;
    }

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

    if (pendingGroupType === "circuit") {
        day.groupRounds[groupId] = 3;
    } else if (pendingGroupType === "warmup") {
        day.groupRounds[groupId] = 1;
    }

    savePlan();
    closeGroupModal();
    renderAll();
}

function addExercisesToGroupFromModal(
    groupId,
    ids
) {
    const day = activeDay();

    if (!day) return;

    const groupMembers =
        getGroupMembers(groupId, day);

    if (!groupMembers.length) {
        toast("That group is no longer available.", { type: "info" });
        closeGroupModal();
        return;
    }

    if (!ids.length) {
        toast("Choose at least one exercise to add.", { type: "info" });
        return;
    }

    const selected =
        new Set(ids);

    const selectedExercises =
        day.exercises.filter(
            exercise =>
                selected.has(exercise.id) &&
                !exercise.groupId
        );

    if (!selectedExercises.length) {
        toast("Choose an ungrouped exercise to add.", { type: "info" });
        return;
    }

    const targetType =
        normalizeGroupType(
            groupMembers[0].groupType
        ) || "superset";

    selectedExercises.forEach(
        exercise => {
            exercise.groupId =
                groupId;

            exercise.groupType =
                targetType;
        }
    );

    const original =
        [...day.exercises];

    const remaining =
        original.filter(
            exercise =>
                !selected.has(exercise.id)
        );

    const lastGroupMemberId =
        groupMembers[groupMembers.length - 1].id;

    const lastGroupIndex =
        remaining.findIndex(
            exercise =>
                exercise.id === lastGroupMemberId
        );

    remaining.splice(
        lastGroupIndex >= 0
            ? lastGroupIndex + 1
            : remaining.length,
        0,
        ...selectedExercises
    );

    day.exercises =
        remaining;

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
            event.target.closest("button") || event.target;  // a tap on the icon or label inside a button counts

        const tab =
            target.closest(
                ".strength-day-tab"
            );

        const removeDayBtn =
            target.closest(
                ".strength-day-tab-remove"
            );

        if (
            tab &&
            !removeDayBtn
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

        if (removeDayBtn) {
            removeDay(
                removeDayBtn.dataset
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

            setTimeout(
                () => openStrengthEditor(newId),
                120
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

        const pickBtn =
            target.closest(
                "[data-pick-result]"
            );

        if (pickBtn) {
            togglePick(Number(pickBtn.dataset.pickResult));
            return;
        }

        if (target.closest("#exercisePickerAdd") || target.closest("#exercisePickerSuperset")) {
            addExercises([...pickerSelected.values()], { superset: !!target.closest("#exercisePickerSuperset") });
            return;
        }

        if (target.closest("[data-open-picker]")) {
            openExerciseSearch();
            return;
        }

        const removeExerciseBtn =
            target.closest(
                "[data-remove-exercise]"
            );

        if (removeExerciseBtn) {
            const day = activeDay();

            if (day) {
                const before = JSON.parse(JSON.stringify(day.exercises));
                const gone = day.exercises.find(ex => ex.id === removeExerciseBtn.dataset.removeExercise);
                day.exercises =
                    day.exercises.filter(
                        ex =>
                            ex.id !==
                            removeExerciseBtn.dataset
                                .removeExercise
                    );

                cleanupGroups(day);
                savePlan();
                renderAll();
                toast(`${gone?.name || "Exercise"} removed.`, {
                    action: {
                        label: "Undo",
                        onClick: () => {
                            const current = plan.days.find(d => d.id === day.id);
                            if (!current) return;
                            current.exercises = before.map(normalizeExercise);
                            savePlan();
                            renderAll();
                        }
                    }
                });
            }

            return;
        }

        const duplicateExerciseBtn =
            target.closest(
                "[data-duplicate-exercise]"
            );

        if (duplicateExerciseBtn) {
            const day = activeDay();

            const source =
                day?.exercises.find(
                    ex =>
                        ex.id ===
                        duplicateExerciseBtn.dataset
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

        const moveUpBtn =
            target.closest(
                "[data-move-up]"
            );

        if (moveUpBtn) {
            moveExercise(
                moveUpBtn.dataset
                    .moveUp,
                -1
            );

            return;
        }

        const moveDownBtn =
            target.closest(
                "[data-move-down]"
            );

        if (moveDownBtn) {
            moveExercise(
                moveDownBtn.dataset
                    .moveDown,
                1
            );

            return;
        }

        const toggleModeBtn =
            target.closest(
                "[data-toggle-mode]"
            );

        if (toggleModeBtn) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        toggleModeBtn.dataset
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

        const toggleDetailsBtn =
            target.closest(
                "[data-toggle-details]"
            );

        if (toggleDetailsBtn) {
            const id =
                toggleDetailsBtn.dataset
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
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        target.dataset
                            .groupExercise
                );

            if (exercise) {
                openGroupModal(
                    exercise.groupType ||
                    "superset",
                    exercise.groupId ||
                    null
                );
            }

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
            const groupId =
                target.dataset.addToGroup;

            const groupMember =
                activeDay()?.exercises.find(
                    ex =>
                        ex.groupId ===
                        groupId
                );

            if (groupMember) {
                openGroupModal(
                    groupMember.groupType ||
                    "superset",
                    groupId
                );
            }

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

        const toggleSetBtn =
            target.closest(
                "[data-toggle-set]"
            );

        if (toggleSetBtn) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        toggleSetBtn.dataset
                            .exerciseId
                );

            const set =
                exercise?.sets.find(
                    item =>
                        item.id ===
                        toggleSetBtn.dataset
                            .toggleSet
                );

            if (exercise && set) {
                set.done =
                    !set.done;

                savePlan();

                toggleSetBtn.classList.toggle(
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

        const addSetBtn =
            target.closest(
                "[data-add-set]"
            );

        if (addSetBtn) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        addSetBtn.dataset
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

        const removeSetBtn =
            target.closest(
                "[data-remove-set]"
            );

        if (removeSetBtn) {
            const exercise =
                activeDay()?.exercises.find(
                    ex =>
                        ex.id ===
                        removeSetBtn.dataset
                            .exerciseId
                );

            if (exercise) {
                exercise.sets =
                    exercise.sets.filter(
                        set =>
                            set.id !==
                            removeSetBtn.dataset
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

        if (!event.target.closest(".strength-drag-handle")) {
            return;
        }

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
                showRecentInPicker();
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
                                ? normalizeGroupType(exercise.groupType) || "superset"
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
                } else if (
                    sourceExercise?.groupType ===
                    "warmup"
                ) {
                    groupRounds[
                        newGroupId
                    ] =
                        Number(
                            workout.rounds
                        ) || 1;
                }
            }
        );

        if (mode === "current") {
            const day =
                activeDay();

            if (!day) {
                toast("Create or select a Strength day first.", { type: "info" });
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
   Compact workspace editor hooks
========================================== */

function openStrengthEditor(dayId = null) {
    if (
        dayId &&
        plan.days.some(
            day => day.id === dayId
        )
    ) {
        plan.activeDay = dayId;
        savePlan();
        renderAll();
    }

    const overlay =
        document.getElementById(
            "strengthEditorOverlay"
        );

    overlay?.classList.add("open");
    document.documentElement.classList.add("strength-editor-open");
}

function closeStrengthEditor() {
    closeExerciseSearch();
    document
        .getElementById(
            "strengthEditorOverlay"
        )
        ?.classList.remove("open");
    document.documentElement.classList.remove("strength-editor-open");
}

// Escape closes the top-most layer: the picker first, then the builder.
document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if ($("exerciseSearchOverlay")?.classList.contains("open")) { closeExerciseSearch(); return; }
    if (document.querySelector(".strength-group-overlay.open, .strength-rename-overlay.open, .strength-schedule-overlay.open")) return;
    if ($("strengthEditorOverlay")?.classList.contains("open")) closeStrengthEditor();
});

window.addEventListener(
    "eddieos:strength-open-editor",
    event => {
        openStrengthEditor(
            event.detail?.dayId ||
            null
        );
    }
);

window.addEventListener(
    "eddieos:strength-close-editor",
    () => {
        closeStrengthEditor();
    }
);

window.addEventListener(
    "eddieos:strength-create-workout",
    () => {
        const newId = createDay(
            "New Workout",
            []
        );

        openStrengthEditor(newId);
    }
);

document.addEventListener(
    "click",
    event => {
        const target =
            event.target.closest("button") || event.target;  // a tap on the icon or label inside a button counts

        if (
            target.matches(
                "#strengthEditorClose"
            )
        ) {
            closeStrengthEditor();
        }

        if (
            target.matches(
                "#strengthEditorSaveLibrary"
            )
        ) {
            document
                .getElementById(
                    "strengthLibrarySaveCurrent"
                )
                ?.click();
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
