/* ==========================================
   Southbound — running, strength and cross-training together (pure)

   Two shapes built from the one-week-everything model (js/weekModel.js):
     sportRows(week, completed)        the "This week" card: one row per sport
                                       across the seven days, plus the totals
     monthGrid(year, month, inputs, today, completed)
                                       the Train page's calendar: whole weeks
                                       (Monday first) covering one month

   `completed` = strength / cross-training sessions finished on this account
   (js/sessionStore.js storedSessions). One that was never on a plan still
   shows, as a done item, on the day it happened. No DOM or storage here;
   unit-tested in tests/trainingGrid.test.mjs.
========================================== */

import { buildDay } from "./weekModel.js";
import { addDays } from "./coachingPlanModel.js";

export const SPORTS = ["run", "strength", "cross"];
export const SPORT_LABEL = { run: "Run", strength: "Strength", cross: "Cross-training" };
const round1 = n => Math.round((Number(n) || 0) * 10) / 10;
const pad = n => String(n).padStart(2, "0");

/** A day's training items (no booked sessions), with unplanned finished sessions added. */
export function trainingItems(day, completed = []) {
    const items = (day.items || []).filter(i => SPORTS.includes(i.kind)).map(i => ({ ...i }));
    for (const s of completed) {
        if (!s || s.deleted || s.date !== day.date || !["strength", "cross"].includes(s.type)) continue;
        if (items.some(i => i.kind === s.type)) continue; // the planned one is the same session
        items.push({ id: `done:${s.id}`, kind: s.type, title: s.title || SPORT_LABEL[s.type], detail: "", miles: 0, done: true, state: "done", extra: true, source: { type: "completed", sessionId: s.id, date: s.date } });
    }
    return items;
}

function cell(items, kind) {
    const mine = items.filter(i => i.kind === kind);
    if (!mine.length) return null;
    const done = mine.every(i => i.done);
    return {
        count: mine.length,
        miles: round1(mine.reduce((t, i) => t + (Number(i.miles) || 0), 0)),
        done,
        state: done ? "done" : mine.some(i => i.state === "today") ? "today" : mine.some(i => i.state === "missed") ? "missed" : mine.every(i => i.state === "skipped" || i.done) ? "skipped" : "upcoming",
        titles: mine.map(i => i.title)
    };
}

/** The card: { days: [{ date, isToday }], rows: [{ kind, label, cells: [cell|null x7] }], totals } */
export function sportRows(week, completed = []) {
    const perDay = week.days.map(d => trainingItems(d, completed));
    const rows = SPORTS.map(kind => ({ kind, label: SPORT_LABEL[kind], cells: perDay.map(items => cell(items, kind)) }));
    const all = perDay.flat();
    const of = kind => all.filter(i => i.kind === kind);
    return {
        days: week.days.map(d => ({ date: d.date, isToday: Boolean(d.isToday) })),
        rows,
        totals: {
            miles: round1(of("run").reduce((t, i) => t + (Number(i.miles) || 0), 0)),
            milesDone: round1(of("run").filter(i => i.done).reduce((t, i) => t + (Number(i.miles) || 0), 0)),
            runs: of("run").length, strength: of("strength").length, cross: of("cross").length,
            planned: all.length, done: all.filter(i => i.done).length
        }
    };
}

/** "6.5 mi · 2 lifts · 3 cross": only the sports that have something. */
export function totalsText(t) {
    const bits = [];
    if (t.runs) bits.push(`${t.miles} mi`);
    if (t.strength) bits.push(`${t.strength} lift${t.strength === 1 ? "" : "s"}`);
    if (t.cross) bits.push(`${t.cross} cross`);
    return bits.join(" · ");
}

export const mondayOf = iso => {
    const d = new Date(`${iso}T12:00:00`);
    return addDays(iso, -((d.getDay() + 6) % 7));
};

/** Whole weeks covering a month. month is 1-12. -> { year, month, weeks: [[{ date, day, inMonth, isToday, items }]] , count } */
export function monthGrid(year, month, inputs, today, completed = []) {
    const first = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const last = `${year}-${pad(month)}-${pad(lastDay)}`;
    const weeks = [];
    let count = 0;
    for (let start = mondayOf(first); start <= last; start = addDays(start, 7)) {
        const row = [];
        for (let i = 0; i < 7; i++) {
            const date = addDays(start, i);
            const inMonth = date >= first && date <= last;
            const items = trainingItems(buildDay(date, inputs, today), completed);
            if (inMonth) count += items.length;
            row.push({ date, day: Number(date.slice(8)), inMonth, isToday: date === today, items });
        }
        weeks.push(row);
    }
    return { year, month, weeks, count };
}

/** Next / previous month as { year, month }. */
export function stepMonth(year, month, by) {
    const d = new Date(year, month - 1 + by, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export const filterItems = (items, kind) => (kind && kind !== "all" ? items.filter(i => i.kind === kind) : items);
