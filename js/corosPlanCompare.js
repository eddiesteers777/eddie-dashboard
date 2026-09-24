/* ==========================================
   Southbound COROS vs Marathon Plan — Step 4

   Compares the COROS activity snapshot already
   stored by corosData.js with Southbound's protected
   marathon plan.

   Outputs:
   - planned vs actual running mileage
   - workout completion / match rate
   - long-run completion
   - quality-session completion
   - recent execution details
   - 3:05 goal alignment from actual workouts

   This does not modify the Marathon plan.
========================================== */

import {
    WEEKS,
    DAYS,
    weekStart,
    getAdjustedWeekDays
} from "./marathonData.js";

const SNAPSHOT_KEY = "__eddieos_coros_data_snapshot_v2";

function $(id) {
    return document.getElementById(id);
}

function getSnapshot() {
    try {
        return JSON.parse(
            localStorage.getItem(SNAPSHOT_KEY) || "null"
        );
    } catch {
        return null;
    }
}

function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value;
    }
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
    const d = new Date(date);

    if (Number.isNaN(d.getTime())) {
        return null;
    }

    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
    ].join("-");
}

function activityDate(activity) {
    return (
        activity?.start_time ??
        activity?.startTime ??
        activity?.start_date ??
        activity?.startDate ??
        activity?.date ??
        activity?.activity_date ??
        ""
    );
}

function activityDistanceMeters(activity) {
    const raw =
        activity?.distance_meters ??
        activity?.distanceMeters ??
        activity?.distance ??
        0;

    const n = Number(raw);

    if (!Number.isFinite(n)) {
        return 0;
    }

    const unit = String(
        activity?.distance_unit ??
        activity?.distanceUnit ??
        ""
    ).toLowerCase();

    if (unit.includes("mile")) {
        return n * 1609.344;
    }

    return n;
}

function activityDurationSeconds(activity) {
    const raw =
        activity?.duration_seconds ??
        activity?.durationSeconds ??
        activity?.duration ??
        0;

    const n = Number(raw);

    return Number.isFinite(n) ? n : 0;
}

function activityPaceSeconds(activity) {
    const explicit =
        activity?.pace_seconds_per_mile ??
        activity?.paceSecondsPerMile;

    if (Number.isFinite(Number(explicit))) {
        return Number(explicit);
    }

    const explicitMinutes =
        activity?.pace_min_per_mile ??
        activity?.paceMinPerMile;

    if (Number.isFinite(Number(explicitMinutes))) {
        return Number(explicitMinutes) * 60;
    }

    const meters = activityDistanceMeters(activity);
    const duration = activityDurationSeconds(activity);

    if (!meters || !duration) {
        return null;
    }

    const miles = meters / 1609.344;

    return duration / miles;
}

function isRunning(activity) {
    const text = [
        activity?.sport_type,
        activity?.sportType,
        activity?.sport_name,
        activity?.sportName,
        activity?.sport,
        activity?.name,
        activity?.activity_name
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        text.includes("run") ||
        text.includes("running") ||
        text.includes("trail")
    );
}

function flattenActivities(snapshot) {
    const activities = snapshot?.activities;

    if (!Array.isArray(activities)) {
        return [];
    }

    return activities.filter(isRunning);
}

function buildPlan() {
    const plan = [];

    WEEKS.forEach((week, weekIndex) => {
        const weekNumber = weekIndex + 1;
        const days = getAdjustedWeekDays(weekNumber);

        days.forEach((day, dayIndex) => {
            const date = new Date(
                weekStart(weekNumber).getTime() +
                dayIndex * 86400000
            );

            plan.push({
                week: weekNumber,
                day: DAYS[dayIndex],
                date,
                dateKey: dateKey(date),
                session: day.session,
                miles: Number(day.miles || 0),
                pace: day.pace || "",
                race: Boolean(day.race)
            });
        });
    });

    return plan;
}

function classifyWorkout(session = "") {
    const text = session.toLowerCase();

    if (text.includes("race day")) {
        return "race";
    }

    if (text.includes("long")) {
        return "long";
    }

    if (
        text.includes("tempo") ||
        text.includes("threshold") ||
        text.includes("interval") ||
        text.includes("vo2") ||
        text.includes("repeat") ||
        text.includes("cruise") ||
        text.includes("@ marathon pace") ||
        text.includes("marathon pace")
    ) {
        return "quality";
    }

    if (text.includes("recovery")) {
        return "recovery";
    }

    if (text.includes("rest")) {
        return "rest";
    }

    return "easy";
}

