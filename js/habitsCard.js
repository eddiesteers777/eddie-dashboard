/* ==========================================
   Southbound — Analytics → Recovery: your month, and what your habits do

   The morning check-in's answers (nose strip, mouth tape, alcohol…, water)
   next to the nights they came before (js/habitImpact.js, pure):
     · a month at a glance against the month before (sleep, sleep score,
       HRV, resting HR, readiness, COROS recovery), ‹ › to move months;
     · the month as a calendar: each day's readiness, dots for the habits,
       tap a habit to light up its days;
     · what each habit is linked to over the last 90 days, against your
       own baseline, with the range and how many nights it rests on.
   Everything stays on the device and in your own synced data.
========================================== */

import { inputs, load } from "./readinessData.js";
import { READINESS_KEY, TAGS, colorOf, hm, computeReadiness } from "./readiness.js";
import { nightsFrom, habitEffects, monthRecap, changeText, nightsToGo, prevMonth, nextMonth, addDays, OUTCOMES, MIN_EACH, MIN_WATER_DAYS, IMPACT_VERSION, AMOUNTS } from "./habitImpact.js";
import { kindChip } from "./analyticsSummary.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const monthName = m => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shortMonth = m => new Date(`${m}-15T12:00:00`).toLocaleDateString("en-US", { month: "short" });
const dayText = d => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
// The habits drawn as dots on the calendar (the overnight ones first, then the rest by use).
const DOT_COLORS = ["var(--primary)", "var(--cyan)", "var(--purple)", "var(--orange)", "var(--pink)"];

let month = isoToday().slice(0, 7);
let focus = null;   // a habit id lit up on the calendar

function nutritionDays() {
    const out = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const m = /^nutrition-(\d{4}-\d{2}-\d{2})$/.exec(k || "");
            if (!m) continue;
            const day = JSON.parse(localStorage.getItem(k) || "null") || {};
            const water = Number(day.water) || 0, protein = Number(day.protein) || 0;
            if (water > 0 || protein > 0) out[m[1]] = { water, protein };
        }
    } catch {}
    return out;
}

function data() {
    const d = inputs();
    // Readiness by day is saved for recent weeks; older nights are worked out from their health numbers.
    const readiness = { ...load(READINESS_KEY, {}) };
    for (const date of Object.keys(d.health || {})) {
        if (readiness[date]?.bodyScore != null) continue;
        const r = computeReadiness(date, d);
        if (r.bodyScore != null) readiness[date] = { score: r.score, bodyScore: r.bodyScore, color: r.color };
    }
    return { checkins: d.checkins || {}, health: d.health || {}, fitness: d.fitness || {}, readiness, nutrition: nutritionDays() };
}

const valueText = (key, v) => {
    if (v == null) return "–";
    if (key === "sleep") return hm(v);
    if (key === "recovery") return `${Math.round(v)}%`;
    return `${Math.round(v)}${key === "hrv" ? " ms" : key === "rhr" ? " bpm" : ""}`;
};

function tilesHtml(r) {
    return `<div class="hb-tiles">${r.averages.map(a => {
        const tone = a.change == null || Math.abs(a.change) < 0.5 ? "" : a.change * a.better > 0 ? "good" : "bad";
        return `<div class="hb-tile"><span>${esc(a.label)}</span><strong>${valueText(a.key, a.avg)}</strong>
            <small class="${tone}">${a.change == null ? (a.n ? `${a.n} nights` : "no data") : `${changeText(a.change, a.unit)} vs ${shortMonth(prevMonth(r.month))}`}</small></div>`;
    }).join("")}</div>`;
}

function habitChips(r) {
    const chips = r.habits.filter(h => h.nights).map((h, i) => `<button type="button" class="hb-chip${focus === h.id ? " is-on" : ""}" data-focus="${h.id}" style="--dot:${DOT_COLORS[i % DOT_COLORS.length]}"><i></i>${esc(h.label)} <b>${h.nights}</b></button>`).join("");
    const NAMES = { water: "Water", protein: "Protein" };
    const amountLine = a => { const x = r.amounts[a.id]; return x.days
        ? `<span class="hb-water">${NAMES[a.id]}: <b>${Math.round(x.avg)} ${a.unit}</b> a day on ${x.days} ${x.days === 1 ? "day" : "days"} logged${x.prev != null ? ` (${changeText(x.avg - x.prev, a.unit)} vs ${shortMonth(prevMonth(r.month))})` : ""}</span>`
        : `<span class="hb-water">No ${a.id} logged this month: add it in the morning check-in.</span>`; };
    const water = AMOUNTS.map(amountLine).join("");
    return `<div class="hb-chips">${chips || `<span class="hb-muted">No habits ticked this month yet.</span>`}</div>${water}`;
}

