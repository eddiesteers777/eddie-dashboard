/* ==========================================
   Southbound — Habits page progress (pure, no DOM or storage)

   Everything the weekly bar, the progress bar and the rings show comes
   from the saved check-offs ("entries": { "YYYY-MM-DD": { habitId: true } })
   and the habit list, nothing else. The streak is the one the page and
   Today already use (js/todayCues.js: habitStreak, streakAtRisk); no
   second definition lives here. Unit-tested in tests/habitProgress.test.mjs.
========================================== */

import { shiftDay, dayComplete, habitStreak, streakAtRisk } from "./todayCues.js";

export { habitStreak, streakAtRisk };

const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** 0 = Monday ... 6 = Sunday for a "YYYY-MM-DD" key (the calendar view starts on Monday too). */
export function weekdayIndex(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** How many of the habits were checked off that day. */
export function doneCount(entries, day, habits) {
    const done = entries?.[day] || {};
    return (habits || []).filter(h => done[h.id]).length;
}

/**
 * The week (Monday to Sunday) that holds `today`, one entry per day.
 * state: "future" (hasn't happened), "complete" (every habit done),
 * "partial" (some), "none" (nothing, or no habits).
 */
export function weekBar(entries, habits, today) {
    const start = shiftDay(today, -weekdayIndex(today));
    const total = (habits || []).length;
    const days = NAMES.map((name, i) => {
        const key = shiftDay(start, i);
        const done = doneCount(entries, key, habits);
        const future = key > today;
        const state = future ? "future" : total && done === total ? "complete" : done > 0 ? "partial" : "none";
        return { key, name, letter: LETTERS[i], done, total, pct: total ? Math.round(done / total * 100) : 0, state, isToday: key === today };
    });
    return { days, completeDays: days.filter(d => d.state === "complete").length };
}

/** Share of the last `days` days' habit slots that were checked off, 0-100, or null with no habits. */
export function recentCompletionPct(entries, habits, today, days = 30) {
    const total = (habits || []).length * days;
    if (!total) return null;
    let done = 0;
    for (let i = 0; i < days; i++) done += doneCount(entries, shiftDay(today, -i), habits);
    return Math.round(done / total * 100);
}

/**
 * The three rings, each 0-1: today's habits done, days complete this week
 * out of seven, and the last 30 days. All zero when nothing is ticked.
 */
export function ringValues(entries, habits, today) {
    const total = (habits || []).length;
    if (!total) return [0, 0, 0];
    const bar = weekBar(entries, habits, today);
    const pct30 = recentCompletionPct(entries, habits, today) ?? 0;
    return [doneCount(entries, today, habits) / total, bar.completeDays / 7, pct30 / 100];
}

export { dayComplete };
