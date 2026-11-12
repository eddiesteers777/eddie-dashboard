/* ==========================================
   Southbound — the Readiness card's ledger and 4-week panels, drawn (pure strings)

   js/readinessRead.js decides what the rows say; this draws them: a ledger of
   reasons (one hairline row each, a small dot for how it reads), and under the
   open row a 4-week panel (bars for sleep and weekly miles, a line with the
   person's own band for HRV, resting HR and soreness). Touch or hover a day to
   read it (js/chartTips.js through chartWrap). No DOM, no storage:
   tests/readinessRead.test.mjs.
========================================== */

import { chartWrap } from "./svgCharts.js";
import { hm } from "./readiness.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const W = 330, H = 120, PL = 6, PR = 6, TOP = 8, BOT = 8;
const xOf = i => PL + (i * (W - PL - PR)) / 27;
const dayLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const TIP = {
    sleep: v => `${hm(v)} asleep`,
    hrv: v => `HRV ${Math.round(v)} ms`,
    rhr: v => `Resting HR ${Math.round(v)} bpm`,
    said: v => `Soreness ${Math.round(v)} of 5`
};

function scaleOf(panel) {
    const real = panel.values.filter(v => v != null);
    if (panel.scale) return panel.scale;
    const extra = [...(panel.band || []), ...(panel.need ? [panel.need] : [])];
    const lo = Math.min(...real, ...extra), hi = Math.max(...real, ...extra);
    const pad = (hi - lo || 1) * 0.15;
    return [lo - pad, hi + pad];
}

// dates: the 28 date strings, oldest first (for the hover text).
function chartSvg(panel, dates) {
    if (panel.kind === "weekbars") {
        const top = Math.max(...panel.weekValues, 1);
        const bars = panel.weekValues.map((v, i) => {
            const h = Math.max(3, (v / top) * 76), x = 22 + i * 78;
            return `<rect x="${x}" y="${92 - h}" width="52" height="${h}" rx="5" fill="${i === 3 ? "var(--primary)" : "rgba(199,214,228,.42)"}"/><text x="${x + 26}" y="${86 - h}" text-anchor="middle" fill="var(--text)" font-size="13" font-weight="650">${Math.round(v)}</text>`;
        }).join("");
        const label = `Miles per week: ${panel.weekValues.map(v => Math.round(v)).join(", ")}`;
        return `<svg viewBox="0 0 ${W} 100" role="img" aria-label="${esc(label)}">${bars}</svg>`;
    }
    const [lo, hi] = scaleOf(panel);
    const y = v => H - BOT - ((v - lo) / (hi - lo || 1)) * (H - TOP - BOT);
    const band = panel.band ? `<rect x="${PL}" y="${y(panel.band[1]).toFixed(1)}" width="${W - PL - PR}" height="${Math.max(4, y(panel.band[0]) - y(panel.band[1])).toFixed(1)}" rx="6" fill="rgba(199,214,228,.12)"/>` : "";
    const weeks = [0, 1, 2, 3].map(k => `<line x1="${xOf(k * 7).toFixed(1)}" x2="${xOf(k * 7).toFixed(1)}" y1="4" y2="${H - 4}" stroke="rgba(214,228,240,.1)" stroke-dasharray="2 4"/>`).join("");
    let body = "";
    const tips = [];
    if (panel.kind === "bars") {
        const bw = (W - PL - PR) / 28 - 2;
        body = panel.values.map((v, i) => {
            if (v == null) return "";
            const top = y(v);
            return `<rect x="${(xOf(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - BOT - top).toFixed(1)}" rx="2" fill="${panel.need && v < panel.need - 30 ? "rgba(205,149,130,.8)" : "rgba(199,214,228,.75)"}"/>`;
        }).join("");
        if (panel.need) body += `<line x1="${PL}" x2="${W - PR}" y1="${y(panel.need).toFixed(1)}" y2="${y(panel.need).toFixed(1)}" stroke="var(--gold)" stroke-dasharray="4 4" opacity=".7"/>`;
    } else {
        const segs = [];
        let cur = [];
        panel.values.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([xOf(i), y(v)]); });
        if (cur.length) segs.push(cur);
        body = segs.map(s => s.length === 1
            ? `<circle cx="${s[0][0].toFixed(1)}" cy="${s[0][1].toFixed(1)}" r="2" fill="var(--primary)"/>`
            : `<polyline points="${s.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
        const lastI = panel.values.reduce((a, v, i) => (v == null ? a : i), -1);
        if (lastI >= 0) body += `<circle cx="${xOf(lastI).toFixed(1)}" cy="${y(panel.values[lastI]).toFixed(1)}" r="4.5" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>`;
    }
    panel.values.forEach((v, i) => {
        if (v != null) tips.push({ x: +(xOf(i) / W * 100).toFixed(2), y: +(y(v) / H).toFixed(3), t: `${dayLabel(dates[i])}: ${TIP[panel.key](v)}` });
    });
    const label = `${panel.title}. ${panel.says}`;
    return chartWrap(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${band}${weeks}${body}</svg>`, tips, panel.title);
}

