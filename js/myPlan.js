/* ==========================================
   Southbound — My Plan (plan.html), client side

   The plan the coach published, from the copy on this device
   (js/coachPlanStore.js, kept current by js/coachPlanSync.js), so it
   opens offline too:
     - "Your plan was updated": the coach's note and what changed, with
       a Got it button (acknowledgePlan). Opening the page counts as
       seen (markPlanViewed). Both are shown to the coach.
     - the big picture: plan, version, coach, goal, week X of Y
     - one week at a time, with done marks and today highlighted
========================================== */

import { listenForAuth } from "./auth.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { listMyPlans, markPlanViewed, acknowledgePlan } from "./coachingPlans.js";
import { planWeekFor, dayText, shortDay, isoDate, planDateRange } from "./coachingPlanModel.js";
import { getMyClientRecord } from "./clientRecords.js";
import { listMyCoaches } from "./coachAccess.js";
import { cachedRole } from "./role.js";
import { toast, emptyHtml, friendlyError } from "./ui.js";
import { icon } from "./icons.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = isoDate(new Date());

const state = { plans: [], headers: [], selected: null, weekIndex: 0, goal: "" };

function activePlans() {
    return loadCoachPlans().filter(p => p.status === "active" && p.generatedPlan?.weeks?.length);
}

// ---------- Update notice ----------

function renderNotice() {
    const pending = state.headers.filter(h => h.status === "active" && (h.ackVersion || 0) < h.version);
    $("planNotice").innerHTML = pending.map(h => `
        <div class="clients-card myplan-notice" data-plan="${esc(h.id)}">
            <div class="myplan-notice-head">
                <span class="myplan-notice-icon">${icon("send")}</span>
                <div>
                    <strong>${h.version > 1 ? `${esc(h.coachName || "Your coach")} updated your plan` : `Your plan is ready`}</strong>
                    <span class="myplan-meta">${esc(h.name)}${h.version > 1 ? ` · version ${h.version}` : ""}</span>
                </div>
            </div>
            ${h.coachNote ? `<p class="myplan-note">"${esc(h.coachNote)}"</p>` : ""}
            ${h.changes?.length ? `
                <p class="myplan-label">What changed</p>
                <ul class="myplan-changes">${h.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
            <button type="button" class="sb-btn sb-btn-primary" data-ack="${esc(h.id)}">${icon("check")} Got it</button>
        </div>`).join("");
}

$("planNotice").addEventListener("click", async event => {
    const btn = event.target.closest("[data-ack]");
    if (!btn) return;
    const header = state.headers.find(h => h.id === btn.dataset.ack);
    btn.disabled = true;
    try {
        await acknowledgePlan(header);
        header.ackVersion = header.version;
        header.viewedVersion = header.version;
        renderNotice();
        toast(`Thanks. ${header.coachName || "Your coach"} will see you've got it.`);
    } catch (error) {
        console.error(error);
        btn.disabled = false;
        toast(friendlyError(error, "send that"), { type: "error" });
    }
});

// ---------- The plan ----------

