/* ==========================================
   Southbound — Client Hub (client.html?uid=...)

   One home for a client, coach side: who they are, where their plan
   stands, what's next, what needs attention, and recent activity, with
   tabs for their Plan (the coach's plan workspace, js/planWorkspace.js), Check-ins (reply
   inline), Sessions, Notes and Profile.

   It reads coachLinks, userProfiles, sharedPlans, checkins,
   bookingRequests, clientRecords, coachNotes and clientUpdates through
   js/clientDirectory.js, and summarizes with js/clientSummary.js.
   Notes keeps the coach's PRIVATE notes (coachNotes, never shown to
   the client) visibly apart from updates the client DOES see
   (clientUpdates) -- js/clientNotes.js.
   Coach-only (COACH_ONLY_PAGES in js/loadHeader.js); firestore.rules
   only let a linked coach read any of this anyway.
========================================== */

import { listenForAuth } from "./auth.js";
import { loadClientRecord, loadHistoryExtras } from "./clientDirectory.js";
import { TIMELINE_GROUPS, filterTimeline, groupCounts, groupByMonth, historyStats, statsLine, eventDay, HISTORY_PAGE } from "./clientTimeline.js";
import { applicationLines } from "./applicationForm.js";
import {
    summarizePlans, summarizeSessions, summarizeCheckins, summarizeProgress, needsAttention,
    buildTimeline, serviceLabels, isoDate, shortDate, toMillis
} from "./clientSummary.js";
import { SESSION_TYPES } from "./scheduling.js";
import { reviewCheckin } from "./checkins.js";
import { sendCheckinReviewedEmail, sendProfileAskEmail } from "./emailNotify.js";
import { ASKS, openAsks, answerFreshness, ageText } from "./profileChecks.js";
import { answersDone, essentialsDone, ESSENTIALS, injurySummary } from "./intakeFlow.js";
import { icon } from "./icons.js";
import { FIELDS, displayValue, athleteDisplayName, healthYeses, BODY_AREAS, INJURY_STATUS } from "./clientRecordSchema.js";

const INJURY_LABELS = {
    areas: Object.fromEntries(BODY_AREAS.map(o => [o.value, o.label])),
    status: Object.fromEntries(INJURY_STATUS.map(o => [o.value, o.label]))
};
import { healthReviewed, markHealthReviewed } from "./healthReviewed.js";
import { realAnswer } from "./intakeFlow.js";
import {
    addPrivateNote, updatePrivateNote, deletePrivateNote,
    sendClientUpdate, deleteClientUpdate
} from "./clientNotes.js";
import { toast, sbConfirm, friendlyError } from "./ui.js";
import { commentOnResult, isStrengthResult } from "./workoutResults.js";
import { compareStrength } from "./strengthWorkout.js";
import { strengthTableHtml } from "./strengthSession.js";
import { checkinDetailsHtml } from "./checkinView.js";
import { answerChangeRequest } from "./changeRequests.js";
import { reasonLabel } from "./feedbackModel.js";
import { compareRun, formatDuration } from "./runWorkout.js";
import { renderEmojiText } from "./emoji.js";
import { sessionList, attachLogs, attendance, SESSION_STATUSES, CANCELLED, statusLabel } from "./sessionModel.js";
import { createPackageForClient, updateClientPackage, packageCatalogOptions } from "./clientPackages.js";
import { countCompletedPackageSessions, packageRemainingSessions, packageCanConsumeSession, PAYMENT_STATUSES, isStripeManagedPackage } from "./clientPackageModel.js";
import { hasTrainingService, hasSoccerService } from "./services.js";

const $ = id => document.getElementById(id);
const clientUid = new URLSearchParams(location.search).get("uid");

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function niceTime(hhmm) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return hhmm || "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function dayName(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const sessionLabel = r =>
    `${SESSION_TYPES.find(t => t.value === r.sessionType)?.label || "Session"}${r.label ? ` · ${r.label}` : ""}`;

function workoutText(day) {
    const miles = Number(day.miles) ? `${day.miles} mi ` : "";
    const type = day.type ? day.type[0].toUpperCase() + day.type.slice(1) : "Workout";
    return `${miles}${type}${day.session && day.session.toLowerCase() !== day.type ? ` — ${day.session}` : ""}`;
}

// ---- Tabs ----

let planMounted = false;
let profileMounted = false;
let record = null;

function selectTab(name) {
    const tab = document.querySelector(`.hub-tabs .clients-tab[data-tab="${name}"]`);
    if (!tab) return;
    document.querySelectorAll(".hub-tabs .clients-tab").forEach(t => t.classList.toggle("active", t === tab));
    // On phones the tab bar scrolls sideways; keep the chosen tab in view.
    const bar = tab.parentElement;
    if (tab.offsetLeft + tab.offsetWidth > bar.scrollLeft + bar.clientWidth || tab.offsetLeft < bar.scrollLeft) {
        bar.scrollLeft = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
    }
    document.querySelectorAll(".hub-page .clients-panel").forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (name === "plan" && !planMounted && record) {
        planMounted = true;
        import("./planWorkspace.js").then(({ mountPlanWorkspace }) => mountPlanWorkspace($("hubPlan"), {
            clientUid,
            clientName: displayName(),
            clientEmail: record.profile?.email || record.link?.clientEmail,
            firstName: firstName(),
            data: record,
            onChange: () => { summarize(); renderAll(); }
        }));
    }
    if (name === "profile" && !profileMounted && record) {
        profileMounted = true;
        renderProfileNote();
        import("./clientProfileForm.js").then(({ mountProfileForm }) => mountProfileForm($("hubProfile"), {
            clientUid,
            record: record.record || null,
            mode: "coach",
            onSaved: saved => {
                record.record = saved;
                summarize();
                renderAll();
                renderProfileNote();
                renderProfileFresh();
            }
        }));
    }
    const url = new URL(location.href);
    url.searchParams.set("tab", name);
    history.replaceState(null, "", url);
}

document.querySelectorAll(".hub-tabs .clients-tab").forEach(t => t.addEventListener("click", () => selectTab(t.dataset.tab)));
document.addEventListener("change", event => {
    const select = event.target.closest("[data-package-payment]");
    if (select) {
        changePackagePaymentStatus(select.dataset.packagePayment, select.value);
    }
});
document.addEventListener("click", event => {
    const packageStatus = event.target.closest("[data-package-status]");
    if (packageStatus) {
        changePackageStatus(packageStatus.dataset.packageId, packageStatus.dataset.packageStatus);
        return;
    }
    if (event.target.closest('[data-act="health-reviewed"]')) {
        markHealthReviewed(record.link.clientUid, record.record?.healthCheckedAt);
        summarize();
        renderAttention();
        renderAbout();
        import("./icons.js").then(m => m.hydrate());
        toast("Marked as reviewed. It'll show again if their answers change.");
        return;
    }
    const go = event.target.closest("[data-go-tab]");
    if (!go) return;
    event.preventDefault();
    selectTab(go.dataset.goTab);
    const focus = go.dataset.focus && $(go.dataset.focus);
    if (focus) { focus.scrollIntoView({ block: "center" }); focus.focus({ preventScroll: true }); }
    else window.scrollTo({ top: 0 });
});

const displayName = () => record?.profile?.displayName || record?.link?.clientName || "Client";
const firstName = () => athleteDisplayName(record?.record, displayName()).split(" ")[0];
const noteDate = value => {
    const ms = toMillis(value);
    return ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Just now";
};

// ---- Render ----

