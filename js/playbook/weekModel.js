// Southbound Playbook home ("This week"): what is next, from the team schedule (pure; tests/playbookWeek.test.mjs).
// Dates are "YYYY-MM-DD" and times "HH:MM" in the coach's own time.
import { todayKey } from "./teamModel.js";
import { nextGame, opponent, daysBetween } from "./seasonModel.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const at = (date, time) => new Date(`${date}T${time || "00:00"}:00`);

export function dayText(date) {
    const d = new Date(date + "T12:00:00");
    return Number.isNaN(d.getTime()) ? "" : `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
export function timeText(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
    if (!m) return "";
    const h = Number(m[1]);
    return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`.replace(":00", "");
}

// A short countdown. With a start time: "2d 14h", "5h 20m", "Now". Without: "Today", "Tomorrow", "In 3 days".
export function countdown(date, time, now = new Date()) {
    if (time) {
        const ms = at(date, time) - now;
        if (ms <= 0) return ms > -3 * 3600e3 ? "Now" : "Started";
        const mins = Math.floor(ms / 60000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
        return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
    }
    const n = daysBetween(todayKey(now), date);
    return n <= 0 ? "Today" : n === 1 ? "Tomorrow" : `In ${n} days`;
}

const where = s => [s.site === "home" ? "Home" : s.site === "away" ? "Away" : s.site === "neutral" ? "Neutral" : "", s.place].filter(Boolean).join(" · ");

// The next scheduled game and the next practice, plus whether there is anything to show.
export function weekView(team, now = new Date()) {
    const today = todayKey(now);
    const ng = nextGame(team, today);
    let game = null;
    if (ng) {
        const s = ng.session, opp = opponent(s);
        game = { id: s.id, date: s.date, title: opp ? `${s.site === "away" ? "at" : "vs"} ${opp}` : "Game", when: [dayText(s.date), timeText(s.time)].filter(Boolean).join(" · "), count: countdown(s.date, s.time, now), arrive: s.arrive ? timeText(s.arrive) : "", where: where(s) };
    }
    const p = team.sessions.filter(s => s.kind === "practice" && !s.cancelled && s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99"))[0];
    const practice = p ? { id: p.id, date: p.date, planId: p.planId || "", when: [dayText(p.date), timeText(p.time)].filter(Boolean).join(" · "), count: countdown(p.date, p.time, now) } : null;
    return { game, practice, empty: !game && !practice };
}
