/* ==========================================
   Southbound — the Athlete State, drawn (weekly planning P1)

   A folded panel that shows the Athlete State (js/athleteState.js) the
   way planning will read it: domain by domain, each signal with its
   value, what kind of fact it is (measured, derived, modeled, predicted,
   the athlete's answer, coach-entered, profile, COROS's own), how sure
   Southbound is, what it stands on and where it came from; what's
   missing first; and Copy as JSON for checking or debugging.

   stateHtml(state)                       pure: the panel's inner HTML
   mountStateFold(details, panel, load)   works the state out the first
                                          time the fold opens (load() ->
                                          { state }), never before, so no
                                          page gets slower for it
   Used on Analytics → Data (Eddie's own) and at the bottom of the Client
   Hub's Model tab (a client's). Coach only: both pages are.
========================================== */

import { signalList, DOMAINS, KIND_WORDS, CONFIDENCE_RULES } from "./athleteState.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => (date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const wday = date => (date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
const mins = s => (s >= 60 ? `about ${Math.round(s / 60)} min` : "under a minute");
const signed = n => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

export const DOMAIN_TITLES = Object.freeze({
    goals: "Goals", fitness: "Current fitness", load: "Training load", response: "Training response",
    readiness: "Readiness and recovery", preparation: "Race preparation", schedule: "Schedule",
    constraints: "Constraints", preferences: "Preferences", plan: "Plan", decision: "Weekly decision"
});

const LABELS = {
    "goals.primary": "Main goal", "goals.targetRace": "Target race", "goals.goalTime": "Goal time", "goals.daysToRace": "Days to race",
    "goals.phase": "Phase", "goals.secondary": "Other goals",
    "fitness.raceTime": "Race capability", "fitness.raceEvidence": "Recent races", "fitness.easyPace": "Pace at usual easy heart rate", "fitness.coros": "COROS fitness",
    "load.level": "Recent load and base", "load.percentile": "Recent load in your year", "load.weekToDate": "This week so far", "load.lastWeeks": "Last 4 weeks",
    "load.mix": "Intensity mix (4 weeks)", "load.longRuns": "Long runs (8 weeks)", "load.strain": "Monotony and strain", "load.strength": "Strength", "load.corosComparison": "Against COROS's load",
    "response.reading": "Reading", "response.efficiency": "Easy-run efficiency", "response.effort": "Effort vs expected", "response.execution": "Workout execution",
    "response.qualityHr": "Heart rate on quality reps", "response.longRunDrift": "Long-run drift",
    "readiness.score": "Readiness", "readiness.classic": "Readiness (Classic)", "readiness.corosRecovery": "COROS recovery", "readiness.mornings": "Morning check-ins", "readiness.weekly": "Weekly check-in",
    "preparation.block": "This block vs usual", "preparation.learnedEffect": "Thinner-block effect", "preparation.keySessions": "Key sessions (6 weeks)",
    "schedule.availableDays": "Days they can train", "schedule.notes": "Schedule notes", "schedule.setup": "Time, place, equipment", "schedule.booked": "Booked sessions",
    "schedule.planSettings": "Plan settings", "schedule.busyDays": "Busy days (planner)",
    "constraints.limits": "Injuries / limits", "constraints.openRequests": "Open change requests", "constraints.painOrSick": "Pain or sickness reported",
    "preferences.worked": "What has worked", "preferences.notWorked": "What hasn't", "preferences.wants": "Wants from a coach", "preferences.style": "Style",
    "plan.current": "Current plan", "plan.upcoming": "Next 2 weeks", "decision.weekly": "This week's suggestion", "decision.recentChoices": "Recent choices"
};

const list = (items, fn, max = 4) => (items.length > max ? [...items.slice(0, max).map(fn), `+${items.length - max} more`] : items.map(fn)).join(" · ");

