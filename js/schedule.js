/* ==========================================
   Southbound — Schedule

   Two roles on one page, same pattern as clients.js: "My
   Availability" (this account as a coach, publishing weekly slots
   and responding to requests) and "Book a Session" (this account as
   a client, requesting time from a coach who's already linked them).
========================================== */

import { listenForAuth } from "./auth.js";
import { sbAlert, sbConfirm, sbPrompt, toast, friendlyError } from "./ui.js";
import { listMyCoaches } from "./coachAccess.js";
import { cachedRole } from "./role.js";
import {
    SESSION_TYPES, DAY_NAMES,
    getCoachAvailability, addAvailabilitySlot, removeAvailabilitySlot, toggleAvailabilitySlot,
    addBlackoutDate, removeBlackoutDate,
    generateWeeklyDates, requestBooking, listMyBookingRequests, listRequestsForMyClients,
    respondToRequest, cancelBookingRequest, syncSlotBookings
} from "./scheduling.js";
import { bookedCounts, takenDates, nextOpenDate } from "./slotBookings.js";
import { clientSessions, statusLabel, CANCELLED } from "./sessionModel.js";
import { hasReport, reportHtml } from "./sessionReport.js";
import { weekDays, weekStartOf, addDays, weekCounts } from "./scheduleWeek.js";
import { sendBookingRequestEmail, sendBookingResponseEmail } from "./emailNotify.js";

let currentUser = null;
let myCoaches = [];
let selectedCoachUid = null;

const signedOutEl = document.getElementById("scheduleSignedOut");
const signedInEl = document.getElementById("scheduleSignedIn");

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showMsg(el, text, isError = false) {
    el.textContent = text;
    el.classList.toggle("clients-msg-error", isError);
    el.hidden = false;
}

function formatDateShort(dateStr) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function typeLabel(value) {
    return SESSION_TYPES.find(t => t.value === value)?.label || value;
}

async function hydrateIcons() {
    await import("./icons.js").then(m => m.hydrate());
}

// ---- Tabs ----
// selectTab is also called on load if the page was opened with
// ?tab=availability (see bottom of file) -- js/coach.html links here
// directly to a specific tab instead of duplicating this page's UI.
function selectTab(tabName) {
    const tab = document.querySelector(`.clients-tab[data-tab="${tabName}"]`);
    if (!tab) return;
    document.querySelectorAll(".clients-tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".clients-panel").forEach(panel => {
        panel.hidden = panel.dataset.panel !== tabName;
    });
}

document.querySelectorAll(".clients-tab").forEach(tab => {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
});

// Setting open times is a coach job: a client lands straight on
// "Book a Session", a coach on their availability and requests. Uses the role remembered
// on this device (js/role.js) so there's no flash, then confirms it
// against the real profile once that loads.
const introEl = document.getElementById("scheduleIntro");
function setScheduleView(isCoach) {
    // Each account only uses one side: the coach sets times and answers
    // requests, a client books. So no tab bar for either.
    document.querySelector(".clients-tabs").hidden = true;
    // A client's tab and menus call it Sessions (Phase 8).
    document.getElementById("scheduleTitle").textContent = isCoach ? "Schedule" : "Sessions";
    document.title = `${isCoach ? "Schedule" : "Sessions"} | Southbound Coaching`;
    introEl.textContent = isCoach
        ? "Set your open times, block off dates, and answer booking requests."
        : "What's booked with your coach, and asking for another session.";
    selectTab(isCoach ? "availability" : "book");
}
setScheduleView(cachedRole() === "coach");

// ---- Populate static selects ----
document.getElementById("slotDay").innerHTML = DAY_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join("");
document.getElementById("slotType").innerHTML = SESSION_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join("");

// ==========================================
// Coach: availability
// ==========================================

const slotForm = document.getElementById("slotForm");
const slotMsg = document.getElementById("slotMsg");
const slotsList = document.getElementById("slotsList");
const slotsEmptyMsg = document.getElementById("slotsEmptyMsg");
const blackoutForm = document.getElementById("blackoutForm");
const blackoutList = document.getElementById("blackoutList");
const requestsList = document.getElementById("requestsList");
const waitingList = document.getElementById("waitingList");
const requestsEmptyMsg = document.getElementById("requestsEmptyMsg");