function normalizeDateForWorkout(date) {
    return dateKey(date);
}

function selectBestActivity(activities, planned) {
    const sameDay = activities
        .filter(activity =>
            normalizeDateForWorkout(activityDate(activity)) === planned.dateKey
        )
        .sort(
            (a, b) =>
                activityDistanceMeters(b) -
                activityDistanceMeters(a)
        );

    return sameDay[0] || null;
}

function targetPaceSeconds(planned) {
    const session = `${planned.session} ${planned.pace}`.toLowerCase();

    if (
        session.includes("marathon pace") ||
        session.includes("mp")
    ) {
        return {
            low: 6 * 60 + 58,
            high: 7 * 60 + 5
        };
    }

    if (session.includes("threshold")) {
        return {
            low: 6 * 60 + 35,
            high: 6 * 60 + 50
        };
    }

    if (session.includes("cruise")) {
        return {
            low: 6 * 60 + 30,
            high: 6 * 60 + 45
        };
    }

    if (session.includes("10k")) {
        return {
            low: 6 * 60 + 15,
            high: 6 * 60 + 25
        };
    }

    if (
        session.includes("5k") ||
        session.includes("vo2")
    ) {
        return {
            low: 6 * 60,
            high: 6 * 60 + 10
        };
    }

    if (session.includes("steady")) {
        return {
            low: 7 * 60 + 20,
            high: 7 * 60 + 40
        };
    }

    if (session.includes("long")) {
        return {
            low: 7 * 60 + 50,
            high: 8 * 60 + 40
        };
    }

    if (session.includes("recovery")) {
        return {
            low: 8 * 60 + 45,
            high: 9 * 60 + 30
        };
    }

    if (
        session.includes("easy") ||
        planned.pace.toLowerCase().includes("easy")
    ) {
        return {
            low: 8 * 60 + 15,
            high: 9 * 60
        };
    }

    return null;
}

function pct(value) {
    return `${Math.round(value)}%`;
}

function milesFromMeters(meters) {
    return meters / 1609.344;
}

function formatPace(seconds) {
    if (!Number.isFinite(seconds)) {
        return "—";
    }

    const whole = Math.round(seconds);
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;

    return `${minutes}:${String(secs).padStart(2, "0")}/mi`;
}

function evaluateExecution(planned, actual) {
    if (!actual) {
        return {
            status: "missed",
            distancePct: 0,
            paceMatch: null,
            actualMiles: 0,
            actualPace: null
        };
    }

    const plannedMiles = Number(planned.miles || 0);
    const actualMiles = milesFromMeters(
        activityDistanceMeters(actual)
    );

    const distancePct = plannedMiles > 0
        ? Math.min(
            150,
            (actualMiles / plannedMiles) * 100
        )
        : 100;

    const target = targetPaceSeconds(planned);
    const actualPace = activityPaceSeconds(actual);

    let paceMatch = null;

    if (target && actualPace !== null) {
        paceMatch =
            actualPace >= target.low &&
            actualPace <= target.high;
    }

    const distanceMatch =
        plannedMiles === 0
            ? true
            : actualMiles >= plannedMiles * 0.90;

    return {
        status:
            distanceMatch
                ? "completed"
                : "partial",
        distancePct,
        paceMatch,
        actualMiles,
        actualPace
    };
}

function currentPlanWindow() {
    const todayKey = dateKey(new Date());

    return buildPlan().filter(
        day => day.dateKey <= todayKey
    );
}

