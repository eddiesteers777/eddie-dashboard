/* ==========================================
   EddieOS Running — Race Plan Modification

   Phase 5:
   - compare a regenerated plan against its current schedule
   - preserve completed/runtime state when the same workout remains
   - provide a compact, reviewable change summary

   This module contains no DOM or storage access so the core
   modification logic can be tested independently.
========================================== */

const RUNTIME_KEYS = [
    "completed",
    "completedAt",
    "actual",
    "actualDistance",
    "actualDuration",
    "actualPace",
    "actualTime",
    "notes",
    "source",
    "corosActivityId"
];

function clone(value) {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 1) {
    const factor = 10 ** digits;
    return Math.round(number(value) * factor) / factor;
}

function dayIdentity(day) {
    if (!day?.date || day.type === "rest") return "";
    return [day.date, day.type, round(day.miles, 1)].join("|");
}

function supplementalIdentity(weekStartDate, entry) {
    if (!entry?.day || !weekStartDate) return "";
    return [weekStartDate, entry.day, entry.type, entry.session || ""].join("|");
}

function flattenDays(plan) {
    return (plan?.weeks || []).flatMap(week =>
        (week.days || [])
            .filter(day => day?.type !== "rest")
            .map(day => ({ ...day, week: week.week, phase: week.phase }))
    );
}

function flattenSupplemental(plan) {
    return (plan?.weeks || []).flatMap(week =>
        (week.supplemental || []).map(entry => ({
            ...entry,
            week: week.week,
            phase: week.phase,
            weekStartDate: week.startDate
        }))
    );
}

function copyRuntimeState(previous, next) {
    if (!previous || !next) return next;
    for (const key of RUNTIME_KEYS) {
        if (Object.prototype.hasOwnProperty.call(previous, key)) {
            next[key] = clone(previous[key]);
        }
    }
    return next;
}

function findPreviousDay(previousDays, nextDay) {
    const identity = dayIdentity(nextDay);
    if (!identity) return null;
    return previousDays.find(day => dayIdentity(day) === identity) || null;
}

function findPreviousSupplemental(previousEntries, nextEntry, weekStartDate) {
    const identity = supplementalIdentity(weekStartDate, nextEntry);
    if (!identity) return null;
    return previousEntries.find(entry => supplementalIdentity(entry.weekStartDate, entry) === identity) || null;
}

/**
 * Preserve user/runtime state from the current generated schedule when
 * regeneration leaves the same date + workout type + mileage in place.
 * Schedule changes intentionally reset unmatched completion state.
 */
export function preserveRegeneratedRuntimeState(previousPlan, nextPlan) {
    if (!previousPlan || !nextPlan) return clone(nextPlan);

    const result = clone(nextPlan);
    const previousDays = flattenDays(previousPlan);
    const previousSupplemental = flattenSupplemental(previousPlan);

    for (const week of result.weeks || []) {
        week.days = (week.days || []).map(day => {
            if (day?.type === "rest") return day;
            const previous = findPreviousDay(previousDays, day);
            return previous ? copyRuntimeState(previous, day) : day;
        });

        week.supplemental = (week.supplemental || []).map(entry => {
            const previous = findPreviousSupplemental(previousSupplemental, entry, week.startDate);
            return previous ? copyRuntimeState(previous, entry) : entry;
        });
    }

    return result;
}

function weeklyMiles(plan) {
    return (plan?.weeks || []).map(week => number(week.plannedMiles));
}

function maxNumber(values) {
    return values.length ? Math.max(...values) : 0;
}

function planDayMap(plan) {
    return new Map(flattenDays(plan).map(day => [day.date, day]));
}

/**
 * Produce a compact, deterministic summary of how a regenerated plan differs
 * from the current schedule.
 */
export function compareGeneratedPlans(previousPlan, nextPlan) {
    const oldDays = planDayMap(previousPlan);
    const newDays = planDayMap(nextPlan);

    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];
    let preservedCompleted = 0;

    for (const [date, nextDay] of newDays.entries()) {
        const oldDay = oldDays.get(date);
        if (!oldDay) {
            added.push(nextDay);
            continue;
        }

        const same = oldDay.type === nextDay.type
            && round(oldDay.miles) === round(nextDay.miles)
            && String(oldDay.session || "") === String(nextDay.session || "");

        if (same) {
            unchanged.push(nextDay);
            // oldDay -- not nextDay -- carries the real completion
            // state at comparison time: this runs before
            // preserveRegeneratedRuntimeState copies it onto the
            // freshly generated day, so nextDay.completed is never
            // set yet.
            if (oldDay.completed) preservedCompleted++;
        } else {
            changed.push({ before: oldDay, after: nextDay });
        }
    }

    for (const [date, oldDay] of oldDays.entries()) {
        if (!newDays.has(date)) removed.push(oldDay);
    }

    const oldWeeks = weeklyMiles(previousPlan);
    const newWeeks = weeklyMiles(nextPlan);
    const weekCount = Math.max(oldWeeks.length, newWeeks.length);
    const weeklyChanges = [];

    for (let index = 0; index < weekCount; index += 1) {
        const before = number(oldWeeks[index]);
        const after = number(newWeeks[index]);
        if (round(before) !== round(after)) {
            weeklyChanges.push({
                week: index + 1,
                before: round(before),
                after: round(after),
                delta: round(after - before)
            });
        }
    }

    const oldTotal = round(number(previousPlan?.weeks?.reduce((sum, week) => sum + number(week.plannedMiles), 0)));
    const newTotal = round(number(nextPlan?.weeks?.reduce((sum, week) => sum + number(week.plannedMiles), 0)));

    const oldPeak = maxNumber(oldWeeks);
    const newPeak = maxNumber(newWeeks);
    const oldLongest = number(previousPlan?.longestPlannedRun);
    const newLongest = number(nextPlan?.longestPlannedRun);

    return {
        added,
        removed,
        changed,
        unchanged,
        weeklyChanges,
        preservedCompleted,
        totalBefore: oldTotal,
        totalAfter: newTotal,
        totalDelta: round(newTotal - oldTotal),
        peakBefore: round(oldPeak),
        peakAfter: round(newPeak),
        peakDelta: round(newPeak - oldPeak),
        longestBefore: round(oldLongest),
        longestAfter: round(newLongest),
        longestDelta: round(newLongest - oldLongest),
        datesChanged: previousPlan?.trainingStartDate !== nextPlan?.trainingStartDate
            || previousPlan?.raceDate !== nextPlan?.raceDate,
        startDateBefore: previousPlan?.trainingStartDate || "",
        startDateAfter: nextPlan?.trainingStartDate || "",
        raceDateBefore: previousPlan?.raceDate || "",
        raceDateAfter: nextPlan?.raceDate || ""
    };
}

export default {
    preserveRegeneratedRuntimeState,
    compareGeneratedPlans
};
