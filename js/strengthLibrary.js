/* ==========================================
   Southbound Strength Workout Library UI
========================================== */

import { BUILT_IN_WORKOUTS } from "./strengthLibraryData.js";
import { icon } from "./icons.js";

const LIBRARY_KEY = "strength-workout-library";
const FAVORITES_KEY = "strength-workout-favorites";

const $ = id => document.getElementById(id);

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));

    import("./cloudSync.js")
        .then(({ pushToCloud }) => pushToCloud())
        .catch(() => {});
}

function libraryData() {
    const data = readJson(
        LIBRARY_KEY,
        {
            version: 1,
            folders: ["My Workouts"],
            workouts: []
        }
    );

    if (!data || !Array.isArray(data.workouts)) {
        return {
            version: 1,
            folders: ["My Workouts"],
            workouts: []
        };
    }

    data.folders = Array.isArray(data.folders)
        ? data.folders
        : ["My Workouts"];

    return data;
}

function favorites() {
    return new Set(
        readJson(
            FAVORITES_KEY,
            []
        )
    );
}

function allWorkouts() {
    return [
        ...BUILT_IN_WORKOUTS,
        ...libraryData().workouts.map(workout => ({
            ...workout,
            source: "My Library",
            custom: true
        }))
    ];
}

function activeLibraryView() {
    return (
        document.querySelector(
            ".strength-library-filter-btn.active"
        )?.dataset.view ||
        "all"
    );
}

function filteredWorkouts() {
    const search =
        $("strengthLibrarySearch")
            ?.value
            .trim()
            .toLowerCase() ||
        "";

    const category =
        $("strengthLibraryCategory")
            ?.value ||
        "all";

    const goal =
        $("strengthLibraryGoal")
            ?.value ||
        "all";

    const equipment =
        $("strengthLibraryEquipment")
            ?.value ||
        "all";

    const duration =
        $("strengthLibraryDuration")
            ?.value ||
        "all";

    const level =
        $("strengthLibraryLevel")
            ?.value ||
        "all";

    const folder =
        $("strengthLibraryFolder")
            ?.value ||
        "all";

    const view =
        activeLibraryView();

    const favs =
        favorites();

    return allWorkouts()
        .filter(workout => {
            if (
                view === "favorites" &&
                !favs.has(workout.id)
            ) {
                return false;
            }

            if (
                view === "mine" &&
                !workout.custom
            ) {
                return false;
            }

            if (
                category !== "all" &&
                workout.category !== category
            ) {
                return false;
            }

            if (
                goal !== "all" &&
                workout.goal !== goal
            ) {
                return false;
            }

            if (
                equipment !== "all" &&
                workout.equipment !== equipment
            ) {
                return false;
            }

            if (
                level !== "all" &&
                workout.level !== level
            ) {
                return false;
            }

            if (
                folder !== "all" &&
                workout.folder !== folder
            ) {
                return false;
            }

            if (
                duration !== "all"
            ) {
                const minutes =
                    Number(workout.minutes) || 0;

                if (
                    duration === "20" &&
                    minutes > 20
                ) return false;

                if (
                    duration === "30" &&
                    (minutes < 21 || minutes > 30)
                ) return false;

                if (
                    duration === "45" &&
                    (minutes < 31 || minutes > 45)
                ) return false;

                if (
                    duration === "60" &&
                    minutes < 46
                ) return false;
            }

            if (search) {
                const haystack = [
                    workout.name,
                    workout.category,
                    workout.goal,
                    workout.focus,
                    workout.equipment,
                    workout.style,
                    workout.description,
                    ...(workout.tags || []),
                    ...(workout.exercises || []).map(
                        ex => ex.name
                    )
                ]
                    .join(" ")
                    .toLowerCase();

                if (!haystack.includes(search)) {
                    return false;
                }
            }

            return true;
        })
        .sort((a, b) => {
            const favoriteA =
                favs.has(a.id) ? 1 : 0;

            const favoriteB =
                favs.has(b.id) ? 1 : 0;

            if (favoriteA !== favoriteB) {
                return favoriteB - favoriteA;
            }

            return a.name.localeCompare(b.name);
        });
}

function uniqueValues(field) {
    return [
        ...new Set(
            allWorkouts()
                .map(item => item[field])
                .filter(Boolean)
        )
    ].sort();
}

