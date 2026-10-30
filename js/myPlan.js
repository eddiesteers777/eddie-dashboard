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
       source (js/weekModel.js), with Mark done on each workout. A coach
       plan shows this week and next (js/planWindow.js); "next" stops at
       the last week that's open, and a line says more open as they go.
     - "Need a change?": ask the coach instead of editing their plan,
       and the coach's answers (js/changeRequestDialog.js)
========================================== */

import { realAnswer } from "./intakeFlow.js";
import { listenForAuth } from "./auth.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { listMyPlans, markPlanViewed, acknowledgePlan } from "./coachingPlans.js";
import { planWeekFor, shortDay, isoDate, planDateRange, mondayOf, addDays } from "./coachingPlanModel.js";
import { buildWeek } from "./weekModel.js";
import { weekInputs, loadSessions } from "./weekData.js";
import { weekListHtml, summaryLine, bindWeekActions } from "./weekView.js";
import { weekRidgeHtml } from "./weekRidge.js";
import { monthGrid, shiftMonth, firstOfMonth, cellLabel, monthSummaryLine } from "./monthModel.js";
import { getMyClientRecord } from "./clientRecords.js";
import { listMyCoaches } from "./coachAccess.js";
import { cachedRole } from "./role.js";
import { toast, emptyHtml, friendlyError, sbChoose, sbAlert } from "./ui.js";
import { icon } from "./icons.js";
import { listMyChangeRequests } from "./changeRequests.js";
import { awaitingAck, awaitingView, noticeVersionOf } from "./planWindow.js";
import { openChangeRequestDialog, changeRequestsHtml, bindChangeRequestActions } from "./changeRequestDialog.js";
import { within, planView, READ_LIMIT_MS } from "./planLoadState.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = isoDate(new Date());
const niceDate = ms => ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const millis = value => typeof value === "number" ? value : value?.toMillis?.() || 0;

