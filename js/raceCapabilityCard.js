/* ==========================================
   Southbound — Race capability + Model check on Analytics (coach's own)

   Race capability (js/raceCapability.js): what the evidence says you
   could run at 5K / 10K / half / marathon today, with an 80% range,
   the lenses and why they disagree, durability for the half and up,
   data quality and the assumptions. For the plan's race, "Lock this
   prediction" saves today's number in "athlete-model" so it can be
   scored honestly after race day (the prospective test).
   Model check (js/raceBacktest.js): every confirmed race predicted only
   from what came before it, each method's misses, the range's hit
   rate, and Copy results (times and errors only).
   Docs: docs/PERFORMANCE_ENGINE_PLAN.md (3.7, Phase 4).
========================================== */

import { predictRace, clock, distanceLabel, RACE_MODEL_VERSION, ASSUMPTIONS } from "./raceCapability.js";
import { backtest, exportable, METHODS } from "./raceBacktest.js";
import { loadModelInputs, planRace, loadModelRecord, saveLock } from "./athleteData.js";
import { isRace } from "./athleteParams.js";
import { toast } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const dayYear = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const daysUntil = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 864e5);
const pct = x => `${(x * 100).toFixed(1)}%`;
const signedMin = sec => `${sec < 0 ? "−" : "+"}${clock(Math.abs(sec))}`;

const DISTANCES = [
    { key: "5k", label: "5K", meters: 5000 },
    { key: "10k", label: "10K", meters: 10000 },
    { key: "half", label: "Half", meters: 21097.5 },
    { key: "marathon", label: "Marathon", meters: 42195 }
];

let inputs = null;
let race = null;
let chosen = "marathon";
let checkResult = null;
let showAllRows = false;

function lensRow(l) {
    return `<li class="rc-lens">
        <span class="rc-lens-name">${esc(l.label)}</span>
        <strong>${esc(clock(l.sec))}</strong>
        <span class="rc-lens-sd">± ${Math.round(l.sigma * 100)}%</span>
        <small>${esc(l.note)}${l.adjusted ? ` · includes the preparation trim (${esc(clock(l.raw))} before it)` : ""}</small>
    </li>`;
}

function durabilityHtml(d) {
    if (!d) return "";
    const p = d.parts;
    const bar = (v, t) => `<span class="rc-bar"><span style="width:${Math.min(100, Math.round(v / t * 100))}%"></span></span>`;
    return `<div class="rc-dur">
        <p class="rc-sub-h">Preparation: ${d.kind === "marathon" ? "marathon" : "half"}-specific training · last 12 weeks · ${Math.round(d.readiness * 100)}% of a typical plan</p>
        <ul>
            <li><span>Weekly miles</span>${bar(p.weekly.value, p.weekly.target)}<b>${p.weekly.value} / ${p.weekly.target}</b></li>
            <li><span>Runs of ${p.longRuns.over}+ mi</span>${bar(p.longRuns.value, p.longRuns.target)}<b>${p.longRuns.value} / ${p.longRuns.target}</b></li>
            <li><span>Longest run</span>${bar(p.longest.value, p.longest.target)}<b>${p.longest.value} / ${p.longest.target} mi</b></li>
        </ul>
        <small class="rc-dur-note">${d.applied ? "Taken off the time above." : d.deficit < 0.001 ? "Nothing to take off." : `Shown, not taken off the time: whether a thinner block slows you is checked on your own races in Model check ("Southbound + preparation trim").${d.couldCostSec >= 60 ? ` A typical effect would be up to about ${Math.round(d.couldCostSec / 60)} min.` : ""}`}</small>
    </div>`;
}

