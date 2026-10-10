/* ==========================================
   Southbound Strength — Workout Mode

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

import { icon } from "./icons.js";
import { strengthSession, strengthTotals, resumableSession, newSessionId, clock } from "./completedSessions.js";
import { storedSessions, saveSession } from "./sessionStore.js";
import { logSession } from "./strengthHistory.js";
import { sbConfirm, toast } from "./ui.js";
import { recordsOn } from "./strengthProgress.js";
import { restAfterSet, SET_TYPES, SET_TYPE_WORDS, repsMaxValue } from "./strengthBuilderModel.js";
import {
    SETTINGS_KEY, cleanSettings, toDisplay, fromDisplay, unitLabel, unitWord, stepFor, nudge,
    isBodyweight, loadText, setShort, plateMath, volumeText
} from "./strengthUnits.js";

// lb or kg, set on the Strength page (strength-settings); weights stay stored in pounds.
function units() {
    try { return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")).unit; }
    catch { return "lb"; }
}

const PLAN_KEY = "strength-plan";
const BAR_WEIGHT = 45;
const PLATE_SIZES = [45, 35, 25, 10, 5, 2.5];

let activeDayId = null;
// The completed session this run of Workout Mode becomes: { dayId, id, startedAt, resumed? }.
// Kept in sessionStorage so a reload mid-workout keeps its id and its start time.
let activeSession = null;
let finishing = false;
const ACTIVE_KEY = "sb-strength-active";
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

function startTimer(from = Date.now()) {
    timerStartedAt = from;
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
   Rest timer -- auto-starts when a set is
   marked done, using that exercise's configured
   restSeconds (set in the plan editor, but never
   previously surfaced here).
========================================== */

let restInterval = null;
let restEndsAt = null;
let restTotalMs = null;
let restHideTimeout = null;

function vibrate(pattern) {
    try {
        navigator.vibrate?.(pattern);
    } catch {
        // Vibration unsupported -- fine, it's a nice-to-have.
    }
}

function renderRestTime() {
    const timeEl = $("workoutRestTime");
    const fillEl = $("workoutRestFill");
    const bar = $("workoutRestBar");

    if (!timeEl || !fillEl || !bar) {
        return;
    }

    const remaining = Math.max(0, restEndsAt - Date.now());
    timeEl.textContent = formatElapsed(remaining);
    fillEl.style.width = `${Math.max(0, Math.min(100, (remaining / restTotalMs) * 100))}%`;

    if (remaining <= 0) {
        clearInterval(restInterval);
        restInterval = null;
        bar.classList.add("complete");
        vibrate([200, 100, 200]);

        clearTimeout(restHideTimeout);
        restHideTimeout = setTimeout(hideRestBar, 4000);
    }
}

function startRestTimer(seconds) {
    const bar = $("workoutRestBar");

    if (!bar || !seconds) {
        return;
    }

    clearInterval(restInterval);
    clearTimeout(restHideTimeout);

    restTotalMs = seconds * 1000;
    restEndsAt = Date.now() + restTotalMs;

    bar.classList.remove("complete");
    bar.classList.add("open");

    renderRestTime();
    restInterval = setInterval(renderRestTime, 250);
}

function adjustRestTimer(deltaSeconds) {
    if (restEndsAt === null) {
        return;
    }

    restEndsAt += deltaSeconds * 1000;
    restTotalMs = Math.max(restTotalMs, restEndsAt - Date.now());

    const bar = $("workoutRestBar");

    if (bar?.classList.contains("complete") && restEndsAt > Date.now()) {
        bar.classList.remove("complete");
        clearTimeout(restHideTimeout);
        restInterval = setInterval(renderRestTime, 250);
    }

    renderRestTime();
}

