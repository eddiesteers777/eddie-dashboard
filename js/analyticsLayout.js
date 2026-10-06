/* ==========================================
   Southbound — Analytics layout (Phase C of docs/ATHLETE_MODEL_AUDIT.md)

   The page is eight sections, one question each (analytics.html):
   0 Summary, 1 Capability, 2 Training, 3 Response, 4 Recovery,
   5 Preparation, 6 Model check (folded), 7 Data. This module draws the
   parts that belong to the page rather than to one model:
     - the race countdown and the summary strip (js/analyticsSummary.js),
       from the "facts" the cards announce with sb:analytics-facts
       (capability from js/raceCapabilityCard.js, response from
       js/loadCard.js) plus the data coverage worked out here
     - Preparation: the plan's race, this 12-week block against the
       athlete's usual (durability in js/raceCapability.js), what was
       learned about thin blocks, and the key sessions done
     - Data coverage: what the numbers above stand on
     - Model check's fold, remembered on this device (sb-analytics-check-open)
========================================== */

import { summaryLines, dataCoverage, effortThisMonth, kindChip } from "./analyticsSummary.js";
import { loadModelInputs, planRace, loadLaps } from "./athleteData.js";
import { durability, clock } from "./raceCapability.js";
import { WEEKS, getCurrentWeek, getTrainingPhase } from "./marathonData.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const daysUntil = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 864e5);
const CHECK_KEY = "sb-analytics-check-open";
const MARATHON = 42195;

const facts = {};
let inputs = null;

// ---------- 0. countdown + summary ----------

function renderCountdown() {
    const el = $("anCountdown");
    if (!el) return;
    const race = inputs ? planRace(inputs.planDays) : null;
    let text = "";
    try {
        const phase = getTrainingPhase();
        const until = race ? daysUntil(inputs.today, race.date) : null;
        text = race && until >= 0
            ? `${race.name} · ${day(race.date)} · ${until === 0 ? "today" : `in ${until} ${until === 1 ? "day" : "days"}`} · week ${getCurrentWeek()} of ${WEEKS.length}${phase ? ` · ${phase}` : ""}`
            : "";
    } catch { text = ""; }
    el.textContent = text;
    el.hidden = !text;
}

