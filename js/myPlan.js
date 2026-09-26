/* ==========================================
   Southbound — My Plan (plan.html), client side

   The client's plan and week, from what's on this device (coach plans
   via js/coachPlanStore.js, kept current by js/coachPlanSync.js), so it
   opens offline too:
     - "Your plan was updated": the coach's note and what changed, with
       a Got it button (acknowledgePlan). Opening the page counts as
       seen (markPlanViewed). Both are shown to the coach.
     - the big picture: plan, version, coach, goal, week X of Y
     - the whole week, one week at a time: everything in it from every
       source (js/weekModel.js), with Mark done on each workout
     - "Need a change?": ask the coach instead of editing their plan,
       and the coach's answers (js/changeRequestDialog.js)
========================================== */

import { listenForAuth } from "./auth.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { listMyPlans, markPlanViewed, acknowledgePlan } from "./coachingPlans.js";
import { planWeekFor, shortDay, isoDate, planDateRange, mondayOf, addDays } from "./coachingPlanModel.js";
import { buildWeek } from "./weekModel.js";
import { weekInputs, loadSessions } from "./weekData.js";
import { weekListHtml, summaryLine, bindWeekActions } from "./weekView.js";
import { getMyClientRecord } from "./clientRecords.js";
import { listMyCoaches } from "./coachAccess.js";
import { cachedRole } from "./role.js";
import { toast, emptyHtml, friendlyError, sbChoose, sbAlert } from "./ui.js";
import { icon } from "./icons.js";
import { listMyChangeRequests } from "./changeRequests.js";
import { openChangeRequestDialog, changeRequestsHtml, bindChangeRequestActions } from "./changeRequestDialog.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = isoDate(new Date());

const state = { plans: [], headers: [], selected: null, monday: "", goal: "", sessions: [], items: new Map(), coaches: [], requests: [] };

// Who a change request goes to: this plan's coach, else their linked coach.
function currentCoach() {
    const p = state.selected;
    if (p?.coachUid) return { coachUid: p.coachUid, coachName: p.coachName || "" };
    return state.coaches[0] || null;
}

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

// ---------- The plan + the week ----------

function renderPlan() {
    const plan = state.selected;
    const inputs = weekInputs(state.sessions);
    const week = buildWeek(state.monday, inputs, today);
    state.items = new Map(week.days.flatMap(d => d.items).map(i => [i.id, i]));
    const thisMonday = mondayOf(today);

    let overview = "";
    if (plan) {
        const weeks = plan.generatedPlan.weeks;
        const position = planWeekFor(plan.generatedPlan, today);
        const { startDate, endDate } = planDateRange(plan.generatedPlan);
        const header = state.headers.find(h => h.id === plan.coachPlanId);
        const raceDate = plan.generatedPlan.raceDate;
        const where = position.state === "current" ? `Week ${position.index + 1} of ${weeks.length}`
            : position.state === "upcoming" ? `Starts ${shortDay(startDate)}`
            : position.state === "finished" ? "Finished" : `${weeks.length} weeks`;
        overview = `
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
            </section>`;
    }

    const ctx = week.context;
    const title = ctx ? `Week ${ctx.weekNumber} of ${ctx.totalWeeks}${ctx.phase ? ` · ${ctx.phase}` : ""}` : state.monday === thisMonday ? "This week" : "Week";
    $("planBody").innerHTML = `
        ${overview}
        <section class="clients-card myplan-week">
            <div class="wk-nav">
                <button type="button" class="sb-btn sb-btn-icon" data-week="-1" aria-label="Previous week">${icon("chevronLeft")}</button>
                <div class="wk-nav-title">
                    <strong>${esc(title)}</strong>
                    <span>${esc(shortDay(week.monday))} – ${esc(shortDay(week.sunday))}${ctx && !plan ? ` · ${esc(ctx.planName)}` : ""}</span>
                </div>
                <button type="button" class="sb-btn sb-btn-icon" data-week="1" aria-label="Next week">${icon("chevronRight")}</button>
            </div>
            ${state.monday !== thisMonday ? `<button type="button" class="sb-btn sb-btn-tertiary wk-this-week" data-week="now">Back to this week</button>` : ""}
            ${week.summary.planned || week.summary.sessions ? `<p class="myplan-progress">${esc(summaryLine(week.summary))}</p>` : ""}
            ${weekListHtml(week)}
            <div class="myplan-foot">
                <p class="clients-card-note myplan-hint">Tap ${icon("check")} to mark a workout done.</p>
                <div class="myplan-foot-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-act="calendar">${icon("calendar")} Add to calendar</button>
                    ${corosOn() ? `<button type="button" class="sb-btn sb-btn-secondary" data-act="coros-week">${icon("send")} Send week to COROS</button>` : ""}
                    ${currentCoach() ? `<button type="button" class="sb-btn sb-btn-secondary" data-act="change">${icon("messageSquare")} Need a change?</button>` : ""}
                </div>
            </div>
            ${corosOn() ? "" : `<p class="clients-card-note myplan-coros-hint">Have a COROS watch? <a href="settings.html#coros">Connect it in Settings</a> to send your runs straight to it.</p>`}
        </section>
        ${changeRequestsHtml(state.requests, currentCoach()?.coachName || "Your coach")}`;
}