// "2 hours ago", "yesterday", "5 days ago", "Sep 12".
function agoText(ms) {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    return `on ${new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function renderHeader() {
    const { profile, link } = record;
    const name = displayName();
    document.title = `${name} | Southbound`;
    $("hubAvatar").textContent = name.slice(0, 1).toUpperCase();
    $("hubName").textContent = name;
    const services = serviceLabels(profile?.services || []);
    $("hubServices").innerHTML = services.length
        ? `<span>${esc(services.join(" · "))}</span> <button type="button" class="hub-services-edit" data-act="services">${icon("edit")} Edit</button>`
        : `<span class="hub-services-none">${icon("alertTriangle")} No services yet — ${esc(firstName())} only sees the basics</span> <button type="button" class="hub-services-edit" data-act="services">Choose services</button>`;
    const since = toMillis(profile?.approvedAt) || toMillis(link?.linkedAt);
    const status = profile?.status && profile.status !== "active" ? `${profile.status[0].toUpperCase()}${profile.status.slice(1)} · ` : "Active · ";
    const seen = toMillis(profile?.lastSeenAt);
    $("hubSince").textContent = status + (since ? `Client since ${new Date(since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Client")
        + (seen ? ` · Last in the app ${agoText(seen)}` : "");
    const email = profile?.email || link?.clientEmail;
    if (email) {
        $("hubEmail").href = `mailto:${email}`;
        $("hubEmail").hidden = false;
    }

    // From their profile: who's actually training, their goal, a phone.
    const rec = record.record;
    const goesBy = $("hubGoesBy");
    const who = athleteDisplayName(rec, "");
    if (rec?.whoTrains === "child" && rec.athleteName) {
        goesBy.textContent = `Training: ${rec.athleteName}${rec.birthYear ? ` (born ${rec.birthYear})` : ""}`;
        goesBy.hidden = false;
    } else if (who && who !== name) {
        goesBy.textContent = `Goes by ${who}`;
        goesBy.hidden = false;
    } else {
        goesBy.hidden = true;
    }
    const goal = $("hubGoal");
    if (rec?.primaryGoal) {
        const target = [realAnswer(rec.targetEvent), rec.targetDate ? displayValue(FIELDS.find(f => f.key === "targetDate"), rec.targetDate) : ""].filter(Boolean).join(", ");
        goal.innerHTML = `<span>Goal</span> ${esc(rec.primaryGoal)}${target ? ` <em>· ${esc(target)}</em>` : ""}`;
        goal.hidden = false;
    } else {
        goal.hidden = true;
    }
    const phone = String(rec?.phone || "").replace(/[^\d+]/g, "");
    $("hubCall").hidden = !phone;
    if (phone) {
        $("hubCall").href = `sms:${phone}`;
        $("hubCall").title = rec.phone;
    }
}

// Key facts from their profile for the Overview (the full, editable
// version is the Profile tab).
function renderAbout() {
    const rec = record.record;
    if (rec === undefined) { $("hubAbout").innerHTML = ""; return; }   // couldn't read it
    if (!rec || !anyAnswer(rec)) {
        $("hubAbout").innerHTML = `
            <div class="clients-card hub-about">
                <div class="hub-about-head"><h2>About ${esc(firstName())}</h2></div>
                ${freshLine(rec)}
            </div>`;
        return;
    }
    const f = key => FIELDS.find(x => x.key === key);
    const val = key => displayValue(f(key), rec[key]);
    const join = (...parts) => parts.filter(Boolean).join(" · ");
    const contact = (name, relation, phone) => name ? join(relation ? `${name} (${relation})` : name, phone) : "";
    const rows = [
        ["Aiming for", join([realAnswer(rec.targetEvent), val("targetDate")].filter(Boolean).join(", "), rec.eventType && realAnswer(rec.targetEvent) !== val("eventType") ? val("eventType") : "")],
        ["Injuries / limits", rec.injuries && !realAnswer(rec.injuries) ? rec.injuries : ""],
        ["Sport", join(val("primarySport"), rec.teamOrLevel)],
        ["Training now", join(rec.currentTraining, val("weeklyMileage"))],
        ["Running", join(rec.runsPerWeek != null ? `${rec.runsPerWeek} runs a week` : "", rec.longestRun != null ? `longest ${rec.longestRun} mi` : "", rec.yearsRunning ? `running ${val("yearsRunning").toLowerCase()}` : "", rec.runStart && rec.runStart !== "running" ? `runs non-stop: ${val("runStart").toLowerCase()}` : "")],
        ["Soccer", join(val("soccerPosition"), val("soccerLevel"), rec.strongFoot ? `${val("strongFoot").toLowerCase()} foot` : "", rec.yearsPlaying ? `playing ${val("yearsPlaying").toLowerCase()}` : "")],
        ["Available", join(val("availabilityDays"), val("timeOfDay"), rec.sessionLength ? `${val("sessionLength")} a session` : "", rec.availabilityNotes)],
        ["Trains", join(val("trainWhere"), val("equipment"))],
        ["Coaching style", join(val("feedbackStyle"), rec.obstacle ? `gets in the way: ${val("obstacle").toLowerCase()}` : "")],
        ["Emergency contact", contact(rec.emergencyName, rec.emergencyRelation, rec.emergencyPhone)],
        ["Parent / guardian", rec.whoTrains === "child" ? "" : contact(rec.guardianName, "", rec.guardianPhone)],
        ["Health check", Number(rec.healthCheckedAt) > 0 ? (healthYeses(rec).length ? "" : "No to all") : "Not answered yet"],
        ["Other goals", rec.secondaryGoals],
        ["Wants from a coach", rec.coachingWants],
        ["What's worked", rec.workedBefore],
        ["What hasn't", rec.notWorked]
    ].filter(([, v]) => v);
    const yeses = healthYeses(rec);
    const reviewed = Number(healthReviewed()[record.link.clientUid]) >= Number(rec.healthCheckedAt);
    const health = yeses.length ? `
            <div class="hub-injury hub-health">${icon("alertTriangle")}<span>
                <strong>Health check:</strong> said yes to ${esc(yeses.join(", ").toLowerCase())}.${rec.healthNote ? ` “${esc(rec.healthNote)}”` : ""}
                Check with them (and their doctor) before training gets harder.
                ${reviewed ? `<em class="hub-health-done">Reviewed</em>` : `<button type="button" class="clients-btn-secondary hub-health-btn" data-act="health-reviewed">Mark as reviewed</button>`}
            </span></div>` : "";
    // Where / how it is, unless the injury text is already just those taps.
    const tapped = join(val("injuryAreas"), val("injuryStatus").toLowerCase());
    const where = tapped && rec.injuries !== injurySummary(rec.injuryAreas || [], rec.injuryStatus || "", INJURY_LABELS)
        ? ` <span class="hub-injury-where">(${esc(tapped)})</span>` : "";
    $("hubAbout").innerHTML = `
        <div class="clients-card hub-about">
            <div class="hub-about-head">
                <h2>About ${esc(athleteDisplayName(rec, displayName()).split(" ")[0])}</h2>
                <button type="button" class="clients-btn-secondary" data-go-tab="profile">Full profile</button>
            </div>
            ${freshLine(rec)}
            ${health}
            ${realAnswer(rec.injuries) ? `<div class="hub-injury">${icon("alertTriangle")}<span><strong>Injuries / limits:</strong> ${esc(rec.injuries)}${where}</span></div>` : ""}
            ${rows.length ? `<dl class="hub-facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
        </div>`;
}

// ---- How current the profile is (js/profileChecks.js) ----

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const anyAnswer = rec => ESSENTIALS.some(e => e.done(rec || {}));

// One line for the Overview's About card.
function freshLine(rec) {
    const asks = openAsks(rec || {});
    const since = at => ageText(Math.floor((Date.now() - at) / 86400000));
    if (!rec || !answersDone(rec)) {
        const n = ESSENTIALS.filter(e => e.id !== "health" && e.done(rec || {})).length;
        const text = n ? `Profile: ${n} of ${ESSENTIALS.length - 1} essentials answered` : "Hasn't filled in their profile yet";
        return `<p class="hub-fresh-line is-stale">${icon("clock")}<span>${asks.length ? `${text} · you asked ${since(asks[0].at)} — waiting on ${esc(firstName())}` : `<strong>${text}</strong>`}</span>
            ${asks.length ? "" : `<button type="button" class="hub-link" data-act="ask-update">Ask ${esc(firstName())} to ${n ? "finish it" : "fill it in"}</button>`}</p>`;
    }
    const stale = answerFreshness(rec, Date.now(), todayIso()).filter(f => f.stale);
    const updated = toMillis(rec.updatedAt);
    const parts = [updated ? `Profile updated ${ageText(Math.floor((Date.now() - updated) / 86400000))}` : ""];
    if (asks.length) parts.push(`you asked ${ageText(Math.floor((Date.now() - asks[0].at) / 86400000))} — waiting on ${esc(firstName())}`);
    else if (stale.length) parts.push(`<strong>${stale.length} answer${stale.length === 1 ? "" : "s"} may be out of date</strong>`);
    return `<p class="hub-fresh-line${stale.length && !asks.length ? " is-stale" : ""}">${icon("clock")}<span>${parts.filter(Boolean).join(" · ")}</span>
        ${stale.length && !asks.length ? `<button type="button" class="hub-link" data-act="ask-update">Ask ${esc(firstName())} to update</button>` : ""}</p>`;
}

// The Profile tab's "how current is it" card.
function renderProfileFresh() {
    const el = $("hubProfileFresh");
    const rec = record?.record;
    if (!el) return;
    if (rec === undefined) { el.innerHTML = ""; return; }   // couldn't read it
    const fresh = answerFreshness(rec || {}, Date.now(), todayIso());
    const asks = openAsks(rec || {});
    const askedFor = key => asks.find(a => a.keys.includes(key));
    el.innerHTML = `
        <div class="clients-card hub-fresh">
            <div class="hub-about-head">
                <h2>How current is it?</h2>
                <button type="button" class="clients-btn-secondary" data-act="ask-update">Ask ${esc(firstName())} to update…</button>
            </div>
            <ul class="hub-fresh-list">
                ${fresh.map(f => {
                    const ask = askedFor(f.key);
                    return `<li class="${(f.stale || f.missing) && !ask ? "is-stale" : ""}">
                        <span class="hub-fresh-label">${esc(f.label)}</span>
                        <span class="hub-fresh-when">${f.missing ? "not answered yet" : Number.isFinite(f.days) ? `confirmed ${esc(ageText(f.days))}` : "not confirmed yet"}</span>
                        ${ask ? `<span class="hub-fresh-tag is-asked">Asked ${esc(ageText(Math.floor((Date.now() - ask.at) / 86400000)))}</span>`
                            : f.stale ? `<span class="hub-fresh-tag">${esc(f.reason)}</span>` : ""}
                    </li>`;
                }).join("")}
            </ul>
            <p class="clients-card-note">${esc(firstName())}'s app also asks about old answers on their Today screen, one quick question a week.</p>
        </div>`;
}

async function askToUpdate() {
    const { askClientToUpdate } = await import("./clientRecords.js");
    const rec = record.record || {};
    const fresh = answerFreshness(rec, Date.now(), todayIso());
    const staleKeys = new Set(fresh.filter(f => f.stale || f.missing).map(f => f.key));
    const asks = openAsks(rec);
    const email = record.profile?.email || record.link?.clientEmail || "";
    const first = firstName();
    const whenFor = ask => {
        // The oldest answer it covers (miles can be stale while strength isn't).
        const rows = ask.keys.map(k => fresh.find(f => f.key === k)).filter(Boolean);
        if (rows.some(f => f.missing)) return "not answered yet";
        const ages = rows.map(f => f.days).filter(Number.isFinite);
        return ages.length ? `confirmed ${ageText(Math.max(...ages))}` : "not answered yet";
    };
    const d = document.createElement("dialog");
    d.className = "sb-dialog hub-ask-dialog";
    d.innerHTML = `
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">Ask ${esc(first)} to update</h2>
            <p class="sb-dialog-message">${esc(first)} will see a quick question on their Today screen and can answer in a few taps. Pick what to check:</p>
            <div class="hub-ask-checks">
                ${ASKS.map(a => {
                    const open = asks.find(x => x.id === a.id);
                    const stale = a.keys.some(k => staleKeys.has(k));
                    return `<label class="pw-check"><input type="checkbox" name="asks" value="${a.id}"${stale && !open ? " checked" : ""}>
                        <span>${esc(a.label)} <em class="hub-ask-when${stale ? " is-stale" : ""}">${esc(open ? `asked ${ageText(Math.floor((Date.now() - open.at) / 86400000))}` : whenFor(a))}</em></span></label>`;
                }).join("")}
            </div>
            <label class="pw-check hub-ask-email"><input type="checkbox" name="email"${email ? " checked" : " disabled"}><span>${email ? `Also email ${esc(first)} a heads-up` : "No email on file"}</span></label>
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Ask ${esc(first)}</button>
            </div>
        </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", async ev => {
        ev.preventDefault();
        const data = new FormData(ev.target);
        const ids = data.getAll("asks").map(String);
        const err = d.querySelector('[data-el="error"]');
        if (!ids.length) { err.textContent = "Pick at least one thing to check."; err.hidden = false; return; }
        const btn = ev.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            record.record = await askClientToUpdate(clientUid, ids, record.record);
            if (data.get("email") && email) {
                sendProfileAskEmail({
                    clientEmail: email, clientName: first, coachName: record.link?.coachName || "",
                    items: ASKS.filter(a => ids.includes(a.id)).map(a => a.short)
                }).catch(() => {});
            }
            d.close();
            summarize();
            renderAll();
            toast(`Asked. ${first} will see it on their Today screen.`);
        } catch (error) {
            err.textContent = friendlyError(error, "send that");
            err.hidden = false;
            btn.disabled = false;
        }
    });
    d.showModal();
}
document.addEventListener("click", event => {
    if (event.target.closest('[data-act="ask-update"]')) askToUpdate();
});

function renderProfileNote() {
    const rec = record.record;
    const note = $("hubProfileNote");
    if (rec === undefined) {
        note.textContent = "Couldn't load their profile right now. If this keeps happening, the new security rules may not be published yet.";
    } else if (!rec) {
        note.textContent = "They haven't filled this in yet (they're prompted on their Today screen). You can also fill it in together here — they'll see whatever you save.";
    } else {
        const when = toMillis(rec.updatedAt);
        const by = rec.updatedBy === clientUid ? "them" : "you";
        note.textContent = `${when ? `Last updated ${new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })} by ${by}. ` : ""}They can see everything on this tab.`;
    }
}

function glanceItem(label, value, sub = "", tab = "") {
    return `
        <${tab ? `button type="button" data-go-tab="${tab}"` : "div"} class="hub-glance-item">
            <span class="hub-glance-label">${esc(label)}</span>
            <strong>${esc(value)}</strong>
            ${sub ? `<span class="hub-glance-sub">${esc(sub)}</span>` : ""}
        </${tab ? "button" : "div"}>`;
}

function renderGlance() {
    const { plans, sessions, checkins } = record.summary;
    const p = plans.primary;
    const planValue = !p ? "No active plan"
        : p.state === "upcoming" ? `Starts ${shortDate(p.startDate)}`
        : p.state === "finished" ? "Finished"
        : `Week ${p.weekNumber} of ${p.totalWeeks}`;
    const next = sessions.upcoming[0];
    const latest = checkins.latest;
    const week = plans.week;
    const services = record.profile?.services || [];
    const trains = hasTrainingService(services);

    // Soccer-only clients have no plan or weekly check-in to speak of:
    // lead with their sessions instead.
    if (!trains && services.length) {
        const lastPast = sessions.past[0];
        const att = attendance(sessionList(record.requests, isoDate(new Date())));
        $("hubGlance").innerHTML = [
            glanceItem("Next session", next ? dayName(next.date) : "None booked", next ? `${niceTime(next.startTime)} · ${sessionLabel(next)}` : "", "sessions"),
            glanceItem("Waiting on you", sessions.waiting.length ? `${sessions.waiting.length} request${sessions.waiting.length === 1 ? "" : "s"}` : "Nothing", "", "sessions"),
            glanceItem("Sessions done", String(att.completed),
                att.counted ? `Attended ${att.completed} of ${att.counted}` : sessions.past.length ? "No sessions logged yet" : "", "sessions"),
            glanceItem("Booked ahead", String(sessions.upcoming.length), "", "sessions")
        ].join("");
        return;
    }

    $("hubGlance").innerHTML = [
        glanceItem("Plan", planValue, p?.name || "", "plan"),
        glanceItem("This week", week.planned ? `${week.completed} of ${week.planned} done` : "—",
            week.plannedMiles ? `${week.completedMiles} / ${week.plannedMiles} mi` : "", "plan"),
        glanceItem("Next session", next ? `${dayName(next.date)}` : "None booked", next ? `${niceTime(next.startTime)} · ${sessionLabel(next)}` : "", "sessions"),
        glanceItem("Last check-in", latest ? `Week of ${shortDate(latest.weekOf)}` : "None yet",
            latest ? `${latest.rating ? `${latest.rating}/5 · ` : ""}${latest.status === "submitted" ? "needs your reply" : "reviewed"}` : "", "checkins")
    ].join("");
}

function renderAttention() {
    const items = record.summary.attention;
    $("hubAttention").innerHTML = items.length ? `
        <div class="clients-card hub-attention">
            <h2>${icon("alertTriangle")} Needs attention</h2>
            ${items.map(i => `
                <button type="button" class="hub-attention-item" data-go-tab="${i.tab}">
                    <span>${esc(i.text)}</span>${icon("chevronRight")}
                </button>`).join("")}
        </div>` : `
        <div class="clients-card hub-all-good">${icon("checkCircle")} Nothing needs your attention right now.</div>`;
}

function nextRow(iconName, title, detail, tab) {
    return `
        <button type="button" class="hub-row" data-go-tab="${tab}">
            <span class="hub-row-icon">${icon(iconName)}</span>
            <span class="hub-row-text"><strong>${esc(title)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</span>
        </button>`;
}

function renderNext() {
    const { plans, sessions, checkins } = record.summary;
    const rows = [];
    if (plans.today.length) plans.today.forEach(d => rows.push(nextRow("activity", `Today: ${workoutText(d)}`, d.completed ? "Done ✓" : d.planName, "plan")));
    else if (plans.primary) rows.push(nextRow("moon", "Today: rest day", plans.primary.name, "plan"));
    if (plans.next) rows.push(nextRow("calendar", `${dayName(plans.next.date)}: ${workoutText(plans.next)}`, plans.next.planName, "plan"));
    const session = sessions.upcoming[0];
    if (session) rows.push(nextRow("users", `${dayName(session.date)}, ${niceTime(session.startTime)}`, sessionLabel(session), "sessions"));
    rows.push(nextRow("star",
        checkins.thisWeek ? (checkins.thisWeek.status === "submitted" ? "This week's check-in is in — reply" : "This week's check-in is reviewed") : "This week's check-in isn't in yet",
        checkins.recentAverage ? `Recent average ${checkins.recentAverage}/5` : "", "checkins"));
    if (plans.primary?.endDate && plans.primary.state !== "finished") rows.push(nextRow("flag", `Plan ends ${dayName(plans.primary.endDate)}`, plans.primary.name, "plan"));
    $("hubNext").innerHTML = rows.join("");
}