function slotCardHtml(slot, actionsHtml) {
    return `
        <div class="sched-slot-card ${slot.active === false ? "inactive" : ""}" data-slot-id="${escapeHtml(slot.id)}">
            <div class="sched-slot-day">${DAY_NAMES[slot.dayOfWeek].slice(0, 3)}</div>
            <div class="sched-slot-info">
                <div class="sched-slot-time">${formatTime(slot.startTime)} &ndash; ${formatTime(slot.endTime)}</div>
                <div class="sched-slot-meta">
                    <span class="sched-slot-tag">${escapeHtml(typeLabel(slot.sessionType))}</span>
                    ${slot.label ? `<span>${escapeHtml(slot.label)}</span>` : ""}
                    <span>${slot.capacity > 1 ? `${slot.capacity} spots` : "1:1"}</span>
                </div>
            </div>
            <div class="sched-slot-actions">${actionsHtml}</div>
        </div>
    `;
}

// ---- Coach: the week at a glance ----
// What the coach has so far (open times, days off, requests); the grid
// redraws whenever any of them loads (js/scheduleWeek.js).
const coachWeek = { slots: [], blackoutDates: [], requests: [], start: "" };

function renderCoachWeek() {
    const el = document.getElementById("schedWeek");
    if (!el) return;
    const today = localToday();
    if (!coachWeek.start) coachWeek.start = weekStartOf(today);
    const days = weekDays({ weekStart: coachWeek.start, slots: coachWeek.slots, blackoutDates: coachWeek.blackoutDates, requests: coachWeek.requests });
    const n = weekCounts(days);
    const end = addDays(coachWeek.start, 6);
    const range = `${formatDateShort(coachWeek.start).replace(/^\w+, /, "")} – ${formatDateShort(end).replace(/^\w+, /, "")}`;
    document.getElementById("schedWeekSum").textContent = `${range} · ${n.booked} booked · ${n.asked} asked · ${n.open} open`;
    document.getElementById("schedWeekNow").disabled = coachWeek.start === weekStartOf(today);
    const label = { soccer: "Soccer", running: "Running", strength: "Strength", general: "Session" };
    el.innerHTML = days.map(day => {
        const dayName = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
        const num = Number(day.date.slice(8));
        const items = day.items.map(it => {
            const type = it.label || label[it.sessionType] || typeLabel(it.sessionType) || "";
            const who = it.kind === "open" ? `Open${it.capacity > 1 ? ` · ${it.spotsLeft} of ${it.capacity} left` : ""}` : it.who;
            const body = `<span class="sched-ev-time">${escapeHtml(formatTime(it.startTime))}</span><span class="sched-ev-who">${escapeHtml(who)}</span><span class="sched-ev-type">${escapeHtml(type)}</span>`;
            return it.clientUid && it.kind !== "open"
                ? `<a class="sched-ev is-${it.kind}" href="client.html?uid=${encodeURIComponent(it.clientUid)}&tab=sessions">${body}</a>`
                : `<div class="sched-ev is-${it.kind}">${body}</div>`;
        }).join("");
        return `
            <div class="sched-day${day.date === today ? " is-today" : ""}${day.dayOff ? " is-off" : ""}${day.date < today ? " is-past" : ""}">
                <div class="sched-day-head"><span>${escapeHtml(dayName)}</span><b>${num}</b>${day.dayOff ? `<em>Day off</em>` : ""}</div>
                ${items || (day.dayOff ? "" : `<p class="sched-day-none">Nothing</p>`)}
            </div>`;
    }).join("");
}

document.querySelectorAll("[data-week-step]").forEach(btn => btn.addEventListener("click", () => {
    if (!coachWeek.start) coachWeek.start = weekStartOf(localToday());
    coachWeek.start = addDays(coachWeek.start, 7 * Number(btn.dataset.weekStep));
    renderCoachWeek();
}));
document.getElementById("schedWeekNow").addEventListener("click", () => {
    coachWeek.start = weekStartOf(localToday());
    renderCoachWeek();
});
document.getElementById("addSlotLink").addEventListener("click", event => {
    event.preventDefault();
    const box = document.getElementById("addSlotBox");
    box.open = true;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
});

