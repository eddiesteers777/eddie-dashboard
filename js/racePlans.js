/* ==========================================
   Southbound Running — Race Plan Builder

   Phase 1B:
   - guided setup wizard
   - adaptive questions
   - draft persistence
   - progressive plan generation preview
   - save generated plan and activate it on the Running calendar

   Phase 3:
   - generated plans can be activated on the Running calendar
   - calendar scheduling is derived from running-programs
   - existing Marathon data remains untouched

   Phase 4:
   - active / paused / draft / archived plan management
   - duplicate without activating
   - archive without deleting historical data
   - activate / pause / restore controls
   - compact plan summaries and phase breakdowns
========================================== */

import { generateRacePlan, summarizeGeneratedPlan } from "./racePlanGenerator.js";
import { loadRunningPrograms, saveRunningPrograms } from "./runningPrograms.js";
import { loadTrainingPrograms } from "./trainingPrograms.js";
import { compareGeneratedPlans, preserveRegeneratedRuntimeState } from "./racePlanEditor.js";
import { START_DATE as MARATHON_START_DATE, RACE_DATE as MARATHON_RACE_DATE } from "./marathonData.js";
import { showsPersonalPlan } from "./role.js";
import { toast, sbAlert, sbConfirm } from "./ui.js";
import {
    syncRacePlanStrengthSchedule,
    deactivateRacePlanStrengthSchedule,
    getRacePlanStrengthAvailability
} from "./racePlanStrengthIntegration.js";

const STEP_TITLES = ["Race", "Athlete", "Schedule", "Preferences", "Review"];
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const RACE_LABELS = {
    "5K": "5K",
    "10K": "10K",
    "HALF": "Half Marathon",
    "MARATHON": "Marathon",
    "50K": "50K",
    "50_MILE": "50 Mile"
};
const PHASE_COLORS = {
    "Foundation": "var(--primary)",
    "Build": "var(--cyan)",
    "Race Specific": "var(--orange)",
    "Peak": "var(--purple)",
    "Taper": "var(--green)"
};
function phaseColor(phase) {
    return PHASE_COLORS[phase] || "var(--primary)";
}

let currentStep = 1;
let editingPlanId = null;
let generatedPreview = null;

