/* ==========================================
   Southbound — Readiness, version 2 (pure)

   Athlete model, layer 6 (docs/PERFORMANCE_ENGINE_PLAN.md 3.6). The
   score is the body's current state only, three domains, each against
   the athlete's own baseline, each counted once:
     autonomic   7-day average of ln HRV against the 60 nights before
                 (in the athlete's own SDs; ±0.5 SD = the smallest
                 worthwhile change, Plews 2013) with last night's value,
                 and resting HR (3-day average vs the 60 days before).
                 HRV counts twice as much as resting HR. Until there are
                 14 nights of baseline, COROS's own range (v1's parts).
     sleep       the last 3 nights against the sleep need (last night
                 counts most) and the 7-night debt. COROS's sleep score
                 only when there's no duration.
     feel        the morning check-in against the athlete's own usual
                 (8+ check-ins), else as answered. Same weight as
                 autonomic (Saw 2016: how athletes say they feel tracks
                 training stress as well as the physiology does).
   Shown beside it, not in it (0.2.0, docs/ATHLETE_MODEL_AUDIT.md A4):
     response    effort vs expected and easy-run HR at the same pace,
                 from js/trainingResponse.js, as of the morning: how
                 training is landing, a different question.
     load        recent load against the athlete's own year: what was
                 done, not how the body is.
   In 0.1.0 both were scored, which made the score partly a restatement
   of the runs it was then checked against.
   Score = mean of what's there; it needs last night's HRV or sleep (as
   v1). Sick caps it at 30, pain at 55 (as v1). COROS recovery is shown
   beside it, labelled as COROS's, and not scored. v1 stays the default
   until the readiness check (js/readinessBacktest.js) says v2 predicts
   bad training days better.
   Unit-tested in tests/readinessV2.test.mjs.
========================================== */

import { hrvPart, rhrPart, feelPart, colorOf, hm, DEFAULT_SLEEP_NEED } from "./readiness.js";
import { efficiencySignal, effortSignal } from "./trainingResponse.js";

export const READINESS_V2_VERSION = "0.2.0";
export const DOMAIN_WEIGHTS = Object.freeze({ autonomic: 1, sleep: 1, feel: 1 });
export const DOMAIN_LABELS = Object.freeze({ autonomic: "HRV and resting HR", sleep: "Sleep", feel: "How you feel", response: "Training response", load: "Recent load" });

const MIN_BASE = 14;
const clamp = (n, lo = 5, hi = 100) => Math.max(lo, Math.min(hi, n));
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((t, x) => t + (x - m) ** 2, 0) / (a.length - 1)) : 0; };
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const range = (date, from, to) => Array.from({ length: to - from + 1 }, (_, i) => addDays(date, -(from + i)));

/**
 * A z-score (positive = better than usual) -> 0–100. Inside the smallest
 * worthwhile change (±0.5 SD) is "normal" (70–80, green); a full SD below
 * is about 57 (yellow); two SDs below about 32 (red).
 */
export function zToScore(z) {
    if (z == null || !Number.isFinite(z)) return null;
    if (z >= -0.5 && z <= 0.5) return Math.round(75 + 10 * z);
    return Math.round(z < 0 ? clamp(70 + 25 * (z + 0.5)) : clamp(80 + 15 * (z - 0.5)));
}

// ---------- autonomic ----------

