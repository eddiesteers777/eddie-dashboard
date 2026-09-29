/* ==========================================
   Southbound — Coach Dashboard

   A "needs attention" summary plus quick links into My Clients and
   Schedule, rather than duplicating either page's UI here. Deep
   links use ?tab=... which clients.js/schedule.js read on load (see
   selectTab() in each) to land directly on the right tab.
========================================== */

import { listenForAuth } from "./auth.js";
import { isApprovedCoach, listPendingProfiles } from "./userProfile.js";
import { listMyClients } from "./coachAccess.js";
import { listRequestsForMyClients } from "./scheduling.js";
import { listCheckinsForMyClients } from "./checkins.js";
import { getEmailSetupStatus } from "./emailNotify.js";
import { listInquiries, setInquiryHandled, interestLabel } from "./inquiries.js";
import { listApplications, setApplicationHandled } from "./applications.js";
import { applicationLines, heardTally, matchApplication, SERVICE_OPTIONS, labelOf } from "./applicationForm.js";
import { loadClientDirectory } from "./clientDirectory.js";
import { summarizeClient, isoDate, serviceLabels, clientStatusLines } from "./clientSummary.js";
import { attentionQueue } from "./feedbackModel.js";
import { icon } from "./icons.js";
import { emptyHtml, toast } from "./ui.js";
import { sessionList, weekAgenda } from "./sessionModel.js";
import { newPeopleItems, splitDone, pruneDone, groupByTask, groupByPerson, greeting, summaryLine, waitedText, itemKey } from "./coachToday.js";

// ---- Who needs you today (js/coachToday.js) ----
// Every client's attention items plus new people (applications, website
// questions, accounts to approve), by task or by client, with "Done for
// today" (coach-queue-done, cloud-synced, resets tomorrow).

const QUEUE_ICONS = {
    pain: "alertTriangle", health: "heart", change: "calendar", checkin: "star", missed: "clock", skipped: "clock",
    booking: "calendar", "plan-unseen": "eye", race: "flag", plan: "clipboard", quiet: "moon",
    "no-checkin": "star", profile: "user", sessions: "calendar", intake: "user",
    "session-log": "clipboard", "no-show": "alertTriangle",
    pending: "checkCircle", application: "mail", question: "messageSquare"
};
const DONE_KEY = "coach-queue-done";
const VIEW_KEY = "sb-coach-queue-view";   // this device only

const today = { clients: null, clientItems: [], failed: false, name: "", showHidden: false };

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function doneMarks() {
    return pruneDone(readJson(DONE_KEY, {}), isoDate(new Date()));
}
function saveDone(done) {
    try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* private window: this visit only */ }
}
function queueView() {
    try { return localStorage.getItem(VIEW_KEY) === "person" ? "person" : "task"; } catch { return "task"; }
}

async function loadQueue() {
    try {
        const day = isoDate(new Date());
        const directory = await loadClientDirectory();
        today.clients = directory.map(c => summarizeClient(c, day));
        today.clientItems = attentionQueue(today.clients);
        // Every booked session across clients, for Sessions this week.
        today.sessions = directory.flatMap(c => sessionList(c.requests, day).map(s => ({
            ...s, clientName: c.profile?.displayName || c.link?.clientName || s.clientName || "Client"
        })));
        today.failed = false;
    } catch (error) {
        console.warn("Southbound: couldn't build the attention queue.", error);
        today.failed = true;
        today.clients = today.clients || [];
    }
    renderToday();
    renderWeek();
    renderClientList();
}

function allItems() {
    const people = newPeopleItems({
        applications: applicationsLoaded ? applications : [],
        inquiries: inquiries.map(q => ({ ...q, topic: interestLabel(q.interest) })),
        pending: pendingProfiles,
        matchOf: p => matchApplication(p, applications),
        serviceLabel: v => labelOf(SERVICE_OPTIONS, v)
    });
    return [...today.clientItems, ...people];
}

function queueRow(item, { withName, hidden = false }) {
    const when = waitedText(item.at);
    return `
        <div class="coach-queue-row${hidden ? " is-done" : ""}">
            <a class="coach-queue-item is-${escapeHtml(item.kind)}" href="${escapeHtml(item.href)}">
                <span class="coach-queue-icon">${icon(QUEUE_ICONS[item.kind] || "info")}</span>
                <span class="coach-queue-text">${withName ? `<strong>${escapeHtml(item.name)}</strong> ` : ""}${escapeHtml(item.text)}${when ? `<span class="coach-queue-when">${escapeHtml(when)}</span>` : ""}</span>
                ${icon("chevronRight")}
            </a>
            <button type="button" class="coach-queue-done" data-done="${escapeHtml(itemKey(item))}" data-undo="${hidden ? "1" : ""}"
                aria-label="${hidden ? "Show again today" : "Done for today"}: ${escapeHtml(item.name)}, ${escapeHtml(item.text)}">
                ${hidden ? "Undo" : `${icon("check")}<span>Done</span>`}
            </button>
        </div>`;
}

