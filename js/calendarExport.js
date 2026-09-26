/* ==========================================
   Southbound — Add to Calendar (pure)

   Turns a week (js/weekModel.js) into a standard .ics calendar file
   that Apple Calendar, Google Calendar and Outlook all open:
     - workouts are all-day events ("6 mi Tempo run"), with the
       prescription and a link back to the workout in Southbound
     - sessions with the coach are timed events (their own start and
       end time, or an hour when there's no end)
     - rest days and runs they logged themselves are left out
   Each event has a stable ID, so adding the same week again updates it
   in most calendar apps instead of doubling it up.

   No DOM: js/calendarButton.js downloads the file. Unit-tested in
   tests/calendarExport.test.mjs.
========================================== */

const DOMAIN = "southboundcoaching.com";

// RFC 5545 text: escape \ ; , and newlines.
export const icsText = value => String(value ?? "")
    .replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 bytes continue on the next line after a space.
export function foldLine(line) {
    const bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    const parts = [];
    let current = "";
    let size = 0;
    for (const ch of line) {
        const n = new TextEncoder().encode(ch).length;
        if (size + n > (parts.length ? 74 : 75)) { parts.push(current); current = ""; size = 0; }
        current += ch;
        size += n;
    }
    parts.push(current);
    return parts.join("\r\n ");
}

const ymd = date => String(date).replace(/-/g, "");
const nextDay = date => {
    const [y, m, d] = date.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return t.toISOString().slice(0, 10).replace(/-/g, "");
};
const hhmm = time => { const m = /^(\d{1,2}):(\d{2})/.exec(time || ""); return m ? [Number(m[1]), Number(m[2])] : null; };
const stampOf = now => new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function timed(date, start, end) {
    const s = hhmm(start);
    if (!s) return null;
    let e = hhmm(end);
    if (!e || e[0] * 60 + e[1] <= s[0] * 60 + s[1]) { const t = s[0] * 60 + s[1] + 60; e = [Math.floor(t / 60) % 24, t % 60]; }
    const f = ([h, m]) => `${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
    return { start: `${ymd(date)}T${f(s)}`, end: `${ymd(date)}T${f(e)}` };
}

// One week item -> an event (or null for things that don't belong on a calendar).
export function eventFromItem(item, date, { linkFor = () => "" } = {}) {
    if (!item || item.source?.type === "log") return null;
    const title = item.kind === "run" && item.miles ? `${item.miles} mi ${item.title}` : item.title;
    const link = linkFor(item) || "";
    const times = item.kind === "session" ? timed(date, item.startTime, item.endTime) : null;
    return {
        uid: `${String(item.id || `${date}-${title}`).replace(/[^\w.:-]/g, "-")}@${DOMAIN}`,
        date,
        start: times?.start || "",
        end: times?.end || "",
        title: `${title}${item.kind === "session" ? "" : " · Southbound"}`,
        description: [item.detail, item.fuelSummary ? `Fuel: ${item.fuelSummary}` : "", link ? `Open in Southbound: ${link}` : ""].filter(Boolean).join("\n\n"),
        url: link
    };
}

export function eventsFromWeeks(weeks, options = {}) {
    return (weeks || []).flatMap(w => (w.days || []).flatMap(day => (day.items || []).map(i => eventFromItem(i, day.date, options)))).filter(Boolean);
}

export function buildCalendar(events, { name = "Southbound Training", now = Date.now() } = {}) {
    const stamp = stampOf(now);
    const lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Southbound Coaching//Training//EN", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`
    ];
    for (const e of events) {
        lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`);
        if (e.start) lines.push(`DTSTART:${e.start}`, `DTEND:${e.end}`);
        else lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`, "TRANSP:TRANSPARENT");
        lines.push(`SUMMARY:${icsText(e.title)}`);
        if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`);
        if (e.url) lines.push(`URL:${e.url}`);
        lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
}
