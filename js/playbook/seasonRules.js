// Playbook season rules: game-aware suggestions for a coach to approve. Pure (no DOM, no clock).
// Nothing here changes a plan. Each suggestion is a row the coach can Approve, Edit or Skip, and
// none of them ever adds work to make up for a missed practice. Like js/planRules.js, the rules
// protect the days around a game and never stack catch-up; unlike it, they carry no loads at all.
import { daysBetween, addDays, weekStart, practiceDaysBefore, seasonWindow, REQUIRED_PRACTICE_DAYS } from "./seasonModel.js";

const COUNT_LOOKAHEAD_DAYS = 28; // the 13-day warning only appears this close to the first game

const hasGame = s => s.kind === "game" && !s.cancelled && (s.opp || s.time || s.game?.opp);
const dayName = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });

// Returns [{ id, kind, date, sid, text, action }] sorted by date. action is "light", "recovery" or null (information only).
export function suggestions(team, today) {
    const out = [];
    const games = team.sessions.filter(hasGame).sort((a, b) => a.date.localeCompare(b.date));
    const practices = team.sessions.filter(s => s.kind === "practice" && !s.cancelled && s.date >= today);
    for (const p of practices) {
        for (const g of games) {
            const d = daysBetween(p.date, g.date);
            if (d === 1) out.push({ id: `light:${p.id}`, kind: "light", date: p.date, sid: p.id, action: "light", text: "Game tomorrow. Suggested: a light practice with no high-intensity drills." });
            else if (d === 0) out.push({ id: `sameday:${p.id}`, kind: "sameday", date: p.date, sid: p.id, action: null, text: "A game and a practice are on the same day. Is the practice needed?" });
            else if (d === -1) out.push({ id: `recovery:${p.id}`, kind: "recovery", date: p.date, sid: p.id, action: "recovery", text: "Day after a game. Suggested: a recovery practice with easy drills only." });
        }
    }
    for (let i = 1; i < games.length; i++) {
        const a = games[i - 1], b = games[i];
        if (b.date >= today && daysBetween(a.date, b.date) <= 6) out.push({ id: `two:${a.id}:${b.id}`, kind: "twoGames", date: b.date, sid: b.id, action: null, text: `Two games in 7 days (${dayName(a.date)} and ${dayName(b.date)}). No conditioning block this week.` });
    }
    const first = games[0];
    if (first && first.date >= today && daysBetween(today, first.date) <= COUNT_LOOKAHEAD_DAYS) {
        const c = practiceDaysBefore(team, first);
        if (c && c.have < REQUIRED_PRACTICE_DAYS) out.push({ id: `count:${first.id}`, kind: "count", date: first.date, sid: first.id, action: null, text: `Only ${c.have} of ${REQUIRED_PRACTICE_DAYS} practice days are scheduled before the first game. AHSAA requires ${REQUIRED_PRACTICE_DAYS}.` });
    }
    const win = seasonWindow(team), weeks = new Map();
    for (const p of practices) if (p.date < win.start || p.date > win.end) { const w = weekStart(p.date); weeks.set(w, (weeks.get(w) || 0) + 1); }
    for (const [w, n] of weeks) out.push({ id: `window:${w}`, kind: "window", date: w, sid: "", action: null, text: `${n} ${n === 1 ? "practice is" : "practices are"} outside your season window (${win.start} to ${win.end}). The AHSAA out-of-season rule may apply (2 hours a week of group instruction; conditioning is exempt). Check with your AD.` });
    const handled = new Set(team.handled || []);
    return out.filter(s => !handled.has(s.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export const forDay = (list, date) => list.filter(s => s.date === date && s.kind !== "window" && s.kind !== "twoGames" && s.kind !== "count");
// Information rows that belong to the week or the season, not to one day.
export const general = list => list.filter(s => s.kind === "window" || s.kind === "twoGames" || s.kind === "count");
export { addDays };