async function refreshAvailability() {
    if (!currentUser) return;
    const { slots, blackoutDates } = await getCoachAvailability(currentUser.uid);
    coachWeek.slots = slots;
    coachWeek.blackoutDates = blackoutDates;
    renderCoachWeek();

    slotsList.innerHTML = "";
    slotsEmptyMsg.hidden = slots.length > 0;
    for (const slot of slots) {
        const wrap = document.createElement("div");
        wrap.innerHTML = slotCardHtml(slot, `
            <button type="button" class="clients-btn-secondary" data-action="toggle">${slot.active === false ? "Enable" : "Pause"}</button>
            <button type="button" class="clients-btn-icon" data-action="remove" aria-label="Remove slot"><span data-icon="trash"></span></button>
        `);
        const card = wrap.firstElementChild;
        card.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
            await toggleAvailabilitySlot(slot.id, slot.active === false);
            refreshAvailability();
        });
        card.querySelector('[data-action="remove"]').addEventListener("click", async () => {
            if (!(await sbConfirm("Sessions you've already approved aren't affected.", { title: "Remove this slot?", confirmLabel: "Remove", danger: true }))) return;
            await removeAvailabilitySlot(slot.id);
            refreshAvailability();
        });
        slotsList.appendChild(card);
    }

    blackoutList.innerHTML = "";
    for (const dateStr of blackoutDates) {
        const chip = document.createElement("span");
        chip.className = "sched-blackout-chip";
        chip.innerHTML = `${escapeHtml(formatDateShort(dateStr))} <button type="button" aria-label="Remove blackout date"><span data-icon="close"></span></button>`;
        chip.querySelector("button").addEventListener("click", async () => {
            await removeBlackoutDate(dateStr);
            refreshAvailability();
        });
        blackoutList.appendChild(chip);
    }

    await hydrateIcons();
}

slotForm.addEventListener("submit", async event => {
    event.preventDefault();
    const start = document.getElementById("slotStart").value;
    const end = document.getElementById("slotEnd").value;
    if (!start || !end || end <= start) {
        showMsg(slotMsg, "End time must be after start time.", true);
        return;
    }
    const submitBtn = slotForm.querySelector("button");
    submitBtn.disabled = true;
    try {
        await addAvailabilitySlot({
            dayOfWeek: Number(document.getElementById("slotDay").value),
            startTime: start,
            endTime: end,
            sessionType: document.getElementById("slotType").value,
            label: document.getElementById("slotLabel").value.trim(),
            capacity: Math.max(1, Number(document.getElementById("slotCapacity").value) || 1)
        });
        slotForm.reset();
        document.getElementById("slotCapacity").value = 1;
        slotMsg.hidden = true;
        refreshAvailability();
    } catch (error) {
        console.error("Adding slot failed:", error);
        showMsg(slotMsg, "Couldn't add that slot. Try again.", true);
    } finally {
        submitBtn.disabled = false;
    }
});

blackoutForm.addEventListener("submit", async event => {
    event.preventDefault();
    const input = document.getElementById("blackoutInput");
    if (!input.value) return;
    await addBlackoutDate(input.value);
    input.value = "";
    refreshAvailability();
});

// ---- Coach: requests inbox ----

