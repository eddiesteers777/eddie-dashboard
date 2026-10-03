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
import { weekInputs, loadSessions, workoutLink } from "./weekData.js";
import { workoutCardHtml, weekListHtml, summaryLine, bindWeekActions } from "./weekView.js";
import { mondayOf, isoDate } from "./coachingPlanModel.js";
import { nextLine, quietDayTitle } from "./todayGlance.js";
import { icon } from "./icons.js";
import { cachedNavAccess, profileAccess, fallbackAccess, meets } from "./navAccess.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let sessions = [];
let items = new Map();
let bound = false;

// Only point at pages this client has (js/navAccess.js): what this device
// remembers at first, then what the profile says.
let access = cachedNavAccess();
const can = capability => meets(capability, access || fallbackAccess());
function noPlanText() {
    if (can("running") && can("strength")) return `No plan yet. Log a run on <a href="running.html">Running</a> or start a workout in <a href="strength.html">Strength</a>.`;
    if (can("sessions")) return `Nothing scheduled today. <a href="schedule.html">Book a session</a> any time.`;
    return "Nothing scheduled today.";
}

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

    // TODAY, then NEXT (Phase 8, js/todayGlance.js): what's after today,
    // a workout or a booked session, so nothing else repeats it.
    const container = $("todayItems");
    if (container) {
        const workouts = day.items;
        const next = nextWorkout(inputs, today, 21, { sessions: can("sessions") });
        // Everything on that day, not only the first thing (a run and a session).
        const nextItems = next ? buildDay(next.date, inputs, today).items.filter(x => (can("sessions") || x.kind !== "session") && x.source?.type !== "log") : [];
        const line = nextLine(next && { ...next, items: nextItems }, today);
        const nextHtml = line ? `
            <a class="wk-next" href="${esc(workoutLink(next.item).href)}">
                <span class="wk-next-label">Next</span>
                <span class="wk-next-text"><strong>${esc(line.when)}</strong><span>${esc(line.what)}</span></span>
                <span class="wk-next-chevron">${icon("chevronRight")}</span>
            </a>` : "";
        if (workouts.length) {
            container.innerHTML = `<div class="wk-today-cards">${workouts.map(workoutCardHtml).join("")}</div>${nextHtml}`;
        } else {
            const plan = can("plan");
            container.innerHTML = `
                <div class="wk-rest-day">
                    <span class="wk-icon">${icon(plan ? "moon" : "calendar")}</span>
                    <div>
                        <strong>${quietDayTitle({ plan })}</strong>
                        ${next ? ""
                            : inputs.plans.length ? `<span>Nothing else scheduled yet.</span>`
                            : `<span>${noPlanText()}</span>`}
                    </div>
                </div>${nextHtml}`;
        }
    }

    // Someone without a plan (soccer sessions only) gets just the days
    // that have something on, not seven rows of "Rest".
    const section = $("weekSection");
    if (section) {
        const hasWeek = week.days.some(d => d.items.length);
        section.hidden = !hasWeek;
        if (hasWeek) {
            $("weekSummary").textContent = summaryLine(week.summary);
            $("weekList").innerHTML = weekListHtml(week, { compact: true, busyOnly: !can("plan") });
            // Without a plan there's no My Plan page: their sessions are.
            const seeAll = $("weekSeeAll");
            if (seeAll) {
                seeAll.href = can("plan") ? "plan.html" : "schedule.html";
                seeAll.firstChild.textContent = can("plan") ? "Full week " : "All sessions ";
            }
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
    profileAccess().then(fresh => { access = fresh; renderClientToday(); }).catch(() => {});
    import("./icons.js").then(m => m.hydrate());
    sessions = await loadSessions();
    if (sessions.length) renderClientToday();
}
