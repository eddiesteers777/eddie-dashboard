import { listenForAuth } from "./auth.js";
import { listMyCoaches } from "./coachAccess.js";
import { isApprovedCoach } from "./userProfile.js";
import { submitCheckin, listMyCheckins, listCheckinsForMyClients, reviewCheckin, weekKeyFor } from "./checkins.js";
import { sendCheckinSubmittedEmail, sendCheckinReviewedEmail } from "./emailNotify.js";

const signedOutEl = document.getElementById("checkinSignedOut");
const signedInEl = document.getElementById("checkinSignedIn");
const reviewTabBtn = document.getElementById("reviewTabBtn");
const reviewCountEl = document.getElementById("reviewCount");

const noCoachMsg = document.getElementById("noCoachMsg");
const checkinFormWrap = document.getElementById("checkinFormWrap");
const checkinWeekLabel = document.getElementById("checkinWeekLabel");
const checkinCoachLabel = document.getElementById("checkinCoachLabel");
const checkinCoachSelectWrap = document.getElementById("checkinCoachSelectWrap");
const checkinCoachSelect = document.getElementById("checkinCoachSelect");
const checkinRatingStars = document.getElementById("checkinRatingStars");
const checkinNotesInput = document.getElementById("checkinNotesInput");
const checkinSubmitBtn = document.getElementById("checkinSubmitBtn");
const checkinSubmitMsg = document.getElementById("checkinSubmitMsg");
const checkinHistoryList = document.getElementById("checkinHistoryList");
const checkinHistoryEmpty = document.getElementById("checkinHistoryEmpty");

const reviewList = document.getElementById("reviewList");
const reviewEmpty = document.getElementById("reviewEmpty");

let myCoaches = [];
let currentRating = 0;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function formatWeekLabel(weekOf) {
    if (!weekOf) return "";
    const d = new Date(`${weekOf}T00:00:00`);
    return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function starGlyphs(rating) {
    let out = "";
    for (let i = 1; i <= 5; i++) {
        out += `<span class="${i <= rating ? "checkin-star-filled" : ""}">${i <= rating ? "★" : "☆"}</span>`;
    }
    return out;
}

function renderRatingStars() {
    checkinRatingStars.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "checkin-star" + (i <= currentRating ? " active" : "");
        btn.textContent = "★";
        btn.setAttribute("aria-label", `${i} out of 5`);
        btn.dataset.value = String(i);
        btn.addEventListener("click", () => {
            currentRating = i;
            renderRatingStars();
        });
        checkinRatingStars.appendChild(btn);
    }
}

function selectTab(tabName) {
    const tab = document.querySelector(`.clients-tab[data-tab="${tabName}"]`);
    if (!tab || tab.hidden) return;
    document.querySelectorAll(".clients-tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".clients-panel").forEach(panel => {
        panel.hidden = panel.dataset.panel !== tabName;
    });
}

document.querySelectorAll(".clients-tab").forEach(tab => {
    tab.addEventListener("click", () => selectTab(tab.dataset.tab));
});

// ---- Client: submit + history ----

async function refreshMine() {
    myCoaches = await listMyCoaches();

    if (!myCoaches.length) {
        noCoachMsg.hidden = false;
        checkinFormWrap.hidden = true;
        return;
    }

    noCoachMsg.hidden = true;
    checkinFormWrap.hidden = false;

    checkinWeekLabel.textContent = formatWeekLabel(weekKeyFor());

    if (myCoaches.length > 1) {
        checkinCoachSelectWrap.hidden = false;
        checkinCoachLabel.textContent = "";
        checkinCoachSelect.innerHTML = myCoaches
            .map(c => `<option value="${escapeHtml(c.coachUid)}">${escapeHtml(c.coachName || "Coach")}</option>`)
            .join("");
    } else {
        checkinCoachSelectWrap.hidden = true;
        checkinCoachLabel.textContent = `To ${myCoaches[0].coachName || "your coach"}`;
    }

    currentRating = 0;
    checkinNotesInput.value = "";
    renderRatingStars();

    const checkins = await listMyCheckins();
    checkinHistoryList.innerHTML = checkins.map(c => `
        <div class="checkin-row">
            <div class="checkin-row-head">
                <div class="checkin-row-who">
                    <strong>${escapeHtml(formatWeekLabel(c.weekOf))}</strong>
                    <span>To ${escapeHtml(c.coachName || "Coach")}</span>
                </div>
                <div class="checkin-row-stars">${starGlyphs(c.rating || 0)}</div>
                <span class="checkin-status-badge status-${c.status === "reviewed" ? "reviewed" : "submitted"}">
                    ${c.status === "reviewed" ? "Reviewed" : "Needs review"}
                </span>
            </div>
            ${c.notes ? `<p class="checkin-row-notes">${escapeHtml(c.notes)}</p>` : ""}
            ${c.coachFeedback ? `<div class="checkin-row-feedback"><strong>Coach feedback</strong>${escapeHtml(c.coachFeedback)}</div>` : ""}
        </div>
    `).join("");
    checkinHistoryEmpty.hidden = checkins.length > 0;
}

