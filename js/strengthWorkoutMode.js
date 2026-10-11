/* ==========================================
   Southbound Strength — Start a workout

   Start on the Strength page opens the shared set-by-set screen
   (js/setRunner.js, the same one clients get for the coach's session),
   saves each set on the workout as it's done, and Finish logs the
   completed session, the lift history and any records, then shows
   Workout complete (copy / share).
========================================== */

import { icon } from "./icons.js";
import { strengthSession, strengthTotals, resumableSession, newSessionId, clock } from "./completedSessions.js";
import { storedSessions, saveSession } from "./sessionStore.js";
import { logSession } from "./strengthHistory.js";
import { sbConfirm, toast } from "./ui.js";
import { recordsOn, lastLifts } from "./strengthProgress.js";
import { planRunSteps, runnerStep } from "./strengthRunSteps.js";
import { runSets } from "./setRunner.js";
import {
    SETTINGS_KEY, cleanSettings, fromDisplay, unitLabel,
    isBodyweight, loadText, plateMath, volumeText
} from "./strengthUnits.js";

// lb or kg, set on the Strength page (strength-settings); weights stay stored in pounds.
function units() {
    try { return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")).unit; }
    catch { return "lb"; }
}

const PLAN_KEY = "strength-plan";

let activeDayId = null;
// The completed session this run of Workout Mode becomes: { dayId, id, startedAt, resumed? }.
// Kept in sessionStorage so a reload mid-workout keeps its id and its start time.
let activeSession = null;
let finishing = false;
const ACTIVE_KEY = "sb-strength-active";

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

function groupLabel(groupType) {
    return groupType === "circuit" ? "Circuit" : groupType === "warmup" ? "Warmup" : "Superset";
}

function formatElapsed(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
}

/* ==========================================
   Plate calculator
========================================== */

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
   Open / close
========================================== */

// Start: the same set-by-set screen a client gets for the coach's session
// (js/setRunner.js). Each Done set is saved on the workout at once (so a
// reload picks up where it left off); the end goes through finishWorkout.
async function openWorkoutMode(dayId) {
    activeDayId = dayId;
    const day = getActiveDay();
    if (!day) return;
    activeSession = sessionFor(dayId);
    const order = planRunSteps(day);
    if (!order.length) {
        toast("This workout has no sets yet. Add exercises first.", { type: "info" });
        activeDayId = null;
        return;
    }
    const unit = units();
    let effort = "rpe";
    try { effort = cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null")).effort; } catch { /* default */ }
    let lifts = {};
    try { lifts = lastLifts(JSON.parse(localStorage.getItem("strength-history") || "{}") || {}, { before: localDate() }); } catch { lifts = {}; }
    const steps = order.map(step => runnerStep(step, { unit, effort, last: lifts[String(step.name).trim().toLowerCase()] }));
    const first = steps.findIndex(s => !s.done);
    await runSets({
        steps,
        startIndex: first < 0 ? 0 : first,
        startedAt: activeSession.resumed ? Date.now() : activeSession.startedAt,
        ariaLabel: day.name || "Strength workout",
        onDone(step, got) {
            updatePlan(d => {
                const set = findExercise(d, step.exId)?.sets?.find(x => x.id === step.setId);
                if (!set) return;
                if (step.time) {
                    if (got.duration !== "") set.duration = Math.max(0, Math.round(Number(got.duration) || 0));
                } else {
                    set.weight = got.weight === "" ? 0 : fromDisplay(got.weight, unit);
                    if (got.reps !== "") set.reps = Math.max(0, Math.round(Number(got.reps) || 0));
                }
                set.done = true;
            });
        },
        onSkip(step) {
            updatePlan(d => {
                const set = findExercise(d, step.exId)?.sets?.find(x => x.id === step.setId);
                if (set) set.done = false;
            });
        },
        onFinish: () => finishWorkout(),
        onClose: () => closeWorkoutMode(),
        platesHtml: (step, got) => renderPlateCalc(got.weight === "" ? step.weight : fromDisplay(got.weight, unit))
    });
}

function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    activeDayId = null;
}

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
