/* ==========================================
   The week as a trail (premium shell, details): Today's "This week".
   Seven days on a line: each a round node (a check when done, the miles for a
   run still to do, a dumbbell for a lift, a small dot for rest) with the day
   and its date under it; today wears a ring. Pure: no DOM reads, so it is unit
   tested (tests/weekTrail.test.mjs). The day facts come from js/weekRidge.js.
========================================== */

import { ridgeDays } from "./weekRidge.js";

const svg = body => `<svg class="trail-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CHECK = svg(`<polyline points="20 6 9 17 4 12"></polyline>`);
const LIFT = svg(`<path d="m6.5 6.5 11 11"></path><path d="m21 21-1-1"></path><path d="m3 3 1 1"></path><path d="m18 22 4-4"></path><path d="m2 6 4-4"></path><path d="m3 10 7-7"></path><path d="m14 21 7-7"></path>`);
const DOT = svg(`<circle cx="12" cy="12" r="2.5" fill="currentColor"></circle>`);

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// What a day's status is called out loud (the week model's own words).
const STATUS_WORDS = { done: "done", missed: "not done", skipped: "skipped", today: "today", upcoming: "coming up", rest: "rest day" };

// What sits inside a day's node.
function nodeOf(d, rest) {
    if (rest) return "";
    if (d.done) return CHECK;
    if (d.kind === "strength") return LIFT;
    if (d.kind === "run" && d.miles) return esc(String(d.miles));
    return DOT;
}

// `canToggle(item)` (js/weekView.js): a day with exactly one workout she can tick off gets a node that is a button
// (data-toggle, the same handler as the Plan list); rest days, days with two workouts and a run logged by the
// watch or the workout page stay plain nodes.
// `toggleAttrs(item)` is the attribute a tapped node carries (default: the client's data-toggle); the coach's
// marathon week taps through its own progress record (js/marathonToday.js).
const clientToggle = item => `data-toggle="${esc(item.id)}"`;

export function weekTrailHtml(week, { canToggle = () => false, toggleAttrs = clientToggle } = {}) {
    const facts = ridgeDays(week);
    const days = week.days.map((day, i) => {
        const d = facts[i];
        const rest = d.kind === "rest";
        const status = STATUS_WORDS[day.status] || "coming up";
        const what = rest ? "Rest day" : `${d.miles ? `${d.miles} mi ` : ""}${(d.title || d.kind).toLowerCase()}`;
        const cls = ["day", rest && "rest", d.done && "done", day.status === "missed" && "missed", d.today && "today"].filter(Boolean).join(" ");
        const workouts = day.items.filter(item => item.kind !== "session" && item.source?.type !== "log");
        const tick = workouts.length === 1 && canToggle(workouts[0]) ? workouts[0] : null;
        const node = tick
            ? `<button type="button" class="node" ${toggleAttrs(tick)} aria-pressed="${Boolean(tick.done)}" aria-label="${esc(`Mark ${d.label} ${d.date}, ${what}, ${tick.done ? "not done" : "done"}`)}">${nodeOf(d, rest)}</button>`
            : `<span class="node" aria-hidden="true">${nodeOf(d, rest)}</span>`;
        const spoken = tick ? "" : `<span class="sr-only">${esc(`${d.label} ${d.date}: ${what}, ${status}`)}</span>`;
        return `<li class="${cls}">${node}<b>${esc(d.label)}</b><span class="trail-date" aria-hidden="true">${d.date}</span>${spoken}</li>`;
    }).join("");
    return `<ol class="trail" role="list">${days}</ol>`;
}
