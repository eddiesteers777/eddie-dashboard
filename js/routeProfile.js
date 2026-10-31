/* ==========================================
   Southbound — elevation profile (routes.html)

   One series: the route's height by mile, a 2px line over a light fill,
   with the gel windows (from js/routeFuel.js, at the runner's pace)
   shaded on the same mile axis. Hover or touch shows the mile and
   height and moves a dot on the map (onHover). Heights are lightly
   smoothed upstream (profileSeries); the axis says "ft".
========================================== */

const NS = "http://www.w3.org/2000/svg";

/** series: [{ i, mi, ft }]; windows: [{ n, fromMile, toMile }] */
export function drawProfile(el, series, windows = [], { onHover = () => {} } = {}) {
    el.innerHTML = "";
    el.onpointermove = el.onpointerleave = el.onpointerdown = null;
    if (!series.length) { el.classList.add("is-empty"); return; }
    el.classList.remove("is-empty");
    const W = Math.max(260, el.clientWidth || 600), H = 150;
    const pad = { l: 44, r: 10, t: 22, b: 24 };
    const maxMi = series[series.length - 1].mi || 1;
    let lo = Math.min(...series.map(p => p.ft)), hi = Math.max(...series.map(p => p.ft));
    if (hi - lo < 40) { const mid = (hi + lo) / 2; lo = mid - 20; hi = mid + 20; }
    const x = mi => pad.l + (mi / maxMi) * (W - pad.l - pad.r);
    const y = ft => pad.t + (1 - (ft - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const line = series.map((p, k) => `${k ? "L" : "M"}${x(p.mi).toFixed(1)},${y(p.ft).toFixed(1)}`).join("");
    const area = `${line}L${x(maxMi).toFixed(1)},${H - pad.b}L${pad.l},${H - pad.b}Z`;
    const step = maxMi > 20 ? 5 : maxMi > 8 ? 2 : maxMi > 3 ? 1 : 0.5;
    const ticks = [];
    for (let m = 0; m <= maxMi + 1e-9; m += step) ticks.push(m);
    // The windows overlap (gel 3 may come as early as gel 2 ends), so each band starts where the last one ended.
    let prevEnd = 0;
    const bands = windows.filter(w => w.fromMile < maxMi).map(w => {
        const from = Math.max(w.fromMile, prevEnd), to = Math.min(w.toMile, maxMi);
        prevEnd = to;
        if (to <= from) return "";
        const x0 = x(from), x1 = x(to);
        return `<rect class="rbp-band${w.n % 2 ? "" : " is-alt"}" x="${x0.toFixed(1)}" y="${pad.t}" width="${Math.max(2, x1 - x0).toFixed(1)}" height="${H - pad.t - pad.b}" rx="2"></rect>
            <text class="rbp-band-label" x="${((x0 + x1) / 2).toFixed(1)}" y="${pad.t - 7}" text-anchor="middle">Gel ${w.n}</text>`;
    }).join("");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Elevation profile: ${Math.round(lo)} to ${Math.round(hi)} feet over ${maxMi.toFixed(1)} miles${windows.length ? `, ${windows.length} gel window${windows.length > 1 ? "s" : ""} shaded` : ""}">
        ${bands}
        <line class="rbp-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(hi)}" y2="${y(hi)}"></line>
        <line class="rbp-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"></line>
        <path class="rbp-area" d="${area}"></path>
        <path class="rbp-line" d="${line}"></path>
        <text class="rbp-tick" x="${pad.l - 6}" y="${y(hi) + 4}" text-anchor="end">${Math.round(hi)}</text>
        <text class="rbp-tick" x="${pad.l - 6}" y="${y(lo) + 4}" text-anchor="end">${Math.round(lo)} ft</text>
        ${ticks.map(m => `<text class="rbp-tick" x="${x(m).toFixed(1)}" y="${H - 6}" text-anchor="middle">${m === 0 ? "0 mi" : m}</text>`).join("")}
        <g class="rbp-cross" visibility="hidden"><line class="rbp-crossline" y1="${pad.t}" y2="${H - pad.b}"></line><circle class="rbp-dot" r="5"></circle></g>
    </svg><div class="rbp-tip" hidden></div>`;
    const svg = el.querySelector("svg"), cross = svg.querySelector(".rbp-cross"), tip = el.querySelector(".rbp-tip");
    const show = ev => {
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        const mi = Math.max(0, Math.min(maxMi, ((px - pad.l) / (W - pad.l - pad.r)) * maxMi));
        let best = series[0];
        for (const p of series) if (Math.abs(p.mi - mi) < Math.abs(best.mi - mi)) best = p;
        const cx = x(best.mi), cy = y(best.ft);
        cross.setAttribute("visibility", "visible");
        cross.querySelector("line").setAttribute("x1", cx); cross.querySelector("line").setAttribute("x2", cx);
        cross.querySelector("circle").setAttribute("cx", cx); cross.querySelector("circle").setAttribute("cy", cy);
        const gel = windows.find(w => best.mi >= w.fromMile && best.mi <= w.toMile);
        tip.hidden = false;
        tip.innerHTML = `Mile ${best.mi.toFixed(1)} · ${Math.round(best.ft)} ft${gel ? ` · gel ${gel.n} window` : ""}`;
        const left = Math.min(Math.max(cx * (r.width / W), 70), r.width - 70);
        tip.style.left = `${left}px`;
        onHover(best);
    };
    el.onpointermove = show;
    el.onpointerdown = show;
    el.onpointerleave = () => { cross.setAttribute("visibility", "hidden"); tip.hidden = true; onHover(null); };
}
