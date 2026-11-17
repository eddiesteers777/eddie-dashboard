/* ==========================================
   Southbound — the soccer client's week (pure)

   Seven days (Monday first) that put the player's booked sessions and
   their homework on one strip. Nothing is stored: it reads what the
   client can already see (their booking requests with logs, and their
   own homework). Homework shows on a day when it is a daily practice,
   when it is due that day, or when a practice was logged that day.
   Unit-tested in tests/soccerWeek.test.mjs.
========================================== */

import { sessionList } from "./sessionModel.js";
import { weekStartOf, addDays } from "./scheduleWeek.js";

const loggedOn = (hw, date) => (hw.logs || []).some(l => l?.date === date);

/**
 * requests: the client's booking requests. homework: their items
 * ({ id, title, cadence, dueDate, status, logs: [{ date }] }).
 * Returns 7 days: { date, sessions: [session], homework: [{ id, title, done, due }] }.
 */
export function clientWeek({ requests = [], homework = [], anyDay = "", today = "" } = {}) {
    const start = weekStartOf(anyDay || today);
    const sessions = sessionList(requests, today).filter(s => !["cancelled", "late-cancel"].includes(s.log?.status));
    const active = (homework || []).filter(h => h && h.status !== "archived");
    return Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        const hw = [];
        for (const h of active) {
            const done = loggedOn(h, date);
            const due = !!h.dueDate && h.dueDate === date;
            const daily = h.cadence === "daily" && date >= String(h.createdDate || "0000-00-00");
            if (done || due || daily) hw.push({ id: h.id, title: h.title, done, due });
        }
        return { date, sessions: sessions.filter(s => s.date === date), homework: hw };
    });
}

// "2 sessions · 3 practices to do", for the line over the strip.
export function clientWeekLine(days = [], today = "") {
    const sessions = days.reduce((n, d) => n + d.sessions.length, 0);
    const todo = days.filter(d => d.date >= today).reduce((n, d) => n + d.homework.filter(h => !h.done).length, 0);
    const bits = [];
    if (sessions) bits.push(`${sessions} ${sessions === 1 ? "session" : "sessions"}`);
    if (todo) bits.push(`${todo} ${todo === 1 ? "practice" : "practices"} to do`);
    if (!bits.length && days.some(d => d.homework.some(h => h.done))) return "All caught up this week";
    return bits.join(" · ");
}