function calendarHtml(r, today) {
    const dotIds = r.habits.filter(h => h.nights).map(h => h.id).slice(0, DOT_COLORS.length);
    const first = new Date(`${r.from}T12:00:00`);
    const lead = (first.getDay() + 6) % 7;   // Monday first
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const byDate = Object.fromEntries(r.rows.map(x => [x.date, x]));
    const cells = Array.from({ length: lead }, () => `<span class="hb-cell is-blank"></span>`);
    for (let n = 1; n <= days; n++) {
        const date = `${r.month}-${pad(n)}`;
        const row = byDate[date];
        const score = row?.values.readiness;
        const later = date > today;
        const dots = row ? dotIds.map((id, i) => (row.tags.has(id) ? `<i style="background:${DOT_COLORS[i]}"></i>` : "")).join("") : "";
        const lit = focus && row?.tags.has(focus);
        const label = row ? `${dayText(date)}: readiness ${score ?? "–"}${row.water != null ? `, ${row.water} oz water` : ""}${row.protein != null ? `, ${row.protein} g protein` : ""}${row.water != null || row.protein != null ? " the day before" : ""}${[...row.tags].length ? `, ${[...row.tags].map(t => TAGS.find(x => x.id === t)?.label || t).join(", ")}` : ""}` : dayText(date);
        cells.push(`<span class="hb-cell ${later ? "is-later" : colorOf(score ?? null)}${lit ? " is-lit" : ""}${focus && !lit ? " is-dim" : ""}" title="${esc(label)}"><em>${n}</em><b>${later || score == null ? "" : score}</b><span class="hb-dots">${dots}</span></span>`);
    }
    return `<div class="hb-cal" role="img" aria-label="${esc(monthName(r.month))}: readiness by day with habit dots">
        ${["M", "T", "W", "T", "F", "S", "S"].map(d => `<span class="hb-dow">${d}</span>`).join("")}${cells.join("")}</div>
        <p class="hb-legend"><span><i class="green"></i>67+</span><span><i class="yellow"></i>34–66</span><span><i class="red"></i>under 34</span>readiness (body), dots = habits that night</p>`;
}

function effectRow(e) {
    const unread = e.results.filter(r => r.verdict === "few");
    if (e.amount && e.need != null) return `<li class="hb-eff"><div class="hb-eff-top"><strong>${esc(e.label)}</strong><span>${e.total} of ${MIN_WATER_DAYS} days with ${e.id} logged</span></div><p class="hb-muted">Log ${e.id} on ${e.need} more ${e.need === 1 ? "day" : "days"} to see what it does.</p></li>`;
    const toGo = nightsToGo(e);
    const linked = e.linked.map(r => `<span class="hb-link ${r.verdict}">${esc(r.label)} ${changeText(r.diff, r.unit)}<small>${changeText(r.lo, r.unit)} to ${changeText(r.hi, r.unit)}</small></span>`).join("");
    const head = `<div class="hb-eff-top"><strong>${esc(e.label)}</strong><span>${e.nights} ${e.nights === 1 ? "night" : "nights"} with${e.amount ? "" : ` · ${e.total - e.nights} without`}</span></div>`;
    if (toGo) return `<li class="hb-eff is-few">${head}<p class="hb-muted">${e.nights < MIN_EACH ? `${MIN_EACH - e.nights} more ${MIN_EACH - e.nights === 1 ? "night" : "nights"} with it` : `${toGo} more ${toGo === 1 ? "night" : "nights"} without it`} before this shows (5 of each, like WHOOP's Journal).</p></li>`;
    const table = `<details class="hb-more"><summary>Every number</summary><table class="hb-table"><thead><tr><th></th><th>With vs without</th><th>90% range</th><th>Nights</th></tr></thead><tbody>${e.results.filter(r => r.verdict !== "nodata").map(r => r.verdict === "few"
        ? `<tr><th>${esc(r.label)}</th><td colspan="3" class="hb-muted">not enough nights</td></tr>`
        : `<tr class="${r.verdict}"><th>${esc(r.label)}</th><td>${changeText(r.diff, r.unit)}</td><td>${changeText(r.lo, r.unit)} to ${changeText(r.hi, r.unit)}</td><td>${r.nWith} / ${r.nWithout}</td></tr>`).join("")}</tbody></table></details>`;
    return `<li class="hb-eff${e.linked.length ? "" : " is-none"}">${head}
        ${linked ? `<div class="hb-links">${linked}</div>` : `<p class="hb-muted">No clear link yet with sleep, HRV, resting HR or readiness${unread.length ? ` (${unread.length} still need more nights)` : ""}.</p>`}
        ${e.overlap ? `<p class="hb-note">Mostly on the same nights as ${esc(e.overlap.label)} (${Math.round(e.overlap.share * 100)}%), so the two are hard to tell apart.</p>` : ""}
        ${table}</li>`;
}

