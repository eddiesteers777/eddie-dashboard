/* ==========================================
   Southbound — the Planning Context (pure)

   Weekly planning P2 (docs/WEEKLY_PLANNING_AUDIT.md, section 8). The
   part of the Athlete State (js/athleteState.js) that matters for
   planning one week, in the same words the Athlete State panel uses
   (valueText, js/athleteStateView.js), each fact with what kind of fact
   it is, how sure Southbound is and what it stands on. Southbound owns
   the facts; a chatbot (or later the AI planner) only interprets them.

   planWindow(today, mode)       the week being planned: "next7" (tomorrow
                                 and 6 more) or "nextWeek" (next Mon–Sun);
                                 defaultMode: next week from Friday on
   candidatePriorities(state)    what Southbound thinks matters, most
                                 important first, each with its evidence.
                                 Rules that only READ the state: pain or
                                 sickness, race week / taper, the weekly
                                 decision, a thin block before a half or
                                 marathon, race-specific work by distance,
                                 base building, how runs are landing, gaps.
                                 Never a phase of its own: the plan's
                                 phase is quoted as the plan has it.
   planningContext(state, { from, to, notes, planLines })
                                 -> { version, asOf, window, athlete, sections:
                                      [{ key, title, facts: [{ name, value, kind,
                                      confidence, basis }] }], priorities, unknowns,
                                      plan, notes }
   factLines(context)            the facts as plain lines (the prompt)
   Unit-tested in tests/planningContext.test.mjs.
========================================== */

import { signalList, KIND_WORDS } from "./athleteState.js";
import { valueText, SIGNAL_LABELS } from "./athleteStateView.js";
import { addDays } from "./athleteLedger.js";

export const CONTEXT_VERSION = "0.1.0";

