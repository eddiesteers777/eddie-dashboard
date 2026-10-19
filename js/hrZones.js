// Heart-rate training zones from one or two numbers the runner knows. Pure: no DOM, no storage.
//
// Three published methods, written from their public definitions:
//   threshold  Joe Friel's running zones, as a share of lactate-threshold heart rate (LTHR).
//   max        A share of maximum heart rate (the common five-zone split).
//   reserve    Karvonen: resting HR + a share of heart-rate reserve (max − resting).
//
// Zones come back as whole beats per minute with no gaps: each zone starts one beat
// above the last one's top. The first zone has no floor (low: null) for the threshold
// method, and the last has no ceiling (high: null), because those zones are open-ended.

const FRIEL_RUN = [
    { key: "1", name: "Recovery", to: 0.85 },
    { key: "2", name: "Aerobic", to: 0.90 },
    { key: "3", name: "Tempo", to: 0.95 },
    { key: "4", name: "Sub-threshold", to: 1.00 },
    { key: "5a", name: "Super-threshold", to: 1.03 },
    { key: "5b", name: "Aerobic capacity", to: 1.07 },
    { key: "5c", name: "Anaerobic capacity", to: null }
];

const FIVE = [
    { key: "1", name: "Recovery", from: 0.50, to: 0.60 },
    { key: "2", name: "Easy aerobic", to: 0.70 },
    { key: "3", name: "Tempo", to: 0.80 },
    { key: "4", name: "Threshold", to: 0.90 },
    { key: "5", name: "Hard (VO2 max)", to: 1.00 }
];

export const HR_METHODS = ["threshold", "max", "reserve"];

const whole = n => Math.round(n);
const isBpm = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;

/** Joins boundaries into gap-free zones: [lowest, b1 − 1], [b1, b2 − 1], … */
function stitch(bands, floor, edges, ceiling) {
    return bands.map((band, i) => ({
        key: band.key,
        name: band.name,
        low: i === 0 ? floor : edges[i - 1],
        high: i === bands.length - 1 ? ceiling : edges[i] - 1
    }));
}

/**
 * hrZones({ method, lthr, max, rest }) → { method, zones: [{ key, name, low, high }] } or { error }.
 * low / high are inclusive bpm; null means open-ended.
 */
export function hrZones({ method, lthr, max, rest } = {}) {
    if (method === "threshold") {
        const t = Number(lthr);
        if (!isBpm(t, 100, 220)) return { error: "Enter a threshold heart rate between 100 and 220." };
        const edges = FRIEL_RUN.slice(0, -1).map(b => whole(t * b.to));
        return { method, zones: stitch(FRIEL_RUN, null, edges, null) };
    }
    if (method === "max" || method === "reserve") {
        const m = Number(max);
        if (!isBpm(m, 120, 230)) return { error: "Enter a maximum heart rate between 120 and 230." };
        let base = 0, span = m;
        if (method === "reserve") {
            const r = Number(rest);
            if (!isBpm(r, 30, 110)) return { error: "Enter a resting heart rate between 30 and 110." };
            if (r >= m - 40) return { error: "Resting heart rate should be well below your maximum." };
            base = r; span = m - r;
        }
        const at = pct => whole(base + span * pct);
        const edges = FIVE.slice(0, -1).map(b => at(b.to));
        return { method, zones: stitch(FIVE, at(FIVE[0].from), edges, m) };
    }
    return { error: "Choose a method." };
}

/** "142–151 bpm", "Under 142 bpm", "175+ bpm". */
export function zoneRange({ low, high }) {
    if (low == null && high == null) return "";
    if (low == null) return `Under ${high + 1} bpm`;
    if (high == null) return `${low}+ bpm`;
    return `${low}–${high} bpm`;
}
