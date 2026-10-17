import { listenForAuth } from "./auth.js";
import { toast } from "./ui.js";
import { listMyCoaches, listMyClients } from "./coachAccess.js";
import { waitedText } from "./coachToday.js";
import { isApprovedCoach } from "./userProfile.js";
import { submitCheckin, listMyCheckins, listCheckinsForMyClients, reviewCheckin, weekKeyFor } from "./checkins.js";
import { QUEUED_NOTE } from "./offlineWrite.js";
import { sendCheckinSubmittedEmail, sendCheckinReviewedEmail } from "./emailNotify.js";
import { WELLBEING, weekSnapshot, snapshotLines, checkinFlags } from "./feedbackModel.js";
import { checkinDetailsHtml } from "./checkinView.js";
import { buildWeek } from "./weekModel.js";
import { weekInputs, loadSessions } from "./weekData.js";
import { listMyResults } from "./workoutResults.js";
import { loadCoachPlans } from "./coachPlanStore.js";
import { isoDate } from "./coachingPlanModel.js";
import { toMillis } from "./clientSummary.js";
import { renderEmojiText } from "./emoji.js";
import { draftKey, loadDraft, saveDraft, clearDraft, keepOrForget, sameValues } from "./formDraft.js";

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
let currentWeek = null;   // weekSnapshot() of the week being checked in about

const $ = id => document.getElementById(id);