export function autonomic(date, health = {}) {
    const lnOf = d => (health[d]?.hrv?.avg > 0 ? Math.log(health[d].hrv.avg) : null);
    const base = range(date, 7, 66).map(lnOf).filter(v => v != null);
    const week = range(date, 0, 6).map(lnOf).filter(v => v != null);
    const night = lnOf(date);
    let hrv = null;
    if (base.length >= MIN_BASE && week.length >= 3) {
        const m = mean(base), s = Math.max(sd(base), 0.05);   // about 5%: a very steady baseline can't make a small dip look huge
        const z7 = (mean(week) - m) / s;
        const zN = night != null ? (night - m) / s : null;
        const z = zN != null ? 0.7 * z7 + 0.3 * zN : z7;
        const where = z7 < -0.5 ? "below your normal" : z7 > 0.5 ? "above your normal" : "in your normal range";
        hrv = { score: zToScore(z), z: Math.round(z * 100) / 100, note: `HRV 7-day average ${where} (${Math.round(Math.exp(mean(week)))} ms vs ${Math.round(Math.exp(m))})${zN != null && zN < -1.5 ? ", and last night was well below" : ""}`, own: true };
    } else {
        const p = hrvPart(health[date]?.hrv);
        if (p) hrv = { score: p.score, z: null, note: `HRV ${p.value}, ${p.note} (COROS's range until ${MIN_BASE} nights of your own)`, own: false };
    }
    const rhrBase = range(date, 3, 62).map(d => health[d]?.rhr).filter(v => Number(v) > 25);
    const rhr3 = range(date, 0, 2).map(d => health[d]?.rhr).filter(v => Number(v) > 25);
    let rhr = null;
    if (rhrBase.length >= MIN_BASE && rhr3.length >= 2) {
        const m = mean(rhrBase), s = Math.max(sd(rhrBase), 1.5);
        const z = -(mean(rhr3) - m) / s;
        const d = Math.round(mean(rhr3) - m);
        rhr = { score: zToScore(z), z: Math.round(z * 100) / 100, note: d === 0 ? `resting HR at your usual ${Math.round(m)}` : `resting HR ${Math.abs(d)} ${d > 0 ? "above" : "below"} your usual ${Math.round(m)}` };
    } else {
        const p = rhrPart(health[date]?.rhr, range(date, 1, 30).map(d => health[d]?.rhr));
        if (p?.score != null) rhr = { score: p.score, z: null, note: `resting HR ${p.note}` };
    }
    if (!hrv && !rhr) return null;
    const score = hrv && rhr ? Math.round((2 * hrv.score + rhr.score) / 3) : (hrv || rhr).score;
    return { key: "autonomic", score, note: [hrv?.note, rhr?.note].filter(Boolean).join(" · "), hrv, rhr };
}

// ---------- sleep ----------

const nightScore = (min, need) => { const r = min / need; return r >= 1 ? 100 : clamp(100 - (1 - r) * 200, 0); };

export function sleepDomain(date, health = {}, needMin = DEFAULT_SLEEP_NEED) {
    const nights = [0, 1, 2].map(i => health[addDays(date, -i)]?.sleep);
    const w = [0.5, 0.3, 0.2];
    const used = nights.map((n, i) => (n?.asleepMin ? { s: nightScore(n.asleepMin, needMin), w: w[i], min: n.asleepMin } : null)).filter(Boolean);
    if (!used.length) {
        const sc = health[date]?.sleep?.score;
        return sc ? { key: "sleep", score: Math.round(sc), note: `COROS sleep score ${sc} (no duration)` } : null;
    }
    const tw = used.reduce((t, u) => t + u.w, 0);
    let score = used.reduce((t, u) => t + u.s * u.w, 0) / tw;
    const week = range(date, 0, 6).map(d => health[d]?.sleep?.asleepMin).filter(Boolean);
    const debt = week.reduce((t, m) => t + Math.max(0, needMin - m), 0);
    if (debt > 180) score -= Math.min(25, (debt - 180) / 60 * 5);
    const avg = used.reduce((t, u) => t + u.min * u.w, 0) / tw;
    return { key: "sleep", score: Math.round(clamp(score)), note: `last ${used.length === 1 ? "night" : `${used.length} nights`} about ${hm(avg)} vs your ${hm(needMin)}${debt > 30 ? ` · ${hm(debt)} short over 7 nights` : ""}`, debtMin: debt };
}

// ---------- how you feel ----------

export function feelDomain(date, checkins = {}) {
    const today = feelPart(checkins[date]);
    if (!today) return null;
    const past = Object.keys(checkins).filter(d => d < date && d >= addDays(date, -60)).map(d => feelPart(checkins[d])?.score).filter(v => v != null);
    if (past.length >= 8) {
        const m = mean(past), s = Math.max(sd(past), 6);
        const z = (today.score - m) / s;
        return { key: "feel", score: zToScore(z), note: `${today.note}: ${z < -0.5 ? "below" : z > 0.5 ? "above" : "about"} your usual` };
    }
    return { key: "feel", score: today.score, note: today.note };
}