function hideRestBar() {
    clearInterval(restInterval);
    clearTimeout(restHideTimeout);
    restInterval = null;
    restEndsAt = null;

    $("workoutRestBar")?.classList.remove("open", "complete");
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
    const unit = units();
    const math = plateMath(weight, unit);

    if (!math.perSide) {
        return `
            <div class="strength-plate-result">
                Just the bar (${math.bar} ${unitLabel(unit)}) or lighter — no plates needed.
            </div>
        `;
    }

    return `
        <div class="strength-plate-result">
            <strong>${math.perSide.toFixed(unit === "kg" ? 2 : 1).replace(/\.?0+$/, "")} ${unitLabel(unit)} per side</strong>
            <span class="strength-plate-bar">on a ${math.bar} ${unitLabel(unit)} bar</span>
            <div class="strength-plate-chips">
                ${math.plates.map(p => `<span class="strength-plate-chip">${p}</span>`).join("")}
            </div>
        </div>
    `;
}

/* ==========================================
   Rendering
========================================== */

const SET_TYPE_COLORS = {
    working: "var(--primary)",
    warmup: "var(--yellow)",
    drop: "var(--purple)",
    failure: "var(--red)"
};

const SET_TYPE_ORDER = SET_TYPES;

const SET_TYPE_LABELS = SET_TYPE_WORDS;

function renderSetRow(exercise, set, index) {
    const isTime = exercise.mode === "time";
    const setType = SET_TYPE_ORDER.includes(set.type) ? set.type : "working";
    const repTop = repsMaxValue(set.reps, set.repsMax);
    const unit = units();
    const bw = isBodyweight(exercise);

    const numberControls = isTime
        ? `
            <div class="strength-workout-adjust">
                <button type="button" data-adjust="duration" data-delta="-5" data-set-id="${set.id}" data-exercise-id="${exercise.id}" aria-label="Decrease duration by 5 seconds">${icon("minus")}</button>
                <input
                    type="number"
                    class="strength-workout-input"
                    data-field="duration"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.duration}">
                <button type="button" data-adjust="duration" data-delta="5" data-set-id="${set.id}" data-exercise-id="${exercise.id}" aria-label="Increase duration by 5 seconds">${icon("plus")}</button>
            </div>
        `
        : `
            <div class="strength-workout-adjust">
                <button type="button" data-adjust="weight" data-delta="-1" data-set-id="${set.id}" data-exercise-id="${exercise.id}" aria-label="Decrease weight by ${stepFor(unit)} ${unitWord(unit)}">${icon("minus")}</button>
                <input
                    type="number"
                    class="strength-workout-input"
                    data-field="weight"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    inputmode="decimal" step="any"
                    aria-label="${bw ? "Added weight" : "Weight"} in ${unitWord(unit)}"
                    placeholder="${bw ? "BW" : "0"}"
                    value="${Number(set.weight) ? toDisplay(set.weight, unit) : ""}">
                <span class="strength-workout-unit" aria-hidden="true">${bw ? "+" : ""}${unitLabel(unit)}</span>
                <button type="button" data-adjust="weight" data-delta="1" data-set-id="${set.id}" data-exercise-id="${exercise.id}" aria-label="Increase weight by ${stepFor(unit)} ${unitWord(unit)}">${icon("plus")}</button>
            </div>

            <div class="strength-workout-adjust strength-workout-adjust-reps">
                <button type="button" data-adjust="reps" data-delta="-1" data-set-id="${set.id}" data-exercise-id="${exercise.id}" aria-label="Decrease reps by 1">${icon("minus")}</button>
                <input
                    type="number"
                    class="strength-workout-input strength-workout-input-small"
                    data-field="reps"
                    data-set-id="${set.id}"
                    data-exercise-id="${exercise.id}"
                    value="${set.reps}">
                <button type="button" data-adjust="reps" data-delta="1" data-set-id="${set.id}" data-exercise-id="${exercise.id}" aria-label="Increase reps by 1">${icon("plus")}</button>
            </div>
            ${repTop ? `<span class="strength-workout-range" title="Target rep range">${Number(set.reps) || 0}–${repTop} reps</span>` : ""}
        `;

    return `
        <div
            class="strength-workout-set-row ${set.done ? "done" : ""}"
            data-set-row="${set.id}"
            style="--set-color:${SET_TYPE_COLORS[setType]}">

            <button
                type="button"
                class="strength-workout-set-index"
                data-cycle-set-type="${set.id}"
                data-exercise-id="${exercise.id}"
                aria-label="${SET_TYPE_LABELS[setType]} — tap to change"
                title="${SET_TYPE_LABELS[setType]} — tap to change">
                ${index + 1}
            </button>

            ${numberControls}

            <button
                type="button"
                class="strength-workout-done-btn ${set.done ? "checked" : ""}"
                data-toggle-workout-set="${set.id}"
                data-exercise-id="${exercise.id}"
                aria-label="${set.done ? "Mark set incomplete" : "Mark set complete"}"
                title="${set.done ? "Mark set incomplete" : "Mark set complete"}">
                ${icon("check")}
            </button>

            <button
                type="button"
                class="strength-workout-remove-set"
                data-remove-workout-set="${set.id}"
                data-exercise-id="${exercise.id}"
                aria-label="Remove set"
                title="Remove set">
                ${icon("close")}
            </button>

        </div>
    `;
}

