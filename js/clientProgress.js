/* ==========================================
   Southbound — My Progress (progress.html)

   The client's last four weeks, only what fits what they do
   (js/progressView.js): miles / strength / workouts / sessions
   attended / check-ins / habit streak, this week, six weeks, their plan,
   their sessions with the coach's notes, check-ins. Reads only the
   client's own data (workout logs, check-ins, bookings + session logs,
   the coach plans on this device) through the same summarizeProgress
   the coach's hub uses. Nothing is stored. Each read falls back to
   nothing, so offline it shows what the device has.
========================================== */

import { waitForUser } from "./auth.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { listMyResults } from "./workoutResults.js";
import { listMyCheckins } from "./checkins.js";
import { listMyBookingRequests, SESSION_TYPES } from "./scheduling.js";
import { sessionList, attendance, logWords, statusLabel } from "./sessionModel.js";
import { summarizePlans, summarizeProgress, isoDate, shortDate } from "./clientSummary.js";
import { profileAccess } from "./navAccess.js";
import { progressHighlights, progressSections, habitStreak } from "./progressView.js";
import { barsHtml } from "./svgCharts.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const quiet = (promise, fallback) => promise.catch(error => { console.warn("Southbound: progress data partly unavailable.", error?.code || error); return fallback; });

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDate(d); };
const sessionName = s => `${SESSION_TYPES.find(t => t.value === s.sessionType)?.label || "Session"}${s.label ? ` · ${s.label}` : ""}`;

function show(id, on) { const el = $(id); if (el) el.hidden = !on; }

function renderMetrics(items) {
    $("progressMetrics").innerHTML = items.map(m => `
        <div class="pg-metric">
            <span>${esc(m.label)}</span>
            <strong>${esc(m.value)}</strong>
            <small>${esc(m.detail)}</small>
        </div>`).join("");
}

function renderWeek(progress) {
    const w = progress.plan.week;
    show("weekCard", Boolean(w && w.planned));
    if (!w || !w.planned) return;
    const pct = w.due ? Math.round((w.completed / w.due) * 100) : 0;
    $("weekLabel").textContent = `${w.completed} of ${w.planned} done`;
    $("weekBody").innerHTML = `
        <div class="pg-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.round((w.completed / w.planned) * 100))}%"></span></div>
        <p class="pg-note">${w.due ? `${pct}% of what's been due so far` : "Nothing due yet this week"}${w.missed ? ` · ${w.missed} missed` : ""}${w.skipped ? ` · ${w.skipped} skipped` : ""}${w.plannedMiles ? ` · ${w.completedMiles} of ${w.plannedMiles} mi` : ""}</p>`;
}

function renderTrend(progress, runner) {
    const weeks = progress.trainingTrends?.weeks || [];
    const has = progress.trainingTrends?.hasData;
    show("trendCard", true);
    if (!has) {
        $("trendBody").innerHTML = `<p class="pg-note">Nothing logged in the last six weeks yet. When you log a workout from your plan, it builds up here.</p>`;
        return;
    }
    const miles = runner && weeks.some(w => w.runSessions);
    $("trendBody").innerHTML = `
        ${barsHtml(weeks.map(w => ({ label: shortDate(w.start), value: miles ? w.runMiles : w.completedWorkouts, current: w.isCurrent })), { unit: miles ? "mi" : "workouts" })}
        <p class="pg-note">${miles ? "Miles logged each week" : "Workouts done each week"}; this week is outlined.</p>`;
}

function renderPlan(progress) {
    const p = progress.plan;
    show("planCard", Boolean(p.name));
    if (!p.name) return;
    const state = p.state === "upcoming" ? `Starts ${shortDate(p.startDate)}`
        : p.state === "finished" ? `Finished ${shortDate(p.endDate)}`
        : p.weekNumber ? `Week ${p.weekNumber}${p.totalWeeks ? ` of ${p.totalWeeks}` : ""}` : "Current plan";
    const change = progress.trend.milesChangePct;
    $("planBody").innerHTML = `
        <ul class="pg-rows">
            <li><div><strong>${esc(p.name)}</strong><small>${esc(state)}</small></div></li>
            ${progress.trend.recentMiles || progress.trend.priorMiles ? `<li><div><strong>Last 2 weeks: ${esc(progress.trend.recentMiles)} mi</strong><small>${esc(progress.trend.priorMiles)} mi the 2 weeks before${change == null ? "" : ` (${change > 0 ? "+" : ""}${change}%)`}</small></div></li>` : ""}
        </ul>`;
}