// ---------- training response (shown beside the score) ----------

/** response: { effRuns (js/trainingResponse.js efficiency().runs), effortRows }; only what's before `date` counts. */
export function responseDomain(date, response) {
    if (!response) return null;
    const asOf = addDays(date, -1);
    const parts = [];
    const ef = efficiencySignal(response.effRuns || [], asOf);
    if (ef.verdict !== "few") {
        const bpm = ef.verdict === "none" ? 0 : ef.bpm;
        parts.push({ score: clamp(75 - 4 * bpm), note: ef.verdict === "none" ? "easy-run heart rate as usual" : `easy runs ${Math.abs(ef.bpm)} bpm ${ef.verdict} at the same pace` });
    }
    const es = effortSignal(response.effortRows || [], asOf);
    if (es.verdict !== "few") parts.push({ score: clamp(75 - 20 * es.mean), note: es.verdict === "costlier" ? `runs feeling ${es.mean} harder than usual` : es.verdict === "easier" ? "runs feeling easier than usual" : "runs feeling as hard as usual" });
    if (!parts.length) return null;
    return { key: "response", score: Math.round(mean(parts.map(p => p.score))), note: parts.map(p => p.note).join(" · ") };
}

// ---------- load context (shown beside the score) ----------

/** series: the load state's daily rows ({ date, recent }); where yesterday's recent load sits in the year before. */
export function loadDomain(date, series) {
    if (!series?.length) return null;
    const asOf = addDays(date, -1);
    const year = series.filter(s => s.date <= asOf && s.date > addDays(asOf, -365));
    const now = year.at(-1);
    if (!now || year.length < 28 || now.date !== asOf) return null;
    const p = Math.round(year.filter(s => s.recent < now.recent).length / year.length * 100);
    return { key: "load", score: Math.round(clamp(100 - 0.6 * p)), note: p >= 90 ? `recent load in your top ${100 - p || 1}% of the year` : p >= 60 ? "recent load above your usual" : p >= 30 ? "recent load about usual" : "recent load light for you", percentile: p };
}

// ---------- the score ----------

/**
 * -> { version, date, score, color, domains: [{ key, label, score, note }], context: [same, not scored], positives, concern, coros, flags }
 * data: { health, fitness, checkins, settings, response?, loadSeries? }
 */
export function readinessV2(date, { health = {}, fitness = {}, checkins = {}, settings = {}, response = null, loadSeries = null } = {}) {
    const day = health[date] || {};
    const label = d => ({ ...d, label: DOMAIN_LABELS[d.key] });
    const domains = [
        autonomic(date, health),
        sleepDomain(date, health, settings.sleepNeedMin || DEFAULT_SLEEP_NEED),
        feelDomain(date, checkins)
    ].filter(d => d && d.score != null).map(label);
    const context = [responseDomain(date, response), loadDomain(date, loadSeries)].filter(d => d && d.score != null).map(label);
    const hasCore = Boolean(day.hrv?.avg || day.sleep?.asleepMin || day.sleep?.score);
    const tw = domains.reduce((t, d) => t + DOMAIN_WEIGHTS[d.key], 0);
    let score = hasCore && tw ? domains.reduce((t, d) => t + d.score * DOMAIN_WEIGHTS[d.key], 0) / tw : null;
    const c = checkins[date];
    const flags = [];
    if (c?.sick) { flags.push({ key: "sick", text: "You're feeling sick" }); if (score != null) score = Math.min(score, 30); }
    if (c?.pain) { flags.push({ key: "pain", text: `Pain: ${c.pain}` }); if (score != null) score = Math.min(score, 55); }
    score = score == null ? null : Math.round(score);
    const positives = domains.filter(d => d.score >= 75).sort((a, b) => b.score - a.score).slice(0, 2).map(d => d.note);
    const low = domains.slice().sort((a, b) => a.score - b.score)[0];
    const rec = fitness[date]?.recovery;
    return {
        version: READINESS_V2_VERSION, date, score, color: colorOf(score), domains, context,
        positives, concern: low && low.score < 60 ? low.note : null,
        coros: rec?.percent != null ? { percent: rec.percent, status: rec.status || "" } : null,
        flags, needsCheckin: !c
    };
}
