/* ==========================================================
   raceCountdown.js -- "41 days to race day" for a client's Today.

   Pure. It reads only dates already on the client's own active
   plans: the next day marked as a race (type "race") in any of them,
   else a plan's `generatedPlan.raceDate`. No upcoming race, no
   line -- nothing is invented.
   ========================================================== */

import { RACE_INFO } from "./planShape.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// A calendar day as a local-midnight Date (so a clock change can't move it).
function dayOf(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, m - 1, d);
}

// "Race day — 5K" -> "5K", "Race day: Fall Half - goal 1:45:00" -> "Fall Half". "" when the title says nothing more.
function raceNameOf(day) {
    const text = String(day?.title || day?.session || "").replace(/^race( day)?\s*[:\u2014\u2013-]*\s*/i, "").split(/\s+[-\u2013\u2014]\s+/)[0].trim();
    return /^race( day)?$/i.test(text) ? "" : text;
}

/**
 * The nearest day marked as a race that hasn't happened yet, across active plans.
 * `today` is a local ISO date ("2026-10-12"). A plan that shows only a couple
 * of weeks (a coach plan's copy) may not hold its race day: its own raceDate stands in.
 * -> { date, days, name, planId, planName } or null.
 */
export function nextRace(programs, today) {
    if (!ISO.test(today || "")) return null;
    const start = dayOf(today);
    let best = null;
    const consider = (program, date, name) => {
        if (!date || date < today) return;
        const days = Math.round((dayOf(date) - start) / 86400000);
        if (!best || days < best.days) best = { date, days, name, planId: program?.id || "", planName: program?.name || "" };
    };
    for (const program of programs || []) {
        if (program?.status && program.status !== "active") continue;
        const generated = program?.generatedPlan;
        if (!generated) continue;
        const typeName = RACE_INFO[generated.generator?.settings?.raceType]?.label || "";
        let found = false;
        for (const week of generated.weeks || []) {
            for (const day of week.days || []) {
                if (day?.type !== "race" || !ISO.test(day.date || "") || day.date < today) continue;
                found = true;
                consider(program, day.date, raceNameOf(day) || typeName);
            }
        }
        if (!found && ISO.test(generated.raceDate || "")) consider(program, generated.raceDate, typeName);
    }
    return best;
}

/** The words for Today, or "". */
export function raceCountdownText(race) {
    if (!race || !(race.days >= 0)) return "";
    if (race.days === 0) return "Race day is today";
    if (race.days === 1) return "Race day is tomorrow";
    return `${race.days} days to race day`;
}