function renderPlan() {
    const plan = state.selected;
    if (!plan) return;
    const weeks = plan.generatedPlan.weeks;
    const week = weeks[state.weekIndex];
    const position = planWeekFor(plan.generatedPlan, today);
    const { startDate, endDate } = planDateRange(plan.generatedPlan);
    const header = state.headers.find(h => h.id === plan.coachPlanId);
    const workouts = (week.days || []).filter(d => d.type && d.type !== "rest");
    const done = workouts.filter(d => d.completed);
    const miles = workouts.reduce((s, d) => s + (Number(d.miles) || 0), 0);
    const doneMiles = done.reduce((s, d) => s + (Number(d.miles) || 0), 0);
    const r1 = n => Math.round(n * 10) / 10;
    const raceDate = plan.generatedPlan.raceDate;

    const where = position.state === "current" ? `Week ${position.index + 1} of ${weeks.length}`
        : position.state === "upcoming" ? `Starts ${shortDay(startDate)}`
        : position.state === "finished" ? "Finished" : `${weeks.length} weeks`;

    $("planBody").innerHTML = `
        ${state.plans.length > 1 ? `
            <div class="clients-tabs myplan-switch" role="tablist">
                ${state.plans.map(p => `<button type="button" class="clients-tab${p.id === plan.id ? " active" : ""}" data-select="${esc(p.id)}">${esc(p.name)}</button>`).join("")}
            </div>` : ""}

        <section class="clients-card myplan-overview">
            <div class="myplan-title">
                <h2>${esc(plan.name)}</h2>
                <span class="myplan-meta">From ${esc(plan.coachName || header?.coachName || "your coach")} · version ${plan.coachVersion}</span>
            </div>
            <dl class="myplan-facts">
                ${state.goal ? `<div><dt>Goal</dt><dd>${esc(state.goal)}</dd></div>` : ""}
                <div><dt>Where you are</dt><dd>${esc(where)}</dd></div>
                <div><dt>Dates</dt><dd>${esc(shortDay(startDate))} – ${esc(shortDay(endDate))}</dd></div>
                ${raceDate ? `<div><dt>Race day</dt><dd>${esc(shortDay(raceDate))}</dd></div>` : ""}
            </dl>
        </section>

        <section class="clients-card myplan-week">
            <div class="myplan-week-nav">
                <button type="button" class="sb-btn sb-btn-icon" data-week="-1" aria-label="Previous week"${state.weekIndex === 0 ? " disabled" : ""}>${icon("chevronLeft")}</button>
                <div class="myplan-week-title">
                    <strong>Week ${week.week ?? state.weekIndex + 1}${week.phase ? ` · ${esc(week.phase)}` : ""}</strong>
                    <span class="myplan-meta">${esc(shortDay(week.days[0].date))} – ${esc(shortDay(week.days[week.days.length - 1].date))}</span>
                </div>
                <button type="button" class="sb-btn sb-btn-icon" data-week="1" aria-label="Next week"${state.weekIndex >= weeks.length - 1 ? " disabled" : ""}>${icon("chevronRight")}</button>
            </div>
            ${workouts.length ? `
                <p class="myplan-progress">${done.length} of ${workouts.length} done${miles ? ` · ${r1(doneMiles)} / ${r1(miles)} mi` : ""}</p>` : ""}
            <ol class="myplan-days">
                ${week.days.map(day => {
                    const isToday = day.date === today;
                    const rest = !day.type || day.type === "rest";
                    return `
                        <li class="myplan-day${isToday ? " is-today" : ""}${day.completed ? " is-done" : ""}${rest ? " is-rest" : ""}">
                            <span class="myplan-day-date">${esc(shortDay(day.date).split(",")[0])}<small>${esc(shortDay(day.date).split(", ")[1] || "")}</small></span>
                            <span class="myplan-day-text">${esc(dayText(day))}</span>
                            <span class="myplan-day-state">${day.completed ? `${icon("checkCircle")}<span class="sr-only">Done</span>` : isToday ? `<span class="myplan-today">Today</span>` : ""}</span>
                        </li>`;
                }).join("")}
            </ol>
            <p class="clients-card-note myplan-hint">Mark workouts done on <a href="running.html">Running</a> or <a href="index.html">Today</a>. Something needs to change? Tell your coach in your <a href="checkin.html">weekly check-in</a>.</p>
        </section>`;
}

$("planBody").addEventListener("click", event => {
    const weekBtn = event.target.closest("[data-week]");
    if (weekBtn) {
        const n = state.selected.generatedPlan.weeks.length;
        state.weekIndex = Math.max(0, Math.min(n - 1, state.weekIndex + Number(weekBtn.dataset.week)));
        renderPlan();
        return;
    }
    const select = event.target.closest("[data-select]");
    if (select) {
        state.selected = state.plans.find(p => p.id === select.dataset.select);
        state.weekIndex = planWeekFor(state.selected.generatedPlan, today).index;
        renderPlan();
    }
});

// ---------- Load ----------

let started = false;

listenForAuth(async user => {
    if (!user || started) return;
    started = true;

    if (cachedRole() === "coach") {
        $("planLoading").hidden = true;
        $("planBody").innerHTML = `<div class="clients-card">${emptyHtml({ iconName: "calendar", title: "This is your clients' view", text: "Clients see the plan you publish here. Build and publish plans from a client's page in My Clients (Plan tab).", actionHref: "clients.html", actionLabel: "My Clients" })}</div>`;
        return;
    }

    state.plans = activePlans();
    const [headers, record, coaches] = await Promise.all([
        listMyPlans().catch(error => { console.warn("Southbound: plan updates unavailable.", error?.code || error); return []; }),
        getMyClientRecord().catch(() => null),
        listMyCoaches().catch(() => [])
    ]);
    state.headers = headers;
    state.goal = [record?.primaryGoal, record?.targetEvent].filter(Boolean).join(" · ");
    $("planLoading").hidden = true;

    renderNotice();
    // Opening the page counts as seeing the newest version.
    for (const h of headers) {
        if (h.status === "active" && (h.viewedVersion || 0) < h.version) {
            markPlanViewed(h).then(() => { h.viewedVersion = h.version; }).catch(() => {});
        }
    }

    if (!state.plans.length) {
        $("planBody").innerHTML = `<div class="clients-card">${coaches.length
            ? emptyHtml({ iconName: "calendar", title: "No plan from your coach yet", text: "When your coach publishes your plan it shows up here, and you'll get an email.", actionHref: "updates.html", actionLabel: "From Your Coach" })
            : emptyHtml({ iconName: "link", title: "Not connected to a coach yet", text: "Connect with your coach and the plan they build for you shows up here.", actionHref: "clients.html?tab=share", actionLabel: "Connect with Coach" })}</div>`;
        return;
    }
    const params = new URLSearchParams(location.search);
    state.selected = state.plans.find(p => p.coachPlanId === params.get("plan")) || state.plans[0];
    state.weekIndex = planWeekFor(state.selected.generatedPlan, today).index;
    renderPlan();
});
