// ==========================================
// Southbound Dashboard
// ==========================================

import {
    RACE_DATE,
    DAYS,
    weekStart,
    getCurrentWeek,
    getAdjustedWeekDays,
    getTrainingPhase,
    loadProgress
} from "./marathonData.js";

import { getUpcomingPlannerEvents, categoryFor, formatTime } from "./plannerEvents.js";
import { describeCorosFreshness } from "./corosStatus.js";
import { icon } from "./icons.js";
import { celebrateRun } from "./celebrate.js";
import { showsPersonalPlan } from "./role.js";
import { getActiveProgramEntriesForDate, getActiveRunningPrograms } from "./activeProgramSources.js";
import { nextRace, raceCountdownText } from "./raceCountdown.js";
import { cachedNavAccess, profileAccess, fallbackAccess } from "./navAccess.js";
import { clientTodaySections, clientHeroLine } from "./todayLayout.js";
import { watchTodayColumns, applyTodayColumns, unwrapTodayColumns } from "./todayColumns.js";
import { restTextOf } from "./todayCues.js";

// The built-in marathon block (js/marathonData.js) is the coach's own
// race. Clients get their own plans and a "From your coach" card
// instead (js/role.js, js/coachCard.js).
const PERSONAL_PLAN = showsPersonalPlan();

function localIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const DAY_MS = 86400000;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

document.addEventListener("DOMContentLoaded", async () => {

    // Two columns on a computer (js/todayColumns.js); a client's order is re-applied below.
    watchTodayColumns();

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
    // Today is only ever shown signed in (js/loadHeader.js sends a guest to
    // the public site), so it never says "Guest": until sign-in answers it is
    // just the greeting, then the first name.
    if (welcomeHeading) {
        welcomeHeading.textContent = greeting;

        import("./auth.js").then(({ listenForAuth }) => {
            listenForAuth(user => {
                if (!user) return;
                const name = user.displayName ? user.displayName.split(" ")[0] : "";
                welcomeHeading.innerHTML = name ? `${greeting}, <br>${escapeHtml(name)}` : greeting;
            });
        }).catch(() => {});
    }

    // ==========================================
    // Phase status -- adapts before, during, and
    // after race day instead of being permanently
    // marathon-framed
    // ==========================================

    renderPhaseStatus();

    // Clients: Today's sections and their order follow what they have
    // (js/todayLayout.js): this device's copy first, then the profile's.
    if (!PERSONAL_PLAN) {
        applyClientLayout(cachedNavAccess() || fallbackAccess());
        profileAccess().then(applyClientLayout).catch(() => {});
    }

    // ==========================================
    // Today
    // ==========================================

    renderToday();

    // ==========================================
    // Featured Training
    // ==========================================

    const featuredSection = document.getElementById("featuredTraining");
    if (featuredSection) {
        // PERSONAL_PLAN is evaluated synchronously when this module starts,
        // but the account role is learned asynchronously from the profile.
        // Use the profile access result here so a coach's Featured Runs
        // section cannot disappear on a fresh device before the role cache
        // has been populated.
        profileAccess()
            .then(access => {
                if (!access?.isCoach) return;
                featuredSection.hidden = false;
                return import("./featuredTraining.js")
                    .then(({ mountFeaturedTraining }) => mountFeaturedTraining({
                        host: document.getElementById("featuredTrainingBody"),
                        manageButton: document.getElementById("featuredTrainingManage"),
                        today: localIso(new Date())
                    }));
            })
            .catch(error => {
                console.warn("Southbound: Featured Runs failed to load.", error);
                featuredSection.hidden = true;
            });
    }

    // The last two weeks' run laps in the background (a few a visit), so
    // every run's share card has its reps or splits ready.
    import("./runCardData.js").then(m => m.prefetchRecentLaps()).catch(() => {});

    // ==========================================
    // Nutrition (the day's food, one dark tile beside Featured runs)
    // ==========================================

    renderNutritionSnapshot();

    // ==========================================
    // From your coach (clients only)
    // ==========================================

    const coachSection = document.getElementById("coachCardSection");

    // Only once the profile says this is a client. It used to follow the
    // device's remembered role alone, so a coach whose device had lost it got
    // this card too, waiting on reads that were never meant for a coach. A
    // client this device already knows sees it at once (its loading state).
    if (coachSection && !PERSONAL_PLAN) {
        const known = cachedNavAccess();
        if (known && !known.isCoach) coachSection.hidden = false;
        profileAccess().then(access => {
            if (access?.isCoach) { coachSection.hidden = true; return; }
            coachSection.hidden = false;
            import("./coachCard.js")
                .then(({ renderCoachCard }) => renderCoachCard(document.getElementById("coachCardBody")))
                .catch(error => {
                    console.warn("Southbound: couldn't load the coach card.", error);
                    coachSection.hidden = true;
                });
            import("./clientPackageCard.js")
                .then(({ renderClientPackageCard }) => renderClientPackageCard())
                .catch(error => console.warn("Southbound: client package card failed to load.", error));
        }).catch(() => {});
    }

});