// The engines speak to the athlete ("your last year"); about a client, the coach reads "their".
const their = text => String(text ?? "").replace(/\bYour\b/g, "Their").replace(/\byour\b/g, "their").replace(/\byou've\b/g, "they've").replace(/\byou\b/g, "them");
const dow = date => { const [y, m, d] = date.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
const short = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// ---------- the week ----------

/** "nextWeek" from Friday to Sunday (planning the coming Monday–Sunday), else "next7". */
export const defaultMode = today => ([5, 6, 0].includes(dow(today)) ? "nextWeek" : "next7");

/** -> { mode, from, to, days, label } */
export function planWindow(today, mode = defaultMode(today)) {
    if (mode === "nextWeek") {
        const toMonday = (8 - dow(today)) % 7 || 7;
        const from = addDays(today, toMonday);
        return { mode, from, to: addDays(from, 6), days: 7, label: `Next week · ${short(from)} – ${short(addDays(from, 6))}` };
    }
    const from = addDays(today, 1);
    return { mode: "next7", from, to: addDays(from, 6), days: 7, label: `Next 7 days · ${short(from)} – ${short(addDays(from, 6))}` };
}

// ---------- what matters ----------

const KIND_OF_RACE = meters => (!meters ? null : meters >= 40000 ? "marathon" : meters >= 20000 ? "half" : "short");
const SPECIFIC = {
    marathon: "Race-specific: marathon-pace work inside the long runs, and the long run itself",
    half: "Race-specific: threshold and half-marathon-pace work, with a solid long run",
    short: "Race-specific: VO₂max and race-pace work, with full recovery between"
};

/**
 * Southbound's reading of what matters this week, most important first:
 * [{ key, title, text, evidence: [..] }] (at most 4). The coach decides.
 */
export function candidatePriorities(state) {
    const v = path => path.split(".").reduce((o, k) => o?.[k], state)?.value ?? null;
    const who = state.identity?.who === "self" ? "yourself" : (state.identity?.firstName || "the athlete");
    const race = v("goals.targetRace");
    const days = v("goals.daysToRace");
    const kind = KIND_OF_RACE(race?.meters);
    const phase = v("goals.phase");
    const decision = v("decision.weekly");
    const pain = v("constraints.painOrSick") || [];
    const prep = v("preparation.block");
    const reading = v("response.reading");
    const out = [];
    const add = (rank, key, title, text, evidence = []) => out.push({ rank, key, title, text, evidence: evidence.filter(Boolean) });
    const raceLine = race ? `${race.name}${race.distance ? ` (${race.distance})` : ""}${days != null ? ` in ${days} days` : ""}` : "";
    const phaseLine = phase ? `Plan: ${phase.phase}${phase.week ? `, week ${phase.week}${phase.totalWeeks ? ` of ${phase.totalWeeks}` : ""}` : ""}` : "";

    if (pain.length || decision?.level === "checkin") {
        const dates = pain.map(p => `${p.kind === "sick" ? "sick" : "pain"} ${p.date}`).join(", ");
        add(100, "checkin", "Check in first", `${dates ? `Reported: ${dates}. ` : ""}Talk with ${who === "yourself" ? "yourself honestly" : who} before anything hard; plan the week around what you hear. Southbound doesn't diagnose.`, [decision?.reason]);
    }
    if (race && days != null && days >= 0 && days <= 14) {
        add(90, "taper", days <= 7 ? "Race week: arrive fresh" : "Taper: keep some intensity, cut the volume",
            "Volume comes down and the race-pace touches stay short and sharp; nothing new.", [raceLine, phaseLine]);
    }
    if (decision && (decision.level === "ease" || decision.level === "recover")) {
        add(80, "absorb", decision.level === "recover" ? "Recover: a few easy days first" : "Absorb the training: ease the week",
            decision.summary, [`Weekly decision: ${decision.label} (${decision.votes ?? 0} votes)`]);
    } else if (decision?.level === "absorb") {
        add(50, "trim", "A small trim", decision.summary, [`Weekly decision: ${decision.label}`]);
    }
    if (prep && (kind === "marathon" || kind === "half") && days != null && days > 14 && days <= 84 && prep.readinessPct < 90) {
        add(70, "durability", kind === "marathon" ? "Marathon durability" : "Half-marathon durability",
            `This 12-week block is ${prep.readinessPct}% of ${prep.basis === "yours" ? "the usual block" : "a typical plan"}: ${prep.weeklyMiles.value}/${prep.weeklyMiles.target} mi a week, ${prep.longRuns.value}/${prep.longRuns.target} runs of ${prep.longRuns.over}+ mi, longest ${prep.longest.value}/${prep.longest.target} mi.`,
            [raceLine, prep.basis === "yours" ? `Against ${prep.blocks} earlier blocks` : "Against a typical plan (few earlier races to compare)"]);
    }
    if (kind && days != null && days > 14 && days <= 84) {
        add(60, "specific", SPECIFIC[kind], `${raceLine}. The closer the race, the more the key sessions look like it.`, [raceLine, phaseLine]);
    }
    if (!race || days == null || days > 84) {
        add(40, "base", "Build the base: consistency and easy volume", race ? `${raceLine}: far enough out to build before getting specific.` : "No race in the plan: steady, repeatable weeks.", [phaseLine]);
    }
    if (reading && ["fatigue", "deep", "hrOnly", "costlier"].includes(reading.key) && !out.some(o => o.key === "absorb")) {
        add(65, "response", "Watch how the runs are landing", reading.text, [`Reading: ${reading.title}`]);
    } else if (reading?.key === "adaptation") {
        add(45, "progress", "Keep progressing: the training is landing", reading.text, [`Reading: ${reading.title}`]);
    }
    if (v("response.effort") == null || v("response.efficiency") == null) {
        add(10, "data", "Fill the gaps", "Rate runs after them (How hard was it?) and run with heart rate, so next week's reading has more to go on.", []);
    }
    return out.sort((a, b) => b.rank - a.rank).slice(0, 4).map(({ rank, ...p }) => p);
}

// ---------- the context ----------

const SECTIONS = [
    { key: "goals", title: "Goal", paths: ["goals.targetRace", "goals.goalTime", "goals.daysToRace", "goals.phase", "goals.primary", "goals.secondary"] },
    { key: "fitness", title: "Current fitness", paths: ["fitness.raceTime", "fitness.raceEvidence", "fitness.easyPace", "fitness.coros"] },
    { key: "load", title: "Training load", paths: ["load.lastWeeks", "load.weekToDate", "load.percentile", "load.level", "load.mix", "load.longRuns", "load.strain", "load.strength"] },
    { key: "response", title: "How the training is landing", paths: ["response.reading", "response.efficiency", "response.effort", "response.execution", "response.longRunDrift"] },
    { key: "recovery", title: "Recovery", paths: ["readiness.score", "readiness.classic", "readiness.mornings", "readiness.weekly", "readiness.corosRecovery"] },
    { key: "preparation", title: "Race preparation", paths: ["preparation.block", "preparation.learnedEffect", "preparation.keySessions"] },
    { key: "constraints", title: "Constraints", paths: ["constraints.painOrSick", "constraints.limits", "constraints.openRequests", "schedule.availableDays", "schedule.notes", "schedule.setup", "schedule.busyDays", "schedule.booked", "schedule.planSettings"] },
    { key: "preferences", title: "Preferences", paths: ["preferences.worked", "preferences.notWorked", "preferences.wants", "preferences.style"] },
    { key: "decision", title: "Southbound's weekly check", paths: ["decision.weekly", "decision.recentChoices"] }
];

/**
 * The context for one week of planning. Only facts with a value; what's
 * missing goes to unknowns. planLines: the plan's days in the window, one
 * line each (js/planPrompt.js dayLine), as the coach wrote them.
 */
export function planningContext(state, { from, to, notes = "", planLines = [] } = {}) {
    const self = state.identity?.who === "self";
    const byPath = new Map(signalList(state).map(x => [x.path, x.signal]));
    const sections = SECTIONS.map(sec => ({
        key: sec.key, title: sec.title,
        facts: sec.paths.map(path => {
            const s = byPath.get(path);
            if (!s || s.value == null) return null;
            const words = t => (self ? String(t) : their(t));
            return { path, name: words(SIGNAL_LABELS[path] || path), value: words(valueText(path, s.value, { self })), kind: s.kind, confidence: s.confidence, basis: s.evidence.slice(0, 2).map(words) };
        }).filter(Boolean)
    })).filter(sec => sec.facts.length);
    return {
        version: CONTEXT_VERSION, asOf: state.asOf,
        window: { from, to },
        athlete: { who: self ? "self" : "client", firstName: state.identity?.firstName || null, ageBand: state.identity?.ageBand || null },
        sections,
        priorities: candidatePriorities(state).map(p => (self ? p : { ...p, text: their(p.text), evidence: p.evidence.map(their) })),
        unknowns: (state.unknowns || []).slice(0, 6).map(u => (self ? u : { ...u, what: their(u.what), why: their(u.why) })),
        plan: { lines: planLines },
        notes: String(notes || "").trim().slice(0, 2000),
        versions: state.versions
    };
}

/** The facts as plain lines: "- Recent load in your year: higher than 84% … [Modeled, moderate confidence] (basis …)". */
export function factLines(context) {
    const out = [];
    for (const sec of context.sections) {
        out.push(`${sec.title}:`);
        for (const f of sec.facts) {
            out.push(`- ${f.name}: ${f.value} [${KIND_WORDS[f.kind] || f.kind}, ${f.confidence === "none" ? "no" : f.confidence} confidence]${f.basis.length ? ` (${f.basis.join("; ")})` : ""}`);
        }
    }
    return out;
}