/** One signal's value in words. */
export function valueText(path, v, { self = false } = {}) {
    if (v == null) return "";
    switch (path) {
        case "goals.targetRace": return [v.name, v.distance, v.date && wday(v.date)].filter(Boolean).join(" · ");
        case "goals.goalTime": return v.text;
        case "goals.daysToRace": return `${v} days`;
        case "goals.phase": return [v.phase, v.week && `week ${v.week}${v.totalWeeks ? ` of ${v.totalWeeks}` : ""}`, v.cutback && "cutback week", v.purpose].filter(Boolean).join(" · ");
        case "fitness.raceTime": return `${v.distance} ${v.text} (${v.range})`;
        case "fitness.raceEvidence": return list(v, r => `${day(r.date)} ${r.distance} ${r.time}`);
        case "fitness.easyPace": return `${v.text} at ${v.atHr} bpm${v.change8wSec ? ` · ${Math.abs(v.change8wSec)} s/mi ${v.change8wSec > 0 ? "faster" : "slower"} than 8 weeks ago` : ""}`;
        case "fitness.coros": return [v.marathon && `marathon ${v.marathon}`, v.vo2max != null && `VO₂max ${v.vo2max}`, v.threshold && `threshold ${v.threshold}`, v.date && `(${day(v.date)})`].filter(Boolean).join(" · ");
        case "load.level": return `recent ${v.recent} · base ${v.base} · balance ${v.balance}${v.baseChange != null ? ` · base ${signed(v.baseChange)} this week` : ""}`;
        case "load.percentile": return v.words || `${v.percentile}th percentile`;
        case "load.weekToDate": return `Through ${v.dayName}: ${v.miles.now} mi, usually ${v.miles.usual} (${({ usual: "about usual", ahead: "ahead of usual", behind: "behind usual" })[v.miles.status] || "no comparison"})`;
        case "load.lastWeeks": return list(v, w => `${day(w.start)}: ${w.miles} mi, ${w.runs} runs, longest ${w.longest}`, 4);
        case "load.mix": return `${v.easy}% easy · ${v.threshold}% steady / threshold · ${v.hard}% hard`;
        case "load.longRuns": return `${v.count} · longest ${v.longest} mi`;
        case "load.strain": return `monotony ${v.monotony ?? "—"} · strain ${v.strain}${v.usual != null ? ` (usual ${v.usual})` : ""}`;
        case "load.strength": return `${v.sessions28} ${v.sessions28 === 1 ? "session" : "sessions"} in 4 weeks${v.last ? ` · last ${day(v.last)}` : ""}`;
        case "response.reading": return `${v.title}: ${v.text}`;
        case "response.efficiency": return v.verdict === "none" ? `No clear change (${signed(v.bpm)} bpm ± ${v.se}, ${v.n} runs)` : `${Math.abs(v.bpm)} bpm ${v.verdict} at the same pace (± ${v.se}, ${v.n} runs)`;
        case "response.effort": return `${v.verdict === "usual" ? "As usual" : v.verdict === "costlier" ? `${v.mean} harder than usual` : `${Math.abs(v.mean)} easier than usual`} over ${v.n} runs`;
        case "response.execution": return `${v.onTarget} of ${v.work} work reps on target${v.fast ? `, ${v.fast} fast` : ""}${v.slow ? `, ${v.slow} slow` : ""} (${v.sessions} ${v.sessions === 1 ? "session" : "sessions"})`;
        case "response.qualityHr": return `${signed(v.bpm)} bpm (${v.verdict}, ${v.n} sessions)`;
        case "response.longRunDrift": return list(v, d => `${day(d.date)} ${d.miles} mi ${signed(d.drift)}%`);
        case "readiness.score": return `${v.score} (${v.color})${v.concern ? ` · watch: ${v.concern}` : ""}`;
        case "readiness.classic": return `${v.score} (${v.color})`;
        case "readiness.corosRecovery": return `${v.percent}%${v.status ? ` · ${v.status}` : ""}`;
        case "readiness.mornings": return `${v.last7} in 7 days${v.today ? " (today's done)" : ""}`;
        case "readiness.weekly": return [`week of ${day(v.weekOf)}`, v.energy != null && `energy ${v.energy}/5`, v.recovery != null && `recovery ${v.recovery}/5`, v.motivation != null && `motivation ${v.motivation}/5`, v.pain && "pain reported"].filter(Boolean).join(" · ");
        case "preparation.block": return `${v.readinessPct}% of ${v.basis === "yours" ? `${self ? "your" : "their"} usual` : "a typical"} ${v.kind} block · ${v.weeklyMiles.value}/${v.weeklyMiles.target} mi a week · ${v.longRuns.value}/${v.longRuns.target} runs of ${v.longRuns.over}+ mi · longest ${v.longest.value}/${v.longest.target} mi`;
        case "preparation.learnedEffect": return v.applied ? `Adds ${mins(v.effectSec || 0)} (learned from ${v.learnedFrom} races)` : `Not added${v.couldCostSec ? `: a typical effect would be up to ${mins(v.couldCostSec)}` : ""}`;
        case "preparation.keySessions": return `${v.done} of ${v.of} run (quality ${v.quality.done}/${v.quality.of}, long ${v.long.done}/${v.long.of})`;
        case "schedule.setup": return [v.timeOfDay?.join(", "), v.sessionLength, v.where?.join(", "), v.equipment?.join(", ")].filter(Boolean).join(" · ");
        case "schedule.booked": return list(v, d => wday(d));
        case "schedule.planSettings": return [v.runDays?.length && `runs ${v.runDays.join(", ")}`, v.longRunDay && `long run ${v.longRunDay}`, v.qualityDays != null && `${v.qualityDays} quality`, v.strengthDays != null && `${v.strengthDays} strength`].filter(Boolean).join(" · ");
        case "schedule.busyDays": return list(v, d => `${wday(d.date)} (${d.category})`);
        case "constraints.limits": return v.none ? "None right now" : [v.text, v.areas?.length && `areas: ${v.areas.join(", ")}`, v.status].filter(Boolean).join(" · ");
        case "constraints.openRequests": return list(v, r => `${r.reason}${r.date ? ` (${day(r.date)})` : ""}`);
        case "constraints.painOrSick": return list(v, f => `${f.kind === "sick" ? "sick" : "pain"} ${day(f.date)} (${f.from})`);
        case "preferences.style": return [v.feedback && `feedback: ${v.feedback}`, v.obstacle && `obstacle: ${v.obstacle}`].filter(Boolean).join(" · ");
        case "plan.current": return [v.name, v.week && `week ${v.week}${v.totalWeeks ? ` of ${v.totalWeeks}` : ""}`, v.phase, v.version != null && `version ${v.version}`].filter(Boolean).join(" · ");
        case "plan.upcoming": return list(v, d => `${d.dayName || wday(d.date)} ${d.miles ? `${d.miles} mi ` : ""}${d.session || d.kind}`, 7);
        case "decision.weekly": return `${v.label} (${v.votes ?? 0} ${v.votes === 1 ? "vote" : "votes"}): ${v.summary}`;
        case "decision.recentChoices": return list(v, x => `${day(x.weekOf)} ${x.level}: ${x.choice}${x.reason ? ` (${x.reason})` : ""}`);
        default:
            if (Array.isArray(v)) return v.join(", ");
            if (typeof v === "object") return Object.entries(v).filter(([, x]) => x != null && x !== "").map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(" · ");
            return String(v);
    }
}

