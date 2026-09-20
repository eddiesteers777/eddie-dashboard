/* ==========================================
   EddieOS Strength Schedule

   Keeps scheduling separate from workout design.

   A workout is a reusable template.
   A schedule entry is a dated instance of that
   template.

   Storage:
   - strength-schedule
========================================== */

import { BUILT_IN_WORKOUTS } from "./strengthLibraryData.js";
import { icon } from "./icons.js";

const SCHEDULE_KEY = "strength-schedule";
const LIBRARY_KEY = "strength-workout-library";

let currentMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
);

let selectedDate =
    new Date();

const $ = id =>
    document.getElementById(id);

function uid() {
    return crypto.randomUUID();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function dateKey(date) {
    const y =
        date.getFullYear();

    const m =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const d =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${y}-${m}-${d}`;
}

function parseKey(key) {
    const [
        year,
        month,
        day
    ] = key
        .split("-")
        .map(Number);

    return new Date(
        year,
        month - 1,
        day
    );
}

function formatDateLong(date) {
    return date.toLocaleDateString(
        undefined,
        {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    );
}

function loadSchedule() {
    try {
        const raw =
            localStorage.getItem(
                SCHEDULE_KEY
            );

        const value =
            raw
                ? JSON.parse(raw)
                : null;

        if (
            value &&
            Array.isArray(
                value.items
            )
        ) {
            return value;
        }
    } catch {}

    return {
        version: 1,
        items: []
    };
}

function saveSchedule(data) {
    localStorage.setItem(
        SCHEDULE_KEY,
        JSON.stringify(data)
    );

    import("./cloudSync.js")
        .then(
            ({ pushToCloud }) =>
                pushToCloud()
        )
        .catch(() => {});
}

function loadWorkoutLibrary() {
    try {
        const raw =
            localStorage.getItem(
                LIBRARY_KEY
            );

        const data =
            raw
                ? JSON.parse(raw)
                : null;

        if (
            data &&
            Array.isArray(
                data.workouts
            )
        ) {
            return data;
        }
    } catch {}

    return {
        version: 1,
        folders: ["My Workouts"],
        workouts: []
    };
}

function loadPlanDays() {
    try {
        const raw =
            localStorage.getItem(
                "strength-plan"
            );

        const data =
            raw
                ? JSON.parse(raw)
                : null;

        return Array.isArray(
            data?.days
        )
            ? data.days
            : [];
    } catch {
        return [];
    }
}

function planDayAsWorkout(day) {
    return {
        id:
            `plan-${day.id}`,
        name:
            day.name ||
            "My Workout",
        custom: true,
        source:
            "My Workouts",
        category:
            "My Workouts",
        goal:
            "Custom",
        focus:
            "Custom Workout",
        minutes:
            Number(
                day.estimatedMinutes
            ) || 45,
        level:
            "Custom",
        equipment:
            "Mixed",
        description:
            "Your EddieOS workout build.",
        exercises:
            (day.exercises || [])
                .map(
                    exercise => ({
                        name:
                            exercise.name,
                        sets:
                            exercise.sets?.length ||
                            1,
                        reps:
                            exercise.mode ===
                            "time"
                                ? 0
                                : Number(
                                    exercise.sets?.[0]?.reps
                                ) || 0,
                        duration:
                            Number(
                                exercise.sets?.[0]?.duration
                            ) || 30,
                        mode:
                            exercise.mode ===
                            "time"
                                ? "time"
                                : "reps",
                        restSeconds:
                            Number(
                                exercise.restSeconds
                            ) || 90
                    })
                )
    };
}

function allSchedulingWorkouts() {
    const customLibrary =
        loadWorkoutLibrary()
            .workouts
            .map(
                workout => ({
                    ...workout,
                    source:
                        workout.source ||
                        "My Library"
                })
            );

    const planWorkouts =
        loadPlanDays()
            .map(
                planDayAsWorkout
            );

    return [
        ...BUILT_IN_WORKOUTS,
        ...customLibrary,
        ...planWorkouts
    ];
}

function workoutById(id) {
    return allSchedulingWorkouts()
        .find(
            workout =>
                workout.id === id
        );
}

function openScheduleModal(
    workoutId = null,
    date = selectedDate
) {
    const modal =
        $("strengthScheduleOverlay");

    const select =
        $("strengthScheduleWorkout");

    if (
        !modal ||
        !select
    ) {
        return;
    }

    const workouts =
        allSchedulingWorkouts();

    select.innerHTML =
        workouts
            .map(
                workout => `
                    <option
                        value="${escapeHtml(
                            workout.id
                        )}"
                    >
                        ${escapeHtml(
                            workout.name
                        )}
                    </option>
                `
            )
            .join("");

    if (
        workoutId &&
        workouts.some(
            workout =>
                workout.id ===
                workoutId
        )
    ) {
        select.value =
            workoutId;
    }

    const safeDate =
        date instanceof Date
            ? date
            : selectedDate;

    $("strengthScheduleDate").value =
        dateKey(
            safeDate
        );

    const now =
        new Date();

    $("strengthScheduleTime").value =
        dateKey(safeDate) ===
        dateKey(now)
            ? `${String(
                now.getHours()
            ).padStart(2, "0")}:${String(
                now.getMinutes()
            ).padStart(2, "0")}`
            : "18:00";

    $("strengthScheduleNote").value =
        "";

    modal.classList.add(
        "open"
    );

    select.focus();
}

function closeScheduleModal() {
    $("strengthScheduleOverlay")
        ?.classList.remove(
            "open"
        );
}

function createScheduleItem() {
    const workoutId =
        $("strengthScheduleWorkout")
            ?.value;

    const date =
        $("strengthScheduleDate")
            ?.value;

    const time =
        $("strengthScheduleTime")
            ?.value ||
        "18:00";

    const note =
        $("strengthScheduleNote")
            ?.value
            .trim() ||
        "";

    const workout =
        workoutById(
            workoutId
        );

    if (
        !workout ||
        !date
    ) {
        return;
    }

    const data =
        loadSchedule();

    data.items.push({
        id:
            uid(),
        workoutId,
        workoutName:
            workout.name,
        date,
        time,
        note,
        completed: false,
        createdAt:
            Date.now()
    });

    saveSchedule(data);

    selectedDate =
        parseKey(date);

    currentMonth =
        new Date(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            1
        );

    closeScheduleModal();
    renderAll();
}

function deleteScheduleItem(id) {
    const data =
        loadSchedule();

    const item =
        data.items.find(
            entry =>
                entry.id === id
        );

    if (!item) return;

    if (
        !confirm(
            `Remove "${item.workoutName}" from the schedule?`
        )
    ) {
        return;
    }

    data.items =
        data.items.filter(
            entry =>
                entry.id !== id
        );

    saveSchedule(data);
    renderAll();
}

function toggleCompleted(id) {
    const data =
        loadSchedule();

    const item =
        data.items.find(
            entry =>
                entry.id === id
        );

    if (!item) return;

    item.completed =
        !item.completed;

    saveSchedule(data);
    renderAll();
}

function itemsForDate(
    key
) {
    return loadSchedule()
        .items
        .filter(
            item =>
                item.date === key
        )
        .sort(
            (a, b) =>
                a.time.localeCompare(
                    b.time
                )
        );
}

function renderCalendar() {
    const grid =
        $("strengthCalendarGrid");

    const title =
        $("strengthCalendarMonth");

    if (!grid) return;

    const year =
        currentMonth.getFullYear();

    const month =
        currentMonth.getMonth();

    if (title) {
        title.textContent =
            currentMonth.toLocaleDateString(
                undefined,
                {
                    month: "long",
                    year: "numeric"
                }
            );
    }

    const firstDay =
        new Date(
            year,
            month,
            1
        );

    const lastDate =
        new Date(
            year,
            month + 1,
            0
        ).getDate();

    const startOffset =
        firstDay.getDay();

    const totalCells =
        Math.ceil(
            (
                startOffset +
                lastDate
            ) / 7
        ) * 7;

    const todayKey =
        dateKey(
            new Date()
        );

    const schedule =
        loadSchedule();

    const counts = {};

    schedule.items.forEach(
        item => {
            counts[item.date] =
                (
                    counts[item.date] ||
                    0
                ) + 1;
        }
    );

    let html = "";

    for (
        let index = 0;
        index < totalCells;
        index++
    ) {
        const dayNumber =
            index -
            startOffset +
            1;

        if (
            dayNumber < 1 ||
            dayNumber > lastDate
        ) {
            html += `
                <button
                    type="button"
                    class="strength-calendar-day outside"
                    tabindex="-1">
                </button>
            `;

            continue;
        }

        const date =
            new Date(
                year,
                month,
                dayNumber
            );

        const key =
            dateKey(date);

        const count =
            counts[key] ||
            0;

        const selected =
            key ===
            dateKey(
                selectedDate
            );

        const today =
            key ===
            todayKey;

        const completed =
            schedule.items.some(
                item =>
                    item.date ===
                    key &&
                    item.completed
            );

        html += `
            <button
                type="button"
                class="strength-calendar-day ${
                    selected
                        ? "selected"
                        : ""
                } ${
                    today
                        ? "today"
                        : ""
                }"
                data-calendar-date="${key}"
            >
                <span class="strength-calendar-number">
                    ${dayNumber}
                </span>

                ${
                    count
                        ? `
                            <span class="strength-calendar-workouts">
                                ${
                                    Array.from(
                                        {
                                            length:
                                                Math.min(
                                                    count,
                                                    4
                                                )
                                        }
                                    )
                                        .map(
                                            () =>
                                                `<i class="${
                                                    completed
                                                        ? "completed"
                                                        : ""
                                                }"></i>`
                                        )
                                        .join("")
                                }
                                ${
                                    count > 4
                                        ? `<b>+${count - 4}</b>`
                                        : ""
                                }
                            </span>
                        `
                        : ""
                }

            </button>
        `;
    }

    grid.innerHTML =
        html;
}