function renderSummary() {
    const el = $("summaryLines");
    if (!el || !inputs) return;
    const lines = summaryLines({ ...facts, today: inputs.today, race: planRace(inputs.planDays) });
    el.innerHTML = lines.length
        ? lines.map(l => `<li class="an-line is-${esc(l.tone)}"><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join("")
        : `<li class="an-line is-quiet">Nothing stands out: the numbers below look the way they usually do for you.</li>`;
}

// ---------- 5. preparation ----------

function renderPreparation() {
    const el = $("preparationPanel");
    if (!el || !inputs) return;
    const race = planRace(inputs.planDays);
    const head = `<div class="panel-header"><div><h2>Your next race ${kindChip("calculated")}</h2><p>This 12-week block against your own usual block before that kind of race, what your races say a thinner block costs you, and the key sessions done.</p></div></div>`;
    if (!race) { el.innerHTML = `${head}<p class="ar-empty">No race in your plan yet. Add one on the Marathon page and this fills in.</p>`; return; }
    const cap = facts.capability && Math.abs(facts.capability.meters - race.meters) < 1 ? facts.capability : null;
    const predicted = cap?.sec || race.goalSec || (race.meters >= 40000 ? 3.5 * 3600 : 1.6 * 3600);
    const d = cap?.durability || durability(inputs.sessions, inputs.today, race.meters, predicted);
    const until = daysUntil(inputs.today, race.date);
    const title = `<p class="rc-race"><strong>${esc(race.name)}</strong> · ${esc(day(race.date))}${until > 0 ? ` · in ${until} days` : until === 0 ? " · today" : ""}${race.goalSec ? ` · goal ${esc(clock(race.goalSec))}` : ""}</p>`;
    if (!d) { el.innerHTML = `${head}${title}<p class="ar-empty">Preparation is checked for the half and the marathon.</p>`; return; }
    facts.preparation = d;
    const p = d.parts;
    const kind = d.kind === "marathon" ? "marathon" : "half";
    const bar = (v, t) => `<span class="rc-bar"><span style="width:${t > 0 ? Math.min(100, Math.round(v / t * 100)) : 100}%"></span></span>`;
    const mins = s => (s >= 60 ? `about ${Math.round(s / 60)} min` : "under a minute");
    const learned = d.applied && d.effectSec != null
        ? `Your ${d.learnedFrom} earlier ${kind}${d.learnedFrom === 1 ? "" : "s"} after thinner blocks ran slower than the model said, so the prediction adds ${mins(d.effectSec)} for this block.`
        : d.gap < 0.001 ? "Nothing missing against your usual block."
        : cap ? `Not added to the prediction: your own races haven't shown yet that a thinner block slows you${d.learnedFrom ? ` (${d.learnedFrom} earlier ${kind}${d.learnedFrom === 1 ? "" : "s"} after thinner blocks)` : ""}.${d.couldCostSec >= 60 ? ` A typical effect would be up to ${mins(d.couldCostSec)}.` : ""}`
        : "";
    let sessions = "";
    try {
        const work = facts.keyWorkouts || [];
        const done = work.filter(w => w.run);
        const q = work.filter(w => w.kind === "quality"), l = work.filter(w => w.kind === "long");
        if (work.length) sessions = `<li>Key sessions of the last 12 weeks: <strong>${done.length} of ${work.length}</strong> run (quality ${q.filter(w => w.run).length} of ${q.length}, long ${l.filter(w => w.run).length} of ${l.length}).</li>`;
    } catch { sessions = ""; }
    el.innerHTML = `${head}${title}
        <div class="rc-dur">
            <p class="rc-sub-h">${kind === "marathon" ? "Marathon" : "Half"}-specific training · last 12 weeks · ${Math.round(d.readiness * 100)}% of ${d.basis === "yours" ? `your usual ${kind} block` : "a typical plan"}</p>
            <ul>
                <li><span>Weekly miles</span>${bar(p.weekly.value, p.weekly.target)}<b>${p.weekly.value} / ${p.weekly.target}</b></li>
                <li><span>Runs of ${p.longRuns.over}+ mi</span>${bar(p.longRuns.value, p.longRuns.target)}<b>${p.longRuns.value} / ${p.longRuns.target}</b></li>
                <li><span>Longest run</span>${bar(p.longest.value, p.longest.target)}<b>${p.longest.value} / ${p.longest.target} mi</b></li>
            </ul>
            <small class="rc-dur-note">${d.basis === "yours" ? `Against your usual block: the median of the 12 weeks before your ${d.blocks} earlier ${kind}s.` : `Against a typical plan for this time until you have 2 earlier ${kind}s to compare with.`} ${esc(learned)}</small>
        </div>
        ${sessions ? `<ul class="rc-why">${sessions}</ul>` : ""}`;
}

// ---------- 7. data coverage ----------

function renderCoverage() {
    const el = $("coveragePanel");
    if (!el || !inputs) return;
    const c = facts.coverage;
    const head = `<div class="panel-header"><div><h2>What the numbers stand on ${kindChip("measured")}</h2><p>Your watch runs of the last ${c.days} days and the last ${c.nights} nights.</p></div></div>`;
    if (!c.runs && !c.hrv && !c.sleep) { el.innerHTML = `${head}<p class="ar-empty">Nothing yet: connect COROS or import your Strava archive below.</p>`; return; }
    el.innerHTML = `${head}
        <ul class="an-cover">${c.rows.map(r => `<li><span>${esc(r.label)}</span><span class="rc-bar"><span style="width:${r.pct}%"></span></span><b>${r.have} of ${r.of} ${esc(r.unit)}</b><small>${esc(r.why)}</small></li>`).join("")}</ul>`;
}

// ---------- 6. model check fold ----------

function bindCheck() {
    const det = $("anCheckDetails");
    if (!det) return;
    let open = false;
    try { open = localStorage.getItem(CHECK_KEY) === "1"; } catch { open = false; }
    const target = location.hash && document.querySelector(location.hash);
    if (open || (target && det.contains(target)) || location.hash === "#anCheck") det.open = true;
    det.addEventListener("toggle", () => { try { localStorage.setItem(CHECK_KEY, det.open ? "1" : "0"); } catch { /* device-only nicety */ } });
    // A link to a panel inside opens the fold first.
    document.addEventListener("click", e => {
        const a = e.target.closest('a[href^="#"]');
        const t = a && document.querySelector(a.getAttribute("href"));
        if (t && det.contains(t)) det.open = true;
    });
}

// ---------- the Athlete State fold (weekly planning P1) ----------

function bindState() {
    const det = $("athleteState");
    if (!det) return;
    if (location.hash === "#athleteState") det.open = true;
    import("./athleteStateView.js").then(({ mountStateFold }) => {
        const fold = mountStateFold(det, $("athleteStatePanel"), () => import("./athleteSources.js").then(m => m.selfState(isoToday())));
        // New answers or runs: forget the old state first, then work it out again (now if it's open).
        let timer = null;
        const again = () => { clearTimeout(timer); timer = setTimeout(() => import("./athleteSources.js").then(m => { m.forgetSelfState(); fold?.refresh(); }), 300); };
        for (const e of ["sb:athlete-answers", "sb:strava-updated", "eddieos:coros-history-updated"]) window.addEventListener(e, again);
    }).catch(error => console.error("Southbound: the Athlete State panel couldn't load.", error));
}
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// ---------- wiring ----------

function redraw() {
    renderCountdown();
    renderPreparation();
    renderSummary();
}

async function refresh() {
    inputs = await loadModelInputs();
    facts.coverage = dataCoverage({ sessions: inputs.sessions, health: inputs.health, laps: loadLaps(), today: inputs.today });
    facts.effortMonth = effortThisMonth(inputs.sessions, inputs.today);
    try {
        const { keyWorkouts } = await import("./trendsData.js");
        facts.keyWorkouts = keyWorkouts(inputs.today, { days: 84 });
    } catch { facts.keyWorkouts = []; }
    renderCoverage();
    redraw();
}

function mount() {
    if (!$("anSummary")) return;
    bindCheck();
    bindState();
    window.addEventListener("sb:analytics-facts", e => {
        const detail = { ...(e.detail || {}) };
        // The summary and Preparation follow the plan's race distance, not whichever chip is showing.
        const wanted = (inputs && planRace(inputs.planDays)?.meters) || MARATHON;
        if (detail.capability && Math.abs(detail.capability.meters - wanted) > 1) delete detail.capability;
        Object.assign(facts, detail);
        if (inputs) redraw();
    });
    for (const e of ["sb:athlete-answers", "sb:strava-updated", "eddieos:coros-history-updated"]) window.addEventListener(e, () => refresh().catch(() => {}));
    refresh().catch(error => console.error("Southbound: the Analytics summary couldn't load.", error));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
