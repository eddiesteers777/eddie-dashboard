/* ==========================================
   Southbound — safety along the route (routes.html)

   One bar from start to finish, each ~100 m stretch filled with its
   safety colour AND its own texture, with the letter (G / LG / Y / O /
   LR / R) on every stretch wide enough to hold it, so the scale never
   relies on colour alone. Missing map data is a grey hatch with "?".
   Busy-road crossings sit under the bar: S signal, M marked,
   U unmarked, ? not mapped. Tap, hover or arrow keys pick a stretch.
========================================== */

import { BANDS, UNKNOWN } from "./routeSafety.js";

/* Texture per band, drawn over the colour. Shared by the strip and the legend. */
const TEXTURE = {
    G: "",
    LG: '<circle cx="3" cy="3" r="1.1" fill="#10161b" fill-opacity=".35"/>',
    Y: '<path d="M0 6 L6 0" stroke="#10161b" stroke-opacity=".3" stroke-width="1.2"/>',
    O: '<path d="M0 3 H6" stroke="#10161b" stroke-opacity=".32" stroke-width="1.2"/>',
    LR: '<path d="M0 6 L6 0 M0 0 L6 6" stroke="#10161b" stroke-opacity=".3" stroke-width="1"/>',
    R: '<path d="M0 0 L6 6 M-3 3 L3 9 M3 -3 L9 3" stroke="#fff" stroke-opacity=".45" stroke-width="1.2"/>',
    "?": '<path d="M0 6 L6 0 M-3 3 L3 -3 M3 9 L9 3" stroke="#c9cdd1" stroke-width="1.6"/>'
};
export const darkBand = id => id === "G" || id === "R";
const keyOf = s => (s.unknown && s.unknown.length ? "?" : s.band.id);
const colorOf = k => k === "?" ? UNKNOWN.color : BANDS.find(b => b.id === k).color;