// Small rounded chips (one per set) instead of one run-on
// comma-separated string -- reads as a designed UI element rather
// than a raw data dump.
function renderSetChips(sets, isTime, bodyweight = false) {
    const unit = units();
    if (!sets.length) {
        return "";
    }

    return sets
        .map(s => {
            const label = setShort(s, unit, { time: isTime, bodyweight });
            const color = SET_TYPE_COLORS[s.type] || SET_TYPE_COLORS.working;
            return `<span class="strength-workout-chip" style="--set-color:${color}">${escapeHtml(label)}</span>`;
        })
        .join("");
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
        ? renderSetChips(exercise.sets, isTime, isBodyweight(exercise))
        : `<span class="strength-workout-mini-empty">No sets yet</span>`;

    return `
        <div
            class="strength-workout-exercise ${allDone ? "strength-workout-exercise-complete" : ""} ${expanded ? "expanded" : ""}"
            data-workout-exercise="${exercise.id}">

            <button
                type="button"
                class="strength-workout-exercise-summary"
                data-toggle-exercise="${exercise.id}"
                aria-expanded="${expanded ? "true" : "false"}"
                aria-controls="strength-workout-exercise-body-${exercise.id}">

                <span class="strength-workout-exercise-chevron">${icon("chevronDown")}</span>

                <span class="strength-workout-exercise-summary-text">
                    <strong>${escapeHtml(exercise.name)}</strong>
                    <span class="strength-workout-mini-sets">${currentSummary}</span>
                </span>

                <span class="strength-workout-set-tally ${allDone ? "complete" : ""}">
                    ${allDone ? icon("check") : `${doneCount}/${totalCount}`}
                </span>

            </button>

            <div class="strength-workout-exercise-collapse">
            <div class="strength-workout-exercise-body" id="strength-workout-exercise-body-${exercise.id}">

                <div class="strength-workout-prev">
                    <span class="strength-workout-prev-icon">${icon("clock")}</span>
                    <span class="strength-workout-prev-text">
                        ${previous
                            ? `<span class="strength-workout-prev-label">Last time</span> ${renderSetChips(previous.sets, isTime, isBodyweight(exercise))}`
                            : "No previous session logged yet"}
                    </span>
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

                    ${!isTime && !isBodyweight(exercise) ? `
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

function groupIcon(groupType) {
    return groupType === "circuit"
        ? "refresh"
        : groupType === "warmup"
            ? "flame"
            : "swap";
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
                        ${icon(groupIcon(groupType))} ${groupLabel(groupType)}
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
    document.documentElement.classList.add("strength-workout-open");
    renderBody();
    updateProgress();
    activeSession = sessionFor(dayId);
    startTimer(activeSession.resumed ? Date.now() : activeSession.startedAt);

    const timerEl = $("workoutModeTimer");

    if (timerEl) {
        timerEl.textContent = formatElapsed(Date.now() - timerStartedAt);
    }
}

// Which completed session this opening of Workout Mode is: the one just
// finished today (opened again to fix something: finishing updates it),
// the one in progress before a reload, or a new one.
function sessionFor(dayId) {
    const now = Date.now();
    let resume = null;
    try { resume = resumableSession(storedSessions(), dayId, now); } catch { resume = null; }
    if (resume) {
        return { dayId: String(dayId), id: resume.id, startedAt: resume.startedAt, completedAt: resume.completedAt, durationSec: resume.durationSec, resumed: true };
    }
    try {
        const saved = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || "null");
        if (saved && saved.dayId === String(dayId) && saved.id && now - saved.startedAt < 6 * 3600 * 1000) return saved;
    } catch { /* storage unavailable */ }
    const fresh = { dayId: String(dayId), id: newSessionId("strength", now), startedAt: now };
    try { sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(fresh)); } catch { /* storage unavailable */ }
    return fresh;
}

