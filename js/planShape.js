/* ==========================================
   Southbound — the shape of a coach plan (pure)

   Weeks, phases, weekly miles and each day's run for js/coachPlanGenerator.js,
   by a few plain coaching rules that hold for any settings:
     - weeks run Monday-Sunday; days before the start are rest
     - phases: Foundation / Build / Race Specific / Peak / Taper for a race
       (the taper shrinks with a short plan), Build / Maintain / Cutback for
       general training
     - weekly miles start at their current miles, grow 7-10% a week (by
       experience, at least 1 and at most 4 miles), drop about 20% every
       4th week, hold at the peak, and taper from the peak actually reached
     - the long run grows from their longest recent run toward the race's
       target, and is never more than its share of the week
     - quality days are spaced out, away from the long run when possible
     - no run shorter than 2 miles (1.5 on very low weeks): a day that
       would be is left as rest instead
     - ultras get a back-to-back weekend run; brand-new runners run/walk
   Anything asked for that can't be done safely comes back as a plain
   warning for the coach ("Worth a look").
   Unit-tested in tests/planShape.test.mjs and swept across thousands of
   settings in tests/coachPlanGenerator.test.mjs.
========================================== */

import { addDays, mondayOf } from "./coachingPlanModel.js";

const CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const RACE_INFO = {
    "5K": { label: "5K", miles: 3.1, minWeeks: 6, longTarget: 8, taper: 1, peakWeeks: 1, minPeak: 18 },
    "10K": { label: "10K", miles: 6.2, minWeeks: 8, longTarget: 10, taper: 1, peakWeeks: 1, minPeak: 22 },
    HALF: { label: "half marathon", miles: 13.1, minWeeks: 10, longTarget: 13, taper: 2, peakWeeks: 1, minPeak: 28 },
    MARATHON: { label: "marathon", miles: 26.2, minWeeks: 16, longTarget: 20, taper: 3, peakWeeks: 2, minPeak: 38 },
    "50K": { label: "50K", miles: 31.1, minWeeks: 16, longTarget: 22, taper: 3, peakWeeks: 2, minPeak: 42, backToBack: true },
    "50_MILE": { label: "50 mile", miles: 50, minWeeks: 18, longTarget: 26, taper: 3, peakWeeks: 2, minPeak: 48, backToBack: true }
};
const RATE = { NEW: 0.07, RECREATIONAL: 0.08, INTERMEDIATE: 0.1, ADVANCED: 0.1 };
const LONG_STEP = { "5K": 1, "10K": 1, HALF: 1, MARATHON: 1.5, "50K": 2, "50_MILE": 2 };
const SHARE = { 1: 1, 2: 0.6, 3: 0.5, 4: 0.45, 5: 0.42, 6: 0.38, 7: 0.35 };
const TAPER = { 1: [0.55], 2: [0.75, 0.5], 3: [0.8, 0.65, 0.45] };
const TAPER_LONG = { 1: [0], 2: [0.7, 0], 3: [0.75, 0.6, 0] };
const EASY_CAP = 12;

const roundHalf = n => Math.max(0, Math.round(n * 2) / 2);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const circ = (a, b) => { const d = Math.abs(CODES.indexOf(a) - CODES.indexOf(b)); return Math.min(d, 7 - d); };

/** Monday-Sunday weeks from the start's Monday to the race / end date. */
export function planWeeks(s) {
    const last = s.mode === "race" ? s.raceDate : s.endDate;
    const weeks = [];
    for (let monday = mondayOf(s.startDate); monday <= last; monday = addDays(monday, 7)) {
        const days = [];
        for (let i = 0; i < 7 && addDays(monday, i) <= last; i++) days.push({ date: addDays(monday, i), day: CODES[i] });
        weeks.push({ startDate: monday, days });
    }
    return weeks;
}