function renderSessions(sessions, today) {
    show("sessionsCard", true);
    const past = sessions.filter(s => s.date <= today && s.log).reverse();
    const next = sessions.find(s => s.date >= today && !s.log);
    const att = attendance(sessions.filter(s => s.date <= today));
    const rows = past.slice(0, 4).map(s => `
        <li>
            <div><strong>${esc(shortDate(s.date))} · ${esc(sessionName(s))}</strong>${logWords(s.log) ? `<small>${esc(logWords(s.log))}</small>` : ""}</div>
            <span class="pg-tag">${esc(statusLabel(s.log.status))}</span>
        </li>`).join("");
    $("sessionsBody").innerHTML = `
        ${att.line ? `<p class="pg-note">${esc(att.line)}</p>` : `<p class="pg-note">Your coach logs each session here, with what you worked on and what to do next time.</p>`}
        ${next ? `<ul class="pg-rows"><li><div><strong>Next: ${esc(shortDate(next.date))} · ${esc(sessionName(next))}</strong></div></li></ul>` : ""}
        ${rows ? `<ul class="pg-rows">${rows}</ul>` : ""}`;
}

function renderCheckins(progress) {
    show("checkinCard", true);
    const c = progress.checkins;
    $("checkinBody").innerHTML = c.count
        ? `<ul class="pg-rows"><li><div><strong>${c.count} check-in${c.count === 1 ? "" : "s"} in 4 weeks</strong><small>${c.average ? `Average ${c.average}/5` : "No ratings yet"}${c.latestRating ? ` · latest ${c.latestRating}/5` : ""}</small></div></li></ul>`
        : `<p class="pg-note">No check-ins in the last four weeks. A two-minute check-in tells your coach how the week went.</p>`;
}

async function init() {
    const user = await waitForUser();
    if (!user) return;
    const today = isoDate(new Date());
    const [access, results, checkins, requests] = await Promise.all([
        profileAccess(),
        quiet(listMyResults(), []),
        quiet(listMyCheckins(), []),
        quiet(listMyBookingRequests(), [])
    ]);
    const shared = {
        coachPlans: loadCoachPlans(),
        runningPrograms: readJson("running-programs", []),
        trainingPrograms: readJson("training-programs", [])
    };
    const plans = summarizePlans(shared, today, [], results);
    const sessions = sessionList(requests, today);
    const progress = summarizeProgress({ plans, results, sessions, checkins, today });
    const recentSessions = sessions.filter(s => s.date >= addDays(today, -27) && s.date <= today);
    const sections = progressSections(access);
    const streak = habitStreak(readJson("entries", {}));

    const items = progressHighlights({ progress, access, attendance: attendance(recentSessions), streak });
    renderMetrics(items);
    if (sections.week) renderWeek(progress);
    if (sections.trend) renderTrend(progress, access.caps?.includes("running"));
    if (sections.plan) renderPlan(progress);
    if (sections.sessions) renderSessions(sessions, today);
    if (sections.checkins) renderCheckins(progress);

    const nothingYet = !progress.hasActivity && !progress.plan.name && !sessions.length && !streak;
    show("emptyCard", nothingYet);
    if (nothingYet) {
        $("emptyText").textContent = sections.sessions && !sections.plan
            ? "Your progress builds here as you train with your coach: sessions attended, what you worked on, and your habit streak."
            : "Your progress builds here as you log workouts from your coach's plan, check in each week and keep your habits going.";
    }
    import("./icons.js").then(m => m.hydrate()).catch(() => {});
}

init().catch(error => {
    console.error("Southbound: progress failed to load.", error);
    $("progressIntro").textContent = "Progress couldn't load right now. Try again when you're back online.";
    $("progressMetrics").innerHTML = "";
});