async function refreshRequests() {
    if (!currentUser) return;
    const all = await listRequestsForMyClients();
    coachWeek.requests = all;
    renderCoachWeek();
    const waiting = all.filter(r => r.status === "requested");
    // Booked and past: newest first by their first date.
    const requests = all.filter(r => r.status !== "requested")
        .sort((a, b) => String((b.dates || [])[0] || "").localeCompare(String((a.dates || [])[0] || "")));
    // Keep the "what's taken" summary clients book against up to date.
    syncSlotBookings(all).catch(error => console.warn("Southbound: couldn't update booked dates.", error));
    const counts = bookedCounts(all, localToday());

    requestsList.innerHTML = "";
    waitingList.innerHTML = "";
    requestsEmptyMsg.hidden = requests.length > 0;
    document.getElementById("waitingWrap").hidden = waiting.length === 0;
    document.getElementById("waitingCount").textContent = waiting.length || "";

    for (const req of [...waiting, ...requests]) {
        const booked = req.allDates || req.dates || [];
        const datesLabel = booked.length > 1
            ? `${formatDateShort(booked[0])} (+${booked.length - 1} more, weekly)`
            : formatDateShort(booked[0]);

        let capacityNote = "";
        if (req.status === "requested") {
            const already = counts[req.slotId]?.[req.dates[0]] || 0;
            const cap = req.capacity || 1;
            if (cap > 1 || already > 0) {
                capacityNote = `<div class="sched-request-note${already >= cap ? " is-full" : ""}">${already}/${cap} already booked for ${escapeHtml(formatDateShort(req.dates[0]))}${already >= cap ? " — full" : ""}</div>`;
            }
        }

        const row = document.createElement("div");
        row.className = "clients-row sched-request-row";
        row.innerHTML = `
            <div class="clients-row-avatar">${escapeHtml((req.clientName || "?").slice(0, 1).toUpperCase())}</div>
            <div class="sched-request-detail">
                <strong>${escapeHtml(req.clientName)} &middot; ${escapeHtml(typeLabel(req.sessionType))}${req.label ? ` (${escapeHtml(req.label)})` : ""}</strong>
                <span>${escapeHtml(DAY_NAMES[req.dayOfWeek])}s, ${formatTime(req.startTime)}&ndash;${formatTime(req.endTime)} &middot; ${escapeHtml(datesLabel)}</span>
                ${req.clientNote ? `<div class="sched-request-note">"${escapeHtml(req.clientNote)}"</div>` : ""}
                ${req.status === "approved" && req.coachNote ? `<div class="sched-request-note sched-coach-note">Your notes: "${escapeHtml(req.coachNote)}"</div>` : ""}
                ${capacityNote}
                <span class="sched-request-status ${req.status}">${req.status}</span>
            </div>
            <div class="sched-request-actions">
                ${req.status === "requested" ? `
                    <button type="button" class="clients-btn-primary" data-action="approve">Approve</button>
                    <button type="button" class="clients-btn-secondary" data-action="deny">Deny</button>
                ` : ""}
                ${req.status === "approved" ? `
                    <a class="clients-btn-secondary" href="client.html?uid=${encodeURIComponent(req.clientUid)}&tab=sessions">Log sessions</a>
                ` : ""}
            </div>
        `;

        row.querySelector('[data-action="approve"]')?.addEventListener("click", () => respond(req, "approved"));
        row.querySelector('[data-action="deny"]')?.addEventListener("click", () => respond(req, "denied"));

        (req.status === "requested" ? waitingList : requestsList).appendChild(row);
    }
}

async function respond(req, status) {
    const note = await sbPrompt("Optional. It goes in the email and shows on their booking.", {
        title: `${status === "approved" ? "Approve" : "Decline"} ${req.clientName}'s request`,
        placeholder: status === "approved" ? "See you there!" : "Can we try another time?",
        multiline: true,
        maxLength: 1000,
        confirmLabel: status === "approved" ? "Approve" : "Decline"
    });
    if (note === null) return;
    try {
        // Approving checks, in one transaction, that every date still has
        // a spot (js/scheduling.js approveRequest): a 1:1 time already
        // given to someone else can't be given again.
        if (status === "approved") await syncSlotBookings();
        await respondToRequest(req.id, status, note);
    } catch (error) {
        if (error?.code === "slot-full") {
            await sbAlert(`Someone is already booked on ${error.dates.map(formatDateShort).join(", ")}. Decline this request so ${req.clientName} can pick another time.`, { title: "That time is taken" });
        } else if (error?.code === "not-waiting") {
            toast("That request was already answered.");
        } else {
            toast(friendlyError(error, "answer that request"));
        }
        refreshRequests();
        return;
    }
    sendBookingResponseEmail({
        clientEmail: req.clientEmail,
        clientName: req.clientName,
        coachName: currentUser.displayName || "Your coach",
        status,
        sessionType: typeLabel(req.sessionType),
        label: req.label,
        dayLabel: DAY_NAMES[req.dayOfWeek],
        startTime: formatTime(req.startTime),
        endTime: formatTime(req.endTime),
        coachNote: note,
        link: window.location.origin + window.location.pathname
    }).catch(() => {});
    toast(status === "approved" ? `Approved. ${req.clientName} gets an email.` : `Declined. ${req.clientName} gets an email.`);
    refreshRequests();
}

// ==========================================
// Client: book a session
// ==========================================

const coachSelect = document.getElementById("coachSelect");
const coachPickWrap = document.getElementById("coachPickWrap");
const coachOneLine = document.getElementById("coachOneLine");
const noCoachesMsg = document.getElementById("noCoachesMsg");
const availableSlotsList = document.getElementById("availableSlotsList");
const availableSlotsEmptyMsg = document.getElementById("availableSlotsEmptyMsg");
const comingUpList = document.getElementById("comingUpList");
const comingUpEmptyMsg = document.getElementById("comingUpEmptyMsg");
const myRequestsWrap = document.getElementById("myRequestsWrap");
const myRequestsList = document.getElementById("myRequestsList");
const pastWrap = document.getElementById("pastWrap");
const pastList = document.getElementById("pastList");
const attendanceLine = document.getElementById("attendanceLine");

