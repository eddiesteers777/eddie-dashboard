/* ==========================================
   Southbound — the Analytics trends (js/trends.js + js/trendsData.js)

   Seven panels in #trends, from what was actually run and measured:
   plan vs actual, key workouts (lap by lap), long runs, aerobic
   fitness, load, body (HRV / resting HR / sleep / readiness) and the
   race prediction. Draws from saved data at once, then again when
   COROS brings more (laps, 8 weeks of sleep + HRV, new runs).
========================================== */

import { planVsActual, longRuns, aerobicTrend, loadTrend, checkWorkout, bodyTrend, bodySummary, predictionTrend, mmss, clock } from "./trends.js";
import { barsHtml, lineSvg } from "./svgCharts.js";
import { planWeeks, allRuns, keyWorkouts, fetchLaps, lapState, backfillHealth, health, readiness, fitness, laps } from "./trendsData.js";
import { loadSettings, isoDate } from "./readinessData.js";
import { isCorosConnected } from "./corosClient.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekday = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const mi = n => (Math.round(n * 10) / 10).toString();
const GOAL = 3 * 3600 + 5 * 60;   // 3:05:00

function panel(id, title, sub, body) {
    return `<section class="panel tr-panel" id="${id}"><div class="panel-header"><div><h2>${esc(title)}</h2>${sub ? `<p class="tr-sub">${sub}</p>` : ""}</div></div>${body}</section>`;
}
const empty = text => `<p class="tr-empty">${esc(text)}</p>`;

