/* ==========================================
   Southbound — "From your coach" (client Today card)

   What a client needs from their coach at a glance: their next
   session, requests still waiting, notes from their last session,
   and where this week's check-in stands. Only reads data the client
   already has access to under firestore.rules (their own booking
   requests, check-ins and coach link). Rendered by js/app.js for
   non-coach accounts.
========================================== */

import { listMyBookingRequests, SESSION_TYPES } from "./scheduling.js";
import { listMyCheckins, weekKeyFor } from "./checkins.js";
import { listMyCoaches } from "./coachAccess.js";
import { getMyProfile } from "./userProfile.js";
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

export async function renderCoachCard(container) {
    if (!container) return;

    const [coaches, requests, checkins, profile] = await Promise.all([
        listMyCoaches().catch(() => []),
        listMyBookingRequests().catch(() => []),
        listMyCheckins().catch(() => []),
        getMyProfile().catch(() => null)
    ]);

    const coach = coaches[0];
    const today = localIso();
    const rows = [];

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
                        : `Once you're linked with your coach, your sessions and weekly check-ins show up here.`}
            </div>`;
        return;
    }

    container.innerHTML = rows.join("");
}
