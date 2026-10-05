/* ==========================================
   Southbound — the weekly decision (pure)

   Athlete model, layer 8 (docs/PERFORMANCE_ENGINE_PLAN.md 3.9): Eddie's
   percentage dial-down. Five concern domains, each none / mild /
   moderate / strong over the last 7 days:
     load        recent load vs the athlete's own year
     response    effort vs expected, easy-run HR at the same pace
     autonomic   HRV below its smallest worthwhile change, resting HR up
     sleep       the 7-night debt
     subjective  the morning check-ins against their usual
   The level comes from how many agree, so one noisy signal never moves
   the plan on its own:
     Proceed   0, or 1 mild                     as planned
     Absorb    2, or 1 moderate                 easy runs 90%, quality at
                                                 the slow end of the range
     Ease      3, or 2 moderate+, or effort      easy 80%, long 85%, one
               +1.5 for 3+ runs                  quality session −25% reps
     Recover   4+, or a second Ease week         65% for 3 days (quality
                                                 becomes easy), long 75%
     Check in  pain or sickness, or autonomic +  no automatic change
               subjective + response all strong
   It only ever dials down: nothing is set above the plan. Race week only
   ever says Check in or nothing; in a taper, Absorb / Ease only change
   the pace guidance. The percentages are the athlete's policy (defaults
   below, editable on Analytics).
   Judged (0.2.0 of the replay, docs/ATHLETE_MODEL_AUDIT.md A4) on what
   the domains don't contain: planned runs skipped or cut short, key
   workouts off their targets, and new pain or sickness. Not on runs that
   felt harder than usual: that's the response domain itself.
   Unit-tested in tests/weeklyDecision.test.mjs.
========================================== */

import { autonomic, sleepDomain, feelDomain } from "./readinessV2.js";
import { efficiencySignal, effortSignal } from "./trainingResponse.js";
import { trainingOutcomes } from "./readinessBacktest.js";

