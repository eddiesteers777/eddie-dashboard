/* ==========================================
   The course map on a fueling plan (premium shell, details): the run as a
   profile, with the gels on the line and each bottle a shaded zone.

   The height is the workout's own effort, not terrain (the app has no
   elevation): when the plan came from a structured workout the hard reps
   stand tall and the jogs, warm-up and cool-down sit low; otherwise the run is
   one flat line, and no claim is made. Pure: no DOM reads, so it is unit
   tested (tests/fuelCourse.test.mjs). Fed by buildSchedule() in js/fuelSchedule.js.
========================================== */

import { formatClock } from "./fuelSchedule.js";

const W = 700, H = 180, BASE = 170, TOP = 44;

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mi = value => (value == null ? "" : value.toFixed(1));
const yOf = level => BASE - level * (BASE - TOP);

// The run as stretches with a height each, 0..1: [{ fromMin, toMin, level }].
export function courseLevels(s) {
    if (!s.profile?.length) return [{ fromMin: 0, toMin: s.durationMin, level: 0.4 }];
    const paces = s.profile.map(p => p.minPerMile).filter(p => p > 0);
    const fast = Math.min(...paces), slow = Math.max(...paces);
    const spread = slow - fast;
    return s.profile.map(p => ({
        fromMin: p.fromMin,
        toMin: p.toMin,
        level: p.minPerMile == null ? 0.12
            : spread < 0.15 ? 0.4
            : 0.22 + 0.7 * ((slow - p.minPerMile) / spread)
    }));
}

const xOf = (min, duration) => (duration > 0 ? Math.min(1, Math.max(0, min / duration)) : 0) * W;

