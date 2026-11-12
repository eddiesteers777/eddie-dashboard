/* ==========================================
   Southbound — running, strength and cross-training together (the drawing)

     sportGridHtml(grid)            Today's "This week" card for the coach: one
                                    row per sport across the seven days
     mountTrainingCalendar(el)      the Train page's calendar: a month of
                                    everything, a filter, and the picked day's
                                    list with a link to each workout
   The numbers come from js/trainingGrid.js (pure). css/trainingGrid.css.
========================================== */

import { sportRows, totalsText, monthGrid, stepMonth, filterItems, SPORT_LABEL } from "./trainingGrid.js";
import { weekInputs, workoutLink } from "./weekData.js";
import { storedSessions } from "./sessionStore.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CHECK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const D = iso => new Date(`${iso}T12:00:00`);
const dow = iso => D(iso).toLocaleDateString(undefined, { weekday: "short" });
const longDay = iso => D(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const STATE_WORDS = { done: "done", today: "today", missed: "not done", skipped: "skipped", upcoming: "coming up" };
const pad = n => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export { sportRows, totalsText };

/* ---------- Today's card ---------- */

export function sportGridHtml(grid) {
    const head = grid.days.map(d => `<span class="tg-h${d.isToday ? " is-today" : ""}" aria-hidden="true">${esc(dow(d.date))}<b>${Number(d.date.slice(8))}</b></span>`).join("");
    const rows = grid.rows.map(row => {
        const cells = row.cells.map((c, i) => {
            if (!c) return `<span class="tg-c is-empty" aria-hidden="true"></span>`;
            const what = row.kind === "run" && c.miles ? `${c.miles} miles` : c.titles.join(", ");
            const inside = c.done ? CHECK : row.kind === "run" && c.miles ? esc(String(c.miles)) : c.count > 1 ? String(c.count) : "";
            return `<span class="tg-c tg-${row.kind}${c.done ? " is-done" : " is-todo"}${c.state === "missed" ? " is-missed" : ""}"><span aria-hidden="true">${inside}</span><span class="sr-only">${esc(`${longDay(grid.days[i].date)}: ${row.label}, ${what}, ${STATE_WORDS[c.state] || ""}`)}</span></span>`;
        }).join("");
        return `<span class="tg-r">${esc(row.kind === "cross" ? "Cross" : row.label)}</span>${cells}`;
    }).join("");
    return `<div class="tg-grid"><span></span>${head}${rows}</div>`;
}

/* ---------- the Train page's calendar ---------- */

const FILTERS = [["all", "All"], ["run", "Run"], ["strength", "Strength"], ["cross", "Cross"]];

function itemRow(item) {
    let link = null;
    try { link = item.extra ? null : workoutLink(item); } catch { link = null; }
    const detail = item.detail || "";
    const sub = [item.kind === "run" && item.miles && !/\bmi\b/.test(detail) ? `${item.miles} mi` : "", detail, item.planName || ""].filter(Boolean).join(" · ");
    const state = item.done ? `<span class="tg-done">${CHECK} Done</span>` : item.state === "missed" ? `<span class="tg-miss">Not done</span>` : "";
    return `<li class="tg-item"><i class="tg-${item.kind}" aria-hidden="true"></i><span class="tg-item-main"><strong>${esc(item.title)}</strong><small>${esc(sub || SPORT_LABEL[item.kind])}</small></span>${state}${link ? `<a class="tg-open" href="${esc(link.href)}">${esc(link.label)}<span class="sr-only"> ${esc(item.title)}</span></a>` : ""}</li>`;
}

export function calendarHtml(model, { filter = "all", selected = "", today = "" } = {}) {
    const monthName = new Date(model.year, model.month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const cells = model.weeks.map(week => week.map(c => {
        const items = filterItems(c.items, filter);
        const marks = items.slice(0, 4).map(i => `<i class="tg-${i.kind}${i.done ? " is-done" : " is-todo"}"></i>`).join("");
        const pills = items.slice(0, 3).map(i => `<span class="tg-pill tg-${i.kind}${i.done ? " is-done" : " is-todo"}">${esc(i.kind === "run" && i.miles ? `${i.miles} mi ${i.title.toLowerCase()}` : i.title)}</span>`).join("") + (items.length > 3 ? `<span class="tg-more">+${items.length - 3}</span>` : "");
        const label = `${longDay(c.date)}${c.isToday ? ", today" : ""}: ${items.length ? items.map(i => `${i.title}${i.done ? ", done" : ""}`).join("; ") : "nothing planned"}`;
        return `<button type="button" class="tg-day${c.inMonth ? "" : " is-out"}${c.isToday ? " is-today" : ""}${c.date === selected ? " is-sel" : ""}" data-tg-day="${c.date}" aria-pressed="${c.date === selected}" aria-label="${esc(label)}"><b aria-hidden="true">${c.day}</b><span class="tg-marks" aria-hidden="true">${marks}</span><span class="tg-pills" aria-hidden="true">${pills}</span></button>`;
    }).join("")).join("");
    const all = model.weeks.flat();
    const picked = all.find(c => c.date === selected);
    const pickedItems = picked ? filterItems(picked.items, filter) : [];
    const dayList = picked ? `<div class="tg-daylist"><h3>${esc(longDay(picked.date))}${picked.date === today ? " · today" : ""}</h3>${pickedItems.length ? `<ul>${pickedItems.map(itemRow).join("")}</ul>` : `<p class="tg-none">Nothing planned.</p>`}</div>` : "";
    const empty = model.count === 0 ? `<div class="tg-empty"><strong>No training on the calendar this month</strong><p>Plans from Running, Strength and Cross-training all land here.</p><a class="sb-btn sb-btn-secondary" href="programs.html">Build a plan</a></div>` : "";
    return `<div class="eos-today-card-header tg-head"><h2 id="tgTitle">Training calendar</h2>
            <span class="tg-nav"><button type="button" class="sb-btn sb-btn-icon" data-tg-step="-1" aria-label="Previous month">‹</button><span class="tg-month" aria-live="polite">${esc(monthName)}</span><button type="button" class="sb-btn sb-btn-icon" data-tg-step="1" aria-label="Next month">›</button></span></div>
        <div class="tg-filter" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button type="button" class="tg-chip${filter === k ? " is-on" : ""}" data-tg-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join("")}</div>
        <div class="tg-month-grid"><div class="tg-dows" aria-hidden="true">${["M", "T", "W", "T", "F", "S", "S"].map(d => `<span>${d}</span>`).join("")}</div><div class="tg-days">${cells}</div></div>
        ${empty}${dayList}
        <p class="tg-legend" aria-hidden="true"><span><i class="tg-run"></i>Run</span><span><i class="tg-strength"></i>Strength</span><span><i class="tg-cross"></i>Cross-training</span><span>Outlined = still to do</span></p>`;
}

export function mountTrainingCalendar(el, { today = todayIso() } = {}) {
    if (!el) return { update() {} };
    const st = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), filter: "all", selected: today };
    const draw = () => {
        let inputs, completed;
        try { inputs = weekInputs([]); } catch { inputs = { plans: [], strength: [], sessions: [], runLog: [], planned: [] }; }
        try { completed = storedSessions(); } catch { completed = []; }
        el.innerHTML = calendarHtml(monthGrid(st.year, st.month, inputs, today, completed), { filter: st.filter, selected: st.selected, today });
        el.hidden = false;
    };
    el.addEventListener("click", ev => {
        const step = ev.target.closest("[data-tg-step]"), chip = ev.target.closest("[data-tg-filter]"), day = ev.target.closest("[data-tg-day]");
        if (step) {
            Object.assign(st, stepMonth(st.year, st.month, Number(step.dataset.tgStep)));
            const here = today.slice(0, 7) === `${st.year}-${pad(st.month)}`;
            st.selected = here ? today : "";
        } else if (chip) st.filter = chip.dataset.tgFilter;
        else if (day) st.selected = day.dataset.tgDay;
        else return;
        const focus = step ? `[data-tg-step="${step.dataset.tgStep}"]` : chip ? `[data-tg-filter="${st.filter}"]` : `[data-tg-day="${st.selected}"]`;
        draw();
        el.querySelector(focus)?.focus();
    });
    ["sb:sessions-changed", "eddieos:running-programs-changed", "eddieos:training-programs-changed", "eddieos:strength-history-updated", "storage"].forEach(name => window.addEventListener(name, draw));
    draw();
    return { update: draw };
}
