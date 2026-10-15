/* ==========================================
   The workout ribbon (Today's card, chosen 2026-10-15: "glass pills").

   A structured run as three glass pills in running order: the warm up, the
   main set, the cool down. The main set is one pill however many reps it has,
   labelled "3 × 1 mi · 7:05–7:15/mi"; its width is the miles it covers, so the
   pills still show where the hard part sits. Pure: no DOM, no storage, so it is
   unit tested (tests/workoutRibbon.test.mjs). The card draws it with ribbonHtml().
========================================== */

import { contourParts } from "./workoutContour.js";
import { paceRangeText } from "./runWorkout.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// [{ kind: "easy" | "hard", miles, label }] in running order. Empty for a run with no steps.
export function ribbonSegments(workout) {
    const parts = contourParts(workout);
    if (!parts.length) return [];
    const warm = parts[0].phase === "warmup" ? parts[0] : null;
    const cool = parts.at(-1).phase === "cooldown" ? parts.at(-1) : null;
    const middle = parts.slice(warm ? 1 : 0, cool ? parts.length - 1 : parts.length);

    const segments = [];
    if (warm) segments.push({ kind: "easy", miles: warm.miles, label: warm.size || "Warm up" });
    if (middle.length) {
        const miles = middle.reduce((sum, p) => sum + p.miles, 0);
        const work = middle.filter(p => p.phase === "work");
        const sizes = [...new Set(work.map(p => p.size))];
        const reps = work.length;
        let label = sizes.length === 1 ? (reps > 1 ? `${reps} × ${sizes[0]}` : sizes[0]) : "Main set";
        // One set has one pace; with several sets the pace would be a guess, so it is left out.
        const pace = workout.sets?.length === 1 ? paceRangeText(workout.sets[0].pace).replace("/mi", "") : "";
        if (pace) label += ` · ${pace}`;
        segments.push({ kind: "hard", miles, label });
    }
    if (cool) segments.push({ kind: "easy", miles: cool.miles, label: cool.size || "Cool down" });
    return segments;
}

// The pills, with each segment's words under it. The words are read once, from the picture's label.
export function ribbonHtml(segments) {
    if (!segments.length) return "";
    const aria = segments.map(s => s.label).join(", ");
    const bar = segments.map(s => `<span class="wk-ribbon-pill${s.kind === "hard" ? " is-hard" : ""}" style="flex:${s.miles} 1 0"></span>`).join("");
    const names = segments.map(s => `<span class="wk-ribbon-name${s.kind === "hard" ? " is-hard" : ""}" style="flex:${s.miles} 1 0">${esc(s.label)}</span>`).join("");
    return `<div class="wk-ribbon" role="img" aria-label="${esc(aria)}"><div class="wk-ribbon-bar">${bar}</div><div class="wk-ribbon-names" aria-hidden="true">${names}</div></div>`;
}