checkinSubmitBtn?.addEventListener("click", async () => {
    if (!currentRating) {
        checkinSubmitMsg.textContent = "Pick a rating first.";
        checkinSubmitMsg.className = "clients-msg clients-msg-error";
        checkinSubmitMsg.hidden = false;
        return;
    }

    const coach = myCoaches.length > 1
        ? myCoaches.find(c => c.coachUid === checkinCoachSelect.value) || myCoaches[0]
        : myCoaches[0];

    checkinSubmitBtn.disabled = true;
    checkinSubmitBtn.textContent = "Submitting...";

    try {
        const result = await submitCheckin({
            coachUid: coach.coachUid,
            coachName: coach.coachName,
            rating: currentRating,
            notes: checkinNotesInput.value.trim()
        });

        checkinSubmitMsg.textContent = "Check-in sent!";
        checkinSubmitMsg.className = "clients-msg";
        checkinSubmitMsg.hidden = false;

        sendCheckinSubmittedEmail({
            coachEmail: coach.coachEmail,
            coachName: coach.coachName,
            clientName: result.clientName,
            weekOf: result.weekOf,
            rating: result.rating,
            notes: result.notes,
            link: window.location.origin + window.location.pathname + "?tab=review"
        });

        await refreshMine();
    } catch (error) {
        checkinSubmitMsg.textContent = "Couldn't submit that -- try again.";
        checkinSubmitMsg.className = "clients-msg clients-msg-error";
        checkinSubmitMsg.hidden = false;
        console.error(error);
    } finally {
        checkinSubmitBtn.disabled = false;
        checkinSubmitBtn.textContent = "Submit Check-in";
    }
});

// ---- Coach: review queue ----

async function refreshReview() {
    const items = await listCheckinsForMyClients();
    const needsReview = items.filter(c => c.status !== "reviewed");
    const reviewed = items.filter(c => c.status === "reviewed");
    const ordered = [...needsReview, ...reviewed];

    reviewCountEl.textContent = String(needsReview.length);
    reviewCountEl.hidden = needsReview.length === 0;

    reviewList.innerHTML = ordered.map(c => `
        <div class="checkin-row" data-id="${escapeHtml(c.id)}">
            <div class="checkin-row-head">
                <div class="checkin-row-who">
                    <strong>${escapeHtml(c.clientName || "Client")}</strong>
                    <span>${escapeHtml(formatWeekLabel(c.weekOf))}</span>
                </div>
                <div class="checkin-row-stars">${starGlyphs(c.rating || 0)}</div>
                <span class="checkin-status-badge status-${c.status === "reviewed" ? "reviewed" : "submitted"}">
                    ${c.status === "reviewed" ? "Reviewed" : "Needs review"}
                </span>
            </div>
            ${c.notes ? `<p class="checkin-row-notes">${escapeHtml(c.notes)}</p>` : `<p class="checkin-row-notes"><em>No notes left.</em></p>`}
            <form class="checkin-review-form">
                <textarea rows="2" placeholder="Write feedback for ${escapeHtml(c.clientName || "your client")}...">${escapeHtml(c.coachFeedback || "")}</textarea>
                <div class="checkin-review-form-actions">
                    <button type="submit" class="clients-btn-primary">${c.status === "reviewed" ? "Update Feedback" : "Mark Reviewed"}</button>
                    <span class="clients-msg" hidden></span>
                </div>
            </form>
        </div>
    `).join("");
    reviewEmpty.hidden = ordered.length > 0;

    reviewList.querySelectorAll(".checkin-row").forEach(row => {
        const id = row.dataset.id;
        const source = ordered.find(c => c.id === id);
        const form = row.querySelector(".checkin-review-form");
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const textarea = form.querySelector("textarea");
            const btn = form.querySelector("button[type=submit]");
            const msg = form.querySelector(".clients-msg");

            btn.disabled = true;
            try {
                await reviewCheckin(id, textarea.value.trim());
                msg.textContent = "Saved.";
                msg.className = "clients-msg";
                msg.hidden = false;

                sendCheckinReviewedEmail({
                    clientEmail: source?.clientEmail,
                    clientName: source?.clientName,
                    coachName: source?.coachName,
                    weekOf: source?.weekOf,
                    feedback: textarea.value.trim(),
                    link: window.location.origin + window.location.pathname
                });

                await refreshReview();
            } catch (error) {
                msg.textContent = "Couldn't save that -- try again.";
                msg.className = "clients-msg clients-msg-error";
                msg.hidden = false;
                btn.disabled = false;
                console.error(error);
            }
        });
    });
}

// ---- Auth ----

listenForAuth(user => {
    signedOutEl.hidden = Boolean(user);
    signedInEl.hidden = !user;
    if (!user) return;

    refreshMine();

    // Each account only ever uses one side of this page -- a client sends
    // their check-in, a coach reviews them -- so the tab bar stays hidden
    // and the right panel is simply shown.
    isApprovedCoach().then(approved => {
        reviewTabBtn.hidden = !approved;
        if (approved) {
            refreshReview();
            selectTab("review");
            document.getElementById("checkinIntro").textContent =
                "Read how each client's week went and send your feedback. They get it in the app and by email.";
        }
    });
});