function lockHtml(result) {
    if (!race || chosen !== DISTANCES.find(d => Math.abs(d.meters - race.meters) < 1)?.key) return "";
    const locks = (loadModelRecord().locks || []).filter(l => l.target?.date === race.date && Math.abs(l.target.meters - race.meters) < 1);
    const first = locks[0];
    const actual = inputs.sessions.find(s => isRace(s) && s.date === race.date && Math.abs(s.race.meters - race.meters) / race.meters < 0.03);
    const until = daysUntil(inputs.today, race.date);
    const header = `<p class="rc-race"><strong>${esc(race.name)}</strong> · ${esc(day(race.date))}${until > 0 ? ` · in ${until} days` : until === 0 ? " · today" : ""}${race.goalSec ? ` · goal ${esc(clock(race.goalSec))}` : ""}</p>`;
    const goal = race.goalSec && result.sec ? `<p class="rc-goal">${race.goalSec < result.lo ? `Your goal ${clock(race.goalSec)} is faster than the range today.` : race.goalSec > result.hi ? `Your goal ${clock(race.goalSec)} is slower than the range: there's room.` : `Your goal ${clock(race.goalSec)} is inside the range.`}</p>` : "";
    if (first) {
        const verdict = actual
            ? `<p class="rc-locked-result">You ran <strong>${esc(clock(actual.race.timeSec))}</strong>: ${esc(signedMin(actual.race.timeSec - first.sec))} against the locked ${esc(clock(first.sec))}, ${actual.race.timeSec >= first.lo && actual.race.timeSec <= first.hi ? "inside" : "outside"} its range.</p>`
            : "";
        return `${header}${goal}<div class="rc-lock is-locked">Locked ${esc(dayYear(new Date(first.lockedAt).toISOString().slice(0, 10)))}: <strong>${esc(clock(first.sec))}</strong> (${esc(clock(first.lo))}–${esc(clock(first.hi))}, ${esc(first.confidence)} confidence, model ${esc(first.modelVersion)}). ${actual ? "" : "It stays as it is until race day, so the check after is honest."}${verdict}</div>`;
    }
    if (until < 0) return header;
    return `${header}${goal}<div class="rc-lock"><button type="button" class="sb-btn sb-btn-secondary" data-lock>Lock this prediction for race day</button><small>Saves today's number so it can be checked honestly after the race. It can't be changed later.</small></div>`;
}