function renderToday() {
    const list = document.getElementById("coachQueueList");
    const hiddenBtn = document.getElementById("coachQueueHidden");
    const view = queueView();
    document.querySelectorAll(".coach-view-btn").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
    document.getElementById("coachGreeting").textContent = greeting(new Date(), today.name);

    const { shown, hidden } = splitDone(allItems(), doneMarks(), isoDate(new Date()));
    const groups = groupByTask(shown);
    const line = summaryLine(groups, hidden.length);
    document.getElementById("coachSummary").textContent = today.clients ? [line.headline, line.detail].filter(Boolean).join(". ").replace(/\.\. /, ". ") : "Checking on your clients…";

    if (!today.clients) return;   // still loading: keep the shimmer
    hiddenBtn.hidden = !hidden.length;
    hiddenBtn.textContent = today.showHidden ? "Hide the ones marked done" : `${hidden.length} marked done for today · Show them`;

    let html = "";
    if (today.failed) {
        html += `<div class="coach-inq-empty">Couldn't load your clients right now. Open <a href="clients.html">My Clients</a>.</div>`;
    }
    if (!shown.length && !today.failed) {
        html += `<div class="clients-card">${emptyHtml({
            iconName: "checkCircle",
            title: hidden.length ? "That's everything for today" : today.clients.length ? "You're all caught up" : "No clients yet",
            text: hidden.length ? "The rest are marked done. They come back tomorrow if they still need you."
                : today.clients.length ? "No pain flags, replies, new people or plan work waiting on you."
                : "When clients connect with you, anything that needs you shows up here."
        })}</div>`;
    } else if (view === "person") {
        html += groupByPerson(shown).map(p => `
            <div class="coach-queue-name">${escapeHtml(p.name)}</div>
            ${p.items.map(item => queueRow(item, { withName: false })).join("")}`).join("");
    } else {
        html += groupByTask(shown).map(g => `
            <div class="coach-queue-group">
                <h3 class="coach-queue-group-title">${escapeHtml(g.label)} <span>${g.items.length}</span></h3>
                ${g.items.map(item => queueRow(item, { withName: true })).join("")}
            </div>`).join("");
    }
    if (today.showHidden && hidden.length) {
        html += `<div class="coach-queue-group"><h3 class="coach-queue-group-title">Done for today <span>${hidden.length}</span></h3>
            ${hidden.map(item => queueRow(item, { withName: true, hidden: true })).join("")}</div>`;
    }
    list.innerHTML = html;
}

document.getElementById("coachQueueList").addEventListener("click", event => {
    const btn = event.target.closest("[data-done]");
    if (!btn) return;
    const key = btn.dataset.done;
    const done = doneMarks();
    const undo = Boolean(btn.dataset.undo);
    if (undo) delete done[key];
    else done[key] = isoDate(new Date());
    saveDone(done);
    renderToday();
    if (!undo) {
        toast("Hidden until tomorrow", {
            action: { label: "Undo", onClick: () => { const d = doneMarks(); delete d[key]; saveDone(d); renderToday(); } }
        });
    }
});
document.getElementById("coachQueueHidden").addEventListener("click", () => {
    today.showHidden = !today.showHidden;
    renderToday();
});
document.querySelectorAll(".coach-view-btn").forEach(btn => btn.addEventListener("click", () => {
    try { localStorage.setItem(VIEW_KEY, btn.dataset.view); } catch { /* this visit only */ }
    renderToday();
}));

// ---- Sessions this week (js/sessionModel.js weekAgenda) ----

const WEEK_STATES = {
    completed: ["Completed", "is-done"], "no-show": ["No-show", "is-bad"], "late-cancel": ["Cancelled late", "is-bad"],
    cancelled: ["Cancelled", "is-off"], "to-log": ["To log", "is-new"], "not-logged": ["Not logged", "is-off"],
    today: ["Today", "is-new"], upcoming: ["Booked", ""]
};
let weekOffset = 0;

