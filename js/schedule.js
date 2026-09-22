/* ==========================================
   EddieOS — Schedule

   Two roles on one page, same pattern as clients.js: "My
   Availability" (this account as a coach, publishing weekly slots
   and responding to requests) and "Book a Session" (this account as
   a client, requesting time from a coach who's already linked them).
========================================== */

import { listenForAuth } from "./auth.js";
import { listMyCoaches } from "./coachAccess.js";
import {
    SESSION_TYPES, DAY_NAMES,
    getCoachAvailability, addAvailabilitySlot, removeAvailabilitySlot, toggleAvailabilitySlot,
    addBlackoutDate, removeBlackoutDate,
    generateWeeklyDates, requestBooking, listMyBookingRequests, listRequestsForMyClients,
    respondToRequest, cancelBookingRequest, getApprovedCountForSlotDate
} from "./scheduling.js";
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
document.querySelectorAll(".clients-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".clients-tab").forEach(t => t.classList.toggle("active", t === tab));
        document.querySelectorAll(".clients-panel").forEach(panel => {
            panel.hidden = panel.dataset.panel !== tab.dataset.tab;
        });
    });
});

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

async function refreshAvailability() {
    if (!currentUser) return;
    const { slots, blackoutDates } = await getCoachAvailability(currentUser.uid);

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
            if (!window.confirm("Remove this slot? Existing approved bookings aren't affected.")) return;
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
    const requests = (await listRequestsForMyClients())
        .sort((a, b) => (a.status === "requested" ? -1 : 1) - (b.status === "requested" ? -1 : 1));

    requestsList.innerHTML = "";
    requestsEmptyMsg.hidden = requests.length > 0;

    for (const req of requests) {
        const datesLabel = req.dates.length > 1
            ? `${formatDateShort(req.dates[0])} (+${req.dates.length - 1} more, weekly)`
            : formatDateShort(req.dates[0]);

        let capacityNote = "";
        if (req.status === "requested" && req.capacity > 1) {
            const already = await getApprovedCountForSlotDate(currentUser.uid, req.slotId, req.dates[0]);
            capacityNote = `<div class="sched-request-note">${already}/${req.capacity} already booked for ${escapeHtml(formatDateShort(req.dates[0]))}</div>`;
        }

        const row = document.createElement("div");
        row.className = "clients-row sched-request-row";
        row.innerHTML = `
            <div class="clients-row-avatar">${escapeHtml((req.clientName || "?").slice(0, 1).toUpperCase())}</div>
            <div class="sched-request-detail">
                <strong>${escapeHtml(req.clientName)} &middot; ${escapeHtml(typeLabel(req.sessionType))}${req.label ? ` (${escapeHtml(req.label)})` : ""}</strong>
                <span>${escapeHtml(DAY_NAMES[req.dayOfWeek])}s, ${formatTime(req.startTime)}&ndash;${formatTime(req.endTime)} &middot; ${escapeHtml(datesLabel)}</span>
                ${req.clientNote ? `<div class="sched-request-note">"${escapeHtml(req.clientNote)}"</div>` : ""}
                ${capacityNote}
                <span class="sched-request-status ${req.status}">${req.status}</span>
            </div>
            <div class="sched-request-actions">
                ${req.status === "requested" ? `
                    <button type="button" class="clients-btn-primary" data-action="approve">Approve</button>
                    <button type="button" class="clients-btn-secondary" data-action="deny">Deny</button>
                ` : ""}
            </div>
        `;

        row.querySelector('[data-action="approve"]')?.addEventListener("click", () => respond(req, "approved"));
        row.querySelector('[data-action="deny"]')?.addEventListener("click", () => respond(req, "denied"));

        requestsList.appendChild(row);
    }
}

async function respond(req, status) {
    const note = window.prompt(`Add a note for ${req.clientName}? (optional)`) || "";
    await respondToRequest(req.id, status, note);
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
    refreshRequests();
}

// ==========================================
// Client: book a session
// ==========================================

