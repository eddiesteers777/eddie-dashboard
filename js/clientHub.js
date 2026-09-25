/* ==========================================
   Southbound — Client Hub (client.html?uid=...)

   One home for a client, coach side: who they are, where their plan
   stands, what's next, what needs attention, and recent activity, with
   tabs for their Plan (the shared plan editor), Check-ins (reply
   inline) and Sessions.

   Nothing new is stored: it reads the existing coachLinks,
   userProfiles, sharedPlans, checkins and bookingRequests through
   js/clientDirectory.js, and summarizes with js/clientSummary.js.
   Coach-only (COACH_ONLY_PAGES in js/loadHeader.js); firestore.rules
   only let a linked coach read any of this anyway.
========================================== */

import { listenForAuth } from "./auth.js";
import { loadClientRecord } from "./clientDirectory.js";
import {
    summarizePlans, summarizeSessions, summarizeCheckins, needsAttention,
    buildTimeline, serviceLabels, isoDate, shortDate, toMillis
} from "./clientSummary.js";
import { SESSION_TYPES } from "./scheduling.js";
import { reviewCheckin } from "./checkins.js";
import { sendCheckinReviewedEmail } from "./emailNotify.js";
import { icon } from "./icons.js";
import { FIELDS, displayValue, athleteDisplayName } from "./clientRecordSchema.js";

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
    document.querySelectorAll(".hub-page .clients-panel").forEach(p => { p.hidden = p.dataset.panel !== name; });
    if (name === "plan" && !planMounted && record) {
        planMounted = true;
        import("./planEditor.js").then(({ mountPlanEditor }) => mountPlanEditor($("hubPlan"), {
            clientUid,
            clientName: displayName(),
            focusPlanId: record.summary.plans.primary?.id,
            currentDate: isoDate(new Date())
        })).then(() => import("./icons.js").then(m => m.hydrate()));
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
            }
        }));
    }
    const url = new URL(location.href);
    url.searchParams.set("tab", name);
    history.replaceState(null, "", url);
}

document.querySelectorAll(".hub-tabs .clients-tab").forEach(t => t.addEventListener("click", () => selectTab(t.dataset.tab)));
document.addEventListener("click", event => {
    const go = event.target.closest("[data-go-tab]");
    if (go) { event.preventDefault(); selectTab(go.dataset.goTab); window.scrollTo({ top: 0 }); }
});

const displayName = () => record?.profile?.displayName || record?.link?.clientName || "Client";

// ---- Render ----