function setSelectOptions(id, values, label) {
    const select = $(id);
    if (!select) return;

    const previous = select.value;

    select.innerHTML =
        `<option value="all">${label}</option>` +
        values
            .map(
                value =>
                    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
            )
            .join("");

    if (
        values.includes(previous)
    ) {
        select.value = previous;
    }
}

function renderFolderOptions() {
    const data = libraryData();

    setSelectOptions(
        "strengthLibraryFolder",
        data.folders,
        "All folders"
    );
}

function renderFilters() {
    setSelectOptions(
        "strengthLibraryCategory",
        uniqueValues("category"),
        "All categories"
    );

    setSelectOptions(
        "strengthLibraryGoal",
        uniqueValues("goal"),
        "All goals"
    );

    setSelectOptions(
        "strengthLibraryEquipment",
        uniqueValues("equipment"),
        "All equipment"
    );

    setSelectOptions(
        "strengthLibraryLevel",
        uniqueValues("level"),
        "All levels"
    );

    renderFolderOptions();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function workoutCard(workout) {
    const isFavorite =
        favorites().has(workout.id);

    const exerciseCount =
        (workout.exercises || []).length;

    return `
        <article
            class="strength-library-card"
            data-library-id="${escapeHtml(workout.id)}">

            <div class="strength-library-card-top">

                <div class="strength-library-card-badges">

                    <span class="strength-library-badge">
                        ${escapeHtml(workout.category)}
                    </span>

                    ${
                        workout.custom
                            ? `
                                <span class="strength-library-badge mine">
                                    My Library
                                </span>
                            `
                            : `
                                <span class="strength-library-badge original">
                                    Southbound
                                </span>
                            `
                    }

                </div>

                <button
                    type="button"
                    class="strength-library-favorite ${
                        isFavorite ? "active" : ""
                    }"
                    data-library-favorite="${escapeHtml(workout.id)}"
                    title="${
                        isFavorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                    }"
                >
                    ${isFavorite ? icon("starFilled") : icon("star")}
                </button>

            </div>

            <div class="strength-library-card-title">
                ${escapeHtml(workout.name)}
            </div>

            <p class="strength-library-card-description">
                ${escapeHtml(workout.description)}
            </p>

            <div class="strength-library-meta">

                <span>
                    ${icon("timer")} ${Number(workout.minutes) || 0} min
                </span>

                <span>
                    ${escapeHtml(workout.level)}
                </span>

                <span>
                    ${exerciseCount} exercises
                </span>

            </div>

            <div class="strength-library-focus">
                ${escapeHtml(workout.focus)}
            </div>

            <div class="strength-library-actions">

                <button
                    type="button"
                    class="strength-library-btn primary"
                    data-library-use="${escapeHtml(workout.id)}"
                    data-use-mode="new"
                >
                    Use Workout
                </button>

                <button
                    type="button"
                    class="strength-library-btn"
                    data-library-schedule="${escapeHtml(workout.id)}"
                >
                    Schedule
                </button>

                <button
                    type="button"
                    class="strength-library-btn"
                    data-library-preview="${escapeHtml(workout.id)}"
                >
                    Preview
                </button>

            </div>

            ${
                workout.custom
                    ? `
                        <div class="strength-library-custom-actions">

                            <select
                                class="strength-library-folder-select"
                                data-library-folder-change="${escapeHtml(workout.id)}"
                            >
                                ${libraryData().folders
                                    .map(
                                        folder =>
                                            `<option value="${escapeHtml(folder)}"
                                                ${
                                                    workout.folder === folder
                                                        ? "selected"
                                                        : ""
                                                }>
                                                ${escapeHtml(folder)}
                                            </option>`
                                    )
                                    .join("")}
                            </select>

                            <button
                                type="button"
                                class="strength-library-delete"
                                data-library-delete="${escapeHtml(workout.id)}"
                            >
                                Delete
                            </button>

                        </div>
                    `
                    : `
                        <button
                            type="button"
                            class="strength-library-save-copy"
                            data-library-copy="${escapeHtml(workout.id)}"
                        >
                            Save a Copy to My Library
                        </button>
                    `
            }

        </article>
    `;
}

function renderLibrary() {
    const container =
        $("strengthLibraryGrid");

    const count =
        $("strengthLibraryCount");

    if (!container) return;

    renderFilters();

    const results =
        filteredWorkouts();

    container.innerHTML =
        results.length
            ? results.map(workoutCard).join("")
            : `
                <div class="strength-library-empty">
                    <strong>No workouts found.</strong>
                    <span>Try changing the filters or search.</span>
                </div>
            `;

    if (count) {
        count.textContent =
            `${results.length} workout${
                results.length === 1
                    ? ""
                    : "s"
            }`;
    }
}

function findWorkout(id) {
    return allWorkouts().find(
        workout =>
            workout.id === id
    );
}

function toggleFavorite(id) {
    const set =
        favorites();

    if (set.has(id)) {
        set.delete(id);
    } else {
        set.add(id);
    }

    writeJson(
        FAVORITES_KEY,
        [...set]
    );

    renderLibrary();
}

function useWorkout(id, mode) {
    const workout =
        findWorkout(id);

    if (!workout) return;

    window.dispatchEvent(
        new CustomEvent(
            "eddieos:use-strength-workout",
            {
                detail: {
                    workout,
                    mode
                }
            }
        )
    );

    closePreview();
}

function previewWorkout(id) {
    const workout =
        findWorkout(id);

    if (!workout) return;

    const modal =
        $("strengthLibraryPreviewOverlay");

    const title =
        $("strengthLibraryPreviewTitle");

    const body =
        $("strengthLibraryPreviewBody");

    if (!modal || !body) return;

    if (title) {
        title.textContent =
            workout.name;
    }

    const groups = new Map();

    (workout.exercises || []).forEach(
        exercise => {
            const group =
                exercise.group ||
                `single-${exercise.name}`;

            if (!groups.has(group)) {
                groups.set(group, []);
            }

            groups.get(group).push(
                exercise
            );
        }
    );

    body.innerHTML = `
        <div class="strength-library-preview-summary">

            <span>${escapeHtml(workout.category)}</span>
            <span>${escapeHtml(workout.goal)}</span>
            <span>${Number(workout.minutes) || 0} min</span>
            <span>${escapeHtml(workout.level)}</span>
            <span>${escapeHtml(workout.equipment)}</span>

        </div>

        <p class="strength-library-preview-description">
            ${escapeHtml(workout.description)}
        </p>

        <div class="strength-library-preview-list">

            ${
                [...groups.values()]
                    .map(
                        exercises => {
                            const first =
                                exercises[0];

                            const isGroup =
                                exercises.length > 1 &&
                                first.group;

                            return `
                                <div class="strength-library-preview-group">

                                    ${
                                        isGroup
                                            ? `
                                                <div class="strength-library-preview-group-title">
                                                    ${
                                                        first.groupType === "circuit"
                                                            ? `Circuit`
                                                            : first.groupType === "warmup"
                                                                ? `Warmup`
                                                                : `Superset`
                                                    }
                                                </div>
                                            `
                                            : ""
                                    }

                                    ${
                                        exercises
                                            .map(
                                                exercise =>
                                                    `
                                                        <div class="strength-library-preview-row">

                                                            <strong>
                                                                ${escapeHtml(
                                                                    exercise.name
                                                                )}
                                                            </strong>

                                                            <span>
                                                                ${
                                                                    exercise.mode === "time"
                                                                        ? `${exercise.sets} × ${exercise.duration}s`
                                                                        : `${exercise.sets} × ${exercise.reps}`
                                                                }
                                                            </span>

                                                        </div>
                                                    `
                                            )
                                            .join("")
                                    }

                                </div>
                            `;
                        }
                    )
                    .join("")
            }

        </div>

        <div class="strength-library-preview-actions">

            <button
                type="button"
                class="strength-template-btn"
                data-preview-use="${escapeHtml(workout.id)}"
                data-use-mode="new"
            >
                Create New Day
            </button>

            <button
                type="button"
                class="strength-template-btn strength-template-btn-outline"
                data-preview-use="${escapeHtml(workout.id)}"
                data-use-mode="current"
            >
                Add to Current Day
            </button>

        </div>
    `;

    modal.classList.add("open");
}

function closePreview() {
    $("strengthLibraryPreviewOverlay")
        ?.classList.remove("open");
}

function saveCurrentWorkout() {
    let current;

    try {
        current =
            JSON.parse(
                localStorage.getItem(
                    "strength-plan"
                ) || "null"
            );
    } catch {
        current = null;
    }

    const day =
        current?.days?.find(
            item =>
                item.id ===
                current.activeDay
        );

    if (!day) {
        alert(
            "Select a Strength day before saving it to the library."
        );
        return;
    }

    $("strengthSaveWorkoutName").value =
        day.name;

    const data =
        libraryData();

    $("strengthSaveWorkoutFolder").innerHTML =
        data.folders
            .map(
                folder =>
                    `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`
            )
            .join("");

    $("strengthSaveWorkoutDescription").value = "";
    $("strengthSaveWorkoutOverlay")
        ?.classList.add("open");
}

function saveWorkoutFromForm() {
    let current;

    try {
        current =
            JSON.parse(
                localStorage.getItem(
                    "strength-plan"
                ) || "null"
            );
    } catch {
        current = null;
    }

    const day =
        current?.days?.find(
            item =>
                item.id ===
                current.activeDay
        );

    if (!day) return;

    const name =
        $("strengthSaveWorkoutName")
            ?.value
            .trim();

    if (!name) {
        alert(
            "Give the workout a name."
        );
        return;
    }

    const data =
        libraryData();

    const folder =
        $("strengthSaveWorkoutFolder")
            ?.value ||
        "My Workouts";

    const workout = {
        id:
            `user-${crypto.randomUUID()}`,
        name,
        source: "My Library",
        custom: true,
        category: "My Workouts",
        goal: "Custom",
        focus: "Custom Workout",
        minutes:
            Number(
                day.estimatedMinutes
            ) || 45,
        level: "Custom",
        equipment: "Mixed",
        style: "Custom",
        description:
            $("strengthSaveWorkoutDescription")
                ?.value
                .trim() ||
            "Custom workout saved from Southbound Strength.",
        tags: ["custom"],
        folder,
        exercises:
            day.exercises.map(
                exercise => ({
                    name:
                        exercise.name,
                    sets:
                        exercise.sets?.length ||
                        1,
                    reps:
                        exercise.mode === "time"
                            ? 0
                            : Number(
                                exercise.sets?.[0]?.reps
                            ) || 0,
                    duration:
                        Number(
                            exercise.sets?.[0]?.duration
                        ) || 30,
                    mode:
                        exercise.mode === "time"
                            ? "time"
                            : "reps",
                    restSeconds:
                        Number(
                            exercise.restSeconds
                        ) || 90,
                    group:
                        exercise.groupId ||
                        null,
                    groupType:
                        exercise.groupType ||
                        null
                })
            )
    };

    data.workouts.push(
        workout
    );

    if (
        !data.folders.includes(
            folder
        )
    ) {
        data.folders.push(folder);
    }

    saveMyWorkouts(data);
    closeSaveWorkout();
    renderLibrary();
}

function saveMyWorkouts(data) {
    writeJson(
        LIBRARY_KEY,
        data
    );
}

function copyToMyLibrary(id) {
    const workout =
        findWorkout(id);

    if (!workout) return;

    const data =
        libraryData();

    let name =
        prompt(
            "Name your copy:",
            workout.name
        );

    if (!name?.trim()) return;

    const folder =
        prompt(
            `Folder (${data.folders.join(", ")}):`,
            data.folders[0] || "My Workouts"
        ) ||
        data.folders[0] ||
        "My Workouts";

    if (
        !data.folders.includes(
            folder
        )
    ) {
        data.folders.push(
            folder
        );
    }

    const copy =
        JSON.parse(
            JSON.stringify(
                workout
            )
        );

    copy.id =
        `user-${crypto.randomUUID()}`;

    copy.name =
        name.trim();

    copy.source =
        "My Library";

    copy.custom =
        true;

    copy.folder =
        folder;

    data.workouts.push(
        copy
    );

    saveMyWorkouts(data);
    renderLibrary();
}

function deleteMyWorkout(id) {
    const data =
        libraryData();

    const workout =
        data.workouts.find(
            item =>
                item.id === id
        );

    if (!workout) return;

    if (
        !confirm(
            `Delete "${workout.name}" from My Library?`
        )
    ) {
        return;
    }

    data.workouts =
        data.workouts.filter(
            item =>
                item.id !== id
        );

    saveMyWorkouts(data);

    const favs =
        favorites();

    favs.delete(id);

    writeJson(
        FAVORITES_KEY,
        [...favs]
    );

    renderLibrary();
}

function moveMyWorkout(
    id,
    folder
) {
    const data =
        libraryData();

    const workout =
        data.workouts.find(
            item =>
                item.id === id
        );

    if (!workout) return;

    workout.folder =
        folder;

    if (
        !data.folders.includes(
            folder
        )
    ) {
        data.folders.push(
            folder
        );
    }

    saveMyWorkouts(data);
    renderLibrary();
}

function createFolder() {
    const name =
        prompt(
            "New library folder name:"
        )?.trim();

    if (!name) return;

    const data =
        libraryData();

    if (
        data.folders.includes(
            name
        )
    ) {
        alert(
            "That folder already exists."
        );
        return;
    }

    data.folders.push(
        name
    );

    saveMyWorkouts(data);
    renderFolderOptions();
}

function closeSaveWorkout() {
    $("strengthSaveWorkoutOverlay")
        ?.classList.remove("open");
}

function init() {
    renderLibrary();

    const events = [
        "strengthLibrarySearch",
        "strengthLibraryCategory",
        "strengthLibraryGoal",
        "strengthLibraryEquipment",
        "strengthLibraryDuration",
        "strengthLibraryLevel",
        "strengthLibraryFolder"
    ];

    events.forEach(id => {
        $(id)?.addEventListener(
            "input",
            renderLibrary
        );

        $(id)?.addEventListener(
            "change",
            renderLibrary
        );
    });

    document.addEventListener(
        "click",
        event => {
            const target =
                event.target;

            const favoriteBtn =
                target.closest(
                    "[data-library-favorite]"
                );

            if (favoriteBtn) {
                toggleFavorite(
                    favoriteBtn.dataset
                        .libraryFavorite
                );
                return;
            }

            if (
                target.matches(
                    "[data-library-schedule]"
                )
            ) {
                window.dispatchEvent(
                    new CustomEvent(
                        "eddieos:strength-schedule-workout",
                        {
                            detail: {
                                workoutId:
                                    target.dataset
                                        .librarySchedule
                            }
                        }
                    )
                );

                return;
            }

            if (
                target.matches(
                    "[data-library-preview]"
                )
            ) {
                previewWorkout(
                    target.dataset
                        .libraryPreview
                );
                return;
            }

            if (
                target.matches(
                    "[data-library-use]"
                )
            ) {
                useWorkout(
                    target.dataset
                        .libraryUse,
                    target.dataset
                        .useMode ||
                        "new"
                );
                return;
            }

            if (
                target.matches(
                    "[data-preview-use]"
                )
            ) {
                useWorkout(
                    target.dataset
                        .previewUse,
                    target.dataset
                        .useMode ||
                        "new"
                );
                return;
            }

            if (
                target.matches(
                    "[data-library-copy]"
                )
            ) {
                copyToMyLibrary(
                    target.dataset
                        .libraryCopy
                );
                return;
            }

            if (
                target.matches(
                    "[data-library-delete]"
                )
            ) {
                deleteMyWorkout(
                    target.dataset
                        .libraryDelete
                );
                return;
            }

            if (
                target.matches(
                    "[data-library-folder-change]"
                )
            ) {
                moveMyWorkout(
                    target.dataset
                        .libraryFolderChange,
                    target.value
                );
                return;
            }

            const filterButton =
                target.closest(
                    ".strength-library-filter-btn"
                );

            if (filterButton) {
                document
                    .querySelectorAll(
                        ".strength-library-filter-btn"
                    )
                    .forEach(
                        button =>
                            button.classList.remove(
                                "active"
                            )
                    );

                filterButton.classList.add(
                    "active"
                );

                renderLibrary();
                return;
            }

            if (
                target.matches(
                    "#strengthLibrarySaveCurrent"
                )
            ) {
                saveCurrentWorkout();
                return;
            }

            if (
                target.matches(
                    "#strengthLibraryNewFolder"
                )
            ) {
                createFolder();
                return;
            }

            if (
                target.matches(
                    "#strengthLibraryClosePreview"
                ) ||
                target.matches(
                    "#strengthLibraryPreviewOverlay"
                )
            ) {
                closePreview();
                return;
            }

            if (
                target.matches(
                    "#strengthSaveWorkoutCancel"
                ) ||
                target.matches(
                    "#strengthSaveWorkoutOverlay"
                )
            ) {
                closeSaveWorkout();
                return;
            }

            if (
                target.matches(
                    "#strengthSaveWorkoutConfirm"
                )
            ) {
                saveWorkoutFromForm();
            }
        }
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}

export {
    renderLibrary,
    useWorkout
};
