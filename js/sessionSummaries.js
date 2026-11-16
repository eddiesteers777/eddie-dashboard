/* ==========================================
   Southbound — a player's session summaries (pure)

   Every finished session where the coach wrote something the player can read
   (the words, a focus, drills or skills), newest first. Reads only what the
   player's own booking requests already carry (their logs). Unit-tested in
   tests/sessionSummaries.test.mjs.
========================================== */

import { sessionList, logWords } from "./sessionModel.js";
import { hasReport } from "./sessionReport.js";

export function summaries(requests = [], today = "") {
    const all = sessionList(requests, today);
    const out = [];
    for (const s of all) {
        if (s.date > today || s.log?.status !== "completed") continue;
        if (!logWords(s.log) && !hasReport(s.log)) continue;
        out.push({
            bookingId: s.bookingId, date: s.date, sessionType: s.sessionType, label: s.label,
            workedOn: String(s.log.workedOn || ""), nextTime: String(s.log.nextTime || ""),
            log: s.log
        });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
}

// "Group" or "1-on-1" from the booking's label when it says so.
export function kindLabel(item) {
    const text = `${item?.label || ""}`.toLowerCase();
    if (/group/.test(text)) return "Group";
    if (/1[- ]?on[- ]?1|one[- ]on[- ]one|private/.test(text)) return "1-on-1";
    return item?.label || "Session";
}
