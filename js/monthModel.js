/* ==========================================
   Southbound — the month on My Plan (pure)

   One calendar month as Monday-first weeks, each day with the same status the
   week view already works out (js/weekModel.js buildDay): done, "not done"
   (missed), skipped, today, upcoming, or rest. A coach plan on the client's
   device only holds this week and next, so weeks beyond it show what was
   logged and booked, and nothing planned: the month never invents a plan.
   Unit-tested in tests/monthModel.test.mjs.
========================================== */

import { buildWeek } from "./weekModel.js";
import { addDays, mondayOf } from "./coachingPlanModel.js";

export const firstOfMonth = iso => `${String(iso).slice(0, 7)}-01`;

/** The first of the month before / after (n = -1 / 1). */
export function shiftMonth(first, n) {
    const [y, m] = first.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export const monthLabel = first => new Date(`${first}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/**
 * monthGrid(first, inputs, today) -> {
 *   first, label, weeks: [[cell x7]], summary: { done, missed, skipped, planned, miles }
 * }
 * cell: { date, day, inMonth, today, status, kinds: ["run"|"strength"|"cross"|"session"], miles, title }
 * Days outside the month are in the grid (to fill the first and last week) but not in the summary.
 */
export function monthGrid(first, inputs, today) {
    const [y, m] = first.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const end = `${first.slice(0, 8)}${String(last).padStart(2, "0")}`;
    const weeks = [];
    const summary = { done: 0, missed: 0, skipped: 0, planned: 0, miles: 0 };
    for (let monday = mondayOf(first); monday <= end; monday = addDays(monday, 7)) {
        const week = buildWeek(monday, inputs, today);
        weeks.push(week.days.map(day => {
            const inMonth = day.date.slice(0, 7) === first.slice(0, 7);
            const workouts = day.items.filter(i => i.kind !== "session" && i.source?.type !== "log");
            const main = workouts.find(i => i.kind === "run") || day.items[0];
            const miles = Math.round(workouts.filter(i => i.kind === "run").reduce((s, i) => s + (Number(i.miles) || 0), 0) * 10) / 10;
            if (inMonth) {
                summary.planned += workouts.length;
                summary.done += workouts.filter(i => i.done).length;
                summary.missed += workouts.filter(i => i.state === "missed").length;
                summary.skipped += workouts.filter(i => i.state === "skipped").length;
                summary.miles += workouts.filter(i => i.kind === "run" && i.done).reduce((s, i) => s + (Number(i.miles) || 0), 0);
            }
            return {
                date: day.date,
                day: Number(day.date.slice(8)),
                inMonth,
                today: day.isToday,
                status: day.status,
                kinds: [...new Set(day.items.map(i => i.kind))],
                miles,
                title: main?.title || ""
            };
        }));
    }
    summary.miles = Math.round(summary.miles * 10) / 10;
    return { first, label: monthLabel(first), weeks, summary };
}

const KIND_WORD = { run: "run", strength: "strength", cross: "cross-training", session: "session" };
const STATUS_WORD = { done: "done", missed: "not done", skipped: "skipped", today: "today", upcoming: "planned", rest: "rest" };

/** "Tue 14 Oct: run, done" for a screen reader / tooltip. */
export function cellLabel(cell) {
    const when = new Date(`${cell.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const what = cell.kinds.length ? cell.kinds.map(k => KIND_WORD[k] || k).join(" and ") : "";
    const status = STATUS_WORD[cell.status] || "";
    if (cell.status === "rest" && !what) return `${when}: rest`;
    return `${when}: ${[what, status].filter(Boolean).join(", ")}`;
}

/** "12 done · 2 not done · 31.5 mi run". Empty when nothing is planned or logged. */
export function monthSummaryLine(summary) {
    if (!summary.planned && !summary.done) return "";
    const parts = [`${summary.done} done`];
    if (summary.missed) parts.push(`${summary.missed} not done`);
    if (summary.skipped) parts.push(`${summary.skipped} skipped`);
    if (summary.miles) parts.push(`${summary.miles} mi run`);
    return parts.join(" · ");
}