// The outline: a flat run per stretch, a rounded shoulder where the effort changes.
function outlineOf(levels, duration) {
    const segs = levels.map(l => ({ x0: xOf(l.fromMin, duration), x1: xOf(l.toMin, duration), y: yOf(l.level) }));
    let d = `M0 ${segs[0].y.toFixed(1)}`;
    for (let i = 1; i < segs.length; i++) {
        const a = segs[i - 1], b = segs[i], x = b.x0;
        if (Math.abs(a.y - b.y) < 0.5) { d += ` L${x.toFixed(1)} ${b.y.toFixed(1)}`; continue; }
        const r = Math.min(12, (a.x1 - a.x0) * 0.32, (b.x1 - b.x0) * 0.32);
        d += ` L${(x - r).toFixed(1)} ${a.y.toFixed(1)} C${x.toFixed(1)} ${a.y.toFixed(1)} ${x.toFixed(1)} ${b.y.toFixed(1)} ${(x + r).toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return { d: `${d} L${W} ${segs[segs.length - 1].y.toFixed(1)}`, yAt: min => {
        const seg = segs.find(sg => xOf(min, duration) <= sg.x1 + 0.01) || segs[segs.length - 1];
        return seg.y;
    } };
}

// What a screen reader hears for the picture.
function describe(s, fluid) {
    const span = b => (b.startMile != null && b.endMile != null ? `mile ${mi(b.startMile)} to ${mi(b.endMile)}` : `${formatClock(b.startMin)} to ${formatClock(b.endMin)}`);
    const parts = [`The run, ${s.distanceMi ? `${mi(s.distanceMi)} mi in ` : ""}${formatClock(s.durationMin)}.`];
    s.bottles.forEach(b => parts.push(`Bottle ${b.n}, ${fluid(b.oz)}, covers ${span(b)}.`));
    s.gels.forEach(g => parts.push(`Gel ${g.n} at ${g.mile != null ? `mile ${mi(g.mile)}` : formatClock(g.min)}.`));
    return parts.join(" ");
}

// The map: the profile, gels on the line, bottle zones, an axis, and what each mark means.
export function courseHtml(s, { fluid = oz => `${oz} oz`, id = "fsm" } = {}) {
    const d = s.durationMin;
    const levels = courseLevels(s);
    const line = outlineOf(levels, d);
    const zones = (s.bottles.length ? s.bottles : [{ n: 1, startMin: 0, endMin: d, oz: 0, whole: true }]).map((b, i) =>
        `<rect x="${xOf(b.startMin, d).toFixed(1)}" y="0" width="${(xOf(b.endMin, d) - xOf(b.startMin, d) + (i ? 0.6 : 0)).toFixed(1)}" height="${H}" fill="url(#${id}-${i % 2 ? "b" : "a"})"/>`).join("");
    const dividers = s.bottles.slice(1).map(b => `<line x1="${xOf(b.startMin, d).toFixed(1)}" x2="${xOf(b.startMin, d).toFixed(1)}" y1="6" y2="${BASE}" stroke="rgba(11,26,20,.6)" stroke-width="2"/>`).join("");
    const sips = (s.sips || []).map(p => `<rect x="${xOf(p.startMin, d).toFixed(1)}" y="${BASE - 7}" width="${Math.max(2, xOf(p.endMin, d) - xOf(p.startMin, d)).toFixed(1)}" height="7" rx="3" fill="rgba(244,226,192,.7)"/>`).join("");
    const dots = s.gels.map(g => `<circle cx="${xOf(g.min, d).toFixed(1)}" cy="${line.yAt(g.min).toFixed(1)}" r="7" fill="${g.caffeine ? "#ECD6B0" : "#F2EDE1"}" stroke="#0B1A14" stroke-width="3"/>`).join("");
    const gelTags = s.gels.map(g => `<span class="fs-gel-tag" style="left:${(xOf(g.min, d) / W * 100).toFixed(2)}%;top:${((line.yAt(g.min) - 14) / H * 100).toFixed(2)}%">Gel ${g.n}</span>`).join("");
    const zoneTags = s.bottles.map(b => `<span class="fs-zone-tag" style="left:${(xOf(b.startMin, d) / W * 100).toFixed(2)}%">Bottle ${b.n}${b.oz ? ` · ${esc(fluid(b.oz))}` : ""}</span>`).join("");
    const caption = s.profile?.length ? `<p class="fs-map-note">Height shows the workout's pace: higher is faster.</p>` : "";
    return `
        <div class="fs-map" role="img" aria-label="${esc(describe(s, fluid))}">
            <div class="fs-map-plot">
                <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
                    <defs>
                        <linearGradient id="${id}-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(176,204,170,.6)"/><stop offset="1" stop-color="rgba(160,187,156,.04)"/></linearGradient>
                        <linearGradient id="${id}-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(236,230,212,.34)"/><stop offset="1" stop-color="rgba(236,230,212,.03)"/></linearGradient>
                        <clipPath id="${id}-clip"><path d="${line.d} L${W} ${BASE} L0 ${BASE} Z"/></clipPath>
                    </defs>
                    <line x1="0" x2="${W}" y1="${BASE}" y2="${BASE}" stroke="rgba(236,230,212,.16)"/>
                    <g clip-path="url(#${id}-clip)">${zones}</g>
                    ${dividers}
                    <path d="${line.d}" fill="none" stroke="#F2EDE1" stroke-width="2.2" stroke-linejoin="round"/>
                    ${sips}${dots}
                </svg>
                ${gelTags}${zoneTags}
            </div>
            <div class="fs-map-axis">
                <span>Start</span>
                ${s.distanceMi ? `<span>Mile ${mi(s.midMile ?? s.distanceMi / 2)}</span>` : `<span>${formatClock(d / 2)}</span>`}
                <span>${s.distanceMi ? `Finish, mile ${mi(s.distanceMi)}` : "Finish"} · ${formatClock(d)}</span>
            </div>
            ${caption}
            <div class="fs-legend" aria-hidden="true">
                ${s.gels.length ? `<span><i class="fs-dot fs-dot-gel"></i>Gel</span>` : ""}
                ${s.gels.some(g => g.caffeine) ? `<span><i class="fs-dot fs-dot-caffeine"></i>Caffeinated</span>` : ""}
                ${s.bottles.length ? `<span><i class="fs-dot fs-dot-bottle"></i>Bottle</span>` : ""}
                ${s.sips?.length ? `<span><i class="fs-dot fs-dot-sip"></i>Drink mix</span>` : ""}
            </div>
        </div>`;
}
