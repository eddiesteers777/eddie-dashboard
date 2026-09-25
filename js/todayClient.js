/* ==========================================
   Southbound — Today for clients (index.html)

   A client opens the app and sees what to do now:
     - today's workout(s), big, with Mark done and Start / Open
     - on a rest day: "Rest day" and what's next
     - "This week": one line per day with done / missed marks, and the
       week's totals, linking to the full week in My Plan
   Built from js/weekModel.js (everything in the week, from every
   source) so Today and My Plan always agree. The coach's own dashboard
   (his marathon plan) is js/app.js, unchanged.
========================================== */

import { buildWeek, buildDay, nextWorkout, planContext } from "./weekModel.js";
import { weekInputs, loadSessions } from "./weekData.js";
import { workoutCardHtml, weekListHtml, summaryLine, bindWeekActions } from "./weekView.js";
import { mondayOf, isoDate, shortDay } from "./coachingPlanModel.js";
import { icon } from "./icons.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let sessions = [];
let items = new Map();
let bound = false;

export function renderClientToday() {
    const today = isoDate(new Date());
    const inputs = weekInputs(sessions);
    const day = buildDay(today, inputs, today);
    const week = buildWeek(mondayOf(today), inputs, today);
    items = new Map([...week.days.flatMap(d => d.items)].map(i => [i.id, i]));

    // Where they are in their plan, in the hero.
    const ctx = planContext(inputs.plans, today);
    const phase = $("phaseStatus");
    if (phase && ctx) phase.textContent = `Week ${ctx.weekNumber} of ${ctx.totalWeeks} · ${ctx.planName}${ctx.phase ? ` · ${ctx.phase}` : ""}`;

    const dateLabel = $("todayDateLabel");
    if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const container = $("todayItems");
    if (container) {
        const workouts = day.items;
        if (workouts.length) {
            container.innerHTML = `<div class="wk-today-cards">${workouts.map(workoutCardHtml).join("")}</div>`;
        } else {
            const next = nextWorkout(inputs, today);
            container.innerHTML = `
                <div class="wk-rest-day">
                    <span class="wk-icon">${icon("moon")}</span>
                    <div>
                        <strong>Rest day</strong>
                        ${next ? `<span>Next: ${esc(shortDay(next.date))} · ${esc(next.item.kind === "run" && next.item.miles ? `${next.item.miles} mi ${next.item.title.toLowerCase()}` : next.item.title)}</span>`
                            : inputs.plans.length ? `<span>Nothing else scheduled yet.</span>`
                            : `<span>No plan yet. Log a run on <a href="running.html">Running</a> or start a workout in <a href="strength.html">Strength</a>.</span>`}
                    </div>
                </div>`;
        }
    }

    const section = $("weekSection");
    if (section) {
        const hasWeek = week.days.some(d => d.items.length);
        section.hidden = !hasWeek;
        if (hasWeek) {
            $("weekSummary").textContent = summaryLine(week.summary);
            $("weekList").innerHTML = weekListHtml(week, { compact: true });
        }
    }

    if (!bound) {
        bound = true;
        const onChange = () => renderClientToday();
        const getItem = id => items.get(id);
        if (container) bindWeekActions(container, { getItem, onChange });
    }
}

export async function initClientToday() {
    renderClientToday();
    import("./icons.js").then(m => m.hydrate());
    sessions = await loadSessions();
    if (sessions.length) renderClientToday();
}