function uid() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `rp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function localIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function selectedRadio(name, fallback = "") {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function selectedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
}

function setRadio(name, value) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
        input.checked = input.value === value;
    });
}

function collectFormData() {
    const get = id => document.getElementById(id)?.value ?? "";
    const raceType = document.querySelector(".race-type-card.selected")?.dataset.raceType || "";

    return {
        raceType,
        raceName: get("racePlanName").trim(),
        raceDate: get("racePlanRaceDate"),
        trainingStartDate: get("racePlanStartDate"),
        experience: get("racePlanExperience"),
        currentMileage: Number(get("racePlanCurrentMileage")) || 0,
        longestRun: Number(get("racePlanLongestRun")) || 0,
        peakMileage: Number(get("racePlanPeakMileage")) || 0,
        goalType: selectedRadio("goalType", "FINISH"),
        goalTime: get("racePlanGoalTime"),
        runDays: selectedValues("runDays"),
        longRunDay: get("racePlanLongRunDay") || "SAT",
        strengthDays: Number(get("racePlanStrengthDays")) || 0,
        crossDays: Number(get("racePlanCrossDays")) || 0,
        crossType: get("racePlanCrossType") || "NONE",
        speedDays: Number(get("racePlanSpeedDays")) || 0,
        threshold: selectedRadio("threshold", "YES"),
        hills: selectedRadio("hills", "YES"),
        longRunStyle: get("racePlanLongRunStyle") || "EASY",
        racePaceLongRuns: selectedRadio("racePaceLongRuns", "NEVER"),
        courseType: get("racePlanCourseType") || "ROAD",
        backToBack: selectedRadio("backToBack", "NO")
    };
}

function applyFormData(data) {
    const byId = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
    };

    document.querySelectorAll(".race-type-card").forEach(card => {
        card.classList.toggle("selected", card.dataset.raceType === data.raceType);
    });

    byId("racePlanName", data.raceName);
    byId("racePlanRaceDate", data.raceDate);
    byId("racePlanStartDate", data.trainingStartDate);
    byId("racePlanExperience", data.experience);
    byId("racePlanCurrentMileage", data.currentMileage || "");
    byId("racePlanLongestRun", data.longestRun || "");
    byId("racePlanPeakMileage", data.peakMileage || "");
    byId("racePlanGoalTime", data.goalTime || "");
    byId("racePlanLongRunDay", data.longRunDay || "SAT");
    byId("racePlanStrengthDays", String(data.strengthDays ?? 0));
    byId("racePlanCrossDays", String(data.crossDays ?? 0));
    byId("racePlanCrossType", data.crossType || "NONE");
    byId("racePlanSpeedDays", String(data.speedDays ?? 0));
    byId("racePlanLongRunStyle", data.longRunStyle || "EASY");
    byId("racePlanCourseType", data.courseType || "ROAD");

    document.querySelectorAll('input[name="runDays"]').forEach(input => {
        input.checked = (data.runDays || []).includes(input.value);
    });

    setRadio("goalType", data.goalType || "FINISH");
    setRadio("threshold", data.threshold || "YES");
    setRadio("hills", data.hills || "YES");
    setRadio("racePaceLongRuns", data.racePaceLongRuns || "NEVER");
    setRadio("backToBack", data.backToBack || "NO");

    updateAdaptiveFields();
    updateDuration();
    renderReview();
}

function raceIsUltra(raceType) {
    return raceType === "50K" || raceType === "50_MILE";
}

function updateAdaptiveFields() {
    const raceType = document.querySelector(".race-type-card.selected")?.dataset.raceType || "";
    const ultraFields = document.getElementById("racePlanUltraFields");
    const goalWrap = document.getElementById("racePlanGoalTimeWrap");
    const goalType = selectedRadio("goalType", "FINISH");
    const paceLabel = document.getElementById("racePlanRacePaceLabel");

    if (ultraFields) {
        ultraFields.hidden = !raceIsUltra(raceType);
    }

    if (goalWrap) {
        goalWrap.hidden = goalType !== "TIME";
    }

    if (paceLabel) {
        const label = RACE_LABELS[raceType] || "race";
        paceLabel.textContent = raceType === "MARATHON"
            ? "Include Marathon Pace work during long runs?"
            : raceType === "HALF"
                ? "Include Half Marathon Pace work during long runs?"
                : `Include ${label} pace / effort during long runs?`;
    }
}

function updateDuration() {
    const start = document.getElementById("racePlanStartDate")?.value;
    const finish = document.getElementById("racePlanRaceDate")?.value;
    const output = document.getElementById("racePlanDuration");

    if (!output) return;
    if (!start || !finish) {
        output.textContent = "Choose both dates";
        return;
    }

    const startDate = new Date(`${start}T00:00:00`);
    const finishDate = new Date(`${finish}T00:00:00`);
    const days = Math.round((finishDate - startDate) / 86400000);

    if (!Number.isFinite(days) || days < 0) {
        output.textContent = "Check your dates";
        return;
    }

    const weeks = Math.max(0, Math.floor(days / 7));
    output.textContent = `${weeks} week${weeks === 1 ? "" : "s"} + ${days % 7} day${days % 7 === 1 ? "" : "s"}`;
}

function showStep(step) {
    currentStep = Math.min(5, Math.max(1, step));

    document.querySelectorAll(".race-plan-step").forEach(section => {
        section.classList.toggle("active", Number(section.dataset.raceStep) === currentStep);
    });

    const current = document.getElementById("racePlanStepCurrent");
    const title = document.getElementById("racePlanStepTitle");
    const fill = document.getElementById("racePlanProgressFill");
    const back = document.getElementById("racePlanBack");
    const next = document.getElementById("racePlanNext");
    const save = document.getElementById("racePlanSave");

    if (current) current.textContent = String(currentStep);
    if (title) title.textContent = STEP_TITLES[currentStep - 1];
    if (fill) fill.style.width = `${(currentStep / 5) * 100}%`;
    if (back) back.hidden = currentStep === 1;
    if (next) next.hidden = currentStep === 5;
    if (save) {
        save.hidden = currentStep !== 5;
        save.textContent = generatedPreview
            ? (editingPlanId ? "Apply Changes" : "Add to Running Calendar")
            : "Generate Plan";
    }

    if (currentStep === 5) {
        renderReview();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateCurrentStep() {
    const data = collectFormData();

    if (currentStep === 1) {
        if (!data.raceType) {
            return "Choose a race distance first.";
        }
        if (!data.raceDate || !data.trainingStartDate) {
            return "Enter both the race date and training start date.";
        }
        if (data.trainingStartDate >= data.raceDate) {
            return "Your training start date needs to be before the race date.";
        }
    }

    if (currentStep === 2) {
        if (!data.experience) {
            return "Choose a training-experience level.";
        }
        if (data.currentMileage <= 0) {
            return "Enter your current average weekly mileage.";
        }
        if (data.longestRun <= 0) {
            return "Enter your longest recent run.";
        }
        if (data.peakMileage <= 0) {
            return "Enter a target peak weekly mileage.";
        }
        if (data.peakMileage < data.currentMileage) {
            return "Your peak mileage is below your current mileage. Raise the peak or lower the current-mileage entry.";
        }
        if (data.goalType === "TIME" && !data.goalTime) {
            return "Enter a goal time or choose Finish / PR.";
        }
    }

    if (currentStep === 3) {
        if (!data.runDays.length) {
            return "Choose at least one running day.";
        }
        if (!data.runDays.includes(data.longRunDay) && data.longRunDay !== "OTHER") {
            return "Your preferred long-run day should be one of your selected running days.";
        }
    }

    return "";
}

function renderReview() {
    const container = document.getElementById("racePlanReview");
    if (!container) return;

    const data = collectFormData();
    const raceLabel = RACE_LABELS[data.raceType] || "Race";
    const runDays = data.runDays.length ? data.runDays.join(" · ") : "Not set";
    const goalText = data.goalType === "TIME"
        ? `Specific time · ${escapeHtml(data.goalTime || "Not set")}`
        : data.goalType === "PR" ? "PR" : "Finish";

    container.innerHTML = `
        <div class="race-plan-review-grid">
            <div class="race-plan-review-block">
                <span>Race</span>
                <strong>${escapeHtml(data.raceName || raceLabel)}</strong>
                <small>${escapeHtml(raceLabel)} · ${escapeHtml(data.raceDate || "No date")}</small>
            </div>
            <div class="race-plan-review-block">
                <span>Training window</span>
                <strong>${escapeHtml(data.trainingStartDate || "No start date")}</strong>
                <small>through race day</small>
            </div>
            <div class="race-plan-review-block">
                <span>Athlete profile</span>
                <strong>${escapeHtml(data.experience || "Not set")}</strong>
                <small>${data.currentMileage || 0} mi current · ${data.peakMileage || 0} mi peak</small>
            </div>
            <div class="race-plan-review-block">
                <span>Goal</span>
                <strong>${goalText}</strong>
                <small>${data.longestRun || 0} mi longest recent run</small>
            </div>
            <div class="race-plan-review-block">
                <span>Weekly structure</span>
                <strong>${runDays}</strong>
                <small>Long run: ${escapeHtml(data.longRunDay)}</small>
            </div>
            <div class="race-plan-review-block">
                <span>Other training</span>
                <strong>${data.strengthDays} strength · ${data.crossDays} cross</strong>
                <small>${escapeHtml(data.crossType)} · ${data.speedDays} speed day${data.speedDays === 1 ? "" : "s"}</small>
            </div>
            <div class="race-plan-review-block">
                <span>Strength calendar</span>
                <strong>${data.strengthDays ? (getRacePlanStrengthAvailability().available ? "Auto-scheduled" : "Needs Strength plan") : "Off"}</strong>
                <small>${data.strengthDays ? (getRacePlanStrengthAvailability().available ? "Uses your current Strength plan; Friday is always light." : "Create a Strength plan before activating this race plan.") : "No Strength sessions will be added."}</small>
            </div>
        </div>
    `;
}


function clearGeneratedPreview() {
    generatedPreview = null;
    const preview = document.getElementById("racePlanGenerationPreview");
    if (preview) {
        preview.hidden = true;
        preview.innerHTML = "";
    }
    const save = document.getElementById("racePlanSave");
    if (save) save.textContent = "Generate Plan";
}

function formatMiles(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function renderPlanChangeSummary(previousPlan, nextPlan) {
    if (!previousPlan || !nextPlan) return "";

    const diff = compareGeneratedPlans(previousPlan, nextPlan);
    const signed = value => {
        const n = Number(value) || 0;
        return `${n > 0 ? "+" : ""}${formatMiles(n)} mi`;
    };

    const changedWorkouts = diff.added.length + diff.removed.length + diff.changed.length;
    const dateCopy = diff.datesChanged
        ? `Training window: ${escapeHtml(diff.startDateBefore)} → ${escapeHtml(diff.startDateAfter)} · Race: ${escapeHtml(diff.raceDateBefore)} → ${escapeHtml(diff.raceDateAfter)}`
        : "Training dates stay the same.";

    const headline = changedWorkouts === 0 && diff.totalDelta === 0
        ? "No workout or mileage changes"
        : `${changedWorkouts} scheduled day${changedWorkouts === 1 ? "" : "s"} changed`;

    return `
        <div class="race-plan-change-summary">
            <div class="race-plan-change-summary-header">
                <div>
                    <div class="race-plans-kicker">MODIFYING CURRENT PLAN</div>
                    <h4>${escapeHtml(headline)}</h4>
                    <p>${dateCopy}</p>
                </div>
                <div class="race-plan-change-preserved">
                    <span>Completed preserved</span>
                    <strong>${diff.preservedCompleted}</strong>
                </div>
            </div>
            <div class="race-plan-change-grid">
                <div><span>Total mileage</span><strong>${formatMiles(diff.totalBefore)} → ${formatMiles(diff.totalAfter)} mi</strong><small>${signed(diff.totalDelta)}</small></div>
                <div><span>Peak week</span><strong>${formatMiles(diff.peakBefore)} → ${formatMiles(diff.peakAfter)} mi</strong><small>${signed(diff.peakDelta)}</small></div>
                <div><span>Longest run</span><strong>${formatMiles(diff.longestBefore)} → ${formatMiles(diff.longestAfter)} mi</strong><small>${signed(diff.longestDelta)}</small></div>
                <div><span>Workout days</span><strong>${Math.max(0, unchangedCount(diff))} unchanged</strong><small>${diff.added.length} added · ${diff.removed.length} removed · ${diff.changed.length} changed</small></div>
            </div>
            <div class="race-plan-change-note">Unchanged workouts keep their completion/runtime state. A workout that changes date, type, or mileage is treated as a new schedule item and starts incomplete.</div>
        </div>
    `;
}

function unchangedCount(diff) {
    return Array.isArray(diff?.unchanged) ? diff.unchanged.length : 0;
}

function renderGeneratedPreview(plan) {
    const container = document.getElementById("racePlanGenerationPreview");
    if (!container) return;

    const phases = summarizeGeneratedPlan(plan);
    const warningHtml = plan.warnings?.length
        ? `<div class="race-plan-generation-warnings">
            <strong>Review before using this plan</strong>
            ${plan.warnings.map(item => `<div>${escapeHtml(item)}</div>`).join("")}
           </div>`
        : "";

    const conflicts = getPlanConflicts(loadRunningPrograms(), plan, editingPlanId);
    const conflictHtml = conflicts.length
        ? `<div class="race-plan-generation-warnings race-plan-conflict-warning">
            <strong>Calendar conflict</strong>
            <div>This plan overlaps an existing active training plan. Nothing will be overwritten. Southbound will require the overlap to be resolved before this plan can become active.</div>
            <div>${escapeHtml(formatConflictList(conflicts)).replaceAll("\n", "<br>")}</div>
           </div>`
        : "";

    const weekRows = plan.weeks.map(week => {
        const keyRuns = week.days.filter(day => day.miles > 0);
        const focus = keyRuns.find(day => day.type === "workout")?.session
            || keyRuns.find(day => day.type === "long")?.session
            || keyRuns.find(day => day.type === "race")?.session
            || "Easy running";
        return `<div class="race-plan-generation-week" style="--phase-color:${phaseColor(week.phase)}">
            <span class="race-plan-generation-week-num">W${week.week}</span>
            <span class="race-plan-generation-phase">${escapeHtml(week.phase)}</span>
            <span class="race-plan-generation-miles">${formatMiles(week.plannedMiles)} mi</span>
            <span class="race-plan-generation-focus">${escapeHtml(focus)}</span>
        </div>`;
    }).join("");

    container.hidden = false;
    container.innerHTML = `
        <div class="race-plan-generation-header">
            <div>
                <div class="race-plans-kicker">PLAN GENERATED</div>
                <h4>${escapeHtml(plan.raceLabel)} · ${escapeHtml(plan.totalWeeks)} weeks</h4>
                <p>${escapeHtml(plan.trainingStartDate)} → ${escapeHtml(plan.raceDate)}</p>
            </div>
            <div class="race-plan-generation-stat">
                <span>Peak</span>
                <strong>${formatMiles(plan.generatedPeakMileage)} mi</strong>
            </div>
            <div class="race-plan-generation-stat">
                <span>Longest</span>
                <strong>${formatMiles(plan.longestPlannedRun)} mi</strong>
            </div>
        </div>

        <div class="race-plan-generation-summary">
            ${phases.map(phase => `
                <div class="race-plan-generation-phase-card" style="--phase-color:${phaseColor(phase.name)}">
                    <span>${escapeHtml(phase.name)}</span>
                    <strong>${phase.weeks} wk${phase.weeks === 1 ? "" : "s"}</strong>
                    <small>${formatMiles(phase.miles)} planned mi</small>
                </div>
            `).join("")}
        </div>

        ${warningHtml}
        ${conflictHtml}

        ${editingPlanId ? renderPlanChangeSummary(
            loadRunningPrograms().find(item => item.id === editingPlanId)?.generatedPlan || null,
            plan
        ) : ""}

        <div class="race-plan-generation-weeklist">
            <div class="race-plan-generation-list-title">Weekly progression</div>
            ${weekRows}
        </div>

        <div class="race-plan-generation-note">
            <strong>What this phase does:</strong>
            <span>Review the generated plan. When you add it to the calendar, Southbound will schedule these planned runs without changing your existing Marathon plan.</span>
        </div>
    `;
}

function generateCurrentPlan() {
    const error = validateCurrentStep();
    if (error) {
        toast(error, { type: "info" });
        return false;
    }

    const settings = collectFormData();
    try {
        generatedPreview = generateRacePlan(settings);
        renderGeneratedPreview(generatedPreview);
        const save = document.getElementById("racePlanSave");
        if (save) save.textContent = editingPlanId ? "Apply Changes" : "Add to Running Calendar";
        return true;
    } catch (error) {
        generatedPreview = null;
        toast(error.message || "Couldn't build this plan. Check its settings and try again.", { type: "error" });
        return false;
    }
}

async function saveGeneratedPlan() {
    if (!generatedPreview) return false;

    const settings = collectFormData();
    const now = new Date().toISOString();
    const plans = loadRunningPrograms();
    const planId = editingPlanId || uid();
    const existing = plans.find(plan => plan.id === editingPlanId);
    const previousGeneratedPlan = existing?.generatedPlan || null;
    const changeSummary = previousGeneratedPlan
        ? compareGeneratedPlans(previousGeneratedPlan, generatedPreview)
        : null;
    const nextGeneratedPlan = previousGeneratedPlan
        ? preserveRegeneratedRuntimeState(previousGeneratedPlan, generatedPreview)
        : generatedPreview;

    const conflicts = getPlanConflicts(plans, generatedPreview, editingPlanId);
    let nextStatus = existing ? normalizePlanStatus(existing) : "active";

    if (conflicts.length) {
        const conflictText = formatConflictList(conflicts);
        if (existing && normalizePlanStatus(existing) === "active") {
            await sbAlert(
                `It would overlap:\n\n${conflictText}\n\nYour current active plan is unchanged. Resolve the overlap, then apply the new schedule.`,
                { title: "Changes not applied" }
            );
            return false;
        }

        const saveAsDraft = await sbConfirm(
            `${conflictText}\n\nYour existing plan won't be changed. You can save this new one as a draft; it stays off the Running calendar until the overlap is resolved.`,
            { title: "This overlaps an active plan", confirmLabel: "Save as draft", cancelLabel: "Go back" }
        );
        if (!saveAsDraft) return false;
        nextStatus = "draft";
    }

    if (nextStatus === "active" && Number(settings.strengthDays) > 0 && !getRacePlanStrengthAvailability().available) {
        const proceed = await sbConfirm(
            "This plan asks for Strength sessions on the calendar, but there's no current Strength plan. Save it without Strength sessions, or go back and create a Strength plan first.",
            { title: "No Strength plan found", confirmLabel: "Save without Strength", cancelLabel: "Go back" }
        );
        if (!proceed) return false;
    }

    const record = {
        ...(existing || {}),
        id: planId,
        name: settings.raceName || RACE_LABELS[settings.raceType] || "Race Plan",
        type: settings.raceType,
        settings,
        status: nextStatus,
        generatedPlan: nextGeneratedPlan,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        calendarActivatedAt: existing?.calendarActivatedAt || (existing?.status === "active" ? now : null),
        archivedAt: existing?.archivedAt || null,
        pausedAt: existing?.pausedAt || null,
        revision: (Number(existing?.revision) || 0) + (existing ? 1 : 0),
        lastRegeneratedAt: existing ? now : null,
        lastRegenerationSummary: changeSummary
            ? {
                totalDelta: changeSummary.totalDelta,
                peakDelta: changeSummary.peakDelta,
                longestDelta: changeSummary.longestDelta,
                added: changeSummary.added.length,
                removed: changeSummary.removed.length,
                changed: changeSummary.changed.length,
                preservedCompleted: changeSummary.preservedCompleted
            }
            : null
    };

    const nextPlans = existing
        ? plans.map(plan => plan.id === planId ? record : plan)
        : [record, ...plans];

    await saveRunningPrograms(nextPlans);

    let strengthResult = { scheduled: 0, removed: 0, preserved: 0, skipped: 0, warning: "" };
    if (record.status === "active") {
        try {
            strengthResult = await syncRacePlanStrengthSchedule(record);
        } catch (error) {
            console.error("Race-plan Strength calendar integration failed:", error);
            toast("Race plan saved, but the Strength calendar couldn't be updated. Your existing Strength schedule is unchanged.", { type: "error" });
        }
    } else if (existing && (record.status === "paused" || record.status === "archived")) {
        try {
            strengthResult = await deactivateRacePlanStrengthSchedule(record.id);
        } catch (error) {
            console.error("Race-plan Strength calendar cleanup failed:", error);
        }
    }

    if (strengthResult.warning) await sbAlert(strengthResult.warning, { title: "About your Strength calendar" });

    const wasActiveOnCalendar = record.status === "active";

    editingPlanId = null;
    clearGeneratedPreview();
    renderSavedPlans();
    document.getElementById("racePlanStartOver")?.setAttribute("hidden", "");

    const startDate = nextGeneratedPlan.trainingStartDate;
    const raceDate = nextGeneratedPlan.raceDate;

    window.dispatchEvent(new CustomEvent("eddieos:running-program-added", {
        detail: {
            programId: planId,
            startDate,
            raceDate,
            status: record.status
        }
    }));
    window.dispatchEvent(new CustomEvent("eddieos:running-programs-changed", {
        detail: { programId: planId, action: "saved" }
    }));

    resetBuilder();

    const calendarTab = document.querySelector('[data-running-section="calendar"]');
    if (calendarTab && wasActiveOnCalendar) {
        calendarTab.click();
    }

    return true;
}

