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
import { toggleDone, workoutLink } from "./weekData.js";
import { shortDay } from "./coachingPlanModel.js";
import { toast, friendlyError } from "./ui.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const KIND = {
    run: { icon: "activity", color: "var(--primary)" },
    strength: { icon: "dumbbell", color: "var(--orange)" },
    cross: { icon: "bike", color: "var(--cyan)" },
    session: { icon: "users", color: "var(--purple)" }
};

// A logged coach-plan workout is done or skipped by its log (edit it on the workout page), not a tap.
const canToggle = item => ["plan", "extra", "strength"].includes(item.source?.type) && !item.autoDone && !item.actual;

function doneButton(item, compact = false) {
    if (!canToggle(item)) return "";
    return `<button type="button" class="wk-done${item.done ? " is-done" : ""}${compact ? " is-compact" : ""}" data-toggle="${esc(item.id)}"
        aria-pressed="${item.done}" aria-label="${item.done ? `Mark ${esc(item.title)} not done` : `Mark ${esc(item.title)} done`}">
        ${icon(item.done ? "checkCircle" : "check")}${compact ? "" : `<span>${item.done ? "Done" : "Mark done"}</span>`}
    </button>`;
}

// Today's workout, front and center.
export function workoutCardHtml(item) {
    const k = KIND[item.kind] || KIND.run;
    const link = workoutLink(item);
    const bigNumber = item.kind === "run" && item.miles ? `<span class="wk-big">${item.miles}<small> mi</small></span>` : "";
    return `
        <div class="wk-card is-${item.kind}${item.done ? " is-done" : ""}">
            <div class="wk-card-top">
                <span class="wk-icon" style="color:${k.color}">${icon(k.icon)}</span>
                <div class="wk-card-title">
                    <strong>${esc(item.title)}</strong>
                    ${item.kind !== "session" && (item.planName || item.fromCoach) ? `<span class="wk-meta">${esc([item.fromCoach ? "From your coach" : "", item.planName].filter(Boolean).join(" · "))}</span>` : ""}
                </div>
                ${bigNumber}
            </div>
            ${item.detail ? `<p class="wk-detail">${esc(item.detail)}</p>` : ""}
            ${item.kind === "strength" && item.actual && item.done ? `<p class="wk-logged">${icon("checkCircle")} Logged${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</p>`
                : item.actual?.distance ? `<p class="wk-logged">${icon("checkCircle")} You ran ${item.actual.distance} mi${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</p>`
                : item.logged ? `<p class="wk-logged">${icon("activity")} You logged ${item.logged} mi${item.autoDone ? " -- counts as done" : ""}</p>` : ""}
            <div class="wk-actions">
                ${doneButton(item)}
                <a class="sb-btn sb-btn-secondary" href="${esc(link.href)}">${esc(link.label)} ${icon("chevronRight")}</a>
            </div>
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
                ${item.kind === "strength" && item.actual && item.done ? `<small class="wk-logged-inline">Logged${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</small>`
                    : item.actual?.distance ? `<small class="wk-logged-inline">You ran ${item.actual.distance} mi${item.actual.rpe ? ` · effort ${item.actual.rpe}/10` : ""}${item.actual.pain ? " · pain flagged" : ""}</small>`
                    : item.logged && item.title !== "Logged run" ? `<small class="wk-logged-inline">Logged ${item.logged} mi</small>` : ""}
            </span>
            ${item.state === "missed" ? `<span class="wk-missed">Missed</span>` : item.state === "skipped" ? `<span class="wk-skipped">Skipped</span>` : ""}
            ${(item.autoDone || item.actual) && item.done ? `<span class="wk-status is-done" title="Logged">${icon("checkCircle")}<span class="sr-only">Done (logged)</span></span>` : doneButton(item, true)}
        </li>`;
}

// Seven days. `compact` = the Today strip (one line per day).
export function weekListHtml(week, { compact = false } = {}) {
    return `<ol class="wk-days${compact ? " is-compact" : ""}">${week.days.map(day => {
        const [dow, date] = [shortDay(day.date).split(",")[0], shortDay(day.date).split(", ")[1] || ""];
        const statusIcon = day.status === "done" ? `<span class="wk-status is-done">${icon("checkCircle")}<span class="sr-only">Done</span></span>`
            : day.status === "missed" ? `<span class="wk-status is-missed">${icon("alertTriangle")}<span class="sr-only">Missed</span></span>` : "";
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

// Mark done / undo anywhere inside `root`.
export function bindWeekActions(root, { getItem, onChange }) {
    root.addEventListener("click", async event => {
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
