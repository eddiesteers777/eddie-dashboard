/* ==========================================
   Southbound — Load and response on Analytics (coach's own)

   The athlete model's dose (js/sessionDose.js) and load state
   (js/loadState.js), drawn as one card: where recent load sits against
   your own last year, the training base and its change, the last 16
   weeks as bars by intensity with the base and recent lines over them,
   the intensity mix, long runs, how each run was scored (one blended
   load from pace, heart rate and effort), COROS's Base Fitness / Load
   Impact next to ours, and the totals by week (monotony, strain) and by
   month (js/loadState.js loadTotals). Replaces
   the old Load panel and its acute : chronic "safe range" (3.4 of
   docs/PERFORMANCE_ENGINE_PLAN.md: no ratio zones). Then "How you
   responded" (js/trainingResponse.js, step 4): the reading, easy-run
   efficiency (replaces the old Aerobic fitness panel), effort vs
   expected, heart rate on quality reps, execution, long-run drift.
   Also draws "Model check: training load" under the race Model check:
   how the three dose measures agree, which one best tracks the
   responses (4.3), and efficiency v2 against the old 140-bpm trend.
========================================== */

import { sessionDoses, doseAgreement, DOSE_ASSUMPTIONS, DOSE_VERSION, LONG_RUN } from "./sessionDose.js";
import { loadState, recentWords, loadTotals, corosComparison, corosWords, LOAD_VERSION, TAU } from "./loadState.js";
import { loadChartSvg } from "./svgCharts.js";
import { loadModelInputs, loadLaps } from "./athleteData.js";
import { addDays } from "./athleteLedger.js";
import { efficiency, effortResponse, qualityHr, executionSummary, decoupling, reading, doseBacktest, seriesNoise, RESPONSE_VERSION, RESPONSE_ASSUMPTIONS } from "./trainingResponse.js";
import { keyWorkouts, allRuns } from "./trendsData.js";
import { aerobicTrend } from "./trends.js";
import { lineSvg } from "./svgCharts.js";
import { readinessCheck } from "./readinessBacktest.js";
import { READINESS_V2_VERSION } from "./readinessV2.js";
import { inputs as readinessInputs } from "./readinessData.js";
import { kindChip } from "./analyticsSummary.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const whole = n => Math.round(n).toLocaleString();
const ordinal = n => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const signed = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
const paceMile = v => { const s = Math.round(1609.344 / v); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
const V60_WORDS = { race: "a recent race", training: "your fastest recent training efforts", coros: "COROS's threshold pace", older: "your last known fitness (nothing recent)" };
const SOURCE_WORDS = { pace: "by pace", hr: "by heart rate (pace couldn't measure them)", effort: "by effort (nothing measured)", miles: "miles only", none: "not scored" };

let result = null;

function compute(inputs) {
    const lapStore = loadLaps();
    const dose = sessionDoses(inputs.sessions, inputs.today, { laps: lapStore, health: inputs.health, fitness: inputs.fitness });
    const state = loadState(dose.doses, inputs.today);
    const lapsById = Object.fromEntries(Object.entries(lapStore).map(([label, v]) => [`c:${label}`, v?.laps || []]));
    const eff = efficiency(inputs.sessions, dose.doses, inputs.today);
    const effort = effortResponse(inputs.sessions, dose.doses, inputs.today);
    let work = [];
    try { work = keyWorkouts(inputs.today, { days: 42 }); } catch { work = []; }
    const response = {
        eff, effort,
        quality: qualityHr(dose.doses, lapsById, dose.anchors, inputs.today),
        execution: executionSummary(work, lapStore, inputs.today),
        drift: decoupling(dose.doses, lapsById, inputs.today),
        reading: reading(eff.signal, effort.signal)
    };
    return {
        today: inputs.today, planDays: inputs.planDays || [], dose, state, agreement: doseAgreement(dose, inputs.today), response,
        totals: loadTotals(dose.doses, inputs.today), coros: corosComparison(state.series, inputs.fitness)
    };
}

// Each key workout of the last year against its targets (laps saved on this device).
function yearOfExecution(today) {
    try { return executionSummary(keyWorkouts(today, { days: 400 }), loadLaps(), today, { days: 400 }).rows; } catch { return []; }
}

// The dose test and the noise comparison take a few seconds on years of runs: done after the card draws.
function computeCheck(r) {
    const probes = r.response.eff.runs.map(x => ({ date: x.date, residual: x.residual }));
    const effortProbes = r.response.effort.rows.map(x => ({ date: x.date, residual: x.residual }));
    let oldSeries = [];
    try { oldSeries = aerobicTrend(allRuns(r.today)).points.slice(-16).map(p => p.paceAt140); } catch { oldSeries = []; }
    return {
        efficiency: doseBacktest(r.dose, probes),
        effort: doseBacktest(r.dose, effortProbes),
        noise: { v2: seriesNoise(r.response.eff.weeks.map(w => w.pace)), old: seriesNoise(oldSeries) },
        readiness: readinessCheck({
            ...readinessInputs(),
            response: { effRuns: r.response.eff.runs, effortRows: r.response.effort.rows },
            loadSeries: r.state.series, quality: r.response.quality.sessions, doses: r.dose.doses,
            planDays: r.planDays, execution: yearOfExecution(r.today)
        }, r.today)
    };
}

const CLASS_WORDS = { easy: "Easy", steady: "Steady", long: "Long", tempo: "Tempo", threshold: "Threshold", intervals: "Intervals", race: "Race" };
const clockPace = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function responseHtml(r, today, { heading = true } = {}) {
    const { eff, effort, quality, execution, drift } = r;
    const rd = r.reading;
    const sig = eff.signal;
    const effLine = sig.verdict === "few"
        ? `Needs 3+ easy runs with heart rate in the last 2 weeks (and 6 in the 8 weeks before) to say anything.`
        : sig.verdict === "none"
            ? `No clear change: your easy runs are within ${Math.max(2, Math.abs(sig.bpm))} bpm of the 8 weeks before at the same pace (${signed(sig.bpm)} bpm, ± ${sig.se}).`
            : `Your easy runs are <strong>${Math.abs(sig.bpm)} bpm ${sig.verdict} at the same pace</strong> than over the 8 weeks before (${esc(day(sig.from))} – ${esc(day(sig.to))}), worth about ${Math.abs(sig.paceSec)} s/mi ${sig.paceSec > 0 ? "faster" : "slower"} at the same heart rate.`;
    const weeks = eff.weeks.filter(w => w.pace);
    const effChart = weeks.length >= 2 ? `${lineSvg(eff.weeks.map(w => w.pace), { invert: true, height: 60 })}<div class="tr-axis"><span>${esc(day(eff.weeks[0].week))}</span><span>Faster is higher</span><span>This week</span></div>` : "";
    const last = weeks.at(-1);
    const es = effort.signal;
    const effortLine = es.verdict === "few"
        ? `Answer "How hard was it?" after runs: ${effort.answered} of your ${effort.recentRuns} runs in the last 2 weeks have an effort. It needs 3 in the last 3 weeks.`
        : es.verdict === "costlier" ? `Your last ${es.n} answered runs felt <strong>${es.mean} harder</strong> than usual for you on average (1.0 or more is worth noticing).`
        : es.verdict === "easier" ? `Your last ${es.n} answered runs felt <strong>${Math.abs(es.mean)} easier</strong> than usual for you.`
        : `Your last ${es.n} answered runs felt about as hard as usual (${signed(es.mean)}).`;
    const effortRows = effort.rows.slice(-5).reverse().map(x => `<li><span>${esc(day(x.date))}</span><span>${esc(CLASS_WORDS[x.cls])} · ${x.minutes} min</span><b>${x.rpe}</b><small>expected ${x.expected}${x.late ? " · rated late, counts half" : ""}</small></li>`).join("");
    const q = quality.signal;
    const qualityLine = q.verdict === "few" ? "" : `<li>Heart rate on quality reps: <strong>${signed(q.bpm)} bpm</strong> against your own reps at the same speed over the 8 weeks before (last ${q.n} sessions with laps).</li>`;
    const ex = execution;
    const exLine = ex.sessions ? `<li>Quality sessions of the last 6 weeks with laps: <strong>${ex.onTarget} of ${ex.work}</strong> work reps on target${ex.fast ? `, ${ex.fast} too fast` : ""}${ex.slow ? `, ${ex.slow} too slow` : ""} (${ex.sessions} ${ex.sessions === 1 ? "session" : "sessions"}).</li>` : "";
    const driftLine = drift.length ? `<li>Long runs, second half vs first (heart rate per pace): ${drift.map(d => `${esc(day(d.date))} ${d.miles} mi <strong>${d.drift > 0 ? "+" : ""}${d.drift}%</strong>`).join(" · ")}. Under 5% means you held steady.</li>` : "";
    return `
        ${heading ? `<p class="rc-sub-h">How you responded</p>` : ""}
        <div class="lc-reading is-${esc(rd.key)}"><strong>${esc(rd.title)}</strong><p>${esc(rd.text)}</p>${rd.note ? `<small>${esc(rd.note)}</small>` : ""}</div>
        <div class="lc-resp">
            <div class="lc-resp-part">
                <h3 class="lc-h">Easy-run efficiency</h3>
                ${last && eff.refHr ? `<p class="lc-big"><strong>${clockPace(last.pace)}</strong>/mi at ${eff.refHr} bpm <small>your usual easy heart rate</small></p>` : ""}
                ${effChart}
                <p class="lc-line">${effLine}</p>
                ${eff.summer && sig.verdict === "higher" ? `<p class="tr-note">It's summer: heat alone raises heart rate at the same pace.</p>` : ""}
            </div>
            <div class="lc-resp-part">
                <h3 class="lc-h">Effort vs what it usually costs you</h3>
                <p class="lc-line">${effortLine}</p>
                ${effortRows ? `<ul class="lc-effort">${effortRows}</ul>` : ""}
            </div>
        </div>
        ${qualityLine || exLine || driftLine ? `<ul class="rc-why">${qualityLine}${exLine}${driftLine}</ul>` : ""}`;
}

function corosLine(c) {
    if (!c) return "";
    return `<li>COROS on ${esc(day(c.latest.date))}: Base Fitness <strong>${c.latest.coros.base ?? "—"}</strong>, Load Impact <strong>${c.latest.coros.impact ?? "—"}</strong>${c.latest.coros.ratio ? `, ratio ${c.latest.coros.ratio}` : ""}. Ours that day: base ${c.latest.ours.base}, recent ${c.latest.ours.recent}. ${esc(corosWords(c))} <small>Different scales and both smoothed, so the levels always look alike; it's the weekly changes that are compared.</small></li>`;
}

function monotonyWord(m) {
    return m == null ? "" : m > 2 ? "even" : m > 1.5 ? "some contrast" : "varied";
}

/** By week (last 8, with monotony and strain) and by month (last 12). */
function totalsHtml(t) {
    if (!t) return "";
    const weeks = t.weeks.filter(w => w.runs || w.current).slice(-8).reverse();
    const months = t.months.filter(m => m.runs || m.current).reverse();
    const weekRows = weeks.map(w => `<tr>
            <th scope="row">${esc(day(w.start))}${w.current ? "<small>so far</small>" : ""}</th>
            <td>${w.runs}</td><td>${w.miles}</td><td>${whole(w.load)}</td>
            <td>${whole(w.effortLoad)}<small>${w.rated} of ${w.runs} rated</small></td>
            <td>${w.monotony ?? "—"}${w.monotony != null ? `<small>${monotonyWord(w.monotony)}</small>` : ""}</td>
            <td>${w.strain != null ? whole(w.strain) : "—"}${w.strain != null && t.strainUsual && w.strain > t.strainUsual * 1.3 ? `<small class="is-bad">well above your usual</small>` : ""}</td></tr>`).join("");
    const monthRows = months.map(m => `<tr>
            <th scope="row">${esc(m.label)}${m.current ? "<small>so far</small>" : ""}</th>
            <td>${m.runs}</td><td>${whole(m.miles)}</td><td>${whole(m.load)}</td>
            <td>${whole(m.effortLoad)}<small>${m.rated} of ${m.runs} rated</small></td></tr>`).join("");
    return `
        <p class="rc-sub-h">By week and by month</p>
        <div class="mc-scroll"><table class="mc-table lc-weeks">
            <thead><tr><th scope="col">Week of</th><th scope="col">Runs</th><th scope="col">Miles</th><th scope="col">Load</th><th scope="col">Effort load</th><th scope="col">Monotony</th><th scope="col">Strain</th></tr></thead>
            <tbody>${weekRows}</tbody>
        </table></div>
        <p class="tr-note">Load is what you did (pace; heart rate only where pace can't measure a run). Effort load is minutes × your 1–10, for the runs you rated. Monotony is a week's daily average ÷ how much the days differ (over 2 means every day felt the same); strain is the week's load × monotony${t.strainUsual ? `; your usual strain is ${whole(t.strainUsual)}` : ""}. A week stands out when both are high.</p>
        ${monthRows ? `<details class="rc-details"><summary>By month (last 12)</summary>
            <div class="mc-scroll"><table class="mc-table lc-months">
                <thead><tr><th scope="col">Month</th><th scope="col">Runs</th><th scope="col">Miles</th><th scope="col">Load</th><th scope="col">Effort load</th></tr></thead>
                <tbody>${monthRows}</tbody>
            </table></div></details>` : ""}`;
}

function mixLine(weeks) {
    const last4 = weeks.slice(-4);
    const t = k => last4.reduce((s, w) => s + w[k], 0);
    const all = t("easy") + t("threshold") + t("hard");
    if (!(all > 0)) return "";
    const pct = k => Math.round(t(k) / all * 100);
    return `Last 4 weeks by load: <strong>${pct("easy")}% easy</strong> · ${pct("threshold")}% steady / threshold · ${pct("hard")}% hard`;
}

function renderLoad() {
    const el = $("loadPanel");
    if (!el || !result) return;
    const { state, dose, today } = result;
    el.dataset.version = `${DOSE_VERSION}/${LOAD_VERSION}/${RESPONSE_VERSION}`;
    const split = Boolean($("responsePanel"));
    const head = `<div class="panel-header"><div><h2>${split ? "Training load" : "Load and response"} ${kindChip("calculated")}</h2>
        <p>What your running has asked of you: the load of what you did (pace and hills), against your own last year. How hard it landed (heart rate, effort) is kept apart, in How you responded${split ? " (Response, below)" : ""}, so a run that felt hard isn't counted twice.</p></div></div>`;
    if (!state.today) {
        el.innerHTML = `${head}<p class="ar-empty">No runs with a time yet. Connect COROS or import your Strava archive below.</p>`;
        return;
    }
    const t = state.today;
    const anchor = dose.anchors.get(mondayOf(today));
    const words = recentWords(t.percentile);
    const weeks = state.weeks;
    const from = weeks[0].start;
    const days = state.series.filter(s => s.date >= from);
    const slots = weeks.length * 7 - (7 - weeks.at(-1).daysIn);
    const lead = Array.from({ length: Math.max(0, slots - days.length) }, () => ({ base: null, recent: null }));
    const yearCounts = { pace: 0, hr: 0, effort: 0, miles: 0, none: 0 };
    const usedBy = { pace: 0, hr: 0, effort: 0 };
    for (const d of dose.doses) {
        if (d.date <= addDays(today, -365)) continue;
        yearCounts[d.source]++;
        if (d.raw.pace > 0) usedBy.pace++;
        if (d.internal?.hr > 0) usedBy.hr++;
        if (d.internal?.effort > 0) usedBy.effort++;
    }
    const scored = Object.entries(yearCounts).filter(([, n]) => n).map(([k, n]) => `${whole(n)} ${SOURCE_WORDS[k]}`).join(" · ");
    const measures = `pace in ${whole(usedBy.pace)}; how hard they landed: heart rate in ${whole(usedBy.hr)}, your effort in ${whole(usedBy.effort)}`;
    const ticks = [weeks[0], weeks[Math.floor(weeks.length / 2)], weeks.at(-1)];

    el.innerHTML = `${head}
        <div class="lc-stats">
            <div class="lc-stat"><span>Recent load</span><strong>${t.recent}</strong><small>a day, last ~${TAU.recent} days</small></div>
            <div class="lc-stat"><span>Training base</span><strong>${t.base}</strong><small>${t.baseChange == null ? "a day, last ~6 weeks" : `${signed(t.baseChange)} this week`}</small></div>
            <div class="lc-stat"><span>Load balance</span><strong>${signed(t.balance)}</strong><small>${t.balance < 0 ? "recent above base" : "recent below base"}</small></div>
        </div>
        ${words ? `<p class="lc-line">Recent load is <strong>${esc(words)}</strong> (${ordinal(t.percentile)} percentile; your year ran ${t.yearLow}–${t.yearHigh}).</p>` : `<p class="lc-line">Where this sits against your year shows once there are 4 weeks of runs.</p>`}
        <div class="lc-figure">
            ${loadChartSvg(weeks, [...lead, ...days], { height: 100 })}
            <div class="tr-axis"><span>${esc(day(ticks[0].start))}</span><span>${esc(day(ticks[1].start))}</span><span>This week</span></div>
        </div>
        <p class="tr-legend"><span class="lc-key easy"></span> easy <span class="lc-key threshold"></span> steady / threshold <span class="lc-key hard"></span> hard <span class="lc-key line base"></span> training base <span class="lc-key line recent"></span> recent load</p>
        <ul class="rc-why">
            ${mixLine(weeks) ? `<li>${mixLine(weeks)}</li>` : ""}
            <li>Long runs (${LONG_RUN.miles}+ mi or ${LONG_RUN.minutes}+ min) in the last 8 weeks: <strong>${state.longRuns.count}</strong>${state.longRuns.count ? `, longest ${state.longRuns.longest} mi` : ""}</li>
            ${anchor?.v60 ? `<li>Your 1-hour race pace now: <strong>${paceMile(anchor.v60)}/mi</strong>, from ${esc(V60_WORDS[anchor.v60Source] || "your runs")}. 1 hour at that pace = 100 points.</li>` : `<li>No 1-hour pace yet (no races or fast efforts on record), so runs are scored by heart rate or effort.</li>`}
            <li>Runs in the last year, load measured ${esc(scored || "none")}. Measures there: ${esc(measures)}.</li>
            ${corosLine(result.coros)}
        </ul>
        ${totalsHtml(result.totals)}
        ${split ? "" : responseHtml(result.response, today)}
        <details class="rc-details" id="lcHow"><summary>How this is worked out</summary>
            <p>Dose ${esc(DOSE_VERSION)} · load ${esc(LOAD_VERSION)} · response ${esc(RESPONSE_VERSION)}. Each run's load is what was done (external load); heart rate and effort are how it landed (internal load), shown beside it and read as your response, never added to it. Training base and recent load are exponentially weighted daily averages (about ${TAU.base} and ${TAU.recent} days); rest days count as zero. There's no "safe zone": ratios of recent to base load don't predict injury reliably, so this shows where you are against your own year instead.</p>
            ${anchor ? `<p>Heart rate: max ${anchor.hrMax} (${esc(anchor.hrMaxSource)}), resting ${anchor.hrRest} (${esc(anchor.hrRestSource)}).</p>` : ""}
            <ul>${[...DOSE_ASSUMPTIONS, ...RESPONSE_ASSUMPTIONS].map(a => `<li>${esc(a)}</li>`).join("")}</ul>
        </details>`;
}

// Phase C: "How you responded" has its own section (Response) when the page has the host.
function renderResponse() {
    const el = $("responsePanel");
    if (!el || !result) return;
    el.dataset.version = RESPONSE_VERSION;
    const head = `<div class="panel-header"><div><h2>How you responded ${kindChip("estimated")}</h2>
        <p>Your easy runs' heart rate at the same pace, how hard runs felt against what they usually cost you, heart rate on quality reps and long-run drift, each against your own recent weeks.</p></div></div>`;
    el.innerHTML = result.state.today
        ? `${head}${responseHtml(result.response, result.today, { heading: false })}`
        : `${head}<p class="ar-empty">No runs with a time yet. Connect COROS or import your Strava archive below.</p>`;
}

function pairRow(label, p) {
    if (!p || p.n < 3) return `<tr><th scope="row">${esc(label)}</th><td>${p?.n ?? 0}</td><td colspan="3" class="mc-none">Needs 3+ runs with both</td></tr>`;
    return `<tr><th scope="row">${esc(label)}</th><td>${p.n}</td><td>${p.ratio.toFixed(2)}</td><td>± ${p.spreadPct}%</td><td>${p.r == null ? "–" : p.r.toFixed(2)}</td></tr>`;
}

function agreementWords(p, name) {
    if (!p || p.n < 3) return `Not enough runs with ${name} and pace together yet.`;
    if (p.r != null && p.r >= 0.8 && p.spreadPct <= 15) return `${name} and pace agree closely (r ${p.r.toFixed(2)}, ± ${p.spreadPct}%): either would tell the same story.`;
    if (p.r != null && p.r >= 0.6) return `${name} and pace mostly agree (r ${p.r.toFixed(2)}, ± ${p.spreadPct}%). The runs where they don't are the interesting ones: step 4 reads those gaps as how you responded.`;
    return `${name} and pace often disagree (r ${p.r == null ? "–" : p.r.toFixed(2)}, ± ${p.spreadPct}%). The gap between them is read as how you responded, not as extra load.`;
}

function renderAgreement() {
    const el = $("doseCheckPanel");
    if (!el || !result) return;
    const a = result.agreement;
    const s = result.dose.scale;
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>Model check: training load</h2>
            <p>Pace, heart rate and effort are three readings of the same run: how closely they agree over the last year, and which one best tracks how you respond.</p>
        </div></div>
        ${!a.runs ? `<p class="ar-empty">No runs in the last year yet.</p>` : `
            <div class="mc-scroll"><table class="mc-table">
                <thead><tr><th scope="col">Against pace load</th><th scope="col">Runs</th><th scope="col">Ratio</th><th scope="col">Spread</th><th scope="col"><abbr title="Correlation: 1 = always move together">Agree (r)</abbr></th></tr></thead>
                <tbody>${pairRow("Heart-rate load", a.hr)}${pairRow("Effort load", a.effort)}</tbody>
            </table></div>
            <ul class="rc-why">
                <li>${esc(agreementWords(a.hr, "Heart rate"))}</li>
                <li>${esc(agreementWords(a.effort, "Effort"))}</li>
                <li>Could be scored, last year: ${a.coverage.pace} of ${a.runs} by pace, ${a.coverage.hr} by heart rate, ${a.coverage.effort} by effort.</li>
                <li>Scale used for runs without pace: heart rate × ${s.hr.ratio.toFixed(2)}${s.hr.own ? ` (yours ${s.hr.own.toFixed(2)} from ${s.hr.n} runs, blended with the default ${s.hr.default})` : " (the default until 3+ runs have both)"}; effort × ${s.effort.ratio.toFixed(2)}${s.effort.own ? ` (yours ${s.effort.own.toFixed(2)} from ${s.effort.n} runs)` : " (the default)"}.</li>
            </ul>
            ${checkHtml(result.check)}`}`;
}

const minus = x => (x < 0 ? `−${Math.abs(x).toFixed(2)}` : x.toFixed(2));
const VERDICT_WORDS = { better: "better", worse: "worse", same: "no clear difference" };

function testTable(t, outcome) {
    if (!t) return `<p class="ar-empty sb-wait"></p>`;
    if (t.verdict === "few") return `<p class="tr-note">${esc(outcome)}: needs 20+ runs to test (${t.n} so far).</p>`;
    return `<div class="mc-scroll"><table class="mc-table mc-dose">
            <thead><tr><th scope="col">${esc(outcome)} (${t.n} runs)</th><th scope="col">r</th><th scope="col">95% range</th><th scope="col">vs Southbound's</th></tr></thead>
            <tbody>${t.variants.map(v => `<tr><th scope="row">${esc(v.label)}</th><td>${minus(v.r)}</td><td>${minus(v.lo)} to ${minus(v.hi)}</td><td>${v.vsPrimary ? esc(VERDICT_WORDS[v.vsPrimary]) : "–"}</td></tr>`).join("")}</tbody>
        </table></div>`;
}

function checkHtml(c) {
    const verdict = t => (!t || t.verdict === "few" ? null : !t.link
        ? "In your runs so far, a higher recent load doesn't show up as this response the next day for any of these measures, so nothing to choose between yet. The dose stays as it is."
        : t.verdict === "keep"
        ? "None of the other measures tracks it clearly better, so the dose stays as it is (ties go to the simpler rule)."
        : `${t.better.map(k => t.variants.find(v => v.key === k).label).join(" and ")} tracked it clearly better. Worth switching the dose once this holds for a few more weeks.`);
    const n = c?.noise;
    return `
        <p class="rc-sub-h">Which load measure tracks how you respond</p>
        <p class="tr-note">For every easy run with an efficiency reading and every run with an effort answer: did a recent load above your base the day before go with a higher heart rate at the same pace, or a run that felt harder than expected? Higher r = tracks it more closely.</p>
        ${testTable(c?.efficiency, "Easy-run heart rate")}
        ${verdict(c?.efficiency) ? `<p class="lc-line">${esc(verdict(c.efficiency))}</p>` : ""}
        ${testTable(c?.effort, "Effort vs expected")}
        ${verdict(c?.effort) ? `<p class="lc-line">${esc(verdict(c.effort))}</p>` : ""}
        <p class="rc-sub-h">Easy-run efficiency vs the old Aerobic fitness</p>
        ${!c ? `<p class="ar-empty sb-wait"></p>` : n?.v2 && n?.old
            ? `<p class="lc-line">Week-to-week wobble over the last ${Math.min(n.v2.weeks, n.old.weeks)} weeks: <strong>± ${n.v2.sd} s/mi</strong> for the new easy-run efficiency vs ± ${n.old.sd} s/mi for the old "pace at 140 bpm". ${n.v2.sd < n.old.sd ? "The new one is steadier, so a real change shows sooner." : n.v2.sd > n.old.sd ? "The old one is steadier here; the new one also adjusts for pace and leaves out hilly, hard and treadmill runs." : "About the same."}</p>`
            : `<p class="tr-note">Needs a few more weeks of easy runs with heart rate to compare.</p>`}`;
}

const READY_WORDS = {
    better: "The new readiness warns of bad training days better than Classic so far. Worth switching it on in Today's Readiness card (Score: New).",
    worse: "Classic warns of bad training days better than the new readiness so far. Keep Classic.",
    same: "No clear difference between Classic and the new readiness yet. Classic stays the default; more mornings will separate them."
};
const KIND_WORDS = { skipped: "skipped or cut short", slow: "off target", rough: "felt or ran worse than usual", hurt: "pain or sickness next" };
const vsWords = (name, c) => !c ? `${name}: not enough bad and ordinary days yet to compare with what you already knew.`
    : c.verdict === "better" ? `${name} adds something: it warns better than just knowing yesterday went badly (+${minus(c.diff)}, 95% range ${minus(c.lo)} to ${minus(c.hi)}).`
    : c.verdict === "worse" ? `${name} warns worse than just knowing yesterday went badly (${minus(c.diff)}, 95% range ${minus(c.lo)} to ${minus(c.hi)}).`
    : `${name} doesn't yet warn better than just knowing yesterday went badly (${c.diff > 0 ? "+" : ""}${minus(c.diff)}, 95% range ${minus(c.lo)} to ${minus(c.hi)}).`;

function renderReadinessCheck() {
    const el = $("readinessCheckPanel");
    if (!el || !result) return;
    const c = result.check?.readiness;
    const head = `<div class="panel-header"><div>
            <h2>Model check: readiness</h2>
            <p>Does a low morning score come before a bad training day: a planned run skipped or cut short, a key workout off its targets, a run that felt or ran worse than usual for you, or pain or sickness in the next 2 days? None of these are inside the score it's checking.</p>
        </div></div>`;
    if (!c) { el.innerHTML = `${head}<p class="ar-empty sb-wait"></p>`; return; }
    el.dataset.version = READINESS_V2_VERSION;
    el.dataset.check = c.version;
    const kinds = Object.entries(c.kinds || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${KIND_WORDS[k]}`).join(", ");
    el.innerHTML = `${head}
        ${!c.n ? `<p class="ar-empty">No training days to check yet: it needs your plan or runs, and the morning numbers.</p>` : `
            <p class="lc-line">${c.n} training days in the last year · <strong>${c.bad} went badly</strong>${kinds ? ` (${esc(kinds)})` : ""}.</p>
            <div class="mc-scroll"><table class="mc-table mc-ready">
                <thead><tr><th scope="col">Morning number</th><th scope="col">Days</th><th scope="col"><abbr title="0.5 = a coin flip; 1.0 = always lower before a bad day">AUC</abbr></th><th scope="col">95% range</th></tr></thead>
                <tbody>${c.methods.map(m => `<tr${m.key === "persist" ? ' class="mc-base"' : ""}><th scope="row">${esc(m.label)}</th><td>${m.n}</td>${m.auc == null ? `<td colspan="2" class="mc-none">Needs 5 bad and 5 ordinary days</td>` : `<td>${m.auc.toFixed(2)}</td><td>${m.lo.toFixed(2)} to ${m.hi.toFixed(2)}</td>`}</tr>`).join("")}</tbody>
            </table></div>
            <p class="lc-line">${c.v2vsV1 ? `${esc(READY_WORDS[c.v2vsV1.verdict])} (New − Classic: ${c.v2vsV1.diff > 0 ? "+" : ""}${minus(c.v2vsV1.diff)}, 95% range ${minus(c.v2vsV1.lo)} to ${minus(c.v2vsV1.hi)}, ${c.v2vsV1.n} days.)` : "Not enough bad and ordinary days with both scores to compare Classic and New yet."}</p>
            <p class="lc-line">${esc(vsWords("New", c.v2vsPersist))} ${esc(vsWords("Classic", c.v1vsPersist))}</p>
            <p class="tr-note">AUC: 0.5 means the number tells you nothing about the day; 0.7 or more is a useful warning sign. "What you already knew" is the bar to clear: bad days come in runs, so a score is only worth having if it warns better than yesterday did. The ranges come from drawing whole weeks, not single days, because days next to each other aren't independent.</p>`}`;
}

async function refresh() {
    const inputs = await loadModelInputs();
    result = compute(inputs);
    renderLoad();
    renderResponse();
    const facts = { response: result.response, load: result.state.today ? { percentile: result.state.today.percentile } : null };
    window.__sbAnalyticsFacts = { ...(window.__sbAnalyticsFacts || {}), ...facts };
    window.dispatchEvent(new CustomEvent("sb:analytics-facts", { detail: facts }));
    renderAgreement();
    renderReadinessCheck();
    const mine = result;
    setTimeout(() => {
        if (result !== mine) return;
        mine.check = computeCheck(mine);
        renderAgreement();
        renderReadinessCheck();
    }, 30);
}

function mount() {
    if (!$("loadPanel")) return;
    for (const e of ["sb:athlete-answers", "sb:strava-updated", "eddieos:coros-history-updated"]) window.addEventListener(e, () => refresh().catch(() => {}));
    // The race card computes first; this one waits a moment so the page draws.
    setTimeout(() => refresh().catch(error => console.error("Southbound: training load couldn't load.", error)), 0);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