function renderHeader() {
    const { profile, link } = record;
    const name = displayName();
    document.title = `${name} | Southbound`;
    $("hubAvatar").textContent = name.slice(0, 1).toUpperCase();
    $("hubName").textContent = name;
    const services = serviceLabels(profile?.services || []);
    $("hubServices").textContent = services.length ? services.join(" · ") : "No services assigned yet";
    const since = toMillis(profile?.approvedAt) || toMillis(link?.linkedAt);
    const status = profile?.status && profile.status !== "active" ? `${profile.status[0].toUpperCase()}${profile.status.slice(1)} · ` : "Active · ";
    $("hubSince").textContent = status + (since ? `Client since ${new Date(since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Client");
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
        const target = [rec.targetEvent, rec.targetDate ? displayValue(FIELDS.find(f => f.key === "targetDate"), rec.targetDate) : ""].filter(Boolean).join(", ");
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
    if (!rec) { $("hubAbout").innerHTML = ""; return; }
    const f = key => FIELDS.find(x => x.key === key);
    const val = key => displayValue(f(key), rec[key]);
    const rows = [
        ["Aiming for", [rec.targetEvent, val("targetDate")].filter(Boolean).join(", ")],
        ["Sport", [val("primarySport"), rec.teamOrLevel].filter(Boolean).join(" · ")],
        ["Training now", [rec.currentTraining, val("weeklyMileage")].filter(Boolean).join(" · ")],
        ["Available", [val("availabilityDays"), rec.availabilityNotes].filter(Boolean).join(" · ")],
        ["Other goals", rec.secondaryGoals],
        ["Wants from a coach", rec.coachingWants],
        ["What's worked", rec.workedBefore],
        ["What hasn't", rec.notWorked]
    ].filter(([, v]) => v);
    $("hubAbout").innerHTML = `
        <div class="clients-card hub-about">
            <div class="hub-about-head">
                <h2>About ${esc(athleteDisplayName(rec, displayName()).split(" ")[0])}</h2>
                <button type="button" class="clients-btn-secondary" data-go-tab="profile">Full profile</button>
            </div>
            ${rec.injuries ? `<div class="hub-injury">${icon("alertTriangle")}<span><strong>Injuries / limits:</strong> ${esc(rec.injuries)}</span></div>` : ""}
            ${rows.length ? `<dl class="hub-facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
        </div>`;
}

function renderProfileNote() {
    const rec = record.record;
    const note = $("hubProfileNote");
    if (rec === undefined) {
        note.textContent = "Couldn't load their profile right now. If this keeps happening, the new security rules may not be published yet.";
    } else if (!rec) {
        note.textContent = "They haven't filled this in yet (they're prompted on their Today screen). You can also fill it in together here -- they'll see whatever you save.";
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
    const trains = services.some(s => ["online_coaching", "running", "strength"].includes(s));

    // Soccer-only clients have no plan or weekly check-in to speak of:
    // lead with their sessions instead.
    if (!trains && services.length) {
        const lastPast = sessions.past[0];
        $("hubGlance").innerHTML = [
            glanceItem("Next session", next ? dayName(next.date) : "None booked", next ? `${niceTime(next.startTime)} · ${sessionLabel(next)}` : "", "sessions"),
            glanceItem("Waiting on you", sessions.waiting.length ? `${sessions.waiting.length} request${sessions.waiting.length === 1 ? "" : "s"}` : "Nothing", "", "sessions"),
            glanceItem("Sessions done", String(sessions.past.length), lastPast ? `Last: ${dayName(lastPast.date)}` : "", "sessions"),
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
    const events = record.summary.timeline.slice(0, 8);
    $("hubTimeline").innerHTML = events.length
        ? events.map(e => `
            <div class="hub-timeline-item">
                <span class="hub-timeline-date">${esc(shortDate(e.date))}</span>
                <span>${esc(e.text)}</span>
            </div>`).join("")
        : `<p class="clients-card-note">No activity yet.</p>`;
}

function renderApplication() {
    const { profile } = record;
    const requested = serviceLabels(profile?.requestedServices || []);
    if (!profile?.applicationMessage && !requested.length) return;
    $("hubApplication").hidden = false;
    $("hubApplicationBody").innerHTML = `
        ${requested.length ? `<p class="clients-card-note">Asked about: ${esc(requested.join(", "))}</p>` : ""}
        ${profile.applicationMessage ? `<p class="hub-quote">"${esc(profile.applicationMessage)}"</p>` : ""}`;
}

function renderActions() {
    const email = record.profile?.email || record.link?.clientEmail;
    $("hubActions").innerHTML = `
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
            <p class="hub-quote">${c.notes ? `"${esc(c.notes)}"` : "<em>No notes.</em>"}</p>
            <form class="hub-reply" data-checkin="${esc(c.id)}">
                <label class="clients-card-note" for="reply-${esc(c.id)}">Your reply (they get it in the app and by email)</label>
                <textarea id="reply-${esc(c.id)}" rows="2" placeholder="Feedback for ${esc(displayName().split(" ")[0])}...">${esc(c.coachFeedback || "")}</textarea>
                <div class="hub-reply-actions">
                    <button type="submit" class="clients-btn-primary">${c.status === "reviewed" ? "Update reply" : "Send reply"}</button>
                    <span class="clients-msg" hidden></span>
                </div>
            </form>
        </div>`).join("")
        : `<div class="clients-card"><p class="clients-card-note">No check-ins yet. Clients send one each week from their app.</p></div>`;

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
        } catch (error) {
            console.error(error);
            msg.textContent = "Couldn't save that -- try again.";
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

function renderSessions() {
    const { upcoming, past, waiting } = record.summary.sessions;
    const badge = $("hubSessionBadge");
    badge.hidden = !waiting.length;
    badge.textContent = waiting.length || "";
    const section = (title, body, empty) => `
        <div class="clients-card">
            <h2>${title}</h2>
            ${body || `<p class="clients-card-note">${empty}</p>`}
        </div>`;
    $("hubSessions").innerHTML =
        (waiting.length ? section("Waiting on you",
            waiting.map(r => sessionRow({ ...r, date: r.dates?.[0] },
                `<span class="clients-card-note">${r.dates?.length > 1 ? `${r.dates.length} weeks · ` : ""}${r.clientNote ? `"${esc(r.clientNote)}"` : ""}</span>`)).join("")
            + `<a class="clients-btn-primary hub-inline-btn" href="schedule.html?tab=availability">Answer in Schedule</a>`, "") : "")
        + section("Upcoming", upcoming.slice(0, 12).map(o => sessionRow(o)).join(""), "No upcoming sessions booked.")
        + section("Past sessions", past.slice(0, 20).map(o => sessionRow(o)).join(""), "No past sessions yet.")
        + `<p class="clients-card-note">Session notes are added from <a href="schedule.html?tab=availability">Schedule</a> (Session Notes on an approved session).</p>`;
}

function summarize() {
    const today = isoDate(new Date());
    const plans = summarizePlans(record.shared, today);
    const sessions = summarizeSessions(record.requests, today);
    const checkins = summarizeCheckins(record.checkins, today);
    record.summary = {
        plans, sessions, checkins,
        attention: needsAttention({ profile: record.profile, plans, sessions, checkins, today, record: record.record }),
        timeline: buildTimeline(record)
    };
}

function renderAll() {
    renderHeader();
    renderGlance();
    renderAttention();
    renderAbout();
    renderNext();
    renderTimeline();
    renderApplication();
    renderActions();
    renderCheckins();
    renderSessions();
    import("./icons.js").then(m => m.hydrate());
}

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
});