function howHtml() {
    return `<details class="hb-how"><summary>How this is worked out, and what research says</summary>
        <ul>
            <li>Each night's number is compared with <b>your own baseline</b>: the median of the 28 nights before it. A training block, heat or a new season moves the baseline, so they don't get credited to a habit.</li>
            <li>A habit compares nights with it against nights without, over the <b>last 90 days</b> of check-ins. Like WHOOP's Journal, it needs <b>5 of each</b> before it says anything.</li>
            <li>"Linked" means the whole 90% range sits on one side of zero. Otherwise it says no clear link yet. It's your own pattern, not proof: habits come together (a late dinner on alcohol nights), and it says so when two mostly share nights.</li>
            <li>Water and protein: days at or above your own usual amount against the rest, the next night's numbers, once 10 days are logged. The check-in's amounts are yesterday's and go into that day's Nutrition log too.</li>
            <li>Readiness here is the body part only (HRV, resting HR, sleep), so how you said you felt can't count twice.</li>
        </ul>
        <p class="hb-research"><b>What studies say so far.</b> Mouth taping: a 2025 systematic review (10 small studies) found little good evidence it helps sleep in most people, some benefit only in mild sleep apnea, and safety concerns; don't tape if you can't breathe freely through your nose. Nasal strips: they open the nose and help some people with congestion or snoring, but trials on sleep quality are mixed. Hydration: being clearly dehydrated (about 3% of body weight) lowered HRV in a small study of athletes. Protein: in trials with elite athletes, 40 g of protein before bed didn't help or hurt sleep, so a link here more likely says something about your day (training, meals) than the protein itself. A new or different bed: the "first-night effect" is well known in sleep labs, with lighter sleep and more waking on the first night somewhere unfamiliar. Your own data, with enough nights, is the better guide for you.</p>
        <p class="hb-muted">Habit analysis ${IMPACT_VERSION}</p>
    </details>`;
}

function render() {
    const el = $("habitsPanel");
    if (!el) return;
    const today = isoToday();
    const d = data();
    const r = monthRecap({ ...d, month, today });
    const end = r.to;
    const rows = nightsFrom({ ...d, from: addDays(end, -(90 + 28)), to: end });
    const effects = habitEffects(rows, { to: end });
    const anyCheckins = Object.keys(d.checkins).length;
    // Only habits ticked at least once in the window; the rest are one line.
    const shown = effects.filter(e => e.nights || (e.amount && e.total));
    const untried = effects.filter(e => !e.amount && !e.nights && !TAGS.find(t => t.id === e.id)?.retired);
    const isNow = month >= today.slice(0, 7);
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>Habits and recovery ${kindChip("calculated")}</h2>
            <p>Your month next to the one before, and what each check-in answer goes with in your sleep, HRV, resting heart rate and readiness.</p>
        </div></div>
        <div class="hb-month">
            <button type="button" class="hb-nav" data-month="prev" aria-label="Previous month">‹</button>
            <h3>${esc(monthName(month))}</h3>
            <button type="button" class="hb-nav" data-month="next" aria-label="Next month"${isNow ? " disabled" : ""}>›</button>
        </div>
        <p class="hb-sub">${r.checkins} ${r.checkins === 1 ? "check-in" : "check-ins"} on ${r.days} ${r.days === 1 ? "day" : "days"}${r.best ? ` · best day ${dayText(r.best.date)} (${r.best.values.readiness})` : ""}${r.worst ? ` · lowest ${dayText(r.worst.date)} (${r.worst.values.readiness})` : ""}</p>
        ${tilesHtml(r)}
        <h3 class="hb-h">This month's habits</h3>
        ${habitChips(r)}
        ${calendarHtml(r, today)}
        <h3 class="hb-h">What each habit goes with <span>last 90 days to ${esc(dayText(end))}</span></h3>
        ${!anyCheckins ? `<p class="hb-muted">Do the morning check-in on Today and tick what you did. After 5 nights with a habit and 5 without, this starts showing what it does for you.</p>`
            : shown.length ? `<ul class="hb-effs">${shown.map(effectRow).join("")}</ul>` : `<p class="hb-muted">Nothing ticked in the last 90 days yet.</p>`}
        ${anyCheckins && untried.length ? `<p class="hb-muted hb-untried">Not ticked in the last 90 days: ${esc(untried.map(e => e.label).join(", "))}.</p>` : ""}
        ${howHtml()}`;
}

function mount() {
    const el = $("habitsPanel");
    if (!el) return;
    render();
    el.addEventListener("click", event => {
        const nav = event.target.closest("[data-month]");
        if (nav && !nav.disabled) { month = nav.dataset.month === "prev" ? prevMonth(month) : nextMonth(month); focus = null; render(); }
        const chip = event.target.closest("[data-focus]");
        if (chip) { focus = focus === chip.dataset.focus ? null : chip.dataset.focus; render(); }
    });
    window.addEventListener("sb:readiness-updated", render);
    window.addEventListener("storage", render);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();

export { render as renderHabits, OUTCOMES };
