/* ==========================================
   Southbound — what a client's progress shows

   Phase 11 step 4 (also Client Management Phase 7; replaces PR #20's
   page). Pure: which numbers and sections a client sees on My Progress
   (progress.html, js/clientProgress.js), by capability. The numbers come
   from summarizeProgress (js/clientSummary.js, the same model the
   coach's hub uses), attendance (js/sessionModel.js) and their habit
   streak (habitStreak below). Nothing new is stored or shared.
========================================== */

import { meets } from "./navAccess.js";

// [{ key, label, value, detail }] most useful first; only what this
// client does. `progress` = summarizeProgress(...), `attendance` =
// attendance(sessions in the window), `streak` = habit streak in days.
export function progressHighlights({ progress, access, attendance = null, streak = null } = {}) {
    const a = progress?.activity || {};
    const can = c => meets(c, access);
    const out = [];
    const change = progress?.trend?.milesChangePct;

    // Running and strength clients share every training page (Eddie,
    // 2026-10-03), so these follow what they've actually logged.
    if (can("running") && a.runSessions) {
        out.push({
            key: "miles", label: "Miles run", value: `${a.runMiles || 0}`,
            detail: `${a.runSessions || 0} run${a.runSessions === 1 ? "" : "s"} logged${change == null ? "" : ` · ${change > 0 ? "+" : ""}${change}% vs the 2 weeks before`}`
        });
    }
    if (can("strength") && a.strengthSessions) {
        out.push({ key: "strength", label: "Strength sessions", value: `${a.strengthSessions || 0}`, detail: `${a.strengthSets || 0} sets logged` });
    }
    if (can("plan")) {
        out.push({ key: "workouts", label: "Workouts done", value: `${a.completedWorkouts || 0}`, detail: a.skippedWorkouts ? `${a.skippedWorkouts} skipped` : "From your coach's plan" });
    }
    if (can("sessions")) {
        out.push({
            key: "sessions", label: "Sessions attended",
            value: attendance?.counted ? `${attendance.completed} of ${attendance.counted}` : `${attendance?.completed || 0}`,
            detail: attendance?.counted ? "Logged by your coach" : "Your coach logs each session"
        });
    }
    if (can("checkins")) {
        const c = progress?.checkins || {};
        out.push({ key: "checkins", label: "Check-ins", value: `${c.count || 0}`, detail: c.average ? `Average ${c.average}/5` : "Rate your week each check-in" });
    }
    if (can("habits") && streak != null) {
        out.push({ key: "streak", label: "Habit streak", value: `${streak}`, detail: streak === 1 ? "day" : "days" });
    }
    return out;
}

// Which cards the page shows.
export function progressSections(access) {
    const can = c => meets(c, access);
    return {
        week: can("plan"),
        trend: can("plan"),
        plan: can("plan"),
        sessions: can("sessions"),
        checkins: can("checkins")
    };
}

// Days in a row with at least one habit checked, from the Habits page's
// `entries` ({ "2026-10-03": { h1: true } }). Today not checked yet
// doesn't break it: counting starts from yesterday then.
export function habitStreak(entries = {}, today = new Date()) {
    const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const has = d => { const day = entries?.[key(d)]; return Boolean(day && Object.values(day).some(Boolean)); };
    const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!has(cursor)) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (has(cursor) && streak < 3650) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}