function renderCapability() {
    const el = $("capabilityPanel");
    if (!el || !inputs) return;
    const target = DISTANCES.find(d => d.key === chosen);
    const r = predictRace({ meters: target.meters, asOf: inputs.today, sessions: inputs.sessions, health: inputs.health, fitness: inputs.fitness });
    el.dataset.version = RACE_MODEL_VERSION;
    const chips = DISTANCES.map(d => `<button type="button" class="rc-chip${d.key === chosen ? " is-on" : ""}" data-dist="${d.key}" aria-pressed="${d.key === chosen}">${d.label}</button>`).join("");
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>Race capability</h2>
            <p>What your evidence says you could run if you raced today, with a range and the reasons. Not validated yet: see Model check below.</p>
        </div></div>
        <div class="rc-chips" role="group" aria-label="Distance">${chips}</div>
        ${r.sec ? `
            <div class="rc-head">
                <span class="rc-time">${esc(clock(r.sec))}</span>
                <span class="rc-range">80% range ${esc(clock(r.lo))}–${esc(clock(r.hi))} · <b class="rc-conf is-${esc(r.confidence.toLowerCase())}">${esc(r.confidence)} confidence</b> · data ${esc(r.quality.grade)}</span>
            </div>
            ${lockHtml(r)}
            <ul class="rc-why">${r.explanation.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
            <p class="rc-sub-h">The evidence</p>
            <ul class="rc-lenses">${r.lenses.map(lensRow).join("")}</ul>
            ${durabilityHtml(r.durability)}
            <details class="rc-details"><summary>How this is worked out</summary>
                <p>Model ${esc(r.version)} · distance exponent ${r.exponent.toFixed(3)} (${esc(r.params.exponent.source)})${r.params.cs ? ` · critical speed ${esc(clock(1609.344 / r.params.cs.cs))}/mi` : ""}${r.params.hrMax ? ` · max HR ${r.params.hrMax.value}` : ""}${r.params.hrRest ? ` · resting HR ${r.params.hrRest.value}` : ""}.</p>
                <ul>${ASSUMPTIONS.map(a => `<li>${esc(a)}</li>`).join("")}</ul>
            </details>`
        : `<p class="ar-empty">${esc(r.explanation[0])}</p>`}`;
}

function methodRow(m) {
    const s = checkResult.summary[m.key];
    if (!s?.n) return "";
    return `<tr><th scope="row">${esc(m.label)}</th><td>${s.n}</td><td>${s.maeMin.toFixed(1)} min <small>(${pct(s.maePct)})</small></td><td>${s.biasPct < 0 ? "−" : "+"}${pct(Math.abs(s.biasPct))} <small>${Math.abs(s.biasPct) < 0.005 ? "" : s.biasPct < 0 ? "too fast" : "too slow"}</small></td></tr>`;
}

function verdictText(c, name) {
    if (c.verdict === "not enough races") return `Southbound vs ${name}: not enough races to tell yet (${c.n} shared; needs at least 5).`;
    const diff = `${Math.abs(c.meanDiffPct * 100).toFixed(1)} points`;
    if (c.verdict === "better") return `Southbound vs ${name}: misses are ${diff} smaller on average (95% interval ${pct(c.lo)} to ${pct(c.hi)}).`;
    if (c.verdict === "worse") return `Southbound vs ${name}: misses are ${diff} bigger on average. The simpler method wins for now.`;
    return `Southbound vs ${name}: not yet distinguishable over ${c.n} races (95% interval ${pct(c.lo)} to ${pct(c.hi)}).`;
}

// Southbound (preparation shown) vs the same with the preparation trim, on the races both predicted.
function prepVerdict(c) {
    if (c.verdict === "not enough races") return `Preparation trim: not enough half and marathon races to tell whether it helps yet (${c.n}; needs at least 5). Until then it isn't taken off the time.`;
    const diff = `${Math.abs(c.meanDiffPct * 100).toFixed(1)} points`;
    if (c.verdict === "better") return `Preparation trim: leaving it out misses by ${diff} less over ${c.n} races. It stays off.`;
    if (c.verdict === "worse") return `Preparation trim: applying it misses by ${diff} less over ${c.n} races. Your races say thinner blocks do slow you down.`;
    return `Preparation trim: no clear difference over ${c.n} races (95% interval ${pct(c.lo)} to ${pct(c.hi)}).`;
}

function errCell(row, key) {
    const v = row.predictions[key];
    if (v == null) return `<td class="mc-none">—</td>`;
    const e = row.errors[key];
    return `<td><span>${esc(clock(v))}</span><small class="${Math.abs(e) <= 0.02 ? "is-good" : Math.abs(e) > 0.05 ? "is-bad" : ""}">${e < 0 ? "−" : "+"}${pct(Math.abs(e))}</small></td>`;
}

