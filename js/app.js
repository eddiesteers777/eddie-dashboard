// ==========================================
// EddieOS Dashboard
// ==========================================

import { dashboardData as localData } from "./dashboardData.js";
import { loadDashboard } from "./firestore.js";

import {
    RACE_DATE,
    DAYS,
    weekStart,
    getCurrentWeek,
    getAdjustedWeekMileage,
    getAdjustedWeekDays,
    getTrainingPhase,
    loadProgress
} from "./marathonData.js";

import { getUpcomingCourseEvents } from "./courseEvents.js";
import { describeCorosFreshness } from "./corosStatus.js";

const DAY_MS = 86400000;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // Load Dashboard Data
    // ==========================================

    let dashboardData = localData;

    try {
        const cloudData = await loadDashboard();

        if (cloudData) {
            dashboardData = cloudData;
        }
    } catch (error) {
        console.error("Firestore Error:", error);
    }

    // ==========================================
    // Greeting
    // ==========================================

    const hour = new Date().getHours();
    let greeting = "Good Evening";

    if (hour < 12) {
        greeting = "Good Morning";
    } else if (hour < 17) {
        greeting = "Good Afternoon";
    }

    const welcomeHeading = document.getElementById("welcomeHeading");

    if (welcomeHeading) {
        welcomeHeading.innerHTML =
            `${greeting},<br>${dashboardData.profile.firstName}`;
    }

    // ==========================================
    // Phase status -- adapts before, during, and
    // after race day instead of being permanently
    // marathon-framed
    // ==========================================

    renderPhaseStatus();

    // ==========================================
    // Today
    // ==========================================

    renderToday();

    // ==========================================
    // Quick Stats
    // ==========================================

    const weeklyMileageEl = document.getElementById("weeklyMileage");

    if (weeklyMileageEl) {
        try {
            weeklyMileageEl.textContent =
                `${getAdjustedWeekMileage(getCurrentWeek())} mi`;
        } catch {
            weeklyMileageEl.textContent = "--";
        }
    }

    renderRecovery();
    renderStreak();

    // ==========================================
    // Nutrition Snapshot
    // ==========================================

    renderNutritionSnapshot();

});

/* ==========================================
   Phase status
========================================== */

