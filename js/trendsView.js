/* ==========================================
   Southbound — the Analytics trends (js/trends.js + js/trendsData.js)

   Panels drawn into their Analytics sections (Phase C), from what was
   actually run and measured: plan vs actual, key workouts (lap by lap)
   and all your running (Training); COROS's prediction over time
   (Capability); body (HRV / resting HR / sleep / readiness + the morning
   check-ins: Recovery); long runs (Preparation). Load and aerobic fitness moved to the athlete model's Load
   and response card (js/loadCard.js). Draws from saved data at once, then again when
   COROS brings more (laps, 8 weeks of sleep + HRV, new runs).
========================================== */

import { planVsActual, longRuns, checkWorkout, bodyTrend, bodySummary, predictionTrend, mmss, clock } from "./trends.js";
import { barsHtml, lineSvg } from "./svgCharts.js";
import { planWeeks, allRuns, everyRun, stravaActs, keyWorkouts, fetchLaps, lapState, backfillHealth, health, readiness, fitness, laps } from "./trendsData.js";
import { yearStats, otherCounts } from "./stravaHistory.js";
import { syncStrava, STRAVA_EVENT } from "./stravaStore.js";
import { loadSettings, loadCheckins, isoDate } from "./readinessData.js";
import { kindChip } from "./analyticsSummary.js";
import { isCorosConnected } from "./corosClient.js";
import { reconstructWorkout } from "./workoutExecution.js";
import { marathonTitle } from "./marathonCoros.js";
import { executionHtml, executionClass } from "./executionView.js";
import { registerShare, registerCard, splitsCardModel } from "./executionShare.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekday = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const mi = n => (Math.round(n * 10) / 10).toString();
const GOAL = 3 * 3600 + 5 * 60;   // 3:05:00

