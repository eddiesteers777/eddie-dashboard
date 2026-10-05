/* ==========================================
   Southbound — Analytics: what to look into, and how much data there is (pure)

   docs/ATHLETE_MODEL_AUDIT.md section 8 (Phase C). The page's summary
   strip: at most three plain lines, each pointing at the section to look
   at, from what the cards on the page already worked out ("facts"):
     capability  the race card's prediction (js/raceCapability.js)
     response    "How you responded" (js/trainingResponse.js)
     preparation this block against the athlete's usual (durability)
     coverage    dataCoverage() below
   Nothing here computes a model of its own; it only reads the results
   and says which ones are worth a look, most important first.
   dataCoverage: how much of the last 90 days carries heart rate, an
   effort answer, laps, and how many of the last 60 nights have HRV and
   sleep, so the Data section can say what the numbers above stand on.
   Unit-tested in tests/analyticsSummary.test.mjs.
========================================== */

import { addDays } from "./athleteLedger.js";

export const MAX_LINES = 3;
const pct = (n, d) => (d ? Math.round(n / d * 100) : 0);
const monthName = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long" });
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);

/** Watch runs (COROS / Strava), not hand-logged ones. */
const watchRun = s => !String(s.id || "").startsWith("l:");

/**
 * -> { days, runs, hr, effort, laps, nights, hrv, sleep } (counts) + rows for the Data section.
 * laps: the coros-laps store ({ labelId: { laps } }); health: COROS days.
 */
export function dataCoverage({ sessions = [], health = {}, laps = {}, today, days = 90, nights = 60 }) {
    const from = addDays(today, -(days - 1));
    const runs = sessions.filter(s => s.date >= from && s.date <= today && watchRun(s));
    const lapIds = new Set(Object.entries(laps || {}).filter(([, v]) => v?.laps?.length).map(([k]) => `c:${k}`));
    const hr = runs.filter(s => s.avgHr > 0).length;
    const effort = runs.filter(s => s.rpe != null).length;
    const withLaps = runs.filter(s => lapIds.has(s.id) || (s.aliases || []).some(a => lapIds.has(a))).length;
    const nightDays = Array.from({ length: nights }, (_, i) => addDays(today, -i));
    const hrv = nightDays.filter(d => health?.[d]?.hrv?.avg != null).length;
    const sleep = nightDays.filter(d => health?.[d]?.sleep?.asleepMin != null).length;
    const rows = [
        { key: "hr", label: "Heart rate", have: hr, of: runs.length, unit: "runs", pct: pct(hr, runs.length), why: "Easy-run efficiency and heart-rate load need it." },
        { key: "effort", label: "Effort answered", have: effort, of: runs.length, unit: "runs", pct: pct(effort, runs.length), why: "Effort vs expected needs it (How hard was it? after a run)." },
        { key: "laps", label: "Laps saved", have: withLaps, of: runs.length, unit: "runs", pct: pct(withLaps, runs.length), why: "Saved for key workouts only, to check them rep by rep." },
        { key: "hrv", label: "HRV", have: hrv, of: nights, unit: "nights", pct: pct(hrv, nights), why: "Readiness and the weekly decision read it." },
        { key: "sleep", label: "Sleep", have: sleep, of: nights, unit: "nights", pct: pct(sleep, nights), why: "Readiness and the weekly decision read it." }
    ];
    return { days, nights, runs: runs.length, hr, effort, laps: withLaps, hrv, sleep, rows };
}

/** This calendar month's watch runs and how many have an effort answer. */
export function effortThisMonth(sessions = [], today) {
    const month = today.slice(0, 7);
    const runs = sessions.filter(s => s.date.startsWith(month) && s.date <= today && watchRun(s));
    return { runs: runs.length, rated: runs.filter(s => s.rpe != null).length, answered: runs.filter(s => s.rpeAnswered).length };
}

/**
 * The summary strip: [{ key, text, href, tone }] (at most MAX_LINES), most important first.
 * facts: { today, capability, response, preparation, coverage, effortMonth, race }.
 */