function datesOverlap(startA, endA, startB, endB) {
    if (!startA || !endA || !startB || !endB) return false;
    return startA <= endB && startB <= endA;
}

function formatIsoDate(value) {
    if (!value) return "—";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getBuiltInMarathonConflict() {
    const toIso = value => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    return { start: toIso(MARATHON_START_DATE), end: toIso(MARATHON_RACE_DATE) };
}

function getPlanConflicts(plans, candidatePlan, excludePlanId = null) {
    const candidateStart = candidatePlan?.trainingStartDate || candidatePlan?.settings?.trainingStartDate;
    const candidateEnd = candidatePlan?.raceDate || candidatePlan?.settings?.raceDate;
    if (!candidateStart || !candidateEnd) return [];

    const conflicts = [];
    for (const plan of plans) {
        if (!plan || plan.id === excludePlanId || normalizePlanStatus(plan) !== "active" || !plan.generatedPlan) continue;
        if (datesOverlap(candidateStart, candidateEnd, plan.generatedPlan.trainingStartDate, plan.generatedPlan.raceDate)) {
            conflicts.push({
                name: plan.name || "Active race plan",
                start: plan.generatedPlan.trainingStartDate,
                end: plan.generatedPlan.raceDate
            });
        }
    }

    // Training Plans live in their own store but share the same
    // Running calendar, so an active one can overlap a race plan too.
    for (const plan of loadTrainingPrograms()) {
        if (!plan || plan.id === excludePlanId || normalizePlanStatus(plan) !== "active" || !plan.generatedPlan) continue;
        if (datesOverlap(candidateStart, candidateEnd, plan.generatedPlan.trainingStartDate, plan.generatedPlan.raceDate)) {
            conflicts.push({
                name: plan.name || "Active training plan",
                start: plan.generatedPlan.trainingStartDate,
                end: plan.generatedPlan.raceDate
            });
        }
    }

    // Only the coach's own race block can clash -- a client's plans never
    // overlap it (js/role.js).
    const marathon = showsPersonalPlan() ? getBuiltInMarathonConflict() : {};
    if (marathon.start && marathon.end && datesOverlap(candidateStart, candidateEnd, marathon.start, marathon.end)) {
        conflicts.push({
            name: "Existing Indianapolis Marathon plan",
            start: marathon.start,
            end: marathon.end
        });
    }

    return conflicts;
}

function formatConflictList(conflicts) {
    return conflicts.map(conflict => `• ${conflict.name} (${formatIsoDate(conflict.start)} → ${formatIsoDate(conflict.end)})`).join("\n");
}

function normalizePlanStatus(plan) {
    if (plan?.status) return plan.status;
    return plan?.generatedPlan ? "active" : "draft";
}

function statusLabel(status) {
    return {
        active: "On Calendar",
        paused: "Paused",
        archived: "Archived",
        generated: "Generated",
        draft: "Draft"
    }[status] || "Draft";
}

function statusClass(status) {
    return `race-plan-status-${status || "draft"}`;
}

function experienceLabel(value) {
    return {
        NEW: "New to running",
        DISTANCE_NEW: "New to distance",
        RECREATIONAL: "Recreational",
        INTERMEDIATE: "Intermediate",
        ADVANCED: "Advanced",
        ENDURANCE: "Endurance athlete"
    }[value] || "";
}

function planWeeks(plan) {
    return Number(plan?.generatedPlan?.totalWeeks || plan?.generatedPlan?.weeks?.length || 0);
}

function planPeak(plan) {
    return Number(plan?.generatedPlan?.generatedPeakMileage || plan?.generatedPlan?.requestedPeakMileage || plan?.settings?.peakMileage || 0);
}

function planLongest(plan) {
    return Number(plan?.generatedPlan?.longestPlannedRun || 0);
}

function planPhaseSummary(plan) {
    if (!plan?.generatedPlan) return [];
    return summarizeGeneratedPlan(plan.generatedPlan);
}

function planDateRange(plan) {
    const start = plan?.generatedPlan?.trainingStartDate || plan?.settings?.trainingStartDate;
    const end = plan?.generatedPlan?.raceDate || plan?.settings?.raceDate;
    if (!start || !end) return "Dates not set";
    return `${formatDate(start)} → ${formatDate(end)}`;
}

function phaseSummaryHtml(plan) {
    const phases = planPhaseSummary(plan);
    if (!phases.length) return `<div class="race-plan-manager-empty-detail">No generated schedule yet.</div>`;

    return `<div class="race-plan-phase-list">
        ${phases.map(phase => `
            <div class="race-plan-phase-row">
                <span>${escapeHtml(phase.name)}</span>
                <strong>${phase.weeks} wk · ${Number(phase.miles || 0).toFixed(1)} mi</strong>
            </div>
        `).join("")}
    </div>`;
}

function managerActions(plan, status) {
    const id = escapeHtml(plan.id);
    const edit = `<button type="button" class="race-plan-action-btn" data-plan-action="edit" data-plan-id="${id}">Modify</button>`;
    const duplicate = `<button type="button" class="race-plan-action-btn" data-plan-action="duplicate" data-plan-id="${id}">Duplicate</button>`;
    const archive = `<button type="button" class="race-plan-action-btn danger" data-plan-action="archive" data-plan-id="${id}">Archive</button>`;
    const activate = `<button type="button" class="race-plan-action-btn primary" data-plan-action="activate" data-plan-id="${id}">Activate</button>`;

    if (status === "active") {
        return `${edit}${duplicate}<button type="button" class="race-plan-action-btn" data-plan-action="pause" data-plan-id="${id}">Pause</button>${archive}`;
    }

    if (status === "paused") {
        return `${edit}${activate}${duplicate}${archive}`;
    }

    if (status === "archived") {
        return `${activate}${duplicate}`;
    }

    return `${edit}${activate}${duplicate}`;
}

function renderManagerGroup(title, plans, emptyText = "") {
    if (!plans.length) {
        return emptyText ? `
            <section class="race-plan-manager-group">
                <div class="race-plan-manager-group-heading"><span>${escapeHtml(title)}</span><span>0</span></div>
                <div class="race-plan-manager-empty">${escapeHtml(emptyText)}</div>
            </section>` : "";
    }

    return `
        <section class="race-plan-manager-group">
            <div class="race-plan-manager-group-heading">
                <span>${escapeHtml(title)}</span>
                <span>${plans.length}</span>
            </div>
            <div class="race-plan-manager-grid">
                ${plans.map(plan => {
                    const settings = plan.settings || plan;
                    const status = normalizePlanStatus(plan);
                    const raceLabel = RACE_LABELS[settings.raceType] || plan.generatedPlan?.raceLabel || "Race";
                    const goal = settings.goalType === "TIME" && settings.goalTime ? `Goal ${settings.goalTime}` : settings.goalType === "PR" ? "PR goal" : "Finish goal";
                    const runDays = Number(settings.runDays?.length) || Number(plan.generatedPlan?.runDaysPerWeek) || 0;
                    const strength = Number(settings.strengthDays) || Number(plan.generatedPlan?.strengthDaysPerWeek) || 0;
                    const cross = Number(settings.crossDays) || Number(plan.generatedPlan?.crossDaysPerWeek) || 0;

                    return `
                        <article class="race-plan-manager-card ${statusClass(status)}" data-plan-id="${escapeHtml(plan.id)}">
                            <div class="race-plan-manager-card-top">
                                <div class="race-plan-manager-card-title">
                                    <div class="race-plan-manager-race-type">${escapeHtml(raceLabel)}</div>
                                    <h3>${escapeHtml(settings.raceName || raceLabel)}</h3>
                                    <p>${escapeHtml(planDateRange(plan))}</p>
                                </div>
                                <span class="race-plan-status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>
                            </div>

                            <div class="race-plan-manager-metrics">
                                <div><span>Weeks</span><strong>${planWeeks(plan) || "—"}</strong></div>
                                <div><span>Peak</span><strong>${planPeak(plan) ? `${formatMilesCompact(planPeak(plan))} mi` : "—"}</strong></div>
                                <div><span>Long Run</span><strong>${planLongest(plan) ? `${formatMilesCompact(planLongest(plan))} mi` : "—"}</strong></div>
                                <div><span>Schedule</span><strong>${runDays} run · ${strength} strength · ${cross} cross</strong></div>
                            </div>

                            <div class="race-plan-manager-meta-row">
                                <span>${escapeHtml(goal)}</span>
                                <span>${escapeHtml(experienceLabel(settings.experience))}</span>
                            </div>

                            <details class="race-plan-manager-details">
                                <summary>Plan details</summary>
                                <div class="race-plan-manager-detail-grid">
                                    <div><span>Training window</span><strong>${escapeHtml(planDateRange(plan))}</strong></div>
                                    <div><span>Current → peak</span><strong>${Number(settings.currentMileage) || 0} → ${planPeak(plan) || Number(settings.peakMileage) || 0} mi</strong></div>
                                    <div><span>Race goal</span><strong>${escapeHtml(settings.goalType === "TIME" && settings.goalTime ? settings.goalTime : statusLabel(status))}</strong></div>
                                </div>
                                ${phaseSummaryHtml(plan)}
                                <div class="race-plan-manager-note">Archiving preserves this plan and its generated training history. It simply removes it from the active calendar.</div>
                            </details>

                            <div class="race-plan-manager-actions">${managerActions(plan, status)}</div>
                        </article>
                    `;
                }).join("")}
            </div>
        </section>
    `;
}

function formatMilesCompact(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

async function updatePlanStatus(planId, nextStatus) {
    const plans = loadRunningPrograms();
    const plan = plans.find(item => item.id === planId);
    if (!plan) return false;

    if (nextStatus === "active") {
        if (!plan.generatedPlan) {
            toast("This plan doesn't have a schedule yet. Open it and generate one first.", { type: "info" });
            return false;
        }

        const start = plan.generatedPlan.trainingStartDate;
        const end = plan.generatedPlan.raceDate;
        const conflicts = getPlanConflicts(plans, plan.generatedPlan, planId);

        if (conflicts.length) {
            await sbAlert(
                `${formatConflictList(conflicts)}\n\nNothing was deleted or changed. Pause or archive the other plan, or change this plan's dates, then try again.`,
                { title: "This plan overlaps an active plan" }
            );
            return false;
        }

        if (Number(plan.settings?.strengthDays) > 0 && !getRacePlanStrengthAvailability().available) {
            const proceed = await sbConfirm(
                "This plan asks for Strength sessions on the calendar, but there's no current Strength plan. You can activate it without Strength sessions, or keep it inactive for now.",
                { title: "No Strength plan found", confirmLabel: "Activate without Strength", cancelLabel: "Keep inactive" }
            );
            if (!proceed) return false;
        }
    }

    const now = new Date().toISOString();
    plan.status = nextStatus;
    plan.updatedAt = now;

    if (nextStatus === "active") {
        plan.calendarActivatedAt = plan.calendarActivatedAt || now;
        plan.archivedAt = null;
        plan.pausedAt = null;
    } else if (nextStatus === "paused") {
        plan.pausedAt = now;
    } else if (nextStatus === "archived") {
        plan.archivedAt = now;
        plan.pausedAt = null;
    }

    await saveRunningPrograms(plans);
    try {
        if (nextStatus === "active") {
            const result = await syncRacePlanStrengthSchedule(plan);
            if (result.warning) await sbAlert(result.warning, { title: "About your Strength calendar" });
        } else if (nextStatus === "paused" || nextStatus === "archived") {
            await deactivateRacePlanStrengthSchedule(planId);
        }
    } catch (error) {
        console.error("Race-plan Strength status integration failed:", error);
        toast("Plan updated, but the Strength calendar couldn't be fully updated.", { type: "error" });
    }
    renderSavedPlans();
    window.dispatchEvent(new CustomEvent("eddieos:running-programs-changed", {
        detail: { programId: planId, action: nextStatus }
    }));
    return true;
}

async function duplicatePlan(planId) {
    const plans = loadRunningPrograms();
    const source = plans.find(item => item.id === planId);
    if (!source) return false;

    const now = new Date().toISOString();
    const settings = { ...(source.settings || {}) };
    const baseName = settings.raceName || RACE_LABELS[settings.raceType] || "Race Plan";
    settings.raceName = `${baseName} Copy`;

    const copy = {
        id: uid(),
        name: settings.raceName,
        type: settings.raceType,
        status: "draft",
        settings,
        generatedPlan: source.generatedPlan ? JSON.parse(JSON.stringify(source.generatedPlan)) : null,
        createdAt: now,
        updatedAt: now,
        sourcePlanId: source.id,
        duplicatedAt: now,
        calendarActivatedAt: null,
        archivedAt: null,
        pausedAt: null
    };

    await saveRunningPrograms([copy, ...plans]);
    renderSavedPlans();
    window.dispatchEvent(new CustomEvent("eddieos:running-programs-changed", {
        detail: { programId: copy.id, action: "duplicated", sourcePlanId: source.id }
    }));
    return true;
}

function resetBuilder() {
    editingPlanId = null;
    generatedPreview = null;
    document.getElementById("racePlanForm")?.reset();
    document.querySelectorAll(".race-type-card").forEach(card => card.classList.remove("selected"));

    const raceDate = document.getElementById("racePlanRaceDate");
    const startDate = document.getElementById("racePlanStartDate");
    const today = new Date();

    if (startDate) startDate.value = localIsoDate(today);
    if (raceDate) raceDate.value = "";

    setRadio("goalType", "FINISH");
    setRadio("threshold", "YES");
    setRadio("hills", "YES");
    setRadio("racePaceLongRuns", "NEVER");
    setRadio("backToBack", "NO");

    const startOver = document.getElementById("racePlanStartOver");
    if (startOver) {
        startOver.textContent = "Start Over";
        startOver.setAttribute("hidden", "");
    }
    showStep(1);
    updateAdaptiveFields();
    updateDuration();
    renderSavedPlans();
}

function editPlan(plan) {
    editingPlanId = plan.id;
    generatedPreview = null;
    applyFormData(plan.settings || plan);
    const startOver = document.getElementById("racePlanStartOver");
    if (startOver) {
        startOver.textContent = "Cancel Edit";
        startOver.removeAttribute("hidden");
    }
    showStep(1);
    document.getElementById("runningRacePlansSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatDate(dateString) {
    if (!dateString) return "—";
    const date = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderSavedPlans() {
    const container = document.getElementById("racePlanSavedList");
    if (!container) return;

    const plans = loadRunningPrograms()
        .filter(plan => plan && (plan.generatedPlan || plan.settings || plan.raceType))
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));

    const grouped = {
        active: plans.filter(plan => normalizePlanStatus(plan) === "active"),
        paused: plans.filter(plan => normalizePlanStatus(plan) === "paused"),
        drafts: plans.filter(plan => ["draft", "generated"].includes(normalizePlanStatus(plan))),
        archived: plans.filter(plan => normalizePlanStatus(plan) === "archived")
    };

    container.innerHTML = `
        <div class="race-plan-manager-toolbar">
            <div>
                <div class="race-plan-manager-kicker">PLAN LIBRARY</div>
                <h3>Your Race Plans</h3>
                <p>Manage active training blocks, paused plans, drafts, and archived history.</p>
            </div>
            <button type="button" id="racePlanNewPlanBtn" class="race-plan-primary-btn">+ New Race Plan</button>
        </div>
        <div class="race-plan-manager-counts">
            <span><strong>${grouped.active.length}</strong> Active</span>
            <span><strong>${grouped.paused.length}</strong> Paused</span>
            <span><strong>${grouped.drafts.length}</strong> Drafts</span>
            <span><strong>${grouped.archived.length}</strong> Archived</span>
        </div>
        ${renderManagerGroup("Active", grouped.active, "No active race plans yet.")}
        ${renderManagerGroup("Paused", grouped.paused)}
        ${renderManagerGroup("Drafts & Generated", grouped.drafts)}
        ${renderManagerGroup("Archived", grouped.archived)}
    `;

    document.getElementById("racePlanNewPlanBtn")?.addEventListener("click", () => {
        resetBuilder();
        document.getElementById("racePlanBuilder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

function initSectionTabs() {
    const tabs = [...document.querySelectorAll("[data-running-section]")];
    const panels = [...document.querySelectorAll("[data-running-panel]")];

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const section = tab.dataset.runningSection;

            tabs.forEach(item => {
                const active = item === tab;
                item.classList.toggle("active", active);
                item.setAttribute("aria-selected", String(active));
            });

            panels.forEach(panel => {
                const active = panel.dataset.runningPanel === section;
                panel.classList.toggle("active", active);
                panel.hidden = !active;
            });

            if (section === "race-plans") {
                renderSavedPlans();
                updateAdaptiveFields();
                updateDuration();
            }
        });
    });
}

function initRaceTypeCards() {
    document.querySelectorAll(".race-type-card").forEach(card => {
        card.addEventListener("click", () => {
            document.querySelectorAll(".race-type-card").forEach(item => item.classList.remove("selected"));
            card.classList.add("selected");
            clearGeneratedPreview();
            updateAdaptiveFields();
            renderReview();
        });
    });
}

function initFormEvents() {
    document.getElementById("racePlanNext")?.addEventListener("click", () => {
        const error = validateCurrentStep();
        if (error) {
            toast(error, { type: "info" });
            return;
        }
        showStep(currentStep + 1);
    });

    document.getElementById("racePlanBack")?.addEventListener("click", () => showStep(currentStep - 1));

    document.getElementById("racePlanForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        if (generatedPreview) {
            await saveGeneratedPlan();
        } else {
            generateCurrentPlan();
        }
    });

    document.getElementById("racePlanStartOver")?.addEventListener("click", resetBuilder);

    document.addEventListener("input", event => {
        if (event.target.matches("#racePlanStartDate, #racePlanRaceDate")) {
            updateDuration();
        }
        if (event.target.matches("#racePlanName, #racePlanRaceDate, #racePlanStartDate, #racePlanCurrentMileage, #racePlanLongestRun, #racePlanPeakMileage, #racePlanGoalTime")) {
            clearGeneratedPreview();
            renderReview();
        }
    });

    document.addEventListener("change", event => {
        if (event.target.matches('input[name="goalType"], input[name="runDays"], input[name="threshold"], input[name="hills"], input[name="racePaceLongRuns"], input[name="backToBack"], select')) {
            clearGeneratedPreview();
            updateAdaptiveFields();
            renderReview();
        }
    });

    document.addEventListener("click", async event => {
        const button = event.target.closest("[data-plan-action]");
        if (!button) return;

        event.preventDefault();
        event.stopPropagation();

        const plan = loadRunningPrograms().find(item => item.id === button.dataset.planId);
        if (!plan) return;

        const action = button.dataset.planAction;
        if (action === "edit") {
            editPlan(plan);
            return;
        }

        if (action === "duplicate") {
            await duplicatePlan(plan.id);
            return;
        }

        if (action === "pause") {
            await updatePlanStatus(plan.id, "paused");
            return;
        }

        if (action === "archive") {
            const proceed = await sbConfirm("Its data and training history stay saved, but it comes off the active Running calendar.", { title: "Archive this race plan?", confirmLabel: "Archive" });
            if (proceed) await updatePlanStatus(plan.id, "archived");
            return;
        }

        if (action === "activate") {
            await updatePlanStatus(plan.id, "active");
        }
    });
}

function initDefaultDates() {
    const start = document.getElementById("racePlanStartDate");
    if (start && !start.value) start.value = localIsoDate(new Date());
}

initDefaultDates();
initSectionTabs();
initRaceTypeCards();
initFormEvents();
updateAdaptiveFields();
updateDuration();
renderSavedPlans();
showStep(1);

// Lets programs.html deep-link straight into this tab
// (running.html?section=race-plans) instead of landing on Calendar.
const requestedSection = new URLSearchParams(window.location.search).get("section");
if (requestedSection === "race-plans") {
    document.querySelector('[data-running-section="race-plans"]')?.click();
}