export const DECISION_VERSION = "0.1.0";
export const LEVELS = Object.freeze(["proceed", "absorb", "ease", "recover", "checkin"]);
export const LEVEL_WORDS = Object.freeze({ proceed: "Proceed", absorb: "Absorb", ease: "Ease", recover: "Recover", checkin: "Check in" });
export const DEFAULT_POLICY = Object.freeze({ absorbEasy: 0.9, easeEasy: 0.8, easeLong: 0.85, easeReps: 0.75, recoverEasy: 0.65, recoverLong: 0.75, recoverDays: 3 });
export const DOMAIN_NAMES = Object.freeze({ load: "Load", response: "How runs are going", autonomic: "HRV and resting HR", sleep: "Sleep", subjective: "How you feel" });
const SEVERITY_WORDS = ["none", "mild", "moderate", "strong"];

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
export const mondayOf = date => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d); return addDays(date, -((t.getDay() + 6) % 7)); };
const half = x => Math.round(x * 2) / 2;
const hm = min => { const m = Math.round(min); return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`; };

// ---------- the five domains ----------

/**
 * data: { health, checkins, settings, response: { effRuns, effortRows }, loadSeries }
 * -> { domains: [{ key, label, severity 0–3, word, text }], flags: [{ key, text }], effort }
 */
export function concernDomains(asOf, data = {}) {
    const out = [];
    const push = (key, severity, text) => out.push({ key, label: DOMAIN_NAMES[key], severity, word: SEVERITY_WORDS[severity], text });

    // Load: where recent load sits in the year, and whether it's climbing fast.
    const series = (data.loadSeries || []).filter(s => s.date <= asOf);
    const year = series.filter(s => s.date > addDays(asOf, -365));
    const now = year.at(-1);
    if (now && year.length >= 28) {
        const p = Math.round(year.filter(s => s.recent < now.recent).length / year.length * 100);
        const weekAgo = series.find(s => s.date === addDays(now.date, -7));
        const rising = weekAgo && weekAgo.recent > 0 && now.recent / weekAgo.recent >= 1.15;
        const sev = p >= 95 && rising ? 3 : p >= 90 ? 2 : p >= 75 ? 1 : 0;
        push("load", sev, sev ? `recent load in your top ${Math.max(1, 100 - p)}% of the year${rising ? " and rising fast" : ""}` : "recent load within your usual");
    }

    // Response: effort vs expected and easy-run heart rate at the same pace.
    const es = effortSignal(data.response?.effortRows || [], asOf);
    const ef = efficiencySignal(data.response?.effRuns || [], asOf);
    if (es.verdict !== "few" || ef.verdict !== "few") {
        const parts = [];
        let sev = 0;
        if (es.verdict !== "few") {
            const s = es.mean >= 1.5 ? 3 : es.mean >= 1 ? 2 : es.mean >= 0.5 ? 1 : 0;
            sev = Math.max(sev, s);
            if (s) parts.push(`runs feeling ${es.mean} harder than usual (last ${es.n})`);
        }
        if (ef.verdict === "higher") {
            const s = ef.bpm >= 6 ? 3 : ef.bpm >= 4 ? 2 : 1;
            sev = Math.max(sev, s);
            parts.push(`easy runs ${ef.bpm} bpm higher at the same pace`);
        }
        push("response", sev, parts.length ? parts.join(", ") : "runs going as usual");
    }

    // Autonomic: HRV against its smallest worthwhile change, resting HR.
    const a = autonomic(asOf, data.health || {});
    if (a) {
        let sev = 0;
        const z = a.hrv?.z;
        if (z != null) sev = z < -1.5 ? 3 : z < -1 ? 2 : z < -0.5 ? 1 : 0;
        else if (a.hrv) sev = a.hrv.score < 45 ? 2 : a.hrv.score < 60 ? 1 : 0;
        const rz = a.rhr?.z;
        if (rz != null) sev = Math.max(sev, rz < -1.5 ? 2 : rz < -1 ? 1 : 0);
        push("autonomic", sev, sev ? a.note : "HRV and resting HR in your normal range");
    }

    // Sleep: the week's debt.
    const sl = sleepDomain(asOf, data.health || {}, data.settings?.sleepNeedMin);
    if (sl && sl.debtMin != null) {
        const d = sl.debtMin;
        const sev = d > 480 ? 3 : d > 300 ? 2 : d > 180 ? 1 : 0;
        push("sleep", sev, d > 30 ? `${hm(d)} short over the last 7 nights` : "sleeping enough");
    }

    // Subjective: the morning check-ins of the week against their usual.
    const checkins = data.checkins || {};
    const days = Array.from({ length: 7 }, (_, i) => addDays(asOf, -i));
    const feel = days.map(d => feelDomain(d, checkins)?.score).filter(v => v != null);
    if (feel.length) {
        const m = mean(feel);
        const sev = feel.length < 2 ? 0 : m < 40 ? 3 : m < 50 ? 2 : m < 60 ? 1 : 0;
        push("subjective", sev, sev ? `morning check-ins below your usual (${feel.length} this week)` : `morning check-ins about usual (${feel.length} this week)`);
    }

    const flags = [];
    for (const d of days.slice(0, 3)) {
        const c = checkins[d];
        if (c?.sick) flags.push({ key: "sick", text: `Felt sick (${d})` });
        if (c?.pain) flags.push({ key: "pain", text: `Pain: ${c.pain} (${d})` });
    }
    return { domains: out, flags, effort: es };
}

// ---------- the level ----------

/** -> { level, count, moderate, reason } (shift moves every count threshold, for the replay's settings). */
export function decideLevel({ domains, flags, effort }, { previous = null, shift = 0 } = {}) {
    const sev = k => domains.find(d => d.key === k)?.severity || 0;
    const count = domains.filter(d => d.severity >= 1).length;
    const moderate = domains.filter(d => d.severity >= 2).length;
    if (flags?.length) return { level: "checkin", count, moderate, reason: flags.map(f => f.text).join("; ") };
    if (sev("autonomic") >= 3 && sev("subjective") >= 3 && sev("response") >= 3) return { level: "checkin", count, moderate, reason: "heart rate variability, how you feel and how runs are going are all strongly off" };
    const effortHigh = effort?.verdict && effort.verdict !== "few" && effort.mean >= 1.5 && effort.n >= 3;
    let level = "proceed";
    if (count >= 4 + shift) level = "recover";
    else if (count >= 3 + shift || moderate >= 2 + Math.max(0, shift) || effortHigh) level = "ease";
    else if (count >= 2 + shift || moderate >= 1) level = "absorb";
    if (level === "ease" && previous === "ease") level = "recover";
    return { level, count, moderate, reason: previous === "ease" && level === "recover" && count < 4 + shift ? "a second week at Ease" : "" };
}

// ---------- what to change ----------

function cutReps(session, factor) {
    const m = String(session || "").match(/(\d+)\s*x/i);
    if (!m) return null;
    const n = Number(m[1]);
    const n2 = Math.max(2, Math.ceil(n * factor - 0.5));   // halves round down: it only ever dials down
    return n2 < n ? { session: session.replace(m[0], m[0].replace(m[1], String(n2))), from: n, to: n2 } : null;
}
const SLOW_NOTE = " (slower end of the pace range)";
const shorter = (miles, f) => { const x = half(miles * f); return miles < 2 ? miles : Math.min(miles, Math.max(2, x)); };

/**
 * planDays: the next 7 days [{ date, week, index, dayName, session, miles, pace, kind (rest|easy|long|quality|race), phase, race }]
 * -> { changes: [{ date, week, index, dayName, before, after, text }], notes: [] }
 */
export function suggestChanges(level, planDays = [], policy = DEFAULT_POLICY) {
    const p = { ...DEFAULT_POLICY, ...policy };
    const notes = [];
    if (planDays.some(d => d.race || d.kind === "race")) {
        notes.push("Race week: no automatic changes. Trust the taper; if something's off, adjust by feel.");
        return { changes: [], notes };
    }
    if (level === "proceed" || level === "checkin") return { changes: [], notes };
    const taper = planDays[0]?.phase === "taper";
    const changes = [];
    let qualityCut = false;
    planDays.forEach((d, i) => {
        if (!(d.miles > 0) || d.kind === "rest") return;
        const before = { session: d.session, miles: d.miles, pace: d.pace };
        let after = null;
        if (taper && (level === "absorb" || level === "ease")) {
            if (d.kind === "quality" && !d.session.includes(SLOW_NOTE)) after = { ...before, session: d.session + SLOW_NOTE };
        } else if (level === "absorb") {
            if (d.kind === "easy") after = { ...before, miles: shorter(d.miles, p.absorbEasy) };
            else if (d.kind === "quality" && !d.session.includes(SLOW_NOTE)) after = { ...before, session: d.session + SLOW_NOTE };
        } else if (level === "ease") {
            if (d.kind === "easy") after = { ...before, miles: shorter(d.miles, p.easeEasy) };
            else if (d.kind === "long") after = { ...before, miles: shorter(d.miles, p.easeLong) };
            else if (d.kind === "quality" && !qualityCut) {
                const c = cutReps(d.session, p.easeReps);
                after = c ? { ...before, session: c.session, miles: shorter(d.miles, 1 - (1 - p.easeReps) / 2) } : { ...before, miles: shorter(d.miles, p.easeLong) };
                qualityCut = true;
            }
        } else if (level === "recover") {
            if (i < p.recoverDays) {
                if (d.kind === "long") after = { ...before, miles: shorter(d.miles, p.recoverLong) };
                else after = { session: d.kind === "quality" ? `Easy run (was: ${d.session})` : d.session, miles: shorter(d.miles, p.recoverEasy), pace: d.kind === "quality" ? "Easy" : d.pace };
            }
        }
        if (!after || (after.miles === before.miles && after.session === before.session && after.pace === before.pace)) return;
        after.miles = Math.min(after.miles, before.miles);       // never above the plan
        const text = after.session !== before.session && after.miles !== before.miles
            ? `${before.session} → ${after.session}, ${before.miles} → ${after.miles} mi`
            : after.session !== before.session ? `${before.session} → ${after.session}`
            : `${before.session}: ${before.miles} → ${after.miles} mi`;
        changes.push({ date: d.date, week: d.week, index: d.index, dayName: d.dayName, before, after, text });
    });
    if (taper && (level === "absorb" || level === "ease")) notes.push("Taper: only the pace guidance changes; the miles are already coming down.");
    if (level === "ease") notes.push("Strength this week: one set fewer on each exercise.");
    if (level === "recover") notes.push(`Easy for ${p.recoverDays} days, then back to the plan. No heavy lower-body strength.`);
    return { changes, notes };
}

// ---------- the whole decision ----------

const COUNT_WORDS = ["No signals", "One signal", "Two signals", "Three signals", "Four signals", "Five signals"];

/** -> { version, asOf, weekOf, level, label, count, domains, flags, changes, notes, summary } */
export function weekDecision(asOf, data, planDays = [], { policy = DEFAULT_POLICY, previous = null } = {}) {
    const c = concernDomains(asOf, data);
    const d = decideLevel(c, { previous });
    const { changes, notes } = suggestChanges(d.level, planDays, policy);
    const flagged = c.domains.filter(x => x.severity >= 1).sort((a, b) => b.severity - a.severity);
    const fine = c.domains.filter(x => x.severity === 0).map(x => x.label.toLowerCase());
    const summary = d.level === "checkin"
        ? `Check in with yourself before training hard: ${d.reason}.`
        : flagged.length
            ? `${COUNT_WORDS[flagged.length]} ${flagged.length === 1 ? "is worth noticing" : "agree"}: ${flagged.map(x => x.text).join("; ")}.${fine.length ? ` Fine: ${fine.join(", ")}.` : ""}`
            : `Nothing's off: ${c.domains.length ? c.domains.map(x => x.label.toLowerCase()).join(", ") + " all look normal" : "not enough data yet to see anything"}.`;
    return {
        version: DECISION_VERSION, asOf, weekOf: mondayOf(asOf),
        level: d.level, label: LEVEL_WORDS[d.level], count: d.count, reason: d.reason,
        domains: c.domains, flags: c.flags, changes, notes, summary,
        plannedMiles: planDays.reduce((t, x) => t + (Number(x.miles) || 0), 0)
    };
}