export function summaryLines(facts = {}) {
    const out = [];
    const { today, capability: cap, response: resp, preparation: prep, coverage: cov, effortMonth: em, race } = facts;
    const add = (priority, key, text, href, tone = "look") => out.push({ priority, key, text, href, tone });

    // 1. Southbound and COROS disagree about the marathon.
    const coros = cap?.lenses?.find(l => l.key === "coros");
    const own = cap?.lenses?.filter(l => l.key !== "coros") || [];
    if (coros && own.length && cap?.sec) {
        const ownSec = Math.exp(own.reduce((t, l) => t + Math.log(l.sec) / l.sigma ** 2, 0) / own.reduce((t, l) => t + 1 / l.sigma ** 2, 0));
        const gap = coros.sec / ownSec - 1;
        if (Math.abs(gap) >= 0.05) {
            const newest = (cap.quality?.flags || []).find(f => /Newest race is|No confirmed race/.test(f));
            const why = newest ? (/No confirmed/.test(newest) ? "no confirmed race in 12 months" : newest.replace(/^Newest race is/, "your newest race is").toLowerCase()) : "";
            add(10, "coros-gap", `COROS and your own evidence differ by ${Math.round(Math.abs(gap) * 100)}% on the marathon (COROS is ${gap < 0 ? "faster" : "slower"})${why ? `: ${why}` : ""}.`, "#anCapability");
        }
    }
    // 2. No race to anchor the prediction.
    if (cap && !cap.lenses?.some(l => l.key === "races") && cap.sec) add(20, "no-race", "No confirmed race in the last 12 months: the prediction leans on training and COROS. Confirm a race in Your races if one is missing.", "#racesPanel");
    else if (cap?.quality?.flags?.some(f => /Newest race is/.test(f)) && !out.some(o => o.key === "coros-gap")) {
        const f = cap.quality.flags.find(x => /Newest race is/.test(x));
        add(25, "old-race", `${f.replace(/^Newest race is/, "Your newest race is")}: the prediction's range is wider until there's a fresh one.`, "#anCapability");
    }
    // 3. How you're responding, when it says something.
    const sig = resp?.eff?.signal;
    if (resp?.reading && ["fatigue", "deep", "costlier", "hrOnly"].includes(resp.reading.key)) add(15, "reading", `How you're responding: ${resp.reading.title.toLowerCase()}.`, "#anResponse", "warn");
    if (sig && (sig.verdict === "lower" || sig.verdict === "higher")) add(30, "efficiency", `Easy-run heart rate ${sig.verdict === "lower" ? "down" : "up"} ${Math.abs(sig.bpm)} bpm at the same pace over the last 2 weeks.`, "#anResponse", sig.verdict === "lower" ? "good" : "look");
    // 4. Preparation for the plan's race.
    if (prep && race && prep.gap > 0.15) {
        const until = daysBetween(today, race.date);
        if (until > 0 && until <= 84) add(18, "prep", `${race.name} in ${until} days: this block is ${Math.round(prep.readiness * 100)}% of ${prep.basis === "yours" ? "your usual" : "a typical"} ${prep.kind} block.`, "#anPreparation", "warn");
    }
    // 5. Data the numbers stand on.
    if (em && em.runs >= 3 && em.rated / em.runs < 0.6) add(40, "effort", `Only ${em.rated} of ${em.runs} runs rated in ${monthName(today)}: effort vs expected needs the answers.`, "#anResponse");
    if (cov?.runs >= 5 && cov.hr / cov.runs < 0.7) add(45, "hr", `Heart rate on only ${cov.hr} of ${cov.runs} runs in 90 days: efficiency and heart-rate load have little to go on.`, "#anData");
    if (cov && cov.hrv < cov.nights * 0.5 && cov.runs >= 5) add(50, "hrv", `HRV on ${cov.hrv} of the last ${cov.nights} nights: readiness and the weekly decision lean on fewer nights.`, "#anData");
    return out.sort((a, b) => a.priority - b.priority).slice(0, MAX_LINES).map(({ priority, ...rest }) => rest);
}

/** The label on a panel's title: measured / calculated / estimated / prediction (section 8's labels). */
export const KINDS = Object.freeze(["measured", "calculated", "estimated", "prediction"]);
export const kindChip = kind => (KINDS.includes(kind) ? `<span class="an-kind is-${kind}">${kind}</span>` : "");