function renderTimeline() {
    const all = record.summary.timeline;
    const events = all.slice(0, 8);
    $("hubTimeline").innerHTML = events.length
        ? events.map(e => `
            <div class="hub-timeline-item">
                <span class="hub-timeline-date">${esc(shortDate(e.date))}</span>
                <span>${esc(e.text)}</span>
            </div>`).join("")
        : `<p class="clients-card-note">No activity yet.</p>`;
    $("hubSeeHistory").hidden = !all.length;
    $("hubSeeHistory").textContent = all.length > events.length ? `See their whole history (${all.length}) →` : "See their whole history →";
}


function progressMetric(label, value, detail = "") {
    return '<div class="hub-progress-metric">' +
        '<span class="hub-glance-label">' + esc(label) + '</span>' +
        '<strong>' + esc(value) + '</strong>' +
        (detail ? '<span class="hub-progress-detail">' + esc(detail) + '</span>' : '') +
        '</div>';
}

function progressPctChange(value) {
    if (value == null) return "";
    return value > 0 ? "+" + value + "%" : value + "%";
}

function activityDurationText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return "0 min";
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    return hours ? hours + "h " + String(minutes).padStart(2, "0") + "m" : minutes + " min";
}

function performancePaceText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (!total) return "—";
    const minutes = Math.floor(total / 60);
    return minutes + ":" + String(total % 60).padStart(2, "0") + "/mi";
}

function performanceNumber(value, digits = 1) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n.toFixed(digits) : "—";
}

function recoverySleepText(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (!total) return "—";
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return hours ? hours + "h " + String(mins).padStart(2, "0") + "m" : mins + "m";
}

function recoveryStatusText(value) {
    const text = String(value || "").trim();
    return text || "—";
}

function renderProgress() {
    const progress = summarizeProgress({
        plans: record.summary.plans,
        results: record.results || [],
        sessions: sessionList(record.requests, isoDate(new Date())),
        checkins: record.checkins || [],
        today: isoDate(new Date())
    });
    const p = progress.plan;
    const a = progress.activity;
    const t = progress.trend;
    const c = progress.checkins;
    const pva = progress.planVsActual;
    const tt = progress.trainingTrends;
    const services = record.profile?.services || [];

    const trainsToo = hasTrainingService(services);
    const showRunning = services.includes("running") || p.planType === "running" || a.runSessions > 0;
    const sharedActivity = record.sharedWearableActivity;
    const activityShareEnabled = record.wearableShare?.status === "active" && record.wearableShare?.permissions?.activity === true;
    const sharedActivitySummary = sharedActivity?.summary || {};
    const sharedActivityRuns = Array.isArray(sharedActivity?.recentRuns) ? sharedActivity.recentRuns : [];
    const sharedPerformance = record.sharedWearablePerformance;
    const performanceShareEnabled = record.wearableShare?.status === "active" && record.wearableShare?.permissions?.performance === true;
    const performanceSummary = sharedPerformance?.summary || {};
    const performanceRuns = Array.isArray(sharedPerformance?.recentRuns) ? sharedPerformance.recentRuns : [];
    const sharedRecovery = record.sharedWearableRecovery;
    const recoveryShareEnabled = record.wearableShare?.status === "active" && record.wearableShare?.permissions?.recovery === true;
    const recoverySummary = sharedRecovery?.summary || {};
    const recoveryDays = Array.isArray(sharedRecovery?.recentDays) ? sharedRecovery.recentDays : [];
    const sharedActivityBody = activityShareEnabled
        ? sharedActivitySummary.runCount
            ? '<div class="hub-progress-metrics">' +
                progressMetric("COROS runs", String(sharedActivitySummary.runCount), "last 28 days") +
                progressMetric("Distance", String(sharedActivitySummary.distanceMiles || 0) + " mi", "COROS running") +
                progressMetric("Moving time", activityDurationText(sharedActivitySummary.durationSeconds), "COROS running") +
              '</div>' +
              (sharedActivityRuns.length
                  ? '<div class="hub-progress-trend">' +
                      sharedActivityRuns.map(run =>
                          '<div><strong>' + esc(shortDate(run.date)) + '</strong><span>' +
                              esc(String(run.distanceMiles || 0) + " mi · " + activityDurationText(run.durationSeconds)) +
                          '</span></div>'
                      ).join("") +
                    '</div>'
                  : '') +
              '<p class="clients-card-note">This is a client-shared COROS activity view. It is kept separate from Southbound logged workouts so the same run is not counted twice.</p>'
            : '<div class="hub-progress-empty"><strong>No COROS runs in the last 28 days</strong><span>Training activity sharing is on, but Southbound has no recent COROS running data to show.</span></div>'
        : '<div class="hub-progress-empty"><strong>No COROS activity shared</strong><span>The client has not enabled Training activity for this coaching relationship.</span></div>';
    const showStrength = services.includes("strength") || a.strengthSessions > 0;
    const showSoccer = hasSoccerService(services) || a.soccerSessions > 0;
    const showPlanWorkouts = trainsToo || Boolean(p.name) || a.completedWorkouts > 0 || a.skippedWorkouts > 0;
    const hasTrainingActivity = a.completedWorkouts > 0 || a.skippedWorkouts > 0 || a.soccerSessions > 0;

    const planKicker = p.state === "upcoming" ? "Upcoming plan" : p.state === "finished" ? "Plan" : "Current plan";
    const planHeadline = p.state === "upcoming"
        ? "Starts " + shortDate(p.startDate)
        : p.state === "finished"
            ? "Finished " + shortDate(p.endDate)
            : p.week?.due
                ? p.week.completed + " of " + p.week.due + " due completed"
                : p.week?.planned ? "No workouts due yet" : "No active plan";
    const mileLine = p.state === "upcoming"
        ? "Training begins on " + shortDate(p.startDate)
        : p.week?.plannedMiles
            ? p.week.completedMiles + " / " + p.week.plannedMiles + " mi this week"
            : "Mileage not part of this plan";

    const metricItems = [];
    if (showPlanWorkouts) {
        metricItems.push(progressMetric(
            "Coach-plan workouts",
            String(a.completedWorkouts),
            a.completedWorkouts || a.skippedWorkouts
                ? (a.skippedWorkouts ? a.skippedWorkouts + " skipped" : "completed")
                : "No workouts logged"
        ));
    }
    if (showRunning) {
        metricItems.push(progressMetric(
            "Logged run volume",
            a.runMiles + " mi",
            a.runSessions ? a.runSessions + " run" + (a.runSessions === 1 ? "" : "s") + " logged" : "No runs logged"
        ));
    }
    if (showStrength) {
        metricItems.push(progressMetric(
            "Strength",
            String(a.strengthSessions),
            a.strengthSessions ? (a.strengthSets ? a.strengthSets + " sets logged" : "sessions logged") : "No sessions logged"
        ));
    }
    if (showSoccer) {
        metricItems.push(progressMetric(
            "Soccer",
            String(a.soccerCompleted),
            a.soccerCompleted ? (a.soccerCompleted + " of " + a.soccerCounted + " counted") : "No completed sessions"
        ));
    }

    const activityBody = hasTrainingActivity
        ? '<div class="hub-progress-metrics' + (metricItems.length === 1 ? ' hub-progress-metrics-single' : '') + '">' + metricItems.join("") + '</div>'
        : '<div class="hub-progress-empty">' +
            (p.state === "upcoming"
                ? '<strong>No activity logged yet</strong><span>Progress will appear here when ' + esc(p.name || "the plan") + ' starts on ' + esc(shortDate(p.startDate)) + '.</span>'
                : '<strong>No training activity logged</strong><span>There is no logged training activity in the last 28 days.</span>') +
          '</div>';

    const trendRows = [];
    if (showRunning) {
        const trendMiles = (t.priorMiles || t.recentMiles)
            ? "Previous 14 days: " + t.priorMiles + " mi · Recent 14 days: " + t.recentMiles + (t.milesChangePct != null ? " · " + progressPctChange(t.milesChangePct) : "")
            : "No run mileage logged in the last 28 days.";
        trendRows.push('<div><strong>Run volume</strong><span>' + esc(trendMiles) + '</span></div>');
    }
    if (showPlanWorkouts) {
        const trendWorkouts = (t.priorCompleted || t.recentCompleted)
            ? "Previous 14 days: " + t.priorCompleted + " · Recent 14 days: " + t.recentCompleted + (t.completedChangePct != null ? " · " + progressPctChange(t.completedChangePct) : "")
            : "No coach-plan workouts logged in the last 28 days.";
        trendRows.push('<div><strong>Completed coach-plan workouts</strong><span>' + esc(trendWorkouts) + '</span></div>');
    }

    const trendBody = trendRows.length
        ? '<div class="hub-progress-trend">' + trendRows.join("") + '</div>'
        : '<div class="hub-progress-empty"><strong>No activity trend yet</strong><span>There is not enough logged activity in the last 28 days to compare.</span></div>';

    $("hubProgress").innerHTML =
        '<div class="hub-progress-note">' +
            '<span>' + icon("activity") + '</span>' +
            '<span>Derived from the coaching data you already see in Southbound. This is a snapshot of the last 28 days, not a separate tracking system.</span>' +
        '</div>' +

        '<div class="hub-progress-grid">' +
            '<section class="clients-card">' +
                '<div class="hub-progress-head">' +
                    '<div><span class="hub-section-kicker">' + esc(planKicker) + '</span>' +
                    '<h2>' + esc(p.name || "No active plan") + '</h2></div>' +
                    (p.weekNumber && p.totalWeeks ? '<span class="hub-progress-pill">Week ' + p.weekNumber + ' of ' + p.totalWeeks + '</span>' : '') +
                '</div>' +
                '<div class="hub-progress-primary">' + esc(planHeadline) + '</div>' +
                '<p class="clients-card-note">' + esc(mileLine) + '</p>' +
                (p.name ? '<div class="hub-progress-actions"><button type="button" class="clients-btn-secondary" data-go-tab="plan">' + icon("edit") + ' View plan</button></div>' : '') +
            '</section>' +

            '<section class="clients-card">' +
                '<div class="hub-progress-head"><div><span class="hub-section-kicker">Last 28 days</span><h2>Training activity</h2></div></div>' +
                activityBody +
            '</section>' +
        '</div>' +


        '<section class="clients-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">Plan vs. actual</span><h2>Weekly training</h2></div>' +
                (pva.milesPct != null ? '<span class="hub-progress-pill">' + pva.milesPct + '% of plan</span>' : '') +
            '</div>' +
            (pva.available
                ? '<div class="hub-progress-week-table">' +
                    '<div class="hub-progress-week-row hub-progress-week-head"><span>Week</span><span>Planned</span><span>Actual</span><span>Workouts</span></div>' +
                    pva.rows.map(w => '<div class="hub-progress-week-row">' +
                        '<strong>W' + w.week + (w.isCurrent ? ' · current' : '') + (w.isFuture ? ' · upcoming' : '') + '</strong>' +
                        '<span>' + w.plannedMiles + ' mi</span>' +
                        '<span>' + (w.isFuture ? '—' : w.actualMiles + ' mi') + '</span>' +
                        '<span>' + (w.isFuture ? '—' : w.completedWorkouts + '/' + w.dueWorkouts + (w.missedWorkouts ? ' · ' + w.missedWorkouts + ' missed' : '')) + '</span>' +
                    '</div>').join("") +
                  '</div>' +
                '<p class="clients-card-note hub-progress-compare-note">' +
                    (pva.completedWeeks
                        ? 'Last ' + pva.completedWeeks + ' completed week' + (pva.completedWeeks === 1 ? '' : 's') + ': ' + pva.actualMiles + ' of ' + pva.plannedMiles + ' mi logged (' + pva.milesPct + '% of planned mileage).' 
                        : pva.rows.some(w => w.isCurrent)
                            ? 'Current week shows actual mileage through today; future days are not counted as missed.'
                            : 'The plan has not started yet.') +
                '</p>'
                : '<div class="hub-progress-empty"><strong>No plan comparison yet</strong><span>An active coach plan and its logged results are needed to compare planned and actual training.</span></div>') +
        '</section>' +


        '<section class="clients-card hub-progress-trends-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">Training trends</span><h2>Last 6 weeks</h2></div></div>' +
            (tt.hasData
                ? '<div class="hub-progress-trend-summary">' +
                    '<span><strong>' + tt.weeks.reduce((sum, w) => sum + w.runMiles, 0) + ' mi</strong> logged</span>' +
                    '<span><strong>' + tt.weeks.reduce((sum, w) => sum + w.completedWorkouts, 0) + '</strong> workouts completed</span>' +
                  '</div>' +
                  '<div class="hub-progress-week-trend">' +
                    tt.weeks.map(w => {
                        const maxMiles = Math.max(1, ...tt.weeks.map(x => x.runMiles));
                        const width = w.runMiles ? Math.max(4, Math.round(w.runMiles / maxMiles * 100)) : 0;
                        const labelDate = shortDate(w.start);
                        const effort = w.averageRpe != null ? ' · avg effort ' + w.averageRpe + '/10' : '';
                        return '<div class="hub-progress-trend-row">' +
                            '<div class="hub-progress-trend-label"><strong>' + esc(labelDate) + (w.isCurrent ? ' · current' : '') + '</strong>' +
                                '<span>' + w.runMiles + ' mi · ' + w.runSessions + ' run' + (w.runSessions === 1 ? '' : 's') + ' · ' + w.completedWorkouts + ' completed' + effort + '</span></div>' +
                            '<div class="hub-progress-trend-bar" aria-hidden="true"><span style="width:' + width + '%"></span></div>' +
                        '</div>';
                    }).join("") +
                  '</div>' +
                  '<p class="clients-card-note hub-progress-trend-note">Logged Southbound workout data only. This is a descriptive history; deeper pace, heart-rate, recovery, and other wearable trends can be added when those data are shared.</p>'
                : '<div class="hub-progress-empty"><strong>No training trend yet</strong><span>Once workouts are logged, Southbound will build a six-week history here.</span></div>') +
        '</section>' +

        '<section class="clients-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">Wearable sharing</span><h2>' +
                (record.wearableShare?.status === "active" ? "Shared with you" : "Not shared") +
            '</h2></div></div>' +
            '<p class="clients-card-note">' +
                (record.wearableShare?.status === "active"
                    ? "Client has allowed: " + [
                        record.wearableShare.permissions?.activity ? "training activity" : "",
                        record.wearableShare.permissions?.performance ? "performance" : "",
                        record.wearableShare.permissions?.recovery ? "recovery & sleep" : ""
                    ].filter(Boolean).join(", ") + "."
                    : "The client has not enabled wearable-data sharing with you.") +
            '</p>' +
            '<p class="clients-card-note">Sharing permissions are client-controlled. This record contains consent settings, not COROS sign-in tokens or raw wearable data.</p>' +
        '</section>' +

        '<section class="clients-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">COROS activity</span><h2>Client-shared running</h2></div>' +
                (activityShareEnabled ? '<span class="hub-progress-pill">Activity shared</span>' : '') +
            '</div>' +
            sharedActivityBody +
        '</section>' +

        '<section class="clients-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">COROS performance</span><h2>Shared performance</h2></div>' +
                (performanceShareEnabled ? '<span class="hub-progress-pill">Performance shared</span>' : '') +
            '</div>' +
            (performanceShareEnabled
                ? ((performanceSummary.runCount || performanceSummary.vo2Max || performanceSummary.thresholdPaceSecondsPerMile || performanceSummary.trainingLoadRatio)
                    ? '<div class="hub-progress-metrics">' +
                        progressMetric("Avg pace", performancePaceText(performanceSummary.averagePaceSecondsPerMile), performanceSummary.runCount ? performanceSummary.runCount + " runs" : "COROS") +
                        progressMetric("Avg heart rate", performanceSummary.averageHeartRate ? performanceSummary.averageHeartRate + " bpm" : "—", "running activity") +
                        progressMetric("Best pace", performancePaceText(performanceSummary.bestPaceSecondsPerMile), performanceSummary.bestPaceDistanceMiles ? performanceSummary.bestPaceDistanceMiles + " mi run" : "28-day window") +
                        progressMetric("VO₂ max", performanceNumber(performanceSummary.vo2Max), "latest shared COROS") +
                        progressMetric("Threshold", performancePaceText(performanceSummary.thresholdPaceSecondsPerMile), "latest shared COROS") +
                      '</div>' +
                      (performanceSummary.marathonPrediction
                          ? '<p class="clients-card-note">COROS marathon prediction: <strong>' + esc(performanceSummary.marathonPrediction) + '</strong>.</p>'
                          : '') +
                      ((performanceSummary.trainingLoadRatio || performanceSummary.shortTermLoad || performanceSummary.longTermLoad)
                          ? '<p class="clients-card-note">Training load: ' +
                              (performanceSummary.trainingLoadRatio ? 'ratio ' + performanceNumber(performanceSummary.trainingLoadRatio, 2) : '') +
                              (performanceSummary.shortTermLoad ? ' · short-term ' + Math.round(performanceSummary.shortTermLoad) : '') +
                              (performanceSummary.longTermLoad ? ' · long-term ' + Math.round(performanceSummary.longTermLoad) : '') +
                          '.</p>'
                          : '') +
                      (performanceRuns.length
                          ? '<div class="hub-progress-trend">' +
                              performanceRuns.map(run =>
                                  '<div><strong>' + esc(shortDate(run.date)) + '</strong><span>' +
                                      esc(String(run.distanceMiles || 0) + " mi · " + performancePaceText(run.paceSecondsPerMile) + " · " + (run.avgHeartRate ? run.avgHeartRate + " bpm" : "HR —")) +
                                  '</span></div>'
                              ).join("") +
                            '</div>'
                          : '') +
                      '<p class="clients-card-note">This is a client-shared COROS performance view. Recovery, sleep, and other private wearable data are not included.</p>'
                    : '<div class="hub-progress-empty"><strong>No shared performance data yet</strong><span>Performance sharing is on, but Southbound has no recent COROS performance data to show.</span></div>')
                : '<div class="hub-progress-empty"><strong>No COROS performance shared</strong><span>The client has not enabled Performance for this coaching relationship.</span></div>') +
        '</section>' +

        '<section class="clients-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">COROS recovery</span><h2>Shared recovery &amp; sleep</h2></div>' +
                (recoveryShareEnabled ? '<span class="hub-progress-pill">Recovery shared</span>' : '') +
            '</div>' +
            (recoveryShareEnabled
                ? ((recoverySummary.daysWithData || recoverySummary.latestRecoveryPercent || recoverySummary.latestSleepScore || recoverySummary.latestHrv)
                    ? '<div class="hub-progress-metrics">' +
                        progressMetric("Sleep", recoverySleepText(recoverySummary.latestAsleepMinutes), recoverySummary.latestSleepScore ? "score " + Math.round(recoverySummary.latestSleepScore) : "latest shared night") +
                        progressMetric("HRV", recoverySummary.latestHrv ? Math.round(recoverySummary.latestHrv) + " ms" : "—", "latest shared night") +
                        progressMetric("Resting HR", recoverySummary.latestRestingHeartRate ? Math.round(recoverySummary.latestRestingHeartRate) + " bpm" : "—", "latest shared day") +
                        progressMetric("Recovery", recoverySummary.latestRecoveryPercent ? Math.round(recoverySummary.latestRecoveryPercent) + "%" : "—", recoveryStatusText(recoverySummary.latestRecoveryStatus)) +
                      '</div>' +
                      ((recoverySummary.averageAsleepMinutes || recoverySummary.averageHrv || recoverySummary.averageRestingHeartRate || recoverySummary.averageRecoveryPercent)
                          ? '<p class="clients-card-note">28-day averages: ' +
                              (recoverySummary.averageAsleepMinutes ? recoverySleepText(recoverySummary.averageAsleepMinutes) + " sleep" : '') +
                              (recoverySummary.averageHrv ? ' · HRV ' + Math.round(recoverySummary.averageHrv) + " ms" : '') +
                              (recoverySummary.averageRestingHeartRate ? ' · RHR ' + Math.round(recoverySummary.averageRestingHeartRate) + " bpm" : '') +
                              (recoverySummary.averageRecoveryPercent ? ' · recovery ' + Math.round(recoverySummary.averageRecoveryPercent) + "%" : '') +
                          '.</p>'
                          : '') +
                      (recoverySummary.latestRecoveryHours
                          ? '<p class="clients-card-note">Estimated time to full recovery: <strong>' + Math.round(recoverySummary.latestRecoveryHours) + ' h</strong>.</p>'
                          : '') +
                      (recoveryDays.length
                          ? '<div class="hub-progress-trend">' +
                              recoveryDays.map(day =>
                                  '<div><strong>' + esc(shortDate(day.date)) + '</strong><span>' +
                                      esc(
                                          [
                                              day.asleepMinutes ? recoverySleepText(day.asleepMinutes) + " sleep" : "",
                                              day.hrvAvg ? "HRV " + Math.round(day.hrvAvg) + " ms" : "",
                                              day.restingHeartRate ? "RHR " + Math.round(day.restingHeartRate) + " bpm" : "",
                                              day.recoveryPercent ? "Recovery " + Math.round(day.recoveryPercent) + "%" : ""
                                          ].filter(Boolean).join(" · ")
                                      ) +
                                  '</span></div>'
                              ).join("") +
                            '</div>'
                          : '') +
                      '<p class="clients-card-note">This is a client-shared COROS recovery view. Readiness scores, check-ins, and other private data are not included.</p>'
                    : '<div class="hub-progress-empty"><strong>No shared recovery data yet</strong><span>Recovery &amp; sleep sharing is on, but Southbound has no recent COROS health data to show.</span></div>')
                : '<div class="hub-progress-empty"><strong>No COROS recovery shared</strong><span>The client has not enabled Recovery &amp; sleep for this coaching relationship.</span></div>') +
        '</section>' +

        '<section class="clients-card">' +
            '<div class="hub-progress-head"><div><span class="hub-section-kicker">Activity trend</span><h2>Recent vs. previous 14 days</h2></div></div>' +
            trendBody +
        '</section>' +

        '<div class="hub-progress-grid">' +
            '<section class="clients-card">' +
                '<div class="hub-progress-head"><div><span class="hub-section-kicker">Check-ins</span><h2>' +
                    (c.average != null ? c.average + " / 5" : "No rating yet") +
                '</h2></div><span class="hub-progress-pill">' + c.count + ' in 28 days</span></div>' +
                '<p class="clients-card-note">' +
                    (c.latestRating != null ? "Latest rating: " + c.latestRating + "/5" : "No rated check-in in the window.") +
                '</p>' +
                '<div class="hub-progress-actions"><button type="button" class="clients-btn-secondary" data-go-tab="checkins">' + icon("star") + ' View check-ins</button></div>' +
            '</section>' +

            '<section class="clients-card">' +
                '<div class="hub-progress-head"><div><span class="hub-section-kicker">Flags</span><h2>' +
                    (progress.painFlags ? progress.painFlags : "None") +
                '</h2></div></div>' +
                '<p class="clients-card-note">' +
                    (progress.painFlags ? "Pain or discomfort was reported on a logged workout in the last 28 days." : "No pain flags were reported on logged coach-plan workouts in the last 28 days.") +
                '</p>' +
                (progress.painFlags ? '<div class="hub-progress-actions"><button type="button" class="clients-btn-secondary" data-go-tab="workouts">' + icon("alertTriangle") + ' Review workouts</button></div>' : '') +
            '</section>' +
        '</div>' +

        '<p class="clients-card-note hub-progress-footer">Personal COROS/Strava history, habits, nutrition, and other private device data are not exposed here. The summary only uses information already shared with your coaching relationship.</p>';
}

