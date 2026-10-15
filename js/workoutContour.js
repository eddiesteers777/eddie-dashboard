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

const trim = n => String(Math.round(n * 100) / 100);

// A step's own size as she reads it: "1.25 mi", "2 min", "400 m" (never an estimate in other units).
function sizeOf(step) {
    const n = Number(step?.amount);
    if (!Number.isFinite(n) || !["mi", "km", "m", "min"].includes(step?.unit)) return "";
    return `${trim(n)} ${step.unit}`;
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
        parts.push({ phase: "warmup", title: "Warm up", size: sizeOf(workout.warmup), miles: milesOf(workout.warmup), level: levelOf(workout.warmup, "warmup") });
    }
    (workout.sets || []).forEach((set, si) => {
        const reps = Math.max(1, Math.min(50, Math.round(Number(set.repeat) || 1)));
        for (let rep = 1; rep <= reps; rep++) {
            parts.push({ phase: "work", title: reps > 1 ? `Rep ${rep} of ${reps}` : "Main set", size: sizeOf(set), miles: milesOf(set), level: levelOf(set, "work"), set: si + 1 });
            if (set.recovery && rep < reps) {
                parts.push({ phase: "recovery", title: "Recover", size: sizeOf(set.recovery), miles: milesOf(set.recovery), level: levelOf(set.recovery, "recovery") });
            }
        }
    });
    if (workout.cooldown) {
        parts.push({ phase: "cooldown", title: "Cool down", size: sizeOf(workout.cooldown), miles: milesOf(workout.cooldown), level: levelOf(workout.cooldown, "cooldown") });
    }
    // Every step stays, one part each in the same order as executionSteps (js/runWorkout.js), so the
    // workout mode can light "step 3 of 7" by its index; a step with no length still gets a sliver.
    return parts.map(p => ({ ...p, miles: Math.max(p.miles, 0.05) }));
}

// The SVG for the parts. `id` keeps gradient ids unique when more than one card is on the page.
// `active` (optional, a part's index): the workout mode lights the current part, shows the parts
// already run in sage, and dims the ones still to come.
export function contourSvg(parts, { id = "wc", label = "", active = null } = {}) {
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
    const isLive = Number.isInteger(active);
    const rects = segs.map((s, i) => {
        const g = !isLive ? fill[s.phase] : i < active ? "wc-done" : i === active ? "wc-lit" : fill[s.phase];
        const dim = isLive && i > active ? ` opacity=".5"` : "";
        return `<rect x="${s.x0.toFixed(1)}" y="0" width="${(s.x1 - s.x0 + 0.6).toFixed(1)}" height="${H}" fill="url(#${id}-${g})"${dim}/>`;
    }).join("");
    // "You are here": a bright bar along the baseline under the current part, so even a short recovery reads.
    const here = isLive && segs[active] ? `<rect x="${segs[active].x0.toFixed(1)}" y="${BASE - 5}" width="${Math.max(8, segs[active].x1 - segs[active].x0).toFixed(1)}" height="5" fill="#F4E2C0"/>` : "";
    const ticks = segs.slice(1).map(s => `<line x1="${s.x0.toFixed(1)}" x2="${s.x0.toFixed(1)}" y1="${(s.y - 2).toFixed(1)}" y2="${BASE}" stroke="rgba(11,26,20,.55)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join("");
    const summary = segs.map(s => `${s.title}${s.miles ? ` ${round(s.miles)} mi` : ""}`).join(", ");
    return `<svg class="wk-contour-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escAttr(label || summary)}">
        <defs>
            <linearGradient id="${id}-wc-work" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(244,226,192,.5)"/><stop offset="1" stop-color="rgba(214,185,142,.05)"/></linearGradient>
            <linearGradient id="${id}-wc-easy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(176,204,170,.42)"/><stop offset="1" stop-color="rgba(160,187,156,.03)"/></linearGradient>
            <linearGradient id="${id}-wc-rest" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(236,230,212,.2)"/><stop offset="1" stop-color="rgba(236,230,212,.02)"/></linearGradient>
            <linearGradient id="${id}-wc-done" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(176,204,170,.7)"/><stop offset="1" stop-color="rgba(160,187,156,.08)"/></linearGradient>
            <linearGradient id="${id}-wc-lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(244,226,192,.92)"/><stop offset="1" stop-color="rgba(214,185,142,.18)"/></linearGradient>
            <clipPath id="${id}-clip"><path d="${area}"/></clipPath>
        </defs>
        <line x1="0" x2="${W}" y1="${BASE}" y2="${BASE}" stroke="rgba(236,230,212,.16)" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <g clip-path="url(#${id}-clip)">${rects}</g>
        ${ticks}
        ${here}
        <path d="${top}" fill="none" stroke="#F2EDE1" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

// The labels under the picture, one per stretch of the run, each as wide as its stretch:
// "Warm up 1.25 mi", "Main set 3 × 1 mi", "Cool down 1.25 mi". -> [{ name, detail, miles }]
export function contourLabels(parts) {
    const total = parts.reduce((t, p) => t + p.miles, 0);
    if (!parts.length || !(total > 0)) return [];
    const groups = [];
    for (const p of parts) {
        const key = p.phase === "warmup" ? "warmup" : p.phase === "cooldown" ? "cooldown" : "main";
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.parts.push(p);
        else groups.push({ key, parts: [p] });
    }
    return groups.map(g => {
        const miles = g.parts.reduce((t, p) => t + p.miles, 0);
        const works = g.parts.filter(p => p.phase === "work");
        const same = works.length > 1 && works.every(w => w.size && w.size === works[0].size);
        const detail = g.key === "main"
            ? (same ? `${works.length} × ${works[0].size}` : works.length === 1 ? works[0].size : `${trim(miles)} mi`)
            : g.parts[0].size;
        return { name: { warmup: "Warm up", cooldown: "Cool down", main: "Main set" }[g.key], detail: detail || "", miles };
    });
}

export function contourLabelsHtml(parts) {
    const labels = contourLabels(parts);
    if (!labels.length) return "";
    // As wide as the stretch, but never narrower than its own words ("Cool down 1.25 mi" on one line).
    const cols = labels.map(l => `minmax(max-content,${Math.max(l.miles, 0.05).toFixed(3)}fr)`).join(" ");
    const last = labels.length - 1;
    return `<div class="wk-contour-labels" style="grid-template-columns:${cols}">${labels.map((l, i) => `<span${labels.length > 1 && i === last ? ` class="is-last"` : ""}>${escAttr(l.name)}${l.detail ? ` <b>${escAttr(l.detail)}</b>` : ""}</span>`).join("")}</div>`;
}

function round(n) { return Math.round(n * 10) / 10; }
function escAttr(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
