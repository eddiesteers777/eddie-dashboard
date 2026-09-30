/* ==========================================
   Southbound — Client Progress

   Client-facing read-only progress view. Reuses the same pure progress
   model used by the Client Hub instead of creating a second source of
   truth or a new Firestore collection.
========================================== */

import { waitForUser } from "./auth.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { listMyResults } from "./workoutResults.js";
import { listMyCheckins } from "./checkins.js";
import { listMyBookingRequests } from "./scheduling.js";
import { sessionList } from "./sessionModel.js";
import { summarizePlans, summarizeProgress, isoDate, shortDate } from "./clientSummary.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function readArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function pct(value) {
    if (value == null) return "—";
    return value > 0 ? "+" + value + "%" : value + "%";
}

function renderMetrics(progress) {
    const items = [
        ["Completed workouts", progress.activity.completedWorkouts, "last 28 days"],
        ["Run volume", progress.activity.runMiles + " mi", progress.activity.runSessions + " logged runs"],
        ["Strength", progress.activity.strengthSessions, progress.activity.strengthSets + " sets logged"],
        ["Check-ins", progress.checkins.count, progress.checkins.average ? "Average " + progress.checkins.average + "/5" : "No ratings yet"]
    ];
    $("progressMetrics").innerHTML = items.map(([label, value, detail]) => `
        <div class="stat-card">
            <span>${esc(label)}</span>
            <h2>${esc(value)}</h2>
            <p>${esc(detail)}</p>
        </div>
    `).join("");
}

function renderCurrentWeek(progress) {
    const week = progress.plan.week;
    const card = $("currentWeekCard");
    if (!week) {
        card.hidden = true;
        return;
    }

    card.hidden = false;
    $("currentWeekLabel").textContent = week.due ? `${week.completed} of ${week.due} due completed` : "Nothing due yet";
    const completion = week.due ? Math.round((week.completed / week.due) * 100) : 0;
    const miles = week.plannedMiles
        ? `${week.completedMiles} / ${week.plannedMiles} mi completed`
        : "Mileage is not part of this plan";

    $("currentWeekBody").innerHTML = `
        <div class="tr-minis">
            <div class="tr-mini">
                <div class="tr-mini-top"><span>Completion</span><strong>${esc(completion + "%")}</strong></div>
                <small>${esc(week.completed)} completed · ${esc(week.missed)} missed · ${esc(week.skipped)} skipped</small>
            </div>
            <div class="tr-mini">
                <div class="tr-mini-top"><span>Volume</span><strong>${esc(miles)}</strong></div>
                <small>Based on your current coach plan.</small>
            </div>
        </div>
    `;
}

function renderTrend(progress) {
    const weeks = progress.trainingTrends?.weeks || [];
    if (!weeks.length) {
        $("trendBody").innerHTML = '<p class="tr-empty">No logged training yet. Complete or log a workout and your history will start appearing here.</p>';
        return;
    }

    const maxMiles = Math.max(1, ...weeks.map(w => Number(w.runMiles) || 0));
    const rows = weeks.map(week => {
        const height = Math.max(4, Math.round(((Number(week.runMiles) || 0) / maxMiles) * 100));
        const range = shortDate(week.start) + "–" + shortDate(week.end);
        const detail = [
            week.completedWorkouts + " completed",
            week.runMiles + " mi",
            week.averageRpe ? "avg RPE " + week.averageRpe : ""
        ].filter(Boolean).join(" · ");
        return `
            <div class="tr-bar${week.isCurrent ? " is-current" : ""}">
                <div class="tr-bar-track" title="${esc(detail)}">
                    <div class="tr-bar-fill${week.runMiles >= 0 && week.runMiles > 0 ? "" : ""}" style="height:${height}%"></div>
                </div>
                <small>${esc(range)}</small>
            </div>
        `;
    }).join("");

    $("trendBody").innerHTML = `
        <div class="tr-bars" aria-label="Six week run volume">
            ${rows}
        </div>
        <div class="tr-legend">
            <span><span class="tr-key fill"></span>Logged run volume</span>
            <span>The current week is outlined.</span>
        </div>
        <div class="tr-list">
            ${weeks.map(w => `
                <li>
                    <strong>${esc(shortDate(w.start))}</strong>
                    <span>${esc(w.runMiles + " mi")}</span>
                    <span>${esc(w.completedWorkouts + " workouts")}</span>
                    <span>${esc(w.averageRpe ? "RPE " + w.averageRpe : "—")}</span>
                </li>
            `).join("")}
        </div>
    `;
}