// ---- History: the whole relationship (js/clientTimeline.js) ----// ---- History: the whole relationship (js/clientTimeline.js) ----

const hist = { group: "all", query: "", shown: HISTORY_PAGE };

function whoLabel(e) {
    if (e.by === "coach") return "You";
    if (e.by === "client") return firstName();
    return "";
}

function historyItem(e) {
    const who = whoLabel(e);
    return `
        <li class="hub-hist-item">
            <span class="hub-who hub-who-${esc(e.by || "none")}" aria-hidden="true"></span>
            <button type="button" class="hub-hist-body" data-go-tab="${esc(e.tab)}">
                <span class="hub-hist-meta">${esc(eventDay(e))}${who ? ` · ${esc(who)}` : ""}${e.kind === "note" ? ` · ${icon("lock")} only you` : ""}</span>
                <span class="hub-hist-text">${esc(e.text)}</span>
                ${e.detail ? `<span class="hub-hist-detail">${renderEmojiText(esc(e.detail))}</span>` : ""}
            </button>
        </li>`;
}

function renderHistoryList() {
    const all = record.summary.timeline;
    const counts = groupCounts(filterTimeline(all, { query: hist.query }));
    const chips = [{ value: "all", label: "All" }, ...TIMELINE_GROUPS]
        .filter(g => g.value === "all" || g.value === hist.group || counts[g.value]);
    $("hubHistoryFilters").innerHTML = chips.map(g => `
        <button type="button" class="clients-filter${hist.group === g.value ? " active" : ""}" data-hist-group="${g.value}" aria-pressed="${hist.group === g.value}">
            ${esc(g.label)} <span class="clients-filter-count">${counts[g.value] || 0}</span>
        </button>`).join("");
    const events = filterTimeline(all, hist);
    if (!events.length) {
        $("hubHistoryList").innerHTML = `<p class="clients-card-note">${all.length ? "Nothing matches that." : "Nothing has happened yet."}</p>`;
        return;
    }
    const shown = events.slice(0, hist.shown);
    $("hubHistoryList").innerHTML = groupByMonth(shown).map(m => `
        <section class="hub-hist-month">
            <h3>${esc(m.label)}</h3>
            <ol class="hub-hist-items">${m.events.map(historyItem).join("")}</ol>
        </section>`).join("")
        + (events.length > shown.length ? `<button type="button" class="clients-btn-secondary hub-hist-more" data-hist-more>Show older (${events.length - shown.length} more)</button>` : "");
}

