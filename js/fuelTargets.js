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

/* Carbs an hour before tolerance / stomach / habit, by the run's length:
   straight lines between these points, flat past the last one. Training
   and racing agree up to 90 min; a race asks a little more after that.
   General starting points (30-60 g/hr for 1-2.5 h, up to ~90 g/hr for
   longer races in trained guts), meant to be edited. */
export const CARB_CURVE = {
    training: [[45, 0], [60, 25], [90, 40], [150, 55], [210, 60]],
    race: [[45, 0], [60, 25], [90, 40], [150, 70], [210, 80]]
};

/* Workout type on a training run: general guidance, not a rule. Easy and
   recovery runs sit at the lower end, tempo / interval sessions at the
   upper end; long runs and the rest use the curve as it is. */
export const TYPE_CARBS = {
    easy: { factor: 0.85, words: "Easy run: the lower end" },
    recovery: { factor: 0.85, words: "Recovery run: the lower end" },
    workout: { factor: 1.1, words: "Workout (tempo / intervals): the upper end" }
};

export function baseCarbsPerHour(durationMin, mode = "training") {
    const pts = CARB_CURVE[mode === "race" ? "race" : "training"];
    const d = Number(durationMin) || 0;
    if (d <= pts[0][0]) return 0;
    for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        if (d <= x1) return y0 + (y1 - y0) * (d - x0) / (x1 - x0);
    }
    return pts[pts.length - 1][1];
}

/* The one pace table for estimating how long a run takes, by workout
   type (the Fueling page and every workout page) and by the plan's pace
   words (the Marathon picker). The plan's own PACES ranges win when given. */
const LABEL_PACES = {
    recovery: 9.1, easy: 8.6, "long run": 8.25, long: 8.25, steady: 7.5,
    threshold: 6.7, cruise: 6.6, "cruise intervals": 6.6, "10k pace": 6.33, vo2max: 6.1, "5k / vo₂max": 6.1,
    fartlek: 8.3, "hill effort": 8.5, "hill repeats / fartlek": 8.3, progression: 7.6,
    "fast finish": 7.2, mp: 7.05, "marathon pace": 7.05, race: 7.05
};