function signalHtml(path, s, self) {
    const label = LABELS[path] || path.split(".")[1];
    const has = s.value != null;
    return `<li class="as-sig${has ? "" : " is-missing"}" data-path="${esc(path)}">
        <div class="as-sig-head">
            <span class="as-label">${esc(label)}</span>
            <span class="as-kind is-${esc(s.kind)}">${esc(KIND_WORDS[s.kind] || s.kind)}</span>
            <span class="as-conf is-${esc(s.confidence)}">${esc(s.confidence === "none" ? "no value" : `${s.confidence} confidence`)}</span>
        </div>
        <p class="as-value">${has ? esc(valueText(path, s.value, { self })) : `<em>${esc(s.missing)}</em>`}</p>
        ${has && s.evidence.length ? `<ul class="as-evidence">${s.evidence.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
        ${s.source ? `<small class="as-source">${esc(s.source)}${s.window ? ` · ${esc(day(s.window.from))} – ${esc(day(s.window.to))}` : ""}</small>` : ""}
    </li>`;
}

/** The panel's inner HTML for a state. */
export function stateHtml(state) {
    const all = signalList(state);
    const id = state.identity;
    const who = id.who === "self" ? "you" : (id.firstName || "this client");
    const domains = DOMAINS.map(domain => {
        const sigs = all.filter(x => x.domain === domain);
        if (!sigs.length) return "";
        const filled = sigs.filter(x => x.signal.value != null).length;
        return `<section class="as-domain" data-domain="${domain}">
            <h3>${esc(DOMAIN_TITLES[domain])} <small>${filled} of ${sigs.length}</small></h3>
            <ul class="as-sigs">${sigs.map(x => signalHtml(x.path, x.signal, id.who === "self")).join("")}</ul>
        </section>`;
    }).join("");
    const unknowns = state.unknowns.length
        ? `<div class="as-unknowns"><p class="as-sub">What's missing</p><ul>${state.unknowns.map(u => `<li><strong>${esc(u.what)}</strong> <span>${esc(u.why)}</span></li>`).join("")}</ul></div>`
        : `<p class="as-note">Nothing important is missing.</p>`;
    return `
        <p class="as-intro">Everything Southbound knows about ${esc(who)} as of ${esc(day(state.asOf))}, the way weekly planning will read it. Each line says what kind of fact it is, how sure Southbound is, and what it stands on. ${all.filter(x => x.signal.value != null).length} of ${all.length} filled.</p>
        <div class="as-actions"><button type="button" class="sb-btn sb-btn-secondary" data-as="copy">Copy as JSON</button></div>
        ${unknowns}
        <div class="as-domains">${domains}</div>
        <details class="as-rules"><summary>How confidence is decided</summary><ul>${CONFIDENCE_RULES.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
            <p>Engine versions: ${esc(Object.entries(state.versions).map(([k, v]) => `${k} ${v}`).join(" · "))}</p></details>`;
}

/**
 * Wires a <details> fold: the first time it opens, `load()` -> { state } is
 * called and drawn into `panel`. Returns { refresh(load?) } for a page that
 * redraws (the Model tab).
 */
export function mountStateFold(details, panel, load) {
    if (!details || !panel) return null;
    let state = null;
    let loader = load;
    let busy = false;
    async function draw() {
        if (busy) return;
        busy = true;
        panel.innerHTML = `<p class="sb-wait"></p>`;
        try {
            ({ state } = await loader());
            panel.innerHTML = stateHtml(state);
        } catch (error) {
            console.error("Southbound: the Athlete State couldn't be worked out.", error);
            panel.innerHTML = `<p class="as-note">The Athlete State couldn't be worked out on this data. Try reloading the page.</p>`;
        } finally {
            busy = false;
        }
    }
    details.addEventListener("toggle", () => { if (details.open && !state) draw(); });
    panel.addEventListener("click", async event => {
        if (!event.target.closest('[data-as="copy"]') || !state) return;
        const { toast } = await import("./ui.js");
        try {
            await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
            toast("Athlete State copied as JSON");
        } catch {
            toast("Couldn't copy. Your browser didn't allow it.", { type: "error" });
        }
    });
    if (details.open) draw();
    return {
        refresh(next) {
            if (next) loader = next;
            state = null;
            if (details.open) draw();
        }
    };
}