function renderHistory() {
    const all = record.summary.timeline;
    $("hubHistoryName").textContent = firstName();
    $("hubHistoryThem").textContent = firstName();
    const stats = historyStats(all);
    const since = stats.since ? `Since ${new Date(`${stats.since}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
    const line = statsLine(stats);
    $("hubHistoryStats").textContent = [since, line].filter(Boolean).join(": ") + (record.historyExtras ? "" : (since ? " · " : "") + "loading older plan versions…");
    renderHistoryList();
}

$("hubHistory").addEventListener("click", event => {
    const chip = event.target.closest("[data-hist-group]");
    if (chip) {
        hist.group = chip.dataset.histGroup;
        hist.shown = HISTORY_PAGE;
        renderHistoryList();
        return;
    }
    if (event.target.closest("[data-hist-more]")) {
        hist.shown += HISTORY_PAGE;
        renderHistoryList();
        import("./icons.js").then(m => m.hydrate());
    }
});
$("hubHistorySearch").addEventListener("input", event => {
    hist.query = event.target.value;
    hist.shown = HISTORY_PAGE;
    renderHistoryList();
    import("./icons.js").then(m => m.hydrate());
});

function packageDateRange(pkg) {
    const start = pkg.startsAt ? `Starts ${shortDate(pkg.startsAt)}` : "";
    const end = pkg.endsAt ? `Ends ${shortDate(pkg.endsAt)}` : "";
    return [start, end].filter(Boolean).join(" · ");
}

function packageAllowance(pkg, sessionHistory = []) {
    if (Number.isFinite(pkg?.sessionAllowance)) {
        const used = countCompletedPackageSessions(pkg.id, sessionHistory);
        const remaining = packageRemainingSessions(pkg, used);
        return `${used} of ${pkg.sessionAllowance} completed · ${remaining} remaining`;
    }
    return pkg?.cadence === "monthly" ? "Monthly coaching" : pkg?.cadence === "weekly" ? "Weekly" : "Ongoing";
}

function packageStatusLabel(status) {
    return status === "paused" ? "Paused" : status === "completed" ? "Completed" : status === "cancelled" ? "Cancelled" : "Active";
}

function paymentStatusLabel(status) {
    return status === "paid" ? "Paid" : status === "past_due" ? "Past due" : status === "comped" ? "Comped" : "Pending";
}

function renderPackages() {
    const packages = Array.isArray(record.packages) ? record.packages : [];
    const sessionHistory = sessionList(record.requests || [], isoDate(new Date()));
    const el = $("hubPackages");
    if (!el) return;
    const active = packages.filter(p => ["active", "paused"].includes(p.status));
    const history = packages.filter(p => !["active", "paused"].includes(p.status)).slice(0, 4);
    const empty = `<p class="clients-card-note">No package assigned yet. Services control what the client can access; packages track the coaching entitlement separately.</p>`;
    const row = pkg => `
        <div class="hub-package-row">
            <div class="hub-package-main">
                <div class="hub-package-head"><strong>${esc(pkg.packageName || pkg.packageId)}</strong><span class="hub-pill ${pkg.status === "active" ? "is-new" : ""}">${esc(packageStatusLabel(pkg.status))}</span></div>
                <span class="hub-package-detail">${esc(packageAllowance(pkg, sessionHistory))}${packageDateRange(pkg) ? ` · ${esc(packageDateRange(pkg))}` : ""}</span>
                <div class="hub-package-payment"><span>Billing: ${esc(paymentStatusLabel(pkg.paymentStatus))}</span>${isStripeManagedPackage(pkg) ? `<span class="hub-package-stripe-managed">${pkg.stripeSubscriptionStatus ? `Stripe — ${esc(pkg.stripeSubscriptionStatus)}` : "Stripe-managed"}</span>` : `<select class="hub-package-payment-select" aria-label="Billing status" data-package-payment="${esc(pkg.id)}">${PAYMENT_STATUSES.map(status => `<option value="${status}"${status === (pkg.paymentStatus || "pending") ? " selected" : ""}>${esc(paymentStatusLabel(status))}</option>`).join("")}</select>`}</div>
                ${pkg.coachNote ? `<span class="hub-package-note">${esc(pkg.coachNote)}</span>` : ""}
            </div>
            ${pkg.status === "active" ? `<div class="hub-package-actions"><button type="button" class="hub-link-btn" data-package-id="${esc(pkg.id)}" data-package-status="paused">Pause</button><button type="button" class="hub-link-btn" data-package-id="${esc(pkg.id)}" data-package-status="completed">Complete</button><button type="button" class="hub-link-btn is-danger" data-package-id="${esc(pkg.id)}" data-package-status="cancelled">Cancel</button></div>` : pkg.status === "paused" ? `<div class="hub-package-actions"><button type="button" class="hub-link-btn" data-package-id="${esc(pkg.id)}" data-package-status="active">Resume</button><button type="button" class="hub-link-btn" data-package-id="${esc(pkg.id)}" data-package-status="completed">Complete</button><button type="button" class="hub-link-btn is-danger" data-package-id="${esc(pkg.id)}" data-package-status="cancelled">Cancel</button></div>` : ""}
        </div>`;
    el.innerHTML = `
        <div class="hub-package-heading"><div><span class="hub-section-kicker">Client package</span><h2>Packages</h2></div><button type="button" class="clients-btn-secondary" data-act="assign-package">Add package</button></div>
        ${active.length ? active.map(row).join("") : empty}
        ${history.length ? `<details class="hub-package-history"><summary>Recent package history (${history.length})</summary>${history.map(row).join("")}</details>` : ""}
        <p class="clients-card-note hub-package-footnote">Finite package usage is derived from completed linked session history — there is no manual session counter to drift.</p>`;
}

async function changePackagePaymentStatus(id, paymentStatus) {
    if (!PAYMENT_STATUSES.includes(paymentStatus)) return;
    const pkg = (record.packages || []).find(p => p.id === id);
    if (!pkg) return;
    const previous = pkg.paymentStatus || "pending";
    try {
        await updateClientPackage(id, { paymentStatus });
        pkg.paymentStatus = paymentStatus;
        toast("Billing marked " + paymentStatusLabel(paymentStatus).toLowerCase() + ".");
    } catch (error) {
        const selects = document.querySelectorAll("[data-package-payment]");
        selects.forEach(select => { if (select.dataset.packagePayment === id) select.value = previous; });
        toast(friendlyError(error, "update the billing status"));
    }
}

async function changePackageStatus(id, status) {
    const pkg = (record.packages || []).find(p => p.id === id);
    if (!pkg || !["active", "paused", "completed", "cancelled"].includes(status)) return;
    if (status === "cancelled" && !(await sbConfirm("This keeps the package in history but makes it inactive.", { title: "Cancel package?", confirmLabel: "Cancel package", cancelLabel: "Keep active", danger: true }))) return;
    try {
        await updateClientPackage(id, { status });
        pkg.status = status;
        pkg.updatedAt = Date.now();
        renderPackages();
        toast(`Package marked ${packageStatusLabel(status).toLowerCase()}.`);
    } catch (error) {
        toast(friendlyError(error, "update the package"));
    }
}

async function assignPackageDialog() {
    const options = packageCatalogOptions();
    const d = document.createElement("dialog");
    d.className = "sb-dialog hub-package-dialog";
    d.innerHTML = `
        <form class="sb-dialog-form">
            <h2 class="sb-dialog-title">Add a package</h2>
            <p class="sb-dialog-message">Assign a coaching entitlement from the Southbound package catalog. This does not record a payment.</p>
            <label class="sb-dialog-label">Package<select class="sb-dialog-input" name="packageId" required>${options.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${Number.isFinite(p.sessionAllowance) ? ` — ${p.sessionAllowance} sessions` : ""}</option>`).join("")}</select></label>
            <div class="hub-package-dates"><label class="sb-dialog-label">Starts<input class="sb-dialog-input" type="date" name="startsAt"></label><label class="sb-dialog-label">Ends<input class="sb-dialog-input" type="date" name="endsAt"></label></div>
            <label class="sb-dialog-label">Billing status<select class="sb-dialog-input" name="paymentStatus">${PAYMENT_STATUSES.map(status => `<option value="${status}">${esc(paymentStatusLabel(status))}</option>`).join("")}</select></label>
            <label class="sb-dialog-label">Coach note<textarea class="sb-dialog-input" name="coachNote" rows="3" maxlength="500" placeholder="Optional internal note"></textarea></label>
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <div class="sb-dialog-actions"><button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button><button type="submit" class="sb-btn sb-btn-primary">Assign package</button></div>
        </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", async event => {
        event.preventDefault();
        const form = event.target;
        const data = new FormData(form);
        const startsAt = String(data.get("startsAt") || "");
        const endsAt = String(data.get("endsAt") || "");
        const err = d.querySelector('[data-el="error"]');
        err.hidden = true;
        if (startsAt && endsAt && endsAt < startsAt) { err.textContent = "The end date must be on or after the start date."; err.hidden = false; return; }
        const btn = form.querySelector("button[type=\"submit\"]");
        btn.disabled = true;
        try {
            const pkg = await createPackageForClient(clientUid, String(data.get("packageId") || ""), {
                startsAt, endsAt, paymentStatus: String(data.get("paymentStatus") || "pending"), coachNote: String(data.get("coachNote") || "")
            });
            record.packages = [pkg, ...(record.packages || [])];
            d.close();
            renderPackages();
            toast("Package assigned.");
        } catch (error) {
            err.textContent = friendlyError(error, "assign the package");
            err.hidden = false;
            btn.disabled = false;
        }
    });
    d.showModal();
}