/** Each week's phase and whether it's a cutback week. */
export function planPhases(s, count) {
    const out = [];
    if (s.mode === "race") {
        const info = RACE_INFO[s.raceType] || RACE_INFO.HALF;
        const taper = clamp(Math.round(count / 6), 1, info.taper);
        const peak = count - taper >= 6 ? info.peakWeeks : count - taper >= 3 ? 1 : 0;
        const build = Math.max(0, count - taper - peak);
        const foundation = count >= 12 ? Math.max(1, Math.round(build * 0.2)) : 0;
        const specific = build - foundation >= 4 ? Math.round((build - foundation) * 0.35) : 0;
        const names = [
            ...Array(foundation).fill("Foundation"), ...Array(build - foundation - specific).fill("Build"),
            ...Array(specific).fill("Race Specific"), ...Array(peak).fill("Peak"), ...Array(taper).fill("Taper")
        ];
        // Three weeks up, one down, through the build (not the week before the peak).
        names.forEach((phase, i) => {
            const cutback = i < build && i % 4 === 3 && i !== build - 1;
            out.push({ phase, cutback, taperIndex: phase === "Taper" ? i - (count - taper) : -1, taperWeeks: taper });
        });
        return out;
    }
    for (let i = 0; i < count; i++) out.push({ phase: "Build", cutback: i % 4 === 3 && i !== count - 1, taperIndex: -1, taperWeeks: 0 });
    return out;
}

// a beats b, comparing left to right.
const better = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k]; return false; };

// Best-spaced `count` days from `pool`: quality days never side by side,
// as far from the long run as the week allows. [] if they can't be spaced.
function spacedDays(pool, count, longCode, strict = true) {
    if (count <= 0) return [];
    let best = null;
    const walk = (from, chosen) => {
        if (chosen.length === count) {
            const gaps = [];
            for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) gaps.push(circ(chosen[i], chosen[j]));
            if (gaps.some(g => g < 2)) return;
            const toLong = longCode ? Math.min(...chosen.map(c => circ(c, longCode))) : 7;
            if (strict && toLong < 2) return;
            const score = [Math.min(toLong, 2), Math.min(7, ...gaps), toLong, -chosen.reduce((t, c) => t + CODES.indexOf(c), 0)];
            if (!best || better(score, best.score)) best = { chosen: [...chosen], score };
            return;
        }
        for (let i = from; i < pool.length; i++) walk(i + 1, [...chosen, pool[i]]);
    };
    walk(0, []);
    return best ? best.chosen : spacedDays(pool, count - 1, longCode, strict);
}

