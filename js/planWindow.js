/* ==========================================
   Southbound — what a client sees of a coach plan (pure)

   The coach keeps the whole plan (coachingPlanMasters, coach only).
   The client gets this week and next: every plan week up to the one
   after the week holding today. Each week the coach's app opens the
   next one by itself (js/planRelease.js), so nothing is "set in
   stone" for the client and later weeks stay free to change.

     releaseThrough(plan, today)   last date the client should see
     windowPlan(plan, through)     the plan as the client gets it
     visibleChanges(changes, through)  change list without later weeks
     noticeVersionOf(header)       newest version worth telling them about
     releaseDue(header, plan, today)   new "through" date, or null
     opensOn(plan, i) / weekHidden(plan, i, through)   for the coach's editor

   A plan the coach chose to show whole has header.showAll; plans
   published before this existed have no releasedThrough and stay whole.
   Unit-tested in tests/planWindow.test.mjs.
========================================== */

import { addDays, planDateRange, recalcPlannedMiles } from "./coachingPlanModel.js";

const clone = value => JSON.parse(JSON.stringify(value));
const datesOf = week => (week?.days || []).map(d => d?.date).filter(Boolean).sort();

// Weeks that have days, in date order.
function datedWeeks(plan) {
    return (plan?.weeks || []).filter(w => datesOf(w).length)
        .sort((a, b) => datesOf(a)[0].localeCompare(datesOf(b)[0]));
}

/** The last date the client sees on `today`: the end of the week after the one holding today. */
export function releaseThrough(plan, today) {
    const weeks = datedWeeks(plan);
    if (!weeks.length) return null;
    let current = weeks.findIndex(w => datesOf(w).at(-1) >= today);
    if (current < 0) current = weeks.length - 1;
    return datesOf(weeks[Math.min(weeks.length - 1, current + 1)]).at(-1);
}

/**
 * The plan as the client gets it: weeks through `through` (null = all),
 * without the coach's generator notes. A cut plan carries
 * window = { through, totalWeeks, endDate } so the client can still say
 * "Week 3 of 16" and show the real end date.
 */
export function windowPlan(plan, through) {
    const out = clone(plan || { weeks: [] });
    delete out.generator;
    const { endDate } = planDateRange(out);
    delete out.window;
    if (!through || !endDate || through >= endDate) return out;
    const totalWeeks = datedWeeks(out).length;
    out.weeks = (out.weeks || [])
        .filter(w => datesOf(w).length && datesOf(w)[0] <= through)
        .map(w => ({ ...w, days: (w.days || []).filter(d => d?.date && d.date <= through) }));
    out.window = { through, totalWeeks, endDate };
    return recalcPlannedMiles(out);
}

/** diffPlans() entries the client can see (a move counts if either end is showing). */
export function visibleChanges(changes, through) {
    if (!through) return [...(changes || [])];
    return (changes || []).filter(c => c.date <= through || (c.from && c.from <= through));
}

/** The newest version the client should hear about (automatic week openings don't count). */
export function noticeVersionOf(header) {
    return Number(header?.noticeVersion) || Number(header?.version) || 0;
}

/** Still waiting on "Got it" for the newest real update. */
export function awaitingAck(header) {
    return header?.status === "active" && (header.ackVersion || 0) < noticeVersionOf(header);
}

/** Hasn't opened the newest real update yet. */
export function awaitingView(header) {
    return header?.status === "active" && (header.viewedVersion || 0) < noticeVersionOf(header);
}

/** A plan opened week by week (not shown whole, not an older plan). */
export function isRolling(header) {
    return Boolean(header) && header.showAll !== true && typeof header.releasedThrough === "string";
}

/** Cheap check before reading the coach's copy: could a week be due to open? */
export function mightNeedRelease(header, today) {
    return isRolling(header) && header.status === "active"
        && header.releasedThrough < (header.endDate || "") && header.releasedThrough < addDays(today, 13);
}

/** The new "through" date when the next week should open, else null. */
export function releaseDue(header, plan, today) {
    if (!isRolling(header) || header.status !== "active") return null;
    const target = releaseThrough(plan, today);
    return target && target > header.releasedThrough ? target : null;
}

/**
 * When week `index` of the plan opens for the client: the day after the
 * week two before it ends (a Mon-Sun plan: the Monday a week ahead).
 * null for the first two weeks, which they see from the start.
 */
export function opensOn(plan, index) {
    const weeks = plan?.weeks || [];
    if (index < 2 || !weeks[index - 2]) return null;
    const last = datesOf(weeks[index - 2]).at(-1);
    return last ? addDays(last, 1) : null;
}

/** Is week `index` past what the client sees (through null = they see it all)? */
export function weekHidden(plan, index, through) {
    const first = datesOf(plan?.weeks?.[index])[0];
    return Boolean(through && first && first > through);
}

/** The first date a client doesn't see yet (null when they see it all). */
export function firstHiddenDate(plan, through) {
    const { endDate } = planDateRange(plan);
    return through && endDate && through < endDate ? addDays(through, 1) : null;
}