/** <defs> with one pattern per band + unknown; `prefix` keeps ids unique on the page. */
export function patternDefs(prefix) {
    return "<defs>" + [...BANDS.map(b => b.id), "?"].map(k => {
        const id = `${prefix}-${k === "?" ? "U" : k}`;
        return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="${colorOf(k)}"/>${TEXTURE[k]}</pattern>`;
    }).join("") + "</defs>";
}
export const fillFor = (prefix, k) => `url(#${prefix}-${k === "?" ? "U" : k})`;

/** A legend row per step (swatch with texture + letter + name), and unknown. */
export function legendHtml() {
    const sw = k => `<svg width="26" height="16" aria-hidden="true" style="margin-right:6px;border-radius:3px">${patternDefs("rbl-" + (k === "?" ? "U" : k))}<rect width="26" height="16" fill="${fillFor("rbl-" + (k === "?" ? "U" : k), k)}"/></svg>`;
    return BANDS.map(b => `<li>${sw(b.id)}<b>${b.id}</b>&nbsp;${b.name} ${b.min}–${b.id === "G" ? 100 : BANDS[BANDS.indexOf(b) - 1].min - 1}</li>`).join("") +
        `<li>${sw("?")}<b>?</b>&nbsp;Unknown: map data missing</li>`;
}

const CROSS_LETTER = { signal: "S", marked: "M", unmarked: "U", unknown: "?" };

/**
 * segments: scored pieces [{ startMi, endMi, band, unknown }]; crossings: [{ mi, type }].
 * onPick(index) when a stretch is chosen; `selected` = the chosen index or -1.
 * Returns { select(index) } to mark a stretch chosen elsewhere (the map).
 */
export function drawSafetyStrip(el, segments, crossings, { selected = -1, onPick = () => {} } = {}) {
    el.innerHTML = "";
    if (!segments || !segments.length) return { select() {} };
    const W = Math.max(260, el.clientWidth || 600), H = 66;
    const pad = { l: 6, r: 6 }, top = 6, barH = 28;
    const total = segments[segments.length - 1].endMi || 1;
    const x = mi => pad.l + (mi / total) * (W - pad.l - pad.r);
    // runs of the same step, for the letters
    const runs = [];
    segments.forEach((s, i) => {
        const k = keyOf(s), last = runs[runs.length - 1];
        if (last && last.k === k) { last.to = s.endMi; last.j = i; } else runs.push({ k, from: s.startMi, to: s.endMi, i, j: i });
    });
    const rects = segments.map((s, i) => {
        const x0 = x(s.startMi), x1 = x(s.endMi);
        return `<rect class="rbs-seg${i === selected ? " is-sel" : ""}" data-i="${i}" x="${x0.toFixed(1)}" y="${top}" width="${Math.max(1, x1 - x0 + 0.4).toFixed(1)}" height="${barH}" fill="${fillFor("rbs", keyOf(s))}"></rect>`;
    }).join("");
    const letters = runs.filter(r => x(r.to) - x(r.from) >= 26).map(r =>
        `<rect x="${((x(r.from) + x(r.to)) / 2 - 12).toFixed(1)}" y="${top + 6}" width="24" height="16" rx="3" fill="#fff" fill-opacity=".85"></rect>` +
        `<text class="rbs-letter" x="${((x(r.from) + x(r.to)) / 2).toFixed(1)}" y="${top + 18}" text-anchor="middle">${r.k}</text>`).join("");
    const cy = top + barH + 4;
    const cross = (crossings || []).map(c => {
        const cx = x(c.mi).toFixed(1);
        return `<path class="rbs-cross" d="M${cx} ${cy} l5 8 h-10z"></path><text class="rbs-cross-label" x="${cx}" y="${cy + 18}" text-anchor="middle">${CROSS_LETTER[c.type] || "?"}</text>`;
    }).join("");
    const step = total > 20 ? 5 : total > 8 ? 2 : total > 3 ? 1 : 0.5;
    const ticks = [];
    for (let m = 0; m <= total + 1e-9; m += step) ticks.push(m);
    const tickText = ticks.map(m => `<text class="rbs-tick" x="${x(m).toFixed(1)}" y="${H - 2}" text-anchor="${m === 0 ? "start" : m >= total - step / 2 ? "end" : "middle"}">${m === 0 ? "0 mi" : m}</text>`).join("");
    const unknownPct = Math.round(100 * segments.filter(s => s.unknown.length).reduce((n, s) => n + s.endMi - s.startMi, 0) / total);
    const label = `Safety along the route: ${runs.length} stretches, ${(crossings || []).length} busy-road crossings, ${unknownPct}% with missing map data. Use the arrow keys to step through the stretches.`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${label}">${patternDefs("rbs")}${rects}${letters}${cross}${tickText}</svg>`;
    const svg = el.firstChild;
    let current = selected;
    const select = i => {
        current = i;
        svg.querySelectorAll(".rbs-seg.is-sel").forEach(r => r.classList.remove("is-sel"));
        const r = svg.querySelector(`.rbs-seg[data-i="${i}"]`);
        if (r) r.classList.add("is-sel");
    };
    const choose = i => { select(i); onPick(i); };
    const pick = ev => {
        const r = svg.getBoundingClientRect();
        const mi = ((ev.clientX - r.left) * (W / r.width) - pad.l) / (W - pad.l - pad.r) * total;
        const i = segments.findIndex(s => mi >= s.startMi && mi < s.endMi);
        const k = i < 0 ? segments.length - 1 : i;
        if (k !== current) choose(k);
    };
    svg.addEventListener("pointerdown", pick);
    svg.addEventListener("pointermove", ev => { if (ev.pointerType === "mouse") pick(ev); });
    svg.addEventListener("keydown", ev => {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        ev.preventDefault();
        choose(current < 0 ? 0 : Math.max(0, Math.min(segments.length - 1, current + (ev.key === "ArrowRight" ? 1 : -1))));
    });
    return { select };
}