function planPanel(today, runs) {
    const r = planVsActual(planWeeks(), runs, today);
    const t = r.thisWeek;
    const sub = [
        t ? `This week: <strong>${mi(t.actual)} of ${mi(t.planned)} mi</strong> (${t.runs} ${t.runs === 1 ? "run" : "runs"})` : "",
        r.last4?.pct != null ? `Last 4 weeks: <strong>${r.last4.pct}%</strong> of plan (${mi(r.last4.actual)} of ${mi(r.last4.planned)} mi)` : ""
    ].filter(Boolean).join(" · ");
    const bars = r.rows.map(w => ({ label: `W${w.week}`, value: w.isFuture ? 0 : w.actual, planned: w.planned, current: w.isCurrent, future: w.isFuture, title: `Week ${w.week} (${day(w.start)}): ${w.isFuture ? "planned" : `${mi(w.actual)} of`} ${mi(w.planned)} mi` }));
    return panel("trendsPlan", "Plan vs actual", sub || "Your COROS miles against the plan, week by week.",
        `${barsHtml(bars)}<p class="tr-legend"><span class="tr-key plan"></span> planned <span class="tr-key fill"></span> run <span class="tr-key met"></span> within 10% of plan</p>`);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function workoutRow(w, saved) {
    if (!w.run) return `<li class="tr-work"><div class="tr-work-top"><strong>${esc(w.title)}</strong><span>${weekday(w.date)}</span></div><small class="tr-miss">No COROS run that day.</small></li>`;
    const lapData = saved[w.run.labelId]?.laps;
    const c = lapData?.length ? checkWorkout(w.sets, lapData) : null;
    // Mile-long laps read as miles (a marathon-pace run, mile repeats); anything else as reps.
    const unit = c?.laps.filter(l => l.work).every(l => Math.abs(l.m - 1609) < 60) ? "miles" : "reps";
    const off = c ? [c.fast ? `${c.fast} too fast` : "", c.slow ? `${c.slow} too slow` : ""].filter(Boolean).join(", ") : "";
    const verdict = !lapData ? (!isCorosConnected() ? "Connect COROS to check this one lap by lap."
            : lapState(w.run.labelId) === "loading" ? "Laps loading from COROS…"
            : lapState(w.run.labelId) === "failed" ? "COROS didn't send the laps this time. Southbound asks again next visit."
            : "Laps come in on your next visit.")
        : !lapData.length ? "COROS has no laps for this run."
        : !c.target ? `${plural(lapData.length, "lap", "laps")} (by effort, no pace target to check)`
        : !c.work ? `No laps at the target pace (${c.target})`
        : `${c.onTarget} of ${c.work} ${unit} on target (${c.target})${off ? `, ${off}` : ""} · avg ${mmss(c.avgPace)}/mi${c.avgHr ? ` · ${c.avgHr} bpm` : ""}`;
    const cls = c?.work ? (c.onTarget === c.work ? "good" : c.onTarget >= c.work * 0.6 ? "ok" : "off") : "";
    const pace = l => l.s / (l.m / 1609.344);
    const flag = l => (!l.work ? "" : l.onTarget ? "on" : "off");
    const table = lapData?.length ? `<details class="tr-laps"><summary>Laps</summary><table><thead><tr><th>Lap</th><th>Distance</th><th>Time</th><th>Pace</th><th>HR</th></tr></thead><tbody>${(c?.laps || lapData).map(l => `<tr class="${flag(l)}"><td>${l.i}</td><td>${l.m >= 1000 ? `${(l.m / 1609.344).toFixed(2)} mi` : `${l.m} m`}</td><td>${mmss(l.s)}</td><td>${mmss(pace(l))}</td><td>${l.hr ?? "–"}</td></tr>`).join("")}</tbody></table></details>` : "";
    return `<li class="tr-work ${cls}"><div class="tr-work-top"><strong>${esc(w.title)}</strong><span>${weekday(w.date)} · ${mi(w.runMiles)} of ${mi(w.plannedMiles)} mi</span></div><small>${esc(verdict)}</small>${table}</li>`;
}

const SHOW_WORKOUTS = 5;

function workoutsPanel(today) {
    const items = keyWorkouts(today);
    const saved = laps();
    if (!items.length) return panel("trendsWorkouts", "Key workouts", "", empty("No quality or long-run days in the last 6 weeks of the plan."));
    const rows = items.map(w => workoutRow(w, saved));
    const more = rows.length > SHOW_WORKOUTS
        ? `<details class="tr-more"><summary>${plural(rows.length - SHOW_WORKOUTS, "older workout", "older workouts")}</summary><ul class="tr-works">${rows.slice(SHOW_WORKOUTS).join("")}</ul></details>` : "";
    return panel("trendsWorkouts", "Key workouts", "Each quality and long-run day of the last 6 weeks: the plan's target pace against your laps.",
        `<ul class="tr-works">${rows.slice(0, SHOW_WORKOUTS).join("")}</ul>${more}`);
}

function longPanel(runs) {
    const lr = longRuns(runs).slice(-12);
    if (!lr.length) return panel("trendsLong", "Long runs", "", empty("No runs of 10 miles or more yet."));
    return panel("trendsLong", "Long runs", "Each week's longest run (10+ miles).",
        `${lineSvg(lr.map(r => r.miles), { height: 70 })}<ul class="tr-list">${lr.slice(-6).reverse().map(r => `<li><span>${day(r.date)}</span><strong>${mi(r.miles)} mi</strong><span>${r.pace ? `${mmss(r.pace)}/mi` : "–"}</span><span>${r.hr ? `${r.hr} bpm` : ""}</span></li>`).join("")}</ul>`);
}

function aerobicPanel(runs) {
    const t = aerobicTrend(runs);
    if (t.points.length < 2) return panel("trendsAerobic", "Aerobic fitness", "", empty("Needs a few weeks of easy runs with heart rate."));
    const last = t.points.at(-1);
    const sub = `Easy pace at 140 bpm: <strong>${mmss(last.paceAt140)}/mi</strong>${t.change != null ? ` · ${t.change > 0 ? `${t.change} s/mi faster` : t.change < 0 ? `${-t.change} s/mi slower` : "the same"} than the 4 weeks before` : ""}`;
    return panel("trendsAerobic", "Aerobic fitness", sub,
        `${lineSvg(t.points.map(p => p.paceAt140), { invert: true, height: 80 })}<div class="tr-axis"><span>${day(t.points[0].week)}</span><span>Faster is higher</span><span>${day(last.week)}</span></div><p class="tr-note">From easy runs (heart rate under 155): how fast the same heartbeat carries you. It drifts faster as your aerobic fitness grows.</p>`);
}

const LOAD_WORDS = { safe: "in the safe range (0.8–1.3)", caution: "a big jump: ease off or hold here", high: "a very big jump: injury risk goes up", low: "well under your usual (fine for a down or taper week)", none: "" };

function loadPanel(today, runs) {
    const l = loadTrend(runs, today);
    const bars = l.bars.map(b => ({ label: `${Number(b.start.slice(5, 7))}/${Number(b.start.slice(8))}`, value: b.miles, current: b.start === l.bars.at(-1).start, title: `Week of ${day(b.start)}: ${mi(b.miles)} mi` }));
    const sub = l.ratio != null ? `Last 7 days: <strong>${mi(l.acute)} mi</strong> vs your usual ${mi(l.chronic)} a week · <span class="tr-${l.status}">${l.ratio.toFixed(2)}, ${LOAD_WORDS[l.status]}</span>` : "";
    return panel("trendsLoad", "Load", sub, barsHtml(bars));
}

function bodyPanel(today) {
    const rows = bodyTrend(health(), readiness(), today);
    const needH = loadSettings().sleepNeedMin / 60;
    const have = rows.some(r => r.hrv != null || r.sleep != null || r.rhr != null);
    if (!have) return panel("trendsBody", "Body", "", empty("Connect COROS to see your HRV, resting heart rate and sleep here."));
    const mini = (key, title, unit, opts = {}) => {
        const s = bodySummary(rows, key);
        if (opts.whole) for (const k of ["recent", "before"]) if (s[k] != null) s[k] = Math.round(s[k]);
        const delta = s.recent != null && s.before != null ? Math.round((s.recent - s.before) * 10) / 10 : null;
        return `<div class="tr-mini"><div class="tr-mini-top"><span>${title}</span><strong>${s.recent ?? "–"}${s.recent != null ? ` ${unit}` : ""}</strong></div>
            ${lineSvg(rows.map(r => r[key]), { height: 50, ...opts })}
            <small>${delta == null ? "7-day average" : `7-day avg, ${delta > 0 ? "+" : ""}${delta} vs the 4 weeks before`}</small></div>`;
    };
    return panel("trendsBody", "Body", "The last 8 weeks, by wake-up day.", `<div class="tr-minis">
        ${mini("hrv", "HRV", "ms", { band: rows.map(r => (r.low != null && r.high != null ? { lo: r.low, hi: r.high } : null)) })}
        ${mini("rhr", "Resting HR", "bpm", { invert: true })}
        ${mini("sleep", "Sleep", "h", { goal: needH })}
        ${mini("readiness", "Readiness", "", { min: 0, max: 100, whole: true })}
    </div><p class="tr-note">HRV's shaded band is your normal range from COROS. Sleep's line is your ${needH} h need. Resting HR is drawn with lower as higher.</p>`);
}

function predictionPanel() {
    const p = predictionTrend(fitness()).filter(x => x.marathon);
    const vo2 = predictionTrend(fitness()).filter(x => x.vo2).at(-1)?.vo2;
    if (!p.length) return panel("trendsRace", "Race prediction", "", empty("COROS's marathon prediction is saved here each day you open Analytics."));
    const last = p.at(-1);
    const gap = last.marathon - GOAL;
    const sub = `COROS predicts <strong>${clock(last.marathon)}</strong> · goal 3:05:00 (${gap <= 0 ? `${mmss(-gap)} under` : `${mmss(gap)} over`})${vo2 ? ` · VO₂ max ${vo2}` : ""}`;
    return panel("trendsRace", "Race prediction", sub, p.length > 1
        ? `${lineSvg(p.map(x => x.marathon), { invert: true, goal: GOAL, height: 70 })}<div class="tr-axis"><span>${day(p[0].date)}</span><span>Dashed line: 3:05</span><span>${day(last.date)}</span></div>`
        : `<p class="tr-note">Builds into a trend line as COROS's prediction is saved day by day.</p>`);
}

export function renderTrends() {
    const el = document.getElementById("trends");
    if (!el) return;
    const today = isoDate(new Date());
    const runs = allRuns(today);
    el.innerHTML = [
        planPanel(today, runs),
        workoutsPanel(today),
        `<div class="tr-grid">${longPanel(runs)}${aerobicPanel(runs)}</div>`,
        `<div class="tr-grid">${loadPanel(today, runs)}${predictionPanel()}</div>`,
        bodyPanel(today)
    ].join("");
}

async function init() {
    const today = isoDate(new Date());
    const lapsDone = fetchLaps(keyWorkouts(today), { onBatch: renderTrends });   // marks its runs "loading" first
    renderTrends();
    for (const e of ["eddieos:coros-history-updated", "eddieos:coros-data-updated", "sb:readiness-updated"]) window.addEventListener(e, renderTrends);
    if (await lapsDone) renderTrends();
    if (await backfillHealth(today)) renderTrends();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