// ---------- what happened next, and the replay ----------

// The outcomes the decision can be judged on: none of them is one of its own inputs.
const MISSED = ["skipped", "slow"];
const reported = c => Boolean(c && (c.sick || c.pain));
const flagsIn = (checkins, from, to) => Object.entries(checkins || {}).filter(([d, c]) => d >= from && d < to && reported(c)).length;

/**
 * Trouble in [from, to): 2+ planned sessions missed (skipped, cut short, off target),
 * or pain / sickness reported there when none was in the week before `from` (a new one).
 */
function troubleIn(outcomes, checkins, from, to) {
    const missed = [...outcomes.entries()].filter(([d, o]) => d >= from && d < to && o.kinds.some(k => MISSED.includes(k))).length;
    const fresh = flagsIn(checkins, addDays(from, -7), from) ? 0 : flagsIn(checkins, from, to);
    return { missed, fresh, trouble: missed >= 2 || fresh > 0 };
}

/** The 7 days after a decision: sessions missed, new pain / sickness, miles run. */
export function outcomeOf(decision, data, today) {
    const from = addDays(decision.asOf, 1), to = addDays(decision.asOf, 8);
    if (addDays(to, 1) > today) return { pending: true };
    const outcomes = trainingOutcomes(data, today, { from, kinds: MISSED });
    const t = troubleIn(outcomes, data.checkins, from, to);
    const miles = (data.doses || []).filter(d => d.date >= from && d.date < to).reduce((s, d) => s + (d.miles || 0), 0);
    return { pending: false, missed: t.missed, flags: t.fresh, miles: Math.round(miles * 10) / 10, trouble: t.trouble };
}