async function refreshCoachSelect() {
    myCoaches = await listMyCoaches();
    noCoachesMsg.hidden = myCoaches.length > 0;
    document.getElementById("availableSlotsWrap").hidden = myCoaches.length === 0;
    // The usual case is one coach: no picker, just who the times are with.
    coachPickWrap.hidden = myCoaches.length < 2;

    coachSelect.innerHTML = myCoaches.map(c => `<option value="${escapeHtml(c.coachUid)}">${escapeHtml(c.coachName || "Coach")}</option>`).join("");
    if (myCoaches.length) {
        selectedCoachUid = coachSelect.value || myCoaches[0].coachUid;
        coachSelect.value = selectedCoachUid;
        refreshAvailableSlots();
    }
}

coachSelect.addEventListener("change", () => {
    selectedCoachUid = coachSelect.value;
    refreshAvailableSlots();
});

async function refreshAvailableSlots() {
    if (!selectedCoachUid) return;
    const coach = myCoaches.find(c => c.coachUid === selectedCoachUid);
    coachOneLine.hidden = myCoaches.length !== 1;
    coachOneLine.textContent = `Open times with ${coach?.coachName || "your coach"}. Tap Request to ask for one.`;
    const [{ slots, fullDates }, mine] = await Promise.all([
        getCoachAvailability(selectedCoachUid),
        listMyBookingRequests().catch(() => [])
    ]);
    const openSlots = slots.filter(s => s.active !== false);
    const today = localToday();

    availableSlotsList.innerHTML = "";
    availableSlotsEmptyMsg.hidden = openSlots.length > 0;

    for (const slot of openSlots) {
        const ctx = { fullDates, mine: mine.filter(r => r.coachUid === selectedCoachUid) };
        const next = nextOpenDate(slot, today, ctx.fullDates, ctx.mine);
        const action = next
            ? `<span class="sched-slot-next">Next open ${escapeHtml(formatDateShort(next))}</span><button type="button" class="clients-btn-primary" data-action="request">Request</button>`
            : `<span class="sched-slot-next">Booked</span>`;
        const wrap = document.createElement("div");
        wrap.innerHTML = slotCardHtml(slot, action);
        const card = wrap.firstElementChild;
        card.querySelector('[data-action="request"]')?.addEventListener("click", () => openBookOverlay(coach, slot, { ...ctx, next }));
        availableSlotsList.appendChild(card);
    }

    await hydrateIcons();
}

const localToday = () => new Date().toLocaleDateString("en-CA");

// One session date: when, what, and (once your coach logs it) what you
// worked on. `note` = an older booking's single note from the coach.
function sessionRowHtml(s, note = "", earlier = []) {
    const off = s.log && (CANCELLED.includes(s.log.status) || s.log.status === "no-show");
    const chip = s.log ? `<span class="sched-request-status ${s.log.status === "completed" ? "approved" : "cancelled"}">${escapeHtml(statusLabel(s.log.status))}</span>`
        : s.date === localToday() ? `<span class="sched-request-status requested">Today</span>` : "";
    if (hasReport(s.log) && s.log.status === "completed") {
        return `
        <article class="sched-report">
            <div class="rep-kicker tan">${escapeHtml(formatDateShort(s.date))} &middot; ${formatTime(s.startTime)}${s.endTime ? `&ndash;${formatTime(s.endTime)}` : ""}</div>
            ${reportHtml(s.log, earlier)}
            ${s.log.workedOn ? `<div class="rep-note"><span class="rep-kicker">Coach</span>${escapeHtml(s.log.workedOn)}</div>` : ""}
            ${s.log.nextTime ? `<div class="rep-note"><span class="rep-kicker tan">Next time</span>${escapeHtml(s.log.nextTime)}</div>` : ""}
        </article>`;
    }
    return `
        <div class="clients-row sched-request-row sched-session-row${off ? " is-off" : ""}">
            <div class="sched-request-detail">
                <strong>${escapeHtml(formatDateShort(s.date))} &middot; ${formatTime(s.startTime)}${s.endTime ? `&ndash;${formatTime(s.endTime)}` : ""}</strong>
                <span>${escapeHtml(typeLabel(s.sessionType))}${s.label ? ` &middot; ${escapeHtml(s.label)}` : ""}</span>
                ${s.log?.workedOn ? `<span class="sched-session-words">Worked on: ${escapeHtml(s.log.workedOn)}</span>` : ""}
                ${s.log?.nextTime ? `<span class="sched-session-words">For next time: ${escapeHtml(s.log.nextTime)}</span>` : ""}
                ${note ? `<span class="sched-session-words">Notes from your coach: "${escapeHtml(note)}"</span>` : ""}
                ${chip}
            </div>
        </div>`;
}

