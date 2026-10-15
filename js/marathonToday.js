/* ==========================================
   The coach's own Today (premium shell): the marathon plan's run in the new
   card, and the marathon week as the dated trail. js/app.js loads this only for
   the coach (js/role.js showsPersonalPlan); clients get js/todayClient.js.

   Ticking is the plan's own record (training-progress, by week and day), the
   same one the Mark Done button always set; js/app.js handles the click.
========================================== */

import { getCurrentWeek, weekStart, getAdjustedWeekDays, loadProgress, DAYS, PACES, WEEKS } from "./marathonData.js";
import { planDayFromMarathon, marathonTitle } from "./marathonCoros.js";
import { marathonWeekModel } from "./marathonWeek.js";
import { weekTrailHtml, weekMiles } from "./weekTrail.js";
import { summaryLine, coachRunCardHtml } from "./weekView.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const titleOf = day => marathonTitle(day.session, Number(day.miles) || 0);

// The plan day's steps (warm-up, reps, cool-down) for the picture; null for a plain run.
function workoutOf(day) {
    try { return planDayFromMarathon(day, PACES)?.workout || null; } catch { return null; }
}

// Today's run: { data: the plan day, week, dayKey, done } -> the card's HTML.
export function runCard({ data, week, dayKey, done }) {
    const miles = Number(data.miles) || 0;
    const title = titleOf(data);
    const session = String(data.session || "").trim();
    const detail = data.race ? "Race day" : session && session !== title ? session : "";
    return coachRunCardHtml({ id: `m-${week}-${dayKey}`, kind: "run", title, miles, done, week, dayKey, workout: workoutOf(data), detail });
}

// The marathon week under the card: dated nodes, tapped through the plan's own progress record.
export function renderCoachWeek({ today }) {
    const section = document.getElementById("weekSection");
    const list = document.getElementById("weekList");
    if (!section || !list) return;
    const week = getCurrentWeek();
    const model = marathonWeekModel({
        week, monday: weekStart(week), days: getAdjustedWeekDays(week), keys: DAYS, progress: loadProgress(), today, titleOf, workoutOf
    });
    section.hidden = false;
    const heading = section.querySelector("h2");
    if (heading) heading.textContent = `Week ${week} of ${WEEKS.length}`;
    const summary = document.getElementById("weekSummary");
    if (summary) summary.textContent = summaryLine(model.summary);
    list.innerHTML = weekTrailHtml(model, {
        canToggle: item => item.source.type === "marathon",
        toggleAttrs: item => `data-complete-week="${esc(item.week)}" data-complete-day="${esc(item.dayKey)}"`
    });
    const milesEl = document.getElementById("weekMiles");
    if (milesEl) {
        const m = weekMiles(model);
        milesEl.hidden = !m.planned;
        milesEl.textContent = `${m.done} / ${m.planned} mi`;
    }
    const seeAll = document.getElementById("weekSeeAll");
    if (seeAll) { seeAll.href = "marathon.html"; if (seeAll.firstChild) seeAll.firstChild.textContent = "Full plan "; }
}
