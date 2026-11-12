/* ==========================================
   Southbound — the animated Today greeting (option C, picked by Eddie 2026-11-12)

   A gold sheen sweeps the greeting, then the four logo lines draw in under it
   and merge into the dot. The shape is the logo's own (brand/sb-mark.svg):
   four parallel lines, 10 apart, each easing down onto one line, then the dot,
   stretched to the width of the box. Plays once when Today opens; with reduced
   motion it is just drawn (css/greeting.css). Pure path maths so it is unit tested.
========================================== */

export const TRAIL = { w: 320, h: 56, stroke: 6, dot: 4.5 };
const COLORS = ["#C7D6E4", "#8FC3EE", "#8FD0B2", "#D2AD62"];   // the logo's lines, top to bottom
const START_Y = [4, 14, 24, 34];
const END_Y = 49;
const X0 = 3;

/** The four paths and the dot, in the TRAIL box. -> { paths: [{ d, color }], dot: { cx, cy, r } } */
export function trailShape({ w, h, dot } = TRAIL) {
    const xe = w - 16;                       // where the lines meet the dot's line
    const c1 = +(X0 + 0.515 * (xe - X0)).toFixed(1);   // the logo's control points, scaled to this width
    const c2 = +(X0 + 0.603 * (xe - X0)).toFixed(1);
    return {
        paths: START_Y.map((y, i) => ({ d: `M${X0} ${y} C${c1} ${y} ${c2} ${END_Y} ${xe} ${END_Y}`, color: COLORS[i] })),
        dot: { cx: w - dot, cy: END_Y, r: dot },
        h
    };
}

export function trailSvg(shape = trailShape()) {
    const { w, h } = TRAIL;
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
        + shape.paths.map((p, i) => `<path d="${p.d}" stroke="${p.color}" pathLength="1" style="--i:${i}"/>`).join("")
        + `<circle cx="${shape.dot.cx}" cy="${shape.dot.cy}" r="${shape.dot.r}"/></svg>`;
}

/** Add the sheen to the greeting and the trail under it (once). */
export function addGreetingTrail(heading) {
    if (!heading || heading.dataset.grDone) return;
    heading.dataset.grDone = "1";
    heading.classList.add("gr-sheen");
    const trail = document.createElement("div");
    trail.className = "gr-trail";
    trail.innerHTML = trailSvg();
    heading.insertAdjacentElement("afterend", trail);
}