document.addEventListener("click", event => {
    if (event.target.closest('[data-act="assign-package"]')) assignPackageDialog();
});
function renderApplication() {
    const { profile, application } = record;
    const requested = serviceLabels(profile?.requestedServices || []);
    if (application) {
        const when = toMillis(application.createdAt);
        $("hubApplication").hidden = false;
        $("hubApplicationBody").innerHTML = `
            ${when ? `<p class="clients-card-note">Applied ${esc(new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }))}</p>` : ""}
            <ul class="hub-app-lines">${applicationLines(application).map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
        return;
    }
    if (!profile?.applicationMessage && !requested.length) return;
    $("hubApplication").hidden = false;
    $("hubApplicationBody").innerHTML = `
        ${requested.length ? `<p class="clients-card-note">Asked about: ${esc(requested.join(", "))}</p>` : ""}
        ${profile.applicationMessage ? `<p class="hub-quote">"${esc(profile.applicationMessage)}"</p>` : ""}`;
}

function renderActions() {
    const email = record.profile?.email || record.link?.clientEmail;
    $("hubActions").innerHTML = `
        <button type="button" class="clients-btn-secondary" data-go-tab="notes" data-focus="noteText">${icon("lock")} Private note</button>
        <button type="button" class="clients-btn-secondary" data-go-tab="notes" data-focus="updateText">${icon("send")} Send update</button>
        <button type="button" class="clients-btn-secondary" data-go-tab="plan">${icon("edit")} Edit plan</button>
        <button type="button" class="clients-btn-secondary" data-go-tab="checkins">${icon("star")} Check-ins</button>
        <a class="clients-btn-secondary" href="schedule.html?tab=availability">${icon("calendar")} Schedule</a>
        ${email ? `<a class="clients-btn-secondary" href="mailto:${esc(email)}">${icon("mail")} Email ${esc(displayName().split(" ")[0])}</a>` : ""}
        <button type="button" class="clients-btn-secondary" data-go-tab="profile">${icon("user")} Profile</button>`;
}

function renderCheckins() {
    const list = record.summary.checkins.all;
    const badge = $("hubCheckinBadge");
    badge.hidden = !record.summary.checkins.needsReview.length;
    badge.textContent = record.summary.checkins.needsReview.length || "";

    $("hubCheckins").innerHTML = list.length ? list.map(c => `
        <div class="clients-card hub-checkin ${c.status === "submitted" ? "needs-review" : ""}">
            <div class="hub-checkin-head">
                <strong>Week of ${esc(shortDate(c.weekOf))}</strong>
                <span class="hub-stars" aria-label="${Number(c.rating) || 0} out of 5">${"★".repeat(Number(c.rating) || 0)}<span>${"★".repeat(5 - (Number(c.rating) || 0))}</span></span>
                <span class="hub-pill ${c.status === "submitted" ? "is-new" : ""}">${c.status === "submitted" ? "Needs reply" : "Reviewed"}</span>
            </div>
            ${checkinDetailsHtml(c) || `<p class="hub-quote"><em>No notes.</em></p>`}
            <form class="hub-reply" data-checkin="${esc(c.id)}">
                <label class="clients-card-note" for="reply-${esc(c.id)}">Your reply (they get it in the app and by email)</label>
                <textarea id="reply-${esc(c.id)}" data-emoji="quick" rows="2" placeholder="Feedback for ${esc(displayName().split(" ")[0])}...">${esc(c.coachFeedback || "")}</textarea>
                <div class="hub-reply-actions">
                    <button type="submit" class="clients-btn-primary">${c.status === "reviewed" ? "Update reply" : "Send reply"}</button>
                    <button type="button" class="sb-btn sb-btn-tertiary" data-goto="plan">${icon("edit")} Adjust the plan</button>
                    <span class="clients-msg" hidden></span>
                </div>
            </form>
        </div>`).join("")
        : `<div class="clients-card"><p class="clients-card-note">No check-ins yet. Clients send one each week from their app.</p></div>`;
    $("hubCheckins").querySelectorAll("[data-goto]").forEach(btn => btn.addEventListener("click", () => selectTab(btn.dataset.goto)));

    $("hubCheckins").querySelectorAll("form.hub-reply").forEach(form => form.addEventListener("submit", async event => {
        event.preventDefault();
        const id = form.dataset.checkin;
        const text = form.querySelector("textarea").value.trim();
        const btn = form.querySelector("button");
        const msg = form.querySelector(".clients-msg");
        const source = record.checkins.find(c => c.id === id);
        btn.disabled = true;
        try {
            await reviewCheckin(id, text);
            sendCheckinReviewedEmail({
                clientEmail: source?.clientEmail, clientName: source?.clientName,
                coachName: source?.coachName, weekOf: source?.weekOf, feedback: text
            });
            source.status = "reviewed";
            source.coachFeedback = text;
            source.reviewedAt = Date.now();
            summarize();
            renderAll();
            selectTab("checkins");
            toast("Reply sent. They get it in the app and by email.");
        } catch (error) {
            console.error(error);
            msg.textContent = "Couldn't save that — try again.";
            msg.className = "clients-msg clients-msg-error";
            msg.hidden = false;
            btn.disabled = false;
        }
    }));
}

// ---- Change requests (top of the Plan tab, next to where you change it) ----

function renderChanges() {
    const all = record.changes || [];
    const open = all.filter(c => c.status === "open");
    const answered = all.filter(c => c.status === "resolved" && (toMillis(c.resolvedAt) || 0) > Date.now() - 30 * 86400000).slice(0, 3);
    if (!open.length && !answered.length) { $("hubChanges").innerHTML = ""; return; }
    const first = firstName();
    $("hubChanges").innerHTML = `
        <section class="clients-card hub-changes">
            <h2>${open.length ? `${esc(first)} asked for ${open.length === 1 ? "a change" : `${open.length} changes`}` : "Change requests"}</h2>
            ${open.map(c => `
            <div class="hub-change is-open">
                <div class="hub-change-head">
                    <strong>${esc(reasonLabel(c.reason))}${c.date ? ` · ${esc(shortDate(c.date))}` : ""}</strong>
                    <span class="pw-meta">${esc(shortDate(isoDate(new Date(toMillis(c.createdAt) || Date.now()))))}</span>
                </div>
                <p class="hub-quote">"${esc(c.message)}"</p>
                <form class="hub-reply" data-change="${esc(c.id)}">
                    <label class="clients-card-note" for="chg-${esc(c.id)}">Your answer (${esc(first)} sees it on My Plan and gets an email)</label>
                    <textarea id="chg-${esc(c.id)}" data-emoji="quick" rows="2" maxlength="1000" placeholder="Moved it to Wednesday — check your week.">${esc(c.coachReply || "")}</textarea>
                    <div class="hub-reply-actions">
                        <button type="submit" class="clients-btn-primary">Answer &amp; resolve</button>
                        <span class="clients-msg" hidden></span>
                    </div>
                </form>
            </div>`).join("")}
            ${answered.length ? `<details class="hub-changes-done"${open.length ? "" : " open"}><summary>Answered recently (${answered.length})</summary>
                ${answered.map(c => `<div class="hub-change"><div class="hub-change-head"><strong>${esc(reasonLabel(c.reason))}${c.date ? ` · ${esc(shortDate(c.date))}` : ""}</strong></div>
                    <p class="hub-quote">"${esc(c.message)}"</p><p class="hub-change-reply">${icon("send")} ${renderEmojiText(esc(c.coachReply || "Resolved"))}</p></div>`).join("")}
            </details>` : ""}
            ${open.length ? `<p class="clients-card-note">Change the plan below, publish it, then answer here.</p>` : ""}
        </section>`;
    $("hubChanges").querySelectorAll("form[data-change]").forEach(form => form.addEventListener("submit", async event => {
        event.preventDefault();
        const c = all.find(x => x.id === form.dataset.change);
        const text = form.querySelector("textarea").value.trim();
        const msg = form.querySelector(".clients-msg");
        if (!text) {
            msg.textContent = `Write ${first} a short answer first.`;
            msg.className = "clients-msg clients-msg-error";
            msg.hidden = false;
            return;
        }
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
            const updated = await answerChangeRequest(c, text, { clientEmail: record.profile?.email || record.link?.clientEmail, coachName: record.link?.coachName || "" });
            Object.assign(c, updated);
            summarize();
            renderAll();
            selectTab("plan");
            toast(`Answered. ${first} sees it on My Plan.`);
        } catch (error) {
            console.error(error);
            msg.textContent = friendlyError(error, "save that");
            msg.className = "clients-msg clients-msg-error";
            msg.hidden = false;
            btn.disabled = false;
        }
    }));
}

function sessionRow(o, extra = "") {
    return `
        <div class="hub-session">
            <div class="hub-session-date"><strong>${esc(dayName(o.date || o.dates?.[0] || ""))}</strong><span>${esc(niceTime(o.startTime))}</span></div>
            <div class="hub-session-text">
                <strong>${esc(sessionLabel(o))}</strong>
                ${o.coachNote ? `<span class="hub-quote">"${esc(o.coachNote)}"</span>` : ""}
                ${extra}
            </div>
        </div>`;
}

// ---- Sessions: every booked date, what happened, notes (Phase 6) ----

const STATE_PILL = {
    completed: ["Completed", "is-done"], "no-show": ["No-show", "is-bad"], "late-cancel": ["Cancelled late", "is-bad"],
    cancelled: ["Cancelled", ""], "to-log": ["Not logged yet", "is-new"], "not-logged": ["Not logged", ""],
    today: ["Today", "is-new"], upcoming: ["Booked", ""]
};

function sessionLogRow(s) {
    const [pill, tone] = STATE_PILL[s.state] || ["", ""];
    const past = s.state !== "upcoming";
    const legacy = !s.log && s.coachNote && legacyNoteAt.has(`${s.bookingId}|${s.date}`) ? `<span class="hub-quote">Your earlier note: "${esc(s.coachNote)}"</span>` : "";
    const words = s.log ? [s.log.workedOn ? `<span><b>Worked on:</b> ${renderEmojiText(esc(s.log.workedOn))}</span>` : "",
        s.log.nextTime ? `<span><b>For next time:</b> ${renderEmojiText(esc(s.log.nextTime))}</span>` : ""].join("") : "";
    const actions = s.state === "to-log" || s.state === "today"
        ? `<button type="button" class="clients-btn-primary" data-log="${esc(s.bookingId)}|${esc(s.date)}">Log it</button>
           <button type="button" class="clients-btn-secondary" data-noshow="${esc(s.bookingId)}|${esc(s.date)}">No-show</button>`
        : s.log || past
            ? `<button type="button" class="hub-link-btn" data-log="${esc(s.bookingId)}|${esc(s.date)}">${s.log ? "Edit" : "Log it"}</button>`
            : `<button type="button" class="hub-link-btn" data-log="${esc(s.bookingId)}|${esc(s.date)}" data-cancel-only="1">Cancel this one</button>`;
    return `
        <div class="hub-session hub-session-log">
            <div class="hub-session-date"><strong>${esc(dayName(s.date))}</strong><span>${esc(niceTime(s.startTime))}</span></div>
            <div class="hub-session-text">
                <strong>${esc(sessionLabel(s))} ${pill ? `<span class="hub-pill ${tone}">${esc(pill)}</span>` : ""}</strong>
                ${words ? `<span class="hub-session-words">${words}</span>` : legacy}
            </div>
            <div class="hub-session-actions">${actions}</div>
        </div>`;
}

// An older booking's single note (from before session logs) sits on its
// last past date, and only while that booking has no logs.
let legacyNoteAt = new Set();

function renderSessions() {
    const { waiting } = record.summary.sessions;
    const all = sessionList(record.requests, isoDate(new Date()));
    legacyNoteAt = new Set((record.requests || [])
        .filter(r => r.status === "approved" && r.coachNote && !Object.keys(r.logs || {}).length)
        .map(r => `${r.id}|${(r.allDates || r.dates || []).filter(d => d <= isoDate(new Date())).sort().pop()}`));
    const toLog = all.filter(s => s.state === "to-log" || s.state === "today").reverse();
    const upcoming = all.filter(s => s.state === "upcoming");
    const cancelledAhead = all.filter(s => s.log && CANCELLED.includes(s.log.status) && s.date > isoDate(new Date()));
    const past = all.filter(s => s.date <= isoDate(new Date()) && s.state !== "to-log" && s.state !== "today").reverse();
    const stats = attendance(all);
    const badge = $("hubSessionBadge");
    const count = waiting.length + all.filter(s => s.state === "to-log").length;
    badge.hidden = !count;
    badge.textContent = count || "";
    const section = (title, body, empty, note = "") => `
        <div class="clients-card">
            <h2>${title}</h2>
            ${note ? `<p class="clients-card-note">${note}</p>` : ""}
            ${body || `<p class="clients-card-note">${empty}</p>`}
        </div>`;
    $("hubSessions").innerHTML =
        (stats.line ? `<p class="hub-attendance">${icon("checkCircle")} ${esc(stats.line)}</p>` : "")
        + (waiting.length ? section("Waiting on you",
            waiting.map(r => sessionRow({ ...r, date: r.dates?.[0], coachNote: "" },
                `<span class="clients-card-note">${r.dates?.length > 1 ? `${r.dates.length} weeks · ` : ""}${r.clientNote ? `"${esc(r.clientNote)}"` : ""}</span>`)).join("")
            + `<a class="clients-btn-primary hub-inline-btn" href="schedule.html?tab=availability">Answer in Schedule</a>`, "") : "")
        + (toLog.length ? section(`To log <span class="hub-count">${toLog.length}</span>`, toLog.map(sessionLogRow).join(""), "",
            `How did it go? ${esc(firstName())} sees what you worked on and what's next.`) : "")
        + section("Upcoming", upcoming.slice(0, 12).map(sessionLogRow).join("")
            + cancelledAhead.map(sessionLogRow).join(""), "No upcoming sessions booked.")
        + section("Past sessions", past.slice(0, 30).map(sessionLogRow).join(""), "No past sessions yet.");
}

function findSession(key) {
    const [bookingId, date] = key.split("|");
    return sessionList(record.requests, isoDate(new Date())).find(s => s.bookingId === bookingId && s.date === date) || null;
}

function sessionHistoryForPackage(currentSession) {
    return sessionList(record.requests || [], isoDate(new Date()))
        .filter(x => !(x.bookingId === currentSession.bookingId && x.date === currentSession.date));
}

async function saveLog(s, fields) {
    const { saveSessionLog } = await import("./sessionLogs.js");
    const log = await saveSessionLog({ bookingId: s.bookingId, date: s.date, clientUid, ...fields });
    setLog(s, log);
    return log;
}

function setLog(s, log) {
    const logs = record.requests.flatMap(r => Object.values(r.logs || {})).filter(l => !(l.bookingId === s.bookingId && l.date === s.date));
    if (log) logs.push(log);
    record.requests = attachLogs(record.requests, logs);
    summarize();
    renderAll();
    selectTab("sessions");
}

