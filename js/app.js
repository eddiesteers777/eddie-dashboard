// ==========================================
// Southbound Dashboard
// ==========================================

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
import { icon } from "./icons.js";
import { showsPersonalPlan } from "./role.js";
import { getActiveProgramEntriesForDate } from "./activeProgramSources.js";

// The built-in marathon block (js/marathonData.js) is the coach's own
// race. Clients get their own plans and a "From your coach" card
// instead (js/role.js, js/coachCard.js).
const PERSONAL_PLAN = showsPersonalPlan();

function localIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Miles logged Monday-Sunday this week (Running page log).
function loggedMilesThisWeek() {
    let entries = [];
    try {
        entries = JSON.parse(localStorage.getItem("running-log") || "null")?.entries || [];
    } catch {
        entries = [];
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY_MS);
    const from = localIso(monday);
    const to = localIso(new Date(monday.getTime() + 6 * DAY_MS));
    const miles = entries
        .filter(e => e.date >= from && e.date <= to)
        .reduce((sum, e) => sum + (Number(e.miles) || 0), 0);
    return Math.round(miles * 10) / 10;
}

const DAY_MS = 86400000;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

document.addEventListener("DOMContentLoaded", async () => {

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

    // The signed-in user's own name, not the hardcoded profile in
    // dashboardData.js -- that was always "Eddie" for literally
    // anyone who opened this dashboard, signed in or not.
    if (welcomeHeading) {
        welcomeHeading.innerHTML = `${greeting},<br>Guest`;

        import("./auth.js").then(({ listenForAuth }) => {
            listenForAuth(user => {
                const name = user
                    ? (user.displayName ? user.displayName.split(" ")[0] : "Runner")
                    : "Guest";

                welcomeHeading.innerHTML = `${greeting},<br>${escapeHtml(name)}`;
            });
        }).catch(() => {});
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

    if (weeklyMileageEl && !PERSONAL_PLAN) {
        weeklyMileageEl.textContent = `${loggedMilesThisWeek()}`;
    } else if (weeklyMileageEl) {
        try {
            weeklyMileageEl.textContent =
                `${getAdjustedWeekMileage(getCurrentWeek())}`;
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

    // ==========================================
    // From your coach (clients only)
    // ==========================================

    const coachSection = document.getElementById("coachCardSection");

    if (coachSection && !PERSONAL_PLAN) {
        coachSection.hidden = false;
        import("./coachCard.js")
            .then(({ renderCoachCard }) => renderCoachCard(document.getElementById("coachCardBody")))
            .catch(error => {
                console.warn("Southbound: couldn't load the coach card.", error);
                coachSection.hidden = true;
            });
    }

});

/* ==========================================
   Phase status
========================================== */

function renderPhaseStatus() {
    const el = document.getElementById("phaseStatus");

    if (!el) {
        return;
    }

    if (!PERSONAL_PLAN) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let names = [];
        for (let i = 0; i < 28 && names.length < 2; i++) {
            for (const item of getActiveProgramEntriesForDate(localIso(new Date(today.getTime() + i * DAY_MS)))) {
                if (item.programName && !names.includes(item.programName)) names.push(item.programName);
            }
        }
        el.textContent = names.length
            ? `Training: ${names.join(" + ")}`
            : "Here's your day. Your plan, sessions and check-ins all live here.";
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
        if (!PERSONAL_PLAN) throw "skip";
        week = getCurrentWeek();
        const start = weekStart(week);
        const dayIndex = Math.round((today - start) / DAY_MS);
        const weekDays = getAdjustedWeekDays(week);

        if (dayIndex >= 0 && dayIndex < weekDays.length) {
            dayData = weekDays[dayIndex];
            dayKey = DAYS[dayIndex];
        }
    } catch (error) {
        if (error !== "skip") console.error("Dashboard: could not resolve today's plan", error);
    }

    // Today's entries from the account's own plans (Race / Training
    // Plans from Programs, or plans the coach edited for them).
    if (!PERSONAL_PLAN) {
        try {
            getActiveProgramEntriesForDate(localIso(today)).forEach(item => {
                const entry = item.entry || {};
                const isStrength = entry.type === "strength";
                items.push({
                    icon: icon(isStrength ? "dumbbell" : entry.type === "cross" ? "bike" : "activity"),
                    color: isStrength ? "var(--orange)" : "var(--primary-dark)",
                    title: entry.session || (isStrength ? "Strength" : "Run"),
                    detail: [entry.miles ? `${entry.miles} mi` : "", item.programName].filter(Boolean).join(" · "),
                    link: isStrength ? "strength.html" : "running.html"
                });
            });
        } catch {
            // No plan data -- fine.
        }
    }

    // Today's run — the one item you can mark done right here, no
    // navigating to Marathon just to check a box.
    if (dayData?.miles) {
        const progress = loadProgress();
        items.push({
            icon: icon("activity"),
            color: "var(--primary-dark)",
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
                    icon: icon("dumbbell"),
                    color: "var(--orange)",
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
                    icon: icon("fuel"),
                    color: "var(--red)",
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
                icon: icon("bike"),
                color: "var(--cyan)",
                title: entry.activity || "Cross-Training",
                detail: [entry.duration, entry.intensity]
                    .filter(Boolean)
                    .join(" · ") || "Scheduled for today",
                link: "cross-training.html"
            });
        });
    }

    // Planner / course events due today (the coach's own planner)
    if (PERSONAL_PLAN) try {
        const todaysEvents = getUpcomingCourseEvents(0);

        todaysEvents.forEach(ev => {
            items.push({
                icon: icon("calendar"),
                color: "var(--cyan-light)",
                title: ev.label,
                detail: ev.category || "Due today",
                link: "planner.html"
            });
        });
    } catch {
        // No course event data -- fine.
    }

    if (!items.length) {
        container.innerHTML = PERSONAL_PLAN ? `
            <div class="eos-today-rest">
                Nothing scheduled today. Good day to rest, or check in on your
                <a href="strength.html">Strength plan</a>.
            </div>
        ` : `
            <div class="eos-today-rest">
                Nothing on your plan today. Log a run on <a href="running.html">Running</a>,
                or start a workout from <a href="strength.html">Strength</a>.
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => item.isRun ? `
        <div class="eos-today-item eos-today-item-run">
            <a href="${item.link}" class="eos-today-item-link">
                <span class="eos-today-item-icon" style="color:${item.color}">${item.icon}</span>
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
                ${item.done ? `${icon("check")} Done` : "Mark Done"}
            </button>
        </div>
    ` : `
        <a href="${item.link}" class="eos-today-item">
            <span class="eos-today-item-icon" style="color:${item.color}">${item.icon}</span>
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
        if (metaEl) metaEl.textContent = "";
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
        // The goals above are the coach's own numbers; clients just see
        // what they've logged.
        if (!PERSONAL_PLAN) {
            return `
            <div class="eos-nutrition-snap-bar">
                <div class="eos-nutrition-snap-bar-label">
                    <span>${m.label}</span>
                    <span>${actual}${m.unit}</span>
                </div>
            </div>
        `;
        }
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