// The day-by-day spread of one week's miles.
function layoutWeek({ week, total, long, quality, s, raceWeek, backToBack, lowWeek }) {
    const race = raceWeek ? s.raceDate : null;
    const open = week.days.filter(d => d.date >= s.startDate && (!race || d.date < race) && s.runDays.includes(d.day)).map(d => d.day);
    const out = {};
    for (const d of week.days) out[d.day] = { type: "rest", miles: 0 };
    if (race) {
        const raceDay = week.days.find(d => d.date === race);
        if (raceDay) out[raceDay.day] = { type: "race", miles: (RACE_INFO[s.raceType] || RACE_INFO.HALF).miles };
    }
    const MIN = lowWeek ? 1.5 : 2;
    if (!open.length || total < MIN) return { days: out, short: 0 };
    const raceCode = race ? week.days.find(d => d.date === race)?.day : null;
    const dayBefore = raceCode && raceCode !== "MON" ? CODES[CODES.indexOf(raceCode) - 1] : null;

    // How many runs the week can hold: the long run first, the rest spread out.
    let longCode = !race && open.includes(s.longRunDay) ? s.longRunDay : null;
    // About 3.5 miles a run: a low week has fewer, not tinier, runs.
    const usable = clamp(Math.round(total / 3.5), Math.min(2, open.length), Math.min(open.length, Math.floor(total / MIN)));
    const runs = longCode ? [longCode] : [];
    while (runs.length < usable) {
        const next = open.filter(c => !runs.includes(c))
            .map(c => ({ c, near: runs.length ? Math.min(...runs.map(x => circ(c, x))) : 7, last: c === dayBefore ? 1 : 0 }))
            .sort((a, b) => a.last - b.last || b.near - a.near || CODES.indexOf(a.c) - CODES.indexOf(b.c))[0];
        runs.push(next.c);
    }
    runs.sort((a, b) => CODES.indexOf(a) - CODES.indexOf(b));

    // What these runs can actually hold (easy runs top out at 12 mi, quality at 10):
    // the long run and the rest are sized against that, not an impossible target.
    const qWanted = Math.min(quality, total >= 30 ? 3 : total >= 20 ? 2 : total >= 12 ? 1 : 0, runs.length >= 3 ? runs.length - 2 : runs.length - 1);
    const planned = longCode ? Math.min(long, total - MIN * (runs.length - 1)) : 0;
    const holds = planned + Math.max(0, qWanted) * 10 + (runs.length - (longCode ? 1 : 0) - Math.max(0, qWanted)) * Math.min(EASY_CAP, planned ? Math.max(MIN, planned * 0.85) : EASY_CAP);
    const holdable = Math.min(total, holds);
    const share = Math.min(0.6, (SHARE[runs.length] || 0.35) + (s.mode === "race" && ["MARATHON", "50K", "50_MILE"].includes(s.raceType) ? 0.05 : 0));
    let longMiles = longCode ? Math.min(planned, runs.length >= 3 ? holdable * share : planned) : 0;
    if (longCode && longMiles < MIN) { longCode = null; longMiles = 0; }

    // Quality days: only with enough miles, never side by side.
    const qPool = runs.filter(c => c !== longCode && c !== dayBefore);
    // The day before the long run only when there's no other day for it.
    let qCodes = spacedDays(qPool, Math.max(0, qWanted), longCode);
    if (!qCodes.length && qWanted > 0 && runs.length <= 2) qCodes = spacedDays(qPool, 1, longCode, false);
    const qMiles = clamp(roundHalf(holdable * 0.15), 3, Math.max(3, Math.min(10, longMiles ? longMiles * 0.6 : 10)));
    while (qCodes.length && holdable - longMiles - qCodes.length * qMiles < MIN * (runs.length - (longCode ? 1 : 0) - qCodes.length)) qCodes = qCodes.slice(0, -1);

    // Easy days share the rest (capped, so an easy run is never close to the long run).
    const easy = runs.filter(c => c !== longCode && !qCodes.includes(c));
    let budget = total - longMiles - qCodes.length * qMiles;
    // No easy day to take the rest: the week simply comes in lower (never a bigger long run).
    const cap = Math.max(MIN, Math.min(EASY_CAP, longMiles ? longMiles * 0.85 : EASY_CAP));
    const per = easy.length ? Math.min(cap, budget / easy.length) : 0;
    const short = Math.max(0, budget - per * easy.length);

    if (longCode) out[longCode] = { type: "long", miles: longMiles };
    for (const c of qCodes) out[c] = { type: "workout", miles: qMiles };
    for (const c of easy) out[c] = { type: "easy", miles: per };
    // Ultras: a back-to-back day next to the long run.
    if (backToBack && longCode) {
        const next = [CODES[(CODES.indexOf(longCode) + 6) % 7], CODES[(CODES.indexOf(longCode) + 1) % 7]].find(c => easy.includes(c) && out[c].type === "easy");
        if (next && easy.length > 1) {
            const want = Math.min(roundHalf(longMiles * 0.5), cap + 4);
            const donors = easy.filter(c => c !== next);
            const room = donors.reduce((t, c) => t + Math.max(0, out[c].miles - MIN), 0);
            const moved = Math.min(Math.max(0, want - out[next].miles), room);
            for (const c of donors) out[c].miles -= room ? moved * Math.max(0, out[c].miles - MIN) / room : 0;
            out[next].miles += moved;
            out[next].note = "back-to-back";
        }
    }
    // Day after the long run: recovery (5+ runs).
    if (longCode && runs.length >= 5) {
        const after = CODES[(CODES.indexOf(longCode) + 1) % 7];
        if (easy.includes(after) && easy.length > 1 && out[after].note !== "back-to-back") {
            const rec = Math.max(MIN, per * 0.75);
            const extra = (per - rec) / (easy.length - 1);
            for (const c of easy) out[c].miles = c === after ? rec : Math.min(cap, per + extra);
            out[after].type = "recovery";
        }
    }
    if (dayBefore && out[dayBefore]?.type === "easy") { out[dayBefore].miles = Math.min(out[dayBefore].miles, 3); out[dayBefore].note = "shakeout"; }

    // Half miles, and the week still adds up.
    const running = Object.keys(out).filter(c => ["easy", "recovery", "long", "workout"].includes(out[c].type));
    for (const c of running) out[c].miles = Math.max(MIN, roundHalf(out[c].miles));
    const target = roundHalf(total - short);
    const diff = roundHalf(target - running.reduce((t, c) => t + out[c].miles, 0));
    const fixer = easy.filter(c => out[c].type === "easy" && out[c].note !== "shakeout").sort((a, b) => out[b].miles - out[a].miles)[0] || longCode;
    if (fixer && diff) out[fixer].miles = Math.max(MIN, roundHalf(out[fixer].miles + diff));
    return { days: out, short: roundHalf(short) };
}

