/* ==========================================
   Southbound — small charts for Analytics (pure, no library)

   Drawn by Southbound itself so they work offline and match the brand.
     barsHtml   week bars: planned (outline) behind actual (filled),
                labels in HTML so they stay readable on phones
     lineSvg    a trend line (gaps where days are missing), an optional
                band (e.g. your normal HRV range) and goal line; the SVG
                stretches to its box, strokes keep their width
     loadChartSvg  weekly load bars stacked by intensity, with the
                training base and recent load lines over them
   Unit-tested in tests/trends.test.mjs.
========================================== */

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r2 = n => Math.round(n * 100) / 100;

/**
 * bars: [{ label, value, planned?, current?, title? }] -> HTML.
 * Heights are relative to the largest of value / planned.
 */
export function barsHtml(bars, { unit = "mi" } = {}) {
    const max = Math.max(1, ...bars.map(b => Math.max(Number(b.value) || 0, Number(b.planned) || 0)));
    return `<div class="tr-bars" role="img" aria-label="${esc(bars.map(b => `${b.label}: ${b.value}${b.planned != null ? ` of ${b.planned}` : ""} ${unit}`).join(", "))}">${bars.map(b => {
        const h = v => `${r2((Number(v) || 0) / max * 100)}%`;
        return `<div class="tr-bar${b.current ? " is-current" : ""}${b.future ? " is-future" : ""}" title="${esc(b.title || `${b.label}: ${b.value} ${unit}`)}">
            <div class="tr-bar-track">${b.planned != null ? `<span class="tr-bar-plan" style="height:${h(b.planned)}"></span>` : ""}<span class="tr-bar-fill${b.planned != null && Number(b.value) >= Number(b.planned) * 0.9 ? " is-met" : ""}" style="height:${h(b.value)}"></span></div>
            <small>${esc(b.label)}</small>
        </div>`;
    }).join("")}</div>`;
}

/**
 * values: [number|null] evenly spaced; options:
 *   min/max   the y range (default: from the data, padded)
 *   invert    true when lower is better (pace): lower values draw higher
 *   band      [{ lo, hi }|null] per point (e.g. normal HRV range), or one { lo, hi }
 *   goal      a horizontal line (e.g. 3:05 in seconds)
 */
export function lineSvg(values, { min, max, invert = false, band = null, goal = null, height = 100, cls = "" } = {}) {
    const nums = values.filter(v => v != null);
    const bandVals = Array.isArray(band) ? band.filter(Boolean).flatMap(b => [b.lo, b.hi]) : band ? [band.lo, band.hi] : [];
    const all = [...nums, ...bandVals, ...(goal != null ? [goal] : [])];
    if (!nums.length) return `<svg class="tr-line ${cls}" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
    let lo = min ?? Math.min(...all), hi = max ?? Math.max(...all);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.1;
    if (min == null) lo -= pad;
    if (max == null) hi += pad;
    const n = values.length;
    const x = i => (n === 1 ? 50 : r2(i / (n - 1) * 100));
    const y = v => { const f = (v - lo) / (hi - lo); return r2((invert ? f : 1 - f) * height); };
    const segments = [];
    let cur = [];
    values.forEach((v, i) => { if (v == null) { if (cur.length) segments.push(cur); cur = []; } else cur.push(`${x(i)},${y(v)}`); });
    if (cur.length) segments.push(cur);
    let bandSvg = "";
    if (Array.isArray(band)) {
        const pts = band.map((b, i) => (b ? { i, b } : null)).filter(Boolean);
        if (pts.length > 1) bandSvg = `<polygon class="tr-band" points="${[...pts.map(p => `${x(p.i)},${y(p.b.hi)}`), ...pts.reverse().map(p => `${x(p.i)},${y(p.b.lo)}`)].join(" ")}"/>`;
    } else if (band) {
        bandSvg = `<rect class="tr-band" x="0" width="100" y="${Math.min(y(band.lo), y(band.hi))}" height="${Math.abs(y(band.hi) - y(band.lo))}"/>`;
    }
    const goalSvg = goal != null ? `<line class="tr-goal" x1="0" x2="100" y1="${y(goal)}" y2="${y(goal)}" vector-effect="non-scaling-stroke"/>` : "";
    const lines = segments.map(s => s.length === 1
        ? `<line class="tr-path" x1="${Math.max(0, parseFloat(s[0]) - 0.8)}" x2="${Math.min(100, parseFloat(s[0]) + 0.8)}" y1="${s[0].split(",")[1]}" y2="${s[0].split(",")[1]}" vector-effect="non-scaling-stroke"/>`
        : `<polyline class="tr-path" points="${s.join(" ")}" vector-effect="non-scaling-stroke"/>`).join("");
    return `<svg class="tr-line ${cls}" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${bandSvg}${goalSvg}${lines}</svg>`;
}

/**
 * The load chart: weekly bars stacked by intensity (easy / threshold / hard,
 * as a daily average so they share the lines' scale) with two lines over
 * them, day by day: training base and recent load.
 * weeks: [{ start, easy, threshold, hard, daysIn }]   (oldest first)
 * days:  [{ base, recent }]  one per day across those weeks (may end early: the current week)
 */
export function loadChartSvg(weeks, days, { height = 100 } = {}) {
    const n = weeks.length * 7;
    const perDay = w => ({ easy: w.easy / Math.max(1, w.daysIn ?? 7), threshold: w.threshold / Math.max(1, w.daysIn ?? 7), hard: w.hard / Math.max(1, w.daysIn ?? 7) });
    const tops = weeks.map(w => { const p = perDay(w); return p.easy + p.threshold + p.hard; });
    const max = Math.max(1, ...tops, ...days.flatMap(d => [d.base || 0, d.recent || 0])) * 1.08;
    const y = v => r2(height - v / max * height);
    const bars = weeks.map((w, i) => {
        const p = perDay(w);
        let base = 0;
        return ["easy", "threshold", "hard"].map(k => {
            const h = p[k] / max * height;
            const rect = h > 0 ? `<rect class="lc-${k}${w.current ? " is-current" : ""}" x="${i * 7 + 1}" width="5" y="${r2(height - (base + h))}" height="${r2(h)}"/>` : "";
            base += h;
            return rect;
        }).join("");
    }).join("");
    const line = (key, cls) => {
        const pts = days.map((d, i) => (d[key] == null ? null : `${r2(i + 0.5)},${y(d[key])}`)).filter(Boolean);
        return pts.length > 1 ? `<polyline class="${cls}" points="${pts.join(" ")}" vector-effect="non-scaling-stroke"/>` : "";
    };
    return `<svg class="lc-chart" viewBox="0 0 ${n} ${height}" preserveAspectRatio="none" aria-hidden="true">${bars}${line("base", "lc-base")}${line("recent", "lc-recent")}</svg>`;
}
