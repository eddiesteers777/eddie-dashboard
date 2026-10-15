/* ==========================================
   The workout contour (premium shell, step 2)

   A structured run drawn as its effort profile: a flat step for each part
   (warm up, each rep, each recovery, cool down), the width by distance, the
   height by how hard it is. Pure: no DOM reads, no storage, so it is unit
   tested (tests/workoutContour.test.mjs). The page draws the SVG string.

   The steps come from the same workout the workout page uses (sets with
   repeat, recovery, warmup, cooldown; runWorkout.js). Paces are per mile.
========================================== */

import { parsePaceRange } from "./runWorkout.js";

const W = 1000, H = 200, BASE = 192, TOP = 14, MAX_LEVEL = 3.7;

// Miles for a distance step. A minute is about 8.3 minutes a mile, a
// metre is 1/1609 mile, a kilometre is 0.621 mile. Relative, so only the
// ratios matter for the drawing.
function milesOf(step) {
    if (!step || !Number.isFinite(Number(step.amount))) return 0;
    const n = Number(step.amount);
    if (step.unit === "mi") return n;
    if (step.unit === "km") return n * 0.621;
    if (step.unit === "m") return n / 1609;
    if (step.unit === "min") return n / 8.3;
    return 0;
}

// Effort height, 0..MAX_LEVEL. A pace makes it precise (faster is higher);
// without one, the phase sets it: easy parts low, work parts high.
function levelOf(step, phase) {
    const lo = parsePaceRange(step?.pace)?.lo;
    if (lo) return Math.max(0.5, Math.min(MAX_LEVEL, (660 - lo) / 260 * MAX_LEVEL / 2 + 0.6));
    if (phase === "work") return 2.9;
    if (phase === "recovery") return 0.9;
    return 1.1;
}

// The steps as a flat list of parts, in the order the run goes.
// [{ phase: warmup|work|recovery|cooldown, title, miles, level, set }]
export function contourParts(workout) {
    if (!workout) return [];
    const parts = [];
    if (workout.warmup) {
        parts.push({ phase: "warmup", title: "Warm up", miles: milesOf(workout.warmup), level: levelOf(workout.warmup, "warmup") });
    }
    (workout.sets || []).forEach((set, si) => {
        const reps = Math.max(1, Math.min(50, Math.round(Number(set.repeat) || 1)));
        for (let rep = 1; rep <= reps; rep++) {
            parts.push({ phase: "work", title: reps > 1 ? `Rep ${rep} of ${reps}` : "Main set", miles: milesOf(set), level: levelOf(set, "work"), set: si + 1 });
            if (set.recovery && rep < reps) {
                parts.push({ phase: "recovery", title: "Recover", miles: milesOf(set.recovery), level: levelOf(set.recovery, "recovery") });
            }
        }
    });
    if (workout.cooldown) {
        parts.push({ phase: "cooldown", title: "Cool down", miles: milesOf(workout.cooldown), level: levelOf(workout.cooldown, "cooldown") });
    }
    return parts.filter(p => p.miles > 0);
}

// The SVG for the parts. `id` keeps gradient ids unique when more than one card is on the page.
export function contourSvg(parts, { id = "wc", label = "" } = {}) {
    if (!parts.length) return "";
    const total = parts.reduce((t, p) => t + p.miles, 0);
    const yOf = level => BASE - (level / MAX_LEVEL) * (BASE - TOP);
    let x = 0;
    const segs = parts.map(p => {
        const x0 = x, x1 = x + (p.miles / total) * W;
        x = x1;
        return { ...p, x0, x1, y: yOf(p.level) };
    });
    // A flat step per part, with a rounded shoulder where the height changes.
    let top = `M0 ${segs[0].y.toFixed(1)}`;
    for (let i = 1; i < segs.length; i++) {
        const a = segs[i - 1], b = segs[i], xb = b.x0;
        const r = Math.min(16, (a.x1 - a.x0) * 0.32, (b.x1 - b.x0) * 0.32);
        top += ` L${(xb - r).toFixed(1)} ${a.y.toFixed(1)} C${xb.toFixed(1)} ${a.y.toFixed(1)} ${xb.toFixed(1)} ${b.y.toFixed(1)} ${(xb + r).toFixed(1)} ${b.y.toFixed(1)}`;
    }
    top += ` L${W} ${segs[segs.length - 1].y.toFixed(1)}`;
    const area = `${top} L${W} ${BASE} L0 ${BASE} Z`;
    const fill = { warmup: "wc-easy", cooldown: "wc-easy", recovery: "wc-rest", work: "wc-work" };
    const rects = segs.map(s => `<rect x="${s.x0.toFixed(1)}" y="0" width="${(s.x1 - s.x0 + 0.6).toFixed(1)}" height="${H}" fill="url(#${id}-${fill[s.phase]})"/>`).join("");
    const ticks = segs.slice(1).map(s => `<line x1="${s.x0.toFixed(1)}" x2="${s.x0.toFixed(1)}" y1="${(s.y - 2).toFixed(1)}" y2="${BASE}" stroke="rgba(11,26,20,.55)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join("");
    const summary = segs.map(s => `${s.title}${s.miles ? ` ${round(s.miles)} mi` : ""}`).join(", ");
    return `<svg class="wk-contour-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escAttr(label || summary)}">
        <defs>
            <linearGradient id="${id}-wc-work" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(244,226,192,.5)"/><stop offset="1" stop-color="rgba(214,185,142,.05)"/></linearGradient>
            <linearGradient id="${id}-wc-easy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(176,204,170,.42)"/><stop offset="1" stop-color="rgba(160,187,156,.03)"/></linearGradient>
            <linearGradient id="${id}-wc-rest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(236,230,212,.2)"/><stop offset="1" stop-color="rgba(236,230,212,.02)"/></linearGradient>
            <clipPath id="${id}-clip"><path d="${area}"/></clipPath>
        </defs>
        <line x1="0" x2="${W}" y1="${BASE}" y2="${BASE}" stroke="rgba(236,230,212,.16)" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <g clip-path="url(#${id}-clip)">${rects}</g>
        ${ticks}
        <path d="${top}" fill="none" stroke="#F2EDE1" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function round(n) { return Math.round(n * 10) / 10; }
function escAttr(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
