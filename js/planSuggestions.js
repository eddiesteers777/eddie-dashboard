/* ==========================================
   Southbound — plan suggestions for the coach (pure)

   Turns one client's week (from js/clientSummary.js summarizePlans) into
   the short list on the Client Hub Plan tab. The rules are in
   js/planRules.js. This file only reads data the coach can already see
   and never writes a plan: a suggestion is advice, the coach changes the
   plan in the editor below it and publishes a new version.

   Pace suggestions (js/paceSuggestions.js) come in as `paceItems`, built
   from the laps the client shares with their athlete model; without that
   sharing there are none.

   buildSuggestions({ week, primary, results, today, dismissed, paceItems })
     -> [{ id, kind: "missed"|"held"|"pace", tone, chip, title, text, detail,
           weeksToRace, recommendation }]
   Unit-tested in tests/planSuggestions.test.mjs.
========================================== */

import { handleMissed, proposeRealignment, missedCount } from "./planRules.js";

const DAY = 864e5;
export const weeksTo = (today, raceDate) => {
    if (!raceDate || !today) return null;
    const days = Math.round((new Date(`${raceDate}T12:00:00`) - new Date(`${today}T12:00:00`)) / DAY);
    return days < 0 ? null : days / 7;
};
const STATE_STATUS = { done: "completed", missed: "missed", skipped: "skipped", today: "planned", upcoming: "planned" };

/** "illness" | "injury" | "busy", read from the reasons on this week's skipped runs. */
export function reasonFrom(results, from, to) {
    const notes = (results || []).filter(r => r?.status === "skipped" && r.kind !== "strength" && r.date >= from && r.date <= to)
        .map(r => String(r.note || "")).join(" ");
    if (/sick/i.test(notes)) return "illness";
    if (/sore|hurting/i.test(notes)) return "injury";
    return "busy";
}

const weeksText = w => (w == null ? "" : w < 1 ? `${Math.max(1, Math.round(w * 7))} days to race` : `${Math.round(w * 10) / 10} weeks to race`);

export function buildSuggestions({ week, primary, results = [], today, dismissed = [], paceItems = [] } = {}) {
    if (!week || !primary || primary.state === "finished") return [];
    const days = (week.days || []).filter(d => d.state !== "rest");
    const sessions = days.map(d => ({ day: d.date, kind: "easy", status: STATE_STATUS[d.state] || "planned" }));
    const n = missedCount({ sessions });
    const extra = paceItems.filter(i => !dismissed.includes(i.id));
    if (!days.length || !n) return extra;
    const monday = week.days[0].date, sunday = week.days[6].date;
    const weeksToRace = weeksTo(today, primary.raceDate);
    const reason = reasonFrom(results, monday, sunday);
    const missed = handleMissed({ sessions }, { weeksToRace });
    const taper = weeksToRace != null && weeksToRace < 3;
    const out = [];

    if (taper) {
        const r = proposeRealignment(weeksToRace, 1, reason);
        out.push({ id: `held:${monday}`, kind: "held", tone: "hold", chip: "Held · taper",
            title: `${n} ${n === 1 ? "session" : "sessions"} missed in the taper`,
            text: "Nothing is rebuilt or made up.",
            detail: r.detail, weeksToRace, recommendation: r.recommendation, race: weeksText(weeksToRace) });
    } else if (missed.action === "PROMPT_COACH_TO_REALIGN") {
        const r = proposeRealignment(weeksToRace ?? 99, 1, reason);
        out.push({ id: `missed:${monday}`, kind: "missed", tone: "call", chip: "Missed · needs you",
            title: `${n} sessions missed this week`,
            text: [weeksToRace == null ? "No race date on the plan." : weeksText(weeksToRace) + ".", "No make-up session is suggested."].join(" "),
            detail: r.detail, weeksToRace, recommendation: r.recommendation, race: weeksText(weeksToRace) });
    }
    return [...out.filter(s => !dismissed.includes(s.id)), ...extra];
}
