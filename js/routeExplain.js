/* ==========================================
   Southbound — route explainer (pure, deterministic)

   Written from the route's own numbers only: distance, loop or point
   to point, climb range if fetched, surface split overall and by
   quarter, the names of any major roads it touches, and a verdict.
   Not an AI summary and not a coach's judgement. It never invents a
   street name.
========================================== */

import { CLASS_WORDS } from "./routeScore.js";

const mi = n => (Math.round(n * 100) / 100).toFixed(2);

/** { miles, loop, points, climb, overall, quarters } -> { lines: string[], verdict, gaps: string[] } */
export function explain({ miles, loop, points, climb = null, overall = null, quarters = [] }) {
    const lines = [`${mi(miles)} mi, ${loop ? "a loop that returns to its start" : "point to point"}, ${points} route points.`];
    lines.push(climb ? `Climb: ${climb.text} (a range, not exact).` : "Climb: not fetched yet.");
    if (!overall) {
        lines.push("No surface detail yet. The map data for this area has not loaded.");
        return { lines, verdict: null, gaps: [] };
    }
    lines.push(`Surface overall: ${overall.summary} (A ${CLASS_WORDS.A}, B ${CLASS_WORDS.B}, C ${CLASS_WORDS.C}, D ${CLASS_WORDS.D}, X ${CLASS_WORDS.X}).`);
    const gaps = overall.highwayNames.slice();
    if (overall.pcts.X > 0) {
        const named = gaps.length ? ` on ${gaps.join(", ")}` : "";
        lines.push(`${overall.pcts.X}% is on a major road${named}. Check those stretches before you run them.`);
    } else {
        lines.push("No major-road stretches.");
    }
    if (overall.pcts.D > 30) lines.push(`${overall.pcts.D}% is not mapped for walking. That is often a gap in the map, not bad ground. Look at it on Street View before you rule it out.`);
    quarters.forEach((q, i) => lines.push(`Quarter ${i + 1}: about ${mi(q.miles)} mi, ${q.score ? q.score.summary : "no surface data"}.`));
    let verdict;
    if (overall.ab >= 80) {
        verdict = "path";
        lines.push(`Verdict: mostly path and sidewalk (${overall.ab}% A+B).${overall.pcts.X > 0 ? " Check the major-road stretches first." : ""}`);
    } else if (overall.pcts.X > 20) {
        verdict = "majorRoad";
        lines.push(`Verdict: heavy on major roads (${overall.pcts.X}%). Try the sidewalk-first button, or move waypoints off them.`);
    } else {
        verdict = "mixed";
        lines.push(`Verdict: mixed surface (${overall.ab}% A+B). Usable. Check the X and D stretches first.`);
    }
    return { lines, verdict, gaps };
}