// A request still waiting on the coach (cancel it), or one turned down.
function requestRowHtml(req) {
    const booked = req.allDates || req.dates || [];
    const datesLabel = booked.length > 1
        ? `${formatDateShort(booked[0])} (+${booked.length - 1} more, weekly)`
        : formatDateShort(booked[0]);
    const waiting = req.status === "requested";
    return `
        <div class="clients-row sched-request-row" data-id="${escapeHtml(req.id)}">
            <div class="sched-request-detail">
                <strong>${escapeHtml(typeLabel(req.sessionType))}${req.label ? ` (${escapeHtml(req.label)})` : ""} &middot; ${escapeHtml(DAY_NAMES[req.dayOfWeek])}s, ${formatTime(req.startTime)}&ndash;${formatTime(req.endTime)}</strong>
                <span>${escapeHtml(datesLabel)}${req.coachName ? ` &middot; with ${escapeHtml(req.coachName)}` : ""}</span>
                ${req.coachNote ? `<div class="sched-request-note sched-coach-note">Coach: "${escapeHtml(req.coachNote)}"</div>` : ""}
                <span class="sched-request-status ${waiting ? "requested" : "denied"}">${waiting ? "Waiting" : "Not booked"}</span>
            </div>
            <div class="sched-request-actions">
                ${waiting ? `<button type="button" class="clients-btn-icon" data-action="cancel" aria-label="Cancel request"><span data-icon="trash"></span></button>` : ""}
            </div>
        </div>`;
}

// Phase 8: the client's Schedule reads as what's booked, what's waiting,
// book another, and what happened (js/sessionModel.js clientSessions).
async function refreshMyRequests() {
    const requests = await listMyBookingRequests();
    const today = localToday();
    const { upcoming, past, waiting, declined, attendance } = clientSessions(requests, today);

    comingUpList.innerHTML = upcoming.slice(0, 6).map(s => sessionRowHtml(s)).join("");
    comingUpEmptyMsg.hidden = upcoming.length > 0;

    const asked = [...waiting, ...declined];
    myRequestsWrap.hidden = !asked.length;
    myRequestsList.innerHTML = asked.map(requestRowHtml).join("");
    myRequestsList.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.addEventListener("click", async () => {
        const id = btn.closest("[data-id]")?.dataset.id;
        if (!id) return;
        if (!(await sbConfirm("Your coach will see it was cancelled.", { title: "Cancel this request?", confirmLabel: "Cancel request", cancelLabel: "Keep it", danger: true }))) return;
        await cancelBookingRequest(id);
        refreshMyRequests();
    }));

    // An older booking's single note (from before session logs) shows on
    // its newest past date.
    const noted = new Set();
    const byId = new Map(requests.map(r => [r.id, r]));
    pastWrap.hidden = !past.length;
    pastList.innerHTML = past.map((s, i) => {
        const r = byId.get(s.bookingId);
        const old = r && !Object.keys(r.logs || {}).length && r.coachNote && !noted.has(r.id) ? r.coachNote : "";
        if (old) noted.add(r.id);
        return sessionRowHtml(s, old, past.slice(i + 1).map(x => x.log).filter(Boolean));
    }).join("");
    attendanceLine.hidden = !attendance.line;
    attendanceLine.textContent = attendance.line;

    await hydrateIcons();
}

// ---- Book overlay ----

const bookOverlay = document.getElementById("bookOverlay");
const bookSlotMeta = document.getElementById("bookSlotMeta");
const bookSlotTitle = document.getElementById("bookSlotTitle");
const bookForm = document.getElementById("bookForm");
const bookStartDate = document.getElementById("bookStartDate");
const bookWeeksField = document.getElementById("bookWeeksField");
const bookWeeks = document.getElementById("bookWeeks");
const bookNote = document.getElementById("bookNote");
const bookSubmitBtn = document.getElementById("bookSubmitBtn");
const bookMsg = document.getElementById("bookMsg");
const bookCloseBtn = document.getElementById("bookCloseBtn");

