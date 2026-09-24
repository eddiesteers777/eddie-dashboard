/* ==========================================
   Southbound Running — Race Plan Generator

   Phase 1B:
   Turns a saved Race Plan setup into a structured,
   progressive week-by-week training plan preview.

   This is intentionally a rules-based engine rather than
   a flat mileage template. It uses the runner's current
   volume, target peak, training window, race distance,
   experience, available days, and workout preferences.

   Phase 1B does NOT write generated workouts into the
   Running calendar. That integration is Phase 1C.
========================================== */

const WEEKDAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_NAMES = {
    MON: "Monday",
    TUE: "Tuesday",
    WED: "Wednesday",
    THU: "Thursday",
    FRI: "Friday",
    SAT: "Saturday",
    SUN: "Sunday"
};

export const RACE_PROFILES = {
    "5K": {
        label: "5K",
        distanceMiles: 3.1,
        minimumWeeks: 6,
        longRunPeak: 8,
        taperWeeks: 1,
        peakWeeks: 1,
        buildCutbackEvery: 3,
        preferredQuality: ["Intervals", "Hill Repeats", "Tempo"],
        recoveryBias: 0.95
    },
    "10K": {
        label: "10K",
        distanceMiles: 6.2,
        minimumWeeks: 8,
        longRunPeak: 10,
        taperWeeks: 1,
        peakWeeks: 1,
        buildCutbackEvery: 3,
        preferredQuality: ["Intervals", "Tempo", "Hill Repeats"],
        recoveryBias: 0.96
    },
    "HALF": {
        label: "Half Marathon",
        distanceMiles: 13.1,
        minimumWeeks: 10,
        longRunPeak: 14,
        taperWeeks: 2,
        peakWeeks: 1,
        buildCutbackEvery: 3,
        preferredQuality: ["Tempo", "Cruise Intervals", "Intervals"],
        recoveryBias: 0.97
    },
    "MARATHON": {
        label: "Marathon",
        distanceMiles: 26.2,
        minimumWeeks: 14,
        longRunPeak: 20,
        taperWeeks: 3,
        peakWeeks: 2,
        buildCutbackEvery: 3,
        preferredQuality: ["Threshold", "Marathon Pace", "Intervals"],
        recoveryBias: 0.98
    },
    "50K": {
        label: "50K",
        distanceMiles: 31.1,
        minimumWeeks: 16,
        longRunPeak: 24,
        taperWeeks: 3,
        peakWeeks: 2,
        buildCutbackEvery: 3,
        preferredQuality: ["Hill Strength", "Steady", "Threshold"],
        recoveryBias: 1.0
    },
    "50_MILE": {
        label: "50 Mile",
        distanceMiles: 50,
        minimumWeeks: 18,
        longRunPeak: 30,
        taperWeeks: 3,
        peakWeeks: 2,
        buildCutbackEvery: 3,
        preferredQuality: ["Hill Strength", "Steady", "Long Tempo"],
        recoveryBias: 1.0
    }
};

const EXPERIENCE = {
    NEW: { buildRate: 0.030, cutback: 0.88, longRunRate: 0.055 },
    DISTANCE_NEW: { buildRate: 0.035, cutback: 0.87, longRunRate: 0.065 },
    RECREATIONAL: { buildRate: 0.040, cutback: 0.88, longRunRate: 0.075 },
    INTERMEDIATE: { buildRate: 0.045, cutback: 0.90, longRunRate: 0.085 },
    ADVANCED: { buildRate: 0.050, cutback: 0.91, longRunRate: 0.095 },
    ENDURANCE: { buildRate: 0.055, cutback: 0.91, longRunRate: 0.105 }
};

