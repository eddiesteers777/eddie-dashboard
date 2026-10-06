/* ==========================================
   Southbound — Athlete State (pure)

   Weekly planning P1 (docs/WEEKLY_PLANNING_AUDIT.md, section 7). The
   athlete at one point in time, for planning: every engine of the
   athlete model run ONCE on the same inputs, and each result wrapped
   with what kind of fact it is, how sure Southbound is, what it stands
   on and where it came from. Nothing here is a new model: the numbers
   are the engines' own, the same ones Analytics, Weekly Review, Today
   and the Client Hub's Model tab show.

   athleteCore(inputs)              the engines' raw results in one place
                                    (js/clientModel.js is built on it)
   athleteState(inputs, { core })   the state:
     { version, asOf, who, identity, goals, fitness, load, response,
       readiness, preparation, schedule, constraints, preferences,
       plan, decision, unknowns, versions }
   signalList(state)                every signal with its path, for views and tests

   Every leaf of a domain is a signal:
     { value, unit, kind, confidence, evidence, window, asOf, source, missing }
   kind        measured | derived | modeled | predicted | subjective |
               coach | athlete | vendor
   confidence  high | moderate | low | none, from each engine's own
               measure (CONFIDENCE_RULES below), never invented
   missing     when value is null: what would fill it

   What it never holds: email, phone, birth year (an age band only),
   emergency or guardian contacts, health-check answers, private coach
   notes, the words of check-ins or workout logs (pain and sickness are
   yes / no with a date), GPS, the titles of calendar events.

   inputs (js/athleteSources.js builds them for Eddie and for a client):
     who              "self" | "client"
     today, now       ISO date; ms (profile freshness; defaults to today noon)
     sessions         the ledger (js/athleteLedger.js), answers attached
     health, fitness, checkins, settings, laps   (laps: the coros-laps store; {} for clients)
     keyWork          the plan's key workouts of the last 42 days (js/trendsData.js keyWorkouts; self)
     nextDays         the plan's next 7 days not done yet, in the decision's shape
     upcoming         the plan's next 14 days, same shape
     target           race distance in meters (else the plan's race, the profile's, a marathon
                      for Eddie, a 10K for a client: what Analytics and the Model tab use)
     policy, previous the decision's dial-down numbers; last week's level
     plan             { source, name, week, totalWeeks, phase, purpose, cutback, version,
                        race: { name, date, meters, goalSec }, settings }
     profile          the client record (clientRecords) or null
     firstName        the client's first name (the hub knows it)
     weeklyCheckins, changeRequests, results (workoutResults), booked (approved session dates)
     decisions        the coach's logged choices on weekly decisions
     busyDays         [{ date, category }] (Eddie's planner-events, titles left out)
     strengthDates    dates strength sessions were done
     tier             "full" (Eddie) | "shared" | "plan-logs" | "none" (clients)
   Unit-tested in tests/athleteState.test.mjs.
========================================== */

import { sessionDoses, DOSE_VERSION } from "./sessionDose.js";
import { loadState, loadTotals, corosComparison, corosWords, recentWords, LOAD_VERSION } from "./loadState.js";
import { efficiency, effortResponse, qualityHr, executionSummary, decoupling, reading, RESPONSE_VERSION } from "./trainingResponse.js";
import { readinessV2, READINESS_V2_VERSION } from "./readinessV2.js";
import { computeReadiness } from "./readiness.js";
import { predictRace, clock, distanceLabel, RACE_MODEL_VERSION } from "./raceCapability.js";
import { weekDecision, DEFAULT_POLICY, DECISION_VERSION, LEVEL_WORDS } from "./weeklyDecision.js";
import { dataCoverage } from "./analyticsSummary.js";
import { addDays, confirmedRaces, LEDGER_VERSION } from "./athleteLedger.js";
import { realAnswer, isNoneAnswer } from "./intakeFlow.js";
import { answerFreshness, ageText } from "./profileChecks.js";
import { goalSeconds } from "./coachPlanGenerator.js";

export const STATE_VERSION = "0.1.0";
export const KINDS = Object.freeze(["measured", "derived", "modeled", "predicted", "subjective", "coach", "athlete", "vendor"]);
export const KIND_WORDS = Object.freeze({
    measured: "Measured", derived: "Derived", modeled: "Modeled", predicted: "Predicted",
    subjective: "Athlete's answer", coach: "Coach-entered", athlete: "Profile", vendor: "COROS's own"
});
export const CONFIDENCES = Object.freeze(["high", "moderate", "low", "none"]);
export const DOMAINS = Object.freeze(["goals", "fitness", "load", "response", "readiness", "preparation", "schedule", "constraints", "preferences", "plan", "decision"]);

/** How each confidence is decided (shown in the view, so nothing is hidden). */
export const CONFIDENCE_RULES = Object.freeze([
    "Race prediction: the race model's own (High = 80% range within ±2.5%, Moderate ±5%, else Low).",
    "Load: High when 70%+ of the last year's runs were scored by pace or heart rate, Moderate 40%+, else Low; none under 4 weeks of runs.",
    "Easy-run efficiency: High with 8+ easy runs with heart rate in 2 weeks, Moderate 5–7, Low 3–4 (the change itself needs 2 bpm and 2 standard errors).",
    "Effort vs expected: Moderate with 5 answered runs in 3 weeks, Low with 3–4; never High (a few answers).",
    "Readiness: never above Moderate (a rough guide until its own check beats what you already knew); Low with under 14 nights of HRV or sleep in 60 days.",
    "Weekly decision: Moderate when 4–5 of its 5 signals could be measured, Low with 2–3.",
    "Preparation: High against 4+ of your own earlier blocks, Moderate with 2–3, Low against a typical plan.",
    "Profile answers: High when confirmed within their shelf life, Low when they may be out of date.",
    "What the coach wrote (plan, choices) and what was counted (miles, runs) are High; COROS's own numbers are Low until COROS has a record on you."
]);

