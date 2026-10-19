/* ==========================================
   Southbound — heart rate zones (pure)

   Five training zones from a runner's max heart rate, and their resting
   heart rate when they know it:
     - with a resting HR, zones are a share of the heart rate reserve
       (max − resting, the Karvonen method), which fits fit runners
       with a low resting HR better
     - without one, zones are a share of max HR
   Max HR can be estimated from age (Tanaka: 208 − 0.7 × age) when the
   runner hasn't measured it; the tool says it's an estimate.

   Zones are whole beats and never overlap: a shared boundary belongs to
   the higher zone, so Z2 ends one beat below where Z3 starts.

   Idea from OpenAthlete (AGPL-3.0, github.com/openathleteorg/openathlete);
   this is original code, none of theirs is copied.
   No DOM or storage. Unit-tested in tests/heartZones.test.mjs.
========================================== */

export const ZONES = [
    { zone: 1, name: "Recovery", lowPct: 50, highPct: 60, feel: "Very easy. Warm-ups, cool-downs and recovery jogs." },
    { zone: 2, name: "Easy", lowPct: 60, highPct: 70, feel: "Conversational. Most of your running lives here." },
    { zone: 3, name: "Steady", lowPct: 70, highPct: 80, feel: "Comfortably hard. Marathon effort for many runners." },
    { zone: 4, name: "Threshold", lowPct: 80, highPct: 90, feel: "Hard but controlled. Tempo runs and cruise intervals." },
    { zone: 5, name: "Hard", lowPct: 90, highPct: 100, feel: "Very hard. Short intervals and the end of a race." }
];

const wholeNumber = value => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

// Tanaka et al. (2001): a better fit across ages than 220 − age.
export function estimateMaxHr(age) {
    const years = Number(age);
    if (!Number.isFinite(years) || years < 10 || years > 100) return null;
    return Math.round(208 - 0.7 * years);
}

// Checks the inputs and says what's wrong in plain words, or returns null.
export function zoneInputError({ maxHr, restHr } = {}) {
    const max = wholeNumber(maxHr);
    if (!max) return "Enter your max heart rate, or your age to estimate it.";
    if (max < 120 || max > 230) return "Max heart rate should be between 120 and 230 beats per minute.";
    if (restHr === undefined || restHr === null || restHr === "") return null;
    const rest = wholeNumber(restHr);
    if (!rest || rest < 30 || rest > 110) return "Resting heart rate should be between 30 and 110 beats per minute.";
    if (max - rest < 60) return "Resting heart rate looks too close to max. Check both numbers.";
    return null;
}

// The five zones in beats per minute. Throws on inputs zoneInputError() rejects.
export function heartRateZones({ maxHr, restHr } = {}) {
    const problem = zoneInputError({ maxHr, restHr });
    if (problem) throw new Error(problem);
    const max = wholeNumber(maxHr);
    const rest = wholeNumber(restHr);
    const base = rest || 0;
    const range = max - base;
    const at = pct => Math.round(base + range * pct / 100);
    return {
        method: rest ? "reserve" : "max",
        maxHr: max,
        restHr: rest,
        zones: ZONES.map((z, i) => ({
            ...z,
            low: at(z.lowPct),
            // The top of every zone but the last stops one beat below the next zone.
            high: i === ZONES.length - 1 ? max : at(z.highPct) - 1
        }))
    };
}

// Which zone a heart rate falls in (1–5), 0 below zone 1, null without zones.
export function zoneFor(hr, result) {
    const beats = Number(hr);
    if (!result || !Number.isFinite(beats)) return null;
    const hit = result.zones.find(z => beats >= z.low && beats <= z.high);
    if (hit) return hit.zone;
    return beats > result.maxHr ? 5 : 0;
}
