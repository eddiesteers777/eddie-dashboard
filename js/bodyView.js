/* ==========================================
   Today's health stats, drawn (premium shell): the ring and the three measures
   with their week as a line. Pure strings, no DOM, so it is unit tested
   (tests/bodyModel.test.mjs). The numbers come from js/bodyModel.js; the card
   itself (advice, check-in, details) is js/readinessCard.js.
========================================== */

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CENTER = 60, RADIUS = 50, START = 135, SWEEP = 270;
const point = angle => [CENTER + RADIUS * Math.cos(angle * Math.PI / 180), CENTER + RADIUS * Math.sin(angle * Math.PI / 180)];
const arc = (a0, a1) => {
    const [x0, y0] = point(a0), [x1, y1] = point(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${RADIUS} ${RADIUS} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

// The ring: a 270° gauge open at the bottom, filled to the score and glowing in the day's tone
// (tone: green | yellow | red | none). With no score the track is drawn alone, with a dash.
export function ringHtml(score, tone = "none", id = "rd-ring") {
    const has = Number.isFinite(score);
    const end = START + SWEEP * Math.min(100, Math.max(0, has ? score : 0)) / 100;
    const [ex, ey] = point(end);
    const label = has ? `Readiness ${score} out of 100, ${tone}` : "Readiness not available";
    return `<figure class="rd-ring2 tone-${tone}" role="img" aria-label="${esc(label)}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs><linearGradient id="${esc(id)}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="var(--tone-lo)"/><stop offset="1" stop-color="var(--tone-hi)"/></linearGradient></defs>
            <path d="${arc(START, START + SWEEP)}" fill="none" stroke="rgba(236,230,212,.1)" stroke-width="9" stroke-linecap="round"/>
            ${has && score > 0 ? `<path class="rd-ring-glow" d="${arc(START, end)}" fill="none" stroke="var(--tone)" stroke-width="9" stroke-linecap="round" opacity=".35"/>
            <path d="${arc(START, end)}" fill="none" stroke="url(#${esc(id)})" stroke-width="9" stroke-linecap="round"/>
            <circle cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="3.4" fill="#FFF6E2"/>` : ""}
        </svg>
        <figcaption><b>${has ? score : "–"}</b></figcaption>
    </figure>`;
}

// A week of one measure as a line; the last morning is the dot; `band` is the person's normal range, shaded.
export function sparkHtml(trend, { band = null } = {}) {
    if (!trend || trend.length < 3) return "";
    const W = 100, H = 34, P = 4;
    const vals = trend.map(p => p.v);
    const lo = Math.min(...vals, ...(band || [])) - 1, hi = Math.max(...vals, ...(band || [])) + 1;
    const x = day => P + (day / 6) * (W - 2 * P);
    const y = v => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
    const d = trend.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    const last = trend[trend.length - 1];
    return `<svg class="rd-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${band ? `<rect x="0" y="${y(band[1]).toFixed(1)}" width="${W}" height="${Math.max(2, y(band[0]) - y(band[1])).toFixed(1)}" rx="3" fill="rgba(236,230,212,.075)"/>` : ""}
        <path d="${d}" fill="none" stroke="rgba(242,237,225,.82)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg><i class="rd-spark-dot" style="left:${(x(last.day) / W * 100).toFixed(1)}%;top:${(y(last.v) / H * 100).toFixed(1)}%" aria-hidden="true"></i>`;
}

// The row of measures: only the ones the watch reported. Nothing at all when none were.
export function measuresHtml({ sleep, hrv, rhr } = {}) {
    const rows = [
        sleep && { k: "Sleep", v: esc(sleep.value), note: sleep.note, trend: sleep.trend },
        hrv && { k: "HRV", v: `${esc(hrv.value)}<small> ms</small>`, note: hrv.note, trend: hrv.trend, band: hrv.band },
        rhr && { k: "Resting HR", v: `${esc(rhr.value)}<small> bpm</small>`, note: rhr.note, trend: rhr.trend }
    ].filter(Boolean);
    if (!rows.length) return "";
    return `<ul class="rd-measures" role="list" style="--cols:${rows.length}">${rows.map(m => `<li class="rd-measure">
        <span class="rd-m-k">${m.k}</span><b class="rd-m-v">${m.v}</b>
        <div class="rd-m-spark">${sparkHtml(m.trend, { band: m.band })}</div>
        <span class="rd-m-n">${esc(m.note)}</span>
    </li>`).join("")}</ul>`;
}