function computeComparison(activities) {
    const plan = currentPlanWindow();
    const executions = plan.map(planned => ({
        planned,
        actual: selectBestActivity(activities, planned)
    }));

    const runningPlanned = executions.filter(
        item =>
            classifyWorkout(item.planned.session) !== "rest"
    );

    const executed = runningPlanned.map(item => ({
        ...item,
        result: evaluateExecution(
            item.planned,
            item.actual
        )
    }));

    const completed = executed.filter(
        item => item.result.status === "completed"
    );

    const partial = executed.filter(
        item => item.result.status === "partial"
    );

    const missed = executed.filter(
        item => item.result.status === "missed"
    );

    const plannedMiles = runningPlanned.reduce(
        (sum, item) => sum + item.planned.miles,
        0
    );

    const actualMiles = executed.reduce(
        (sum, item) => sum + item.result.actualMiles,
        0
    );

    const longRuns = executed.filter(
        item =>
            classifyWorkout(item.planned.session) === "long"
    );

    const longRunsCompleted = longRuns.filter(
        item => item.result.status === "completed"
    );

    const qualityRuns = executed.filter(
        item =>
            classifyWorkout(item.planned.session) === "quality"
    );

    const qualityCompleted = qualityRuns.filter(
        item =>
            item.result.status === "completed"
    );

    const paceChecked = executed.filter(
        item => item.result.paceMatch !== null
    );

    const paceMatches = paceChecked.filter(
        item => item.result.paceMatch
    );

    const goalSecondsPerMile = (3 * 3600 + 5 * 60) / 26.2;

    const marathonPaceRuns = executed.filter(
        item =>
            `${item.planned.session} ${item.planned.pace}`
                .toLowerCase()
                .includes("marathon pace")
    );

    const marathonPacePaceChecks =
        marathonPaceRuns.filter(
            item => item.result.actualPace !== null
        );

    const marathonPaceMatches =
        marathonPacePaceChecks.filter(
            item =>
                item.result.actualPace >= 6 * 60 + 58 &&
                item.result.actualPace <= 7 * 60 + 5
        );

    return {
        plan,
        executed,
        completed,
        partial,
        missed,
        plannedMiles,
        actualMiles,
        executionPct:
            runningPlanned.length
                ? (completed.length / runningPlanned.length) * 100
                : 0,
        mileagePct:
            plannedMiles
                ? (actualMiles / plannedMiles) * 100
                : 0,
        longRuns,
        longRunsCompleted,
        qualityRuns,
        qualityCompleted,
        paceChecked,
        paceMatches,
        pacePct:
            paceChecked.length
                ? (paceMatches.length / paceChecked.length) * 100
                : 0,
        marathonPaceRuns,
        marathonPacePaceChecks,
        marathonPaceMatches,
        marathonPacePct:
            marathonPacePaceChecks.length
                ? (marathonPaceMatches.length /
                    marathonPacePaceChecks.length) * 100
                : null,
        goalSecondsPerMile
    };
}

function renderSummary(comparison) {
    setText(
        "corosPlanExecution",
        pct(comparison.executionPct)
    );

    setText(
        "corosPlanMileage",
        `${comparison.actualMiles.toFixed(1)} / ${comparison.plannedMiles.toFixed(1)} mi`
    );

    setText(
        "corosPlanMileagePct",
        pct(comparison.mileagePct)
    );

    setText(
        "corosPlanLongRuns",
        `${comparison.longRunsCompleted.length} / ${comparison.longRuns.length}`
    );

    setText(
        "corosPlanQuality",
        `${comparison.qualityCompleted.length} / ${comparison.qualityRuns.length}`
    );

    setText(
        "corosPlanPace",
        comparison.pacePct === null
            ? "—"
            : pct(comparison.pacePct)
    );

    const marathonPaceMeta = $("corosPlanMpMeta");

    if (marathonPaceMeta) {
        marathonPaceMeta.textContent =
            comparison.marathonPacePct === null
                ? "No matched MP sessions yet"
                : `${pct(comparison.marathonPacePct)} of matched MP sessions in 6:58–7:05/mi`;
    }
}

function renderGoalAlignment(comparison) {
    const element = $("corosPlanGoalAlignment");
    if (!element) return;

    if (!comparison.marathonPacePaceChecks.length) {
        element.textContent =
            "Waiting for a matched Marathon Pace workout before assessing 3:05 race-pace execution.";
        return;
    }

    const pctValue =
        comparison.marathonPacePct;

    if (pctValue >= 80) {
        element.textContent =
            "Your recent matched Marathon Pace sessions are consistently landing in the 6:58–7:05/mi target range. That is a positive execution signal for the 3:05 plan.";
    } else if (pctValue >= 50) {
        element.textContent =
            "Your Marathon Pace execution is mixed. The 3:05 target remains in play, but Southbound should watch whether pace control improves as the marathon-specific block progresses.";
    } else {
        element.textContent =
            "Your matched Marathon Pace sessions are frequently outside the 6:58–7:05/mi target range. Southbound should treat that as a caution signal rather than assuming the 3:05 goal is on track.";
    }
}

