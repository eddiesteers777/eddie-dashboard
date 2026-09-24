/* ==========================================
   Southbound Training Plans — Generator

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
const CROSS_MODALITIES = ["Swim", "Bike", "Elliptical", "Row"];

// Each primary goal gets its own vocabulary of session names/details
// and lift focus + rep scheme, so the plan's character actually
// changes with what the person picked -- a Strength-primary plan
// reads as running-as-maintenance with heavy lifting, a Speed plan
// reads as sharp intervals with power-focused lifting, etc. A
// secondary goal blends a couple of its own options in rather than
// swapping the whole vocabulary, so it nudges the plan without
// overriding the primary goal's identity.
const GOAL_VOCABULARY = {
    STRENGTH: {
        easyRun: ["Easy Maintenance Run", "Recovery Jog", "Easy Aerobic Run"],
        quality: [
            { label: "Steady Tempo", detail: "20 min @ controlled effort" },
            { label: "Moderate Fartlek", detail: "6 × 2 min surge / 2 min easy" }
        ],
        longRun: ["Easy Long Run", "Steady Long Run"],
        lift: ["Strength — Heavy Lower", "Strength — Heavy Upper", "Strength — Full Body"],
        repScheme: "3–6 reps, heavy load, 2–4 min rest"
    },
    RUN_MAINTENANCE: {
        easyRun: ["Easy Aerobic Run", "Conversational Run", "Recovery Jog"],
        quality: [
            { label: "Steady State Run", detail: "20 min @ steady effort" },
            { label: "Light Fartlek", detail: "4 × 3 min pickup / 2 min easy" }
        ],
        longRun: ["Easy Long Run"],
        lift: ["Strength — Full Body Support", "Strength — Core & Stability"],
        repScheme: "8–12 reps, moderate load"
    },
    BASE_BUILD: {
        easyRun: ["Easy Aerobic Run", "Steady Aerobic Run", "Conversational Run"],
        quality: [
            { label: "Progression Run", detail: "last 10 min faster than steady" },
            { label: "Aerobic Fartlek", detail: "8 × 1 min pickup / 1 min easy" },
            { label: "Hill Strides", detail: "6 × 20 sec hill strides" }
        ],
        longRun: ["Aerobic Long Run", "Progression Long Run"],
        lift: ["Strength — General Prep", "Strength — Full Body"],
        repScheme: "8–10 reps, moderate load"
    },
    SPEED: {
        easyRun: ["Easy Recovery Run", "Easy Aerobic Run"],
        quality: [
            { label: "Interval Repeats", detail: "6 × 400m @ fast effort" },
            { label: "Tempo Run", detail: "20 min @ threshold effort" },
            { label: "Hill Sprints", detail: "8 × 15 sec hill sprints" },
            { label: "Speed Fartlek", detail: "10 × 30 sec fast / 90 sec easy" }
        ],
        longRun: ["Easy Long Run", "Progression Long Run"],
        lift: ["Strength — Power & Speed", "Strength — Plyometric Prep"],
        repScheme: "3–5 reps @ speed, full recovery between sets"
    },
    RUN_STRENGTH: {
        easyRun: ["Easy Aerobic Run", "Hilly Easy Run"],
        quality: [
            { label: "Hill Repeats", detail: "8 × 45 sec uphill @ strong effort" },
            { label: "Tempo Run", detail: "20 min @ controlled threshold" }
        ],
        longRun: ["Hilly Long Run", "Steady Long Run"],
        lift: ["Strength — Running-Specific Lower", "Strength — Posterior Chain", "Strength — Single-Leg Stability"],
        repScheme: "5–8 reps, moderate-heavy load"
    },
    VERTICAL_POWER: {
        easyRun: ["Easy Aerobic Run"],
        quality: [
            { label: "Hill Sprints", detail: "6 × 10 sec max-effort hill sprints" },
            { label: "Bounding Intervals", detail: "5 × 30 sec bounding + easy jog" }
        ],
        longRun: ["Easy Long Run"],
        lift: ["Strength — Explosive Lower", "Strength — Plyometrics", "Strength — Olympic-Style Power"],
        repScheme: "3–5 reps, explosive intent, full recovery between sets"
    },
    HYPERTROPHY: {
        easyRun: ["Easy Aerobic Run", "Recovery Jog"],
        quality: [
            { label: "Steady Tempo", detail: "20 min @ controlled effort" }
        ],
        longRun: ["Easy Long Run"],
        lift: ["Strength — Hypertrophy Upper", "Strength — Hypertrophy Lower", "Strength — Hypertrophy Full Body"],
        repScheme: "8–12 reps, moderate load, 60–90 sec rest"
    },
    ATHLETIC: {
        easyRun: ["Easy Aerobic Run"],
        quality: [
            { label: "Interval Repeats", detail: "5 × 400m @ fast effort" },
            { label: "Hill Repeats", detail: "6 × 30 sec hill repeats" },
            { label: "Tempo Run", detail: "20 min @ threshold effort" }
        ],
        longRun: ["Easy Long Run", "Progression Long Run"],
        lift: ["Strength — Power", "Strength — Full Body Athletic", "Strength — Core & Stability"],
        repScheme: "Varied: 3–6 reps power work, 8–12 reps accessory work"
    }
};

// Secondary-goal checkboxes use their own short vocabulary (see
// programs.html) rather than the primary-goal enum; map the ones
// that meaningfully change session character onto a donor profile.
// MOBILITY and FITNESS are handled as light flavor text instead.
const SECONDARY_VOCABULARY = {
    SPEED: GOAL_VOCABULARY.SPEED,
    POWER: GOAL_VOCABULARY.VERTICAL_POWER,
    HYPERTROPHY: GOAL_VOCABULARY.HYPERTROPHY,
    RUNNING: GOAL_VOCABULARY.RUN_MAINTENANCE
};

function hashSeed(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

// A tiny deterministic PRNG (mulberry32), seeded from the plan's own
// settings: identical settings always regenerate the identical plan
// (predictable -- re-activating without changes doesn't reshuffle
// anything), but changing any input reshuffles which vocabulary
// options get used, so plans don't all read like the same template.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function createRng(settings) {
    const seedText = [
        settings.primaryGoal, settings.name, settings.startDate, settings.endDate,
        settings.runDays, settings.liftDays, settings.crossDays, settings.longRunDay,
        settings.currentMiles, settings.targetMiles, settings.maxMiles,
        settings.longMin, settings.longMax, settings.speedDays,
        (Array.isArray(settings.secondaryGoals) ? settings.secondaryGoals : []).join(",")
    ].join("|");
    return mulberry32(hashSeed(seedText));
}

function pickFrom(rng, list, fallback) {
    if (!Array.isArray(list) || !list.length) return fallback;
    return list[Math.floor(rng() * list.length) % list.length];
}

function buildVocabulary(settings) {
    const primary = GOAL_VOCABULARY[settings.primaryGoal] || GOAL_VOCABULARY.BASE_BUILD;
    const secondaryCodes = Array.isArray(settings.secondaryGoals) ? settings.secondaryGoals : [];
    const donors = secondaryCodes.map(code => SECONDARY_VOCABULARY[code]).filter(Boolean);

    function mergeLabels(key) {
        const seen = new Set(primary[key] || []);
        const combined = [...(primary[key] || [])];
        const cap = combined.length + 2;
        for (const donor of donors) {
            for (const label of donor[key] || []) {
                if (combined.length >= cap) break;
                if (!seen.has(label)) {
                    seen.add(label);
                    combined.push(label);
                }
            }
        }
        return combined;
    }

    function mergeQuality() {
        const seen = new Set((primary.quality || []).map(item => item.label));
        const combined = [...(primary.quality || [])];
        const cap = combined.length + 2;
        for (const donor of donors) {
            for (const item of donor.quality || []) {
                if (combined.length >= cap) break;
                if (!seen.has(item.label)) {
                    seen.add(item.label);
                    combined.push(item);
                }
            }
        }
        return combined;
    }

    return {
        easyRun: mergeLabels("easyRun"),
        quality: mergeQuality(),
        longRun: mergeLabels("longRun"),
        lift: mergeLabels("lift"),
        repScheme: primary.repScheme,
        mobilityFlavor: secondaryCodes.includes("MOBILITY")
    };
}

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

function dayIndex(code) {
    return ALL_DAYS.indexOf(code);
}

function circularDistance(a, b) {
    const diff = Math.abs(dayIndex(a) - dayIndex(b));
    return Math.min(diff, 7 - diff);
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
    if (count <= 0) return { days: [], dropped: 0 };

    // A hard/quality effort right next to the long run -- the day
    // before it (no taper) or the day after it (no recovery) -- is a
    // training mistake, so prefer days with at least one buffer day
    // of separation. Only fall back to adjacency if there simply
    // aren't enough other run days to honor the requested count.
    const buffered = runDays.filter(day => day !== longDay && (!longDay || circularDistance(day, longDay) > 1));
    const eligible = runDays.filter(day => day !== longDay);
    const pool = buffered.length >= count ? buffered : eligible;
    if (!pool.length) return { days: [], dropped: count };

    // TUE/WED/THU first (never MON by default -- MON is only chosen
    // if nothing else is available). Each pick greedily maximizes
    // its distance from the days already chosen, so multiple quality
    // sessions spread across the week instead of stacking up, with
    // ties broken by that day-of-week preference.
    const preference = ["TUE", "WED", "THU", "FRI", "MON", "SAT", "SUN"];
    const remaining = [...pool].sort((a, b) => preference.indexOf(a) - preference.indexOf(b));

    const chosen = [];
    while (chosen.length < count && remaining.length) {
        let best = remaining[0];
        let bestDistance = -1;
        for (const day of remaining) {
            const minDistance = chosen.length ? Math.min(...chosen.map(picked => circularDistance(day, picked))) : 7;
            if (minDistance > bestDistance) {
                bestDistance = minDistance;
                best = day;
            }
        }
        chosen.push(best);
        remaining.splice(remaining.indexOf(best), 1);
    }

    return { days: chosen, dropped: Math.max(0, count - chosen.length) };
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
    if (!runDays.length) return { allocation: result, shortfall: 0 };

    result[longDay] = Math.min(longMiles, weeklyMileage);
    const remainingDays = runDays.filter(day => day !== longDay);
    const remaining = Math.max(0, weeklyMileage - result[longDay]);
    if (!remainingDays.length) return { allocation: result, shortfall: roundHalf(remaining) };

    // A regular run should never be the biggest effort of the week.
    // Splitting "remaining" purely by weight can otherwise dump
    // nearly all of it onto a single day when there are only one or
    // two non-long run days (e.g. a 2-run-day week putting 12+ miles
    // on the "other" day) -- cap each day at the long run's distance
    // (or a bit above its even share, whichever is smaller) and let
    // the week's realized mileage fall short of the target instead.
    const fairShare = remaining / remainingDays.length;
    const perDayCap = Math.max(0, Math.min(result[longDay] || fairShare, fairShare * 1.5));

    const qualitySet = new Set(qualityDays);
    const weights = remainingDays.map(day => qualitySet.has(day) ? 1.15 : 0.9);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;

    let allocated = 0;
    remainingDays.forEach((day, index) => {
        const share = roundHalf(Math.min(remaining * (weights[index] / weightTotal), perDayCap));
        result[day] = share;
        allocated += share;
    });

    return { allocation: result, shortfall: Math.max(0, roundHalf(remaining - allocated)) };
}

function phaseForWeek(weekNumber, transitionWeeks, isCutback) {
    if (isCutback) return "Cutback";
    if (weekNumber <= transitionWeeks) return "Build";
    return "Maintain";
}

function buildTrainingWeek({ settings, weekNumber, totalWeeks, transitionWeeks, planEnd, dayPlan, rng, vocabulary }) {
    const { runDays, longDay, qualityDays, liftPlacements, crossPlacements } = dayPlan;
    const isCutback = weekNumber > 1 && weekNumber % 4 === 0 && weekNumber < totalWeeks;
    const weeklyMileage = buildWeeklyMileage(settings, weekNumber, totalWeeks, transitionWeeks, dayPlan.previousMileage);
    const longMiles = runDays.length ? buildLongRunMileage(settings, weekNumber, totalWeeks) : 0;
    const { allocation, shortfall } = allocateMileage(runDays, longDay, qualityDays, weeklyMileage, longMiles);
    const phase = phaseForWeek(weekNumber, transitionWeeks, isCutback);

    const start = parseLocalDate(settings.startDate);
    const weekStart = addDays(start, (weekNumber - 1) * 7);
    let weekEnd = addDays(weekStart, 6);
    if (weekEnd > planEnd) weekEnd = planEnd;

    const recoveryLabels = vocabulary.easyRun.filter(label => /recovery|jog/i.test(label));
    const days = [];
    let previousType = null;
    for (let offset = 0; offset <= dateDiffDays(weekStart, weekEnd); offset++) {
        const date = addDays(weekStart, offset);
        const code = weekdayCode(date);
        const dateStr = isoDate(date);

        if (!runDays.includes(code)) {
            days.push({ date: dateStr, day: code, type: "rest", miles: 0, session: "Rest", phase });
            previousType = "rest";
            continue;
        }

        const isLong = code === longDay;
        const isQuality = qualityDays.includes(code);
        const type = isLong ? "long" : isQuality ? "workout" : "easy";
        const miles = isLong ? Math.min(longMiles, weeklyMileage) : allocation[code];

        let session;
        if (isLong) {
            session = `${pickFrom(rng, vocabulary.longRun, "Long Run")} — ${formatMilesValue(miles)} mi`;
        } else if (isQuality) {
            const item = pickFrom(rng, vocabulary.quality, { label: "Quality Run", detail: "" });
            session = item.detail
                ? `${item.label} — ${item.detail} (${formatMilesValue(miles)} mi)`
                : `${item.label} — ${formatMilesValue(miles)} mi`;
        } else {
            // A day right after a hard or long effort leans toward
            // whichever "recovery"/"jog" label the goal's vocabulary
            // offers, instead of the same generic easy-run text
            // regardless of what came before it.
            const afterHardEffort = previousType === "long" || previousType === "workout";
            const pool = afterHardEffort && recoveryLabels.length ? recoveryLabels : vocabulary.easyRun;
            session = `${pickFrom(rng, pool, "Easy Run")} — ${formatMilesValue(miles)} mi`;
        }

        days.push({ date: dateStr, day: code, type, miles, session, phase });
        previousType = type;
    }

    const supplemental = [
        ...liftPlacements.map(placement => {
            const focus = pickFrom(rng, vocabulary.lift, "Strength");
            const tags = [placement.isDouble ? "Light" : null, isCutback ? "Deload" : null].filter(Boolean);
            return {
                day: placement.day,
                type: "strength",
                session: tags.length ? `${focus} (${tags.join(" · ")})` : focus,
                miles: 0,
                strengthIntensity: placement.isDouble || placement.day === longDay || isCutback ? "light" : "support",
                repScheme: vocabulary.repScheme,
                mobilityFlavor: vocabulary.mobilityFlavor
            };
        }),
        ...crossPlacements.map(placement => ({
            day: placement.day,
            type: "cross",
            session: `Cross Training — ${pickFrom(rng, CROSS_MODALITIES, "")}`.trim().replace(/ — $/, ""),
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
        targetMiles: roundHalf(weeklyMileage),
        mileageShortfall: shortfall,
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
    const requestedSpeedDays = clampInt(settings.speedDays, 0, runDays.length);
    const qualityResult = pickQualityDays(runDays, longDay, requestedSpeedDays);
    const qualityDays = qualityResult.days;
    if (qualityResult.dropped > 0) {
        warnings.push(`Only ${qualityDays.length} of the requested ${requestedSpeedDays} weekly speed session${requestedSpeedDays === 1 ? "" : "s"} fit your selected running days; the rest were left as easy runs.`);
    }

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
    const rng = createRng(settings);
    const vocabulary = buildVocabulary(settings);

    const weeks = [];
    let previousMileage = Number(settings.currentMiles) || 0;
    for (let week = 1; week <= totalWeeks; week++) {
        const generated = buildTrainingWeek({
            settings,
            weekNumber: week,
            totalWeeks,
            transitionWeeks,
            planEnd: end,
            dayPlan: { runDays, longDay, qualityDays, liftPlacements: liftResult.placed, crossPlacements: crossResult.placed, previousMileage },
            rng,
            vocabulary
        });
        previousMileage = generated.plannedMiles;
        weeks.push(generated);
    }

    const peakGenerated = Math.max(0, ...weeks.map(week => week.plannedMiles));
    const longestGenerated = Math.max(0, ...weeks.flatMap(week => week.days.map(day => Number(day.miles) || 0)));

    const shortfallWeeks = weeks.filter(week => week.mileageShortfall > 0.5);
    if (shortfallWeeks.length) {
        const worst = shortfallWeeks.reduce((max, week) => week.mileageShortfall > max.mileageShortfall ? week : max);
        warnings.push(`${runDays.length} running day${runDays.length === 1 ? "" : "s"} a week couldn't safely hold your requested mileage without a regular run exceeding the long run -- Southbound capped daily mileage instead, so ${shortfallWeeks.length} week${shortfallWeeks.length === 1 ? "" : "s"} come in under target (up to ${formatMilesValue(worst.mileageShortfall)} mi short, e.g. week ${worst.week}). Add a running day or raise your long-run range to close the gap.`);
    }

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
