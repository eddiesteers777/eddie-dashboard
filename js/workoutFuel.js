/* ==========================================
   Southbound — the fuel plan on a workout (pure)

   A long run shouldn't send the athlete off to a separate Fueling page.
   Every planned run gets Before / During / After:
     - how long it'll take (from the plan: miles x a pace for the type)
     - targets per hour (js/fuelTargets.js, the same math as the Fueling
       page) from the athlete's own inputs on their last saved fueling
       plan, or sensible defaults
     - during: which gels from their Fueling Library, at what time and
       mile (js/fuelSchedule.js), caffeinated ones last
     - before and after: what and when, scaled to the run
     - the coach's own fueling note for that workout, first
   No DOM or storage: js/workoutPage.js and js/weekView.js pass in the
   athlete's library and last plan. Unit-tested in tests/workoutFuel.test.mjs.
========================================== */

import { calculateTargets, paceMinutesPerMile } from "./fuelTargets.js";
import { buildSchedule, formatClock, DEFAULT_FIRST_GEL_MIN } from "./fuelSchedule.js";

// Plan day types -> the Fueling page's workout types.
const TYPE_MAP = { easy: "easy", recovery: "recovery", long: "long", workout: "workout", tempo: "workout", race: "race" };

// A gel for when their library has none.
const GENERIC_GEL = { name: "Energy gel", carbs: 25, sodium: 50, fluid: 0, caffeine: false };

// Inputs we reuse from their last saved fueling plan (the Fueling page's form).
const PROFILE_KEYS = ["bodyWeight", "currentCarbIntake", "tolerance", "stomachSensitivity", "temperature",
    "humidity", "sweatRate", "sweatSodium", "typicalSodiumIntake", "caffeineWanted"];

export function profileFromPlans(savedPlans) {
    const latest = [...(savedPlans || [])]
        .filter(p => p?.session)
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    if (!latest) return {};
    const out = {};
    for (const key of PROFILE_KEYS) if (latest.session[key] !== undefined) out[key] = latest.session[key];
    if (latest.caffeine) out.caffeineWanted = true;
    return out;
}

// Their gels (and chews): a plain one, and a caffeinated one if they have it.
export function pickGels(library, wantsCaffeine) {
    const fuel = (library || []).filter(i => ["gels", "chews"].includes(i.category) && Number(i.carbs) > 0);
    const plain = fuel.find(i => !i.caffeine) || fuel[0] || GENERIC_GEL;
    const caffeinated = wantsCaffeine ? fuel.find(i => i.caffeine) || null : null;
    return { plain, caffeinated };
}

const roundTo = (n, step) => Math.round(n / step) * step;

/**
 * run: { type, miles, durationMin?, coachNote? }
 * options: { profile (from profileFromPlans), library (their Fueling Library) }
 * -> { level: "none" | "light" | "full", durationMin, miles, targets, gels,
 *      schedule, before: [{ when, text }], during: [lines], after: [lines],
 *      coachNote, summary }
 */
export function fuelForRun(run, { profile = {}, library = [] } = {}) {
    const type = TYPE_MAP[run?.type] || "easy";
    const miles = Math.max(0, Number(run?.miles) || 0);
    const durationMin = Number(run?.durationMin) > 0
        ? Math.round(Number(run.durationMin))
        : Math.round(miles * paceMinutesPerMile({ workoutType: type }));
    const mode = type === "race" ? "race" : "training";
    const targets = calculateTargets({ ...profile, workoutType: type, duration: durationMin, distance: miles, mode });
    const hard = type === "workout" || type === "race";
    const level = durationMin < 60 && type !== "long" && type !== "race" ? "none"
        : durationMin < 75 && type !== "long" && type !== "race" ? "light"
        : "full";
    const lbs = Number(profile.bodyWeight) || 0;
    const coachNote = String(run?.coachNote || "").trim();

    // ---- During: gels from their library, spread by the schedule ----
    let schedule = null;
    let gels = [];
    if (level !== "none" && targets.carbsPerHour > 0) {
        // Caffeine only earns its place on long / hard fueling, and last.
        const { plain, caffeinated } = pickGels(library, level === "full" && profile.caffeineWanted);
        const need = targets.carbsPerHour * (durationMin / 60);
        let count = Math.max(1, Math.round(need / (Number(plain.carbs) || 25)));
        // No gel in the last 15 minutes: cap by the room there is.
        const room = Math.max(1, Math.floor((durationMin - DEFAULT_FIRST_GEL_MIN - 15) / 15) + 1);
        count = Math.min(count, room);
        const items = [{ ...plain, qty: caffeinated ? count - 1 : count }];
        if (caffeinated && count > 0) items.push({ ...caffeinated, qty: 1 });
        schedule = buildSchedule({
            durationMin, distanceMi: miles, items: items.filter(i => i.qty > 0), drink: null,
            targets, firstGelMin: DEFAULT_FIRST_GEL_MIN
        });
        gels = schedule.gels.map(g => ({ ...g, clock: formatClock(g.min) }));
    }
    const during = level === "none"
        ? ["No fuel needed. Water if it's hot."]
        : [
            `${targets.carbsPerHour} g carbs an hour${gels.length ? ` -- ${gels.length} gel${gels.length === 1 ? "" : "s"}` : ""}`,
            `${targets.fluidPerHour} oz fluid an hour`,
            `${targets.sodiumPerHour} mg sodium an hour`
        ];

    // ---- Before ----
    const before = [];
    if (level === "full") {
        const carbs = lbs ? `about ${roundTo(lbs * 0.45, 10)} g of carbs` : "a carb-focused meal";
        before.push({ when: "2-3 hours before", text: `${carbs[0].toUpperCase()}${carbs.slice(1)}${lbs ? " -- e.g." : ", e.g."} oatmeal + banana, or a bagel with honey. Low fat and fiber.` });
        before.push({ when: "15-30 min before", text: type === "race" ? "Half a banana or a few sips of sports drink. Caffeine now if you use it." : "Half a banana or a few sips of sports drink." });
    } else if (level === "light" || hard) {
        before.push({ when: "1-2 hours before", text: "Something light and easy to digest -- banana + toast, or a plain bagel." });
    } else {
        before.push({ when: "Before", text: "Eat normally. A light snack 1-2 hours before if you're hungry." });
    }

    // ---- After ----
    const after = [];
    if (level === "full" || hard) {
        const carbs = lbs ? `about ${roundTo(lbs * 0.45, 10)} g carbs` : "60-80 g carbs";
        after.push(`Within 30-60 min: ${carbs} + 20-30 g protein (e.g. chocolate milk and a bagel).`);
        after.push("Drink 16-24 oz over the next hour -- more if it was hot or you finished thirsty.");
    } else {
        after.push("Your next normal meal, with some protein, within a couple of hours.");
    }

    const summary = level === "none" ? ""
        : `${gels.length ? `${gels.length} gel${gels.length === 1 ? "" : "s"}, first at ${formatClock(gels[0].min)}` : `${targets.carbsPerHour} g carbs/hr`} · ${targets.fluidPerHour} oz/hr`;

    return { level, durationMin, miles, targets, gels, schedule, before, during, after, coachNote, summary };
}

// Minute marks for workout mode's "Gel now" cue.
export function gelCues(fuel) {
    return (fuel?.gels || []).map(g => ({ min: g.min, name: g.name, caffeine: g.caffeine }));
}