function roundHalf(value) {
    return Math.max(0, Math.round(value * 2) / 2);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

function dateDiffDays(start, end) {
    return Math.round((end - start) / 86400000);
}

function formatDate(date) {
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}


function parseGoalSeconds(value) {
    if (!value) return 0;
    const parts = String(value).split(":").map(Number);
    if (parts.some(part => !Number.isFinite(part))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function formatPace(secondsPerMile) {
    if (!Number.isFinite(secondsPerMile) || secondsPerMile <= 0) return "";
    const totalSeconds = Math.round(secondsPerMile);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
}

function goalRacePace(settings, profile) {
    const goalSeconds = parseGoalSeconds(settings.goalTime);
    if (settings.goalType !== "TIME" || !goalSeconds || !profile.distanceMiles) return "";
    return formatPace(goalSeconds / profile.distanceMiles);
}

function selectedRunDays(settings) {
    const runDays = Array.isArray(settings.runDays) ? settings.runDays : [];
    return WEEKDAY_CODES.filter(code => runDays.includes(code));
}

function preferredLongDay(settings, runDays) {
    if (runDays.includes(settings.longRunDay)) return settings.longRunDay;
    return runDays[runDays.length - 1] || "SUN";
}

function dayIndex(code) {
    return WEEKDAY_CODES.indexOf(code);
}

function circularDistance(a, b) {
    const diff = Math.abs(dayIndex(a) - dayIndex(b));
    return Math.min(diff, 7 - diff);
}

function chooseQualityDays(runDays, longRunDay, speedDays, allowSecondQuality) {
    const eligible = runDays.filter(day => day !== longRunDay);
    if (!eligible.length || speedDays <= 0) return [];

    const preferred = ["TUE", "WED", "THU", "MON", "FRI", "SAT", "SUN"]
        .filter(day => eligible.includes(day));

    const chosen = [];
    for (const day of preferred) {
        if (!chosen.length || circularDistance(day, chosen[chosen.length - 1]) > 1) {
            chosen.push(day);
        }
        if (chosen.length >= Math.min(speedDays, allowSecondQuality ? 2 : 1)) break;
    }

    if (chosen.length < Math.min(speedDays, allowSecondQuality ? 2 : 1)) {
        for (const day of preferred) {
            if (!chosen.includes(day)) {
                chosen.push(day);
                if (chosen.length >= Math.min(speedDays, allowSecondQuality ? 2 : 1)) break;
            }
        }
    }

    return chosen;
}

function phaseForWeek(profile, weekNumber, totalWeeks) {
    const taperStart = Math.max(1, totalWeeks - profile.taperWeeks + 1);
    const peakStart = Math.max(1, taperStart - profile.peakWeeks);
    const buildStart = Math.max(1, Math.ceil(totalWeeks * 0.16));
    const specificStart = Math.max(buildStart + 1, Math.ceil(totalWeeks * 0.56));

    if (weekNumber >= taperStart) {
        return "Taper";
    }
    if (weekNumber >= peakStart) {
        return "Peak";
    }
    if (weekNumber >= specificStart) {
        return "Race Specific";
    }
    if (weekNumber >= buildStart) {
        return "Build";
    }
    return "Foundation";
}

function qualityLabel(profile, settings, phase, index) {
    const raceType = settings.raceType;
    const options = profile.preferredQuality;

    if (raceType === "MARATHON" && settings.threshold === "NO") {
        return settings.hills === "YES" ? "Hill Repeats" : "Marathon Pace Intervals";
    }

    if (raceType === "50K" || raceType === "50_MILE") {
        if (phase === "Foundation" || phase === "Build") {
            return settings.hills === "YES" ? "Hill Strength" : "Steady Endurance";
        }
        return settings.threshold === "YES" ? options[index % options.length] : "Steady Endurance";
    }

    if (phase === "Foundation") {
        return settings.hills === "YES" ? "Hill Strides" : "Fartlek / Strides";
    }
    if (phase === "Build") {
        return options[index % options.length];
    }
    if (phase === "Race Specific") {
        if (raceType === "MARATHON" && settings.racePaceLongRuns !== "NEVER") {
            return "Marathon Pace Intervals";
        }
        if (raceType === "HALF" && settings.racePaceLongRuns !== "NEVER") {
            return "Half Marathon Pace Intervals";
        }
        return options[(index + 1) % options.length];
    }
    return "Sharpening Intervals";
}

function qualitySession(settings, profile, phase, weekNumber, qualityIndex) {
    const raceType = settings.raceType;
    const pace = goalRacePace(settings, profile);
    const sessionIndex = qualityIndex % 2;

    if (raceType === "5K") {
        if (phase === "Foundation") return settings.hills === "YES" ? "6 × 20 sec hill strides" : "6 × 20 sec strides + drills";
        if (sessionIndex === 0) return "8 × 400m @ 5K effort";
        return "5 × 800m @ 5K effort";
    }

    if (raceType === "10K") {
        if (phase === "Foundation") return settings.hills === "YES" ? "8 × 30 sec hill reps" : "8 × 1 min fartlek";
        if (sessionIndex === 0) return "5 × 800m @ 10K effort";
        return "4 × 1K @ 10K effort";
    }

    if (raceType === "HALF") {
        if (phase === "Foundation") return "20 min controlled tempo / threshold";
        if (sessionIndex === 0) return "3 × 1 mi @ threshold effort";
        return "25–30 min tempo @ controlled threshold";
    }

    if (raceType === "MARATHON") {
        if (phase === "Foundation") return settings.hills === "YES" ? "8 × 45 sec hill reps" : "6 × 3 min steady / 2 min easy";
        if (phase === "Race Specific" && pace) return `2 × 3 mi @ marathon pace (${pace})`;
        if (sessionIndex === 0) return "3 × 1 mi @ threshold effort";
        return "5 × 800m controlled interval";
    }

    if (raceType === "50K") {
        if (settings.hills === "YES") return phase === "Race Specific" ? "6 × 3 min uphill @ strong aerobic effort" : "8 × 2 min uphill @ strong effort";
        return phase === "Race Specific" ? "50 min steady endurance" : "40 min steady endurance";
    }

    if (settings.hills === "YES") return "10 × 90 sec uphill @ strong aerobic effort";
    return phase === "Race Specific" ? "60 min steady endurance" : "45 min steady endurance";
}

function easyLabel(runDays, index, qualityDays) {
    const restBuffer = runDays.length <= 3 ? "Easy" : (index === 0 || index === runDays.length - 1 ? "Easy" : "Recovery");
    if (qualityDays.includes(runDays[index])) return "Workout";
    return restBuffer;
}

function longRunSession(settings, profile, phase, weekNumber, totalWeeks, miles) {
    if (weekNumber === totalWeeks) return `Race day — ${profile.label}`;

    const pace = goalRacePace(settings, profile);
    const roundedMiles = formatMilesValue(miles);

    if (settings.longRunStyle === "PROGRESSION") return `Progression Long Run — ${roundedMiles} mi`;
    if (settings.longRunStyle === "FAST_FINISH") return `Fast-Finish Long Run — ${roundedMiles} mi`;
    if (settings.longRunStyle === "RACE_PACE") {
        return pace ? `${profile.label} Pace Long Run — ${roundedMiles} mi @ ${pace}` : `${profile.label} Pace Long Run — ${roundedMiles} mi`;
    }
    if (settings.longRunStyle === "MIXED") {
        if (phase === "Foundation") return `Easy Long Run — ${roundedMiles} mi`;
        if (phase === "Build") return `Progression Long Run — ${roundedMiles} mi`;
        if (phase === "Race Specific" && settings.racePaceLongRuns !== "NEVER") {
            return pace ? `${profile.label} Pace Long Run — ${roundedMiles} mi with race-pace blocks @ ${pace}` : `${profile.label} Pace Long Run — ${roundedMiles} mi with race-pace blocks`;
        }
        if (phase === "Peak") return `Fast-Finish Long Run — ${roundedMiles} mi`;
        return `Easy Long Run — ${roundedMiles} mi`;
    }

    if (settings.racePaceLongRuns !== "NEVER" && (phase === "Race Specific" || phase === "Peak")) {
        return pace ? `${profile.label} Pace Long Run — ${roundedMiles} mi @ ${pace}` : `${profile.label} Pace Long Run — ${roundedMiles} mi`;
    }

    return `${phase === "Peak" ? "Endurance" : "Easy"} Long Run — ${roundedMiles} mi`;
}

function formatMilesValue(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function buildWeeklyMileage({ settings, profile, totalWeeks, weekNumber, previousMileage }) {
    const current = Math.max(1, Number(settings.currentMileage) || 1);
    const peak = Math.max(current, Number(settings.peakMileage) || current);
    const taperWeeks = profile.taperWeeks;
    const raceWeek = weekNumber === totalWeeks;
    const taperIndex = weekNumber - (totalWeeks - taperWeeks + 1);
    const peakStart = Math.max(1, totalWeeks - taperWeeks - profile.peakWeeks + 1);
    const buildWeeks = Math.max(1, totalWeeks - taperWeeks - profile.peakWeeks);

    if (raceWeek) {
        return roundHalf(profile.distanceMiles + Math.max(0, Math.min(6, current * 0.20)));
    }

    if (taperIndex >= 0) {
        const taperFactor = taperWeeks === 1 ? 0.58 : taperIndex === 0 ? 0.80 : 0.60;
        return roundHalf(Math.max(profile.distanceMiles * 0.8, peak * taperFactor));
    }

    if (weekNumber >= peakStart) {
        const peakVariance = weekNumber === peakStart ? 0.96 : 1;
        return roundHalf(peak * peakVariance);
    }

    const progressionIndex = clamp((weekNumber - 1) / Math.max(1, buildWeeks), 0, 1);
    let target = current + (peak - current) * Math.pow(progressionIndex, 0.88);

    const exp = EXPERIENCE[settings.experience] || EXPERIENCE.RECREATIONAL;
    const absoluteCeiling = previousMileage ? previousMileage * (1 + Math.max(exp.buildRate, 0.025)) : target;

    if (weekNumber > 1 && weekNumber % (profile.buildCutbackEvery + 1) === 0) {
        target = Math.min(target, previousMileage || target) * exp.cutback;
    } else if (weekNumber > 1) {
        target = Math.min(target, absoluteCeiling + 1.0);
    }

    return roundHalf(clamp(target, current, peak));
}

function buildLongRunMileage({ settings, profile, weekNumber, totalWeeks, weeklyMileage, previousLongRun }) {
    const recent = Math.max(1, Number(settings.longestRun) || 1);
    const peakCapByProfile = profile.longRunPeak;
    const peakCapByWeeklyShare = weeklyMileage * (profile.distanceMiles >= 26 ? 0.40 : 0.35);
    const maxLong = Math.max(recent, Math.min(peakCapByProfile, peakCapByWeeklyShare));

    if (weekNumber === totalWeeks) return profile.distanceMiles;

    const buildEnd = Math.max(1, totalWeeks - profile.taperWeeks);
    const progress = clamp((weekNumber - 1) / Math.max(1, buildEnd - 1), 0, 1);
    const exp = EXPERIENCE[settings.experience] || EXPERIENCE.RECREATIONAL;
    const progressionExponent = profile.distanceMiles >= 31 ? 0.65 : 0.9;

    let target = recent + (maxLong - recent) * Math.pow(progress, progressionExponent);
    if (previousLongRun && weekNumber > 1 && weekNumber % 4 === 0) {
        target = previousLongRun * 0.90;
    } else if (previousLongRun) {
        const growthRate = Math.max(exp.longRunRate, profile.longRunGrowthCap || 0);
        target = Math.min(target, previousLongRun + Math.max(0.5, previousLongRun * growthRate));
    }

    if (weekNumber >= totalWeeks - profile.taperWeeks) {
        target = Math.min(target, previousLongRun || target);
    }

    return roundHalf(clamp(target, Math.min(recent, weeklyMileage * 0.25), Math.min(maxLong, weeklyMileage * 0.42)));
}

function allocateMileage(runDays, longDay, qualityDays, weeklyMileage, longMiles, profile) {
    const result = Object.fromEntries(runDays.map(day => [day, 0]));
    result[longDay] = longMiles;

    const remainingDays = runDays.filter(day => day !== longDay);
    const remaining = Math.max(0, weeklyMileage - longMiles);
    if (!remainingDays.length) return result;

    const qualitySet = new Set(qualityDays);
    const weights = remainingDays.map(day => qualitySet.has(day) ? 1.15 : 0.90);
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

    remainingDays.forEach((day, index) => {
        result[day] = roundHalf(remaining * (weights[index] / weightTotal));
    });

    const allocated = Object.values(result).reduce((sum, miles) => sum + miles, 0);
    const delta = roundHalf(weeklyMileage - allocated);
    const anchor = remainingDays[0];
    result[anchor] = roundHalf(Math.max(0, result[anchor] + delta));

    return result;
}

function previousDayCode(dayCode) {
    const codes = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const index = codes.indexOf(dayCode);
    if (index < 0) return null;
    return codes[(index + 6) % 7];
}

function strengthPreferenceOrder(longDay, requestedCount) {
    const preLong = previousDayCode(longDay);
    const preferred = requestedCount >= 2
        ? ["TUE", preLong, "WED", "THU", "FRI", "MON", "SAT", "SUN"]
        : ["TUE", "WED", "THU", "MON", "SAT", "SUN", "FRI"];
    return [...new Set(preferred.filter(Boolean))];
}

function chooseStrengthDays(runDays, longDay, qualityDays, requestedCount) {
    const count = Math.max(0, requestedCount);
    if (!count) return [];

    const preLong = previousDayCode(longDay);
    const preference = strengthPreferenceOrder(longDay, count);
    const scored = preference
        .filter(day => day !== longDay)
        .map(day => {
            let score = 0;
            if (day === "TUE") score += 40;
            if (runDays.includes(day)) score += 15;
            if (qualityDays.includes(day)) score -= 30;
            if (count >= 2 && day === preLong) score += 35;
            if (day === "FRI") score += count >= 2 ? 10 : 0;
            return { day, score, order: preference.indexOf(day) };
        })
        .sort((a, b) => b.score - a.score || a.order - b.order);

    return scored.slice(0, Math.min(count, scored.length)).map(item => item.day);
}

function buildSupplemental(settings, runDays, longDay, qualityDays, weekNumber, totalWeeks, phase) {
    const entries = [];
    const preferredCross = ["TUE", "THU", "SAT", "WED", "FRI", "MON", "SUN"];
    const unavailable = new Set([longDay, ...qualityDays]);

    const strengthDays = chooseStrengthDays(
        runDays,
        longDay,
        qualityDays,
        Number(settings.strengthDays) || 0
    );

    for (const day of strengthDays) {
        const light = day === "FRI" || day === previousDayCode(longDay) || phase === "Taper";
        entries.push({
            day,
            type: "strength",
            session: light ? "Strength — Light" : "Strength",
            miles: 0,
            strengthIntensity: light ? "light" : "support"
        });
    }

    const occupied = new Set(entries.map(entry => entry.day));
    const crossCount = Math.max(0, Number(settings.crossDays) || 0);
    const crossCandidates = preferredCross.filter(day => !occupied.has(day));
    const crossDays = crossCandidates.filter(day => !unavailable.has(day));

    const selectedCross = crossDays.length >= crossCount
        ? crossDays.slice(0, crossCount)
        : [...crossDays, ...crossCandidates.filter(day => !crossDays.includes(day))].slice(0, crossCount);

    for (const day of selectedCross) {
        if (occupied.has(day)) continue;
        entries.push({
            day,
            type: "cross",
            session: settings.crossType === "NONE" ? "Cross Training" : `${settings.crossType} Cross Training`,
            miles: 0
        });
        occupied.add(day);
    }

    return entries;
}

function workoutDescription(settings, profile, phase, type, dayCode, weekNumber, totalWeeks, qualityIndex, miles) {
    if (type === "Race") return `Race day — ${profile.label}`;
    if (type === "Long") return longRunSession(settings, profile, phase, weekNumber, totalWeeks, miles);
    if (type === "Workout") return qualitySession(settings, profile, phase, weekNumber, qualityIndex);
    if (type === "Recovery") return "Recovery Run";
    return "Easy Run";
}

function generateWeek(settings, profile, weekNumber, totalWeeks, weeklyMileage, previousLongRun) {
    const start = parseLocalDate(settings.trainingStartDate);
    const weekStartDate = new Date(start);
    weekStartDate.setDate(start.getDate() + (weekNumber - 1) * 7);

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);

    const raceDate = parseLocalDate(settings.raceDate);
    if (weekNumber === totalWeeks) {
        weekEndDate.setTime(raceDate.getTime());
    }

    const selectedDays = selectedRunDays(settings);
    const raceDayCode = WEEKDAY_CODES[(parseLocalDate(settings.raceDate).getDay() + 6) % 7];
    const runDays = weekNumber === totalWeeks && !selectedDays.includes(raceDayCode)
        ? [...selectedDays, raceDayCode].sort((a, b) => dayIndex(a) - dayIndex(b))
        : selectedDays;
    const longDay = weekNumber === totalWeeks ? raceDayCode : preferredLongDay(settings, runDays);
    const allowSecondQuality = runDays.length >= 5 && settings.raceType !== "50_MILE";
    const qualityDays = chooseQualityDays(runDays, longDay, Number(settings.speedDays) || 0, allowSecondQuality);
    const longMiles = buildLongRunMileage({
        settings,
        profile,
        weekNumber,
        totalWeeks,
        weeklyMileage,
        previousLongRun
    });
    const allocation = allocateMileage(runDays, longDay, qualityDays, weeklyMileage, longMiles, profile);
    const phase = phaseForWeek(profile, weekNumber, totalWeeks);

    const backToBackDay = (settings.raceType === "50K" || settings.raceType === "50_MILE") && settings.backToBack === "YES"
        ? runDays.find(day => day !== longDay && Math.abs(dayIndex(day) - dayIndex(longDay)) === 1) || null
        : null;

    const days = [];
    let qualityIndex = 0;

    for (let offset = 0; offset < 7; offset++) {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + offset);
        if (date > raceDate) break;

        const code = WEEKDAY_CODES[(date.getDay() + 6) % 7];
        const isRunDay = runDays.includes(code);
        const isLongDay = code === longDay;
        const isQualityDay = qualityDays.includes(code);
        const dateStr = isoDate(date);

        if (dateStr === settings.raceDate) {
            days.push({
                date: dateStr,
                day: code,
                type: "race",
                miles: profile.distanceMiles,
                session: workoutDescription(settings, profile, phase, "Race", code, weekNumber, totalWeeks, qualityIndex),
                phase
            });
            continue;
        }

        if (!isRunDay) {
            days.push({ date: dateStr, day: code, type: "rest", miles: 0, session: "Rest", phase });
            continue;
        }

        let type = "Easy";
        if (isLongDay) type = "Long";
        else if (isQualityDay) type = "Workout";
        else if (runDays.length >= 5 && (code === runDays[0] || code === runDays[runDays.length - 2])) type = "Recovery";

        const miles = isLongDay ? longMiles : allocation[code];
        let description = workoutDescription(settings, profile, phase, type, code, weekNumber, totalWeeks, qualityIndex, miles);
        if (backToBackDay === code && phase !== "Taper" && weekNumber !== totalWeeks && type !== "Workout") {
            description = "Back-to-Back Endurance Run";
            type = "endurance";
        }
        if (isQualityDay) qualityIndex++;

        days.push({
            date: dateStr,
            day: code,
            type: type.toLowerCase(),
            miles,
            session: description,
            phase
        });
    }

    const supplemental = buildSupplemental(settings, runDays, longDay, qualityDays, weekNumber, totalWeeks, phase);
    return {
        week: weekNumber,
        phase,
        startDate: isoDate(weekStartDate),
        endDate: isoDate(weekEndDate),
        plannedMiles: roundHalf(days.reduce((sum, day) => sum + (Number(day.miles) || 0), 0)),
        runDays: runDays.length,
        longRunMiles: longMiles,
        days,
        supplemental
    };
}

function ensureSettings(settings) {
    const profile = RACE_PROFILES[settings?.raceType];
    if (!profile) throw new Error("Choose a supported race type before generating a plan.");
    const start = parseLocalDate(settings.trainingStartDate);
    const race = parseLocalDate(settings.raceDate);
    if (!start || !race || race <= start) throw new Error("Your training start date and race date must define a valid training window.");
    const runDays = selectedRunDays(settings);
    if (runDays.length < 2) throw new Error("Select at least two running days to generate a training plan.");
    if (settings.longRunDay !== "OTHER" && !runDays.includes(settings.longRunDay)) throw new Error("Your long-run day must be one of your selected running days.");
    if ((Number(settings.peakMileage) || 0) < (Number(settings.currentMileage) || 0)) throw new Error("Peak mileage cannot be lower than current mileage.");
    return { profile, start, race, totalDays: dateDiffDays(start, race), runDays };
}

export function generateRacePlan(settings) {
    const { profile, start, race, totalDays } = ensureSettings(settings);
    const totalWeeks = Math.max(1, Math.ceil((totalDays + 1) / 7));
    const warnings = [];

    if (totalWeeks < profile.minimumWeeks) {
        warnings.push(`This ${profile.label} plan has ${totalWeeks} weeks, below the ${profile.minimumWeeks}-week planning range used by the generator. Consider a longer build when possible.`);
    }

    const current = Number(settings.currentMileage) || 0;
    const peak = Number(settings.peakMileage) || current;
    if (current > 0 && peak > current * 1.5) {
        warnings.push("Your target peak is more than 50% above current mileage. The engine still builds progressively, but this is a larger training-volume jump.");
    }

    if ((profile.distanceMiles >= 26.2) && runDaysCount(settings) < 4) {
        warnings.push(`${profile.label} plans generally benefit from more running frequency; this plan will honor your selected ${runDaysCount(settings)} running days.`);
    }

    const weeks = [];
    let previousMileage = current;
    let previousLongRun = Number(settings.longestRun) || 0;

    for (let week = 1; week <= totalWeeks; week++) {
        const weeklyMileage = buildWeeklyMileage({
            settings,
            profile,
            totalWeeks,
            weekNumber: week,
            previousMileage
        });

        const generated = generateWeek(
            settings,
            profile,
            week,
            totalWeeks,
            weeklyMileage,
            previousLongRun
        );

        previousMileage = generated.plannedMiles;
        previousLongRun = generated.longRunMiles;
        weeks.push(generated);
    }

    const trainingWeeks = weeks.length > 1 ? weeks.slice(0, -1) : weeks;
    const peakGenerated = Math.max(...trainingWeeks.map(week => week.plannedMiles));
    const longestGenerated = Math.max(...weeks.flatMap(week =>
        week.days
            .filter(day => day.type !== "race")
            .map(day => Number(day.miles) || 0)
    ));

    if (peak > 0 && peakGenerated < peak - 0.5) {
        warnings.push(`The available training window did not reach your requested ${formatMilesValue(peak)} mi peak; the generated plan tops out at ${formatMilesValue(peakGenerated)} mi.`);
    }

    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        raceType: settings.raceType,
        raceLabel: profile.label,
        raceDate: isoDate(race),
        trainingStartDate: isoDate(start),
        totalWeeks,
        currentMileage: current,
        requestedPeakMileage: peak,
        generatedPeakMileage: roundHalf(peakGenerated),
        longestPlannedRun: roundHalf(longestGenerated),
        runDaysPerWeek: runDaysCount(settings),
        speedDaysPerWeek: Number(settings.speedDays) || 0,
        strengthDaysPerWeek: Number(settings.strengthDays) || 0,
        crossDaysPerWeek: Number(settings.crossDays) || 0,
        goal: {
            type: settings.goalType || "FINISH",
            time: settings.goalTime || ""
        },
        weeks,
        warnings
    };
}

function runDaysCount(settings) {
    return selectedRunDays(settings).length;
}

export function summarizeGeneratedPlan(plan) {
    const phases = [];
    for (const week of plan.weeks) {
        const existing = phases.find(item => item.name === week.phase);
        if (existing) {
            existing.weeks += 1;
            existing.miles += week.plannedMiles;
        } else {
            phases.push({ name: week.phase, weeks: 1, miles: week.plannedMiles });
        }
    }
    return phases;
}

export default {
    generateRacePlan,
    summarizeGeneratedPlan,
    RACE_PROFILES
};