/**
 * The whole plan's shape.
 * -> { weeks: [{ startDate, phase, cutback, days: [{ date, day, type, miles, note? }] }], warnings: [] }
 */
export function shapePlan(s) {
    const weeks = planWeeks(s);
    const phases = planPhases(s, weeks.length);
    const race = s.mode === "race" ? RACE_INFO[s.raceType] || RACE_INFO.HALF : null;
    const runDays = s.runDays.length;
    const base = Number(s.currentMiles) > 0 ? Number(s.currentMiles) : Math.max(6, runDays * 2);
    const peak = Math.max(3, Number(s.peakMiles) || 0);
    const start = Math.min(base, peak);
    const rate = RATE[s.experience] || RATE.RECREATIONAL;
    const longTarget = race ? race.longTarget : clamp(Math.round(peak * 0.3), 4, 16);
    const longest = Math.max(2, Number(s.longestRun) || 0, Math.min(Math.round(base * 0.25), 12));
    const longStep = race ? LONG_STEP[s.raceType] || 1 : 1;
    const warnings = [];

    // Weekly totals and long runs before tapering.
    let level = start, long = Math.min(longest, longTarget), reached = start, longReached = long;
    const plan = phases.map((p, i) => {
        if (p.taperIndex >= 0) return { ...p };
        if (i > 0 && !p.cutback) {
            level = Math.min(peak, level + clamp(level * rate, 1, 4));
            long = Math.min(longTarget, long + longStep);
        }
        const total = p.cutback ? level * 0.8 : level;
        const lr = p.cutback ? long * 0.75 : long;
        reached = Math.max(reached, level);
        longReached = Math.max(longReached, long);
        return { ...p, total, long: lr, phase: s.mode === "training" ? (p.cutback ? "Cutback" : level >= peak ? "Maintain" : "Build") : p.phase };
    });

    let shortest = 0, maxLong = 0, actualPeak = 0, actualLong = 0;
    const recent = [];   // full build weeks' real miles, newest last
    const lay = (w, i) => {
        const p = plan[i];
        const raceWeek = race && i === weeks.length - 1;
        // A partial week (starting mid-week, or the days before a mid-week race) gets its share.
        const open = w.days.filter(d => d.date >= s.startDate && (!raceWeek || d.date < s.raceDate) && s.runDays.includes(d.day)).length;
        const slots = raceWeek ? Math.max(1, runDays - (s.runDays.includes(w.days.at(-1).day) ? 1 : 0)) : runDays;
        let total = p.total * Math.min(1, open / slots);
        // Never more than ~15% (or 4 miles) over the last two full weeks as laid out.
        const lastTwo = Math.max(0, ...recent.slice(-2));
        if (lastTwo && p.taperIndex < 0 && !p.cutback) total = Math.min(total, Math.max(lastTwo * 1.15, lastTwo + 4));
        const quality = raceWeek ? 0
            : p.phase === "Taper" ? Math.min(1, s.speedDays)
            : p.phase === "Foundation" && s.experience === "NEW" ? Math.min(1, s.speedDays)
            : s.speedDays;
        const { days, short } = layoutWeek({
            week: w, total, long: p.long, quality, s, raceWeek,
            backToBack: race?.backToBack && ["Build", "Race Specific", "Peak"].includes(p.phase) && !p.cutback,
            lowWeek: total < 12
        });
        const runMiles = Object.values(days).reduce((t, d) => t + (d.type === "race" ? 0 : d.miles), 0);
        const longest = Math.max(0, ...Object.values(days).filter(d => d.type === "long").map(d => d.miles));
        if (open === slots) shortest = Math.max(shortest, short);
        if (open === slots && p.taperIndex < 0) { actualPeak = Math.max(actualPeak, runMiles); recent.push(runMiles); }
        if (p.taperIndex < 0) actualLong = Math.max(actualLong, longest);
        maxLong = Math.max(maxLong, longest);
        return {
            startDate: w.startDate, phase: p.phase, cutback: Boolean(p.cutback),
            days: w.days.map(d => ({ date: d.date, day: d.day, ...days[d.day] }))
        };
    };
    // Build weeks first; the taper then comes down from what the plan really reached.
    const out = weeks.map((w, i) => (plan[i].taperIndex < 0 ? lay(w, i) : null));
    const topWeek = actualPeak || reached, topLong = actualLong || longReached;
    for (let i = 0; i < weeks.length; i++) {
        const p = plan[i];
        if (p.taperIndex < 0) continue;
        p.total = topWeek * TAPER[p.taperWeeks][p.taperIndex];
        p.long = topLong * TAPER_LONG[p.taperWeeks][p.taperIndex];
        out[i] = lay(weeks[i], i);
    }

    const buildWeeks = plan.filter(p => p.taperIndex < 0).length;
    if (reached < peak - 1) warnings.push(`From ${Math.round(start)} miles a week, ${buildWeeks} week${buildWeeks === 1 ? "" : "s"} of building safely reaches about ${Math.round(reached)} a week, not the ${peak} you asked for. More weeks (or a lower peak) closes the gap.`);
    if (shortest >= 2) warnings.push(`${runDays} run days can't safely hold ${peak} miles a week (easy runs top out at ${EASY_CAP} miles), so some weeks come in up to ${shortest} miles short. More run days close the gap.`);
    if (race) {
        if (weeks.length < race.minWeeks) warnings.push(`A ${race.label} plan usually takes ${race.minWeeks}+ weeks; this one has ${weeks.length}, so it builds and tapers quickly.`);
        if (peak < race.minPeak) warnings.push(`A ${race.label} plan usually peaks around ${race.minPeak}+ miles a week; this one follows your ${peak}.`);
        if (race.miles >= 13 && maxLong < race.longTarget - 1) warnings.push(`The longest run reaches ${maxLong} miles; ${race.label} runners usually build to about ${race.longTarget}. More weekly miles, run days or weeks would allow it.`);
    }
    if (s.experience === "NEW" && base <= 10) warnings.push("New runner on low miles: easy days are run/walk to start. Walk breaks are part of the plan.");
    return { weeks: out, warnings };
}
