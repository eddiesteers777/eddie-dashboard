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
    renderSetupChecklist();
    refreshDashboard();
    loadInquiries();
});

// An installed app can sit in the background for hours; reload the
// counts and questions whenever the coach comes back to it, so a
// question sent in the meantime shows up without a manual refresh.
function refreshIfShowing() {
    if (document.visibilityState !== "visible" || dashboardEl.hidden) return;
    refreshDashboard();
    loadInquiries();
}
document.addEventListener("visibilitychange", refreshIfShowing);
window.addEventListener("pageshow", event => { if (event.persisted) refreshIfShowing(); });