function renderAgenda() {
    const title =
        $("strengthAgendaDate");

    const list =
        $("strengthAgendaList");

    if (!title || !list) return;

    const key =
        dateKey(
            selectedDate
        );

    title.textContent =
        formatDateLong(
            selectedDate
        );

    const items =
        itemsForDate(
            key
        );

    if (!items.length) {
        list.innerHTML = `
            <div class="strength-agenda-empty">
                <strong>Nothing scheduled.</strong>
                <span>
                    Add a strength workout to this day.
                </span>
            </div>
        `;

        return;
    }

    list.innerHTML =
        items
            .map(
                item => `
                    <article
                        class="strength-agenda-item ${
                            item.completed
                                ? "completed"
                                : ""
                        }"
                    >

                        <div class="strength-agenda-time">
                            ${escapeHtml(
                                item.time
                            )}
                        </div>

                        <div class="strength-agenda-main">

                            <strong>
                                ${escapeHtml(
                                    item.workoutName
                                )}
                            </strong>

                            ${
                                item.note
                                    ? `<span>
                                        ${escapeHtml(
                                            item.note
                                        )}
                                      </span>`
                                    : ""
                            }

                        </div>

                        <div class="strength-agenda-actions">

                            <button
                                type="button"
                                class="strength-agenda-icon"
                                data-schedule-complete="${item.id}"
                                title="Mark complete"
                            >
                                ${
                                    item.completed
                                        ? icon("check")
                                        : icon("dot")
                                }
                            </button>

                            <button
                                type="button"
                                class="strength-agenda-icon"
                                data-schedule-delete="${item.id}"
                                title="Remove"
                            >
                                ${icon("close")}
                            </button>

                        </div>

                    </article>
                `
            )
            .join("");
}

