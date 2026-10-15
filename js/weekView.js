/* ==========================================
   Southbound — how a workout / a week looks (client side)

   Shared by Today (js/todayClient.js) and My Plan (js/myPlan.js), so a
   workout looks and behaves the same everywhere:
     workoutCardHtml(item)    today's workout, big, with Mark done + Start
     weekListHtml(week)       seven days, each with its workouts
     bindWeekActions(root, { getItem, onChange })
                              Mark done / undo (js/weekData.js toggleDone)
   Items come from js/weekModel.js.
========================================== */

import { icon } from "./icons.js";
import { contourParts, contourSvg, contourLabelsHtml } from "./workoutContour.js";
import { toggleDone, workoutLink, fuelForItem } from "./weekData.js";
import { shortDay } from "./coachingPlanModel.js";
import { toast, friendlyError } from "./ui.js";
import { itemActions } from "./weekChanges.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const KIND = {
    run: { icon: "activity", color: "var(--primary)" },
    strength: { icon: "dumbbell", color: "var(--orange)" },
    cross: { icon: "bike", color: "var(--cyan)" },
    session: { icon: "users", color: "var(--purple)" }
};

// A logged coach-plan workout is done or skipped by its log (edit it on the workout page), not a tap.
// (Exported: Today's week row taps a day's one workout done by the same rule.)
export const canToggle = item => ["plan", "extra", "strength"].includes(item.source?.type) && !item.autoDone && !item.actual;

function doneButton(item, compact = false, secondary = false) {
    if (!canToggle(item)) return "";
    return `<button type="button" class="wk-done${item.done ? " is-done" : ""}${compact ? " is-compact" : ""}${secondary ? " is-secondary" : ""}" data-toggle="${esc(item.id)}"
        aria-pressed="${item.done}" aria-label="${item.done ? `Mark ${esc(item.title)} not done` : `Mark ${esc(item.title)} done`}">
        ${icon(item.done ? "checkCircle" : "check")}${compact ? "" : `<span>${item.done ? "Done" : "Mark done"}</span>`}
    </button>`;
}

// The ⋮ that opens Move / Skip / Not this one (js/weekChangeDialogs.js).
function changeButton(item, compact = false) {
    if (!itemActions(item).length) return "";
    return `<button type="button" class="wk-change${compact ? " is-compact" : ""}" data-change="${esc(item.id)}"
        aria-label="Change ${esc(item.title)}: move or skip it">${icon("moreVertical")}${compact ? "" : "<span>Change</span>"}</button>`;
}

// "Skipped · Too busy" / "Eased off · was 10 mi Long run"
function changeNote(item) {
    if (item.state === "skipped" && item.skipReason) return `<small class="wk-change-note">Skipped · ${esc(item.skipReason)}</small>`;
    if (item.adjusted && !item.done) return `<small class="wk-change-note">Eased off · was ${esc(item.adjusted)}</small>`;
    return "";
}

// "Fuel: 3 gels, first at 0:30 · 21 oz/hr" on a run that needs fueling.
function fuelLine(item) {
    if (item.done || item.skipped) return "";
    const fuel = fuelForItem(item);
    if (!fuel?.summary) return "";
    return `<p class="wk-fuel">${icon("fuel")} Fuel: ${esc(fuel.summary)}${fuel.coachNote ? ` · ${esc(fuel.coachNote)}` : ""}</p>`;
}

// Today's workout, front and center.
// Direction A (2026-10-14): a mono kicker (kind · from your coach · plan)
// over the name in the display face, the miles big in tan, a tan rule
// instead of a box; Start / Log it is the main button until it's done.
const KIND_WORD = { run: "Run", strength: "Strength", cross: "Cross-training", session: "Session" };

// The effort contour of a structured run (js/workoutContour.js), drawn from its steps under the title.
function contourBlock(item) {
    const parts = item.kind === "run" ? contourParts(item.workout) : [];
    if (!parts.length) return "";
    const id = `wc-${String(item.id).replace(/[^a-zA-Z0-9]/g, "-")}`;
    const label = `Effort profile: ${parts.map(p => p.title).join(", ")}`;
    return `<div class="wk-contour">${contourSvg(parts, { id, label })}${contourLabelsHtml(parts)}</div>`;
}

// The coach's one line for this workout, as a quote under the details (the workout page shows it too).
function cueBlock(item) {
    const cue = String(item.workout?.cue || "").trim();
    return cue ? `<blockquote class="wk-cue">“${esc(cue)}”<cite>${esc(item.fromCoach ? "Your coach" : "Coach cue")}</cite></blockquote>` : "";
}

