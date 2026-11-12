/* ==========================================
   Southbound — running, strength and cross-training together (the drawing)

     dayStripHtml / todayLineHtml   Today's "This week" card for the coach: seven
                                    day tiles with a dot per sport, and today's line
     milesCardHtml                  the small miles card under it
     mountWeeklyMiles(el)           the Train page's weekly miles graph
     mountTrainingCalendar(el)      the Train page's calendar: a month of
                                    everything, a filter, and the picked day's
                                    list with a link to each workout
   The numbers come from js/trainingGrid.js (pure). css/trainingGrid.css.
========================================== */

import { sportRows, totalsText, monthGrid, stepMonth, filterItems, SPORT_LABEL, dayStrip, todayPick, weeklyMiles, recentAverage } from "./trainingGrid.js";
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

export { sportRows, totalsText, todayPick, weeklyMiles };

/* ---------- Today's card, day-strip version ---------- */

/** Seven day tiles, a dot per sport (filled = done, outlined = still to do). */
export function dayStripHtml(grid) {
    const tiles = dayStrip(grid).map((d, i) => {
        const dots = d.dots.map(x => `<i class="tg-${x.kind}${x.done ? " is-done" : " is-todo"}"></i>`).join("");
        const say = d.dots.length ? d.dots.map(x => `${SPORT_LABEL[x.kind]} ${x.done ? "done" : "to do"}`).join(", ") : "nothing planned";
        return `<span class="tg-tile${d.isToday ? " is-today" : ""}"><small aria-hidden="true">${esc(dow(d.date))}</small><b aria-hidden="true">${Number(d.date.slice(8))}</b><span class="tg-dots" aria-hidden="true">${dots}</span><span class="sr-only">${esc(`${longDay(d.date)}${d.isToday ? ", today" : ""}: ${say}`)}</span></span>`;
    }).join("");
    return `<div class="tg-strip">${tiles}</div>`;
}

/** "Today · Easy run, 3 mi" with its Open link, or "" when today has no training. */
export function todayLineHtml(item) {
    if (!item) return "";
    let link = null;
    try { link = item.extra ? null : workoutLink(item); } catch { link = null; }
    const miles = item.kind === "run" && item.miles && !/\bmi\b/.test(item.title) ? `, ${item.miles} mi` : "";
    const sub = [item.detail && !String(item.title).toLowerCase().includes(String(item.detail).toLowerCase()) && !String(item.detail).toLowerCase().includes(String(item.title).toLowerCase()) ? item.detail : "", item.planName].filter(Boolean).join(" · ");
    return `<div class="tg-today tg-${item.kind}"><i aria-hidden="true"></i><span class="tg-today-main"><strong>Today · ${esc(item.title)}${esc(miles)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${item.done ? `<span class="tg-done">${CHECK} Done</span>` : ""}${link ? `<a class="tg-open" href="${esc(link.href)}">${esc(link.label)}<span class="sr-only"> ${esc(item.title)}</span></a>` : ""}</div>`;
}

export const stripLegendHtml = () => `<p class="tg-legend" aria-hidden="true"><span><i class="tg-run"></i>Run</span><span><i class="tg-strength"></i>Strength</span><span><i class="tg-cross"></i>Cross</span><span>Outlined = to do</span></p>`;

/* ---------- weekly miles ---------- */

const mi = n => `${Number(n) % 1 ? Number(n).toFixed(1) : Number(n)}`;

/** The card under "This week" on Today (M2): this week's miles and the 4-week average, the graph, the bar,
 *  and the weeks either side. All of it opens Train. */
export function milesCardHtml(weeks) {
    const idx = weeks.findIndex(w => w.kind === "now");
    const now = weeks[idx], last = weeks[idx - 1], next = weeks[idx + 1];
    if (!now) return "";
    const avg = recentAverage(weeks);
    const pct = now.planned ? Math.min(100, Math.round(now.miles / now.planned * 100)) : 0;
    const side = [last ? `<span>Last week ${mi(last.miles)} mi</span>` : "", next && next.planned ? `<span>Next week ${mi(next.planned)} mi planned</span>` : ""].join("");
    return `<a class="tg-miles-link" href="train.html" aria-label="Miles this week: ${mi(now.miles)} of ${mi(now.planned)} planned${avg ? `, last four weeks averaged ${avg}` : ""}. Open the training overview">
        <div class="eos-today-card-header"><h2>Miles this week</h2><span class="wk-see-all">Training <span data-icon="chevronRight"></span></span></div>
        <div class="tg-top"><p class="tg-big"><b>${mi(now.miles)}</b><span>${now.planned ? `of ${mi(now.planned)} mi` : "mi so far"}</span></p>${avg ? `<span class="tg-avg-text">4-wk avg <b>${avg}</b></span>` : ""}</div>
        ${hasMiles(weeks) ? milesSvg(weeks, { compact: true }) : ""}
        <div class="tg-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        ${side ? `<p class="tg-side">${side}</p>` : ""}</a>`;
}