let bookState = null;

function openBookOverlay(coach, slot, taken) {
    bookState = { coach, slot, taken };
    bookSlotMeta.textContent = coach.coachName || "Coach";
    bookSlotTitle.textContent = `${DAY_NAMES[slot.dayOfWeek]}s, ${formatTime(slot.startTime)}–${formatTime(slot.endTime)}`;

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    bookStartDate.value = taken.next || generateWeeklyDates(todayIso, slot.dayOfWeek, 1)[0];
    bookForm.bookMode.value = "single";
    bookWeeksField.hidden = true;
    bookWeeks.value = 6;
    bookNote.value = "";
    bookMsg.hidden = true;

    bookOverlay.hidden = false;
}

document.querySelectorAll('input[name="bookMode"]').forEach(radio => {
    radio.addEventListener("change", () => {
        bookWeeksField.hidden = bookForm.bookMode.value !== "recurring";
    });
});

bookForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!bookState) return;

    const weeks = bookForm.bookMode.value === "recurring" ? Math.max(2, Number(bookWeeks.value) || 2) : 1;
    const dates = generateWeeklyDates(bookStartDate.value, bookState.slot.dayOfWeek, weeks);
    const taken = takenDates(bookState.slot, dates, bookState.taken.fullDates, bookState.taken.mine);
    if (taken.length) {
        showMsg(bookMsg, `Already taken: ${taken.map(formatDateShort).join(", ")}. Pick another start date${weeks > 1 ? " or fewer weeks" : ""}.`, true);
        return;
    }

    bookSubmitBtn.disabled = true;
    bookMsg.hidden = true;
    try {
        const created = await requestBooking({
            coachUid: bookState.coach.coachUid,
            coachName: bookState.coach.coachName,
            slot: bookState.slot,
            dates,
            weeks,
            clientNote: bookNote.value
        });
        sendBookingRequestEmail({
            coachEmail: bookState.coach.coachEmail,
            coachName: bookState.coach.coachName,
            clientName: created.clientName,
            sessionType: typeLabel(created.sessionType),
            label: created.label,
            dayLabel: DAY_NAMES[created.dayOfWeek],
            startTime: formatTime(created.startTime),
            endTime: formatTime(created.endTime),
            dates: created.dates,
            link: window.location.origin + window.location.pathname
        }).catch(() => {});
        toast("Request sent. You'll get an email when your coach answers.");
        setTimeout(() => {
            bookOverlay.hidden = true;
            bookState = null;
            refreshMyRequests();
            refreshAvailableSlots();
        }, 900);
    } catch (error) {
        console.error("Booking request failed:", error);
        // The rules refuse a date that filled up since this page loaded.
        showMsg(bookMsg, error?.code === "permission-denied"
            ? "Couldn't send that request. That time may have just been taken, so close this and pick another."
            : "Couldn't send that request. Try again.", true);
        if (error?.code === "permission-denied") refreshAvailableSlots();
    } finally {
        bookSubmitBtn.disabled = false;
    }
});

bookCloseBtn.addEventListener("click", () => { bookOverlay.hidden = true; bookState = null; });
bookOverlay.addEventListener("click", event => { if (event.target === bookOverlay) { bookOverlay.hidden = true; bookState = null; } });

// ---- Auth gate ----

listenForAuth(user => {
    currentUser = user;
    signedOutEl.hidden = Boolean(user);
    signedInEl.hidden = !user;
    if (user) {
        refreshAvailability();
        refreshRequests();
        refreshCoachSelect();
        refreshMyRequests();

        // js/coach.html deep-links here with ?tab=availability instead
        // of duplicating this page's UI.
        const requestedTab = new URLSearchParams(window.location.search).get("tab");
        if (requestedTab && cachedRole() === "coach") selectTab(requestedTab);

        const guessedCoach = cachedRole() === "coach";
        import("./userProfile.js")
            .then(({ getMyProfile }) => getMyProfile())
            .then(profile => {
                const isCoach = Boolean(profile?.isCoachApproved);
                if (profile && isCoach !== guessedCoach) setScheduleView(isCoach);
            })
            .catch(() => {});
    }
});