export function workoutCardHtml(item) {
    const k = KIND[item.kind] || KIND.run;
    const link = workoutLink(item);
    const bigNumber = item.kind === "run" && item.miles ? `<span class="wk-big">${item.miles}<small> mi</small></span>` : "";
    const kicker = [KIND_WORD[item.kind] || "", item.kind === "session" ? "" : item.planName || (item.fromCoach ? "From your coach" : "")].filter(Boolean).join(" · ");
    const startFirst = !item.done && !item.skipped && ["Start", "Log it"].includes(link.label);
    // "Start" gets the play mark and no arrow; the others ("Log it", "Open") keep the arrow.
    const playing = link.label === "Start";
    const linkBtn = `<a class="sb-btn ${startFirst ? "sb-btn-primary" : "sb-btn-secondary"}" href="${esc(link.href)}">${playing ? `${icon("play")} ` : ""}${esc(link.label)}${playing ? "" : ` ${icon("chevronRight")}`}</a>`;
    // The demo's order: the picture and its labels first, then the name with the miles beside it.
    // The picture already says "run", and the plan's name is in the greeting, so no kicker over it.
    const picture = contourBlock(item);
    return `
        <div class="wk-card is-${item.kind}${item.done ? " is-done" : ""}${picture ? " has-contour" : ""}">
            ${picture}
            <div class="wk-card-top">
                <div class="wk-card-title">
                    ${picture ? "" : `<span class="wk-kicker" style="--kind:${k.color}">${icon(k.icon)}${esc(kicker)}</span>`}
                    <strong>${esc(item.title)}</strong>
                </div>
                ${bigNumber}
            </div>
            ${item.detail ? `<p class="wk-detail">${esc(item.detail)}</p>` : ""}
            ${cueBlock(item)}
            ${changeNote(item) ? `<p class="wk-detail">${changeNote(item)}</p>` : ""}
            ${fuelLine(item)}
            ${item.kind === "strength" && item.actual && item.done ? `<p class="wk-logged">${icon("checkCircle")} Logged${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</p>`
                : item.actual?.distance ? `<p class="wk-logged">${icon("checkCircle")} You ran ${item.actual.distance} mi${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</p>`
                : item.logged ? `<p class="wk-logged">${icon("activity")} You logged ${item.logged} mi${item.autoDone ? " — counts as done" : ""}</p>` : ""}
            ${startFirst
                // One full-width button to begin; "Mark done" and the ⋮ sit quietly under it.
                ? `<div class="wk-actions wk-actions-stack">${linkBtn}</div>
            <div class="wk-actions-row">${doneButton(item, false, true)}${changeButton(item, true)}</div>`
                : `<div class="wk-actions">
                ${doneButton(item)}${linkBtn}
                ${changeButton(item, true)}
            </div>`}
        </div>`;
}

// The coach's own run for today (the marathon plan), in the same card as a client's: the picture and its
// labels first, the name with the miles, the details, one full-width button, and a quiet Mark done. The marathon
// plan keeps its own done record, so the button carries the week and the day (js/app.js ticks it).
export function coachRunCardHtml(item, { href = "marathon.html" } = {}) {
    const picture = contourBlock(item);
    const done = Boolean(item.done);
    const bigNumber = item.miles ? `<span class="wk-big">${item.miles}<small> mi</small></span>` : "";
    const mark = `<button type="button" class="wk-done is-secondary${done ? " is-done" : ""}" data-complete-week="${esc(item.week)}" data-complete-day="${esc(item.dayKey)}"
        aria-pressed="${done}" aria-label="${done ? `Mark ${esc(item.title)} not done` : `Mark ${esc(item.title)} done`}">
        ${icon(done ? "checkCircle" : "check")}<span>${done ? "Done" : "Mark done"}</span>
    </button>`;
    return `
        <div class="wk-card is-run${done ? " is-done" : ""}${picture ? " has-contour" : ""}">
            ${picture}
            <div class="wk-card-top">
                <div class="wk-card-title">
                    ${picture ? "" : `<span class="wk-kicker" style="--kind:${KIND.run.color}">${icon(KIND.run.icon)}Run · Marathon plan</span>`}
                    <strong>${esc(item.title)}</strong>
                </div>
                ${bigNumber}
            </div>
            ${item.detail ? `<p class="wk-detail">${esc(item.detail)}</p>` : ""}
            <div class="wk-actions wk-actions-stack"><a class="sb-btn ${done ? "sb-btn-secondary" : "sb-btn-primary"}" href="${esc(href)}">Open run ${icon("chevronRight")}</a></div>
            <div class="wk-actions-row">${mark}</div>
        </div>`;
}

function itemLine(item) {
    const k = KIND[item.kind] || KIND.run;
    const miles = item.kind === "run" && item.miles && item.title !== "Logged run" ? `${item.miles} mi ` : "";
    const text = item.title === "Logged run" ? `Logged run · ${item.miles} mi` : `${miles}${item.title}`;
    return `
        <li class="wk-item is-${item.state}">
            <span class="wk-dot" style="color:${k.color}">${icon(k.icon)}</span>
            <span class="wk-item-text">
                ${(item.kind === "run" && item.source?.type === "plan") || item.source?.strength ? `<a class="wk-item-link" href="${esc(workoutLink(item).href)}">${esc(text)}</a>` : `<span>${esc(text)}</span>`}
                ${item.detail ? `<small>${esc(item.detail)}</small>` : ""}
                ${changeNote(item)}
                ${item.kind === "strength" && item.actual && item.done ? `<small class="wk-logged-inline">Logged${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</small>`
                    : item.actual?.distance ? `<small class="wk-logged-inline">You ran ${item.actual.distance} mi${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</small>`
                    : item.logged && item.title !== "Logged run" ? `<small class="wk-logged-inline">Logged ${item.logged} mi</small>` : ""}
            </span>
            ${item.state === "missed" ? `<span class="wk-missed">Not done</span>` : item.state === "skipped" ? `<span class="wk-skipped">Skipped</span>` : ""}
            ${(item.autoDone || item.actual) && item.done ? `<span class="wk-status is-done" title="Logged">${icon("checkCircle")}<span class="sr-only">Done (logged)</span></span>` : doneButton(item, true)}
            ${changeButton(item, true)}
        </li>`;
}

// Seven days. `compact` = the Today strip (one line per day); `busyOnly`
// leaves out days with nothing on (someone who only books sessions).
export function weekListHtml(week, { compact = false, busyOnly = false } = {}) {
    const days = busyOnly ? week.days.filter(d => d.items.length) : week.days;
    return `<ol class="wk-days${compact ? " is-compact" : ""}">${days.map(day => {
        const [dow, date] = [shortDay(day.date).split(",")[0], shortDay(day.date).split(", ")[1] || ""];
        const statusIcon = day.status === "done" ? `<span class="wk-status is-done">${icon("checkCircle")}<span class="sr-only">Done</span></span>`
            : day.status === "missed" ? `<span class="wk-status is-missed">${icon("minus")}<span class="sr-only">Not done</span></span>` : "";
        if (compact) {
            const summary = day.items.length
                ? day.items.map(i => i.kind === "run" && i.miles && i.title !== "Logged run" ? `${i.miles} mi ${i.title.toLowerCase()}` : i.title).join(" + ")
                : "Rest";
            return `
                <li class="wk-day is-${day.status}${day.isToday ? " is-today" : ""}">
                    <span class="wk-day-date">${esc(dow)}</span>
                    <span class="wk-day-summary${day.items.length ? "" : " is-rest"}">${esc(summary)}</span>
                    ${day.isToday ? `<span class="wk-today">Today</span>` : statusIcon}
                </li>`;
        }
        return `
            <li class="wk-day is-${day.status}${day.isToday ? " is-today" : ""}">
                <div class="wk-day-head">
                    <span class="wk-day-date">${esc(dow)}<small>${esc(date)}</small></span>
                    ${day.isToday ? `<span class="wk-today">Today</span>` : ""}
                </div>
                ${day.items.length ? `<ul class="wk-items">${day.items.map(itemLine).join("")}</ul>` : `<p class="wk-rest">Rest</p>`}
            </li>`;
    }).join("")}</ol>`;
}

export function summaryLine(summary) {
    const parts = [];
    if (summary.planned) parts.push(`${summary.done} of ${summary.planned} done`);
    if (summary.miles) parts.push(`${summary.milesDone} / ${summary.miles} mi`);
    if (summary.strength.planned) parts.push(`Strength ${summary.strength.done} of ${summary.strength.planned}`);
    if (summary.sessions) parts.push(`${summary.sessions} session${summary.sessions === 1 ? "" : "s"}`);
    return parts.join(" · ");
}

// Mark done / undo anywhere inside `root`; ⋮ opens `onChangeItem(item)`.
export function bindWeekActions(root, { getItem, onChange, onChangeItem }) {
    root.addEventListener("click", async event => {
        const change = event.target.closest("[data-change]");
        if (change) {
            const item = getItem(change.dataset.change);
            if (item && onChangeItem) onChangeItem(item);
            return;
        }
        const btn = event.target.closest("[data-toggle]");
        if (!btn) return;
        const item = getItem(btn.dataset.toggle);
        if (!item) return;
        btn.disabled = true;
        try {
            const done = await toggleDone(item);
            if (done === null) throw new Error("not-found");
            if (done) toast(`${item.title} done. Nice work.`);
            onChange?.();
        } catch (error) {
            console.error("Marking done failed:", error);
            toast(friendlyError(error, "save that"), { type: "error" });
            btn.disabled = false;
        }
    });
}
