// "Your progress" card on the client Sessions page (pure; tests/soccerProgress.test.mjs).
// Reads what the client can already see: their booked sessions with the coach's logs, and their own homework practices.
import { sessionList } from "./sessionModel.js";
import { addDays } from "./homeworkModel.js";

// requests: the client's booking requests. homework: their homework items ({ logs: [{ date }] }). today: "YYYY-MM-DD".
export function soccerProgress(requests = [], homework = [], today = "", days = 30) {
    const all = sessionList(requests, today);
    const done = all.filter(s => s.log?.status === "completed" && s.date <= today);
    const since = addDays(today, -days);
    const practices = (homework || []).reduce((n, h) => n + (h.logs || []).filter(l => l?.date && l.date > since && l.date <= today).length, 0);
    const last = [...done].reverse().find(s => s.log?.workedOn || s.log?.nextTime) || null;
    return {
        sessions: done.length,
        practices,
        days,
        last: last ? { date: last.date, workedOn: String(last.log.workedOn || ""), nextTime: String(last.log.nextTime || "") } : null,
        show: done.length > 0 || practices > 0
    };
}
