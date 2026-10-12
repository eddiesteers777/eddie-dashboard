/* ==========================================================
   raceCountdown.js -- "41 days to race day" for a client's Today.

   Pure. It reads only dates already on the client's own active
   plans: a plan's `generatedPlan.raceDate`, else the date of the
   last day marked as a race. No plan with an upcoming race, no
   line -- nothing is invented.
   ========================================================== */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// A calendar day as a local-midnight Date (so a clock change can't move it).
function dayOf(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, m - 1, d);
}

/** The race date a plan is building toward, or "". */
export function raceDateOf(program) {
    const generated = program?.generatedPlan;
    if (!generated) return "";
    if (ISO.test(generated.raceDate || "")) return generated.raceDate;
    let last = "";
    for (const week of generated.weeks || []) {
        for (const day of week.days || []) {
            if (day?.type === "race" && ISO.test(day.date || "") && day.date > last) last = day.date;
        }
    }
    return last;
}

/**
 * The nearest race that hasn't happened yet, across active plans.
 * `today` is a local ISO date ("2026-10-12").
 * -> { date, days } or null.
 */
export function nextRace(programs, today) {
    if (!ISO.test(today || "")) return null;
    const start = dayOf(today);
    let best = null;
    for (const program of programs || []) {
        if (program?.status && program.status !== "active") continue;
        const date = raceDateOf(program);
        if (!date || date < today) continue;
        const days = Math.round((dayOf(date) - start) / 86400000);
        if (!best || days < best.days) best = { date, days };
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
