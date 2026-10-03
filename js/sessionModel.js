/* ==========================================
   Southbound — sessions: what happened at each one (pure)

   A booking (bookingRequests) is one request for one or more dates. What
   happened at each date is a session log (sessionLogs/{bookingId}_{date},
   js/sessionLogs.js): completed, no-show, cancelled, or cancelled late,
   with what they worked on and what's next. This file ties the two
   together: a request carries its logs, cancelled dates drop out of the
   dates everything else reads, and every date becomes one session with a
   state. Unit-tested in tests/sessionModel.test.mjs.
========================================== */

export const SESSION_STATUSES = [
    { value: "completed", label: "Completed" },
    { value: "no-show", label: "No-show" },
    { value: "late-cancel", label: "Cancelled late" },
    { value: "cancelled", label: "Cancelled" }
];
export const CANCELLED = ["cancelled", "late-cancel"];
export const statusLabel = value => SESSION_STATUSES.find(s => s.value === value)?.label || "";

// How far back an unlogged session still asks to be logged (the hub) and
// nags on the dashboard.
export const LOG_WINDOW_DAYS = 60;
export const NAG_DAYS = 14;

export const logId = (bookingId, date) => `${bookingId}_${date}`;

const addDays = (iso, n) => {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

/**
 * Requests with their logs: `logs` ({ date: log }), `allDates` (every
 * date booked) and `dates` without the cancelled ones, so the week,
 * Today, the coach card and the calendar skip a cancelled session with
 * no changes of their own. Requests that aren't approved are untouched.
 */
export function attachLogs(requests = [], logs = []) {
    const byBooking = new Map();
    for (const log of logs || []) {
        if (!log?.bookingId || !log.date) continue;
        if (!byBooking.has(log.bookingId)) byBooking.set(log.bookingId, {});
        byBooking.get(log.bookingId)[log.date] = log;
    }
    return (requests || []).map(r => {
        const mine = byBooking.get(r.id) || {};
        const allDates = r.allDates || r.dates || [];
        if (r.status !== "approved") return { ...r, allDates, logs: mine };
        return { ...r, allDates, logs: mine, dates: allDates.filter(d => !CANCELLED.includes(mine[d]?.status)) };
    });
}

/**
 * Every date of every approved request as one session, oldest first:
 *   { bookingId, date, startTime, endTime, sessionType, label, clientUid,
 *     clientName, coachNote, log, state }
 * state: "upcoming", "today", "to-log" (happened, not logged yet, within
 * LOG_WINDOW_DAYS), "not-logged" (older), or the log's status.
 */
export function sessionList(requests = [], today = "") {
    const out = [];
    for (const r of requests || []) {
        if (r.status !== "approved") continue;
        const logs = r.logs || {};
        for (const date of r.allDates || r.dates || []) {
            const log = logs[date] || null;
            const state = log ? log.status
                : date > today ? "upcoming"
                : date === today ? "today"
                : date >= addDays(today, -LOG_WINDOW_DAYS) ? "to-log" : "not-logged";
            out.push({
                bookingId: r.id, date, startTime: r.startTime || "", endTime: r.endTime || "",
                sessionType: r.sessionType || "", label: r.label || "", clientUid: r.clientUid,
                clientName: r.clientName || "", coachNote: r.coachNote || "", log, state
            });
        }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime)));
}

// Sessions that happened and still need logging (most recent `days`).
export function sessionsToLog(sessions = [], today = "", days = NAG_DAYS) {
    const from = addDays(today, -days);
    return sessions.filter(s => s.state === "to-log" && s.date >= from);
}

// { completed, noShow, lateCancel, cancelled, counted, line }
// counted = sessions that were on (completed + no-show + cancelled late);
// cancelled in time doesn't count against attendance.
export function attendance(sessions = []) {
    const n = status => sessions.filter(s => s.log?.status === status).length;
    const completed = n("completed"), noShow = n("no-show"), lateCancel = n("late-cancel"), cancelled = n("cancelled");
    const counted = completed + noShow + lateCancel;
    const parts = [];
    if (counted) parts.push(`Attended ${completed} of ${counted}`);
    if (noShow) parts.push(`${noShow} no-show${noShow === 1 ? "" : "s"}`);
    if (lateCancel) parts.push(`${lateCancel} cancelled late`);
    if (cancelled) parts.push(`${cancelled} cancelled`);
    return { completed, noShow, lateCancel, cancelled, counted, line: parts.join(" · ") };
}

// Two no-shows in a row among their most recent logged sessions.
export function noShowStreak(sessions = []) {
    let streak = 0;
    for (const s of [...sessions].filter(x => x.log && x.log.status !== "cancelled").reverse()) {
        if (s.log.status !== "no-show") break;
        streak += 1;
    }
    return streak;
}

// Monday of the week holding `iso`.
export function weekStart(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(y, m - 1, d);
    return addDays(iso, -((t.getDay() + 6) % 7));
}

/**
 * One week of sessions across clients, for the coach's calendar:
 * [{ date, sessions }] Monday through Sunday (days without sessions
 * included, so the week reads as a week).
 */
export function weekAgenda(sessions = [], anyDayInWeek = "") {
    const monday = weekStart(anyDayInWeek);
    return Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        return {
            date,
            sessions: sessions.filter(s => s.date === date)
                .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)) || String(a.clientName).localeCompare(String(b.clientName)))
        };
    });
}

// The client-facing words of a log, for their Schedule / Today / feed.
export function logWords(log) {
    if (!log) return "";
    return [log.workedOn ? `Worked on: ${log.workedOn}` : "", log.nextTime ? `For next time: ${log.nextTime}` : ""]
        .filter(Boolean).join("\n");
}

// The newest session with notes for the client (a log's words, or an
// older booking's single coachNote when that booking has no logs), or null.
export function latestSessionNotes(requests = [], today = "") {
    const found = [];
    for (const r of requests || []) {
        if (r.status !== "approved") continue;
        const logs = r.logs || {};
        const logged = Object.values(logs).filter(l => l.date <= today && l.status === "completed" && logWords(l));
        for (const l of logged) found.push({ request: r, date: l.date, text: logWords(l) });
        if (!Object.keys(logs).length && r.coachNote) {
            const last = (r.allDates || r.dates || []).filter(d => d <= today).sort().pop();
            if (last) found.push({ request: r, date: last, text: r.coachNote });
        }
    }
    return found.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

/**
 * The client's Schedule (Phase 8), from their own requests (with logs):
 *   upcoming  booked dates from today on, soonest first; one the coach
 *             cancelled ahead stays in the list with its log (marked)
 *   past      dates before today, newest first (with the log when there
 *             is one), at most `pastLimit`
 *   waiting   requests the coach hasn't answered
 *   declined  requests turned down in the last `declinedDays` days
 *   attendance  attendance() over every booked date
 */
export function clientSessions(requests = [], today = "", { pastLimit = 8, declinedDays = 30 } = {}) {
    const all = sessionList(requests, today);
    const since = addDays(today, -declinedDays);
    return {
        upcoming: all.filter(s => s.date >= today),
        past: all.filter(s => s.date < today).reverse().slice(0, pastLimit),
        waiting: (requests || []).filter(r => r.status === "requested"),
        declined: (requests || []).filter(r => r.status === "denied" && [...(r.allDates || r.dates || [])].sort().pop() >= since),
        attendance: attendance(all)
    };
}
