// Playbook season schedule: pure model (no DOM). A schedule item is a team session (date + kind)
// with optional time, arrive, site, place, opp and planId, so attendance, lineups and the practice
// plan all hang off the same entry. Dates are "YYYY-MM-DD" in the coach's own time.
import { openSession, cleanSchedule, todayKey } from "./teamModel.js";

export const REQUIRED_PRACTICE_DAYS = 13; // AHSAA bylaws, Section 14 (13 days of practice before the first contest)
const MAX_SESSIONS = 400;
const isDate = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T12:00:00Z"));
const toDate = d => new Date(d + "T12:00:00");
const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (d, n) => { const x = toDate(d); x.setDate(x.getDate() + n); return key(x); };
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
// Monday of the week that holds `d`.
export function weekStart(d) { const x = toDate(d), back = (x.getDay() + 6) % 7; x.setDate(x.getDate() - back); return key(x); }
export function weekDays(team, monday) {
    return Array.from({ length: 7 }, (_, i) => {
        const date = addDays(monday, i);
        const items = team.sessions.filter(s => s.date === date && s.kind !== "other").sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || (a.kind === "game" ? -1 : 1));
        return { date, items };
    });
}
export const isGame = s => s.kind === "game";
// A game that is on the schedule (has an opponent or a kickoff) and not yet played.
export function nextGame(team, today = todayKey()) {
    const g = team.sessions.filter(s => s.kind === "game" && s.date >= today && (s.opp || s.time || s.game?.opp)).sort((a, b) => a.date.localeCompare(b.date))[0];
    return g ? { session: g, days: daysBetween(today, g.date) } : null;
}
export const opponent = s => s.opp || s.game?.opp || "";
// Scheduled practices dated before a game. Only the season's first game gets the count (the rule is about the first contest).
export function practiceDaysBefore(team, game) {
    const first = team.sessions.filter(s => s.kind === "game" && (s.opp || s.time || s.game?.opp)).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!first || first.id !== game.id) return null;
    const n = new Set(team.sessions.filter(s => s.kind === "practice" && !s.cancelled && s.date < game.date).map(s => s.date)).size;
    return { have: n, need: REQUIRED_PRACTICE_DAYS };
}

// ---- edits (all return a new team) ----
export function saveItem(team, { id, date, kind, ...rest }) {
    if (id) { // edit in place; a changed date or kind must not collide with another item
        const cur = team.sessions.find(s => s.id === id);
        if (!cur) return { team, id: null, error: "missing" };
        const nd = isDate(date) ? date : cur.date, nk = kind === "game" || kind === "practice" ? kind : cur.kind;
        if (team.sessions.some(s => s.id !== id && s.date === nd && s.kind === nk)) return { team, id: null, error: "taken" };
        const merged = { ...cur, date: nd, kind: nk };
        delete merged.time; delete merged.arrive; delete merged.site; delete merged.place; delete merged.opp; delete merged.planId;
        if (nk !== "game") delete merged.game;
        return { team: { ...team, sessions: team.sessions.map(s => (s.id === id ? { ...merged, ...cleanSchedule({ ...rest, kind: nk, planId: rest.planId ?? cur.planId }) } : s)) }, id };
    }
    if (!isDate(date) || (kind !== "game" && kind !== "practice")) return { team, id: null, error: "bad" };
    if (team.sessions.some(s => s.date === date && s.kind === kind)) return { team, id: null, error: "taken" };
    const o = openSession(team, date, kind);
    return { team: { ...o.team, sessions: o.team.sessions.map(s => (s.id === o.id ? { ...s, ...cleanSchedule({ ...rest, kind }) } : s)) }, id: o.id };
}
export const setPlan = (team, sid, planId) => ({ ...team, sessions: team.sessions.map(s => { if (s.id !== sid) return s; const { planId: _, ...r } = s; return planId ? { ...r, planId: String(planId).slice(0, 40) } : r; }) });
export function removeItem(team, sid) {
    return { ...team, sessions: team.sessions.filter(s => s.id !== sid), runs: team.runs.filter(r => r.sid !== sid) };
}
// Practices on chosen weekdays (1=Mon..7=Sun) from `from` to `to`, skipping days that already have one.
export function repeatPractices(team, from, to, weekdays, extra = {}) {
    if (!isDate(from) || !isDate(to) || to < from || daysBetween(from, to) > 120) return { team, added: 0 };
    let t = team, added = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
        const wd = ((toDate(d).getDay() + 6) % 7) + 1;
        if (!weekdays.includes(wd) || t.sessions.length >= MAX_SESSIONS) continue;
        const r = saveItem(t, { date: d, kind: "practice", ...extra });
        if (r.id) { t = r.team; added++; }
    }
    return { team: t, added };
}

// AHSAA middle school soccer 2027 (ahsaa.com/Sports/Spring/Soccer): first practice Jan 18, season ends Apr 17. Editable.
export const DEFAULT_WINDOW = Object.freeze({ start: "2027-01-18", end: "2027-04-17" });
export const seasonWindow = team => team.season || { ...DEFAULT_WINDOW };
export function setWindow(team, start, end) {
    if (!isDate(start) || !isDate(end) || end < start) return team;
    return { ...team, season: { start, end } };
}
export function setCancelled(team, sid, on) {
    return { ...team, sessions: team.sessions.map(s => { if (s.id !== sid || s.kind !== "practice") return s; const { cancelled: _, ...r } = s; return on ? { ...r, cancelled: true } : r; }) };
}
export const handle = (team, id) => ({ ...team, handled: [...new Set([...(team.handled || []), String(id).slice(0, 60)])].slice(-300) });

// ---- month view ----
// The first day of the month `n` months from the month that holds `d`.
export function addMonths(d, n) { const x = toDate(d.slice(0, 7) + "-01"); x.setMonth(x.getMonth() + n); return key(x); }
// Weeks (Monday first) that cover the month holding `d`. Each day: { date, items, inMonth }.
export function monthWeeks(team, d) {
    const first = d.slice(0, 7) + "-01", last = addDays(addMonths(first, 1), -1);
    const weeks = [];
    for (let mon = weekStart(first); mon <= last; mon = addDays(mon, 7)) {
        weeks.push(weekDays(team, mon).map(x => ({ ...x, inMonth: x.date.slice(0, 7) === first.slice(0, 7) })));
    }
    return weeks;
}