function renderPhaseStatus() {
    const el = document.getElementById("phaseStatus");

    if (!el) {
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const race = new Date(RACE_DATE);
    race.setHours(0, 0, 0, 0);

    const daysUntilRace = Math.round((race - today) / DAY_MS);

    if (daysUntilRace > 7) {
        let phase = "";

        try {
            phase = getTrainingPhase();
        } catch {
            phase = "";
        }

        el.textContent = phase
            ? `${phase} — ${daysUntilRace} days to Indianapolis`
            : `${daysUntilRace} days to Indianapolis`;
    } else if (daysUntilRace > 0) {
        el.textContent = `Race week — ${daysUntilRace} day${daysUntilRace === 1 ? "" : "s"} to Indianapolis. Trust the taper.`;
    } else if (daysUntilRace === 0) {
        el.textContent = "Race day. Good luck out there — go get your 3:05.";
    } else {
        const daysSince = Math.abs(daysUntilRace);
        el.textContent = `${daysSince} day${daysSince === 1 ? "" : "s"} since Indianapolis. Time to build into the next phase.`;
    }
}

/* ==========================================
   Today
========================================== */

function renderToday() {
    const container = document.getElementById("todayItems");
    const dateLabel = document.getElementById("todayDateLabel");

    if (!container) {
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateLabel) {
        dateLabel.textContent = today.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric"
        });
    }

    const items = [];

    let week = 1;
    let dayData = null;
    let dayKey = null;

    try {
        week = getCurrentWeek();
        const start = weekStart(week);
        const dayIndex = Math.round((today - start) / DAY_MS);
        const weekDays = getAdjustedWeekDays(week);

        if (dayIndex >= 0 && dayIndex < weekDays.length) {
            dayData = weekDays[dayIndex];
            dayKey = DAYS[dayIndex];
        }
    } catch (error) {
        console.error("Dashboard: could not resolve today's plan", error);
    }

    // Today's run — the one item you can mark done right here, no
    // navigating to Marathon just to check a box.
    if (dayData?.miles) {
        const progress = loadProgress();
        items.push({
            icon: "🏃",
            title: dayData.session || "Run",
            detail: `${dayData.miles} mi${dayData.pace ? ` @ ${dayData.pace}` : ""}${dayData.race ? " — RACE DAY" : ""}`,
            link: "marathon.html",
            isRun: true,
            week,
            dayKey,
            done: !!(progress[week] && progress[week][dayKey])
        });
    }

    // A strength workout scheduled for today (via the Strength
    // page's Schedule calendar) -- lets today's workout be started
    // right from the dashboard instead of only from Strength itself.
    try {
        const scheduleKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const schedule = JSON.parse(localStorage.getItem("strength-schedule") || "null");
        const plan = JSON.parse(localStorage.getItem("strength-plan") || "null");
        const planDayIds = new Set((plan?.days || []).map(day => day.id));

        (schedule?.items || [])
            .filter(item => item.date === scheduleKey && !item.completed)
            .forEach(item => {
                const dayId = item.workoutId?.startsWith("plan-")
                    ? item.workoutId.slice(5)
                    : null;

                const startable = dayId && planDayIds.has(dayId);

                items.push({
                    icon: "🏋️",
                    title: item.workoutName || "Strength workout",
                    detail: startable
                        ? `${item.time || "Today"} · Tap to start`
                        : `${item.time || "Today"} · Open in Strength to start`,
                    link: startable ? `strength.html?startWorkout=${dayId}` : "strength.html"
                });
            });
    } catch {
        // No schedule data -- fine, just don't show this item.
    }

    // Fuel plan tied to today's run
    if (dayData?.miles && week && dayKey) {
        try {
            const plans = JSON.parse(localStorage.getItem("fueling-plans") || "[]");
            const plan = plans.find(p =>
                p.marathonRef &&
                Number(p.marathonRef.week) === Number(week) &&
                p.marathonRef.dayKey === dayKey
            );

            if (plan) {
                items.push({
                    icon: "⛽",
                    title: "Fuel plan ready",
                    detail: plan.name || "A fueling plan is attached to today's run",
                    link: "fueling.html"
                });
            }
        } catch {
            // No fuel plan data -- fine, just don't show this item.
        }
    }

    // Cross-training attached to today
    if (Array.isArray(dayData?.crossTraining) && dayData.crossTraining.length) {
        dayData.crossTraining.forEach(entry => {
            items.push({
                icon: "🚴",
                title: entry.activity || "Cross-Training",
                detail: [entry.duration, entry.intensity]
                    .filter(Boolean)
                    .join(" · ") || "Scheduled for today",
                link: "cross-training.html"
            });
        });
    }

    // Planner / course events due today
    try {
        const todaysEvents = getUpcomingCourseEvents(0);

        todaysEvents.forEach(ev => {
            items.push({
                icon: "📅",
                title: ev.label,
                detail: ev.category || "Due today",
                link: "planner.html"
            });
        });
    } catch {
        // No course event data -- fine.
    }

    if (!items.length) {
        container.innerHTML = `
            <div class="eos-today-rest">
                Nothing scheduled today. Good day to rest, or check in on your
                <a href="strength.html">Strength plan</a>.
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => item.isRun ? `
        <div class="eos-today-item eos-today-item-run">
            <a href="${item.link}" class="eos-today-item-link">
                <span class="eos-today-item-icon">${item.icon}</span>
                <div class="eos-today-item-text">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.detail)}</span>
                </div>
            </a>
            <button
                type="button"
                class="eos-today-complete-btn${item.done ? " done" : ""}"
                data-complete-week="${item.week}"
                data-complete-day="${item.dayKey}">
                ${item.done ? "✓ Done" : "Mark Done"}
            </button>
        </div>
    ` : `
        <a href="${item.link}" class="eos-today-item">
            <span class="eos-today-item-icon">${item.icon}</span>
            <div class="eos-today-item-text">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.detail)}</span>
            </div>
        </a>
    `).join("");

    if (!container.dataset.completeBound) {
        container.dataset.completeBound = "true";
        container.addEventListener("click", (event) => {
            const button = event.target.closest("[data-complete-week]");
            if (!button) return;

            event.preventDefault();
            const w = button.dataset.completeWeek;
            const dayKey = button.dataset.completeDay;

            const progress = loadProgress();
            if (!progress[w]) progress[w] = {};
            progress[w][dayKey] = !progress[w][dayKey];

            localStorage.setItem("training-progress", JSON.stringify(progress));
            import("./cloudSync.js")
                .then(({ pushToCloud }) => pushToCloud())
                .catch((error) => console.warn("Cloud progress sync unavailable:", error));

            renderToday();
        });
    }
}

/* ==========================================
   Recovery (real COROS data, not a static number)
========================================== */

function findNumeric(data, keys) {
    if (!data || typeof data !== "object") {
        return null;
    }

    const lower = new Map();

    const walk = (value, prefix = "") => {
        if (!value || typeof value !== "object") return;

        for (const [key, item] of Object.entries(value)) {
            const normalized = `${prefix}${key}`.toLowerCase();
            lower.set(normalized, item);

            if (item && typeof item === "object" && !Array.isArray(item)) {
                walk(item, `${normalized}.`);
            }
        }
    };

    walk(data);

    for (const key of keys) {
        for (const [candidate, value] of lower.entries()) {
            if (candidate === key.toLowerCase() || candidate.endsWith(`.${key.toLowerCase()}`)) {
                const n = Number(value);
                if (Number.isFinite(n)) return n;
            }
        }
    }

    return null;
}

function renderRecovery() {
    const valueEl = document.getElementById("recoveryScore");
    const metaEl = document.getElementById("recoveryMeta");

    if (!valueEl) {
        return;
    }

    let snapshot = null;

    try {
        snapshot = JSON.parse(
            localStorage.getItem("__eddieos_coros_data_snapshot_v2") || "null"
        );
    } catch {
        snapshot = null;
    }

    const percent = snapshot ? findNumeric(snapshot.recovery, [
        "recoveryPercentage", "recovery_percent", "recoveryScore", "recovery"
    ]) : null;

    if (percent === null) {
        valueEl.textContent = "--";
        metaEl.textContent = "No COROS data synced";
        return;
    }

    valueEl.textContent = `${Math.round(percent)}%`;
    metaEl.textContent = describeCorosFreshness(snapshot?.fetchedAt);
}

/* ==========================================
   Streak (computed from real 75-Day entries,
   not a static placeholder)
========================================== */

function renderStreak() {
    const valueEl = document.getElementById("streakDays");

    if (!valueEl) {
        return;
    }

    let entries = {};

    try {
        entries = JSON.parse(localStorage.getItem("entries") || "{}");
    } catch {
        entries = {};
    }

    function dayHasEntry(date) {
        const key = date.toISOString().slice(0, 10);
        const day = entries[key];
        return !!(day && Object.values(day).some(Boolean));
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = 0;
    const cursor = new Date(today);

    // If today has nothing logged yet, that's fine -- start counting
    // from yesterday so a streak doesn't reset to 0 first thing in
    // the morning before the day's habits are checked off.
    if (!dayHasEntry(cursor)) {
        cursor.setDate(cursor.getDate() - 1);
    }

    while (dayHasEntry(cursor)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }

    valueEl.textContent = String(streak);
}

/* ==========================================
   Nutrition snapshot
========================================== */

function renderNutritionSnapshot() {
    const container = document.getElementById("nutritionSnapBars");

    if (!container) {
        return;
    }

    const key = "nutrition-" + new Date().toISOString().slice(0, 10);

    let day = null;

    try {
        const raw = localStorage.getItem(key);
        day = raw ? JSON.parse(raw) : null;
    } catch {
        day = null;
    }

    if (!day) {
        container.innerHTML = `
            <div class="eos-nutrition-snap-empty">
                Nothing logged yet today.
            </div>
        `;
        return;
    }

    const macros = [
        { key: "calories", label: "Calories", goal: 3200, unit: "" },
        { key: "protein", label: "Protein", goal: 180, unit: "g" },
        { key: "carbs", label: "Carbs", goal: 450, unit: "g" },
        { key: "fat", label: "Fat", goal: 70, unit: "g" }
    ];

    container.innerHTML = macros.map(m => {
        const actual = Number(day[m.key]) || 0;
        const pct = Math.min(100, Math.round((actual / m.goal) * 100));

        return `
            <div class="eos-nutrition-snap-bar">
                <div class="eos-nutrition-snap-bar-label">
                    <span>${m.label}</span>
                    <span>${actual}${m.unit} / ${m.goal}${m.unit}</span>
                </div>
                <div class="eos-nutrition-snap-track">
                    <div class="eos-nutrition-snap-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    }).join("");
}
