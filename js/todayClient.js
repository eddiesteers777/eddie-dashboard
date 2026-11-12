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
import { workoutCardHtml, weekListHtml, summaryLine, bindWeekActions, canToggle } from "./weekView.js";
import { weekTrailHtml, weekMiles } from "./weekTrail.js";
import { mondayOf, isoDate, addDays } from "./coachingPlanModel.js";
import { changeMode } from "./weekChanges.js";
import { nextLine, quietDayTitle } from "./todayGlance.js";
import { restDayAction } from "./todayCues.js";
import { nextRace } from "./raceCountdown.js";
import { raceStripModel, raceStripHtml, raceDayText } from "./raceStrip.js";
import { icon } from "./icons.js";
import { cachedRole } from "./role.js";
import { dayStripHtml, todayLineHtml, stripLegendHtml, milesCardHtml, sportRows, totalsText, todayPick, weeklyMiles } from "./trainingGridView.js";
import { storedSessions } from "./sessionStore.js";
import { cachedNavAccess, profileAccess, fallbackAccess, meets } from "./navAccess.js";

const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let sessions = [];
let items = new Map();
let bound = false;
let current = { week: null, inputs: null, today: "" };

// Anything this week or the next 7 days they could ease off?
function hasChangeable(inputs, today) {
    for (let i = 0; i < 7; i++) {
        if (buildDay(addDays(today, i), inputs, today).items.some(x => changeMode(x) && !x.done && x.state !== "skipped")) return true;
    }
    return false;
}

