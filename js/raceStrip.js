/* ==========================================
   Southbound — the race countdown strip on a client's Today

   A big "36 days to go" and the whole training block as a bar, one
   segment per week (done weeks sage, this week tan, the rest quiet).
   Pure, so it is unit tested (tests/raceStrip.test.mjs). Shown only when
   an active plan has a race still ahead; no race, no strip. Nothing is
   invented: the numbers come from js/raceCountdown.js and the plan
   position from js/weekModel.js planContext.
========================================== */

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MAX_SEGMENTS = 30;   // a longer block would be a smear of slivers

// "Sun Nov 22" from a local ISO date.
function raceDay(iso) {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    if (!y) return "";
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * race: { date, days } from nextRace(); ctx: { weekNumber, totalWeeks } from planContext() or null.
 * -> { days, big, unit, weeks: ["done"|"now"|"next", ...], caption, weekText } or null.
 */
export function raceStripModel(race, ctx) {
    if (!race || !(race.days >= 0)) return null;
    const total = Number(ctx?.totalWeeks) || 0;
    const now = Number(ctx?.weekNumber) || 0;
    const weeks = total && total <= MAX_SEGMENTS && now >= 1
        ? Array.from({ length: total }, (_, i) => (i + 1 < now ? "done" : i + 1 === now ? "now" : "next"))
        : [];
    return {
        days: race.days,
        big: race.days === 0 ? "Today" : race.days === 1 ? "1" : String(race.days),
        unit: race.days === 0 ? "Race day" : race.days === 1 ? "Day to go" : "Days to go",
        weeks,
        caption: `Race day · ${raceDay(race.date)}`,
        weekText: total && now ? `Week ${now} of ${total}` : ""
    };
}

export function raceStripHtml(model) {
    if (!model) return "";
    const label = model.days === 0 ? "Race day is today" : `${model.days} ${model.days === 1 ? "day" : "days"} to race day`;
    return `
        <div class="race-strip-top" role="img" aria-label="${esc(label)}">
            <span class="race-strip-big">${esc(model.big)}</span>
            <span class="race-strip-unit">${esc(model.unit)}</span>
        </div>
        ${model.weeks.length ? `<div class="race-strip-bar" aria-hidden="true">${model.weeks.map(w => `<i class="is-${w}"></i>`).join("")}</div>` : ""}
        <div class="race-strip-foot"><span>${esc(model.caption)}</span><span>${esc(model.weekText)}</span></div>`;
}