function closeWorkoutMode() {
    const overlay = $("strengthWorkoutOverlay");

    overlay?.classList.remove("open");
    document.documentElement.classList.remove("strength-workout-open");
    stopTimer();
    hideRestBar();
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

// While a summary is built: only the sets ticked off, when any were (the same
// rule the saved session uses).
let summaryTickedOnly = false;

function meaningfulSetsFor(exercise) {
    const sets = (exercise.sets || []).filter(set => !summaryTickedOnly || set.done);

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

function formatSetLine(set, isTime, bodyweight = false) {
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

    const load = loadText(weight, units(), bodyweight);
    return load ? `${load} × ${reps}` : `${reps} reps`;
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

    const setLines = sets.map(set => formatSetLine(set, isTime, isBodyweight(exercise)));
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

function buildWorkoutSummary(day, durationSec) {
    summaryTickedOnly = day.exercises.some(ex => (ex.sets || []).some(set => set.done));
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
        durationSec ? `${day.name} — ${clock(durationSec)}` : day.name,
        ...blocks
    ].join("\n\n");
}

// The finish screen reads the saved session (js/completedSessions.js), so
// it says exactly what the share card and Recent Workouts say. Volume
// counts weighted working sets only (no warm-ups, bodyweight or holds).
function renderSummaryStats(session) {
    const el = $("strengthSummaryStats");

    if (!el) {
        return;
    }

    const t = strengthTotals(session);
    const stat = (value, label) => `
        <div class="strength-summary-stat">
            <span class="strength-summary-stat-value">${escapeHtml(value)}</span>
            <span class="strength-summary-stat-label">${escapeHtml(label)}</span>
        </div>`;
    el.innerHTML = [
        session.durationSec ? stat(clock(session.durationSec), "Duration") : "",
        stat(String(t.exercises), t.exercises === 1 ? "Exercise" : "Exercises"),
        stat(String(t.sets), t.sets === 1 ? "Set" : "Sets"),
        t.volumeLb > 0 ? stat(volumeText(t.volumeLb, units()).replace(/ (lb|kg)$/, ""), `${unitLabel(units())} Volume`) : ""
    ].join("");
}

let summarySession = null;

function openSummaryModal(text, session) {
    const overlay = $("strengthSummaryOverlay");
    const textarea = $("strengthSummaryText");

    if (!overlay || !textarea) {
        return;
    }

    summarySession = session;
    renderSummaryStats(session);
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

// Records this workout set, from strength-history just after it was logged (today, this day's lifts).
function workoutRecords(day) {
    let history = {};
    try { history = JSON.parse(localStorage.getItem("strength-history") || "{}") || {}; } catch {}
    const names = new Set((day.exercises || []).map(ex => String(ex.name || "").trim().toLowerCase()));
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return recordsOn(history, today, { unit: units() }).filter(r => names.has(r.key));
}

function renderSummaryRecords(records) {
    const el = $("strengthSummaryRecords");
    if (!el) return;
    el.hidden = !records.length;
    el.innerHTML = records.length
        ? `<strong>${icon("trophy")} ${records.length === 1 ? "New record" : `${records.length} new records`}</strong>
           <ul>${records.map(r => `<li><b>${escapeHtml(r.name)}</b> ${escapeHtml(r.line)}</li>`).join("")}</ul>`
        : "";
}

async function finishWorkout() {
    if (finishing) return;   // a double tap never saves twice
    finishing = true;
    try { await finishWorkoutNow(); } finally { finishing = false; }
}

async function finishWorkoutNow() {
    const day = getActiveDay();
    const session = activeSession;
    if (!day || !session) { closeWorkoutMode(); return; }
    const now = Date.now();
    const anyTicked = day.exercises.some(ex => (ex.sets || []).some(set => set.done));

    if (!anyTicked && session.resumed) {
        closeWorkoutMode();
        toast("Nothing ticked off, so the workout you finished earlier stays as it was.", { type: "info" });
        return;
    }
    if (!anyTicked) {
        const ok = await sbConfirm("Save every set that has numbers in it as done? Choose Not now to leave without saving.", {
            title: "Nothing is ticked off",
            confirmLabel: "Save them all",
            cancelLabel: "Not now"
        });
        if (!ok) { closeWorkoutMode(); clearActive(); return; }
    }

    const record = strengthSession(day, {
        id: session.id,
        startedAt: session.startedAt,
        completedAt: session.resumed ? session.completedAt : now,
        now,
        includeAll: !anyTicked,
        isBodyweight
    });
    if (!record) {
        closeWorkoutMode();
        clearActive();
        toast("There were no sets with numbers to save.", { type: "info" });
        return;
    }
    // Opened again to fix a set: the time it took stays what it was.
    if (session.resumed) record.durationSec = session.durationSec ?? null;

    let saved;
    try {
        saved = saveSession(record);
        logSession(saved);
    } catch {
        toast("Couldn't save this workout: your phone's storage may be full. Nothing was lost from the workout itself.", { type: "error" });
        return;
    }

    const summary = buildWorkoutSummary(day, saved.durationSec);
    const records = workoutRecords(day);
    let text = summary;
    if (text && records.length) {
        text += `\n\nNew ${records.length === 1 ? "record" : "records"}:\n${records.map(r => `${r.name}: ${r.line}`).join("\n")}`;
    }

    // The template is ready for next time; the session keeps what was done.
    updatePlan(d => {
        d.exercises.forEach(ex => (ex.sets || []).forEach(set => { set.done = false; }));
    });
    markScheduledDone(day.id, saved.date);
    clearActive();
    closeWorkoutMode();

    renderSummaryRecords(records);
    openSummaryModal(text || "", saved);
}

function clearActive() {
    activeSession = null;
    try { sessionStorage.removeItem(ACTIVE_KEY); } catch { /* storage unavailable */ }
}

// Today's scheduled run of this workout (Strength → Schedule) counts as done.
function markScheduledDone(dayId, date) {
    try {
        const schedule = JSON.parse(localStorage.getItem("strength-schedule") || "null");
        const item = (schedule?.items || []).find(i => i.date === date && i.workoutId === `plan-${dayId}` && !i.completed);
        if (!item) return;
        item.completed = true;
        localStorage.setItem("strength-schedule", JSON.stringify(schedule));
        window.dispatchEvent(new CustomEvent("eddieos:strength-schedule-updated"));
    } catch { /* leave the schedule as it was */ }
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

    if (target.closest("#workoutModeClose") || target === $("strengthWorkoutOverlay")) {
        closeWorkoutMode();
        return;
    }

    if (target.closest("#workoutModeFinish")) {
        finishWorkout();
        return;
    }

    if (target.closest("#workoutRestSkip")) {
        hideRestBar();
        return;
    }

    if (target.closest("#workoutRestMinus")) {
        adjustRestTimer(-15);
        return;
    }

    if (target.closest("#workoutRestPlus")) {
        adjustRestTimer(15);
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

    const toggleSetBtn = target.closest("[data-toggle-workout-set]");

    if (toggleSetBtn) {
        let justCompleted = false;
        let restSeconds = 0;

        updatePlan(day => {
            const exercise = findExercise(day, toggleSetBtn.dataset.exerciseId);
            const set = exercise && findSet(exercise, toggleSetBtn.dataset.toggleWorkoutSet);

            if (set) {
                set.done = !set.done;
                justCompleted = set.done;
                // "No rest" (0) and the set before a drop set start no timer.
                restSeconds = restAfterSet(exercise, exercise.sets.indexOf(set));
                renderExercise(exercise);
            }
        });
        updateProgress();

        if (justCompleted) {
            startRestTimer(restSeconds);
        }

        return;
    }

    const cycleTypeBtn = target.closest("[data-cycle-set-type]");

    if (cycleTypeBtn) {
        updatePlan(day => {
            const exercise = findExercise(day, cycleTypeBtn.dataset.exerciseId);
            const set = exercise && findSet(exercise, cycleTypeBtn.dataset.cycleSetType);

            if (set) {
                const currentIndex = SET_TYPE_ORDER.indexOf(set.type || "working");
                set.type = SET_TYPE_ORDER[(currentIndex + 1) % SET_TYPE_ORDER.length];
                renderExercise(exercise);
            }
        });
        return;
    }

    const removeSetBtn = target.closest("[data-remove-workout-set]");

    if (removeSetBtn) {
        updatePlan(day => {
            const exercise = findExercise(day, removeSetBtn.dataset.exerciseId);

            if (exercise) {
                exercise.sets = exercise.sets.filter(
                    s => s.id !== removeSetBtn.dataset.removeWorkoutSet
                );
                renderExercise(exercise);
            }
        });
        updateProgress();
        return;
    }

    const addSetBtn = target.closest("[data-workout-add-set]");

    if (addSetBtn) {
        updatePlan(day => {
            const exercise = findExercise(day, addSetBtn.dataset.workoutAddSet);

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

    const removeExerciseBtn = target.closest("[data-remove-workout-exercise]");

    if (removeExerciseBtn) {
        updatePlan(day => {
            day.exercises = day.exercises.filter(
                ex => ex.id !== removeExerciseBtn.dataset.removeWorkoutExercise
            );
        });
        renderBody();
        updateProgress();
        return;
    }

    const swapBtn = target.closest("[data-swap-exercise]");

    if (swapBtn) {
        openSwapPanel(swapBtn.dataset.swapExercise);
        return;
    }

    const cancelSwapBtn = target.closest("[data-cancel-swap]");

    if (cancelSwapBtn) {
        closeSwapPanel(cancelSwapBtn.dataset.cancelSwap);
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

    const platesBtn = target.closest("[data-toggle-plates]");

    if (platesBtn) {
        const exerciseId = platesBtn.dataset.togglePlates;
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

            set[field] = field === "weight"
                ? nudge(set.weight, units(), delta)   // 5 lb or 2.5 kg a tap, stored in lb
                : Math.max(0, (Number(set[field]) || 0) + delta);

            const input = document.querySelector(
                `.strength-workout-input[data-field="${field}"][data-set-id="${setId}"]`
            );

            if (input) {
                input.value = field === "weight" ? (Number(set.weight) ? toDisplay(set.weight, units()) : "") : set[field];
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
                set[field] = field === "weight"
                    ? fromDisplay(target.value, units())
                    : Number(target.value) || 0;
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

    if (target.closest("#strengthSummaryDone") || target === $("strengthSummaryOverlay")) {
        closeSummaryModal();
        return;
    }

    if (target.closest("#strengthSummaryCopy")) {
        copySummaryText();
        return;
    }

    if (target.closest("#strengthSummaryShare") && summarySession) {
        const session = summarySession;
        import("./sessionShare.js").then(m => m.shareSession(session)).catch(() => {
            toast("Couldn't open the share card. Check your connection and try again.", { type: "error" });
        });
    }
});