/* ==========================================
   Client layout (js/todayLayout.js)
========================================== */

let clientAccess = null;

function applyClientLayout(access) {
    clientAccess = access;
    unwrapTodayColumns();
    let anchor = document.querySelector(".eos-today-hero");
    for (const { id, on } of clientTodaySections(access)) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.toggle("sb-off", !on);
        if (anchor) { anchor.after(el); anchor = el; }
    }
    applyTodayColumns();
    renderPhaseStatus();
}

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
        const race = nextRace(getActiveRunningPrograms(), localIso(today));
        el.textContent = clientHeroLine(clientAccess || cachedNavAccess() || fallbackAccess(), names, raceCountdownText(race));
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

let clientTodayModule = null;
// The coach's card and marathon week (js/marathonToday.js): null until loaded, false if it failed (the plain rows stay).
let coachTodayModule = null;

// Mark Done / undo for the marathon run, from the card's button or a week-row node (both carry the week and the day).
function onCompleteClick(event) {
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

    // Just marked done: how hard was it? (1-10, the athlete model's effort,
    // js/effortCard.js). Goes on today's watch run, or waits for it.
    if (progress[w][dayKey]) {
        const d = new Date();
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        celebrateRun({ kind: "run" }).then(() => import("./effortCard.js")).then(m => m.askRunEffort(date))
            .catch(error => console.error("Southbound: effort question failed to load.", error));
    }
}

