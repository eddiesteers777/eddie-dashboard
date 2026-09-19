/* ==========================================
   EddieOS Analytics

   Every number on this page is either read directly from the
   Marathon plan + your logged progress, or (Personal Records) typed
   in by you. Nothing here is a placeholder — if a metric can't be
   computed honestly from real data, it isn't shown.
========================================== */

import {
    WEEKS,
    DAYS,
    getCurrentWeek,
    getRaceCountdown,
    getCycleMileage,
    getPeakMileage,
    getLongestRun,
    getCompletionPercent,
    getAdjustedWeekDays,
    getAdjustedWeekMileage,
    getWorkoutBreakdown,
    getUpcomingWorkouts,
    getTrainingPhase,
    getNextLongRun,
    loadProgress,
    weekStart,
    DAY_MS
} from "./marathonData.js";

let charts = {};

function $(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
}

/* ==========================================
   Derived data — completed (not just planned)

   getAdjustedWeekMileage/getWorkoutBreakdown in marathonData.js
   describe the PLAN. Everything below cross-references that plan
   against training-progress to describe what actually happened.
========================================== */

function isDayDone(progress, week, dayKey) {
    return !!(progress[week] && progress[week][dayKey]);
}

function actualWeekMileage(progress, weekNumber) {
    return getAdjustedWeekDays(weekNumber).reduce((sum, day, i) => {
        return sum + (isDayDone(progress, weekNumber, DAYS[i]) ? Number(day.miles || 0) : 0);
    }, 0);
}

function categorizeSession(day) {
    if (day.race) return "race";
    const session = (day.session || "").toLowerCase();
    if (session.includes("long")) return "long";
    if (session.includes("recovery")) return "recovery";
    if (
        session.includes("tempo") ||
        session.includes("threshold") ||
        session.includes("interval") ||
        session.includes("vo2") ||
        session.includes("repeat")
    ) return "quality";
    return "easy";
}

function getCompletedBreakdown(progress) {
    const breakdown = { easy: 0, quality: 0, long: 0, recovery: 0, race: 0 };
    for (let w = 1; w <= WEEKS.length; w++) {
        getAdjustedWeekDays(w).forEach((day, i) => {
            if (isDayDone(progress, w, DAYS[i])) breakdown[categorizeSession(day)]++;
        });
    }
    return breakdown;
}

// Consecutive most-recent scheduled running days (miles > 0, up to today)
// completed without a miss. Rest/cross-training-only days (0 miles) don't
// count for or against it — they're just skipped.
function getCurrentStreak(progress) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const runDays = [];
    for (let w = 1; w <= WEEKS.length; w++) {
        getAdjustedWeekDays(w).forEach((day, i) => {
            const date = new Date(weekStart(w).getTime() + i * DAY_MS);
            date.setHours(0, 0, 0, 0);
            if (date > today) return;
            if (Number(day.miles) > 0) {
                runDays.push(isDayDone(progress, w, DAYS[i]));
            }
        });
    }

    let streak = 0;
    for (let i = runDays.length - 1; i >= 0; i--) {
        if (!runDays[i]) break;
        streak++;
    }
    return streak;
}

function getWeekCompletionPercent(progress, weekNumber) {
    const completed = DAYS.filter(dayKey => isDayDone(progress, weekNumber, dayKey)).length;
    return Math.round((completed / DAYS.length) * 100);
}

function getTotalActualMileage(progress) {
    let total = 0;
    for (let w = 1; w <= WEEKS.length; w++) total += actualWeekMileage(progress, w);
    return Math.round(total * 10) / 10;
}

/* ==========================================
   Load
========================================== */

const analytics = {
    trainingWeek: 1,
    weeklyMileage: 0,
    totalMileage: 0,
    peakMileage: 0,
    completion: 0,
    weekCompletion: 0,
    longestRun: 0,
    nextLongRun: null,
    todayWorkout: null,
    workoutBreakdown: null,
    completedBreakdown: null,
    streak: 0,
    actualMileageSoFar: 0
};

function loadAnalyticsData() {
    const progress = loadProgress();

    analytics.trainingWeek = getCurrentWeek();
    analytics.weeklyMileage = getAdjustedWeekMileage(analytics.trainingWeek);
    analytics.totalMileage = getCycleMileage();
    analytics.peakMileage = getPeakMileage();
    analytics.completion = getCompletionPercent();
    analytics.weekCompletion = getWeekCompletionPercent(progress, analytics.trainingWeek);
    analytics.longestRun = getLongestRun();
    analytics.nextLongRun = getNextLongRun();
    analytics.workoutBreakdown = getWorkoutBreakdown();
    analytics.completedBreakdown = getCompletedBreakdown(progress);
    analytics.streak = getCurrentStreak(progress);
    analytics.actualMileageSoFar = getTotalActualMileage(progress);

    const days = getAdjustedWeekDays(analytics.trainingWeek);
    const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
    analytics.todayWorkout = days[todayIndex] || null;
}

/* ==========================================
   Hero
========================================== */