// Energy / Recovery / Motivation, 1-5 each.
function renderScales(values = {}) {
    $("checkinScales").innerHTML = WELLBEING.map(w => `
        <div class="checkin-scale" role="radiogroup" aria-label="${w.label}, 1 to 5">
            <span class="checkin-rating-label">${w.label}</span>
            <div class="checkin-scale-row">
                ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="ck-${w.key}" value="${n}"${Number(values[w.key]) === n ? " checked" : ""}><span>${n}</span></label>`).join("")}
            </div>
            <span class="checkin-scale-ends"><span>Low</span><span>High</span></span>
        </div>`).join("");
}

function setPain(on, note = "") {
    document.querySelector(`input[name="ckPain"][value="${on ? "yes" : "no"}"]`).checked = true;
    $("checkinPainNote").hidden = !on;
    $("checkinPainNote").value = note;
}

document.querySelectorAll('input[name="ckPain"]').forEach(r => r.addEventListener("change", () => {
    $("checkinPainNote").hidden = document.querySelector('input[name="ckPain"]:checked')?.value !== "yes";
}));

function readAnswers() {
    const pick = key => document.querySelector(`input[name="ck-${key}"]:checked`)?.value || null;
    const pain = document.querySelector('input[name="ckPain"]:checked')?.value === "yes";
    return {
        energy: pick("energy"), recovery: pick("recovery"), motivation: pick("motivation"),
        pain, painNote: $("checkinPainNote").value,
        wentWell: $("checkinWentWell").value, change: $("checkinChange").value
    };
}

// ---- Keep what's typed until it's sent (js/formDraft.js) ----

let draftReady = false;     // false while the form is being filled in from the account
let untouched = null;       // what the form shows with nothing typed (this week's saved check-in, or blank)
let draftTimer = null;
const draftId = () => draftKey("checkin", weekKeyFor());

// Every answer on the form as one plain object.
function formValues() {
    const a = readAnswers();
    return {
        rating: currentRating || 0, notes: checkinNotesInput.value,
        energy: a.energy, recovery: a.recovery, motivation: a.motivation,
        pain: a.pain ? "yes" : "no", painNote: a.pain ? a.painNote : "",
        wentWell: a.wentWell, change: a.change
    };
}
function valuesOf(checkin) {
    return {
        rating: checkin?.rating || 0, notes: checkin?.notes || "",
        energy: checkin?.energy ? String(checkin.energy) : null,
        recovery: checkin?.recovery ? String(checkin.recovery) : null,
        motivation: checkin?.motivation ? String(checkin.motivation) : null,
        pain: checkin?.pain ? "yes" : "no", painNote: checkin?.pain ? checkin.painNote || "" : "",
        wentWell: checkin?.wentWell || "", change: checkin?.change || ""
    };
}
function showValues(v) {
    currentRating = v.rating || 0;
    checkinNotesInput.value = v.notes || "";
    $("checkinWentWell").value = v.wentWell || "";
    $("checkinChange").value = v.change || "";
    setPain(v.pain === "yes", v.painNote || "");
    renderScales({ energy: v.energy, recovery: v.recovery, motivation: v.motivation });
    renderRatingStars();
}
function saveCheckinDraft() {
    if (!draftReady || !untouched) return;
    keepOrForget(draftId(), formValues(), untouched);
}
function scheduleDraftSave() {
    if (!draftReady) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveCheckinDraft, 400);
}
// Typing, tapping a number, the stars: all end up here.
checkinFormWrap?.addEventListener("input", scheduleDraftSave);
checkinFormWrap?.addEventListener("change", scheduleDraftSave);
checkinFormWrap?.addEventListener("click", event => { if (event.target.closest(".checkin-star")) scheduleDraftSave(); });
// A phone that locks or switches app may never come back: save now.
addEventListener("pagehide", () => { clearTimeout(draftTimer); saveCheckinDraft(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) { clearTimeout(draftTimer); saveCheckinDraft(); } });

function showDraftNote(on) {
    let note = $("checkinDraftNote");
    if (!on) { note?.remove(); return; }
    if (note) return;
    note = document.createElement("p");
    note.id = "checkinDraftNote";
    note.className = "clients-msg";
    note.setAttribute("role", "status");
    note.innerHTML = `We kept what you typed on this phone. <button type="button" class="sb-btn sb-btn-tertiary" data-draft-reset>Start over</button>`;
    note.querySelector("[data-draft-reset]").addEventListener("click", () => {
        clearTimeout(draftTimer);
        clearDraft(draftId());
        showDraftNote(false);
        draftReady = false;
        showValues(untouched);
        draftReady = true;
    });
    checkinFormWrap.prepend(note);
}

// "Your week": worked out from their plan, logs and sessions.
async function renderYourWeek() {
    try {
        const [sessions, results] = await Promise.all([loadSessions(), listMyResults().catch(() => [])]);
        const week = buildWeek(weekKeyFor(), weekInputs(sessions), isoDate(new Date()));
        currentWeek = weekSnapshot(week, results);
        const lines = snapshotLines(currentWeek);
        $("checkinWeekCard").hidden = !lines.length;
        $("checkinWeekList").innerHTML = lines.map(l => `<li>${escapeHtml(l)}</li>`).join("");
        const ctx = week.context;
        $("checkinWeekPlan").textContent = ctx ? `Week ${ctx.weekNumber} of ${ctx.totalWeeks} · ${ctx.planName}` : "";
        if (!lines.length) currentWeek = null;
    } catch (error) {
        console.warn("Southbound: couldn't work out the week.", error);
        currentWeek = null;
        $("checkinWeekCard").hidden = true;
    }
}

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

    renderYourWeek();
    const checkins = await listMyCheckins();
    // This week's check-in, if they already sent one: edit it.
    const current = checkins.find(c => c.weekOf === weekKeyFor());
    draftReady = false;
    untouched = valuesOf(current);
    const kept = loadDraft(draftId());
    const restore = kept && !sameValues({ ...untouched, ...kept }, untouched);
    showValues(restore ? { ...untouched, ...kept } : untouched);
    showDraftNote(Boolean(restore));
    draftReady = true;
    checkinSubmitBtn.dataset.label = current ? "Update Check-in" : "Submit Check-in";
    checkinSubmitBtn.textContent = checkinSubmitBtn.dataset.label;
    const plans = loadCoachPlans();
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
            ${checkinDetailsHtml(c)}
            ${c.coachFeedback ? `<div class="checkin-row-feedback"><strong>Coach feedback</strong>${renderEmojiText(escapeHtml(c.coachFeedback))}</div>` : ""}
            ${c.status === "reviewed" && plans.some(p => p.publishedAt && p.publishedAt > (toMillis(c.submittedAt) || Infinity))
                ? `<a class="ck-plan-updated" href="plan.html">Your coach updated your plan after this check-in. See what changed →</a>` : ""}
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
        const answers = readAnswers();
        const result = await submitCheckin({
            coachUid: coach.coachUid,
            coachName: coach.coachName,
            rating: currentRating,
            notes: checkinNotesInput.value.trim(),
            answers,
            week: currentWeek
        });

        clearTimeout(draftTimer);
        clearDraft(draftId());
        toast(result.pendingSync ? QUEUED_NOTE : "Check-in sent. Your coach will reply here and by email.");
        checkinSubmitMsg.hidden = true;

        sendCheckinSubmittedEmail({
            coachEmail: coach.coachEmail,
            coachName: coach.coachName,
            clientName: result.clientName,
            weekOf: result.weekOf,
            rating: result.rating,
            notes: [checkinFlags(result).join(" · "), result.change && `Change: ${result.change}`, result.notes].filter(Boolean).join("\n"),
            link: window.location.origin + window.location.pathname + "?tab=review"
        });

        await refreshMine();
    } catch (error) {
        checkinSubmitMsg.textContent = "Couldn't submit that — try again.";
        checkinSubmitMsg.className = "clients-msg clients-msg-error";
        checkinSubmitMsg.hidden = false;
        console.error(error);
    } finally {
        checkinSubmitBtn.disabled = false;
        checkinSubmitBtn.textContent = checkinSubmitBtn.dataset.label || "Submit Check-in";
    }
});

// ---- Coach: review queue (a list and the open check-in) ----

const reviewDetail = document.getElementById("reviewDetail");
const reviewFilters = document.getElementById("reviewFilters");
let reviewItems = [];        // every check-in from this coach's clients, newest first
let missingClients = [];     // clients with no check-in for this week yet
let reviewFilter = "needs";
let selectedId = null;
let firstReviewLoad = true;
const wide = window.matchMedia("(min-width: 821px)");

const FILTER_PICK = {
    needs: () => reviewItems.filter(c => c.status !== "reviewed"),
    replied: () => reviewItems.filter(c => c.status === "reviewed"),
    missing: () => missingClients
};
const firstName = name => String(name || "Client").split(" ")[0];
const sentText = c => { const at = toMillis(c.submittedAt); return at ? waitedText(at) : ""; };

// The check-in's own words first, so the list says why it matters.
function summaryOf(c) {
    if (c.isMissing) return c.lastWeek ? `Last check-in ${formatWeekLabel(c.lastWeek).replace("Week of ", "")}` : "Hasn't checked in yet";
    const flags = checkinFlags(c);
    return flags.length ? flags.join(" · ") : (c.wentWell || c.notes || "No notes left.");
}

function listRowHtml(c, open) {
    const flagged = !c.isMissing && c.status !== "reviewed" && checkinFlags(c).length > 0;
    return `
        <button type="button" class="ck-item${open ? " is-open" : ""}" data-id="${escapeHtml(c.id)}" aria-pressed="${open}">
            <span class="clients-row-avatar">${escapeHtml((c.clientName || "?").slice(0, 1).toUpperCase())}</span>
            <span class="ck-item-text">
                <span class="ck-item-top"><strong>${escapeHtml(c.clientName || "Client")}</strong>${flagged ? `<span class="ck-dot" title="Worth a look"></span>` : ""}<span class="ck-item-when">${escapeHtml(c.isMissing ? "" : sentText(c))}</span></span>
                <span class="ck-item-sum">${c.isMissing || !c.rating ? "" : `${c.rating}/5 · `}${escapeHtml(summaryOf(c))}</span>
            </span>
        </button>`;
}

function detailHtml(c) {
    const hub = `client.html?uid=${encodeURIComponent(c.clientUid)}`;
    const avatar = `<span class="clients-row-avatar">${escapeHtml((c.clientName || "?").slice(0, 1).toUpperCase())}</span>`;
    if (c.isMissing) {
        return `
            <div class="ck-d-head">${avatar}<div><div class="ck-kicker">No check-in yet this week</div><h2>${escapeHtml(c.clientName)}</h2></div></div>
            <p class="clients-card-note">${escapeHtml(summaryOf(c))}. A nudge from you is often all it takes.</p>
            <div class="ck-actions"><a class="clients-btn-primary" href="${hub}&tab=messages">Message ${escapeHtml(firstName(c.clientName))}</a><a class="clients-btn-secondary" href="${hub}">Open Client Hub</a></div>`;
    }
    const replied = c.status === "reviewed";
    const last = reviewItems.find(o => o.clientUid === c.clientUid && o.status === "reviewed" && o.coachFeedback && (o.weekOf || "") < (c.weekOf || ""));
    const tiles = [["Week", c.rating ? `${c.rating}/5` : "—", false], ...WELLBEING.map(w => [w.label, Number(c[w.key]) ? c[w.key] : "—", Number(c[w.key]) && Number(c[w.key]) <= 2])];
    return `
        <div class="ck-d-head">${avatar}
            <div style="flex:1;min-width:0"><div class="ck-kicker">${escapeHtml(formatWeekLabel(c.weekOf))}${sentText(c) ? ` · sent ${escapeHtml(sentText(c))}` : ""}</div><h2>${escapeHtml(c.clientName || "Client")}</h2></div>
            <span class="checkin-status-badge status-${replied ? "reviewed" : "submitted"}">${replied ? "Replied" : "Needs reply"}</span></div>
        <div class="ck-meter">${tiles.map(([l, v, low]) => `<div${low ? ' class="is-low"' : ""}><b>${escapeHtml(v)}</b><span>${escapeHtml(l)}</span></div>`).join("")}</div>
        ${checkinDetailsHtml(c) || `<p class="checkin-row-notes"><em>No notes left.</em></p>`}
        ${last ? `<p class="ck-last"><span>Your last reply</span>${escapeHtml(last.coachFeedback)}</p>` : ""}
        <form class="checkin-review-form" data-id="${escapeHtml(c.id)}">
            <textarea rows="3" data-emoji="quick" aria-label="Your reply to ${escapeHtml(firstName(c.clientName))}" placeholder="Write your reply to ${escapeHtml(firstName(c.clientName))}...">${escapeHtml(c.coachFeedback || "")}</textarea>
            <div class="checkin-review-form-actions ck-actions">
                <button type="submit" class="clients-btn-primary">${replied ? "Update reply" : "Send reply"}</button>
                <a class="clients-btn-secondary" href="${hub}&tab=plan">Adjust ${escapeHtml(firstName(c.clientName))}'s plan</a>
                <span class="clients-msg" hidden></span>
            </div>
        </form>`;
}

function renderReview() {
    const picked = FILTER_PICK[reviewFilter]();
    if (!picked.some(c => c.id === selectedId) && wide.matches) selectedId = picked[0]?.id || null;
    if (!picked.some(c => c.id === selectedId)) selectedId = null;
    reviewFilters.querySelectorAll("[data-filter]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.filter === reviewFilter);
        btn.querySelector(".clients-filter-count").textContent = FILTER_PICK[btn.dataset.filter]().length;
    });
    const emptyText = { needs: "Everyone has a reply. Nice work.", missing: "Every client has checked in this week.", replied: "No replies sent yet." }[reviewFilter];
    const inline = !wide.matches;
    reviewList.innerHTML = picked.length
        ? picked.map(c => listRowHtml(c, c.id === selectedId) + (inline && c.id === selectedId ? `<div class="ck-sheet">${detailHtml(c)}</div>` : "")).join("")
        : `<p class="clients-card-note ck-none">${emptyText}</p>`;
    const current = picked.find(c => c.id === selectedId);
    reviewDetail.hidden = inline;
    reviewDetail.innerHTML = !inline && current ? detailHtml(current) : "";
    reviewEmpty.hidden = reviewItems.length > 0 || missingClients.length > 0;
    const needs = FILTER_PICK.needs().length, missing = FILTER_PICK.missing().length;
    document.getElementById("checkinIntro").textContent = reviewItems.length || missing
        ? `${needs} to reply to${missing ? `, ${missing} not in yet this week` : ""}. Read it, reply, move on.`
        : "Your clients' weekly check-ins show up here.";
}

async function refreshReview() {
    const [items, clients] = await Promise.all([listCheckinsForMyClients(), listMyClients().catch(() => [])]);
    reviewItems = items;
    const thisWeek = weekKeyFor();
    const inThisWeek = new Set(items.filter(c => c.weekOf === thisWeek).map(c => c.clientUid));
    missingClients = clients.filter(l => !inThisWeek.has(l.clientUid)).map(l => ({
        id: `missing:${l.clientUid}`, isMissing: true, clientUid: l.clientUid, clientName: l.clientName || "Client",
        lastWeek: items.find(c => c.clientUid === l.clientUid)?.weekOf || ""
    }));
    const needs = items.filter(c => c.status !== "reviewed").length;
    reviewCountEl.textContent = String(needs);
    reviewCountEl.hidden = needs === 0;
    // Nothing waiting on the first look: open on the replies, not an empty list.
    if (firstReviewLoad) {
        firstReviewLoad = false;
        if (!needs && items.length) reviewFilter = "replied";
    }
    renderReview();
}

reviewFilters.addEventListener("click", event => {
    const btn = event.target.closest("[data-filter]");
    if (!btn) return;
    reviewFilter = btn.dataset.filter;
    selectedId = null;
    renderReview();
});
reviewList.addEventListener("click", event => {
    const item = event.target.closest(".ck-item");
    if (!item) return;
    // On a phone, tapping the open one folds it away again.
    selectedId = !wide.matches && item.dataset.id === selectedId ? null : item.dataset.id;
    renderReview();
});
wide.addEventListener("change", renderReview);

document.addEventListener("submit", async event => {
    const form = event.target.closest?.(".checkin-review-form");
    if (!form || !form.dataset.id) return;
    event.preventDefault();
    const id = form.dataset.id;
    const source = reviewItems.find(c => c.id === id);
    const textarea = form.querySelector("textarea");
    const btn = form.querySelector("button[type=submit]");
    const msg = form.querySelector(".clients-msg");
    btn.disabled = true;
    try {
        await reviewCheckin(id, textarea.value.trim());
        toast("Reply sent. They get it in the app and by email.");
        msg.hidden = true;
        sendCheckinReviewedEmail({
            clientEmail: source?.clientEmail,
            clientName: source?.clientName,
            coachName: source?.coachName,
            weekOf: source?.weekOf,
            feedback: textarea.value.trim(),
            link: window.location.origin + window.location.pathname
        });
        // Move straight on to the next one waiting.
        if (reviewFilter === "needs") {
            const waiting = FILTER_PICK.needs();
            const at = waiting.findIndex(c => c.id === id);
            selectedId = (waiting[at + 1] || waiting[at - 1])?.id || null;
        }
        await refreshReview();
    } catch (error) {
        msg.textContent = "Couldn't save that — try again.";
        msg.className = "clients-msg clients-msg-error";
        msg.hidden = false;
        btn.disabled = false;
        console.error(error);
    }
});

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
            document.getElementById("checkinTitle").textContent = "Check-ins";
        }
    });
});
