/* ==========================================
   Southbound — the Add to Calendar button

   Builds the .ics file (js/calendarExport.js) from week(s) of the
   client's plan and hands it to the phone or computer, which opens it
   in their calendar app (Apple Calendar, Google Calendar, Outlook).
   Each event links back to the workout in Southbound, and a run that
   needs fueling carries its one-line fuel plan.
========================================== */

import { buildCalendar, eventsFromWeeks } from "./calendarExport.js";
import { workoutLink, fuelForItem, fuelContext } from "./weekData.js";
import { toast } from "./ui.js";

// Only real workout pages are worth a link from a calendar event.
export function linkFor(item) {
    const href = workoutLink(item).href;
    return href.startsWith("workout.html") ? new URL(href, window.location.href).href : "";
}

function withFuel(weeks) {
    const ctx = fuelContext();
    return weeks.map(w => ({
        ...w,
        days: w.days.map(d => ({
            ...d,
            items: d.items.map(i => {
                const fuel = fuelForItem(i, ctx);
                return fuel?.summary ? { ...i, fuelSummary: fuel.summary } : i;
            })
        }))
    }));
}

// -> how many events went into the file (0 = nothing to add).
export function downloadCalendar(weeks, { filename = "southbound-training.ics", name = "Southbound Training" } = {}) {
    const events = eventsFromWeeks(withFuel(weeks), { linkFor });
    if (!events.length) {
        toast("Nothing to add: no workouts or sessions in that range.", { type: "error" });
        return 0;
    }
    const blob = new Blob([buildCalendar(events, { name })], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`${events.length} ${events.length === 1 ? "event" : "events"} ready. Open the file to add ${events.length === 1 ? "it" : "them"} to your calendar.`);
    return events.length;
}