function renderRecentMatches(comparison) {
    const container = $("corosPlanMatches");
    if (!container) return;

    const recent = [...comparison.executed]
        .filter(item => item.actual)
        .sort(
            (a, b) =>
                new Date(b.planned.date) -
                new Date(a.planned.date)
        )
        .slice(0, 10);

    if (!recent.length) {
        container.innerHTML = `
            <div class="coros-empty-state">
                No COROS activities are currently matched to your Marathon plan dates.
            </div>
        `;
        return;
    }

    container.innerHTML = recent.map(item => {
        const kind = classifyWorkout(
            item.planned.session
        );

        const actualMiles =
            item.result.actualMiles.toFixed(1);

        const pace =
            formatPace(item.result.actualPace);

        const statusClass =
            item.result.status;

        const statusText =
            item.result.status === "completed"
                ? "Completed"
                : item.result.status === "partial"
                    ? "Partial"
                    : "Missed";

        const paceText =
            item.result.paceMatch === null
                ? ""
                : item.result.paceMatch
                    ? " • Pace on target"
                    : " • Pace outside target";

        return `
            <div class="coros-plan-match-row">
                <div class="coros-plan-match-main">
                    <strong>${escapeHtml(item.planned.session)}</strong>
                    <span>
                        Week ${item.planned.week} • ${escapeHtml(
                            item.planned.day
                        )} • ${escapeHtml(
                            item.planned.date.toLocaleDateString(
                                undefined,
                                {
                                    month: "short",
                                    day: "numeric"
                                }
                            )
                        )}
                    </span>
                </div>

                <div class="coros-plan-match-stat">
                    <strong>
                        ${actualMiles} / ${item.planned.miles} mi
                    </strong>
                    <span>
                        Actual ${pace}
                    </span>
                </div>

                <div class="coros-plan-match-status ${statusClass}">
                    ${statusText}${paceText}
                </div>
            </div>
        `;
    }).join("");
}

function renderStatus(comparison, snapshot) {
    const status = $("corosPlanCompareStatus");

    if (!status) return;

    const synced =
        snapshot?.fetchedAt
            ? new Date(snapshot.fetchedAt).toLocaleString(
                undefined,
                {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                }
            )
            : null;

    status.textContent =
        synced
            ? `Compared the protected Marathon plan against the COROS snapshot synced ${synced}.`
            : "No COROS snapshot is available yet.";
}

function render() {
    const snapshot = getSnapshot();
    const activities = flattenActivities(snapshot);

    if (!snapshot || !activities.length) {
        renderStatus(null, snapshot);
        setText("corosPlanExecution", "—");
        setText("corosPlanMileage", "—");
        setText("corosPlanMileagePct", "—");
        setText("corosPlanLongRuns", "—");
        setText("corosPlanQuality", "—");
        setText("corosPlanPace", "—");

        const matches = $("corosPlanMatches");

        if (matches) {
            matches.innerHTML = `
                <div class="coros-empty-state">
                    Connect COROS and refresh the data snapshot to compare your actual workouts against the Marathon plan.
                </div>
            `;
        }

        const alignment = $("corosPlanGoalAlignment");

        if (alignment) {
            alignment.textContent =
                "Waiting for enough COROS workout data to compare your execution with the 3:05 plan.";
        }

        return;
    }

    const comparison = computeComparison(
        activities
    );

    renderStatus(comparison, snapshot);
    renderSummary(comparison);
    renderGoalAlignment(comparison);
    renderRecentMatches(comparison);
}

function init() {
    render();

    window.addEventListener(
        "eddieos:coros-data-updated",
        render
    );

    const button =
        $("refreshCorosPlanComparisonBtn");

    if (button) {
        button.addEventListener(
            "click",
            render
        );
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        init
    );
} else {
    init();
}
