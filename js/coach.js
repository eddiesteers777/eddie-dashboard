/* ==========================================
   Southbound — Coach Dashboard

   A "needs attention" summary plus quick links into My Clients and
   Schedule, rather than duplicating either page's UI here. Deep
   links use ?tab=... which clients.js/schedule.js read on load (see
   selectTab() in each) to land directly on the right tab.
========================================== */

import { listenForAuth } from "./auth.js";
import { isApprovedCoach, listPendingProfiles } from "./userProfile.js";
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
import { listMyPlans } from "./sessionPlans.js";
import { upcoming as upcomingPlans, parseLine, totalMinutes, clientsOf } from "./sessionPlanModel.js";
import { newPeopleItems, splitDone, pruneDone, groupByTask, greeting, summaryLine, waitedText, itemKey, SEGMENTS, splitSegments, ringTone } from "./coachToday.js";

// ---- Who needs you today (js/coachToday.js) ----
// Every client's attention items plus new people (applications, website
// questions, accounts to approve), by task or by client, with "Done for
// today" (coach-queue-done, cloud-synced, resets tomorrow).

const QUEUE_ICONS = {
    pain: "alertTriangle", health: "heart", change: "calendar", checkin: "star", missed: "clock", skipped: "clock",
    booking: "calendar", "plan-unseen": "eye", race: "flag", plan: "clipboard", quiet: "moon",
    "no-checkin": "star", profile: "user", sessions: "calendar", intake: "user",
    "session-log": "clipboard", "no-show": "alertTriangle", package: "flag",
    pending: "checkCircle", application: "mail", question: "messageSquare"
};
// What the button on each row says (the whole row opens the same page).
const QUEUE_GO = {
    pain: "Reply", health: "Open", change: "Reply", checkin: "Reply", message: "Reply",
    booking: "Review", pending: "Approve", application: "Open", question: "Open", plan: "Build plan"
};
const DONE_KEY = "coach-queue-done";

const today = { clients: null, clientItems: [], failed: false, name: "", showHidden: false, seg: "" };

function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function doneMarks() {
    return pruneDone(readJson(DONE_KEY, {}), isoDate(new Date()));
}
function saveDone(done) {
    try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* private window: this visit only */ }
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
    renderStrip();
    loadPlans();
}