function panel(id, title, sub, body, kind = "") {
    return `<section class="panel tr-panel" id="${id}"><div class="panel-header"><div><h2>${esc(title)} ${kindChip(kind)}</h2>${sub ? `<p class="tr-sub">${sub}</p>` : ""}</div></div>${body}</section>`;
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
        `${barsHtml(bars)}<p class="tr-legend"><span class="tr-key plan"></span> planned <span class="tr-key fill"></span> run <span class="tr-key met"></span> within 10% of plan</p>`, "measured");
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function workoutRow(w, saved) {
    if (!w.run) return `<li class="tr-work"><div class="tr-work-top"><strong>${esc(w.title)}</strong><span>${weekday(w.date)}</span></div><small class="tr-miss">No COROS run that day.</small></li>`;
    const lapData = saved[w.run.labelId]?.laps;
    // A structured workout with laps: rebuilt step by step (js/workoutExecution.js).
    const hasWork = w.workout?.sets?.some(s => s.pace || s.repTime || (s.effort && s.effort !== "easy" && s.effort !== "recovery") || s.parts);
    if (lapData?.length && hasWork && w.run.source !== "strava") {
        const x = reconstructWorkout(w.workout, saved[w.run.labelId], { plannedWorkoutId: w.id, activityId: `c:${w.run.labelId}` });
        registerShare(x, { date: w.date, name: marathonTitle(w.title, w.plannedMiles), runMeters: w.run.distance, runSec: w.run.duration });
        const lapRows = lapData.map(l => `<tr><td>${l.i}</td><td>${l.m >= 1000 ? `${(l.m / 1609.344).toFixed(2)} mi` : `${l.m} m`}</td><td>${mmss(l.s)}</td><td>${mmss(l.s / (l.m / 1609.344))}</td><td>${l.hr ?? "–"}</td></tr>`).join("");
        return `<li class="tr-work ${executionClass(x)}"><div class="tr-work-top"><strong>${esc(w.title)}</strong><span>${weekday(w.date)} · ${mi(w.runMiles)} of ${mi(w.plannedMiles)} mi</span></div>
            ${executionHtml(x, { share: true })}
            <details class="tr-laps"><summary>All laps from COROS</summary><table><thead><tr><th>Lap</th><th>Distance</th><th>Time</th><th>Pace</th><th>HR</th></tr></thead><tbody>${lapRows}</tbody></table></details></li>`;
    }
    const c = lapData?.length ? checkWorkout(w.sets, lapData) : null;
    // Mile-long laps read as miles (a marathon-pace run, mile repeats); anything else as reps.
    const unit = c?.laps.filter(l => l.work).every(l => Math.abs(l.m - 1609) < 60) ? "miles" : "reps";
    const off = c ? [c.fast ? `${c.fast} too fast` : "", c.slow ? `${c.slow} too slow` : ""].filter(Boolean).join(", ") : "";
    const verdict = w.run.source === "strava" ? "From your Strava history (laps are checked on COROS runs)."
        : !lapData ? (!isCorosConnected() ? "Connect COROS to check this one lap by lap."
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
    // No targets to check (a plain long run): its splits can still be shared.
    let share = "";
    if (lapData?.length && w.run.source !== "strava") {
        const model = splitsCardModel(saved[w.run.labelId], { date: w.date, name: marathonTitle(w.title, w.plannedMiles), category: w.kind === "long" ? "long_run" : null, runMeters: w.run.distance, runSec: w.run.duration, avgHr: w.run.avgHr });
        const key = registerCard(`splits|${w.id}`, model, { date: w.date, sessionId: `c:${w.run.labelId}` });
        if (key) share = `<button type="button" class="sb-btn sb-btn-secondary ex-share-btn" data-ex-share="${esc(key)}">Share splits as an image</button>`;
    }
    return `<li class="tr-work ${cls}"><div class="tr-work-top"><strong>${esc(w.title)}</strong><span>${weekday(w.date)} · ${mi(w.runMiles)} of ${mi(w.plannedMiles)} mi</span></div><small>${esc(verdict)}</small>${table}${share}</li>`;
}

const SHOW_WORKOUTS = 5;

function workoutsPanel(today) {
    const items = keyWorkouts(today);
    const saved = laps();
    if (!items.length) return panel("trendsWorkouts", "Key workouts", "", empty("No quality or long-run days in the last 6 weeks of the plan."));
    const rows = items.map(w => workoutRow(w, saved));
    const more = rows.length > SHOW_WORKOUTS
        ? `<details class="tr-more"><summary>${plural(rows.length - SHOW_WORKOUTS, "older workout", "older workouts")}</summary><ul class="tr-works">${rows.slice(SHOW_WORKOUTS).join("")}</ul></details>` : "";
    return panel("trendsWorkouts", "Key workouts", "Each quality and long-run day of the last 6 weeks: the plan step by step against your laps.",
        `<ul class="tr-works">${rows.slice(0, SHOW_WORKOUTS).join("")}</ul>${more}`, "measured");
}

function longPanel(runs) {
    const lr = longRuns(runs).slice(-12);
    if (!lr.length) return panel("trendsLong", "Long runs", "", empty("No runs of 10 miles or more yet."));
    return panel("trendsLong", "Long runs", "Each week's longest run (10+ miles).",
        `${lineSvg(lr.map(r => r.miles), { height: 70 })}<ul class="tr-list">${lr.slice(-6).reverse().map(r => `<li><span>${day(r.date)}</span><strong>${mi(r.miles)} mi</strong><span>${r.pace ? `${mmss(r.pace)}/mi` : "–"}</span><span>${r.hr ? `${r.hr} bpm` : ""}</span></li>`).join("")}</ul>`, "measured");
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
    </div>${feelLine(today)}<p class="tr-note">HRV's shaded band is your normal range from COROS. Sleep's line is your ${needH} h need. Resting HR is drawn with lower as higher. Readiness is calculated from the others.</p>`, "measured");
}

// The morning check-ins: the last 4 weeks against the 4 before (soreness: lower is better).
function feelLine(today) {
    const all = loadCheckins() || {};
    const span = (from, to) => Object.entries(all).filter(([d]) => d > from && d <= to).map(([, c]) => c);
    const back = n => { const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() - n); return isoDate(d); };
    const recent = span(back(28), today), before = span(back(56), back(28));
    if (!recent.length) return `<p class="tr-note">Morning check-ins (soreness, energy, mood) show here once you do them on Today.</p>`;
    const avg = (list, k) => { const v = list.map(c => c[k]).filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
    const part = (k, label) => { const a = avg(recent, k), b = avg(before, k); return a == null ? "" : `${label} ${a}${b != null && Math.abs(a - b) >= 0.3 ? ` (${a > b ? "up" : "down"} from ${b})` : ""}`; };
    const parts = [part("energy", "energy"), part("mood", "mood"), part("soreness", "soreness")].filter(Boolean).join(" · ");
    return `<p class="tr-sub tr-feel">How you feel: <strong>${recent.length} morning check-ins</strong> in the last 4 weeks${parts ? ` · ${parts} (out of 5; soreness lower is better)` : ""}.</p>`;
}

function predictionPanel() {
    const p = predictionTrend(fitness()).filter(x => x.marathon);
    const vo2 = predictionTrend(fitness()).filter(x => x.vo2).at(-1)?.vo2;
    if (!p.length) return panel("trendsRace", "COROS's prediction over time", "", empty("COROS's marathon prediction is saved here each day you open Analytics."), "prediction");
    const last = p.at(-1);
    const gap = last.marathon - GOAL;
    const sub = `COROS predicts <strong>${clock(last.marathon)}</strong> · goal 3:05:00 (${gap <= 0 ? `${mmss(-gap)} under` : `${mmss(gap)} over`})${vo2 ? ` · VO₂ max ${vo2}` : ""}`;
    return panel("trendsRace", "COROS's prediction over time", sub, p.length > 1
        ? `${lineSvg(p.map(x => x.marathon), { invert: true, goal: GOAL, height: 70 })}<div class="tr-axis"><span>${day(p[0].date)}</span><span>Dashed line: 3:05</span><span>${day(last.date)}</span></div>`
        : `<p class="tr-note">Builds into a trend line as COROS's prediction is saved day by day.</p>`, "prediction");
}

const month = ym => new Date(`${ym}-15T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const longDay = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const OTHER_WORDS = { ride: ["ride", "rides"], walk: ["walk", "walks"], hike: ["hike", "hikes"], swim: ["swim", "swims"], strength: ["strength session", "strength sessions"], workout: ["workout", "workouts"], row: ["row", "rows"], cardio: ["cardio session", "cardio sessions"], other: ["other activity", "other activities"] };

function yearsPanel(today) {
    const s = yearStats(everyRun(today), today);
    const acts = stravaActs();
    const hasStrava = Object.keys(acts).length > 0;
    const invite = `<p class="tr-note">Import your Strava archive (<a href="#stravaImportPanel">below</a>) to add the years before COROS.</p>`;
    if (!s) return panel("trendsYears", "All your running", "", `${empty("No runs saved yet.")}${invite}`);
    const bars = s.years.map(y => ({ label: `’${String(y.year).slice(2)}`, value: y.miles, current: y.year === Number(today.slice(0, 4)), title: `${y.year}: ${Math.round(y.miles).toLocaleString()} mi, ${plural(y.runs, "run", "runs")}` }));
    const ytd = s.ytd.lastYear > 0
        ? `This year so far: <strong>${Math.round(s.ytd.miles).toLocaleString()} mi</strong> · last year by today: ${Math.round(s.ytd.lastYear).toLocaleString()} mi (${s.ytd.miles >= s.ytd.lastYear ? "+" : "−"}${Math.abs(Math.round((s.ytd.miles / s.ytd.lastYear - 1) * 100))}%)`
        : `This year so far: <strong>${Math.round(s.ytd.miles).toLocaleString()} mi</strong>`;
    const recs = [
        ["Longest run", `${mi(s.longest.miles)} mi`, `${longDay(s.longest.date)}${s.longest.name && s.longest.name !== "Run" ? ` · ${esc(s.longest.name)}` : ""}`],
        ["Biggest week", `${mi(s.biggestWeek.miles)} mi`, `week of ${longDay(s.biggestWeek.start)}`],
        ["Biggest month", `${mi(s.biggestMonth.miles)} mi`, month(s.biggestMonth.month)]
    ];
    const list = rows => `<ul class="tr-recs">${rows.map(([k, v, d]) => `<li><span>${k}</span><strong>${v}</strong><small>${d}</small></li>`).join("")}</ul>`;
    const other = Object.entries(otherCounts(acts)).sort((a, b) => b[1] - a[1]).map(([type, n]) => { const [one, many] = OTHER_WORDS[type] || OTHER_WORDS.other; return plural(n, one, many); });
    return panel("trendsYears", "All your running",
        `<strong>${s.total.runs.toLocaleString()} runs · ${s.total.miles.toLocaleString()} mi</strong> since ${longDay(s.total.since)}${hasStrava ? " (COROS + Strava, each run counted once)" : ""}`,
        `${barsHtml(bars)}<p class="tr-sub tr-ytd">${ytd}</p>
        <h3 class="tr-h3">Biggest</h3>${list(recs)}
        <p class="tr-note">Your fastest mile to marathon, including the fastest stretches inside your Strava watch files, are in <a href="#recordsPanel">Bests</a>.</p>
        ${other.length ? `<p class="tr-note">Also in your Strava history: ${other.join(" · ")}.</p>` : ""}
        ${hasStrava ? "" : invite}`, "measured");
}

// Each panel goes to its section (analytics.html): Capability, Training, Recovery, Preparation.
const HOSTS = [["trPlan", (t, r) => planPanel(t, r)], ["trWorkouts", t => workoutsPanel(t)], ["trYears", t => yearsPanel(t)],
    ["trRace", () => predictionPanel()], ["trBody", t => bodyPanel(t)], ["trLong", (t, r) => longPanel(r)]];

export function renderTrends() {
    const today = isoDate(new Date());
    const runs = allRuns(today);
    for (const [id, draw] of HOSTS) {
        const el = document.getElementById(id);
        if (!el) continue;
        try { el.innerHTML = draw(today, runs); } catch (error) { console.error(`Southbound: ${id} couldn't draw.`, error); }
    }
}

async function init() {
    const today = isoDate(new Date());
    const lapsDone = fetchLaps(keyWorkouts(today), { onBatch: renderTrends });   // marks its runs "loading" first
    renderTrends();
    for (const e of ["eddieos:coros-history-updated", "eddieos:coros-data-updated", "sb:readiness-updated", STRAVA_EVENT]) window.addEventListener(e, renderTrends);
    syncStrava();                                  // redraws through sb:strava-updated when the account's copy is newer
    if (await lapsDone) renderTrends();
    if (await backfillHealth(today)) renderTrends();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