function renderPlan(progress) {
    const p = progress.plan;
    const card = $("planProgressCard");

    if (!p.name && !p.weekNumber) {
        card.hidden = true;
        return;
    }

    card.hidden = false;
    const state = p.state === "upcoming" ? "Starts " + shortDate(p.startDate)
        : p.state === "finished" ? "Finished " + shortDate(p.endDate)
        : p.weekNumber ? `Week ${p.weekNumber}${p.totalWeeks ? " of " + p.totalWeeks : ""}` : "Current plan";

    $("planProgressBody").innerHTML = `
        <div class="tr-minis">
            <div class="tr-mini">
                <div class="tr-mini-top"><span>Plan</span><strong>${esc(p.name || "Coach plan")}</strong></div>
                <small>${esc(state)}</small>
            </div>
            <div class="tr-mini">
                <div class="tr-mini-top"><span>Last 14 days</span><strong>${esc(progress.trend.milesChangePct == null ? "—" : pct(progress.trend.milesChangePct))}</strong></div>
                <small>${esc(progress.trend.recentMiles)} mi recent · ${esc(progress.trend.priorMiles)} mi previous</small>
            </div>
        </div>
    `;
}

function renderCheckins(progress) {
    const card = $("checkinProgressCard");
    if (!progress.checkins.count) {
        card.hidden = true;
        return;
    }

    card.hidden = false;
    const rating = progress.checkins.average ? `${progress.checkins.average}/5` : "No rating average";
    const latest = progress.checkins.latestRating ? `Latest ${progress.checkins.latestRating}/5` : "No latest rating";

    $("checkinProgressBody").innerHTML = `
        <div class="tr-minis">
            <div class="tr-mini">
                <div class="tr-mini-top"><span>Recent average</span><strong>${esc(rating)}</strong></div>
                <small>Based on check-ins in the last 28 days.</small>
            </div>
            <div class="tr-mini">
                <div class="tr-mini-top"><span>Most recent</span><strong>${esc(latest)}</strong></div>
                <small>${esc(progress.checkins.rated)} rated check-in${progress.checkins.rated === 1 ? "" : "s"} in the window.</small>
            </div>
        </div>
    `;
}

async function init() {
    try {
        const user = await waitForUser();
        if (!user) return;

        const today = isoDate(new Date());
        const [results, checkins, requests] = await Promise.all([
            listMyResults(),
            listMyCheckins(),
            listMyBookingRequests()
        ]);

        const shared = {
            coachPlans: loadCoachPlans(),
            runningPrograms: readArray("running-programs"),
            trainingPrograms: readArray("training-programs")
        };
        const plans = summarizePlans(shared, today, [], results);
        const sessions = sessionList(requests, today);
        const progress = summarizeProgress({ plans, results, sessions, checkins, today });

        renderMetrics(progress);
        renderCurrentWeek(progress);
        renderTrend(progress);
        renderPlan(progress);
        renderCheckins(progress);

        $("emptyProgressCard").hidden = Boolean(progress.hasActivity || progress.plan.name);
    } catch (error) {
        console.error("Southbound progress failed to load.", error);
        $("progressIntro").textContent = "Progress could not load right now. Try again when you are back online.";
        $("emptyProgressCard").hidden = false;
    }
}

init();