// ---- Session plans: what you attached to the next sessions (private prep view) ----
async function loadPlans() {
    const wrap = document.getElementById("coachPlansWrap"), list = document.getElementById("coachPlansList");
    let plans = [];
    try { plans = await listMyPlans("coach"); } catch (error) { console.warn("Southbound: couldn't load session plans.", error); return; }
    const day = isoDate(new Date());
    const [y, m, d] = day.split("-").map(Number);
    const horizon = isoDate(new Date(y, m - 1, d + 8));
    const next = upcomingPlans(plans, day).filter(p => p.date < horizon);
    wrap.hidden = !next.length;
    const fmt = iso => { const [yy, mm, dd] = iso.split("-").map(Number); return new Date(yy, mm - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };
    const time = t => { const [hh, mi] = String(t || "").split(":").map(Number); return t ? `${((hh + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}` : ""; };
    list.innerHTML = next.map(p => {
        const lines = (p.lines || []).map(parseLine), mins = totalMinutes(p.lines || []);
        const booked = (p.clientUids || []).length;
        const names = (today.sessions || []).filter(s => s.date === p.date && p.clientUids.includes(s.clientUid)).map(s => s.clientName.split(" ")[0]);
        return `<article class="coach-plan${p.date === day ? " is-today" : ""}">
            <div class="coach-plan-top"><span class="coach-plan-when">${escapeHtml(p.date === day ? "Today" : fmt(p.date))} \u00b7 ${escapeHtml(time(p.startTime))}</span><span class="coach-plan-count">${booked} booked</span></div>
            <h3>${escapeHtml(p.title)}${mins ? ` <small>${mins} min</small>` : ""}</h3>
            ${names.length ? `<p class="coach-plan-who">${escapeHtml([...new Set(names)].join(", "))}</p>` : ""}
            ${p.focus ? `<p class="coach-plan-who">Focus: ${escapeHtml(p.focus)}</p>` : ""}
            ${lines.length ? `<ol class="coach-plan-lines">${lines.map(l => `<li><span>${escapeHtml(l.time)}</span><b>${escapeHtml(l.name)}</b><span>${escapeHtml(l.mins)}</span></li>`).join("")}</ol>` : ""}
            ${p.bring ? `<p class="coach-plan-who">Bring: ${escapeHtml(p.bring)}</p>` : ""}
            <div class="coach-plan-btns"><a class="sb-btn sb-btn-secondary" href="schedule.html">Edit on Schedule</a><button type="button" class="sb-btn sb-btn-secondary" data-print-plan>Print</button></div>
        </article>`;
    }).join("");
}
document.getElementById("coachPlansList").addEventListener("click", event => {
    const btn = event.target.closest("[data-print-plan]");
    if (!btn) return;
    const card = btn.closest(".coach-plan");
    card.classList.add("print-me");
    document.body.classList.add("print-one-plan");
    window.addEventListener("afterprint", () => { card.classList.remove("print-me"); document.body.classList.remove("print-one-plan"); }, { once: true });
    window.print();
});

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

const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

function queueRow(item, { hidden = false } = {}) {
    const when = waitedText(item.at);
    return `
        <div class="coach-queue-row${hidden ? " is-done" : ""}">
            <div class="coach-queue-reveal" aria-hidden="true">${icon("check")}<span>Done</span></div>
            <div class="coach-queue-slide">
                <a class="coach-queue-item is-${escapeHtml(item.kind)}" href="${escapeHtml(item.href)}">
                    <span class="coach-queue-avatar">${escapeHtml(initials(item.name))}</span>
                    <span class="coach-queue-text"><strong>${escapeHtml(item.name)}</strong>${item.kind === "pain" || item.kind === "health" ? `<span class="coach-queue-flag">${item.kind === "pain" ? "Pain" : "Health"}</span>` : ""}<span class="coach-queue-line">${escapeHtml(item.text)}</span>${when ? `<span class="coach-queue-when">${escapeHtml(when)}</span>` : ""}</span>
                </a>
                <button type="button" class="coach-queue-done" data-done="${escapeHtml(itemKey(item))}" data-undo="${hidden ? "1" : ""}"
                    aria-label="${hidden ? "Show again today" : "Done for today"}: ${escapeHtml(item.name)}, ${escapeHtml(item.text)}">
                    ${hidden ? "Undo" : icon("check")}
                </button>
            </div>
        </div>`;
}

// ---- The athletes strip: who needs you (ring) and their week (dots) ----

const DOT_LABEL = { done: "done", missed: "missed", skipped: "skipped", today: "today", upcoming: "coming up", rest: "rest" };

function renderStrip() {
    const el = document.getElementById("coachStrip");
    if (!today.clients || !today.clients.length) { el.hidden = true; return; }
    const rank = { urgent: 0, waiting: 1, ok: 2 };
    const rows = [...today.clients].sort((a, b) => rank[ringTone(a.attention)] - rank[ringTone(b.attention)] || String(a.name).localeCompare(String(b.name)));
    el.hidden = false;
    el.innerHTML = rows.map(c => {
        const tone = ringTone(c.attention);
        const days = c.plans?.week?.days || [];
        const first = String(c.goesBy || c.name || "").split(/\s+/)[0];
        const week = days.map(d => DOT_LABEL[d.state]).join(", ");
        return `
        <a class="coach-strip-item" href="client.html?uid=${encodeURIComponent(c.uid)}" aria-label="${escapeHtml(c.name)}${c.attention.length ? `, ${c.attention.length} waiting` : ""}${week ? `. This week: ${week}` : ""}">
            <span class="coach-strip-ring is-${tone}"><span>${escapeHtml(initials(c.name))}</span></span>
            <span class="coach-strip-name">${escapeHtml(first)}</span>
            <span class="coach-strip-dots" aria-hidden="true">${days.map(d => `<i class="is-${d.state}"></i>`).join("")}</span>
        </a>`;
    }).join("");
}

// ---- Who needs you today: Reply / Approve / Book / Later ----

function renderToday() {
    const list = document.getElementById("coachQueueList");
    const hiddenBtn = document.getElementById("coachQueueHidden");
    document.getElementById("coachGreeting").textContent = greeting(new Date(), today.name);

    const { shown, hidden } = splitDone(allItems(), doneMarks(), isoDate(new Date()));
    const line = summaryLine(groupByTask(shown), hidden.length);
    document.getElementById("coachSummary").textContent = today.clients ? [line.headline, line.detail].filter(Boolean).join(". ").replace(/\.\. /, ". ") : "Checking on your clients…";

    if (!today.clients) return;   // still loading: keep the shimmer
    const segs = splitSegments(shown);
    // Open on the first switch that has something in it, unless the coach chose one.
    if (!today.seg || (!today.chosen && !segs[today.seg].length)) today.seg = SEGMENTS.find(s => segs[s.id].length)?.id || "reply";
    document.getElementById("coachSeg").innerHTML = SEGMENTS.map(s => `
        <button type="button" role="tab" class="coach-seg-btn" data-seg="${s.id}" aria-selected="${s.id === today.seg}">${s.label}${segs[s.id].length ? `<em>${segs[s.id].length}</em>` : ""}</button>`).join("");

    hiddenBtn.hidden = !hidden.length;
    hiddenBtn.textContent = today.showHidden ? "Hide the ones marked done" : `${hidden.length} marked done for today · Show them`;

    // On Approve, applications and website questions show as full cards
    // (with Email / Text / Call) in the panel below, not twice.
    const inPanel = k => k === "application" || k === "question";
    const rows = segs[today.seg].filter(item => !(today.seg === "approve" && inPanel(item.kind)));
    document.getElementById("coachApprovePanel").hidden = today.seg !== "approve";
    document.getElementById("applications").hidden = !applications.length;
    document.getElementById("inquiries").hidden = !inquiries.length;

    let html = "";
    if (today.failed) {
        html += `<div class="coach-inq-empty">Couldn't load your clients right now. Open <a href="clients.html">My Clients</a>.</div>`;
    }
    const approvePanelHasCards = today.seg === "approve" && segs.approve.some(item => inPanel(item.kind));
    if (!rows.length && !approvePanelHasCards && !today.failed) {
        const nothing = !shown.length;
        html += `<div class="coach-queue-empty">${emptyHtml({
            iconName: "checkCircle",
            title: nothing ? (hidden.length ? "That's everything for today" : today.clients.length ? "You're all caught up" : "No clients yet") : "Nothing here",
            text: nothing ? (hidden.length ? "The rest are marked done. They come back tomorrow if they still need you."
                : today.clients.length ? "No pain flags, replies, new people or plan work waiting on you."
                : "When clients connect with you, anything that needs you shows up here.")
                : "Nothing in this one right now."
        })}</div>`;
    } else {
        html += `<div class="coach-queue-group">${rows.map(item => queueRow(item)).join("")}</div>`;
    }
    if (today.showHidden && hidden.length) {
        html += `<div class="coach-queue-group"><h3 class="coach-queue-group-title">Done for today <span>${hidden.length}</span></h3>
            ${hidden.map(item => queueRow(item, { hidden: true })).join("")}</div>`;
    }
    list.innerHTML = html;
}

function markDone(btn) {
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
}

const queueListEl = document.getElementById("coachQueueList");
let swiped = false;
queueListEl.addEventListener("click", event => {
    if (swiped) { event.preventDefault(); swiped = false; return; }
    const btn = event.target.closest("[data-done]");
    if (btn) markDone(btn);
});

// Swipe a row left to mark it done, like Messages. The check button on the
// row does the same for anyone not swiping.
(() => {
    let start = null;
    queueListEl.addEventListener("touchstart", event => {
        const slide = event.target.closest(".coach-queue-slide");
        const row = slide?.closest(".coach-queue-row");
        if (!slide || row.classList.contains("is-done") || event.touches.length !== 1) { start = null; return; }
        start = { x: event.touches[0].clientX, y: event.touches[0].clientY, slide, row, dx: 0, lock: false };
    }, { passive: true });
    queueListEl.addEventListener("touchmove", event => {
        if (!start) return;
        const dx = event.touches[0].clientX - start.x;
        const dy = event.touches[0].clientY - start.y;
        if (!start.lock) {
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }   // scrolling
            if (Math.abs(dx) < 10) return;
            start.lock = true;
        }
        start.dx = Math.min(0, Math.max(dx, -140));
        start.slide.style.transition = "none";
        start.slide.style.transform = `translateX(${start.dx}px)`;
        start.row.classList.toggle("is-armed", start.dx < -80);
    }, { passive: true });
    const end = () => {
        if (!start) return;
        const { slide, row, dx, lock } = start;
        start = null;
        slide.style.transition = "";
        slide.style.transform = "";
        row.classList.remove("is-armed");
        if (!lock) return;
        swiped = true;
        setTimeout(() => { swiped = false; }, 400);
        if (dx < -80) markDone(row.querySelector("[data-done]"));
    };
    queueListEl.addEventListener("touchend", end);
    queueListEl.addEventListener("touchcancel", end);
})();

document.getElementById("coachSeg").addEventListener("click", event => {
    const btn = event.target.closest("[data-seg]");
    if (!btn) return;
    today.seg = btn.dataset.seg;
    today.chosen = true;
    renderToday();
});
document.getElementById("coachQueueHidden").addEventListener("click", () => {
    today.showHidden = !today.showHidden;
    renderToday();
});

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

async function refreshDashboard() {
    const pending = await listPendingProfiles();

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
