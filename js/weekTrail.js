/* ==========================================
   The week as bars (Today's "This week", round two 2026-10-15, "W4"): seven
   bars, each as tall as that day's planned run miles, with the miles above it
   and the day and its date under it. A done day's bar is sand with a check; a
   run still to do is sage; today is outlined; a rest day or a day without a
   run is a short stub. Pure: no DOM reads, so it is unit tested
   (tests/weekTrail.test.mjs). The day facts come from js/weekRidge.js.
========================================== */

import { ridgeDays } from "./weekRidge.js";

const CHECK = `<svg class="trail-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const MAX_PX = 72; // the longest day's bar
const MIN_PX = 14; // a rest day or a day with no run: a stub, still there

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// What a day's status is called out loud (the week model's own words).
const STATUS_WORDS = { done: "done", missed: "not done", skipped: "skipped", today: "today", upcoming: "coming up", rest: "rest day" };

// `canToggle(item)` (js/weekView.js): a day with exactly one workout she can tick off gets a bar that is a button
// (data-toggle, the same handler as the Plan list); rest days, days with two workouts and a run logged by the
// watch or the workout page stay plain bars.
// `toggleAttrs(item)` is the attribute a tapped bar carries (default: the client's data-toggle); the coach's
// marathon week taps through its own progress record (js/marathonToday.js).
const clientToggle = item => `data-toggle="${esc(item.id)}"`;

// The week's miles so far and in all: what the heading says (done days' planned miles, then every planned mile).
export function weekMiles(week) {
    const facts = ridgeDays(week);
    return {
        done: Math.round(facts.filter(d => d.done).reduce((t, d) => t + (Number(d.miles) || 0), 0) * 10) / 10,
        planned: Math.round(facts.reduce((t, d) => t + (Number(d.miles) || 0), 0) * 10) / 10
    };
}

export function weekTrailHtml(week, { canToggle = () => false, toggleAttrs = clientToggle } = {}) {
    const facts = ridgeDays(week);
    const most = Math.max(1, ...facts.map(d => Number(d.miles) || 0));
    const days = week.days.map((day, i) => {
        const d = facts[i];
        const rest = d.kind === "rest";
        const status = STATUS_WORDS[day.status] || "coming up";
        const what = rest ? "Rest day" : `${d.miles ? `${d.miles} mi ` : ""}${(d.title || d.kind).toLowerCase()}`;
        const cls = ["day", rest && "rest", d.done && "done", day.status === "missed" && "missed", d.today && "today"].filter(Boolean).join(" ");
        const workouts = day.items.filter(item => item.kind !== "session" && item.source?.type !== "log");
        const tick = workouts.length === 1 && canToggle(workouts[0]) ? workouts[0] : null;
        const px = d.miles ? Math.max(MIN_PX, Math.round(d.miles / most * MAX_PX)) : MIN_PX;
        const inside = d.done ? CHECK : "";
        const bar = tick
            ? `<button type="button" class="bar" style="height:${px}px" ${toggleAttrs(tick)} aria-pressed="${Boolean(tick.done)}" aria-label="${esc(`Mark ${d.label} ${d.date}, ${what}, ${tick.done ? "not done" : "done"}`)}">${inside}</button>`
            : `<span class="bar" style="height:${px}px" aria-hidden="true">${inside}</span>`;
        const miles = d.miles && !rest ? `<span class="bar-val" aria-hidden="true">${esc(String(d.miles))}</span>` : `<span class="bar-val" aria-hidden="true"></span>`;
        const spoken = tick ? "" : `<span class="sr-only">${esc(`${d.label} ${d.date}: ${what}, ${status}`)}</span>`;
        return `<li class="${cls}"><span class="bar-well">${miles}${bar}</span><b>${esc(d.label)}</b><span class="trail-date" aria-hidden="true">${d.date}</span>${spoken}</li>`;
    }).join("");
    return `<ol class="trail bars" role="list">${days}</ol>`;
}