const state = { view: "week", month: firstOfMonth(today), plans: [], headers: [], selected: null, monday: "", goal: "", sessions: [], items: new Map(), coaches: [], requests: [] };

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
    const pending = state.headers.filter(awaitingAck);
    $("planNotice").innerHTML = pending.map(h => `
        <div class="clients-card myplan-notice" data-plan="${esc(h.id)}">
            <div class="myplan-notice-head">
                <span class="myplan-notice-icon">${icon("send")}</span>
                <div>
                    <strong>${noticeVersionOf(h) > 1 ? `${esc(h.coachName || "Your coach")} updated your plan` : `Your plan is ready`}</strong>
                    <span class="myplan-meta">${esc(h.name)}${millis(h.publishedAt) ? ` · ${esc(niceDate(millis(h.publishedAt)))}` : ""}</span>
                </div>
            </div>
            ${h.coachNote ? `<p class="myplan-note">"${esc(h.coachNote)}"</p>` : ""}
            ${noticeVersionOf(h) <= 1 && h.showAll === false ? `<p class="myplan-meta">You'll see this week and next. New weeks open as you go.</p>` : ""}
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
    state.week = week;
    state.inputs = inputs;
    const thisMonday = mondayOf(today);

    let overview = "";
    if (plan) {
        const weeks = plan.generatedPlan.weeks;
        const win = plan.generatedPlan.window || null;
        const total = win?.totalWeeks || weeks.length;
        const position = planWeekFor(plan.generatedPlan, today);
        const { startDate } = planDateRange(plan.generatedPlan);
        const endDate = win?.endDate || planDateRange(plan.generatedPlan).endDate;
        const header = state.headers.find(h => h.id === plan.coachPlanId);
        const raceDate = plan.generatedPlan.raceDate;
        const where = position.state === "current" ? `Week ${position.index + 1} of ${total}`
            : position.state === "upcoming" ? `Starts ${shortDay(startDate)}`
            : position.state === "finished" && win && today <= win.endDate ? "Your next week is on its way"
            : position.state === "finished" ? "Finished" : `${total} weeks`;
        const updated = millis(plan.publishedAt) || millis(header?.publishedAt);
        overview = `
            ${state.plans.length > 1 ? `
                <div class="clients-tabs myplan-switch" role="tablist">
                    ${state.plans.map(p => `<button type="button" class="clients-tab${p.id === plan.id ? " active" : ""}" data-select="${esc(p.id)}">${esc(p.name)}</button>`).join("")}
                </div>` : ""}
            <section class="myplan-overview">
                <p class="myplan-line">
                    <span class="myplan-kicker">Plan</span>
                    <strong>${esc(plan.name)}</strong>
                    <span>${esc([`From ${plan.coachName || header?.coachName || "your coach"}`, where, raceDate ? `Race ${shortDay(raceDate)}` : ""].filter(Boolean).join(" · "))}</span>
                </p>
                <details class="myplan-details">
                    <summary>Plan details</summary>
                    <dl class="myplan-facts">
                        ${state.goal ? `<div><dt>Goal</dt><dd>${esc(state.goal)}</dd></div>` : ""}
                        <div><dt>Dates</dt><dd>${esc(shortDay(startDate))} – ${esc(shortDay(endDate))}</dd></div>
                        ${raceDate ? `<div><dt>Race day</dt><dd>${esc(shortDay(raceDate))}${["B", "C"].includes(plan.generatedPlan.generator?.settings?.racePriority) ? esc(` · ${plan.generatedPlan.generator.settings.racePriority} race`) : ""}</dd></div>` : ""}
                        ${updated ? `<div><dt>Updated</dt><dd>${esc(niceDate(updated))}</dd></div>` : ""}
                    </dl>
                </details>
            </section>`;
    }

    const ctx = week.context;
    const title = ctx ? `Week ${ctx.weekNumber} of ${ctx.totalWeeks}${ctx.phase ? ` · ${ctx.phase}` : ""}` : state.monday === thisMonday ? "This week" : "Week";
    const edge = lastOpenMonday();
    const atEdge = Boolean(edge && state.monday >= edge);
    const toggle = `
            <div class="myplan-view" role="group" aria-label="Show">
                <button type="button" class="myplan-view-btn${state.view === "week" ? " active" : ""}" data-view="week" aria-pressed="${state.view === "week"}">Week</button>
                <button type="button" class="myplan-view-btn${state.view === "month" ? " active" : ""}" data-view="month" aria-pressed="${state.view === "month"}">Month</button>
            </div>`;
    if (state.view === "month") {
        $("planBody").innerHTML = `
        ${overview}
        <section class="clients-card myplan-week myplan-monthcard">
            ${toggle}
            ${monthHtml(inputs)}
        </section>
        ${changeRequestsHtml(state.requests, currentCoach()?.coachName || "Your coach")}`;
        return;
    }
    $("planBody").innerHTML = `
        ${overview}
        <section class="clients-card myplan-week">
            ${toggle}
            <div class="wk-nav">
                <button type="button" class="sb-btn sb-btn-icon" data-week="-1" aria-label="Previous week">${icon("chevronLeft")}</button>
                <div class="wk-nav-title">
                    <strong>${esc(title)}</strong>
                    <span>${esc(shortDay(week.monday))} – ${esc(shortDay(week.sunday))}${ctx && !plan ? ` · ${esc(ctx.planName)}` : ""}</span>
                </div>
                <button type="button" class="sb-btn sb-btn-icon" data-week="1" aria-label="Next week"${atEdge ? " disabled" : ""}>${icon("chevronRight")}</button>
            </div>
            ${state.monday !== thisMonday ? `<button type="button" class="sb-btn sb-btn-tertiary wk-this-week" data-week="now">Back to this week</button>` : ""}
            ${atEdge ? `<p class="clients-card-note myplan-window">${icon("lock")} ${esc(plan?.coachName || "Your coach")} shares your plan two weeks at a time. The next week opens as this one goes by.</p>` : ""}
            ${week.summary.planned || week.summary.sessions ? `<p class="myplan-progress">${esc(summaryLine(week.summary))}</p>` : ""}
            ${week.summary.planned || week.summary.sessions ? weekRidgeHtml(week, { id: "myplan-ridge" }) : ""}
            ${weekListHtml(week)}
            <div class="myplan-foot">
                <p class="clients-card-note myplan-hint">Tap ${icon("check")} to mark a workout done, ${icon("moreVertical")} to move or skip it.</p>
                <div class="myplan-foot-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-act="calendar">${icon("calendar")} Add to calendar</button>
                    ${corosOn() ? `<button type="button" class="sb-btn sb-btn-secondary" data-act="coros-week">${icon("send")} Send week to COROS</button>` : ""}
                    <button type="button" class="sb-btn sb-btn-secondary" data-act="feel">${icon("heart")} Not feeling 100%?</button>
                    ${currentCoach() ? `<button type="button" class="sb-btn sb-btn-secondary" data-act="change">${icon("messageSquare")} Need a change?</button>` : ""}
                </div>
            </div>
            ${corosOn()
                ? (corosAuto() && currentCoach() ? `<p class="clients-card-note myplan-coros-hint">${icon("checkCircle")} Your coach's next 2 weeks go to your COROS watch automatically. <a href="settings.html#coros">Change</a></p>` : "")
                : `<p class="clients-card-note myplan-coros-hint">Have a COROS watch? <a href="settings.html#coros">Connect it in Settings</a> to send your runs straight to it.</p>`}
        </section>
        ${changeRequestsHtml(state.requests, currentCoach()?.coachName || "Your coach")}`;
}

// ---------- The month (js/monthModel.js) ----------

function monthHtml(inputs) {
    const g = monthGrid(state.month, inputs, today);
    const thisMonth = firstOfMonth(today);
    const line = monthSummaryLine(g.summary);
    const cell = c => `<button type="button" class="mp-day is-${c.status}${c.inMonth ? "" : " is-out"}${c.today ? " is-today" : ""}" data-day="${c.date}" aria-label="${esc(cellLabel(c))}"><span class="mp-num">${c.day}</span><span class="mp-mark" aria-hidden="true"></span></button>`;
    return `
            <div class="wk-nav">
                <button type="button" class="sb-btn sb-btn-icon" data-month="-1" aria-label="Previous month">${icon("chevronLeft")}</button>
                <div class="wk-nav-title"><strong>${esc(g.label)}</strong></div>
                <button type="button" class="sb-btn sb-btn-icon" data-month="1" aria-label="Next month">${icon("chevronRight")}</button>
            </div>
            ${state.month !== thisMonth ? `<button type="button" class="sb-btn sb-btn-tertiary wk-this-week" data-month="now">Back to this month</button>` : ""}
            ${line ? `<p class="myplan-progress">${esc(line)}</p>` : ""}
            <div class="mp-month">
                <div class="mp-head" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map(d => `<span>${d}</span>`).join("")}</div>
                ${g.weeks.map(w => `<div class="mp-week">${w.map(cell).join("")}</div>`).join("")}
            </div>
            <ul class="mp-legend" aria-label="What the marks mean">
                <li><span class="mp-mark is-done"></span>Done</li>
                <li><span class="mp-mark is-missed"></span>Not done</li>
                <li><span class="mp-mark is-skipped"></span>Skipped</li>
                <li><span class="mp-mark is-upcoming"></span>Planned</li>
            </ul>
            <p class="clients-card-note myplan-hint">Tap a day to open its week. ${esc(currentCoach()?.coachName || "Your coach")} shares your plan two weeks at a time, so later weeks fill in as they open.</p>`;
}

$("planBody").addEventListener("click", event => {
    const view = event.target.closest("[data-view]");
    if (view) {
        state.view = view.dataset.view;
        if (state.view === "month") state.month = firstOfMonth(state.monday);
        renderPlan();
        return;
    }
    const month = event.target.closest("[data-month]");
    if (month) {
        state.month = month.dataset.month === "now" ? firstOfMonth(today) : shiftMonth(state.month, Number(month.dataset.month));
        renderPlan();
        return;
    }
    const day = event.target.closest("[data-day]");
    if (day) {
        state.monday = mondayOf(day.dataset.day);
        state.view = "week";
        renderPlan();
    }
});

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
    if (event.target.closest('[data-act="feel"]')) {
        const { openFeelDialog } = await import("./weekChangeDialogs.js");
        await openFeelDialog(changeCtx());
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
    if (weekBtn && !weekBtn.disabled) {
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

// Move / skip a workout, or ease off (js/weekChangeDialogs.js).
function changeCtx() {
    return {
        week: state.week,
        inputs: state.inputs,
        today,
        onChange: () => renderPlan(),
        onRequest: saved => { state.requests.unshift(saved); renderPlan(); }
    };
}

bindWeekActions($("planBody"), {
    getItem: id => state.items.get(id),
    onChange: () => renderPlan(),
    onChangeItem: item => import("./weekChangeDialogs.js").then(m => m.openChangeMenu(item, changeCtx()))
});
bindChangeRequestActions($("planBody"), id => { state.requests = state.requests.filter(r => r.id !== id); renderPlan(); });

// ---------- Send to COROS (js/corosSend.js) ----------

// COROS connected on this device? (Its sign-in token lives in this browser.)
function corosOn() {
    try { return Boolean(JSON.parse(localStorage.getItem("__eddieos_coros_oauth_v2") || "null")?.access_token); } catch { return false; }
}

// Automatic sending (js/corosAutoSend.js): on unless they turned it off.
function corosAuto() {
    try { return localStorage.getItem("coros-auto-send") !== "off"; } catch { return false; }
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
    // A plan shown two weeks at a time only has the weeks that are open.
    const open = plan?.generatedPlan?.window ? "Every week that's open" : "Rest of the plan";
    if (restWeeks.length > 1) choices.push({ value: "plan", label: `${open} (${restWeeks.length} weeks)`, primary: true });
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

// A coach plan shown two weeks at a time: the Monday of the last week that's open.
function lastOpenMonday() {
    const through = state.selected?.generatedPlan?.window?.through;
    return through ? mondayOf(through) : null;
}

// The week to open on: this week, or the plan's first week if it hasn't started.
function mondayFor(plan) {
    if (!plan) return mondayOf(today);
    const position = planWeekFor(plan.generatedPlan, today);
    const { startDate } = planDateRange(plan.generatedPlan);
    return position.state === "upcoming" && startDate ? mondayOf(startDate) : mondayOf(today);
}

// ---------- Load ----------
// Three states, never mixed up (js/planLoadState.js): still loading (the
// skeleton, no motion), failed (says so, Try again), loaded (the plan or a
// plain empty state, revealed once).

let started = false;
let settled = false;
window.sbPlanStarted = true;   // plan.html's fallback stands down

function setLoading(on, label = "Loading your plan") {
    $("planLoading").hidden = !on;
    const sr = $("planLoading").querySelector(".sr-only");
    if (sr) sr.textContent = label;
    $("planLoadingText").textContent = on && label !== "Loading your plan" ? label : "";
    $("planLoadingText").hidden = !$("planLoadingText").textContent;
}

// One calm reveal of the loaded panels. Only ever on loaded content.
function reveal() {
    for (const box of [$("planNotice"), $("planBody")]) {
        box.classList.add("myplan-reveal");
        setTimeout(() => box.classList.remove("myplan-reveal"), 900);
    }
}

function showFailed(retry) {
    settled = true;
    setLoading(false);
    $("planNotice").innerHTML = "";
    $("planBody").innerHTML = `
        <div class="clients-card myplan-failed" role="alert">
            <span class="myplan-failed-icon">${icon("alertTriangle")}</span>
            <div>
                <strong>Couldn't load your plan</strong>
                <p>Check your connection and try again. This doesn't mean your plan is empty.</p>
                <button type="button" class="sb-btn sb-btn-secondary" data-retry>${icon("refresh")} Try again</button>
            </div>
        </div>`;
    $("planBody").querySelector("[data-retry]").addEventListener("click", () => {
        $("planBody").innerHTML = "";
        setLoading(true);
        retry();
    }, { once: true });
}

function showEmpty(view) {
    const text = view === "empty-coach"
        ? emptyHtml({ iconName: "calendar", title: "No plan yet", text: "Your coach hasn't published a plan for you yet. When they do, your weeks show up here and you'll get an email.", actionHref: "updates.html", actionLabel: "From Your Coach" })
        : emptyHtml({ iconName: "link", title: "Not connected to a coach yet", text: "Connect with your coach. The plan they build for you shows up here.", actionHref: "clients.html?tab=share", actionLabel: "Connect with Coach" });
    $("planBody").innerHTML = `<div class="clients-card myplan-empty">${text}</div>`;
    reveal();
}

// The reads came back with nothing usable and the device has no plan, but
// the coach did publish one: it's downloading. Stay on Loading, and say it
// failed if it hasn't landed in time.
function showArriving() {
    setLoading(true, "Getting your plan from your coach");
    setTimeout(() => showFailed(() => location.reload()), READ_LIMIT_MS);
}

async function load() {
    settled = false;
    // If sign-in or a read hangs past the limit, say it failed.
    const watchdog = setTimeout(() => { if (!settled) showFailed(load); }, READ_LIMIT_MS + 3000);
    try {
        state.plans = activePlans();
        const [headers, record, coaches, requests] = await Promise.all([
            within(listMyPlans()).catch(error => { console.warn("Southbound: plan updates unavailable.", error?.code || error?.message || error); return null; }),
            within(getMyClientRecord()).catch(() => null),
            within(listMyCoaches()).catch(error => { console.warn("Southbound: coach link unavailable.", error?.code || error?.message || error); return null; }),
            within(listMyChangeRequests()).catch(() => [])
        ]);
        if (settled) return;   // the watchdog already showed the failure
        settled = true;
        clearTimeout(watchdog);
        state.headers = headers || [];
        state.coaches = coaches || [];
        state.requests = requests;
        state.goal = [record?.primaryGoal, realAnswer(record?.targetEvent)].filter(Boolean).join(" · ");

        // Nothing to show at all: no coach plan, no plan of their own, nothing scheduled.
        const hasContent = Boolean(state.plans.length || weekInputs().plans.length || weekInputs().strength.length);
        const view = planView({ hasContent, headers, coaches });
        if (view === "failed") { showFailed(load); return; }
        if (view === "arriving") { showArriving(); return; }
        setLoading(false);
        if (view !== "plan") { showEmpty(view); return; }

        renderNotice();
        // Opening the page counts as seeing the newest version.
        for (const h of state.headers) {
            if (awaitingView(h)) {
                markPlanViewed(h).then(() => { h.viewedVersion = h.version; }).catch(() => {});
            }
        }

        const params = new URLSearchParams(location.search);
        state.selected = state.plans.find(p => p.coachPlanId === params.get("plan")) || state.plans[0] || null;
        state.monday = mondayFor(state.selected);
        renderPlan();
        if (!headers) $("planNotice").insertAdjacentHTML("afterbegin", `<p class="clients-card-note myplan-offline">${icon("info")} Couldn't check for updates from your coach. This is the copy saved on this device.</p>`);
        reveal();
        state.sessions = await loadSessions();
        if (state.sessions.length) { $("planBody").classList.remove("myplan-reveal"); renderPlan(); }
    } catch (error) {
        console.error("Southbound: My Plan failed to load.", error);
        clearTimeout(watchdog);
        showFailed(load);
    }
}

// Sign-in hasn't answered at all: say so rather than load forever.
const authWatchdog = setTimeout(() => { if (!started) showFailed(() => location.reload()); }, READ_LIMIT_MS + 3000);

listenForAuth(async user => {
    if (!user || started) return;
    started = true;
    clearTimeout(authWatchdog);

    if (cachedRole() === "coach") {
        settled = true;
        setLoading(false);
        $("planBody").innerHTML = `<div class="clients-card">${emptyHtml({ iconName: "calendar", title: "This is your clients' view", text: "Clients see the plan you publish here. Build and publish plans from a client's page in My Clients (Plan tab).", actionHref: "clients.html", actionLabel: "My Clients" })}</div>`;
        reveal();
        return;
    }
    load();
});