const changeCtx = () => ({ ...current, onChange: () => renderClientToday() });

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
    current = { week, inputs, today };
    const feelHtml = hasChangeable(inputs, today)
        ? `<button type="button" class="wk-feel" data-feel>${icon("heart")} Not feeling 100%? <span>Ease off for a few days</span></button>` : "";

    // Where they are in their plan, in the hero.
    const ctx = planContext(inputs.plans, today);
    const phase = $("phaseStatus");
    const race = nextRace(inputs.plans, today);
    const model = raceStripModel(race, ctx);
    const strip = $("raceStrip");
    // The strip counts down to the next race day in any active plan. The plan name and "Week X of Y" come from the
    // plan on today's date (ctx), so they always agree. No race ahead: that plan's end date, as "Plan ends".
    if (strip) { strip.hidden = !model; strip.innerHTML = raceStripHtml(model); }
    if (phase && ctx) {
        phase.textContent = model
            ? [ctx.planName, ctx.phase].filter(Boolean).join(" · ")
            : [`Week ${ctx.weekNumber} of ${ctx.totalWeeks}`, ctx.planName, ctx.phase, ctx.endDate ? `Plan ends ${raceDayText(ctx.endDate)}` : ""].filter(Boolean).join(" · ");
    }

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
            container.innerHTML = `<div class="wk-today-cards">${workouts.map(workoutCardHtml).join("")}</div>${nextHtml}${feelHtml}`;
        } else {
            const plan = can("plan");
            // What the plan says to do on its rest day, in its own words; nothing written, nothing added.
            const action = restDayAction(inputs.plans, today);
            const title = !inputs.plans.length ? "No plan yet" : quietDayTitle({ plan });
            // With something coming up, the card leads with it (the hero), in the plan's own words.
            if (line && next) {
                container.innerHTML = `
                <div class="hero-rest">
                    <span class="hr-kicker">${esc(action ? "Rest day" : inputs.plans.length ? title : "Nothing today")} · Next up</span>
                    <div class="hr-big">${esc(line.when)}</div>
                    <p class="hr-what">${esc(line.what)}</p>
                    ${action ? `<p class="hr-sub">${esc(action)}</p>` : ""}
                    <a class="sb-btn sb-btn-primary" href="${esc(workoutLink(next.item).href)}">See it</a>
                </div>${feelHtml}`;
            } else container.innerHTML = `
                <div class="wk-rest-day">
                    <span class="wk-icon">${icon(plan ? "moon" : "calendar")}</span>
                    <div>
                        <strong>${action ? esc(action) : (!inputs.plans.length ? "No plan yet" : quietDayTitle({ plan }))}</strong>
                        ${action ? `<span>Rest day on your plan.</span>`
                            : next ? ""
                            : inputs.plans.length ? `<span>Nothing else scheduled yet.</span>`
                            : `<span>${noPlanText()}</span>`}
                    </div>
                </div>${nextHtml}${feelHtml}`;
        }
    }

    // Someone without a plan (soccer sessions only) gets just the days
    // that have something on, not seven rows of "Rest".
    const section = $("weekSection");
    if (section) {
        // The coach's own week: running, strength and cross-training together, one row per sport
        // (js/trainingGrid.js). It opens the Train page, where the whole calendar is.
        const combined = cachedRole() === "coach";
        let grid = null, completedSessions = [];
        if (combined) {
            try { completedSessions = storedSessions(); } catch { completedSessions = []; }
            grid = sportRows(week, completedSessions);
        }
        // The miles card under it (T1): this week's miles and the weeks either side. Coach only.
        const milesCard = $("weekMilesCard");
        if (milesCard) {
            if (combined && grid.totals.planned) {
                milesCard.innerHTML = milesCardHtml(weeklyMiles(inputs, today, completedSessions));
                milesCard.hidden = false;
                import("./icons.js").then(m => m.hydrate());
            } else milesCard.hidden = true;
        }
        const hasWeek = combined ? true : week.days.some(d => d.items.length);
        section.hidden = !hasWeek;
        if (combined && !grid.totals.planned) {
            $("weekSummary").textContent = "Nothing planned this week.";
            $("weekList").innerHTML = `<p class="tg-none">Add a run, a lift or a cross-training session and it shows here.</p>`;
            const milesEl = $("weekMiles");
            if (milesEl) milesEl.hidden = true;
            const seeAll = $("weekSeeAll");
            if (seeAll) { seeAll.href = "train.html"; seeAll.firstChild.textContent = "Training "; }
        } else if (combined) {
            $("weekSummary").textContent = `${grid.totals.done} of ${grid.totals.planned} done`;
            const todayDay = week.days.find(d => d.isToday);
            $("weekList").innerHTML = `<a class="tg-link" href="train.html" aria-label="This week's training. Open the training calendar">${dayStripHtml(grid)}</a>${todayLineHtml(todayDay ? todayPick(todayDay, completedSessions) : null)}${stripLegendHtml()}`;
            const milesEl = $("weekMiles");
            if (milesEl) { milesEl.hidden = false; milesEl.classList.add("tg-totals"); milesEl.textContent = totalsText(grid.totals); }
            const seeAll = $("weekSeeAll");
            if (seeAll) { seeAll.href = "train.html"; seeAll.firstChild.textContent = "Training "; }
        } else if (hasWeek) {
            // The heading already carries the week's miles when it shows them: don't say them twice.
            const milesInHeading = can("plan") && !!weekMiles(week).planned;
            $("weekSummary").textContent = summaryLine(week.summary, { miles: !milesInHeading });
            // A plan's week is seven bars, each as tall as its day's miles (js/weekTrail.js), tapped done like the
            // Plan list; sessions only: just the busy days. The heading carries the week's miles.
            $("weekList").innerHTML = can("plan") ? weekTrailHtml(week, { canToggle }) : weekListHtml(week, { compact: true, busyOnly: true });
            const milesEl = $("weekMiles");
            if (milesEl) {
                const m = weekMiles(week);
                milesEl.hidden = !can("plan") || !m.planned;
                milesEl.textContent = `${m.done} / ${m.planned} mi`;
            }
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
        const onChangeItem = item => import("./weekChangeDialogs.js").then(m => m.openChangeMenu(item, changeCtx()));
        // The week row's nodes mark a workout done through the same handler as the card and the Plan list.
        const weekList = $("weekList");
        if (weekList) bindWeekActions(weekList, { getItem, onChange, onChangeItem });
        if (container) {
            bindWeekActions(container, { getItem, onChange, onChangeItem });
            container.addEventListener("click", event => {
                if (event.target.closest("[data-feel]")) import("./weekChangeDialogs.js").then(m => m.openFeelDialog(changeCtx()));
            });
        }
    }
}

export async function initClientToday() {
    renderClientToday();
    profileAccess().then(fresh => { access = fresh; renderClientToday(); }).catch(() => {});
    import("./icons.js").then(m => m.hydrate());
    sessions = await loadSessions();
    if (sessions.length) renderClientToday();
}