const shortDate = iso => D(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }).replace(" ", " ");

/** The line graph itself: finished weeks solid, planned dashed, this week marked, the 4-week average dotted.
 *  `compact` is the shorter one inside Today's card (hidden from screen readers: the card's label says it). */
function milesSvg(weeks, { compact = false } = {}) {
    const idx = weeks.findIndex(w => w.kind === "now");
    const avg = recentAverage(weeks);
    const W = 340, H = compact ? 112 : 140, L = 22, R = 22, T = 18, B = 22;
    const top = Math.max(10, ...weeks.map(w => Math.max(w.miles, w.planned)));
    const x = i => L + i * (W - L - R) / Math.max(1, weeks.length - 1);
    const y = v => T + (1 - v / top) * (H - T - B);
    const pts = weeks.map((w, i) => [x(i), y(w.miles)]);
    const path = a => a.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    // This week's dashed line to the plan starts at this week's planned miles, so a quiet week doesn't drag the plan down.
    const planPts = [[x(idx), y(weeks[idx].planned)], ...pts.slice(idx + 1)];
    const past = pts.slice(0, idx + 1);
    const base = H - B;
    const labels = weeks.map((w, i) => (i % 2 === (idx % 2) ? `<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle" class="tg-ax${i === idx ? " is-now" : ""}">${esc(i === idx ? "This week" : shortDate(w.monday))}</text>` : "")).join("");
    const dots = weeks.map((w, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(i > idx ? w.planned : w.miles).toFixed(1)}" r="${i === idx ? 5 : 3.5}" class="tg-pt${i > idx ? " is-plan" : ""}${i === idx ? " is-now" : ""}"/>`).join("");
    const avgLine = avg ? `<line x1="${L}" x2="${W - R}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" class="tg-avg"/><text x="${W - R}" y="${(y(avg) - 4).toFixed(1)}" text-anchor="end" class="tg-ax">avg ${avg}</text>` : "";
    const nowLabel = weeks[idx].miles ? `<text x="${x(idx).toFixed(1)}" y="${(y(weeks[idx].miles) - 9).toFixed(1)}" text-anchor="middle" class="tg-val">${mi(weeks[idx].miles)}</text>` : "";
    const rows = weeks.map(w => `${shortDate(w.monday)}: ${w.kind === "plan" ? `${mi(w.planned)} planned` : w.kind === "now" ? `${mi(w.miles)} of ${mi(w.planned)} planned` : `${mi(w.miles)} run`}`).join("; ");
    const aria = compact ? `aria-hidden="true"` : `role="img" aria-label="${esc(`Weekly run miles. ${rows}`)}"`;
    return `<svg class="tg-graph${compact ? " is-compact" : ""}" viewBox="0 0 ${W} ${H}" ${aria} preserveAspectRatio="xMidYMid meet">
            ${avgLine}
            <path d="${path(past)} L${past.at(-1)[0].toFixed(1)} ${base} L${past[0][0].toFixed(1)} ${base}Z" class="tg-area"/>
            <path d="${path(past)}" class="tg-line"/>
            ${planPts.length > 1 ? `<path d="${path(planPts)}" class="tg-line is-plan"/>` : ""}
            ${dots}${nowLabel}${labels}
        </svg>`;
}

const hasMiles = weeks => weeks.some(w => w.kind === "now") && weeks.some(w => w.planned || w.miles);

/** The Train page's graph: eight or nine weeks of run miles, finished solid, planned dashed, this week marked. */
export function milesGraphHtml(weeks) {
    if (!hasMiles(weeks)) {
        return `<div class="eos-today-card-header"><h2 id="tgMilesTitle">Weekly miles</h2></div><p class="tg-none">No running logged or planned in these weeks yet.</p>`;
    }
    const avg = recentAverage(weeks);
    return `<div class="eos-today-card-header"><h2 id="tgMilesTitle">Weekly miles</h2>${avg ? `<span class="tg-avg-text">Last 4 weeks avg ${avg} mi</span>` : ""}</div>
        ${milesSvg(weeks)}
        <p class="tg-legend" aria-hidden="true"><span>Solid = run</span><span>Dashed = planned</span></p>`;
}

export function mountWeeklyMiles(el, { today = todayIso() } = {}) {
    if (!el) return { update() {} };
    const draw = () => {
        let inputs, completed;
        try { inputs = weekInputs([]); } catch { inputs = { plans: [], strength: [], sessions: [], runLog: [], planned: [] }; }
        try { completed = storedSessions(); } catch { completed = []; }
        el.innerHTML = milesGraphHtml(weeklyMiles(inputs, today, completed));
        el.hidden = false;
    };
    ["sb:sessions-changed", "eddieos:running-programs-changed", "eddieos:training-programs-changed", "storage"].forEach(name => window.addEventListener(name, draw));
    draw();
    return { update: draw };
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