/**
 * Replays every Monday of the last `weeks` weeks: what the engine would
 * have said, then whether trouble followed in the next 14 days (2+
 * planned sessions missed or off target, or new pain / sickness). Three
 * settings show the trade-off: Sensitive (every count threshold one
 * lower), Default, Cautious (one higher); and the simple way to beat:
 * easing off whenever the 2 weeks before had that same trouble.
 * -> { version, weeks, settings: [{ key, label, flagged, troubleWeeks, hits, falseAlarms, misses, hitRate, falseRate, missRate }] }
 */
export function replayDecisions(data, today, { weeks = 26 } = {}) {
    const mondays = Array.from({ length: weeks }, (_, i) => addDays(mondayOf(today), -7 * (i + 2))).reverse();
    const outcomes = trainingOutcomes(data, today, { from: addDays(mondays[0] || today, -21), kinds: MISSED });
    const trouble = m => troubleIn(outcomes, data.checkins, m, addDays(m, 14)).trouble;
    const before = m => troubleIn(outcomes, data.checkins, addDays(m, -14), m).missed >= 2 || flagsIn(data.checkins, addDays(m, -14), m) > 0;
    const domainsBy = new Map(mondays.map(m => [m, concernDomains(addDays(m, -1), data)]));
    const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
    const tally = (s, flagOf) => {
        let hits = 0, falseAlarms = 0, misses = 0, flagged = 0, troubleWeeks = 0;
        for (const m of mondays) {
            const flag = flagOf(m);
            if (flag == null) continue;
            const t = trouble(m);
            if (t) troubleWeeks++;
            if (flag) { flagged++; if (t) hits++; else falseAlarms++; } else if (t) misses++;
        }
        return { key: s.key, label: s.label, flagged, troubleWeeks, hits, falseAlarms, misses, hitRate: pct(hits, flagged), falseRate: pct(falseAlarms, flagged), missRate: pct(misses, troubleWeeks) };
    };
    const settings = [{ key: "sensitive", label: "Sensitive", shift: -1 }, { key: "default", label: "Default", shift: 0 }, { key: "cautious", label: "Cautious", shift: 1 }].map(s => {
        let prev = null;
        return tally(s, m => {
            const c = domainsBy.get(m);
            if (!c.domains.length) return null;
            const level = decideLevel(c, { previous: prev, shift: s.shift }).level;
            prev = level;
            return level === "ease" || level === "recover" || level === "checkin";
        });
    });
    settings.push(tally({ key: "simple", label: "Last 2 weeks' trouble (the simple way)" }, m => (domainsBy.get(m).domains.length ? before(m) : null)));
    return { version: "0.2.0", weeks: mondays.length, settings };
}
