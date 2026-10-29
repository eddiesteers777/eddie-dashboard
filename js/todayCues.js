/* ==========================================
   Southbound — Today's small cues (pure, no DOM or storage)

   Each one is shown only when the data says it's real (Eddie, 2026-10-29):
     - pickTodayRun: today's watch run that still has no effort answer
       (the post-run check-in strip, js/checkinStrip.js). No run, no strip.
     - streakAtRisk: a habit streak (days with every habit done, the
       Habits page's own rule) that today hasn't kept yet. No streak, no cue.
     - restDayAction: what a plan says to do on its rest day (the day's
       session text, e.g. "Walk 20 min + mobility"). Nothing written, nothing shown.
   Tested in tests/todayCues.test.mjs.
========================================== */

const pad = n => String(n).padStart(2, "0");

/** "YYYY-MM-DD" one calendar day before/after `iso` (local, no time zone drift). */
export function shiftDay(iso, days) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The run to check in on today: from effort prompts (js/athleteLedger.js
 * effortPrompts, newest first), the newest one dated today, else null.
 */
export function pickTodayRun(prompts, today) {
    return (prompts || []).find(s => s && s.date === today) || null;
}

/** Every habit on the list was checked off that day (and there is a list). */
export function dayComplete(entries, day, habits) {
    const list = habits || [];
    if (!list.length) return false;
    const done = entries?.[day] || {};
    return list.every(h => done[h.id]);
}

/**
 * The current streak, the Habits page's way (js/habits.js currentStreak):
 * complete days in a row, ending today if today is complete, else yesterday.
 */
export function habitStreak(entries, habits, today, { limit = 3660 } = {}) {
    let day = dayComplete(entries, today, habits) ? today : shiftDay(today, -1);
    let streak = 0;
    while (streak < limit && dayComplete(entries, day, habits)) {
        streak++;
        day = shiftDay(day, -1);
    }
    return streak;
}

/**
 * A streak that today could still break: at least `min` complete days up to
 * yesterday and today not complete yet. Returns its length, or 0 (no cue).
 */
export function streakAtRisk(entries, habits, today, { min = 2 } = {}) {
    if (dayComplete(entries, today, habits)) return 0;
    const streak = habitStreak(entries, habits, today);
    return streak >= min ? streak : 0;
}

const BARE_REST = /^\s*(rest( day)?|off|day off|none|-+)\s*\.?\s*$/i;

/**
 * What the plan says to do on a rest day: the session text of a "rest" day
 * on `date` in any plan ({ generatedPlan: { weeks: [{ days: [{ date, type, session }] }] } }).
 * "" when the day has nothing written (or just says "Rest").
 */
export function restDayAction(plans, date) {
    for (const plan of plans || []) {
        for (const week of plan?.generatedPlan?.weeks || []) {
            for (const day of week?.days || []) {
                if (day?.date !== date || (day.type && day.type !== "rest")) continue;
                const text = String(day.session || "").trim();
                if (text && !BARE_REST.test(text)) return text;
            }
        }
    }
    return "";
}

/** The same for one day of the coach's own marathon plan (js/marathonData.js): a 0-mile day's session text. */
export function restTextOf(dayData) {
    if (!dayData || Number(dayData.miles) > 0) return "";
    const text = String(dayData.session || "").trim();
    return text && !BARE_REST.test(text) ? text : "";
}
