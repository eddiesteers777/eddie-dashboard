/* ==========================================
   Southbound — Race-Day Fuel Schedule (view)

   Renders a schedule from js/fuelSchedule.js as HTML. Used live in the
   fueling builder and in the saved-plan sheet, so both always show the
   same thing. Styles: .fs-* in css/fueling.css.
========================================== */

import { formatClock, formatTsp } from "./fuelSchedule.js";

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const mi = value => (value == null ? "" : value.toFixed(1));

function paceLabel(minPerMile) {
    if (!minPerMile) return "";
    const totalSec = Math.round(minPerMile * 60);
    return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;
}

// Where along the run something happens, as a % of the bar.
const pct = (min, duration) => (duration ? Math.min(100, Math.max(0, (min / duration) * 100)) : 0);

function statsHTML(s) {
    const hours = s.durationMin / 60;
    const avgCarbs = hours ? Math.round(s.totals.carbs / hours) : 0;
    const stats = [
        s.distanceMi ? ["Distance", `${mi(s.distanceMi)}`, "mi"] : null,
        ["Time", formatClock(s.durationMin), ""],
        s.minPerMile ? ["Pace", paceLabel(s.minPerMile), "/mi"] : null,
        ["Carbs", `${avgCarbs}`, "g/hr"],
        ["Gels", `${s.gels.length}`, ""],
        ["Bottles", `${s.bottles.length}`, ""]
    ].filter(Boolean);
    return `<div class="fs-stats">${stats.map(([label, value, unit]) => `
        <div class="fs-stat"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>
    `).join("")}</div>`;
}

function courseHTML(s) {
    const d = s.durationMin;
    const bands = s.bottles.map(b => `
        <div class="fs-course-band fs-band-${(b.n - 1) % 3}" style="left:${pct(b.startMin, d)}%;width:${pct(b.endMin, d) - pct(b.startMin, d)}%">
            <span>B${b.n}</span>
        </div>`).join("");
    const gels = s.gels.map(g => `
        <div class="fs-course-gel${g.caffeine ? " is-caffeine" : ""}" style="left:${pct(g.min, d)}%" title="Gel ${g.n}${g.mile != null ? ` · mile ${mi(g.mile)}` : ""} · ${formatClock(g.min)}">
            <span>${g.n}</span>
        </div>`).join("");
    return `
        <div class="fs-course" aria-hidden="true">
            <div class="fs-course-track">${bands}${gels}</div>
            <div class="fs-course-labels">
                <span>Start</span>
                ${s.distanceMi ? `<span>Mile ${mi(s.distanceMi / 2)}</span>` : `<span>${formatClock(d / 2)}</span>`}
                <span>${s.distanceMi ? `${mi(s.distanceMi)} mi` : "Finish"} · ${formatClock(d)}</span>
            </div>
            <div class="fs-legend">
                ${s.gels.length ? `<span><i class="fs-dot fs-dot-gel"></i>Gel</span>` : ""}
                ${s.gels.some(g => g.caffeine) ? `<span><i class="fs-dot fs-dot-caffeine"></i>Caffeinated</span>` : ""}
                ${s.bottles.length ? `<span><i class="fs-dot fs-dot-bottle"></i>Bottle</span>` : ""}
            </div>
        </div>`;
}

function eventsHTML(s) {
    return `<ol class="fs-events">${s.events.map(e => {
        const where = e.mile != null ? `Mile ${mi(e.mile)}` : formatClock(e.min);
        const when = e.mile != null ? formatClock(e.min) : "";
        let title = esc(e.text);
        let meta = "";
        if (e.kind === "gel") {
            title = `Gel ${e.gel} <span class="fs-muted">·</span> ${esc(e.text)}`;
            meta = `${e.carbs} g carb · ${e.sodium} mg sodium · chase with a few sips`;
        } else if (e.kind === "bottle") {
            const b = s.bottles[e.bottle - 1];
            meta = b
                ? `${b.oz} oz · ${b.carbs} g carb · ${b.sodium} mg sodium${b.ozPerMile != null ? ` · sip ~${b.ozPerMile} oz each mile` : ` · sip ~${b.ozPer10Min} oz every 10 min`}`
                : "";
        }
        return `
            <li class="fs-event fs-event-${e.kind}${e.caffeine ? " is-caffeine" : ""}">
                <div class="fs-event-where"><strong>${where}</strong>${when ? `<span>${when}</span>` : ""}</div>
                <div class="fs-event-mark"></div>
                <div class="fs-event-body">
                    <div class="fs-event-title">${title}${e.caffeine ? ` <span class="fs-tag">Caffeine</span>` : ""}</div>
                    ${meta ? `<div class="fs-event-meta">${meta}</div>` : ""}
                </div>
            </li>`;
    }).join("")}</ol>`;
}