/** One 4-week panel (see trendPanel in js/readinessRead.js). dates: the 28 days it covers. */
export function trendHtml(panel, dates = []) {
    const head = `<h4><span>${esc(panel.title)}</span><span>${esc(panel.sub)}</span></h4>`;
    if (panel.building) {
        return `<div class="rd-tr" id="rd-tr-${esc(panel.key)}">${head}<p class="rd-says"><b>${esc(panel.buildingText)}.</b> The 4-week view draws once there is enough to read.</p></div>`;
    }
    const weeks = `<div class="rd-wk4">${panel.weeks.map((w, i) => `<div${i === 3 ? ' class="now"' : ""}><b>${esc(w.text)}</b>${esc(w.label)}</div>`).join("")}</div>`;
    return `<div class="rd-tr" id="rd-tr-${esc(panel.key)}">${head}${chartSvg(panel, dates)}${weeks}<p class="rd-says">${esc(panel.says)}</p></div>`;
}

/**
 * rows: [{ key, label, value, note, tone, ghost, action: { act, label }, trend }]
 * open: the key of the open row (or null); panels: { key: panelHtml }
 */
export function ledgerHtml(rows, { open = null, panels = {} } = {}) {
    return `<ul class="rd-ledger" role="list">${rows.map(r => {
        if (r.ghost) {
            return `<li class="rd-lrow ghost"><div class="rd-lstatic"><span class="rd-lk">${esc(r.label)}</span><span class="rd-lv">${esc(r.value)}</span>${r.action ? (r.action.href ? `<a class="rd-lact" href="${esc(r.action.href)}">${esc(r.action.label)}</a>` : `<button type="button" class="rd-lact" data-act="${esc(r.action.act)}">${esc(r.action.label)}</button>`) : ""}</div></li>`;
        }
        const body = `<span class="rd-lk">${esc(r.label)}</span><span class="rd-lv">${esc(r.value)}${r.note ? ` <em>${esc(r.note)}</em>` : ""}</span><i class="rd-ld ${esc(r.tone || "ok")}" aria-hidden="true"></i>`;
        if (!r.trend) return `<li class="rd-lrow"><div class="rd-lstatic">${body}</div></li>`;
        const isOpen = open === r.key;
        return `<li class="rd-lrow${isOpen ? " open" : ""}"><button type="button" class="rd-lbtn" data-trend="${esc(r.key)}" aria-expanded="${isOpen}" aria-controls="rd-tr-${esc(r.key)}">${body}<span class="rd-lchev" aria-hidden="true">›</span></button>${isOpen ? panels[r.key] || "" : ""}</li>`;
    }).join("")}</ul>`;
}