async function logSessionDialog(s, { cancelOnly = false } = {}) {
    const future = s.date > isoDate(new Date());
    const choices = SESSION_STATUSES.filter(o => !future || CANCELLED.includes(o.value));
    const current = s.log?.status || (cancelOnly || future ? "cancelled" : "completed");
    const sessionHistory = sessionList(record.requests || [], isoDate(new Date()));
    // A package is offered for a new credit only when it is active, inside
    // its date window, and still has a derived credit remaining. Keep the
    // currently assigned package visible so a historical log can still be
    // edited after that package is later paused/completed/cancelled.
    const availablePackages = s.sessionType === "soccer"
        ? (record.packages || []).filter(p => {
            const historyWithoutCurrent = sessionHistory.filter(x => !(x.bookingId === s.bookingId && x.date === s.date));
            const used = countCompletedPackageSessions(p.id, historyWithoutCurrent);
            return packageCanConsumeSession(p, s.date, used);
        })
        : [];
    const selectedPackage = s.log?.packageAssignmentId
        ? (record.packages || []).find(p => p.id === s.log.packageAssignmentId)
        : null;
    if (selectedPackage && !availablePackages.some(p => p.id === selectedPackage.id)) availablePackages.push(selectedPackage);
    const packageFieldHtml = availablePackages.length
        ? `
                <label class="hub-log-field"><span>Package credit <em>Optional — completed sessions only</em></span>
                    <select name="packageAssignmentId">
                        <option value="">No package credit</option>
                        ${availablePackages.map(p => {
                            const historyWithoutCurrent = sessionHistory.filter(x => !(x.bookingId === s.bookingId && x.date === s.date));
                            const used = countCompletedPackageSessions(p.id, historyWithoutCurrent);
                            const remaining = packageRemainingSessions(p, used);
                            const selected = p.id === s.log?.packageAssignmentId ? " selected" : "";
                            return '<option value="' + esc(p.id) + '"' + selected + '>' + esc(p.packageName || p.packageId) + ' — ' + remaining + ' remaining</option>';
                        }).join("")}
                    </select>
                </label>
`
        : "";
    const d = document.createElement("dialog");
    d.className = "sb-dialog hub-log-dialog";
    d.innerHTML = `
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">${esc(sessionLabel(s))} · ${esc(dayName(s.date))}</h2>
            <p class="sb-dialog-message">${esc(niceTime(s.startTime))} with ${esc(firstName())}</p>
            <div class="hub-log-status" role="radiogroup" aria-label="What happened">
                ${choices.map(o => `<label class="hub-log-chip"><input type="radio" name="status" value="${o.value}"${o.value === current ? " checked" : ""}><span>${esc(o.label)}</span></label>`).join("")}
            </div>
            ${packageFieldHtml}
            <div class="hub-log-words">
                <label class="hub-log-field"><span>What did you work on? <em>${esc(firstName())} sees this</em></span>
                    <textarea name="workedOn" rows="3" maxlength="1000" data-emoji placeholder="First touch, weak-foot passing, 1v1 finishing">${esc(s.log?.workedOn || "")}</textarea></label>
                <label class="hub-log-field"><span>For next time <em>${esc(firstName())} sees this</em></span>
                    <textarea name="nextTime" rows="2" maxlength="1000" data-emoji placeholder="Wall passes 10 minutes a day">${esc(s.log?.nextTime || "")}</textarea></label>
                <label class="hub-log-field hub-log-private"><span>${icon("lock")} Private note <em>only you</em></span>
                    <textarea name="private" rows="2" maxlength="4000" placeholder="How they did, anything to remember"></textarea></label>
            </div>
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <div class="sb-dialog-actions">
                ${s.log ? `<button type="button" class="sb-btn sb-btn-tertiary" data-remove>Remove log</button>` : ""}
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Save</button>
            </div>
        </form>`;
    document.body.appendChild(d);
    const form = d.querySelector("form");
    const syncWords = () => {
        const status = new FormData(form).get("status");
        d.querySelector(".hub-log-words").hidden = status !== "completed";
    };
    form.addEventListener("change", syncWords);
    syncWords();
    d.addEventListener("close", () => d.remove());
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("[data-remove]")?.addEventListener("click", async () => {
        const { deleteSessionLog } = await import("./sessionLogs.js");
        try {
            await deleteSessionLog(s.bookingId, s.date);
            d.close();
            setLog(s, null);
            toast("Log removed");
        } catch (error) {
            const err = d.querySelector('[data-el="error"]');
            err.textContent = friendlyError(error, "remove that");
            err.hidden = false;
        }
    });
    form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const data = new FormData(form);
        const status = String(data.get("status") || "completed");
        const words = status === "completed";
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            const packageAssignmentId = words ? String(data.get("packageAssignmentId") || "") || null : null;
            if (packageAssignmentId) {
                const pkg = (record.packages || []).find(p => p.id === packageAssignmentId);
                const historyWithoutCurrent = sessionHistoryForPackage(s);
                const used = countCompletedPackageSessions(packageAssignmentId, historyWithoutCurrent);
                const alreadyAssigned = s.log?.packageAssignmentId === packageAssignmentId && s.log?.status === "completed";
                if (!pkg || (!alreadyAssigned && !packageCanConsumeSession(pkg, s.date, used))) {
                    throw new Error("package-not-available");
                }
            }
            await saveLog(s, {
                status,
                workedOn: words ? String(data.get("workedOn") || "") : "",
                nextTime: words ? String(data.get("nextTime") || "") : "",
                packageAssignmentId
            });
            const priv = words ? String(data.get("private") || "").trim() : "";
            if (priv) {
                const note = await addPrivateNote(clientUid, `${sessionLabel(s)}, ${dayName(s.date)}: ${priv}`);
                record.privateNotes = [note, ...(record.privateNotes || [])];
                sortNotes();
                summarize();
                renderAll();
                selectTab("sessions");
            }
            d.close();
            toast(status === "completed" ? `Logged. ${firstName()} sees your notes in their app.` : `Saved as ${statusLabel(status).toLowerCase()}.`);
        } catch (error) {
            const err = d.querySelector('[data-el="error"]');
            err.textContent = friendlyError(error, "save that");
            err.hidden = false;
            btn.disabled = false;
        }
    });
    d.showModal();
}

$("hubSessions").addEventListener("click", async event => {
    const logBtn = event.target.closest("[data-log]");
    if (logBtn) {
        const s = findSession(logBtn.dataset.log);
        if (s) logSessionDialog(s, { cancelOnly: Boolean(logBtn.dataset.cancelOnly) });
        return;
    }
    const noShow = event.target.closest("[data-noshow]");
    if (noShow) {
        const s = findSession(noShow.dataset.noshow);
        if (!s) return;
        noShow.disabled = true;
        try {
            await saveLog(s, { status: "no-show" });
            toast("Marked as a no-show", {
                action: { label: "Undo", onClick: async () => {
                    const { deleteSessionLog } = await import("./sessionLogs.js");
                    await deleteSessionLog(s.bookingId, s.date);
                    setLog(s, null);
                } }
            });
        } catch (error) {
            toast(friendlyError(error, "save that"), { type: "error" });
            noShow.disabled = false;
        }
    }
});

// ---- Notes: private notes vs. updates they see ----

// Pinned private notes sit on the Overview, so the things to remember
// ("left knee -- no hills", "mom picks up at 5") are the first thing seen.
function renderPinned() {
    const pinned = (record.privateNotes || []).filter(n => n.pinned);
    $("hubPinned").innerHTML = pinned.length ? `
        <div class="clients-card hub-private hub-pinned">
            <div class="hub-about-head">
                <h2>${icon("pin")} Pinned notes</h2>
                <span class="hub-private-tag">${icon("lock")} Only you</span>
            </div>
            ${pinned.map(n => `<p class="hub-note-text">${esc(n.text)}</p>`).join("")}
            <button type="button" class="clients-btn-secondary" data-go-tab="notes">All notes</button>
        </div>` : "";
}

function privateNoteHtml(n) {
    return `
        <div class="hub-note ${n.pinned ? "is-pinned" : ""}" data-note="${esc(n.id)}">
            <div class="hub-note-meta">
                <span>${esc(noteDate(n.createdAt))}${toMillis(n.updatedAt) - toMillis(n.createdAt) > 60000 ? " · edited" : ""}</span>
                ${n.pinned ? `<span class="hub-note-pin">${icon("pin")} Pinned</span>` : ""}
            </div>
            <p class="hub-note-text">${esc(n.text)}</p>
            <div class="hub-note-actions">
                <button type="button" class="hub-link-btn" data-note-action="pin">${n.pinned ? "Unpin" : "Pin to Overview"}</button>
                <button type="button" class="hub-link-btn" data-note-action="edit">Edit</button>
                <button type="button" class="hub-link-btn is-danger" data-note-action="delete">Delete</button>
            </div>
        </div>`;
}

function updateHtml(u) {
    const read = toMillis(u.readAt);
    return `
        <div class="hub-note" data-update="${esc(u.id)}">
            <div class="hub-note-meta">
                <span>Sent ${esc(noteDate(u.createdAt))}</span>
                <span class="hub-pill ${read ? "" : "is-new"}">${read ? `Read ${esc(shortDate(new Date(read).toISOString().slice(0, 10)))}` : "Not read yet"}</span>
            </div>
            <p class="hub-note-text">${renderEmojiText(esc(u.text))}</p>
            <div class="hub-note-actions">
                <button type="button" class="hub-link-btn is-danger" data-update-action="delete">${read ? "Delete" : "Unsend"}</button>
            </div>
        </div>`;
}

function renderNotes() {
    const first = firstName();
    const notes = record.privateNotes;
    const updates = record.updates;
    const off = `<p class="clients-card-note">Couldn't load these right now. If this keeps happening, the new security rules may not be published yet.</p>`;

    $("hubNotes").innerHTML = `
        <div class="clients-card hub-private">
            <div class="hub-about-head">
                <h2>${icon("lock")} Private notes</h2>
                <span class="hub-private-tag">${icon("lock")} Only you can see these</span>
            </div>
            <p class="clients-card-note">For you: how they respond to training, family details, things to remember. ${esc(first)} never sees these.</p>
            ${notes === undefined ? off : `
            <form class="hub-reply" id="noteForm">
                <label class="sr-only" for="noteText">New private note</label>
                <textarea id="noteText" rows="3" maxlength="4000" placeholder="A private note about ${esc(first)}..."></textarea>
                <div class="hub-reply-actions">
                    <button type="submit" class="clients-btn-primary">${icon("lock")} Save private note</button>
                    <label class="hub-check"><input type="checkbox" id="notePinned"> Pin to Overview</label>
                    <span class="clients-msg" hidden></span>
                </div>
            </form>
            <div class="hub-notes-list" id="noteList">
                ${notes.length ? notes.map(privateNoteHtml).join("") : `<p class="clients-card-note">No private notes yet.</p>`}
            </div>`}
        </div>

        <div class="clients-card hub-shared">
            <div class="hub-about-head">
                <h2>${icon("send")} Updates to ${esc(first)}</h2>
                <span class="hub-shared-tag">${icon("eye")} ${esc(first)} sees these</span>
            </div>
            <p class="clients-card-note">Shows in their app under From Your Coach, and they get an email saying you sent something.</p>
            ${updates === undefined ? off : `
            <form class="hub-reply" id="updateForm">
                <label class="sr-only" for="updateText">New update for ${esc(first)}</label>
                <textarea id="updateText" data-emoji="quick" rows="3" maxlength="2000" placeholder="Great week, ${esc(first)}! Next week we..."></textarea>
                <div class="hub-reply-actions">
                    <button type="submit" class="clients-btn-primary">${icon("send")} Send to ${esc(first)}</button>
                    <span class="clients-msg" hidden></span>
                </div>
            </form>
            <div class="hub-notes-list" id="updateList">
                ${updates.length ? updates.map(updateHtml).join("") : `<p class="clients-card-note">No updates sent yet.</p>`}
            </div>`}
        </div>`;

    wireNotes();
}

function showMsg(form, text, error = true) {
    const msg = form.querySelector(".clients-msg");
    msg.textContent = text;
    msg.className = `clients-msg${error ? " clients-msg-error" : ""}`;
    msg.hidden = false;
}

function afterNotesChange(focusId) {
    summarize();
    renderAll();
    selectTab("notes");
    if (focusId) $(focusId)?.focus();
}

function wireNotes() {
    const noteForm = $("noteForm");
    noteForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const text = $("noteText").value.trim();
        if (!text) { showMsg(noteForm, "Write the note first."); return; }
        const btn = noteForm.querySelector("button");
        btn.disabled = true;
        try {
            const note = await addPrivateNote(clientUid, text, $("notePinned").checked);
            record.privateNotes = [note, ...record.privateNotes];
            sortNotes();
            afterNotesChange();
            toast("Private note saved");
        } catch (error) {
            console.error(error);
            showMsg(noteForm, "Couldn't save that — try again.");
            btn.disabled = false;
        }
    });

    const updateForm = $("updateForm");
    updateForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const text = $("updateText").value.trim();
        if (!text) { showMsg(updateForm, "Write the update first."); return; }
        const btn = updateForm.querySelector("button");
        btn.disabled = true;
        try {
            const update = await sendClientUpdate(clientUid, text, {
                clientName: displayName(),
                clientEmail: record.profile?.email || record.link?.clientEmail
            });
            record.updates = [update, ...record.updates];
            afterNotesChange();
            toast(`Update sent to ${firstName()}`);
        } catch (error) {
            console.error(error);
            showMsg(updateForm, "Couldn't send that — try again.");
            btn.disabled = false;
        }
    });

    $("noteList")?.addEventListener("click", async event => {
        const btn = event.target.closest("[data-note-action]");
        if (!btn) return;
        const row = btn.closest("[data-note]");
        const note = record.privateNotes.find(n => n.id === row.dataset.note);
        if (!note) return;
        const action = btn.dataset.noteAction;
        try {
            if (action === "delete") {
                if (!(await sbConfirm("This can't be undone.", { title: "Delete this private note?", confirmLabel: "Delete", danger: true }))) return;
                await deletePrivateNote(note.id);
                record.privateNotes = record.privateNotes.filter(n => n !== note);
                afterNotesChange();
            } else if (action === "pin") {
                await updatePrivateNote(note.id, { text: note.text, pinned: !note.pinned });
                note.pinned = !note.pinned;
                note.updatedAt = Date.now();
                sortNotes();
                afterNotesChange();
            } else if (action === "edit") {
                editNote(row, note);
            }
        } catch (error) {
            console.error(error);
            toast(friendlyError(error, "change that note"), { type: "error" });
        }
    });

    $("updateList")?.addEventListener("click", async event => {
        const btn = event.target.closest("[data-update-action]");
        if (!btn) return;
        const update = record.updates.find(u => u.id === btn.closest("[data-update]").dataset.update);
        if (!update) return;
        const question = update.readAt
            ? "It disappears from their app too."
            : "It disappears from their app. The email saying you sent something has already gone, but it doesn't include your message.";
        if (!(await sbConfirm(question, { title: update.readAt ? "Delete this update?" : "Unsend this update?", confirmLabel: update.readAt ? "Delete" : "Unsend", danger: true }))) return;
        try {
            await deleteClientUpdate(update.id);
            record.updates = record.updates.filter(u => u !== update);
            afterNotesChange();
        } catch (error) {
            console.error(error);
            toast(friendlyError(error, "delete that update"), { type: "error" });
        }
    });
}