/** "Long Run" -> 8.0 (the middle of the plan's 7:50-8:40), else the table, else null. */
export function paceForLabel(label, paces = null) {
    const key = String(label || "").trim().toLowerCase();
    if (!key) return null;
    if (Array.isArray(paces)) {
        const row = paces.find(([name]) => String(name).toLowerCase() === key)
            || paces.find(([name]) => String(name).toLowerCase().split(/[ /]+/).includes(key));
        const p = row ? parsePace(String(row[1])) : null;
        if (p) return p;
    }
    return LABEL_PACES[key] ?? null;
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
    const race = session.mode === "race";
    // How the carb target was set, step by step, in plain words.
    const why = [];
    const step = (label, value) => why.push({ label, value: Math.round(value) });

    /* ---- Carbohydrates ---- */

    // Rises gradually with the run's length (no jump at 75 or 150 min).
    const baseCarbs = baseCarbsPerHour(duration, session.mode);
    let carbsPerHour = baseCarbs;
    if (!baseCarbs) why.push({ label: `Under ${CARB_CURVE.training[0][0]} minutes: no carbs needed during the run`, value: 0 });
    else step(`A ${duration}-minute ${race ? "race" : "training run"}`, baseCarbs);

    // Training runs: how hard it is moves the target within the usual
    // 30-60 g/hr range (harder running burns more carbohydrate). Race
    // mode has its own curve.
    const intensity = race ? null : TYPE_CARBS[session.workoutType];
    if (baseCarbs && intensity) {
        carbsPerHour *= intensity.factor;
        step(intensity.words, carbsPerHour);
    }

    const toleranceFactor = { low: 0.7, moderate: 1, high: 1.25 }[session.tolerance] || 1;

    if (baseCarbs && toleranceFactor !== 1) {
        carbsPerHour *= toleranceFactor;
        step(toleranceFactor < 1 ? "Your gut tolerance: low" : "Your gut tolerance: high", carbsPerHour);
    }

    if (baseCarbs && session.currentCarbIntake > 0) {

        if (!race) {

            const was = carbsPerHour;
            carbsPerHour = Math.min(Math.max(carbsPerHour, session.currentCarbIntake), session.currentCarbIntake + 15);
            if (Math.round(was) !== Math.round(carbsPerHour)) step(`What you take now (${session.currentCarbIntake} g/hr), raised by no more than 15`, carbsPerHour);

        } else {

            carbsPerHour = session.currentCarbIntake;
            step(`Race day: what you've practiced (${session.currentCarbIntake} g/hr)`, carbsPerHour);

        }

    }

    if (baseCarbs && session.stomachSensitivity === "sensitive") { carbsPerHour *= 0.85; step("Sensitive stomach", carbsPerHour); }
    if (baseCarbs && session.stomachSensitivity === "iron") { carbsPerHour *= 1.1; step("Iron stomach", carbsPerHour); }

    carbsPerHour = clampRound(carbsPerHour, 0, 100, 5);

    /* ---- Fluids ---- */
    // fluidWhy / sodiumWhy: the same step-by-step words as the carbs.
    // Fluid values are oz/hr ("fluid"), shown in the athlete's own unit.
    const fluidWhy = [];
    const fstep = (label, value) => fluidWhy.push({ label, value: Math.round(value), unit: "fluid" });
    const measuredSweat = Number(session.sweatRateMeasured) || 0;
    let fluidPerHour;
    let fluidBasis;
    if (measuredSweat > 0) {
        // Replace most of a measured loss, never more than it: drinking
        // past what you sweat is how hyponatremia happens, and losing a
        // little (under ~2% of body weight) is normal.
        fluidBasis = "measured";
        fstep("Your measured sweat rate", measuredSweat);
        const replace = measuredSweat * FLUID_REPLACE;
        fstep(`About ${Math.round(FLUID_REPLACE * 100)}% of it (replace most of what you lose, never more)`, replace);
        fluidPerHour = clampRound(Math.min(replace, measuredSweat, FLUID_CAP_OZ), 8, FLUID_CAP_OZ, 1);
        if (replace > FLUID_CAP_OZ) fstep(`Capped at ${FLUID_CAP_OZ} an hour (about a liter): more is hard to absorb`, fluidPerHour);
    } else {
        fluidBasis = "estimate";
        let baseFluid = { low: 16, moderate: 22, high: 28 }[session.sweatRate] || 22;
        fstep(`Sweat rate, your guess: ${session.sweatRate || "moderate"}`, baseFluid);
        if (session.temperature >= 85) { baseFluid += 4; fstep(`Hot (${session.temperature}°F)`, baseFluid); }
        else if (session.temperature >= 75) { baseFluid += 2; fstep(`Warm (${session.temperature}°F)`, baseFluid); }
        if (session.humidity >= 70) { baseFluid += 2; fstep(`Humid (${session.humidity}%)`, baseFluid); }
        const weightFactor = session.bodyWeight > 0
            ? Math.min(Math.max(session.bodyWeight / 165, 0.8), 1.25)
            : 1;
        if (weightFactor !== 1) fstep(`Body weight (${Math.round(session.bodyWeight)} lb)`, baseFluid * weightFactor);
        fluidPerHour = clampRound(baseFluid * weightFactor, 8, 40, 1);
    }

    /* ---- Sodium ---- */
    const sodiumWhy = [];
    const sstep = (label, value) => sodiumWhy.push({ label, value: Math.round(value), unit: "mg" });
    const measuredSodium = Number(session.sweatSodiumMeasured) || 0;
    let sodiumPerHour;
    let sodiumBasis;
    if (measuredSodium > 0) {
        // Replace the sodium in what you'll actually drink (mg per liter of
        // sweat x liters an hour), not all of the sweat.
        sodiumBasis = "measured";
        sodiumPerHour = measuredSodium * fluidPerHour * L_PER_OZ;
        sstep(`Your measured sweat sodium (${Math.round(measuredSodium)} mg a liter) in the fluid you'll drink`, sodiumPerHour);
        if (session.typicalSodiumIntake > 0) sodiumWhy.push({ label: `You take about ${session.typicalSodiumIntake} mg an hour now`, value: null });
    } else if (session.typicalSodiumIntake > 0) {
        sodiumBasis = "yours";
        sodiumPerHour = session.typicalSodiumIntake;
        sstep("What you take now", sodiumPerHour);
    } else {
        sodiumBasis = "estimate";
        const sodiumMap = { light: 300, average: 500, heavy: 800, unknown: 450 };
        sodiumPerHour = sodiumMap[session.sweatSodium] ?? 450;
        sstep(session.sweatSodium && session.sweatSodium !== "unknown" ? `Salty sweat, your guess: ${session.sweatSodium}` : "A middle starting point (salty sweat not known)", sodiumPerHour);
        if (session.temperature >= 85) { sodiumPerHour += 100; sstep(`Hot (${session.temperature}°F)`, sodiumPerHour); }
    }
    sodiumPerHour = clampRound(sodiumPerHour, 0, 1500, 25);

    return { duration, carbsPerHour, fluidPerHour, sodiumPerHour, why, fluidWhy, sodiumWhy, basis: { fluid: fluidBasis, sodium: sodiumBasis } };
}