function renderWeek() {
    const el = document.getElementById("coachWeekList");
    if (!today.sessions) return;
    const day = isoDate(new Date());
    const [y, m, d] = day.split("-").map(Number);
    const anchor = isoDate(new Date(y, m - 1, d + weekOffset * 7));
    const week = weekAgenda(today.sessions, anchor);
    const fmt = (iso, opts) => { const [yy, mm, dd] = iso.split("-").map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", opts); };
    document.getElementById("coachWeekLabel").textContent = weekOffset === 0 ? "This week"
        : `${fmt(week[0].date, { month: "short", day: "numeric" })} – ${fmt(week[6].date, { month: "short", day: "numeric" })}`;
    const days = week.filter(w => w.sessions.length);
    if (!days.length) {
        el.innerHTML = `<p class="clients-card-note">${weekOffset === 0 ? "No sessions booked this week." : "No sessions booked that week."}</p>`;
        return;
    }
    el.innerHTML = days.map(w => `
        <div class="coach-week-day${w.date === day ? " is-today" : ""}">
            <h3>${escapeHtml(w.date === day ? `Today · ${fmt(w.date, { weekday: "short", month: "short", day: "numeric" })}` : fmt(w.date, { weekday: "long", month: "short", day: "numeric" }))}</h3>
            ${w.sessions.map(s => {
                const [label, tone] = WEEK_STATES[s.state] || ["", ""];
                const [hh, mi] = String(s.startTime || "0:0").split(":").map(Number);
                const time = s.startTime ? `${((hh + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}` : "";
                const type = { soccer: "Soccer", running: "Running", strength: "Strength", general: "Session" }[s.sessionType] || "Session";
                return `
                <a class="coach-week-row" href="client.html?uid=${encodeURIComponent(s.clientUid)}&tab=sessions">
                    <span class="coach-week-time">${escapeHtml(time)}</span>
                    <span class="coach-week-who"><strong>${escapeHtml(s.clientName)}</strong> ${escapeHtml(type)}${s.label ? ` · ${escapeHtml(s.label)}` : ""}</span>
                    ${label ? `<span class="coach-week-pill ${tone}">${escapeHtml(label)}</span>` : ""}
                </a>`;
            }).join("")}
        </div>`).join("");
}

document.querySelectorAll("[data-week-step]").forEach(btn => btn.addEventListener("click", () => {
    weekOffset += Number(btn.dataset.weekStep);
    renderWeek();
}));

// ---- Your clients (search; the full filters live on My Clients) ----

const CLIENTS_SHOWN = 8;
let showAllClients = false;

function renderClientList() {
    const el = document.getElementById("coachClientList");
    if (!today.clients) return;
    const q = (document.getElementById("coachClientSearch").value || "").trim().toLowerCase();
    const rows = today.clients
        .filter(c => !q || c.searchText.includes(q))
        .sort((a, b) => (b.attention.length > 0) - (a.attention.length > 0) || String(a.name).localeCompare(String(b.name)));
    if (!today.clients.length) {
        el.innerHTML = `<p class="clients-card-note">No clients yet. Approve someone in <a href="clients.html?tab=pending">Pending</a>, or enter a client's code in <a href="clients.html?tab=coach">My Clients</a>.</p>`;
        return;
    }
    if (!rows.length) {
        el.innerHTML = `<p class="clients-card-note">No clients match “${escapeHtml(q)}”.</p>`;
        return;
    }
    const shown = q || showAllClients ? rows : rows.slice(0, CLIENTS_SHOWN);
    el.innerHTML = shown.map(c => `
        <a class="coach-client-row" href="client.html?uid=${encodeURIComponent(c.uid)}">
            <span class="clients-row-avatar">${escapeHtml((c.name || "?").slice(0, 1).toUpperCase())}</span>
            <span class="coach-client-info">
                <strong>${escapeHtml(c.name)}${c.athlete ? ` <span class="clients-client-athlete">for ${escapeHtml(c.athlete)}</span>` : c.goesBy ? ` <span class="clients-client-athlete">(${escapeHtml(c.goesBy)})</span>` : ""}${c.attention.length ? ` <span class="clients-attn-badge" title="Needs attention">${c.attention.length}</span>` : ""}</strong>
                <span>${escapeHtml(serviceLabels(c.services).join(" · ") || c.email)}</span>
                <span class="coach-client-meta">${clientStatusLines(c).map(escapeHtml).join(" · ")}</span>
            </span>
            ${icon("chevronRight")}
        </a>`).join("")
        + (shown.length < rows.length ? `<button type="button" class="coach-queue-hidden" data-all-clients>Show all ${rows.length} clients</button>` : "");
}

document.getElementById("coachClientSearch").addEventListener("input", renderClientList);
document.getElementById("coachClientList").addEventListener("click", event => {
    if (!event.target.closest("[data-all-clients]")) return;
    showAllClients = true;
    renderClientList();
});

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---- Website questions (from contact.html) ----

const inquiryListEl = document.getElementById("inquiryList");
const inqToggleBtn = document.getElementById("inqToggleHandled");
let inquiries = [];
let inquiriesFailed = false;
let showHandled = false;

function shortDate(ts) {
    const d = ts?.toDate ? ts.toDate() : null;
    return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

function inquiryRow(q) {
    const handled = q.status === "handled";
    const phoneDigits = (q.phone || "").replace(/[^\d+]/g, "");
    const subject = encodeURIComponent("Re: your question to Southbound Coaching");
    const meta = [
        q.who === "child" ? `For their child${q.athleteAge ? `, age ${escapeHtml(q.athleteAge)}` : ""}` : "",
        q.email ? escapeHtml(q.email) : "",
        q.phone ? escapeHtml(q.phone) : ""
    ].filter(Boolean).join(" &middot; ");
    return `
        <div class="coach-inq-row${handled ? " coach-inq-handled" : ""}">
            <div class="coach-inq-top">
                <strong>${escapeHtml(q.name)}</strong>
                <span class="coach-inq-pill">${escapeHtml(interestLabel(q.interest))}</span>
                <span class="coach-inq-date">${shortDate(q.createdAt)}</span>
            </div>
            ${meta ? `<div class="coach-inq-meta">${meta}</div>` : ""}
            <p class="coach-inq-message">${escapeHtml(q.message)}</p>
            <div class="coach-inq-actions">
                ${q.email ? `<a class="coach-inq-btn" href="mailto:${encodeURIComponent(q.email)}?subject=${subject}">Email</a>` : ""}
                ${phoneDigits ? `<a class="coach-inq-btn" href="sms:${phoneDigits}">Text</a><a class="coach-inq-btn" href="tel:${phoneDigits}">Call</a>` : ""}
                <button type="button" class="coach-inq-btn coach-inq-done" data-inq="${escapeHtml(q.id)}" data-handled="${handled ? "1" : ""}">
                    ${handled ? "Move back to new" : "Mark answered"}
                </button>
            </div>
        </div>
    `;
}

function renderInquiries() {
    const fresh = inquiries.filter(q => q.status !== "handled");
    const answered = inquiries.length - fresh.length;

    statNewInquiriesNum.textContent = fresh.length;
    statNewInquiries.classList.toggle("coach-stat-attention", fresh.length > 0);
    statNewInquiries.classList.toggle("coach-stat-neutral", fresh.length === 0);

    inqToggleBtn.hidden = answered === 0;
    inqToggleBtn.textContent = showHandled ? "Hide answered" : `Show answered (${answered})`;

    if (inquiriesFailed) {
        inquiryListEl.innerHTML = `<div class="coach-inq-empty">Couldn't load questions. If this keeps happening, make sure the latest Firestore rules are published.</div>`;
        return;
    }
    const shown = showHandled ? inquiries : fresh;
    inquiryListEl.innerHTML = shown.length
        ? shown.map(inquiryRow).join("")
        : `<div class="coach-inq-empty">${inquiries.length ? "You're all caught up." : "No questions yet. They show up here when someone uses the Contact page."}</div>`;
    renderToday();
}

async function loadInquiries() {
    try {
        inquiries = await listInquiries();
        inquiriesFailed = false;
    } catch (error) {
        console.warn("Southbound: couldn't load website questions.", error);
        inquiries = [];
        inquiriesFailed = true;
    }
    renderInquiries();
}

inqToggleBtn.addEventListener("click", () => {
    showHandled = !showHandled;
    renderInquiries();
});

inquiryListEl.addEventListener("click", async event => {
    const btn = event.target.closest("[data-inq]");
    if (!btn) return;
    btn.disabled = true;
    const makeHandled = !btn.dataset.handled;
    try {
        await setInquiryHandled(btn.dataset.inq, makeHandled);
        const q = inquiries.find(item => item.id === btn.dataset.inq);
        if (q) q.status = makeHandled ? "handled" : "new";
        renderInquiries();
    } catch (error) {
        console.error("Couldn't update question:", error);
        btn.disabled = false;
    }
});

// ---- Applications (from the open apply.html) ----

const applicationListEl = document.getElementById("applicationList");
const appToggleBtn = document.getElementById("appToggleHandled");
const heardTallyEl = document.getElementById("heardTally");
let applications = [];
let applicationsFailed = false;
let applicationsLoaded = false;
let showHandledApps = false;
let pendingProfiles = [];

// The pending account an application belongs to, if they've signed in.
function pendingAccountFor(app) {
    return pendingProfiles.find(p => matchApplication(p, [app])) || null;
}

function applicationRow(a) {
    const handled = a.status === "handled";
    const phoneDigits = (a.phone || "").replace(/[^\d+]/g, "");
    const subject = encodeURIComponent("Your application to Southbound Coaching");
    const contact = [a.email, a.phone].filter(Boolean).map(escapeHtml).join(" &middot; ");
    const account = !handled && pendingAccountFor(a);
    return `
        <div class="coach-inq-row${handled ? " coach-inq-handled" : ""}">
            <div class="coach-inq-top">
                <strong>${escapeHtml(a.name)}</strong>
                ${(a.services || []).map(v => `<span class="coach-inq-pill">${escapeHtml(labelOf(SERVICE_OPTIONS, v))}</span>`).join("")}
                <span class="coach-inq-date">${shortDate(a.createdAt)}</span>
            </div>
            ${contact ? `<div class="coach-inq-meta">${contact}</div>` : ""}
            <ul class="coach-app-lines">${applicationLines(a).map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
            ${account ? `<p class="coach-app-account">They've signed in to the app. <a href="clients.html?tab=pending">Approve them in Pending →</a></p>` : ""}
            <div class="coach-inq-actions">
                ${a.email ? `<a class="coach-inq-btn" href="mailto:${encodeURIComponent(a.email)}?subject=${subject}">Email</a>` : ""}
                ${phoneDigits ? `<a class="coach-inq-btn" href="sms:${phoneDigits}">Text</a><a class="coach-inq-btn" href="tel:${phoneDigits}">Call</a>` : ""}
                <button type="button" class="coach-inq-btn coach-inq-done" data-app="${escapeHtml(a.id)}" data-handled="${handled ? "1" : ""}">
                    ${handled ? "Move back to new" : "Mark handled"}
                </button>
            </div>
        </div>
    `;
}

function renderApplications() {
    const fresh = applications.filter(a => a.status !== "handled");
    const handledCount = applications.length - fresh.length;

    statNewApplicationsNum.textContent = fresh.length;
    statNewApplications.classList.toggle("coach-stat-attention", fresh.length > 0);
    statNewApplications.classList.toggle("coach-stat-neutral", fresh.length === 0);

    appToggleBtn.hidden = handledCount === 0;
    appToggleBtn.textContent = showHandledApps ? "Hide handled" : `Show handled (${handledCount})`;

    const tally = heardTally(applications);
    heardTallyEl.hidden = tally.length === 0;
    heardTallyEl.innerHTML = tally.length
        ? `<strong>Where people heard about you:</strong>${tally.map(t => `<span class="coach-heard-chip">${escapeHtml(t.label)}<b>${t.count}</b></span>`).join("")}`
        : "";

    if (applicationsFailed) {
        applicationListEl.innerHTML = `<div class="coach-inq-empty">Couldn't load applications. If this keeps happening, make sure the latest Firestore rules are published.</div>`;
        return;
    }
    const shown = showHandledApps ? applications : fresh;
    applicationListEl.innerHTML = shown.length
        ? shown.map(applicationRow).join("")
        : `<div class="coach-inq-empty">${applications.length ? "You're all caught up." : "No applications yet. They show up here when someone fills in the Apply page."}</div>`;
    renderToday();
}

async function loadApplications() {
    try {
        applications = await listApplications();
        applicationsFailed = false;
    } catch (error) {
        console.warn("Southbound: couldn't load applications.", error);
        applications = [];
        applicationsFailed = true;
    }
    applicationsLoaded = true;
    renderApplications();
}

appToggleBtn.addEventListener("click", () => {
    showHandledApps = !showHandledApps;
    renderApplications();
});

applicationListEl.addEventListener("click", async event => {
    const btn = event.target.closest("[data-app]");
    if (!btn) return;
    btn.disabled = true;
    const makeHandled = !btn.dataset.handled;
    try {
        await setApplicationHandled(btn.dataset.app, makeHandled);
        const a = applications.find(item => item.id === btn.dataset.app);
        if (a) a.status = makeHandled ? "handled" : "new";
        renderApplications();
    } catch (error) {
        console.error("Couldn't update application:", error);
        btn.disabled = false;
    }
});

// Features that need an outside account before they work. Each one
// silently does nothing until then, so the dashboard says so.
function renderSetupChecklist() {
    const email = getEmailSetupStatus();
    const items = [
        { on: email.coachAlerts, name: "Emails to you", detail: "You aren't emailed about new booking requests, applications or check-ins yet. Needs the EmailJS \"Coach alert\" template." },
        { on: email.clientUpdates, name: "Emails to clients", detail: "Clients aren't emailed when you answer a booking or reply to a check-in yet. Needs the EmailJS \"Client update\" template." }
    ].filter(item => !item.on);

    document.getElementById("setupCard").hidden = items.length === 0;
    document.getElementById("setupList").innerHTML = items.map(item => `
        <div class="coach-setup-row">
            <span class="coach-setup-pill">Off</span>
            <div>
                <strong>${item.name}</strong>
                <span>${item.detail}</span>
            </div>
        </div>
    `).join("");
}

const signedOutEl = document.getElementById("coachSignedOut");
const notApprovedEl = document.getElementById("coachNotApproved");
const dashboardEl = document.getElementById("coachDashboard");

const statPendingAccounts = document.getElementById("statPendingAccounts");
const statPendingAccountsNum = document.getElementById("statPendingAccountsNum");
const statPendingRequests = document.getElementById("statPendingRequests");
const statPendingRequestsNum = document.getElementById("statPendingRequestsNum");
const statPendingCheckins = document.getElementById("statPendingCheckins");
const statPendingCheckinsNum = document.getElementById("statPendingCheckinsNum");
const statActiveClientsNum = document.getElementById("statActiveClientsNum");
const statNewInquiries = document.getElementById("statNewInquiries");
const statNewApplications = document.getElementById("statNewApplications");
const statNewApplicationsNum = document.getElementById("statNewApplicationsNum");
const statNewInquiriesNum = document.getElementById("statNewInquiriesNum");

async function refreshDashboard() {
    const [pending, clients, requests, checkins] = await Promise.all([
        listPendingProfiles(),
        listMyClients(),
        listRequestsForMyClients(),
        listCheckinsForMyClients()
    ]);

    const pendingRequestCount = requests.filter(r => r.status === "requested").length;
    const pendingCheckinCount = checkins.filter(c => c.status !== "reviewed").length;

    statPendingAccountsNum.textContent = pending.length;
    statPendingAccounts.classList.toggle("coach-stat-attention", pending.length > 0);
    statPendingAccounts.classList.toggle("coach-stat-neutral", pending.length === 0);

    statPendingRequestsNum.textContent = pendingRequestCount;
    statPendingRequests.classList.toggle("coach-stat-attention", pendingRequestCount > 0);
    statPendingRequests.classList.toggle("coach-stat-neutral", pendingRequestCount === 0);

    statPendingCheckinsNum.textContent = pendingCheckinCount;
    statPendingCheckins.classList.toggle("coach-stat-attention", pendingCheckinCount > 0);
    statPendingCheckins.classList.toggle("coach-stat-neutral", pendingCheckinCount === 0);

    statActiveClientsNum.textContent = clients.length;

    pendingProfiles = pending;
    if (applicationsLoaded) renderApplications();
    else renderToday();
}

listenForAuth(async user => {
    signedOutEl.hidden = Boolean(user);
    dashboardEl.hidden = true;
    notApprovedEl.hidden = true;

    if (!user) return;

    const approved = await isApprovedCoach();
    if (!approved) {
        notApprovedEl.hidden = false;
        return;
    }

    dashboardEl.hidden = false;
    today.name = user.displayName || "";
    renderSetupChecklist();
    loadQueue();
    refreshDashboard();
    loadApplications();
    loadInquiries();
});

// An installed app can sit in the background for hours; reload the
// counts and questions whenever the coach comes back to it, so a
// question sent in the meantime shows up without a manual refresh.
function refreshIfShowing() {
    if (document.visibilityState !== "visible" || dashboardEl.hidden) return;
    loadQueue();
    refreshDashboard();
    loadApplications();
    loadInquiries();
}
document.addEventListener("visibilitychange", refreshIfShowing);
window.addEventListener("pageshow", event => { if (event.persisted) refreshIfShowing(); });