$("planBody").addEventListener("click", async event => {
    const corosBtn = event.target.closest('[data-act="coros-week"]');
    if (corosBtn) {
        await sendWeekToCoros(corosBtn);
        return;
    }
    if (event.target.closest('[data-act="calendar"]')) {
        await addToCalendar();
        return;
    }
    if (event.target.closest('[data-act="change"]')) {
        const coach = currentCoach();
        if (!coach) return;
        // Days they can pick: today on, through the end of next week.
        const from = state.monday > today ? state.monday : today;
        const dates = [];
        for (let d = from; d <= addDays(mondayOf(from), 13); d = addDays(d, 1)) dates.push(d);
        const saved = await openChangeRequestDialog({ coach, planId: state.selected?.coachPlanId || null, dates });
        if (saved) { state.requests.unshift(saved); renderPlan(); }
        return;
    }
    const weekBtn = event.target.closest("[data-week]");
    if (weekBtn) {
        state.monday = weekBtn.dataset.week === "now" ? mondayOf(today) : addDays(state.monday, 7 * Number(weekBtn.dataset.week));
        renderPlan();
        return;
    }
    const select = event.target.closest("[data-select]");
    if (select) {
        state.selected = state.plans.find(p => p.id === select.dataset.select);
        state.monday = mondayFor(state.selected);
        renderPlan();
    }
});

bindWeekActions($("planBody"), { getItem: id => state.items.get(id), onChange: () => renderPlan() });
bindChangeRequestActions($("planBody"), id => { state.requests = state.requests.filter(r => r.id !== id); renderPlan(); });

// ---------- Send to COROS (js/corosSend.js) ----------

// COROS connected on this device? (Its sign-in token lives in this browser.)
function corosOn() {
    try { return Boolean(JSON.parse(localStorage.getItem("__eddieos_coros_oauth_v2") || "null")?.access_token); } catch { return false; }
}

async function sendWeekToCoros(btn) {
    const { entryFor, loadSent, sendToCoros, sendSummary } = await import("./corosSend.js");
    const sent = loadSent();
    const dates = Array.from({ length: 7 }, (_, i) => addDays(state.monday, i)).filter(d => d >= today);
    const entries = weekInputs(state.sessions).plans
        .flatMap(p => dates.map(d => entryFor(p, d)))
        .filter(e => e.course || sent[e.key]);
    if (!entries.some(e => e.course)) {
        toast("No runs left to send this week.");
        return;
    }
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = "Sending to COROS…";
    try {
        const r = await sendToCoros(entries, { today });
        const summary = sendSummary(r);
        if (r.notes.length) await sbAlert([summary ? `${summary}.` : "", ...r.notes].filter(Boolean).join("\n\n"), { title: "COROS" });
        else if (summary) toast(summary);
    } catch (error) {
        toast(friendlyError(error, "send that to COROS"), { type: "error" });
    } finally {
        btn.disabled = false;
        btn.innerHTML = label;
    }
}