function editNote(row, note) {
    row.querySelector(".hub-note-text").outerHTML = `
        <form class="hub-reply hub-note-edit">
            <textarea rows="3" maxlength="4000" aria-label="Edit note">${esc(note.text)}</textarea>
            <div class="hub-reply-actions">
                <button type="submit" class="clients-btn-primary">Save</button>
                <button type="button" class="clients-btn-secondary" data-cancel>Cancel</button>
                <span class="clients-msg" hidden></span>
            </div>
        </form>`;
    row.querySelector(".hub-note-actions").hidden = true;
    const form = row.querySelector("form");
    const area = form.querySelector("textarea");
    area.focus();
    form.querySelector("[data-cancel]").addEventListener("click", () => renderNotes());
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const text = area.value.trim();
        if (!text) { showMsg(form, "A note can't be empty — delete it instead."); return; }
        form.querySelector("button").disabled = true;
        try {
            await updatePrivateNote(note.id, { text, pinned: note.pinned });
            note.text = text;
            note.updatedAt = Date.now();
            afterNotesChange();
        } catch (error) {
            console.error(error);
            showMsg(form, "Couldn't save that — try again.");
            form.querySelector("button").disabled = false;
        }
    });
}

function sortNotes() {
    record.privateNotes.sort((a, b) => (b.pinned === true) - (a.pinned === true) || toMillis(b.createdAt) - toMillis(a.createdAt));
}

// ---- Workouts: planned vs. actual, reply on each ----

const RPE_WORDS = { 1: "very easy", 2: "easy", 3: "easy", 4: "comfortable", 5: "steady", 6: "moderate", 7: "hard", 8: "very hard", 9: "near max", 10: "all out" };

// The plan day a result was logged against (for planned details).
function plannedDay(result) {
    const h = (record.coachingPlans || []).find(p => p.id === result.planId);
    return h?.plan?.weeks?.flatMap(w => w.days || []).find(d => d.date === result.date) || null;
}

// The coach's own words for the day, or "5 mi easy run" when the session is just the type.
function plannedText(r, day) {
    const session = String(day?.session || "").trim();
    if (session && session.toLowerCase() !== String(day?.type || "").toLowerCase()) return session;
    const miles = Number(day?.miles ?? r.plannedMiles) || 0;
    return `${miles ? `${miles} mi ` : ""}${String(r.title || "run").toLowerCase()}`;
}

// A strength log: every exercise planned vs lifted.
function strengthResultHtml(r, day) {
    const lift = day?.strength;
    const cmp = lift ? compareStrength(lift, r.exercises) : null;
    const fresh = !r.coachComment;
    return `
        <div class="clients-card hub-wo is-strength${r.pain && fresh ? " is-pain" : ""}${fresh ? " is-new" : ""}" data-result="${esc(r.id)}">
            <div class="hub-wo-head">
                <strong>${esc(r.title || "Strength")}</strong>
                <span class="pw-meta">${esc(shortDate(r.date))} · strength</span>
                <span class="hub-pill${r.status === "skipped" ? " is-skipped" : ""}">${r.status === "skipped" ? "Skipped" : "Done"}</span>
            </div>
            ${r.status === "completed" && cmp ? `
                <div class="hub-wo-stats">
                    <div><span>Sets</span><strong>${cmp.doneSets}/${cmp.plannedSets}</strong><small>${cmp.pct}% of plan</small></div>
                    <div><span>Time</span><strong>${r.durationSec ? formatDuration(r.durationSec) : "—"}</strong></div>
                    <div><span>Effort</span><strong>${r.rpe ? `${r.rpe}/10` : "—"}</strong>${r.rpe ? `<small>${esc(RPE_WORDS[r.rpe])}</small>` : ""}</div>
                </div>
                ${strengthTableHtml(cmp)}
                ${cmp.highlights.length ? `<ul class="hub-wo-highlights">${cmp.highlights.map(h => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}` : ""}
            ${r.status === "completed" && !cmp ? `<p class="hub-wo-planned"><span>Logged</span> ${esc((r.exercises || []).map(e => `${e.name} (${e.sets?.length || 0} sets)`).join(", "))}</p>` : ""}
            ${r.pain ? `<div class="hub-injury">${icon("alertTriangle")}<span><strong>Pain or discomfort:</strong> ${esc(r.painNote || "no details")}</span></div>` : ""}
            ${r.note ? `<p class="hub-quote">"${renderEmojiText(esc(r.note))}"</p>` : ""}
            ${replyFormHtml(r)}
        </div>`;
}

function replyFormHtml(r) {
    return `
            <form class="hub-reply" data-reply="${esc(r.id)}">
                <label class="clients-card-note" for="wo-${esc(r.id)}">Your reply (${esc(firstName())} sees it on this workout)</label>
                <textarea id="wo-${esc(r.id)}" data-emoji="quick" rows="2" maxlength="1000" placeholder="${r.kind === "strength" ? "Nice jump on the deadlift..." : "Good control on the last rep..."}">${esc(r.coachComment || "")}</textarea>
                <div class="hub-reply-actions">
                    <button type="submit" class="clients-btn-primary">${r.coachComment ? "Update reply" : "Reply"}</button>
                    <span class="clients-msg" hidden></span>
                </div>
            </form>`;
}

function workoutResultHtml(r) {
    const day = plannedDay(r);
    if (isStrengthResult(r)) return strengthResultHtml(r, day);
    const cmp = compareRun({ miles: r.plannedMiles || day?.miles, workout: day?.workout }, { distance: r.distance, durationSec: r.durationSec });
    const vs = { on: "on target pace", faster: "faster than target", slower: "slower than target" }[cmp.paceVsTarget];
    const fresh = !r.coachComment;
    return `
        <div class="clients-card hub-wo${r.pain && fresh ? " is-pain" : ""}${fresh ? " is-new" : ""}" data-result="${esc(r.id)}">
            <div class="hub-wo-head">
                <strong>${esc(r.title || "Workout")}</strong>
                <span class="pw-meta">${esc(shortDate(r.date))}</span>
                <span class="hub-pill${r.status === "skipped" ? " is-skipped" : ""}">${r.status === "skipped" ? "Skipped" : "Done"}</span>
            </div>
            <p class="hub-wo-planned"><span>Planned</span> ${esc(plannedText(r, day))}</p>
            ${r.status === "completed" ? `
                <div class="hub-wo-stats">
                    <div><span>Ran</span><strong>${r.distance ? `${r.distance} mi` : "—"}</strong>${cmp.distancePct ? `<small>${cmp.distancePct}% of plan</small>` : ""}</div>
                    <div><span>Time</span><strong>${r.durationSec ? formatDuration(r.durationSec) : "—"}</strong></div>
                    <div><span>Pace</span><strong>${cmp.pace || "—"}</strong>${vs ? `<small>${esc(vs)}</small>` : ""}</div>
                    <div><span>Effort</span><strong>${r.rpe ? `${r.rpe}/10` : "—"}</strong>${r.rpe ? `<small>${esc(RPE_WORDS[r.rpe])}</small>` : ""}</div>
                </div>` : ""}
            ${r.pain ? `<div class="hub-injury">${icon("alertTriangle")}<span><strong>Pain or discomfort:</strong> ${esc(r.painNote || "no details")}</span></div>` : ""}
            ${r.note ? `<p class="hub-quote">"${renderEmojiText(esc(r.note))}"</p>` : ""}
            ${replyFormHtml(r)}
        </div>`;
}

function renderWorkouts() {
    const results = record.results || [];
    const badge = $("hubWorkoutBadge");
    const waiting = results.filter(r => !r.coachComment && (r.pain || r.date >= isoDate(new Date(Date.now() - 7 * 86400000)))).length;
    badge.hidden = !waiting;
    badge.textContent = waiting || "";
    const hasPlan = (record.coachingPlans || []).some(p => p.status === "active");
    $("hubWorkouts").innerHTML = results.length
        ? results.map(workoutResultHtml).join("")
        : `<div class="clients-card"><div class="sb-empty"><span class="sb-empty-icon">${icon("activity")}</span>
            <strong class="sb-empty-title">No workouts logged yet</strong>
            <p class="sb-empty-text">${hasPlan ? `When ${esc(firstName())} logs a run from your plan — distance, time, effort, anything that hurt — it shows up here to reply to.` : `Publish a plan from the Plan tab, and ${esc(firstName())}'s logged runs show up here.`}</p></div></div>`;

    $("hubWorkouts").querySelectorAll("form[data-reply]").forEach(form => form.addEventListener("submit", async event => {
        event.preventDefault();
        const r = results.find(x => x.id === form.dataset.reply);
        const text = form.querySelector("textarea").value.trim();
        if (!text) return;
        const btn = form.querySelector("button");
        btn.disabled = true;
        try {
            await commentOnResult(r.id, text);
            r.coachComment = text;
            r.coachCommentAt = Date.now();
            summarize();
            renderAll();
            selectTab("workouts");
            toast(`Reply saved. ${firstName()} sees it on the workout.`);
        } catch (error) {
            console.error(error);
            const msg = form.querySelector(".clients-msg");
            msg.textContent = friendlyError(error, "save that");
            msg.className = "clients-msg clients-msg-error";
            msg.hidden = false;
            btn.disabled = false;
        }
    }));
}

function summarize() {
    const today = isoDate(new Date());
    const plans = summarizePlans(record.shared, today, record.coachingPlans || [], record.results || []);
    const sessions = summarizeSessions(record.requests, today);
    const checkins = summarizeCheckins(record.checkins, today);
    record.summary = {
        plans, sessions, checkins,
        attention: needsAttention({ profile: record.profile, plans, sessions, checkins, today, record: record.record, coachingPlans: record.coachingPlans || [], results: record.results || [], changes: record.changes || [], healthReviewedAt: healthReviewed()[record.link.clientUid] || 0, requests: record.requests || [] }),
        timeline: buildTimeline({ ...record, today })
    };
}

function renderAll() {
    renderHeader();
    renderGlance();
    renderAttention();
    renderPinned();
    renderAbout();
    renderNext();
    renderProgress();
    renderTimeline();
    renderHistory();
    renderApplication();
    renderPackages();
    renderActions();
    renderCheckins();
    renderSessions();
    renderWorkouts();
    renderChanges();
    renderNotes();
    renderProfileFresh();
    import("./icons.js").then(m => m.hydrate());
}

// ---- Services (what they signed up for; their menu follows it) ----

async function editServices() {
    const { SERVICES, setClientServices } = await import("./userProfile.js");
    const current = new Set(record.profile?.services || []);
    const requested = new Set(record.profile?.requestedServices || []);
    // Nothing assigned yet: start from what they asked for when they applied.
    const checked = current.size ? current : requested;
    const d = document.createElement("dialog");
    d.className = "sb-dialog hub-services-dialog";
    d.innerHTML = `
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">${esc(firstName())}'s services</h2>
            <p class="sb-dialog-message">What they're coached for. Their app's menu follows this: running, strength or online coaching opens the training pages (Plan, Train, Health, Habits); soccer opens booking.</p>
            ${requested.size ? `<p class="sb-dialog-message">They asked for: ${esc(SERVICES.filter(s => requested.has(s.value)).map(s => s.label).join(", "))}.</p>` : ""}
            <div class="hub-services-checks">
                ${SERVICES.map(s => `<label class="pw-check"><input type="checkbox" name="services" value="${esc(s.value)}"${checked.has(s.value) ? " checked" : ""}><span>${esc(s.label)}</span></label>`).join("")}
            </div>
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Save</button>
            </div>
        </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", async ev => {
        ev.preventDefault();
        const services = new FormData(ev.target).getAll("services").map(String);
        const btn = ev.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
            await setClientServices(clientUid, services);
            record.profile = { ...(record.profile || {}), services };
            d.close();
            summarize();
            renderAll();
            toast(`Saved. ${firstName()}'s menu updates the next time they open Southbound.`);
        } catch (error) {
            const err = d.querySelector('[data-el="error"]');
            err.textContent = friendlyError(error, "save their services");
            err.hidden = false;
            btn.disabled = false;
        }
    });
    d.showModal();
}
$("hubServices").addEventListener("click", event => {
    if (event.target.closest('[data-act="services"]')) editServices();
});

// ---- Load ----

listenForAuth(async user => {
    if (!user) return; // js/loadHeader.js sends signed-out visitors away
    if (!clientUid) {
        $("hubLoading").hidden = true;
        $("hubMissing").hidden = false;
        return;
    }
    try {
        record = await loadClientRecord(clientUid);
    } catch (error) {
        console.error("Loading client failed:", error);
        record = null;
    }
    $("hubLoading").hidden = true;
    if (!record) {
        $("hubMissing").hidden = false;
        import("./icons.js").then(m => m.hydrate());
        return;
    }
    summarize();
    $("hubBody").hidden = false;
    renderAll();
    const requested = new URLSearchParams(location.search).get("tab");
    if (requested) selectTab(requested);
    // Their application and every plan version, for History (after the page is up).
    const extras = await loadHistoryExtras(record).catch(() => ({ application: null, planVersions: {} }));
    record.application = extras.application;
    record.planVersions = extras.planVersions;
    record.historyExtras = true;
    summarize();
    renderTimeline();
    renderHistory();
    renderApplication();
    import("./icons.js").then(m => m.hydrate());
});
