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

        const minPerMile = parsePace(session.pace) || paceMinutesPerMile(session);

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

/* ---- How long the run is (the Fueling page's rule) ----

   parsePace("8:30") -> 8.5 min per mile. Also "8:30/mi", "5:17/km",
   "8:15-8:30" (the middle), "8" (whole minutes). A word ("Easy", "MP")
   or anything outside 3:00-30:00 a mile -> null.
*/
const KM_PER_MILE = 1.609344;

export function parsePace(text) {
    const raw = String(text ?? "").trim().toLowerCase();
    if (!raw) return null;
    const perKm = /k(m|ilo)/.test(raw);
    const one = part => {
        const m = part.match(/^\s*(\d{1,2})(?::(\d{1,2}))?\s*$/);
        if (!m) return null;
        const sec = m[2] == null ? 0 : Number(m[2]);
        if (sec >= 60) return null;
        return Number(m[1]) + sec / 60;
    };
    const body = raw.replace(/\s*(\/|per)?\s*(mi(le)?s?|km|kilometers?|kilometres?)\s*$/, "").replace(/[–—]/g, "-");
    const parts = body.split("-").map(one);
    if (!parts.length || parts.length > 2 || parts.some(p => p == null)) return null;
    let pace = parts.reduce((a, b) => a + b, 0) / parts.length;
    if (perKm) pace *= KM_PER_MILE;
    return pace >= 3 && pace <= 30 ? Math.round(pace * 1000) / 1000 : null;
}

// 8.5 -> "8:30"
export function formatPace(minPerMile) {
    if (!(minPerMile > 0) || !isFinite(minPerMile)) return "";
    let m = Math.floor(minPerMile);
    let s = Math.round((minPerMile - m) * 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}:${String(s).padStart(2, "0")}`;
}

// 153 -> "2:33"
export function formatDuration(minutes) {
    const total = Math.round(Number(minutes) || 0);
    return total >= 60 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : `${total} min`;
}

/**
 * The run's length from what's typed, by one plain rule:
 *   distance + pace work it out, unless the duration was typed by hand
 *   (durationTyped), which then wins; when the two disagree by more than
 *   3 minutes and 3%, `conflict` says so. A typed duration with a distance
 *   gives the pace it implies. A distance alone uses a typical pace for
 *   the workout type (said so). Nothing usable -> minutes null (no
 *   made-up 60-minute run).
 * input: { duration, durationTyped, distance, pace, workoutType }
 * -> { minutes, source: "typed" | "distance-pace" | "distance-typical" | "none",
 *      paceMin, paceSource: "typed" | "implied" | "typical" | null,
 *      fromPace (distance x pace, when both), conflict, problems: [text] }
 */
export function resolveDuration(input = {}) {
    const num = v => {
        const n = Number(v);
        return isFinite(n) ? n : NaN;
    };
    const problems = [];
    const distRaw = num(input.distance);
    const durRaw = num(input.duration);
    const paceText = String(input.pace ?? "").trim();
    const distance = distRaw > 0 && distRaw <= 200 ? distRaw : 0;
    if (String(input.distance ?? "").trim() !== "" && !(distRaw > 0 && distRaw <= 200)) problems.push("Distance should be between 0.1 and 200 miles.");
    const typed = input.durationTyped && durRaw > 0 && durRaw <= 2880 ? Math.round(durRaw) : 0;
    if (input.durationTyped && String(input.duration ?? "").trim() !== "" && !(durRaw > 0 && durRaw <= 2880)) problems.push("Duration should be between 1 and 2,880 minutes.");
    const pace = parsePace(paceText);
    if (paceText && pace == null) problems.push(`Couldn't read the pace “${paceText}”. Type it like 8:30 (per mile) or 5:17/km.`);
    const fromPace = distance && pace ? Math.round(distance * pace) : null;
    const out = { minutes: null, source: "none", paceMin: null, paceSource: null, fromPace, conflict: null, problems };
    if (typed) {
        out.minutes = typed;
        out.source = "typed";
        if (pace) { out.paceMin = pace; out.paceSource = "typed"; }
        else if (distance) { out.paceMin = typed / distance; out.paceSource = "implied"; }
        if (fromPace && Math.abs(fromPace - typed) > 3 && Math.abs(fromPace - typed) / fromPace > 0.03) {
            out.conflict = { typed, fromPace };
            out.paceMin = typed / distance;
            out.paceSource = "implied";
        }
        if (out.paceSource === "implied" && (out.paceMin < 3 || out.paceMin > 30)) {
            problems.push(`${typed} min for ${distance} mi is ${formatPace(out.paceMin)} a mile. Check the duration or the distance.`);
        }
        return out;
    }
    if (fromPace) {
        return { ...out, minutes: fromPace, source: "distance-pace", paceMin: pace, paceSource: "typed" };
    }
    if (distance) {
        const typical = paceMinutesPerMile({ workoutType: input.workoutType });
        return { ...out, minutes: Math.round(distance * typical), source: "distance-typical", paceMin: typical, paceSource: "typical" };
    }
    return out;
}

export function clampRound(value, min, max, step) {

    const rounded = Math.round(value / step) * step;

    return Math.min(max, Math.max(min, rounded));

}
