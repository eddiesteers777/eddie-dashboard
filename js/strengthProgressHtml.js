// Lift progress as HTML (pure, no DOM): shared by Strength → Progress (js/strengthProgressView.js)
// and the Client Hub's Progress tab. Weights come in stored lb and are shown in `u` (lb / kg).
import { toDisplay, unitLabel, setShort, volumeText } from "./strengthUnits.js";

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const dateText = (iso, withYear = false) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
export const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
export const PR_WORDS = { e1rm: "Est. 1RM record", weight: "Heaviest yet", reps: "Most reps yet", volume: "Most volume", longest: "Longest yet" };

export function headline(p, u) {
    if (p.mode === "time") return p.best.duration ? `Best ${clock(p.best.duration.value)}` : "";
    if (p.best.e1rm) return `Est. 1RM ${toDisplay(p.best.e1rm.value, u)} ${unitLabel(u)}`;
    if (p.best.reps) return `Best ${p.best.reps.value} reps`;
    return "";
}

export function trendChip(t) {
    if (!t) return "";
    const sign = t.pct > 0 ? "+" : t.pct < 0 ? "−" : "±";
    const word = { up: "Up", down: "Down", steady: "Steady" }[t.word];
    return `<span class="sp-trend is-${t.word}" title="Best of the last 6 weeks vs the 6 before">${word} ${sign}${Math.abs(t.pct)}%</span>`;
}

export function chartSvg(points) {
    const vals = points.map(p => p.v).filter(v => v != null);
    if (vals.length < 2) return "";
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.15;
    lo -= pad; hi += pad;
    const n = points.length;
    const x = i => (n === 1 ? 50 : 4 + (i / (n - 1)) * 92);
    const y = v => 4 + (1 - (v - lo) / (hi - lo)) * 52;
    const pts = points.map((p, i) => (p.v == null ? null : { x: x(i), y: y(p.v), pr: p.pr }));
    const line = pts.filter(Boolean).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const dots = pts.filter(Boolean).map(p => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${p.pr ? 1.6 : 1.1}" class="${p.pr ? "sp-dot-pr" : "sp-dot"}"/>`).join("");
    return `<svg class="sp-chart" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><polyline class="sp-line" points="${line}" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
}

// The stat tiles, the chart and the session list for one lift.
export function liftBodyHtml(p, u, { showAll = false, show = 12, moreAttr = "data-sp-more" } = {}) {
    const time = p.mode === "time";
    const metric = s => (time ? s.bestDuration : s.e1rm != null ? toDisplay(s.e1rm, u) : s.mostReps);
    const what = time ? "Longest hold" : p.best.e1rm ? `Estimated 1-rep max (${unitLabel(u)})` : "Most reps in a set";
    const recent = p.sessions.slice(-30);
    const tiles = time
        ? [["Best", p.best.duration ? clock(p.best.duration.value) : "–"], ["Sessions", p.count], ["Since", dateText(p.first, true)]]
        : [
            p.best.e1rm ? ["Est. 1RM", `${toDisplay(p.best.e1rm.value, u)} ${unitLabel(u)}`, `${setShort(p.best.e1rm.top, u, { bodyweight: p.bw })} · ${dateText(p.best.e1rm.date)}`] : null,
            p.best.weight ? ["Heaviest", `${p.bw ? "BW + " : ""}${toDisplay(p.best.weight.value, u)} ${unitLabel(u)}`, dateText(p.best.weight.date)] : null,
            p.bw && p.best.reps ? ["Most reps", p.best.reps.value, dateText(p.best.reps.date)] : null,
            ["Sessions", p.count, `since ${dateText(p.first, true)}`]
        ].filter(Boolean);
    const sessions = [...p.sessions].reverse();
    return `
        <div class="sp-stats">
            ${tiles.map(t => `<div class="sp-stat"><strong>${esc(t[1])}</strong><span>${esc(t[0])}</span>${t[2] ? `<small>${esc(t[2])}</small>` : ""}</div>`).join("")}
        </div>
        ${recent.length > 1 ? `<figure class="sp-figure"><figcaption>${what}, last ${recent.length} sessions</figcaption>${chartSvg(recent.map(s => ({ v: metric(s), pr: s.pr.length > 0 })))}<div class="sp-axis"><span>${dateText(recent[0].date)}</span><span>${dateText(recent[recent.length - 1].date)}</span></div></figure>` : ""}
        <h3 class="sp-sub">Sessions</h3>
        <ol class="sp-sessions">
            ${sessions.slice(0, showAll ? undefined : show).map(s => `
                <li class="sp-session">
                    <span class="sp-session-date">${dateText(s.date, true)}</span>
                    <span class="sp-session-main">
                        ${time ? `<strong>${clock(s.bestDuration)}</strong> best · ${s.sets} set${s.sets === 1 ? "" : "s"}`
                               : `<strong>${s.top ? esc(setShort(s.top, u, { bodyweight: p.bw })) : "–"}</strong> top set · ${s.sets} set${s.sets === 1 ? "" : "s"}${s.e1rm ? ` · est. 1RM ${toDisplay(s.e1rm, u)}` : ""}${s.volume ? ` · ${volumeText(s.volume, u)}` : ""}`}
                    </span>
                    ${s.pr.length ? `<span class="sp-badges">${s.pr.map(k => `<span class="sp-badge">${PR_WORDS[k]}</span>`).join("")}</span>` : ""}
                </li>`).join("")}
        </ol>
        ${!showAll && sessions.length > show ? `<button type="button" class="sp-more" ${moreAttr}>Show all ${p.count} sessions</button>` : ""}`;
}

export const EPLEY_NOTE = "Est. 1RM uses the Epley formula on sets of 1–12 reps: a guide to compare sessions, not a test result.";