const MILE = 1609.344;
const RACE_TARGETS = { "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };
const r1 = n => Math.round(n * 10) / 10;
const pct = (n, d) => (d ? Math.round(n / d * 100) : 0);
const clockSec = v => {
    if (Number.isFinite(v)) return v;
    const p = String(v || "").split(":").map(Number);
    if (p.length < 2 || p.some(x => !Number.isFinite(x))) return null;
    return p.reduce((t, x) => t * 60 + x, 0);
};
const paceText = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}/mi`;
const DAY_NAMES = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };

/** The race distance the client is training for (their profile), else null. */
export function targetMeters(record) {
    if (RACE_TARGETS[record?.eventType]) return RACE_TARGETS[record.eventType];
    const t = String(record?.targetEvent || "").toLowerCase();
    if (/half/.test(t)) return RACE_TARGETS.half;
    if (/marathon/.test(t)) return RACE_TARGETS.marathon;
    if (/10\s?k/.test(t)) return RACE_TARGETS["10k"];
    if (/5\s?k/.test(t)) return RACE_TARGETS["5k"];
    return null;
}

/** The distance the race model is asked about: the same one Analytics (Eddie) and the Model tab (a client) open on. */
export function targetOf(inp) {
    return inp.target || inp.plan?.race?.meters || targetMeters(inp.profile) || (inp.who === "self" ? RACE_TARGETS.marathon : RACE_TARGETS["10k"]);
}

// ---------- the engines, once ----------

/**
 * Every engine on the same inputs. -> { today, meters, dose, load, eff, effort, quality, data,
 * execution, drift, reading, readinessV2, readinessClassic, race, decision }
 * `data` is what readiness v2 and the weekly decision read.
 */
export function athleteCore(inp) {
    const { today, sessions = [], health = {}, fitness = {}, checkins = {}, settings = {}, laps = {} } = inp;
    const dose = sessionDoses(sessions, today, { laps, health, fitness });
    const load = loadState(dose.doses, today);
    const lapsById = Object.fromEntries(Object.entries(laps || {}).map(([label, v]) => [`c:${label}`, v?.laps || []]));
    const eff = efficiency(sessions, dose.doses, today);
    const effort = effortResponse(sessions, dose.doses, today);
    const quality = qualityHr(dose.doses, lapsById, dose.anchors, today);
    const data = {
        health, fitness, checkins, settings,
        response: { effRuns: eff.runs, effortRows: effort.rows },
        loadSeries: load.series, quality: quality.sessions, doses: dose.doses
    };
    const meters = targetOf(inp);
    return {
        today, meters, dose, load, eff, effort, quality, data,
        execution: executionSummary(inp.keyWork || [], laps, today),
        drift: decoupling(dose.doses, lapsById, today),
        reading: reading(eff.signal, effort.signal),
        readinessV2: Object.keys(health).length ? readinessV2(today, data) : null,
        readinessClassic: inp.who === "self" ? computeReadiness(today, { health, fitness, checkins, settings }) : null,
        race: sessions.length ? predictRace({ meters, asOf: today, sessions, health, fitness }) : null,
        decision: weekDecision(today, data, inp.nextDays || [], { policy: inp.policy || DEFAULT_POLICY, previous: inp.previous || null })
    };
}

// ---------- the signal envelope ----------

const isEmpty = v => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

function maker(asOf) {
    return (kind, value, { unit = null, confidence = "low", evidence = [], window = null, source = "", missing = null } = {}) => {
        const none = isEmpty(value);
        return {
            value: none ? null : value,
            unit, kind,
            confidence: none ? "none" : confidence,
            evidence: none ? [] : evidence.filter(Boolean).map(String).slice(0, 3),
            window, asOf, source,
            missing: none ? (missing || "Not available yet") : null
        };
    };
}

// ---------- small readers ----------

function ageBand(birthYear, asOf) {
    const y = Number(birthYear);
    if (!(y > 1900)) return null;
    const age = Number(asOf.slice(0, 4)) - y;
    if (age < 18) return "under 18";
    if (age < 30) return "18–29";
    return `${Math.floor(age / 10) * 10}s`;
}

function firstNameOf(inp) {
    if (inp.who !== "client") return null;
    const p = inp.profile || {};
    const name = inp.firstName || (p.whoTrains === "child" ? p.athleteName : p.preferredName) || p.athleteName || "";
    return String(name).trim().split(/\s+/)[0] || null;
}

/** The race the plan (or the profile) is aiming at: { value, kind, source } */
function raceTarget(inp) {
    const r = inp.plan?.race;
    if (r?.date) return { value: { name: r.name || "Race day", date: r.date, meters: r.meters || null, distance: r.meters ? distanceLabel(r.meters) : "" }, kind: "coach", source: inp.who === "self" ? "the marathon plan's race day" : "the coach plan's race day", goalSec: r.goalSec || null };
    const p = inp.profile || {};
    const name = realAnswer(p.targetEvent);
    if (name || /^\d{4}-\d{2}-\d{2}$/.test(p.targetDate || "")) {
        const meters = targetMeters(p);
        return { value: { name: name || "Their event", date: p.targetDate || null, meters, distance: meters ? distanceLabel(meters) : "" }, kind: "athlete", source: "clientRecords.targetEvent / targetDate", goalSec: null };
    }
    return { value: null, kind: inp.who === "self" ? "coach" : "athlete", source: "", goalSec: null };
}

function freshnessOf(inp) {
    if (!inp.profile) return {};
    const now = inp.now || Date.parse(`${inp.today}T12:00:00`);
    return Object.fromEntries(answerFreshness(inp.profile, now, inp.today).map(f => [f.key, f]));
}
function freshConf(f) {
    if (!f || f.missing) return "moderate";
    return f.stale ? "low" : "high";
}
function freshLine(f) {
    if (!f || f.missing) return "";
    if (f.reason === "the date has passed") return "The date has passed";
    return Number.isFinite(f.days) ? `Confirmed ${ageText(f.days)}${f.stale ? " (may be out of date)" : ""}` : "";
}

const lensWords = lenses => (lenses || []).map(l => `${l.key === "coros" ? "COROS" : l.label}: ${clock(l.sec)}`).join(" · ");

// ---------- the state ----------

/**
 * inputs -> the Athlete State (see the header). `core` lets a caller that
 * already ran athleteCore() reuse it.
 */
export function athleteState(inp, { core = null } = {}) {
    const c = core || athleteCore(inp);
    const asOf = inp.today;
    const S = maker(asOf);
    const self = inp.who === "self";
    const sessions = inp.sessions || [];
    const health = inp.health || {};
    const fitness = inp.fitness || {};
    const checkins = inp.checkins || {};
    const profile = inp.profile || null;
    const fresh = freshnessOf(inp);
    const win = days => ({ from: addDays(asOf, -(days - 1)), to: asOf });
    const yearAgo = addDays(asOf, -365);

    // ----- identity -----
    const nights60 = Array.from({ length: 60 }, (_, i) => addDays(asOf, -i)).filter(d => health[d]?.hrv?.avg != null || health[d]?.sleep?.asleepMin != null).length;
    const identity = {
        who: self ? "self" : "client",
        firstName: firstNameOf(inp),
        ageBand: profile ? ageBand(profile.birthYear, asOf) : null,
        tier: inp.tier || (self ? (sessions.length ? "full" : "none") : sessions.length ? "plan-logs" : "none"),
        counts: {
            runs: sessions.length,
            runs28: sessions.filter(s => s.date > addDays(asOf, -28) && s.date <= asOf).length,
            answered28: sessions.filter(s => s.date > addDays(asOf, -28) && s.date <= asOf && s.rpeAnswered).length,
            nights60,
            mornings60: Object.keys(checkins).filter(d => d > addDays(asOf, -60) && d <= asOf).length
        }
    };

    // ----- goals -----
    const target = raceTarget(inp);
    const raceDate = target.value?.date || null;
    const daysToRace = raceDate ? Math.round((Date.parse(`${raceDate}T12:00:00`) - Date.parse(`${asOf}T12:00:00`)) / 864e5) : null;
    const settings = inp.plan?.settings || null;
    const settingsGoal = settings?.goalTime ? goalSeconds(settings.goalTime, settings.raceType) : 0;
    const goalSec = target.goalSec || settingsGoal || null;
    const plan = inp.plan || null;
    const goals = {
        primary: S("athlete", profile ? realAnswer(profile.primaryGoal) || null : null, {
            confidence: freshConf(fresh.primaryGoal), evidence: [freshLine(fresh.primaryGoal)], source: "clientRecords.primaryGoal",
            missing: self ? "No written goal for you: your race and goal time come from the plan's race day" : "Not answered in their profile yet"
        }),
        targetRace: S(target.kind, target.value, {
            confidence: target.kind === "athlete" ? freshConf(fresh.targetEvent) : "high",
            evidence: [target.source, target.kind === "athlete" ? freshLine(fresh.targetEvent) : ""], source: target.source,
            missing: self ? "No race day in your plan" : "No race in their plan or profile"
        }),
        goalTime: S("coach", goalSec ? { sec: goalSec, text: clock(goalSec) } : null, {
            confidence: "high",
            evidence: [target.goalSec ? "From the race day's title (\"Goal h:mm:ss\")" : settingsGoal ? "From the plan's Generate settings" : ""],
            source: target.goalSec ? "plan race day" : "plan.generator.settings.goalTime",
            missing: self ? "No goal time on the plan's race day" : "No goal time in the plan's settings"
        }),
        daysToRace: S("derived", daysToRace != null && daysToRace >= 0 ? daysToRace : null, {
            unit: "days", confidence: "high", evidence: [raceDate ? `Race day ${raceDate}` : ""], missing: "No race date ahead"
        }),
        phase: S("coach", plan?.phase ? { phase: plan.phase, week: plan.week || null, totalWeeks: plan.totalWeeks || null, purpose: plan.purpose || "", cutback: Boolean(plan.cutback) } : null, {
            confidence: "high", evidence: ["The plan's own phase for this week (never worked out by Southbound)"], source: plan?.source || "",
            missing: plan ? "The plan has no phase for this week" : "No plan"
        }),
        secondary: S("athlete", profile ? realAnswer(profile.secondaryGoals) || null : null, {
            confidence: "moderate", source: "clientRecords.secondaryGoals", missing: self ? "Not recorded for you" : "Not answered"
        })
    };

    // ----- fitness -----
    const r = c.race;
    const races = confirmedRaces(sessions).filter(x => x.session.date > yearAgo && x.session.date <= asOf && x.race.allOut !== false);
    const fitDays = Object.keys(fitness).filter(d => d <= asOf).sort();
    const fitLatest = key => { const d = fitDays.filter(x => fitness[x]?.[key] != null && fitness[x][key] !== "").at(-1); return d ? { date: d, value: fitness[d][key] } : null; };
    const corosMarathon = fitLatest("marathon"), corosVo2 = fitLatest("vo2"), corosThreshold = fitLatest("threshold");
    const corosLens = r?.lenses?.find(l => l.key === "coros");
    const weeks = c.eff.weeks.filter(w => w.pace);
    const lastPace = weeks.at(-1), earlierPace = c.eff.weeks.length >= 9 ? c.eff.weeks[c.eff.weeks.length - 9] : null;
    const fitnessDomain = {
        raceTime: S("predicted", r?.sec ? {
            sec: Math.round(r.sec), lo: Math.round(r.lo), hi: Math.round(r.hi), text: clock(r.sec), range: `${clock(r.lo)}–${clock(r.hi)}`,
            distance: r.label, meters: r.meters, grade: r.quality.grade
        } : null, {
            confidence: r?.sec ? String(r.confidence || "low").toLowerCase() : "none",
            evidence: r?.sec ? [lensWords(r.lenses), `Data grade ${r.quality.grade}`, r.quality.flags[0] || ""] : [],
            window: { from: yearAgo, to: asOf }, source: `raceCapability@${RACE_MODEL_VERSION}#predictRace`,
            missing: r?.explanation?.[0] || "No runs yet"
        }),
        raceEvidence: S("measured", races.length ? races.slice(0, 3).map(x => ({ date: x.session.date, distance: distanceLabel(x.race.meters), time: clock(x.race.timeSec) })) : null, {
            confidence: "high", evidence: [`${races.length} confirmed all-out ${races.length === 1 ? "race" : "races"} in 12 months`],
            window: { from: yearAgo, to: asOf }, source: "race-results (confirmed races)",
            missing: self ? "No race confirmed in the last 12 months (Analytics → Your races)" : "No race confirmed in the last 12 months (Model tab → Is this a race?)"
        }),
        easyPace: S("modeled", lastPace && c.eff.refHr ? {
            paceSec: lastPace.pace, text: paceText(lastPace.pace), atHr: c.eff.refHr,
            change8wSec: earlierPace?.pace ? earlierPace.pace - lastPace.pace : null
        } : null, {
            confidence: (lastPace?.n || 0) >= 8 ? "moderate" : "low",
            evidence: [`Pace at your usual easy heart rate (${c.eff.refHr || "?"} bpm), from the last 4 weeks`, earlierPace?.pace ? `${Math.abs(earlierPace.pace - lastPace.pace)} s/mi ${earlierPace.pace >= lastPace.pace ? "faster" : "slower"} than 8 weeks ago` : ""],
            source: `trainingResponse@${RESPONSE_VERSION}#efficiency`, missing: "Needs easy runs with heart rate"
        }),
        coros: S("vendor", corosMarathon || corosVo2 || corosThreshold ? {
            marathon: corosMarathon?.value || null, vo2max: corosVo2?.value ?? null, threshold: corosThreshold?.value || null,
            date: [corosMarathon, corosVo2, corosThreshold].filter(Boolean).map(x => x.date).sort().at(-1)
        } : null, {
            confidence: corosLens?.note && /misses/.test(corosLens.note) ? "moderate" : "low",
            evidence: ["COROS's own estimates, used as they are", corosLens?.note && /misses/.test(corosLens.note) ? corosLens.note : "How accurate they are for you isn't known yet"],
            source: "coros-fitness-history", missing: "No COROS fitness numbers"
        })
    };

    // ----- load -----
    const t = c.load.today;
    const totals = loadTotals(c.dose.doses, asOf);
    const lastYear = c.dose.doses.filter(d => d.date > yearAgo && d.date <= asOf);
    const measuredShare = lastYear.length ? lastYear.filter(d => d.source === "pace" || d.source === "hr").length / lastYear.length : 0;
    const loadConf = !t?.percentile && t?.percentile !== 0 ? "low" : measuredShare >= 0.7 ? "high" : measuredShare >= 0.4 ? "moderate" : "low";
    const bySource = ["pace", "hr", "effort", "miles"].map(k => [k, lastYear.filter(d => d.source === k).length]).filter(([, n]) => n);
    const scoring = bySource.length ? `Last year's ${lastYear.length} runs scored by ${bySource.map(([k, n]) => `${{ pace: "pace", hr: "heart rate", effort: "effort", miles: "miles only" }[k]} ${pct(n, lastYear.length)}%`).join(", ")}` : "";
    const finished = totals.weeks.filter(w => !w.current);
    const longestIn = (start, end) => Math.max(0, ...c.dose.doses.filter(d => d.date >= start && d.date <= end).map(d => d.miles || 0));
    const last4 = c.load.weeks.slice(-4);
    const mixAll = last4.reduce((s, w) => s + w.easy + w.threshold + w.hard, 0);
    const lastFinished = finished.at(-1);
    const coros = corosComparison(c.load.series, fitness);
    const corosLine = corosWords(coros);
    const anchor = c.dose.anchors.get?.(mondayOf(asOf));
    const strength28 = [...new Set((inp.strengthDates || []).filter(d => d > addDays(asOf, -28) && d <= asOf))];
    const load = {
        level: S("modeled", t ? { recent: t.recent, base: t.base, balance: t.balance, baseChange: t.baseChange } : null, {
            unit: "points", confidence: t ? loadConf : "none",
            evidence: ["Recent load (7-day) and training base (42-day); 1 hour at your 1-hour race pace = 100 points", scoring,
                anchor?.v60 ? `1-hour pace ${paceText(MILE / anchor.v60)} from ${({ race: "a recent race", training: "recent training efforts", coros: "COROS's threshold pace", older: "your last known fitness" })[anchor.v60Source] || "your runs"}` : "No 1-hour pace yet: runs are scored by heart rate or effort"],
            source: `loadState@${LOAD_VERSION} · sessionDose@${DOSE_VERSION}`, missing: "No runs yet"
        }),
        percentile: S("modeled", t && t.percentile != null ? { percentile: t.percentile, words: recentWords(t.percentile), yearLow: t.yearLow, yearHigh: t.yearHigh } : null, {
            confidence: loadConf, evidence: [`Where today's recent load sits among ${t?.yearDays || 0} days of your last 12 months`, "Observational: not a safe or unsafe range"],
            window: { from: yearAgo, to: asOf }, source: `loadState@${LOAD_VERSION}`, missing: "Needs 4 weeks of runs"
        }),
        weekToDate: S("derived", totals.toDate ? {
            through: totals.toDate.through, dayName: totals.toDate.dayName,
            miles: totals.toDate.miles, load: totals.toDate.load
        } : null, {
            confidence: "high", evidence: [totals.toDate ? `Against the median of ${totals.toDate.n} earlier weeks through the same weekday` : ""],
            source: `loadState@${LOAD_VERSION}#weekToDate`, missing: "Nothing done yet this week, or fewer than 4 earlier weeks with runs"
        }),
        lastWeeks: S("derived", finished.slice(-4).filter(w => w.runs).length ? finished.slice(-4).map(w => ({
            start: w.start, runs: w.runs, miles: w.miles, minutes: w.minutes, load: w.load, longest: r1(longestIn(w.start, w.end)),
            rated: w.rated, monotony: w.monotony, strain: w.strain
        })) : null, {
            confidence: "high", evidence: ["Monday–Sunday weeks; every run counted once (COROS wins over Strava)"],
            window: { from: finished.slice(-4)[0]?.start || asOf, to: lastFinished?.end || asOf }, source: `loadState@${LOAD_VERSION}#loadTotals`,
            missing: "No finished weeks with runs"
        }),
        mix: S("modeled", mixAll > 0 ? {
            easy: pct(last4.reduce((s, w) => s + w.easy, 0), mixAll),
            threshold: pct(last4.reduce((s, w) => s + w.threshold, 0), mixAll),
            hard: pct(last4.reduce((s, w) => s + w.hard, 0), mixAll)
        } : null, {
            unit: "% of load", confidence: loadConf,
            evidence: ["Split by pace against your 1-hour pace (lap by lap where laps are saved), else heart rate, else effort"],
            window: win(28), source: `sessionDose@${DOSE_VERSION}#domains`, missing: "No runs in the last 4 weeks"
        }),
        longRuns: S("derived", c.load.longRuns.count ? c.load.longRuns : null, {
            confidence: "high", evidence: ["Runs of 10+ mi or 90+ min in the last 8 weeks"], window: win(56),
            source: `loadState@${LOAD_VERSION}#longRuns`, missing: "No long run in the last 8 weeks"
        }),
        strain: S("derived", lastFinished?.strain != null ? { week: lastFinished.start, monotony: lastFinished.monotony, strain: lastFinished.strain, usual: totals.strainUsual } : null, {
            confidence: totals.strainUsual != null ? "high" : "moderate", evidence: ["Foster's monotony and strain for the last full week", totals.strainUsual != null ? `Usual strain ${totals.strainUsual} (median of earlier weeks)` : ""],
            source: `loadState@${LOAD_VERSION}#weeklyTotals`, missing: "No full week of runs yet"
        }),
        strength: S("measured", inp.strengthDates ? { sessions28: strength28.length, last: strength28.sort().at(-1) || null } : null, {
            confidence: "high", evidence: ["Strength sessions done in the last 4 weeks", "Shown beside the running load, not counted in it"],
            window: win(28), source: self ? "strength-history" : "workoutResults (strength)", missing: "No strength log"
        }),
        corosComparison: S("derived", corosLine ? corosLine : null, {
            confidence: "moderate", evidence: ["Week-to-week changes compared (Spearman), not the levels"],
            source: `loadState@${LOAD_VERSION}#corosComparison`, missing: "Not enough COROS load days to compare"
        })
    };

    // ----- response -----
    const es = c.eff.signal, fs = c.effort.signal;
    const effConf = es.verdict === "few" ? "none" : es.n >= 8 ? "high" : es.n >= 5 ? "moderate" : "low";
    const effortConf = fs.verdict === "few" ? "none" : fs.n >= 5 ? "moderate" : "low";
    const rank = ["none", "low", "moderate", "high"];
    const readingConf = c.reading.key === "partial" ? "none" : c.reading.note ? "low" : rank[Math.min(rank.indexOf(effConf), rank.indexOf(effortConf))];
    const ex = c.execution;
    const response = {
        reading: S("modeled", c.reading.key === "partial" ? null : { key: c.reading.key, title: c.reading.title, text: c.reading.text, note: c.reading.note || "" }, {
            confidence: readingConf,
            evidence: [es.verdict !== "few" ? `Easy-run heart rate: ${es.verdict === "none" ? "no clear change" : `${Math.abs(es.bpm)} bpm ${es.verdict}`}` : "", fs.verdict !== "few" ? `Effort: ${fs.verdict === "usual" ? "as usual" : fs.verdict === "costlier" ? `${fs.mean} harder than usual` : `${Math.abs(fs.mean)} easier than usual`}` : ""],
            window: win(21), source: `trainingResponse@${RESPONSE_VERSION}#reading`, missing: c.reading.text || "Needs runs with heart rate and effort answers"
        }),
        efficiency: S("modeled", es.verdict === "few" ? null : { verdict: es.verdict, bpm: es.bpm, se: es.se, paceSec: es.paceSec, n: es.n, refHr: c.eff.refHr }, {
            unit: "bpm", confidence: effConf,
            evidence: [`${es.n || 0} easy runs with heart rate in the last 14 days`, es.verdict !== "few" ? `${es.bpm > 0 ? "+" : ""}${es.bpm} bpm (± ${es.se}) at the same pace vs the 8 weeks before` : "", c.eff.summer && es.verdict === "higher" ? "Summer: heat alone raises heart rate" : ""],
            window: win(14), source: `trainingResponse@${RESPONSE_VERSION}#efficiencySignal`,
            missing: "Needs 3+ easy runs with heart rate in 2 weeks (and 6 in the 8 weeks before)"
        }),
        effort: S("modeled", fs.verdict === "few" ? null : {
            verdict: fs.verdict, mean: fs.mean, n: fs.n,
            lastFive: c.effort.rows.slice(-5).map(x => ({ date: x.date, class: x.cls, rpe: x.rpe, expected: x.expected, late: Boolean(x.late) }))
        }, {
            confidence: effortConf,
            evidence: [`Last ${fs.n || 0} answered runs in 3 weeks against what each kind of run usually costs you (CR-10)`, `${c.effort.answered} of ${c.effort.recentRuns} runs in 2 weeks answered`],
            window: win(21), source: `trainingResponse@${RESPONSE_VERSION}#effortSignal`, missing: "Needs an effort answer on 3+ runs in 3 weeks"
        }),
        execution: S("derived", ex.sessions ? { sessions: ex.sessions, work: ex.work, onTarget: ex.onTarget, fast: ex.fast, slow: ex.slow } : null, {
            confidence: ex.sessions >= 2 ? "high" : "moderate",
            evidence: ["Work laps against the plan's pace targets (on target = within 5 s/mi)"], window: win(42),
            source: `trainingResponse@${RESPONSE_VERSION}#executionSummary`,
            missing: self ? "No key workout of the last 6 weeks has laps saved" : "Laps aren't shared by clients"
        }),
        qualityHr: S("modeled", c.quality.signal.verdict === "few" ? null : c.quality.signal, {
            unit: "bpm", confidence: c.quality.signal.n >= 3 ? "moderate" : "low",
            evidence: ["Heart rate on quality reps against your own reps at the same speed (8 weeks before)"], window: win(28),
            source: `trainingResponse@${RESPONSE_VERSION}#qualityHr`, missing: self ? "Needs 2+ quality sessions with laps in 4 weeks" : "Laps aren't shared by clients"
        }),
        longRunDrift: S("derived", c.drift.length ? c.drift.map(d => ({ date: d.date, miles: d.miles, drift: d.drift })) : null, {
            unit: "%", confidence: "moderate", evidence: ["Second half vs first, heart rate per pace; under 5% = held steady"], window: win(56),
            source: `trainingResponse@${RESPONSE_VERSION}#decoupling`, missing: self ? "No long run of 75+ min with laps in 8 weeks" : "Laps aren't shared by clients"
        })
    };

    // ----- readiness -----
    const v2 = c.readinessV2, cl = c.readinessClassic;
    const readyConf = nights60 >= 14 ? "moderate" : "low";
    const shown = self ? (inp.settings?.version === "v2" ? "new" : "classic") : "new";
    const latestWeekly = (inp.weeklyCheckins || []).filter(x => x.weekOf && x.weekOf > addDays(asOf, -15) && x.weekOf <= asOf).sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0] || null;
    const mornings7 = Object.keys(checkins).filter(d => d > addDays(asOf, -7) && d <= asOf);
    const readiness = {
        shown,
        score: S("modeled", v2?.score != null ? {
            score: v2.score, color: v2.color,
            domains: v2.domains.map(d => ({ key: d.key, label: d.label, score: d.score, note: d.note })),
            context: v2.context.map(d => ({ key: d.key, label: d.label, score: d.score, note: d.note })),
            concern: v2.concern, positives: v2.positives
        } : null, {
            confidence: readyConf,
            evidence: [...(v2?.domains || []).map(d => `${d.label}: ${d.note}`)],
            source: `readinessV2@${READINESS_V2_VERSION}`,
            missing: v2 ? "No HRV or sleep for last night yet" : self ? "No nights of HRV or sleep yet" : "No nights of HRV or sleep shared"
        }),
        classic: self ? S("modeled", cl?.score != null ? { score: cl.score, color: cl.color, parts: (cl.parts || []).map(p => ({ key: p.key, score: p.score })) } : null, {
            confidence: readyConf, evidence: ["HRV, resting heart rate, sleep and the morning check-in (COROS recovery shown, not scored)"],
            source: "readiness (Classic)", missing: "No HRV or sleep for last night yet"
        }) : undefined,
        corosRecovery: S("vendor", v2?.coros || cl?.coros || null, {
            confidence: "low", evidence: ["COROS's own number: shown, never scored (it uses the same HRV, resting HR and load)"],
            source: "coros-fitness-history", missing: "No COROS recovery today"
        }),
        mornings: S("subjective", Object.keys(checkins).length ? { last7: mornings7.length, today: Boolean(checkins[asOf]) } : null, {
            confidence: "high", evidence: ["Morning check-ins (soreness, energy, mood) in the last 7 days"], window: win(7),
            source: self ? "readiness-checkins" : "sharedAthleteModel.checkins", missing: self ? "No morning check-ins yet" : "No morning check-ins shared"
        }),
        weekly: self ? undefined : S("subjective", latestWeekly ? {
            weekOf: latestWeekly.weekOf, rating: latestWeekly.rating || null,
            energy: latestWeekly.energy ?? null, recovery: latestWeekly.recovery ?? null, motivation: latestWeekly.motivation ?? null,
            pain: Boolean(latestWeekly.pain)
        } : null, {
            confidence: "high", evidence: ["Their weekly check-in (1–5 answers); the words are left out", "Not read by the readiness or decision engines yet"],
            source: "checkins", missing: "No weekly check-in in the last 2 weeks"
        })
    };
    if (readiness.classic === undefined) delete readiness.classic;
    if (readiness.weekly === undefined) delete readiness.weekly;

    // ----- preparation -----
    const d = r?.durability || null;
    const kw = inp.keyWork || [];
    const preparation = {
        block: S("derived", d ? {
            kind: d.kind, readinessPct: Math.round(d.readiness * 100), basis: d.basis, blocks: d.blocks,
            weeklyMiles: d.parts.weekly, longRuns: d.parts.longRuns, longest: d.parts.longest
        } : null, {
            confidence: d ? (d.basis === "yours" ? (d.blocks >= 4 ? "high" : "moderate") : "low") : "none",
            evidence: [d ? (d.basis === "yours" ? `Against your usual block: the median of the 12 weeks before your ${d.blocks} earlier ${d.kind === "marathon" ? "marathons" : "halves"}` : "Against a typical plan (fewer than 2 earlier blocks of yours to compare with)") : "", "Last 12 weeks"],
            window: win(84), source: `raceCapability@${RACE_MODEL_VERSION}#durability`,
            missing: "Preparation is worked out for the half and the marathon"
        }),
        learnedEffect: S("modeled", d ? { applied: Boolean(d.applied), effectSec: d.effectSec ?? null, couldCostSec: d.couldCostSec ?? null, learnedFrom: d.learnedFrom || 0 } : null, {
            confidence: d?.learnedFrom >= 3 ? "moderate" : "low",
            evidence: [d ? (d.applied ? `Learned from ${d.learnedFrom} earlier races: a thinner block has cost you time` : `Not added: ${d.learnedFrom ? `${d.learnedFrom} earlier races haven't shown a thinner block slows you` : "no earlier races to learn from"}`) : ""],
            source: `raceCapability@${RACE_MODEL_VERSION}#trackRecord`, missing: "Preparation is worked out for the half and the marathon"
        }),
        keySessions: self ? S("derived", kw.length ? {
            done: kw.filter(w => w.run).length, of: kw.length,
            quality: { done: kw.filter(w => w.kind === "quality" && w.run).length, of: kw.filter(w => w.kind === "quality").length },
            long: { done: kw.filter(w => w.kind === "long" && w.run).length, of: kw.filter(w => w.kind === "long").length }
        } : null, {
            confidence: "high", evidence: ["The plan's quality, long and race days of the last 6 weeks with a run that day"], window: win(42),
            source: "trendsData#keyWorkouts", missing: "No key sessions in the plan's last 6 weeks"
        }) : undefined
    };
    if (preparation.keySessions === undefined) delete preparation.keySessions;

    // ----- schedule, constraints, preferences (profile answers; Eddie has none yet) -----
    const p = profile || {};
    const list = v => (Array.isArray(v) ? v : []);
    const schedule = {};
    const constraints = {};
    const preferences = {};
    if (!self) {
        schedule.availableDays = S("athlete", list(p.availabilityDays).length ? list(p.availabilityDays).map(x => DAY_NAMES[x] || x) : null, {
            confidence: freshConf(fresh.availabilityDays), evidence: [freshLine(fresh.availabilityDays)], source: "clientRecords.availabilityDays", missing: "Not answered"
        });
        schedule.notes = S("athlete", realAnswer(p.availabilityNotes) || null, { confidence: "moderate", source: "clientRecords.availabilityNotes", missing: "None given" });
        schedule.setup = S("athlete", p.timeOfDay || p.sessionLength || list(p.trainWhere).length || list(p.equipment).length ? {
            timeOfDay: list(p.timeOfDay), sessionLength: p.sessionLength || null, where: list(p.trainWhere), equipment: list(p.equipment)
        } : null, { confidence: "moderate", source: "clientRecords (time, length, where, equipment)", missing: "Not answered" });
        constraints.limits = S("athlete", p.injuries || list(p.injuryAreas).length ? {
            none: isNoneAnswer(p.injuries) && !list(p.injuryAreas).length,
            text: realAnswer(p.injuries) || (isNoneAnswer(p.injuries) ? "None right now" : ""),
            areas: list(p.injuryAreas), status: p.injuryStatus || null
        } : null, {
            confidence: freshConf(fresh.injuries), evidence: [freshLine(fresh.injuries)], source: "clientRecords.injuries", missing: "Not answered"
        });
        const open = (inp.changeRequests || []).filter(x => x.status === "open");
        constraints.openRequests = S("subjective", open.length ? open.map(x => ({ reason: x.reason, date: x.date || null })) : null, {
            confidence: "high", evidence: ["Their open requests to change the plan (the reason; their words are left out)"], source: "changeRequests", missing: "None open"
        });
        preferences.worked = S("athlete", realAnswer(p.workedBefore) || null, { confidence: "moderate", source: "clientRecords.workedBefore", missing: "Not answered" });
        preferences.notWorked = S("athlete", realAnswer(p.notWorked) || null, { confidence: "moderate", source: "clientRecords.notWorked", missing: "Not answered" });
        preferences.wants = S("athlete", realAnswer(p.coachingWants) || null, { confidence: "moderate", source: "clientRecords.coachingWants", missing: "Not answered" });
        preferences.style = S("athlete", p.feedbackStyle || p.obstacle ? { feedback: p.feedbackStyle || null, obstacle: p.obstacle || null } : null, { confidence: "moderate", source: "clientRecords (feedback style, obstacle)", missing: "Not answered" });
        schedule.booked = S("coach", (inp.booked || []).filter(x => x >= asOf && x <= addDays(asOf, 14)).sort(), {
            confidence: "high", evidence: ["Approved sessions in the next 2 weeks"], window: { from: asOf, to: addDays(asOf, 14) }, source: "bookingRequests", missing: "No sessions booked"
        });
    }
    if (settings) {
        schedule.planSettings = S("coach", {
            runDays: list(settings.runDays).map(x => DAY_NAMES[x] || x), longRunDay: DAY_NAMES[settings.longRunDay] || settings.longRunDay || null,
            qualityDays: settings.speedDays ?? null, strengthDays: settings.strengthDays ?? null
        }, { confidence: "high", evidence: ["From the plan's Generate settings"], source: "plan.generator.settings" });
    }
    if (self) {
        schedule.busyDays = S("coach", (inp.busyDays || []).filter(x => x.date >= asOf && x.date <= addDays(asOf, 14)).map(x => ({ date: x.date, category: x.category || "personal" })), {
            confidence: "high", evidence: ["Your planner in the next 2 weeks (the category only, never the title)"], window: { from: asOf, to: addDays(asOf, 14) },
            source: "planner-events", missing: "Nothing in your planner for the next 2 weeks"
        });
    }
    // Pain and sickness, yes / no with the day, from wherever the athlete reported it.
    const flagDays = [];
    for (const [date, x] of Object.entries(checkins)) {
        if (date <= addDays(asOf, -14) || date > asOf) continue;
        if (x?.pain) flagDays.push({ date, kind: "pain", from: "morning check-in" });
        if (x?.sick) flagDays.push({ date, kind: "sick", from: "morning check-in" });
    }
    for (const x of inp.weeklyCheckins || []) if (x?.pain && x.weekOf > addDays(asOf, -14) && x.weekOf <= asOf) flagDays.push({ date: x.weekOf, kind: "pain", from: "weekly check-in" });
    for (const x of inp.results || []) if (x?.pain && x.date > addDays(asOf, -14) && x.date <= asOf) flagDays.push({ date: x.date, kind: "pain", from: "workout log" });
    constraints.painOrSick = S("subjective", flagDays.sort((a, b) => b.date.localeCompare(a.date)), {
        confidence: "high", evidence: ["Reported in the last 2 weeks (yes / no and the day; the words are left out)", "Southbound doesn't diagnose: a flag means check in with the athlete"],
        window: win(14), source: "check-ins and workout logs", missing: "Nothing reported in the last 2 weeks"
    });

    // ----- plan -----
    const upcoming = (inp.upcoming || []).map(x => ({ date: x.date, dayName: x.dayName, kind: x.kind, miles: x.miles, session: x.session, race: Boolean(x.race) }));
    const planDomain = {
        current: S("coach", plan ? {
            source: plan.source, name: plan.name || "", version: plan.version ?? null,
            week: plan.week || null, totalWeeks: plan.totalWeeks || null, phase: plan.phase || "", cutback: Boolean(plan.cutback), purpose: plan.purpose || ""
        } : null, { confidence: "high", source: plan?.source || "", missing: self ? "No plan" : "No published plan" }),
        upcoming: S("coach", upcoming, {
            confidence: "high", evidence: [`${r1(upcoming.slice(0, 7).reduce((s, x) => s + (Number(x.miles) || 0), 0))} mi planned in the next 7 days`],
            window: { from: addDays(asOf, 1), to: addDays(asOf, 14) }, source: plan?.source || "", missing: "Nothing planned in the next 2 weeks"
        })
    };

    // ----- decision -----
    const dc = c.decision;
    const measured = dc.domains.length;
    // A pain flag's reason quotes the check-in's words: kept as "pain reported (date)".
    const flagWords = (dc.flags || []).map(f => {
        const date = String(f.text || "").match(/\((\d{4}-\d{2}-\d{2})\)\s*$/)?.[1] || "";
        return `${f.key === "sick" ? "felt sick" : "pain reported"}${date ? ` (${date})` : ""}`;
    }).join("; ");
    const words = dc.level === "checkin" && flagWords
        ? { reason: flagWords, summary: `Check in with the athlete before training hard: ${flagWords}.` }
        : { reason: dc.reason || "", summary: dc.summary };
    const decision = {
        weekly: S("modeled", {
            level: dc.level, label: LEVEL_WORDS[dc.level], votes: dc.count, groups: dc.votes, reason: words.reason,
            summary: words.summary,
            domains: dc.domains.map(x => ({ key: x.key, label: x.label, severity: x.severity, word: x.word, text: x.text })),
            changes: dc.changes.map(x => ({ date: x.date, dayName: x.dayName, text: x.text })),
            notes: dc.notes
        }, {
            confidence: measured >= 4 ? "moderate" : measured >= 2 ? "low" : "none",
            evidence: [`${measured} of 5 signals could be measured`, `${dc.count ?? 0} ${dc.count === 1 ? "vote" : "votes"}: stimulus ${dc.votes?.stimulus ?? 0}, response ${dc.votes?.response ?? 0}, recovery ${dc.votes?.recovery ?? 0} (related signals can't stack up)`, "An input for the coach, not a prescription"],
            window: win(7), source: `weeklyDecision@${DECISION_VERSION}`
        }),
        recentChoices: S("coach", (inp.decisions || []).slice(-4).map(x => ({ weekOf: x.weekOf, level: x.level, choice: x.choice, reason: x.reason || "" })), {
            confidence: "high", evidence: ["What the coach did with the last weekly suggestions"], source: self ? "athlete-model.decisions" : "coach-athlete-model.decisions",
            missing: "No weekly suggestion has been acted on yet"
        })
    };

    const state = {
        version: STATE_VERSION, asOf, who: identity.who, identity,
        goals, fitness: fitnessDomain, load, response, readiness, preparation,
        schedule, constraints, preferences, plan: planDomain, decision,
        unknowns: [],
        versions: { state: STATE_VERSION, ledger: LEDGER_VERSION, dose: DOSE_VERSION, load: LOAD_VERSION, response: RESPONSE_VERSION, readinessV2: READINESS_V2_VERSION, race: RACE_MODEL_VERSION, decision: DECISION_VERSION }
    };
    state.unknowns = unknownsOf(state, { self, coverage: dataCoverage({ sessions, health, laps: inp.laps || {}, today: asOf }) });
    return state;
}

const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); return addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7)); };

