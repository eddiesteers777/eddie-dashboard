/* ==========================================
   Southbound — weather and conditions on a run (pure)

   A hot, humid or windy run explains a slow pace, and a coach reading the
   log should know. The client taps what it was like when they log the run
   (up to three), saved as result.conditions: ["hot", "windy"].

   Tags, not an automatic forecast on purpose: Southbound never has a run's
   location (and never stores GPS), and a lookup would send where they run
   to a weather service. Idea from OpenAthlete's weather on activities
   (AGPL-3.0); original code. No DOM or storage. Unit-tested in
   tests/runConditions.test.mjs.
========================================== */

export const CONDITIONS = [
    { key: "hot", label: "Hot" },
    { key: "humid", label: "Humid" },
    { key: "cold", label: "Cold" },
    { key: "windy", label: "Windy" },
    { key: "rain", label: "Rain" },
    { key: "snow", label: "Snow or ice" }
];
export const MAX_CONDITIONS = 3;

const KEYS = CONDITIONS.map(c => c.key);

// Whatever was picked (or saved) -> known tags only, no repeats, at most three, in list order.
export function cleanConditions(input) {
    const picked = new Set(Array.isArray(input) ? input : []);
    return KEYS.filter(k => picked.has(k)).slice(0, MAX_CONDITIONS);
}

export const conditionLabel = key => CONDITIONS.find(c => c.key === key)?.label || "";

// "Hot · Humid" for showing, or "" when none.
export function conditionsText(input) {
    return cleanConditions(input).map(conditionLabel).join(" · ");
}