function renderUpcoming() {
    const container =
        $("strengthUpcomingList");

    if (!container) return;

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    const items =
        loadSchedule()
            .items
            .filter(
                item => {
                    const date =
                        parseKey(
                            item.date
                        );

                    return date >=
                        today;
                }
            )
            .sort(
                (a, b) => {
                    const aKey =
                        `${a.date} ${a.time}`;

                    const bKey =
                        `${b.date} ${b.time}`;

                    return aKey.localeCompare(
                        bKey
                    );
                }
            )
            .slice(0, 5);

    if (!items.length) {
        container.innerHTML = `
            <div class="strength-upcoming-empty">
                Your next scheduled strength sessions will appear here.
            </div>
        `;

        return;
    }

    container.innerHTML =
        items
            .map(
                item => `
                    <button
                        type="button"
                        class="strength-upcoming-item"
                        data-upcoming-date="${item.date}"
                    >
                        <span>
                            ${escapeHtml(
                                new Date(
                                    `${item.date}T00:00:00`
                                ).toLocaleDateString(
                                    undefined,
                                    {
                                        weekday: "short",
                                        month: "short",
                                        day: "numeric"
                                    }
                                )
                            )}
                        </span>

                        <strong>
                            ${escapeHtml(
                                item.workoutName
                            )}
                        </strong>

                        <small>
                            ${escapeHtml(
                                item.time
                            )}
                        </small>
                    </button>
                `
            )
            .join("");
}

