/* ==========================================
   Southbound — the plan screen

   The Marathon page's design for any plan the race plan generator makes
   (5K, 10K, half marathon, marathon): the countdown, this week's seven days,
   the day card, the season chart and the blocks. Eddie picked this layout
   (option B, 2026-11-11). The numbers come from js/planScreenModel.js, the
   look from css/planScreen.css (scoped to .ps-root).

   mountPlanScreen(root, { getRecord, onEdit, onBuild, onRemove, today })
   draws the stored plan of getRecord() and keeps working as it changes. Ticking a day
   done and editing a day's session or miles go through js/activeProgramSources.js,
   the same functions the Running calendar uses, so both always agree.
========================================== */

import { generateMarathonPlan } from "./marathonEngine.js";
import { buildPlanView, pickDay, dayChip } from "./planScreenModel.js";
import { workoutSummary } from "./runWorkout.js";
import { toast } from "./ui.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const D = iso => new Date(`${iso}T12:00:00`);
const fmt = (iso, o) => D(iso).toLocaleDateString("en-US", o);
const DOW = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const ICON_WATCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="6"></circle><polyline points="12 10 12 12 13 13"></polyline><path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05"></path><path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"></path></svg>';

/* ---------- empty state ---------- */

export function emptyHtml() {
    return `<div class="ps-root"><div class="ps-hero"><div class="ps-eyebrow">Your race plan</div>
        <div class="ps-empty"><div class="ps-ghost" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="height:${30 + (i % 4 === 3 ? -10 : i * 4)}%"></i>`).join("")}</div>
        <h2>No plan yet</h2>
        <p>Build a 5K, 10K, half marathon or marathon plan. It shows here week by week, with the countdown and the whole season. Your COROS runs fill in where you are now.</p>
        <button type="button" class="sb-btn sb-btn-primary" data-ps="build">Build my plan</button>
        <p class="ps-fine">Saved on your account. Nothing goes to a client.</p></div></div></div>`;
}

/* ---------- pieces ---------- */

function hero(v, name) {
    const C = 326.7, arc = (v.ring * C).toFixed(1);
    const past = v.toRace != null && v.toRace < 0;
    const eyebrow = `${esc(name || `My ${v.raceLabel.toLowerCase()} plan`)}${v.raceDate ? ` · ${esc(fmt(v.raceDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" }))}` : ""}`;
    const week = v.state === "before" ? `Starts ${esc(fmt(v.startDate, { month: "short", day: "numeric" }))}` : v.state === "after" ? "Plan finished" : `Week <span>${v.index + 1} of ${v.total} · ${esc(v.weeks[v.index].phase)}</span>`;
    const countdown = v.toRace == null ? "" : past ? `Race day was ${-v.toRace} day${v.toRace === -1 ? "" : "s"} ago` : v.toRace === 0 ? "Race day is today" : `${v.toRace} days to race day`;
    return `<div class="ps-hero">
      <div class="ps-eyebrow">${eyebrow}</div>
      <div class="ps-hero-body">
        <svg class="ps-ring" viewBox="0 0 124 124" width="124" height="124" aria-hidden="true"><circle class="ps-ring-track" cx="62" cy="62" r="52"></circle><circle class="ps-ring-arc" cx="62" cy="62" r="52" stroke-dasharray="${arc} ${C}" transform="rotate(-90 62 62)"></circle></svg>
        <div class="ps-ring-center" aria-hidden="true"><b>${v.toRace == null ? "" : Math.max(0, v.toRace)}</b><span>days</span></div>
        <div class="ps-hero-goal">
          <div class="ps-goal-label">Goal · ${esc(v.raceLabel)}</div>
          <div class="ps-goal-time ps-mono">${esc(v.goalTime)}</div>
          <div class="ps-countdown ps-mono">${countdown}</div>
          <div class="ps-hero-week ps-mono">${week}</div>
        </div>
      </div>
      <div class="ps-stat-line ps-mono"><span><b>${v.cycle}</b> mi cycle</span><span><b>${v.peak}</b> peak week</span><span><b>${v.donePct}%</b> done</span></div>
      ${v.chips.length ? `<div class="ps-chips">${v.chips.map(c => `<span class="ps-chip${c.gold ? " is-gold" : ""}">${esc(c.text)}</span>`).join("")}</div>` : ""}
    </div>`;
}

function dayCard(week, sel, today) {
    if (!sel) return "";
    const kicker = `${DOW[sel.day] || ""} ${esc(fmt(sel.date, { month: "short", day: "numeric" }))}${sel.date === today ? " · today" : ""}`;
    if (sel.type === "rest") return `<div class="ps-days"><div class="ps-day-group is-sel"><div class="ps-day-row"><div class="ps-day-kicker ps-mono">${kicker}</div><p class="ps-plain">Rest day. Nothing planned.</p></div></div></div>`;
    const run = sel.run;
    const steps = sel.workout ? workoutSummary(sel.workout).split(" · ").map(esc).join('<span class="ps-coros-arrow"> → </span>') : run ? `${esc(sel.miles)} mi easy` : "";
    const why = sel.why ? `<p class="ps-why"><b>Why:</b> ${esc(sel.why)} ${esc(sel.cue)}</p>` : "";
    const chips = `<span class="ps-pace-chip">${esc(dayChip(sel))}</span>${sel.key ? '<span class="ps-day-timing">Key session</span>' : ""}${sel.edited ? '<span class="ps-day-timing">Edited</span>' : ""}`;
    const fields = run
        ? `<input class="ps-day-session-input" data-ps-field="session" value="${esc(sel.session)}" spellcheck="false" aria-label="Workout">
           <div class="ps-day-miles"><input type="number" step="0.1" min="0" class="ps-day-miles-input ps-mono" data-ps-field="miles" value="${esc(sel.miles)}" aria-label="Miles"><span class="ps-mono">mi</span></div>`
        : `<p class="ps-plain">${esc(sel.session)}</p>`;
    return `<div class="ps-days"><div class="ps-day-group is-sel" data-date="${esc(sel.date)}">
        <div class="ps-day-row"><div class="ps-day-kicker ps-mono">${kicker}</div>${fields}<div class="ps-day-chips">${chips}</div></div>
        ${steps ? `<div class="ps-coros-preview"><span class="ps-coros-preview-icon"><span class="ui-icon">${ICON_WATCH}</span></span><div class="ps-coros-preview-body"><div class="ps-coros-steps">${steps}</div>${why}</div></div>` : ""}
        <div class="ps-day-actions"><button type="button" class="ps-check" data-ps="done" aria-pressed="${Boolean(sel.completed)}">${sel.completed ? "Done. Tap to undo" : "Mark done"}</button>${sel.edited ? '<button type="button" class="ps-day-expand-toggle" data-ps="undo"><span>Undo edit</span></button>' : ""}</div>
    </div></div>`;
}

function weekCard(v, wi, selDate, today) {
    const w = v.weeks[wi];
    const sel = w.days.find(d => d.date === selDate) || pickDay(w, today);
    const runs = w.days.filter(d => d.run), done = runs.filter(d => d.completed).length;
    const pills = w.days.map(d => `<button type="button" class="ps-pill${d === sel ? " on" : ""}${d.date === today ? " is-today" : ""}${d.key ? " ps-key" : ""}${d.type === "rest" ? " is-off" : ""}" data-ps-day="${esc(d.date)}" aria-pressed="${d === sel}"><span>${esc(DOW[d.day] || d.day)}</span><b class="ps-mono">${d.type === "rest" || d.type === "strength" || d.type === "cross" ? "–" : esc(d.miles)}</b><i></i></button>`).join("");
    return `<div class="ps-section-head"><h2>This week</h2><span class="ps-hint">pick a day</span></div>
    <div class="ps-detail">
      <div class="ps-detail-head">
        <button type="button" class="ps-week-step" data-ps-step="-1" aria-label="Previous week"${wi === 0 ? " disabled" : ""}>←</button>
        <div class="ps-week-id"><div class="ps-week-title ps-display">Week ${wi + 1}</div><div class="ps-week-dates ps-mono">${esc(fmt(w.startDate, { month: "short", day: "numeric" }))} - ${esc(fmt(w.endDate, { month: "short", day: "numeric", year: "numeric" }))}</div></div>
        <button type="button" class="ps-week-step" data-ps-step="1" aria-label="Next week"${wi === v.total - 1 ? " disabled" : ""}>→</button>
      </div>
      <div class="ps-week-meta"><span class="ps-phase-pill" style="background:${w.colour}22; color:color-mix(in srgb, ${w.colour} 72%, white)">${esc(w.phase)}${w.down ? " · down week" : ""}</span><span class="ps-week-total ps-mono"><b>${w.miles}</b> mi · ${done}/${runs.length} done</span></div>
      <div class="ps-pills" role="group" aria-label="Days of the week">${pills}</div>
      <p class="ps-keyline"><span><i></i>Key session</span></p>
      ${dayCard(w, sel, today)}
    </div>`;
}

function chart(v) {
    const n = v.total, W = 320, gap = 4, bw = (W - gap * (n - 1)) / n, max = Math.max(...v.weeks.map(w => w.miles), 1);
    const bars = v.weeks.map((w, i) => {
        const x = i * (bw + gap), h = Math.max(6, w.miles / max * 72), y = 76 - h, on = i === v.shown;
        const label = i === 0 || i === n - 1 || on;
        return `<g class="ps-bar" role="button" tabindex="0" data-ps-week="${i}" aria-label="Week ${i + 1}, ${w.miles} miles${w.down ? ", down week" : ""}">
            <rect x="${x - 2}" y="0" width="${bw + 4}" height="96" fill="transparent"></rect>
            <rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="4" fill="${w.down ? `url(#psHatch${i})` : w.colour}" opacity="${on ? 1 : 0.8}" class="${on ? "ps-bar-selected" : ""}"></rect>
            ${w.down ? `<defs><pattern id="psHatch${i}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${w.colour}" opacity=".35"></rect><rect width="2" height="5" fill="${w.colour}"></rect></pattern></defs>` : ""}
            ${w.test ? `<circle cx="${x + bw / 2}" cy="${y - 6}" r="2.5" fill="#ECD6B0"></circle>` : ""}
            ${w.tune ? `<rect x="${x + bw / 2 - 2.5}" y="${y - 8.5}" width="5" height="5" fill="#ECD6B0" transform="rotate(45 ${x + bw / 2} ${y - 6})"></rect>` : ""}
            ${label ? `<text x="${x + bw / 2}" y="93" text-anchor="middle" font-size="9" font-family="IBM Plex Mono, monospace" fill="${on ? "#ECD6B0" : "#93A08F"}">${i + 1}</text>` : ""}
        </g>`;
    }).join("");
    const extras = [v.weeks.some(w => w.down) ? "<span><b>▨</b>Down week</span>" : "", v.hasTest ? "<span><b>●</b>800s test</span>" : "", v.hasTune ? "<span><b>◆</b>Tune-up race</span>" : ""].join("");
    return `<div class="ps-section-head"><h2>The season</h2><span class="ps-hint">tap a week</span></div>
    <div class="ps-chart-wrap"><div class="ps-chart-scroll"><svg viewBox="0 0 320 96" role="group" aria-label="Weekly mileage across the ${n}-week plan">${bars}</svg></div>
        <div class="ps-legend">${v.legend.map(l => `<span><i style="background:${l.colour}"></i>${esc(l.name)}</span>`).join("")}</div>
        ${extras ? `<div class="ps-legend-extra">${extras}</div>` : ""}</div>`;
}

function blocks(v) {
    if (!v.blocks.length) return "";
    const rows = v.blocks.map(b => `<li class="${b.now ? "is-now" : ""}"><i style="background:${b.colour}"></i><div><strong>${esc(b.name)}${b.now ? " · now" : ""}</strong><em>${esc(b.text)}</em></div><span>Wk ${b.from}${b.to > b.from ? `–${b.to}` : ""}</span></li>`).join("");
    return `<div class="ps-section-head"><h2>The blocks</h2><span class="ps-hint">new stimulus every 4 weeks</span></div>
    <div class="ps-chart-wrap"><ul class="ps-blocks">${rows}</ul>
        <div class="ps-actions"><button type="button" class="sb-btn sb-btn-secondary" data-ps="edit">Edit setup</button><button type="button" class="sb-btn sb-btn-tertiary" data-ps="remove">Remove plan</button></div>
        <p class="ps-fine">Saved on your account. Nothing goes to a client. Days you edit by hand stay as you set them.</p></div>`;
}

function folds(v) {
    const paces = v.paces ? `<details class="ps-fold"><summary>Pace reference</summary><div class="ps-paces">${Object.entries(v.paces).map(([k, p]) => `<div><span>${esc(k)}</span><b class="ps-mono">${esc(p)}</b></div>`).join("")}</div></details>` : "";
    const notes = v.warnings.length ? `<details class="ps-fold"><summary>About this plan</summary><div class="ps-fold-body">${v.warnings.map(w => `<p>${esc(w)}</p>`).join("")}</div></details>` : "";
    return paces || notes ? `<div class="ps-fold-list">${paces}${notes}</div>` : "";
}

/** The whole screen for one view. `state` = { week, date }. */
export function planScreenHtml(v, { week, date, name = "", today }) {
    const shown = Math.max(0, Math.min(v.total - 1, week));
    v.shown = shown;
    return `<div class="ps-root">${hero(v, name)}${weekCard(v, shown, date, today)}${chart(v)}${blocks(v)}${folds(v)}</div>`;
}

/* ---------- mounting ---------- */

export function mountPlanScreen(root, { getRecord, onEdit, onBuild, onRemove, onChange, today = todayIso() }) {
    if (!root) return { update() {} };
    const st = { week: null, date: null, id: "" };

    function draw() {
        const record = getRecord();
        const view = record?.generatedPlan ? buildPlanView(record.generatedPlan, today, { generate: generateMarathonPlan }) : null;
        if (!view || view.state === "none") { root.innerHTML = emptyHtml(); return; }
        if (st.id !== record.id || st.week == null) { st.id = record.id; st.week = view.index; st.date = null; }
        root.innerHTML = planScreenHtml(view, { week: st.week, date: st.date, name: record.name, today });
        const on = root.querySelector(".ps-pill.on");
        if (on) st.date = on.dataset.psDay;
    }

    async function change(fn, failText) {
        try { await fn(); if (onChange) await onChange(); else draw(); }
        catch { toast(failText, { type: "error" }); }
    }

    root.addEventListener("click", async ev => {
        const t = ev.target;
        const step = t.closest("[data-ps-step]");
        if (step) { st.week = Math.max(0, st.week + Number(step.dataset.psStep)); st.date = null; draw(); return; }
        const bar = t.closest("[data-ps-week]");
        if (bar) { st.week = Number(bar.dataset.psWeek); st.date = null; draw(); return; }
        const pill = t.closest("[data-ps-day]");
        if (pill) { st.date = pill.dataset.psDay; draw(); return; }
        const act = t.closest("[data-ps]")?.dataset.ps;
        if (!act) return;
        const date = root.querySelector(".ps-day-group")?.dataset.date;
        if (act === "build") return onBuild?.();
        if (act === "edit") return onEdit?.();
        if (act === "remove") return onRemove?.();
        if (!date) return;
        const record = getRecord();
        if (act === "done") {
            const { toggleRunningProgramDayCompleted } = await import("./activeProgramSources.js");
            return change(() => toggleRunningProgramDayCompleted(record.id, date), "Couldn't save that. Try again.");
        }
        if (act === "undo") {
            const { editProgramDay } = await import("./activeProgramSources.js");
            return change(() => editProgramDay(record.id, date, null), "Couldn't undo that. Try again.");
        }
    });

    root.addEventListener("keydown", ev => {
        const bar = ev.target.closest?.("[data-ps-week]");
        if (bar && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); st.week = Number(bar.dataset.psWeek); st.date = null; draw(); }
    });

    root.addEventListener("change", async ev => {
        const field = ev.target.closest?.("[data-ps-field]");
        const group = ev.target.closest?.(".ps-day-group");
        if (!field || !group) return;
        const { editProgramDay } = await import("./activeProgramSources.js");
        const record = getRecord();
        const session = group.querySelector('[data-ps-field="session"]')?.value ?? "";
        const miles = group.querySelector('[data-ps-field="miles"]')?.value ?? 0;
        await change(() => editProgramDay(record.id, group.dataset.date, { miles, session }), "Couldn't save that change. Try again.");
    });

    return { update: draw };
}
