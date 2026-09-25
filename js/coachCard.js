/* ==========================================
   Southbound — "From your coach" (client Today card)

   What a client needs from their coach at a glance: their next
   session, requests still waiting, notes from their last session,
   where this week's check-in stands, and new updates. Only reads data the client
   already has access to under firestore.rules (their own booking
   requests, check-ins and coach link). Rendered by js/app.js for
   non-coach accounts.
========================================== */

import { listMyBookingRequests, SESSION_TYPES } from "./scheduling.js";
import { listMyCheckins, weekKeyFor } from "./checkins.js";
import { listMyCoaches } from "./coachAccess.js";
import { getMyProfile } from "./userProfile.js";
import { getMyClientRecord } from "./clientRecords.js";
import { isIntakeComplete } from "./clientRecordSchema.js";
import { listMyUpdates } from "./clientNotes.js";
import { listMyPlans } from "./coachingPlans.js";
import { icon } from "./icons.js";

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

// "17:30" -> "5:30 PM"
function niceTime(hhmm) {
    if (!/^\d{1,2}:\d{2}$/.test(hhmm || "")) return hhmm || "";
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
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
                ${note ? `<em>"${esc(note)}"</em>` : ""}
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

    // ---- A plan the coach published and they haven't said "Got it" to ----
    for (const plan of plans.filter(p => p.status === "active" && (p.ackVersion || 0) < p.version)) {
        rows.push(row({
            iconName: "calendar",
            color: "var(--primary)",
            title: plan.version > 1 ? "Your plan was updated" : "Your plan is ready",
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
            note: unread[0].text.length > 140 ? `${unread[0].text.slice(0, 140).trim()}…` : unread[0].text,
            link: "updates.html"
        }));
    }

    // ---- Profile (entered once, remembered) ----
    if (coach && record !== undefined && !isIntakeComplete(record)) {
        rows.push(row({
            iconName: "user",
            color: "var(--primary)",
            title: "Tell your coach about you",
            detail: "Goals, schedule, what's worked before -- about 3 minutes",
            link: "profile.html"
        }));
    }

    // ---- Sessions ----
    const upcoming = requests
        .filter(r => r.status === "approved")
        .flatMap(r => (r.dates || []).filter(d => d >= today).map(date => ({ ...r, date })))
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)));
    if (upcoming[0]) {
        const next = upcoming[0];
        rows.push(row({
            iconName: "calendar",
            color: "var(--purple)",
            title: `Next session: ${niceDate(next.date)}, ${niceTime(next.startTime)}`,
            detail: `${sessionLabel(next)}${upcoming.length > 1 ? ` · ${upcoming.length - 1} more booked` : ""}`,
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

    // Notes from the most recent session that has happened.
    const withNotes = requests
        .filter(r => r.status === "approved" && r.coachNote)
        .map(r => ({ ...r, lastDate: (r.dates || []).filter(d => d <= today).sort().pop() }))
        .filter(r => r.lastDate)
        .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
    if (withNotes[0]) {
        rows.push(row({
            iconName: "clipboard",
            color: "var(--primary)",
            title: "Notes from your last session",
            detail: `${sessionLabel(withNotes[0])} · ${niceDate(withNotes[0].lastDate)}`,
            note: withNotes[0].coachNote,
            link: "schedule.html"
        }));
    }

    // ---- Weekly check-in ----
    if (coach) {
        const thisWeek = checkins.find(c => c.weekOf === weekKeyFor());
        const lastFeedback = checkins.find(c => c.status === "reviewed" && c.coachFeedback);
        if (!thisWeek) {
            rows.push(row({
                iconName: "star",
                color: "var(--amber)",
                title: "Weekly check-in due",
                detail: "Two minutes: how did this week go?",
                link: "checkin.html"
            }));
        } else if (thisWeek.status !== "reviewed") {
            rows.push(row({
                iconName: "check",
                color: "var(--green)",
                title: "Check-in sent",
                detail: "Your coach will reply here and by email",
                link: "checkin.html"
            }));
        }
        if (lastFeedback) {
            rows.push(row({
                iconName: "star",
                color: "var(--primary)",
                title: "Latest feedback from your coach",
                detail: `Week of ${niceDate(lastFeedback.weekOf)}`,
                note: lastFeedback.coachFeedback,
                link: "checkin.html"
            }));
        }
    }

    if (!rows.length) {
        const pending = profile?.status === "pending";
        container.innerHTML = `
            <div class="eos-coach-empty">
                ${pending
                    ? `Your account is waiting for approval. Once your coach approves it, your sessions, plan and weekly check-ins show up here.`
                    : coach
                        ? `Nothing new from your coach right now. <a href="schedule.html">Book a session</a> or <a href="checkin.html">check in</a> any time.`
                        : `You're not connected to your coach yet. <a href="clients.html?tab=share">Connect with your coach</a> and your sessions and weekly check-ins show up here.`}
            </div>`;
        return { upcomingSessions: upcoming.length };
    }

    container.innerHTML = rows.join("");
    return { upcomingSessions: upcoming.length };
}