function renderMyWorkouts() {
    const container =
        $("strengthMyWorkoutsList");

    if (!container) return;

    const days =
        loadPlanDays();

    if (!days.length) {
        container.innerHTML = `
            <div class="strength-myworkouts-empty">
                <strong>No custom workouts yet.</strong>
                <span>
                    Create a workout and it will appear here instead of taking
                    over the main page.
                </span>
            </div>
        `;

        return;
    }

    container.innerHTML =
        days
            .map(
                day => `
                    <article
                        class="strength-myworkout-row"
                        data-my-workout-id="${day.id}"
                    >

                        <div class="strength-myworkout-main">

                            <div class="strength-myworkout-title">
                                ${escapeHtml(
                                    day.name
                                )}
                            </div>

                            <div class="strength-myworkout-meta">
                                <span>
                                    ${
                                        day.exercises?.length ||
                                        0
                                    } exercises
                                </span>

                                <span>
                                    ${
                                        Number(
                                            day.estimatedMinutes
                                        ) || 45
                                    } min
                                </span>
                            </div>

                        </div>

                        <div class="strength-myworkout-actions">

                            <button
                                type="button"
                                class="strength-row-btn"
                                data-edit-my-workout="${day.id}"
                            >
                                Edit
                            </button>

                            <button
                                type="button"
                                class="strength-row-btn"
                                data-start-my-workout="${day.id}"
                            >
                                ${icon("play")} Start
                            </button>

                            <button
                                type="button"
                                class="strength-row-btn primary"
                                data-schedule-my-workout="${day.id}"
                            >
                                Schedule
                            </button>

                        </div>

                    </article>
                `
            )
            .join("");
}

function setActiveView(
    view
) {
    document
        .querySelectorAll(
            "[data-strength-view]"
        )
        .forEach(
            tab =>
                tab.classList.toggle(
                    "active",
                    tab.dataset
                        .strengthView ===
                        view
                )
        );

    document
        .querySelectorAll(
            "[data-strength-panel]"
        )
        .forEach(
            panel =>
                panel.classList.toggle(
                    "active",
                    panel.dataset
                        .strengthPanel ===
                        view
                )
        );
}

function renderAll() {
    renderCalendar();
    renderAgenda();
    renderUpcoming();
    renderMyWorkouts();
}