function renderHero() {
    setText("countdownDays", getRaceCountdown());
    setText("trainingWeek", `Week ${analytics.trainingWeek} of ${WEEKS.length}`);

    setText("trainingPhase", getTrainingPhase() || "—");
}

/* ==========================================
   Snapshot (dashboard-grid)
========================================== */

function renderSnapshot() {
    setText("todayWorkout", analytics.todayWorkout ? analytics.todayWorkout.session : "Rest");
    setText(
        "todayWorkoutDetails",
        analytics.todayWorkout && Number(analytics.todayWorkout.miles) > 0
            ? `${analytics.todayWorkout.miles} mi @ ${analytics.todayWorkout.pace || "easy"}`
            : "No running session scheduled today"
    );

    setText("weeklyMileage", `${analytics.weeklyMileage} mi`);
    setText("completionPercent", `${analytics.weekCompletion}%`);
    setText("currentStreak", analytics.streak);

    if (analytics.nextLongRun) {
        setText("nextLongRun", `${analytics.nextLongRun.miles} mi`);
        setText("nextLongRunDate", `Week ${analytics.nextLongRun.week}`);
    } else {
        setText("nextLongRun", "—");
        setText("nextLongRunDate", "No long runs remaining");
    }

    setText("peakMileage", `${analytics.peakMileage} mi`);
    setText("totalMileage", `${analytics.totalMileage} mi`);
}

/* ==========================================
   Performance Overview
========================================== */

function renderPerformanceCards() {
    const fitness = Math.min(100, Math.round(analytics.completion * 0.7 + (analytics.streak * 2)));

    const status =
        analytics.completion >= 90 ? "On Track" :
        analytics.completion >= 70 ? "Building" :
        "Needs Focus";

    const recovery =
        analytics.completion >= 90 ? "Excellent" :
        analytics.completion >= 70 ? "Good" :
        analytics.completion >= 50 ? "Fair" :
        "Needs Work";

    setText("fitnessScore", fitness);
    setText("trainingStatus", status);
    setText("recoveryScore", recovery);
    setText("raceReadiness", `${analytics.completion}%`);
}

/* ==========================================
   Mileage Trend Chart — planned vs actual
========================================== */

function renderMileageTrendChart() {
    const canvas = $("mileageTrendChart");
    if (!canvas) return;
    if (charts.mileageTrend) charts.mileageTrend.destroy();

    const progress = loadProgress();
    const currentWeek = analytics.trainingWeek;

    const planned = WEEKS.map((_, i) => getAdjustedWeekMileage(i + 1));
    const actual = WEEKS.map((_, i) => {
        const w = i + 1;
        return w <= currentWeek ? actualWeekMileage(progress, w) : null;
    });

    charts.mileageTrend = new Chart(canvas, {
        type: "line",
        data: {
            labels: WEEKS.map((_, i) => `W${i + 1}`),
            datasets: [
                {
                    label: "Planned",
                    data: planned,
                    borderColor: "#5B7699",
                    backgroundColor: "transparent",
                    borderWidth: 2,
                    borderDash: [5, 4],
                    tension: 0.3,
                    pointRadius: 0
                },
                {
                    label: "Actual",
                    data: actual,
                    borderColor: "#4EA8FF",
                    backgroundColor: "rgba(78,168,255,.12)",
                    borderWidth: 3,
                    tension: 0.3,
                    fill: true,
                    spanGaps: false,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, labels: { color: "#B7C4D6" } } },
            scales: {
                y: { beginAtZero: true, ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.06)" } },
                x: { ticks: { color: "#94A3B8" }, grid: { display: false } }
            }
        }
    });
}

/* ==========================================
   Workout Mix Chart — planned vs completed, by type
========================================== */

function renderWorkoutMixChart() {
    const canvas = $("workoutMixChart");
    if (!canvas) return;
    if (charts.workoutMix) charts.workoutMix.destroy();

    const labels = ["Easy", "Quality", "Long", "Recovery", "Race"];
    const keys = ["easy", "quality", "long", "recovery", "race"];
    const planned = keys.map(k => analytics.workoutBreakdown[k]);
    const completed = keys.map(k => analytics.completedBreakdown[k]);

    charts.workoutMix = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Planned", data: planned, backgroundColor: "rgba(91,118,153,.5)", borderRadius: 6 },
                { label: "Completed", data: completed, backgroundColor: "#4EA8FF", borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true, labels: { color: "#B7C4D6" } } },
            scales: {
                y: { beginAtZero: true, ticks: { color: "#94A3B8" }, grid: { color: "rgba(255,255,255,.06)" } },
                x: { ticks: { color: "#94A3B8" }, grid: { display: false } }
            }
        }
    });
}

/* ==========================================
   Upcoming Workouts
========================================== */

function renderUpcomingWorkouts() {
    const container = $("upcomingRuns");
    if (!container) return;

    const upcoming = getUpcomingWorkouts().slice(0, 7);
    container.innerHTML = "";

    if (upcoming.length === 0) {
        container.innerHTML = `<div class="insight-card"><p>No upcoming workouts scheduled.</p></div>`;
        return;
    }

    upcoming.forEach(workout => {
        const card = document.createElement("div");
        card.className = "upcoming-workout";
        card.innerHTML = `
            <div class="upcoming-left">
                <strong>Week ${workout.week}</strong>
                <span>${workout.day}</span>
            </div>
            <div class="upcoming-middle">${workout.session}</div>
            <div class="upcoming-right">${Number(workout.miles) > 0 ? `${workout.miles} mi` : ""}</div>
        `;
        container.appendChild(card);
    });
}