// ---------- Add to calendar (js/calendarButton.js) ----------

async function addToCalendar() {
    const inputs = weekInputs(state.sessions);
    const plan = state.selected;
    const end = plan ? planDateRange(plan.generatedPlan).endDate : "";
    const from = state.monday > mondayOf(today) ? state.monday : mondayOf(today);
    const restWeeks = [];
    if (end) for (let m = from; m <= end && restWeeks.length < 30; m = addDays(m, 7)) restWeeks.push(m);
    const choices = [{ value: "week", label: "This week", primary: restWeeks.length <= 1 }];
    if (restWeeks.length > 1) choices.push({ value: "plan", label: `Rest of the plan (${restWeeks.length} weeks)`, primary: true });
    const choice = await sbChoose("Your workouts and sessions go into your phone's calendar, each with a link back to Southbound. Adding them again later updates them.", { title: "Add to your calendar", choices });
    if (!choice) return;
    const { downloadCalendar } = await import("./calendarButton.js");
    if (choice === "week") {
        downloadCalendar([buildWeek(state.monday, inputs, today)], { filename: `southbound-week-${state.monday}.ics` });
    } else {
        const slug = String(plan.name || "plan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
        downloadCalendar(restWeeks.map(m => buildWeek(m, inputs, today)), { filename: `southbound-${slug}.ics`, name: plan.name || "Southbound Training" });
    }
}

// The week to open on: this week, or the plan's first week if it hasn't started.
function mondayFor(plan) {
    if (!plan) return mondayOf(today);
    const position = planWeekFor(plan.generatedPlan, today);
    const { startDate } = planDateRange(plan.generatedPlan);
    return position.state === "upcoming" && startDate ? mondayOf(startDate) : mondayOf(today);
}

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
    const [headers, record, coaches, requests] = await Promise.all([
        listMyPlans().catch(error => { console.warn("Southbound: plan updates unavailable.", error?.code || error); return []; }),
        getMyClientRecord().catch(() => null),
        listMyCoaches().catch(() => []),
        listMyChangeRequests().catch(() => [])
    ]);
    state.headers = headers;
    state.coaches = coaches;
    state.requests = requests;
    state.goal = [record?.primaryGoal, record?.targetEvent].filter(Boolean).join(" · ");
    $("planLoading").hidden = true;

    renderNotice();
    // Opening the page counts as seeing the newest version.
    for (const h of headers) {
        if (h.status === "active" && (h.viewedVersion || 0) < h.version) {
            markPlanViewed(h).then(() => { h.viewedVersion = h.version; }).catch(() => {});
        }
    }

    const params = new URLSearchParams(location.search);
    state.selected = state.plans.find(p => p.coachPlanId === params.get("plan")) || state.plans[0] || null;
    state.monday = mondayFor(state.selected);

    // Nothing to show at all: no coach plan, no plan of their own, nothing scheduled.
    const anything = state.plans.length || weekInputs().plans.length || weekInputs().strength.length;
    if (!anything) {
        $("planBody").innerHTML = `<div class="clients-card">${coaches.length
            ? emptyHtml({ iconName: "calendar", title: "No plan from your coach yet", text: "When your coach publishes your plan it shows up here, and you'll get an email.", actionHref: "updates.html", actionLabel: "From Your Coach" })
            : emptyHtml({ iconName: "link", title: "Not connected to a coach yet", text: "Connect with your coach and the plan they build for you shows up here.", actionHref: "clients.html?tab=share", actionLabel: "Connect with Coach" })}</div>`;
        return;
    }
    renderPlan();
    state.sessions = await loadSessions();
    if (state.sessions.length) renderPlan();
});
