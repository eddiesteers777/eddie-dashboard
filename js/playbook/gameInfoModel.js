// Southbound Playbook parent link: the "when and where" of a shared game (pure; tests/playbookGameInfo.test.mjs).
import { buildCalendar } from "../calendarExport.js";
import { timeText } from "./weekModel.js";

const SITE = { home: "Home", away: "Away", neutral: "Neutral" };
const p2 = n => String(n).padStart(2, "0");
const stamp = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;

export function gameInfo(g) {
    const where = [SITE[g.site] || "", g.place || ""].filter(Boolean).join(" · ");
    const time = timeText(g.time), arrive = timeText(g.arrive);
    return { time, arrive, where, hasAny: !!(time || arrive || where) };
}

// A maps search for the field's text. Only built; it is opened when a parent taps it.
export const mapsUrl = place => (place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : "");

// An .ics file for the game, in the parent's own local time. Empty text when there is no date and kickoff time to put in a calendar.
export function gameIcs(g, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.date || "") || !g.time) return "";
    const start = new Date(`${g.date}T${g.time.padStart(5, "0")}:00`);
    if (Number.isNaN(start.getTime())) return "";
    const end = new Date(start.getTime() + g.periods * g.minutes * 60000);
    const info = gameInfo(g);
    const title = g.opp ? `Game vs ${g.opp}` : "Game";
    return buildCalendar([{
        uid: `game-${g.date}-${String(g.opp || "game").replace(/[^\w]/g, "-").slice(0, 30)}@southboundcoaching.com`,
        date: g.date, start: stamp(start), end: stamp(end), title,
        description: [info.arrive && `Arrive by ${info.arrive}`, info.where].filter(Boolean).join("\n") + (g.place ? "" : "")
    }], { name: title, now });
}
