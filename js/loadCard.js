/* ==========================================
   Southbound — Load and response on Analytics (coach's own)

   The athlete model's dose (js/sessionDose.js) and load state
   (js/loadState.js), drawn as one card: where recent load sits against
   your own last year, the training base and its change, the last 16
   weeks as bars by intensity with the base and recent lines over them,
   the intensity mix, long runs and how each run was scored. Replaces
   the old Load panel and its acute : chronic "safe range" (3.4 of
   docs/PERFORMANCE_ENGINE_PLAN.md: no ratio zones). Response signals
   (easy-run heart rate, effort vs expected) join it in step 4.
   Also draws "Model check: training load" (how the three dose measures
   agree) under the race Model check.
========================================== */

import { sessionDoses, doseAgreement, DOSE_ASSUMPTIONS, DOSE_VERSION, LONG_RUN } from "./sessionDose.js";
import { loadState, recentWords, LOAD_VERSION, TAU } from "./loadState.js";
import { loadChartSvg } from "./svgCharts.js";
import { loadModelInputs, loadLaps } from "./athleteData.js";
import { addDays } from "./athleteLedger.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const whole = n => Math.round(n).toLocaleString();
const ordinal = n => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const signed = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
const paceMile = v => { const s = Math.round(1609.344 / v); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
const V60_WORDS = { race: "a recent race", training: "your fastest recent training efforts", coros: "COROS's threshold pace", older: "your last known fitness (nothing recent)" };
const SOURCE_WORDS = { pace: "by pace", hr: "by heart rate", effort: "by effort", miles: "miles only", none: "not scored" };

let result = null;

function compute(inputs) {
    const dose = sessionDoses(inputs.sessions, inputs.today, { laps: loadLaps(), health: inputs.health, fitness: inputs.fitness });
    const state = loadState(dose.doses, inputs.today);
    return { today: inputs.today, dose, state, agreement: doseAgreement(dose, inputs.today) };
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
    el.dataset.version = `${DOSE_VERSION}/${LOAD_VERSION}`;
    const head = `<div class="panel-header"><div><h2>Load and response</h2>
        <p>What your running has asked of you, from every run's pace (or heart rate, or effort), against your own last year.</p></div></div>`;
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
    for (const d of dose.doses) if (d.date > addDays(today, -365)) yearCounts[d.source]++;
    const scored = Object.entries(yearCounts).filter(([, n]) => n).map(([k, n]) => `${whole(n)} ${SOURCE_WORDS[k]}`).join(" · ");
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
            <li>Runs in the last year: ${esc(scored || "none")}.</li>
        </ul>
        <p class="tr-note">How your body responded (easy-run heart rate at the same pace, effort against what a run usually costs you) joins this card in the next step.</p>
        <details class="rc-details"><summary>How this is worked out</summary>
            <p>Dose ${esc(DOSE_VERSION)} · load ${esc(LOAD_VERSION)}. Each run gets one dose, not three added together. Training base and recent load are exponentially weighted daily averages (about ${TAU.base} and ${TAU.recent} days); rest days count as zero. There's no "safe zone": ratios of recent to base load don't predict injury reliably, so this shows where you are against your own year instead.</p>
            ${anchor ? `<p>Heart rate: max ${anchor.hrMax} (${esc(anchor.hrMaxSource)}), resting ${anchor.hrRest} (${esc(anchor.hrRestSource)}).</p>` : ""}
            <ul>${DOSE_ASSUMPTIONS.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
        </details>`;
}

function pairRow(label, p) {
    if (!p || p.n < 3) return `<tr><th scope="row">${esc(label)}</th><td>${p?.n ?? 0}</td><td colspan="3" class="mc-none">Needs 3+ runs with both</td></tr>`;
    return `<tr><th scope="row">${esc(label)}</th><td>${p.n}</td><td>${p.ratio.toFixed(2)}</td><td>± ${p.spreadPct}%</td><td>${p.r == null ? "–" : p.r.toFixed(2)}</td></tr>`;
}

function agreementWords(p, name) {
    if (!p || p.n < 3) return `Not enough runs with ${name} and pace together yet.`;
    if (p.r != null && p.r >= 0.8 && p.spreadPct <= 15) return `${name} and pace agree closely (r ${p.r.toFixed(2)}, ± ${p.spreadPct}%): either would tell the same story.`;
    if (p.r != null && p.r >= 0.6) return `${name} and pace mostly agree (r ${p.r.toFixed(2)}, ± ${p.spreadPct}%). The runs where they don't are the interesting ones: step 4 reads those gaps as how you responded.`;
    return `${name} and pace often disagree (r ${p.r == null ? "–" : p.r.toFixed(2)}, ± ${p.spreadPct}%). Pace stays the dose; ${name.toLowerCase()} is kept as a response signal.`;
}

function renderAgreement() {
    const el = $("doseCheckPanel");
    if (!el || !result) return;
    const a = result.agreement;
    const s = result.dose.scale;
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>Model check: training load</h2>
            <p>Pace, heart rate and effort are three readings of the same run. How closely they agree over the last year, on runs that have both.</p>
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
            <p class="tr-note">The real test (which measure best predicts how you respond in the following days) needs the response signals of step 4. Until then pace is the dose because it's the one that tiredness, heat and illness don't move.</p>`}`;
}

async function refresh() {
    const inputs = await loadModelInputs();
    result = compute(inputs);
    renderLoad();
    renderAgreement();
}

function mount() {
    if (!$("loadPanel")) return;
    for (const e of ["sb:athlete-answers", "sb:strava-updated", "eddieos:coros-history-updated"]) window.addEventListener(e, () => refresh().catch(() => {}));
    // The race card computes first; this one waits a moment so the page draws.
    setTimeout(() => refresh().catch(error => console.error("Southbound: training load couldn't load.", error)), 0);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
