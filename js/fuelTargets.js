/* ==========================================
   Southbound — fueling targets (pure)

   Carbs / fluid / sodium per hour for a run, from its type, duration or
   distance, and the athlete's own inputs (tolerance, stomach, sweat,
   weather, body weight). Transparent, editable starting targets -- not
   medical advice. Used by the Fueling page (js/fueling.js) and the fuel
   plan on each workout (js/workoutFuel.js). Unit-tested in
   tests/workoutFuel.test.mjs.

   session: { workoutType, duration (min), distance (mi), mode
              ("training" | "race"), bodyWeight, currentCarbIntake,
              tolerance, stomachSensitivity, temperature, humidity,
              sweatRate, sweatSodium, typicalSodiumIntake }
========================================== */

export function estimateDurationMinutes(session) {

    if (session.duration > 0) return session.duration;

    if (session.distance > 0) {

        const minPerMile = paceMinutesPerMile(session);

        return Math.round(session.distance * minPerMile);

    }

    return 60;

}

export function paceMinutesPerMile(session) {

    const table = {

        recovery: 9.1,
        easy: 8.6,
        long: 8.25,
        workout: 7.5,
        marathon: 7.05,
        race: 7.05,
        other: 8.5

    };

    return table[session.workoutType] || 8.5;

}

export function calculateTargets(session) {

    const duration = estimateDurationMinutes(session);

    /* ---- Carbohydrates ---- */

    let baseCarbs;

    if (duration < 45) baseCarbs = 0;
    else if (duration < 75) baseCarbs = 30;
    else if (duration <= 150) baseCarbs = 45;
    else baseCarbs = 60;

    if (session.mode === "race" && duration > 150) baseCarbs = 75;

    const toleranceFactor = { low: 0.7, moderate: 1, high: 1.25 }[session.tolerance] || 1;

    let carbsPerHour = baseCarbs * toleranceFactor;

    if (session.currentCarbIntake > 0) {

        if (session.mode === "training") {

            carbsPerHour = Math.min(Math.max(carbsPerHour, session.currentCarbIntake), session.currentCarbIntake + 15);

        } else {

            carbsPerHour = session.currentCarbIntake;

        }

    }

    if (session.stomachSensitivity === "sensitive") carbsPerHour *= 0.85;
    if (session.stomachSensitivity === "iron") carbsPerHour *= 1.1;

    carbsPerHour = clampRound(carbsPerHour, 0, 100, 5);

    /* ---- Fluids ---- */

    let baseFluid = { low: 16, moderate: 22, high: 28 }[session.sweatRate] || 22;

    if (session.temperature >= 85) baseFluid += 4;
    else if (session.temperature >= 75) baseFluid += 2;

    if (session.humidity >= 70) baseFluid += 2;

    const weightFactor = session.bodyWeight > 0
        ? Math.min(Math.max(session.bodyWeight / 165, 0.8), 1.25)
        : 1;

    const fluidPerHour = clampRound(baseFluid * weightFactor, 8, 40, 1);

    /* ---- Sodium ---- */

    let sodiumPerHour;

    if (session.typicalSodiumIntake > 0) {

        sodiumPerHour = session.typicalSodiumIntake;

    } else {

        const sodiumMap = { light: 300, average: 500, heavy: 800, unknown: 450 };

        sodiumPerHour = sodiumMap[session.sweatSodium] ?? 450;

        if (session.temperature >= 85) sodiumPerHour += 100;

    }

    sodiumPerHour = clampRound(sodiumPerHour, 0, 1500, 25);

    return { duration, carbsPerHour, fluidPerHour, sodiumPerHour };

}

export function clampRound(value, min, max, step) {

    const rounded = Math.round(value / step) * step;

    return Math.min(max, Math.max(min, rounded));

}