function init() {
    renderAll();

    document.addEventListener(
        "click",
        event => {
            const target =
                event.target;

            const viewTab =
                target.closest(
                    "[data-strength-view]"
                );

            if (viewTab) {
                setActiveView(
                    viewTab.dataset
                        .strengthView
                );

                if (
                    viewTab.dataset
                        .strengthView ===
                    "mine"
                ) {
                    renderMyWorkouts();
                }

                return;
            }

            if (
                target.matches(
                    "#strengthQuickNewWorkout"
                ) ||
                target.matches(
                    "#strengthMyWorkoutsNew"
                )
            ) {
                setActiveView(
                    "mine"
                );

                window.dispatchEvent(
                    new CustomEvent(
                        "eddieos:strength-create-workout"
                    )
                );

                return;
            }

            if (
                target.matches(
                    "#strengthCalendarPrev"
                )
            ) {
                currentMonth =
                    new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth() - 1,
                        1
                    );

                renderCalendar();
                return;
            }

            if (
                target.matches(
                    "#strengthCalendarNext"
                )
            ) {
                currentMonth =
                    new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth() + 1,
                        1
                    );

                renderCalendar();
                return;
            }

            if (
                target.matches(
                    "#strengthCalendarToday"
                )
            ) {
                selectedDate =
                    new Date();

                currentMonth =
                    new Date(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        1
                    );

                renderAll();
                return;
            }

            const calendarDay =
                target.closest(
                    "[data-calendar-date]"
                );

            if (calendarDay) {
                selectedDate =
                    parseKey(
                        calendarDay.dataset
                            .calendarDate
                    );

                renderAll();
                return;
            }

            if (
                target.matches(
                    "#strengthAgendaAdd"
                )
            ) {
                openScheduleModal(
                    null,
                    selectedDate
                );

                return;
            }

            if (
                target.matches(
                    "#strengthScheduleCancel"
                ) ||
                target.matches(
                    "#strengthScheduleClose"
                ) ||
                target.matches(
                    "#strengthScheduleOverlay"
                )
            ) {
                closeScheduleModal();
                return;
            }

            if (
                target.matches(
                    "#strengthScheduleSave"
                )
            ) {
                createScheduleItem();
                return;
            }

            const scheduleCompleteBtn =
                target.closest(
                    "[data-schedule-complete]"
                );

            if (scheduleCompleteBtn) {
                toggleCompleted(
                    scheduleCompleteBtn.dataset
                        .scheduleComplete
                );

                return;
            }

            const scheduleDeleteBtn =
                target.closest(
                    "[data-schedule-delete]"
                );

            if (scheduleDeleteBtn) {
                deleteScheduleItem(
                    scheduleDeleteBtn.dataset
                        .scheduleDelete
                );

                return;
            }

            if (
                target.matches(
                    "[data-upcoming-date]"
                )
            ) {
                selectedDate =
                    parseKey(
                        target.dataset
                            .upcomingDate
                    );

                currentMonth =
                    new Date(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        1
                    );

                renderAll();
                return;
            }

            if (
                target.matches(
                    "[data-edit-my-workout]"
                )
            ) {
                window.dispatchEvent(
                    new CustomEvent(
                        "eddieos:strength-open-editor",
                        {
                            detail: {
                                dayId:
                                    target.dataset
                                        .editMyWorkout
                            }
                        }
                    )
                );

                return;
            }

            const startMyWorkoutBtn =
                target.closest(
                    "[data-start-my-workout]"
                );

            if (startMyWorkoutBtn) {
                window.dispatchEvent(
                    new CustomEvent(
                        "eddieos:strength-start-workout",
                        {
                            detail: {
                                dayId:
                                    startMyWorkoutBtn.dataset
                                        .startMyWorkout
                            }
                        }
                    )
                );

                return;
            }

            if (
                target.matches(
                    "[data-schedule-my-workout]"
                )
            ) {
                const id =
                    target.dataset
                        .scheduleMyWorkout;

                openScheduleModal(
                    `plan-${id}`,
                    selectedDate
                );

                return;
            }

            if (
                target.matches(
                    "[data-library-schedule]"
                )
            ) {
                openScheduleModal(
                    target.dataset
                        .librarySchedule,
                    selectedDate
                );

                return;
            }
        }
    );

    window.addEventListener(
        "eddieos:strength-schedule-workout",
        event => {
            openScheduleModal(
                event.detail?.workoutId ||
                null,
                selectedDate
            );
        }
    );

    window.addEventListener(
        "storage",
        event => {
            if (
                event.key ===
                    "strength-plan" ||
                event.key ===
                    LIBRARY_KEY ||
                event.key ===
                    SCHEDULE_KEY
            ) {
                renderAll();
            }
        }
    );

    // Refresh compact My Workouts after the builder changes a plan.
    window.addEventListener(
        "eddieos:strength-plan-updated",
        renderAll
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