function bottlesHTML(s) {
    if (!s.bottles.length) return "";
    const m = s.mix;
    const carbAmount = m ? `${m.carbGrams} g ${esc(m.carbLabel.toLowerCase())}${m.carbTsp != null ? ` (${formatTsp(m.carbTsp)} tsp)` : ""}` : "";
    const sodiumAmount = m
        ? (m.sodiumGrams != null
            ? `${m.sodiumGrams} g ${esc(m.sodiumLabel.toLowerCase())}${m.sodiumTsp != null ? ` (${formatTsp(m.sodiumTsp)} tsp)` : ""}`
            : `${s.bottles[0].sodium} mg sodium from ${esc(m.sodiumLabel.toLowerCase())} (see label)`)
        : "";
    return `
        <h4 class="fs-heading">Bottles</h4>
        <div class="fs-bottles">${s.bottles.map(b => `
            <div class="fs-bottle fs-band-${(b.n - 1) % 3}">
                <div class="fs-bottle-top">
                    <strong>Bottle ${b.n}</strong>
                    <span>${b.startMile != null ? `Miles ${mi(b.startMile)} – ${mi(b.endMile)}` : `${formatClock(b.startMin)} – ${formatClock(b.endMin)}`}</span>
                </div>
                <div class="fs-bottle-when">${formatClock(b.startMin)} – ${formatClock(b.endMin)}</div>
                <div class="fs-bottle-sip">
                    ${b.ozPerMile != null
                        ? `Sip <strong>~${b.ozPerMile} oz</strong> every mile <span class="fs-muted">(${b.gulpsPerMile} ${b.gulpsPerMile === 1 ? "gulp" : "gulps"})</span>`
                        : `Sip <strong>~${b.ozPer10Min} oz</strong> every 10 min`}
                </div>
                <div class="fs-bottle-macros">${b.oz} oz · ${b.carbs} g carb · ${b.sodium} mg sodium</div>
            </div>`).join("")}
        </div>
        ${m ? `
        <div class="fs-mix">
            <span class="fs-mix-label">Mix each bottle</span>
            <span>${s.bottles[0].oz} oz water + ${carbAmount} + ${sodiumAmount}</span>
            ${s.concentration != null ? `<span class="fs-muted">${s.concentration}% carb solution</span>` : ""}
        </div>` : ""}`;
}

function hoursHTML(s) {
    if (!s.hours.length) return "";
    const statusLabel = { ok: "On target", low: "Under", high: "Over", none: "" };
    return `
        <h4 class="fs-heading">Hour by hour</h4>
        <div class="fs-hours">
            <div class="fs-hour fs-hour-head">
                <span>Hour</span><span>Carbs</span><span>Sodium</span><span>Fluid</span><span></span>
            </div>
            ${s.hours.map(h => `
            <div class="fs-hour">
                <span><strong>${formatClock(h.fromMin)}–${formatClock(h.toMin)}</strong>${h.fromMile != null ? `<small>mi ${mi(h.fromMile)}–${mi(h.toMile)}</small>` : ""}</span>
                <span>${h.carbs} g<small>of ${h.targetCarbs}</small></span>
                <span>${h.sodium} mg<small>of ${h.targetSodium}</small></span>
                <span>${h.fluid} oz<small>of ${h.targetFluid}</small></span>
                <span>${statusLabel[h.status] ? `<span class="fs-pill fs-pill-${h.status}">${statusLabel[h.status]}</span>` : ""}</span>
            </div>`).join("")}
            <div class="fs-hour fs-hour-total">
                <span><strong>Total</strong></span>
                <span>${s.totals.carbs} g<small>of ${s.targetTotals.carbs}</small></span>
                <span>${s.totals.sodium} mg<small>of ${s.targetTotals.sodium}</small></span>
                <span>${s.totals.fluid} oz<small>of ${s.targetTotals.fluid}</small></span>
                <span></span>
            </div>
        </div>`;
}

export function scheduleHTML(s, { preWorkoutFood = "" } = {}) {
    if (!s.durationMin) {
        return `<p class="fuel-empty-state">Add a duration or distance to build the schedule.</p>`;
    }
    return `
        <div class="fs">
            ${statsHTML(s)}
            ${s.warnings.length ? `<ul class="fs-warnings">${s.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
            ${courseHTML(s)}
            ${preWorkoutFood ? `<div class="fs-mix"><span class="fs-mix-label">Before the run</span><span>${esc(preWorkoutFood)}</span></div>` : ""}
            <h4 class="fs-heading">Checkpoints</h4>
            ${eventsHTML(s)}
            ${bottlesHTML(s)}
            ${hoursHTML(s)}
        </div>`;
}