// Measured sweat: replace about 70% of it, at most ~1 L (34 oz) an hour.
export const FLUID_REPLACE = 0.7;
export const FLUID_CAP_OZ = 34;
const L_PER_OZ = 0.0295735;

function _unused() {
    return { duration, carbsPerHour, fluidPerHour, sodiumPerHour, why };

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
 * Distance, pace and duration, adaptable: whichever two were typed most
 * recently work out the third, like a pace calculator.
 * input: { distance, pace, duration, order (the typed fields, most recent
 *          first: "distance" | "pace" | "duration"), workoutType }
 * -> { minutes, distance, paceMin, computed: "duration" | "pace" |
 *      "distance" | null, source: "two" | "duration" | "distance-typical" | "none",
 *      paceSource: "typed" | "worked out" | "typical" | null, problems: [text] }
 * A distance alone uses a typical pace for the workout type (said so);
 * a duration alone needs nothing else; nothing usable -> minutes null.
 */
export function resolveRun(input = {}) {
    const problems = [];
    const blank = v => String(v ?? "").trim() === "";
    const n = v => (blank(v) ? NaN : Number(v));
    const dist = n(input.distance), dur = n(input.duration);
    const paceText = String(input.pace ?? "").trim();
    const pace = parsePace(paceText);
    const ok = {
        distance: dist > 0 && dist <= 200,
        duration: dur > 0 && dur <= 2880,
        pace: pace != null
    };
    if (!blank(input.distance) && !ok.distance) problems.push("Distance should be between 0.1 and 200 miles.");
    if (!blank(input.duration) && !ok.duration) problems.push("Duration should be between 1 and 2,880 minutes.");
    if (paceText && !ok.pace) problems.push(`Couldn't read the pace “${paceText}”. Type it like 8:30 (per mile) or 5:17/km.`);
    const typed = [...new Set([...(input.order || []), "duration", "distance", "pace"])].filter(f => ok[f]);
    const out = { minutes: null, distance: ok.distance ? dist : null, paceMin: ok.pace ? pace : null, computed: null, source: "none", paceSource: ok.pace ? "typed" : null, problems };
    // Something typed that doesn't read (yet): never work anything out over
    // it; say what's wrong and wait.
    if ((input.order || []).some(f => !blank(input[f]) && !ok[f])) {
        out.waiting = true;
        return out;
    }
    if (typed.length >= 2) {
        const use = typed.slice(0, 2);
        out.source = "two";
        if (!use.includes("duration")) {
            out.computed = "duration";
            out.minutes = Math.round(dist * pace);
        } else if (!use.includes("pace")) {
            out.computed = "pace";
            out.minutes = Math.round(dur);
            out.paceMin = dur / dist;
            out.paceSource = "worked out";
            if (out.paceMin < 3 || out.paceMin > 30) problems.push(`${Math.round(dur)} min for ${dist} mi is ${formatPace(out.paceMin)} a mile. Check the duration or the distance.`);
        } else {
            out.computed = "distance";
            out.minutes = Math.round(dur);
            out.distance = Math.round(dur / pace * 100) / 100;
        }
        return out;
    }
    if (ok.duration) return { ...out, minutes: Math.round(dur), source: "duration" };
    if (ok.distance) {
        const typical = paceMinutesPerMile({ workoutType: input.workoutType });
        return { ...out, minutes: Math.round(dist * typical), source: "distance-typical", paceMin: typical, paceSource: "typical" };
    }
    return out;
}

export function clampRound(value, min, max, step) {

    const rounded = Math.round(value / step) * step;

    return Math.min(max, Math.max(min, rounded));

}

/**
 * What a built plan actually gives against its targets, in plain words.
 * input: { durationMin, targets: { carbsPerHour, fluidPerHour, sodiumPerHour },
 *          planned: { carbs, sodium, fluidOz, caffeineMg } (whole run),
 *          bodyWeightLb, sweatRateMeasured (oz/hr) }
 * -> [{ kind: "carbs" | "sodium" | "fluid" | "caffeine", level: "warn" | "note", text }]
 * Fluid amounts carry {fluid:n} markers (oz) for the page to show in its unit.
 */
export function intakeChecks({ durationMin = 0, targets = {}, planned = {}, bodyWeightLb = 0, sweatRateMeasured = 0 } = {}) {
    const out = [];
    const hours = (Number(durationMin) || 0) / 60;
    if (!(hours > 0)) return out;
    const off = (have, want) => (want > 0 ? (have - want) / want : 0);
    const pct = x => `${Math.round(Math.abs(x) * 100)}%`;
    const carbsWant = Math.round((Number(targets.carbsPerHour) || 0) * hours);
    const carbsHave = Math.round(Number(planned.carbs) || 0);
    if (carbsWant > 0 && carbsHave > 0) {
        const d = off(carbsHave, carbsWant);
        if (d <= -0.2) out.push({ kind: "carbs", level: "warn", text: `The plan gives ${carbsHave} g of carbs, ${pct(d)} under the ${carbsWant} g target. Add a gel or more in the drink.` });
        else if (d >= 0.2) out.push({ kind: "carbs", level: "warn", text: `The plan gives ${carbsHave} g of carbs, ${pct(d)} over the ${carbsWant} g target. Only go above what you've practiced in training.` });
    }
    const sodiumWant = Math.round((Number(targets.sodiumPerHour) || 0) * hours);
    const sodiumHave = Math.round(Number(planned.sodium) || 0);
    if (sodiumWant > 0 && (carbsHave > 0 || sodiumHave > 0)) {
        const d = off(sodiumHave, sodiumWant);
        if (d <= -0.3) out.push({ kind: "sodium", level: "note", text: `The plan gives ${sodiumHave} mg of sodium, ${pct(d)} under the ${sodiumWant} mg target. Sodium needs vary a lot: salt tablets or an electrolyte mix close the gap if you need it.` });
        else if (d >= 0.3) out.push({ kind: "sodium", level: "note", text: `The plan gives ${sodiumHave} mg of sodium, ${pct(d)} over the ${sodiumWant} mg target.` });
    }
    const sweat = Number(sweatRateMeasured) || 0;
    const fluidHave = Number(planned.fluidOz) || 0;
    if (sweat > 0 && fluidHave > sweat * hours * 1.0) {
        out.push({ kind: "fluid", level: "warn", text: `The plan has you drinking {fluid:${Math.round(fluidHave)}}, more than the {fluid:${Math.round(sweat * hours)}} you're likely to sweat. Drinking more than you lose can dilute your blood sodium; drink to thirst and carry less.` });
    }
    const kg = (Number(bodyWeightLb) || 0) / 2.20462;
    const caffeine = Number(planned.caffeineMg) || 0;
    if (caffeine > 0 && kg > 0 && caffeine / kg > 6) {
        out.push({ kind: "caffeine", level: "warn", text: `${caffeine} mg of caffeine is about ${Math.round(caffeine / kg * 10) / 10} mg per kg of body weight. Most benefit comes at 3–6 mg/kg; more mostly adds side effects.` });
    }
    return out;
}
