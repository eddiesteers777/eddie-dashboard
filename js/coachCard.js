/* ==========================================
   Southbound — "From your coach" (client Today card)

   What a client needs from their coach at a glance, right under
   Today's card (Phase 8): a plan to look at, new updates, this week's
   check-in (due Sunday; js/todayGlance.js), the coach's reply while
   it's news, notes from their last session, requests still waiting.
   Their next session is Today's NEXT line, not repeated here. Only
   reads data the client already has access to under firestore.rules
   (their own booking requests, check-ins and coach link). Rendered by
   js/app.js for non-coach accounts.
========================================== */

import { listMyBookingRequests, SESSION_TYPES } from "./scheduling.js";
import { listMyCheckins } from "./checkins.js";
import { checkinRows } from "./todayGlance.js";
import { listMyCoaches } from "./coachAccess.js";
import { getMyProfile } from "./userProfile.js";
import { getMyClientRecord } from "./clientRecords.js";
import { essentialsDone, ESSENTIALS } from "./intakeFlow.js";
import { listMyUpdates } from "./clientNotes.js";
import { listMyPlans } from "./coachingPlans.js";
import { awaitingAck, noticeVersionOf } from "./planWindow.js";
import { icon } from "./icons.js";
import { renderEmojiText } from "./emoji.js";
import { latestSessionNotes } from "./sessionModel.js";
import { profileAccess, meets } from "./navAccess.js";

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function localIso(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// "2026-10-03" -> "Sat, Oct 3" (or "Today" / "Tomorrow")
function niceDate(iso) {
    const today = localIso();
    const tomorrow = localIso(new Date(Date.now() + 86400000));
    if (iso === today) return "Today";
    if (iso === tomorrow) return "Tomorrow";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const sessionLabel = request =>
    `${SESSION_TYPES.find(t => t.value === request.sessionType)?.label || "Session"}${request.label ? ` · ${request.label}` : ""}`;

function row({ iconName, color, title, detail, note, link }) {
    return `
        <a href="${link}" class="eos-coach-row">
            <span class="eos-coach-row-icon" style="color:${color}">${icon(iconName)}</span>
            <span class="eos-coach-row-text">
                <strong>${esc(title)}</strong>
                ${detail ? `<span>${esc(detail)}</span>` : ""}
                ${note ? `<em>"${renderEmojiText(esc(note))}"</em>` : ""}
            </span>
            <span class="eos-coach-row-chevron">${icon("chevronRight")}</span>
        </a>`;
}

// Returns { upcomingSessions } so Today can show it in its stat row.
export async function renderCoachCard(container) {
    if (!container) return null;

    const [coaches, requests, checkins, profile, record, updates, plans] = await Promise.all([
        listMyCoaches().catch(() => []),
        listMyBookingRequests().catch(() => []),
        listMyCheckins().catch(() => []),
        getMyProfile().catch(() => null),
        // undefined = couldn't read (don't nag), null = not filled in yet
        getMyClientRecord().catch(() => undefined),
        listMyUpdates().catch(() => []),
        listMyPlans().catch(() => [])
    ]);

    const coach = coaches[0];
    const today = localIso();
    const rows = [];
    // What this client has (read from the profile already loaded above).
    const access = await profileAccess();
    const can = capability => meets(capability, access);

    // ---- A plan the coach published and they haven't said "Got it" to ----
    for (const plan of plans.filter(awaitingAck)) {
        rows.push(row({
            iconName: "calendar",
            color: "var(--primary)",
            title: noticeVersionOf(plan) > 1 ? "Your plan was updated" : "Your plan is ready",
            detail: `${plan.name}${plan.changes?.length ? ` · ${plan.changes.length} change${plan.changes.length === 1 ? "" : "s"}` : ""}`,
            note: plan.coachNote ? (plan.coachNote.length > 140 ? `${plan.coachNote.slice(0, 140).trim()}…` : plan.coachNote) : "",
            link: `plan.html?plan=${encodeURIComponent(plan.id)}`
        }));
    }

    // ---- Updates from the coach (updates.html marks them read) ----
    const unread = updates.filter(u => !u.readAt);
    if (unread.length) {
        rows.push(row({
            iconName: "send",
            color: "var(--primary)",
            title: unread.length === 1 ? `New update from ${unread[0].coachName || "your coach"}` : `${unread.length} new updates from your coach`,
            detail: "",
            note: unread[0].text.length > 140 ? `${unread[0].text.slice(0, 140).replace(/:sb_[a-z_]*$/, "").trim()}…` : unread[0].text,
            link: "updates.html"
        }));
    }

    // ---- Weekly check-in (due by Sunday) and the coach's reply ----
    // Only for clients who have one (soccer-only clients do while their
    // coach has given them a plan; js/services.js). "Due Sunday" early in
    // the week and "sent" wait at the end of the card; a check-in due now
    // or a fresh reply comes right after the updates.
    const CHECKIN_LOOK = {
        "checkin-due": { iconName: "star", color: "var(--amber)" },
        "checkin-soon": { iconName: "star", color: "var(--muted)" },
        "checkin-sent": { iconName: "check", color: "var(--green)" },
        "checkin-reply": { iconName: "star", color: "var(--primary)" }
    };
    const checkinNow = [], checkinLater = [];
    if (coach && can("checkins")) {
        for (const r of checkinRows(today, checkins)) {
            (r.soon ? checkinLater : checkinNow).push(row({ ...CHECKIN_LOOK[r.kind], title: r.title, detail: r.detail, note: r.note || "", link: "checkin.html" }));
        }
    }
    rows.push(...checkinNow);

    // ---- Sessions ----
    // The next one is Today's NEXT line; what's here is what the coach
    // said about the last one, and requests still waiting.
    const upcoming = requests
        .filter(r => r.status === "approved")
        .flatMap(r => (r.dates || []).filter(d => d >= today).map(date => ({ ...r, date })));

    // Notes from the most recent session that has happened (its session
    // log, js/sessionModel.js; an older booking's single note otherwise).
    const lastNotes = latestSessionNotes(requests, today);
    if (lastNotes) {
        rows.push(row({
            iconName: "clipboard",
            color: "var(--primary)",
            title: "Notes from your last session",
            detail: `${sessionLabel(lastNotes.request)} · ${niceDate(lastNotes.date)}`,
            note: lastNotes.text.replace(/\n/g, " · "),
            link: "schedule.html"
        }));
    }

    const waiting = requests.filter(r => r.status === "requested").length;
    if (waiting) {
        rows.push(row({
            iconName: "clock",
            color: "var(--amber)",
            title: `${waiting} session request${waiting === 1 ? "" : "s"} waiting on your coach`,
            detail: "You'll get an email when it's answered",
            link: "schedule.html"
        }));
    }

    // ---- Profile (entered once, remembered) ----
    // Until the essentials are answered (js/intakeFlow.js), with how far
    // they got, so it reads as nearly done rather than a chore.
    const answered = essentialsDone(record);
    if (coach && record !== undefined && answered < ESSENTIALS.length) {
        rows.push(row({
            iconName: "user",
            color: "var(--primary)",
            title: answered ? "Finish your profile" : "Tell your coach about you",
            detail: answered
                ? `${answered} of ${ESSENTIALS.length} quick questions done — pick up where you left off`
                : `${ESSENTIALS.length} quick questions, mostly taps — about a minute`,
            link: "profile.html"
        }));
    }

    rows.push(...checkinLater);

    if (!rows.length) {
        const pending = profile?.status === "pending";
        container.innerHTML = `
            <div class="eos-coach-empty">
                ${pending
                    ? `Your account is waiting for approval. Once your coach approves it, your sessions, plan and weekly check-ins show up here. While you wait, <a href="profile.html">tell your coach about you</a>.`
                    : coach
                        ? `Nothing new from your coach right now.${[
                            can("sessions") ? ` <a href="schedule.html">Book a session</a>` : "",
                            can("checkins") ? (can("sessions") ? ` or <a href="checkin.html">check in</a>` : ` <a href="checkin.html">Check in</a>`) : ""
                        ].join("")}${can("sessions") || can("checkins") ? " any time." : ""}`
                        : `You're not connected to your coach yet. <a href="clients.html?tab=share">Connect with your coach</a> and your sessions and weekly check-ins show up here.`}
            </div>`;
        return { upcomingSessions: upcoming.length };
    }

    container.innerHTML = rows.join("");
    return { upcomingSessions: upcoming.length };
}