const coachSelect = document.getElementById("coachSelect");
const noCoachesMsg = document.getElementById("noCoachesMsg");
const availableSlotsList = document.getElementById("availableSlotsList");
const availableSlotsEmptyMsg = document.getElementById("availableSlotsEmptyMsg");
const myRequestsList = document.getElementById("myRequestsList");
const myRequestsEmptyMsg = document.getElementById("myRequestsEmptyMsg");

async function refreshCoachSelect() {
    myCoaches = await listMyCoaches();
    noCoachesMsg.hidden = myCoaches.length > 0;
    coachSelect.hidden = myCoaches.length === 0;
    document.getElementById("availableSlotsWrap").hidden = myCoaches.length === 0;

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
    const { slots } = await getCoachAvailability(selectedCoachUid);
    const openSlots = slots.filter(s => s.active !== false);

    availableSlotsList.innerHTML = "";
    availableSlotsEmptyMsg.hidden = openSlots.length > 0;

    for (const slot of openSlots) {
        const wrap = document.createElement("div");
        wrap.innerHTML = slotCardHtml(slot, `<button type="button" class="clients-btn-primary" data-action="request">Request</button>`);
        const card = wrap.firstElementChild;
        card.querySelector('[data-action="request"]').addEventListener("click", () => openBookOverlay(coach, slot));
        availableSlotsList.appendChild(card);
    }

    await hydrateIcons();
}

async function refreshMyRequests() {
    const requests = await listMyBookingRequests();
    requests.sort((a, b) => (b.dates?.[0] || "").localeCompare(a.dates?.[0] || ""));

    myRequestsList.innerHTML = "";
    myRequestsEmptyMsg.hidden = requests.length > 0;

    for (const req of requests) {
        const datesLabel = req.dates.length > 1
            ? `${formatDateShort(req.dates[0])} (+${req.dates.length - 1} more, weekly)`
            : formatDateShort(req.dates[0]);

        const row = document.createElement("div");
        row.className = "clients-row sched-request-row";
        row.innerHTML = `
            <div class="sched-request-detail">
                <strong>${escapeHtml(req.coachName)} &middot; ${escapeHtml(typeLabel(req.sessionType))}${req.label ? ` (${escapeHtml(req.label)})` : ""}</strong>
                <span>${escapeHtml(DAY_NAMES[req.dayOfWeek])}s, ${formatTime(req.startTime)}&ndash;${formatTime(req.endTime)} &middot; ${escapeHtml(datesLabel)}</span>
                ${req.coachNote ? `<div class="sched-request-note">Coach: "${escapeHtml(req.coachNote)}"</div>` : ""}
                <span class="sched-request-status ${req.status}">${req.status}</span>
            </div>
            <div class="sched-request-actions">
                ${req.status === "requested" ? `<button type="button" class="clients-btn-icon" data-action="cancel" aria-label="Cancel request"><span data-icon="trash"></span></button>` : ""}
            </div>
        `;
        row.querySelector('[data-action="cancel"]')?.addEventListener("click", async () => {
            if (!window.confirm("Cancel this request?")) return;
            await cancelBookingRequest(req.id);
            refreshMyRequests();
        });
        myRequestsList.appendChild(row);
    }

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

function openBookOverlay(coach, slot) {
    bookState = { coach, slot };
    bookSlotMeta.textContent = coach.coachName || "Coach";
    bookSlotTitle.textContent = `${DAY_NAMES[slot.dayOfWeek]}s, ${formatTime(slot.startTime)}–${formatTime(slot.endTime)}`;

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    bookStartDate.value = generateWeeklyDates(todayIso, slot.dayOfWeek, 1)[0];
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
        showMsg(bookMsg, "Request sent!");
        setTimeout(() => {
            bookOverlay.hidden = true;
            bookState = null;
            refreshMyRequests();
        }, 900);
    } catch (error) {
        console.error("Booking request failed:", error);
        showMsg(bookMsg, "Couldn't send that request. Try again.", true);
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
    }
});