/* ==========================================
   Training Insights (rule-based, not "AI")
========================================== */

function renderInsights() {
    const container = $("trainingInsights");
    if (!container) return;

    const insights = [];

    if (analytics.completion >= 90) {
        insights.push({
            title: "Excellent Consistency",
            text: "You've completed nearly every scheduled workout. Stay healthy and trust the process."
        });
    } else if (analytics.completion >= 70) {
        insights.push({
            title: "Good Progress",
            text: "You're staying consistent. Focus on hitting every quality workout and long run."
        });
    } else {
        insights.push({
            title: "Build Consistency",
            text: "The biggest improvement right now comes from completing more scheduled workouts."
        });
    }

    if (analytics.streak >= 3) {
        insights.push({
            title: `${analytics.streak}-Workout Streak`,
            text: "You haven't missed a scheduled run in a while — keep the chain going."
        });
    } else if (analytics.streak === 0) {
        insights.push({
            title: "Streak Reset",
            text: "Your last scheduled run wasn't logged as complete. One good session gets it moving again."
        });
    }

    if (analytics.nextLongRun) {
        insights.push({
            title: "Next Long Run",
            text: `${analytics.nextLongRun.miles} miles scheduled during Week ${analytics.nextLongRun.week}. Prioritize sleep and fueling before this session.`
        });
    }

    container.innerHTML = insights.map(i => `
        <div class="insight-card">
            <h4>${i.title}</h4>
            <p>${i.text}</p>
        </div>
    `).join("");
}

/* ==========================================
   Personal Records — real, user-entered, no fake defaults
========================================== */

const PR_KEY = "personal-records";
const PR_FIELDS = [
    { id: "5k", label: "5K" },
    { id: "10k", label: "10K" },
    { id: "half", label: "Half Marathon" },
    { id: "marathon", label: "Marathon" }
];

function loadPersonalRecords() {
    try {
        return JSON.parse(localStorage.getItem(PR_KEY) || "{}");
    } catch (e) {
        return {};
    }
}

function savePersonalRecords(records) {
    localStorage.setItem(PR_KEY, JSON.stringify(records));
    import("./cloudSync.js").then(({ pushToCloud }) => pushToCloud()).catch(() => {});
}

function renderPersonalRecords() {
    const container = $("recordsGrid");
    if (!container) return;

    const records = loadPersonalRecords();

    container.innerHTML = PR_FIELDS.map(field => `
        <div class="record" data-field="${field.id}">
            <span>${field.label}</span>
            <h3 class="record-value">${records[field.id] || "Not set"}</h3>
            <input
                type="text"
                class="record-input"
                placeholder="e.g. 3:05:00"
                value="${records[field.id] || ""}"
                hidden>
        </div>
    `).join("");

    container.querySelectorAll(".record").forEach(card => {
        const field = card.dataset.field;
        const value = card.querySelector(".record-value");
        const input = card.querySelector(".record-input");

        value.addEventListener("click", () => {
            value.hidden = true;
            input.hidden = false;
            input.focus();
            input.select();
        });

        function commit() {
            const records = loadPersonalRecords();
            const next = input.value.trim();
            records[field] = next;
            savePersonalRecords(records);
            value.textContent = next || "Not set";
            input.hidden = true;
            value.hidden = false;
        }

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", e => {
            if (e.key === "Enter") input.blur();
        });
    });
}

/* ==========================================
   Goal Progress
========================================== */

function renderGoalProgress() {
    setText("longestRun", `${analytics.longestRun} mi`);
    setText("actualMileageSoFar", `${analytics.actualMileageSoFar} mi`);
}

/* ==========================================
   Init
========================================== */

// Each section is independent — a failure in one (e.g. the Chart.js CDN
// being unreachable) must never take down the others with it.
function safely(fn) {
    try {
        fn();
    } catch (error) {
        console.error(`Analytics: ${fn.name} failed`, error);
    }
}

function initAnalytics() {
    loadAnalyticsData();
    safely(renderHero);
    safely(renderSnapshot);
    safely(renderPerformanceCards);
    safely(renderMileageTrendChart);
    safely(renderWorkoutMixChart);
    safely(renderUpcomingWorkouts);
    safely(renderInsights);
    safely(renderPersonalRecords);
    safely(renderGoalProgress);
}

const marathonButton = $("viewMarathonPlan");
if (marathonButton) {
    marathonButton.addEventListener("click", () => {
        window.location.href = "marathon.html";
    });
}

const todayButton = $("viewTodayWorkout");
if (todayButton) {
    todayButton.addEventListener("click", () => {
        window.location.href = "marathon.html";
    });
}

document.addEventListener("DOMContentLoaded", initAnalytics);