function renderToday() {
    // Clients: today's workout + this week, from every source
    // (js/todayClient.js). The coach's own dashboard continues below.
    if (!PERSONAL_PLAN) {
        if (clientTodayModule) clientTodayModule.renderClientToday();
        else import("./todayClient.js").then(m => { clientTodayModule = m; m.initClientToday(); })
            .catch(error => console.error("Southbound: client Today failed to load.", error));
        // "How hard was it?" after their watch runs, while they share the
        // athlete model with a coach (js/effortCard.js; mounts once).
        import("./effortCard.js").then(m => {
            m.mountCheckinStrip(document.getElementById("checkinStrip"), { client: true });
            m.mountEffortCard(document.getElementById("effortCheck"), { client: true, skipToday: true });
        })
            .catch(error => console.error("Southbound: effort card failed to load.", error));
        return;
    }

    const container = document.getElementById("todayItems");
    const dateLabel = document.getElementById("todayDateLabel");

    // Send the coach's own marathon runs to his COROS watch.
    import("./marathonCorosButton.js").then(m => m.mountMarathonCoros(document.getElementById("marathonCoros")))
        .catch(error => console.error("Southbound: Send to COROS failed to load.", error));
    // "How hard was it?" for his recent watch runs (the athlete model's effort numbers).
    // Today's run gets the one-line check-in strip in the header instead (js/effortCard.js mountCheckinStrip).
    import("./effortCard.js").then(m => {
        m.mountCheckinStrip(document.getElementById("checkinStrip"));
        m.mountEffortCard(document.getElementById("effortCheck"), { skipToday: true });
    })
        .catch(error => console.error("Southbound: effort card failed to load.", error));

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

    // The coach's card and marathon week (js/marathonToday.js): load it first, then draw.
    if (coachTodayModule === null) {
        import("./marathonToday.js")
            .then(m => { coachTodayModule = m; renderToday(); })
            .catch(error => { console.error("Southbound: coach Today card failed to load.", error); coachTodayModule = false; renderToday(); });
        return;
    }
    if (coachTodayModule) {
        try { coachTodayModule.renderCoachWeek({ today: localIso(today) }); }
        catch (error) { console.error("Southbound: marathon week failed to draw.", error); }
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
            data: dayData,
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

    // Today's events from the coach's own Planner (js/plannerEvents.js)
    if (PERSONAL_PLAN) try {
        getUpcomingPlannerEvents(0).forEach(ev => {
            const category = categoryFor(ev.category);
            items.push({
                icon: icon("calendar"),
                color: category.color,
                title: ev.title,
                detail: [formatTime(ev.time), category.label].filter(Boolean).join(" · "),
                link: "planner.html"
            });
        });
    } catch {
        // No planner data -- fine.
    }

    if (!items.length) {
        // A rest day the plan wrote something for ("Rest: walk, eat, celebrate"): that, not a generic line.
        const restText = restTextOf(dayData);
        container.innerHTML = PERSONAL_PLAN ? (restText ? `
            <div class="eos-today-rest">
                <strong>${escapeHtml(restText)}</strong>
                <span>Rest day on your plan.</span>
            </div>
        ` : `
            <div class="eos-today-rest">
                Nothing scheduled today. Good day to rest, or check in on your
                <a href="strength.html">Strength plan</a>.
            </div>
        `) : `
            <div class="eos-today-rest">
                Nothing on your plan today. Log a run on <a href="running.html">Running</a>,
                or start a workout from <a href="strength.html">Strength</a>.
            </div>
        `;
        return;
    }

    // The run first (as a card, with its picture); the rest stay as rows under it.
    items.sort((a, b) => Number(Boolean(b.isRun)) - Number(Boolean(a.isRun)));
    container.innerHTML = items.map(item => item.isRun && coachTodayModule ? `<div class="wk-today-cards">${coachTodayModule.runCard(item)}</div>` : item.isRun ? `
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

    // The card's button and the week row's nodes both tick the marathon run through one handler.
    for (const el of [container, document.getElementById("weekList")]) {
        if (el && !el.dataset.completeBound) {
            el.dataset.completeBound = "true";
            el.addEventListener("click", onCompleteClick);
        }
    }
}


/* ==========================================
   Nutrition snapshot (round two F2, 2026-10-15): a ring against the coach's own goal for the
   coach; a client sees the calories they've logged (no goal is set for a client).
========================================== */

function renderNutritionSnapshot() {
    const container = document.getElementById("nutritionSnapBars");
    if (!container) return;

    const key = "nutrition-" + new Date().toISOString().slice(0, 10);
    let day = null;
    try {
        const raw = localStorage.getItem(key);
        day = raw ? JSON.parse(raw) : null;
    } catch {
        day = null;
    }

    if (!day) {
        container.innerHTML = `<div class="eos-nutrition-snap-empty">Nothing logged yet today.</div>`;
        return;
    }

    const kcal = Math.round(Number(day.calories) || 0);
    if (!PERSONAL_PLAN) {
        container.innerHTML = `<div class="eos-nutrition-num"><b>${kcal}</b><small>kcal logged</small></div>`;
        return;
    }

    const GOAL = 3200;
    const pct = Math.min(100, Math.round((kcal / GOAL) * 100));
    const circumference = 2 * Math.PI * 27;
    container.innerHTML = `<div class="eos-nutrition-ring" role="img" aria-label="${pct}% of ${GOAL} calories">
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" class="track"></circle><circle cx="32" cy="32" r="27" class="fill" stroke-dasharray="${((pct / 100) * circumference).toFixed(1)} ${circumference.toFixed(1)}"></circle></svg>
        <b>${pct}%</b></div>
        <div class="eos-nutrition-num"><b>${kcal}</b><small>of ${GOAL} kcal</small></div>`;
}