function renderCheck() {
    const el = $("modelCheckPanel");
    if (!el || !checkResult) return;
    const r = checkResult;
    const rows = showAllRows ? r.rows : r.rows.slice(0, 8);
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>Model check</h2>
            <p>Every confirmed all-out race, predicted only from what came before it. Negative = predicted too fast.</p>
        </div></div>
        ${!r.rows.length ? `<p class="ar-empty">Confirm races in Your races above and the check runs on them.</p>` : `
            <div class="mc-scroll"><table class="mc-table mc-summary">
                <thead><tr><th scope="col">Method</th><th scope="col">Races</th><th scope="col">Average miss</th><th scope="col">Bias</th></tr></thead>
                <tbody>${METHODS.map(methodRow).join("")}</tbody>
            </table></div>
            <ul class="rc-why">
                <li>${esc(verdictText(r.vsRiegel, "Riegel"))}</li>
                <li>${esc(verdictText(r.vsVdot, "VDOT"))}</li>
                ${r.vsPrep?.n ? `<li>${esc(prepVerdict(r.vsPrep))}</li>` : ""}
                ${r.coverage.n ? `<li>The 80% range held the real time in ${r.coverage.inside} of ${r.coverage.n} races (aim: about 8 in 10).</li>` : ""}
            </ul>
            <div class="mc-scroll"><table class="mc-table mc-races">
                <thead><tr><th scope="col">Race</th><th scope="col">Actual</th><th scope="col">Southbound</th><th scope="col">Riegel</th><th scope="col">VDOT</th></tr></thead>
                <tbody>${rows.map(row => `<tr>
                    <th scope="row">${esc(dayYear(row.date))}<small>${esc(distanceLabel(row.meters))}</small></th>
                    <td>${esc(clock(row.actual))}</td>
                    ${errCell(row, "southbound")}${errCell(row, "riegel")}${errCell(row, "vdot")}
                </tr>`).join("")}</tbody>
            </table></div>
            ${r.rows.length > 8 ? `<button type="button" class="sb-btn sb-btn-tertiary ar-more" data-all-rows>${showAllRows ? "Show fewer" : `Show all ${r.rows.length} races`}</button>` : ""}
            <div class="mc-actions"><button type="button" class="sb-btn sb-btn-secondary" data-copy-check>Copy results</button><small>Times and errors only, no names or routes. Paste them to the developer to review.</small></div>`}
        ${r.skipped.length ? `<p class="ar-empty">${r.skipped.length} ${r.skipped.length === 1 ? "race has" : "races have"} nothing before ${r.skipped.length === 1 ? "it" : "them"} to predict from.</p>` : ""}`;
}

async function refresh() {
    inputs = await loadModelInputs();
    race = planRace(inputs.planDays);
    renderCapability();
    // The check predicts every race several ways; let the page draw first.
    setTimeout(() => {
        checkResult = backtest(inputs.sessions, { health: inputs.health, fitness: inputs.fitness });
        renderCheck();
    }, 0);
}

function bind() {
    $("capabilityPanel").addEventListener("click", event => {
        const chip = event.target.closest("[data-dist]");
        if (chip) { chosen = chip.dataset.dist; renderCapability(); return; }
        if (event.target.closest("[data-lock]") && race) {
            const target = DISTANCES.find(d => d.key === chosen);
            const r = predictRace({ meters: target.meters, asOf: inputs.today, sessions: inputs.sessions, health: inputs.health, fitness: inputs.fitness });
            saveLock({
                id: `race-${race.date}-${Math.round(race.meters)}`,
                target: { name: race.name, date: race.date, meters: race.meters },
                lockedAt: Date.now(), asOf: r.asOf, modelVersion: r.version,
                sec: Math.round(r.sec), lo: Math.round(r.lo), hi: Math.round(r.hi), confidence: r.confidence,
                lenses: r.lenses.map(l => ({ key: l.key, sec: Math.round(l.sec) })), grade: r.quality.grade
            });
            renderCapability();
            toast(`Locked: ${clock(r.sec)} for ${race.name}`);
        }
    });
    $("modelCheckPanel")?.addEventListener("click", async event => {
        if (event.target.closest("[data-all-rows]")) { showAllRows = !showAllRows; renderCheck(); return; }
        if (event.target.closest("[data-copy-check]") && checkResult) {
            try {
                await navigator.clipboard.writeText(JSON.stringify(exportable(checkResult), null, 1));
                toast("Copied the Model check results");
            } catch {
                toast("Couldn't copy here. Try again on another browser.", { type: "error" });
            }
        }
    });
    for (const e of ["sb:athlete-answers", "sb:strava-updated", "eddieos:coros-history-updated"]) window.addEventListener(e, refresh);
}

export function mountRaceCapability() {
    if (!$("capabilityPanel")) return;
    bind();
    refresh().catch(error => console.error("Southbound: race capability couldn't load.", error));
}

mountRaceCapability();
