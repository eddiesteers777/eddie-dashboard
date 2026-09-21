/* ==========================================
   EddieOS Training Plans — Generator

   Turns a saved Training Plan draft (goal, dates, weekly
   structure, workload ranges) into a week-by-week schedule
   in the same shape Race Plans already use, so the existing
   Running/Strength calendars can render it without changes:
   generatedPlan.weeks[].days[] for runs, .supplemental[] for
   lift/cross sessions.

   Unlike Race Plans there is no fixed race day to build
   toward, so there is no taper/peak model here -- just a
   progressive Build phase toward the target mileage (which
   can be a step DOWN, e.g. a post-marathon strength block),
   a Maintain phase once there, and a periodic Cutback week
   for recovery.
========================================== */

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const RUN_PREFERENCE = ["MON", "WED", "FRI", "TUE", "THU", "SAT", "SUN"];
const SUPPORT_PREFERENCE = ["TUE", "THU", "MON", "FRI", "SAT", "WED", "SUN"];

function roundHalf(value) {
    return Math.max(0, Math.round(value * 2) / 2);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function clampInt(value, min, max) {
    return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

function parseLocalDate(value) {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(date, n) {
    const next = new Date(date);
    next.setDate(next.getDate() + n);
    return next;
}

function dateDiffDays(start, end) {
    return Math.round((end - start) / 86400000);
}

function weekdayCode(date) {
    return ALL_DAYS[(date.getDay() + 6) % 7];
}

function formatMilesValue(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function resolveLongDay(available, requested) {
    if (available.includes(requested)) return requested;
    if (available.includes("SAT")) return "SAT";
    return available[available.length - 1] || null;
}

function pickRunDays(available, count, longDay) {
    if (count <= 0) return [];
    const set = new Set();
    if (longDay && available.includes(longDay)) set.add(longDay);
    for (const day of RUN_PREFERENCE) {
        if (set.size >= count) break;
        if (available.includes(day)) set.add(day);
    }
    return ALL_DAYS.filter(day => set.has(day));
}

function pickQualityDays(runDays, longDay, count) {
    const eligible = runDays.filter(day => day !== longDay);
    if (!eligible.length || count <= 0) return [];
    return eligible.slice(0, Math.min(count, eligible.length));
}

function placeSupportDays({ count, occupied, avoidDoubleOn, available, allowDoubles, doublesRemaining }) {
    const placed = [];
    if (count <= 0) return { placed, doublesUsed: 0, dropped: 0 };

    const free = SUPPORT_PREFERENCE.filter(day => available.includes(day) && !occupied.has(day));
    for (const day of free) {
        if (placed.length >= count) break;
        placed.push({ day, isDouble: false });
    }

    let doublesUsed = 0;
    if (placed.length < count && allowDoubles && doublesRemaining > 0) {
        const doubleCandidates = SUPPORT_PREFERENCE.filter(day =>
            available.includes(day) && occupied.has(day) && !avoidDoubleOn.has(day)
        );
        for (const day of doubleCandidates) {
            if (placed.length >= count || doublesUsed >= doublesRemaining) break;
            placed.push({ day, isDouble: true });
            doublesUsed += 1;
        }
    }

    return { placed, doublesUsed, dropped: count - placed.length };
}

function buildWeeklyMileage(settings, weekNumber, totalWeeks, transitionWeeks, previousMileage) {
    const current = Math.max(0, Number(settings.currentMiles) || 0);
    const target = Math.max(0, Number(settings.targetMiles) || current);
    const ceiling = Math.max(current, target, Number(settings.maxMiles) || 0);
    const isCutback = weekNumber > 1 && weekNumber % 4 === 0 && weekNumber < totalWeeks;

    let value;
    if (weekNumber <= transitionWeeks) {
        const progress = transitionWeeks === 1 ? 1 : (weekNumber - 1) / (transitionWeeks - 1);
        value = current + (target - current) * progress;
    } else {
        value = target;
    }

    if (isCutback) {
        const base = previousMileage || value;
        value = Math.min(value, base * 0.85);
    }

    return roundHalf(clamp(value, 0, ceiling));
}

function buildLongRunMileage(settings, weekNumber, totalWeeks) {
    const longMin = Math.max(0, Number(settings.longMin) || 0);
    const longMax = Math.max(longMin, Number(settings.longMax) || longMin);
    if (longMax <= longMin) return longMin;

    const transitionWeeks = Math.max(1, Math.min(totalWeeks, Math.ceil(totalWeeks * 0.6)));
    const progress = weekNumber >= transitionWeeks
        ? 1
        : (transitionWeeks === 1 ? 1 : (weekNumber - 1) / (transitionWeeks - 1));

    return roundHalf(longMin + (longMax - longMin) * progress);
}

function allocateMileage(runDays, longDay, qualityDays, weeklyMileage, longMiles) {
    const result = Object.fromEntries(runDays.map(day => [day, 0]));
    if (!runDays.length) return result;

    result[longDay] = Math.min(longMiles, weeklyMileage);
    const remainingDays = runDays.filter(day => day !== longDay);
    const remaining = Math.max(0, weeklyMileage - result[longDay]);
    if (!remainingDays.length) return result;

    const qualitySet = new Set(qualityDays);
    const weights = remainingDays.map(day => qualitySet.has(day) ? 1.15 : 0.9);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;

    remainingDays.forEach((day, index) => {
        result[day] = roundHalf(remaining * (weights[index] / weightTotal));
    });

    return result;
}

function phaseForWeek(weekNumber, transitionWeeks, isCutback) {
    if (isCutback) return "Cutback";
    if (weekNumber <= transitionWeeks) return "Build";
    return "Maintain";
}

function buildTrainingWeek({ settings, weekNumber, totalWeeks, transitionWeeks, planEnd, dayPlan }) {
    const { runDays, longDay, qualityDays, liftPlacements, crossPlacements } = dayPlan;
    const isCutback = weekNumber > 1 && weekNumber % 4 === 0 && weekNumber < totalWeeks;
    const weeklyMileage = buildWeeklyMileage(settings, weekNumber, totalWeeks, transitionWeeks, dayPlan.previousMileage);
    const longMiles = runDays.length ? buildLongRunMileage(settings, weekNumber, totalWeeks) : 0;
    const allocation = allocateMileage(runDays, longDay, qualityDays, weeklyMileage, longMiles);
    const phase = phaseForWeek(weekNumber, transitionWeeks, isCutback);

    const start = parseLocalDate(settings.startDate);
    const weekStart = addDays(start, (weekNumber - 1) * 7);
    let weekEnd = addDays(weekStart, 6);
    if (weekEnd > planEnd) weekEnd = planEnd;

    const days = [];
    for (let offset = 0; offset <= dateDiffDays(weekStart, weekEnd); offset++) {
        const date = addDays(weekStart, offset);
        const code = weekdayCode(date);
        const dateStr = isoDate(date);

        if (!runDays.includes(code)) {
            days.push({ date: dateStr, day: code, type: "rest", miles: 0, session: "Rest", phase });
            continue;
        }

        const isLong = code === longDay;
        const isQuality = qualityDays.includes(code);
        const type = isLong ? "long" : isQuality ? "workout" : "easy";
        const miles = isLong ? Math.min(longMiles, weeklyMileage) : allocation[code];
        const label = isLong ? "Long Run" : isQuality ? "Quality Run" : "Easy Run";

        days.push({ date: dateStr, day: code, type, miles, session: `${label} — ${formatMilesValue(miles)} mi`, phase });
    }

    const supplemental = [
        ...liftPlacements.map(placement => ({
            day: placement.day,
            type: "strength",
            session: placement.isDouble ? "Strength — Light" : "Strength",
            miles: 0,
            strengthIntensity: placement.isDouble || placement.day === longDay ? "light" : "support"
        })),
        ...crossPlacements.map(placement => ({
            day: placement.day,
            type: "cross",
            session: "Cross Training",
            miles: 0
        }))
    ];

    const plannedMiles = roundHalf(days.reduce((sum, day) => sum + (Number(day.miles) || 0), 0));

    return {
        week: weekNumber,
        phase,
        startDate: isoDate(weekStart),
        endDate: isoDate(weekEnd),
        plannedMiles,
        runDays: runDays.length,
        longRunMiles: longMiles,
        days,
        supplemental
    };
}

function ensureTrainingSettings(settings) {
    if (!settings?.primaryGoal) throw new Error("Choose a primary training goal before generating a plan.");
    const start = parseLocalDate(settings.startDate);
    const end = parseLocalDate(settings.endDate);
    if (!start || !end || end <= start) throw new Error("Choose a valid training start and end date before generating a plan.");
    return { start, end };
}

export function generateTrainingPlan(settings) {
    const { start, end } = ensureTrainingSettings(settings);
    const totalDays = dateDiffDays(start, end);
    const totalWeeks = Math.max(1, Math.ceil((totalDays + 1) / 7));
    const warnings = [];

    const restDays = new Set(settings.sundayRest ? ["SUN"] : []);
    const available = ALL_DAYS.filter(day => !restDays.has(day));

    const runCount = clampInt(settings.runDays, 0, available.length);
    const longDay = runCount > 0 ? resolveLongDay(available, settings.longRunDay) : null;
    const runDays = pickRunDays(available, runCount, longDay);
    const qualityDays = pickQualityDays(runDays, longDay, clampInt(settings.speedDays, 0, runDays.length));

    const occupied = new Set(runDays);
    const avoidDoubleOn = new Set([longDay, ...qualityDays].filter(Boolean));
    const allowDoubles = Boolean(settings.allowDoubles);
    const maxDoubles = Math.max(0, Number(settings.maxDoubles) || 0);
    let doublesUsed = 0;

    const liftResult = placeSupportDays({
        count: clampInt(settings.liftDays, 0, 14),
        occupied,
        avoidDoubleOn,
        available,
        allowDoubles,
        doublesRemaining: maxDoubles - doublesUsed
    });
    doublesUsed += liftResult.doublesUsed;
    liftResult.placed.forEach(placement => occupied.add(placement.day));

    const crossResult = placeSupportDays({
        count: clampInt(settings.crossDays, 0, 14),
        occupied,
        avoidDoubleOn,
        available,
        allowDoubles,
        doublesRemaining: maxDoubles - doublesUsed
    });
    crossResult.placed.forEach(placement => occupied.add(placement.day));

    const requestedLiftDays = clampInt(settings.liftDays, 0, 14);
    const requestedCrossDays = clampInt(settings.crossDays, 0, 14);
    if (liftResult.dropped > 0) {
        warnings.push(`Only ${liftResult.placed.length} of the requested ${requestedLiftDays} weekly lift session${requestedLiftDays === 1 ? "" : "s"} fit the available days${allowDoubles ? " within your doubles limit" : " (doubles are off)"}; the rest were left unscheduled.`);
    }
    if (crossResult.dropped > 0) {
        warnings.push(`Only ${crossResult.placed.length} of the requested ${requestedCrossDays} weekly cross-training session${requestedCrossDays === 1 ? "" : "s"} fit the available days${allowDoubles ? " within your doubles limit" : " (doubles are off)"}; the rest were left unscheduled.`);
    }
    if (runCount > 0 && !runDays.length) {
        warnings.push("No days were available for running once Sunday rest was applied; check your weekly structure.");
    }

    const transitionWeeks = Math.max(1, Math.min(totalWeeks, Math.ceil(totalWeeks * 0.5)));

    const weeks = [];
    let previousMileage = Number(settings.currentMiles) || 0;
    for (let week = 1; week <= totalWeeks; week++) {
        const generated = buildTrainingWeek({
            settings,
            weekNumber: week,
            totalWeeks,
            transitionWeeks,
            planEnd: end,
            dayPlan: { runDays, longDay, qualityDays, liftPlacements: liftResult.placed, crossPlacements: crossResult.placed, previousMileage }
        });
        previousMileage = generated.plannedMiles;
        weeks.push(generated);
    }

    const peakGenerated = Math.max(0, ...weeks.map(week => week.plannedMiles));
    const longestGenerated = Math.max(0, ...weeks.flatMap(week => week.days.map(day => Number(day.miles) || 0)));

    const generatedPlan = {
        version: 1,
        generatedAt: new Date().toISOString(),
        kind: "training",
        trainingStartDate: isoDate(start),
        raceDate: isoDate(end),
        totalWeeks,
        primaryGoal: settings.primaryGoal,
        secondaryGoals: Array.isArray(settings.secondaryGoals) ? settings.secondaryGoals : [],
        runDaysPerWeek: runDays.length,
        liftDaysPerWeek: liftResult.placed.length,
        crossDaysPerWeek: crossResult.placed.length,
        speedDaysPerWeek: qualityDays.length,
        currentMiles: Number(settings.currentMiles) || 0,
        targetMiles: Number(settings.targetMiles) || 0,
        maxMiles: Number(settings.maxMiles) || 0,
        generatedPeakMileage: roundHalf(peakGenerated),
        longestPlannedRun: roundHalf(longestGenerated),
        weeks,
        warnings
    };

    return { generatedPlan, warnings };
}

export default { generateTrainingPlan };