// ---------- unknowns ----------

// Signals whose absence matters for planning, and why.
const WHY = {
    "goals.targetRace": "Planning can't aim at a race without one.",
    "goals.goalTime": "Paces for race-specific work come from the goal time.",
    "goals.primary": "The priority for the week depends on the goal.",
    "fitness.raceTime": "Without a capability estimate, paces lean on the plan alone.",
    "fitness.raceEvidence": "Race-based predictions are the most reliable; without a recent race the range is wider.",
    "response.efficiency": "Easy-run heart rate is the main sign of how training is landing.",
    "response.effort": "Effort answers show whether runs cost more than usual.",
    "readiness.score": "Recovery between sessions can't be read without nights of HRV or sleep.",
    "schedule.availableDays": "Sessions may land on days they can't train.",
    "constraints.limits": "Injuries and limits shape what can be prescribed."
};

/** -> [{ key, what, why }] the gaps worth knowing before planning, most important first. */
function unknownsOf(state, { self, coverage }) {
    const out = [];
    for (const { path, signal } of signalList(state)) {
        if (signal.value == null && WHY[path]) out.push({ key: path, what: signal.missing, why: WHY[path] });
    }
    for (const row of coverage.rows || []) {
        if (!row.of || row.pct >= 50 || row.key === "laps") continue;
        out.push({ key: `data.${row.key}`, what: `${row.label} on ${row.have} of ${row.of} ${row.unit} (last ${row.unit === "nights" ? coverage.nights : coverage.days} days)`, why: row.why });
    }
    if (self) out.push({ key: "goals.profile", what: "No athlete profile for you: your goals, days, limits and preferences aren't written anywhere", why: "Planning reads them from the plan's race day for now (weekly planning P2 adds them)." });
    return out;
}

/** Every signal in the state with its path ("load.percentile"), in domain order. */
export function signalList(state) {
    const out = [];
    for (const domain of DOMAINS) {
        for (const [key, signal] of Object.entries(state[domain] || {})) {
            if (signal && typeof signal === "object" && "kind" in signal && "confidence" in signal) out.push({ path: `${domain}.${key}`, domain, key, signal });
        }
    }
    return out;
}
