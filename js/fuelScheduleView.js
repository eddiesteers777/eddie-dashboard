/* ==========================================
   Southbound — Race-Day Fuel Schedule (view)

   Renders a schedule from js/fuelSchedule.js as HTML. Used live in the
   fueling builder and in the saved-plan sheet, so both always show the
   same thing. Styles: .fs-* in css/fueling.css.
========================================== */

import { formatClock, formatTsp } from "./fuelSchedule.js";
import { fluidText, fluidWords } from "./fluidUnits.js";

// The fluid unit for this render ("oz" | "ml"); set by scheduleHTML.
let U = "oz";
const fl = oz => fluidText(oz, U);
const caffeineTag = e => e.caffeine ? ` <span class="fs-tag">${e.caffeineMg ? `${e.caffeineMg} mg caffeine` : "Caffeine"}</span>` : "";

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
        ["Bottles", `${s.bottles.length + (s.sips?.length || 0)}`, ""],
        s.totals.caffeineMg ? ["Caffeine", `${s.totals.caffeineMg}`, "mg"] : null,
        s.startTod ? ["Start", s.startTod.replace(/ [AP]M$/, ""), s.startTod.slice(-2)] : null,
        s.finishTod ? ["Finish", s.finishTod.replace(/ [AP]M$/, ""), s.finishTod.slice(-2)] : null
    ].filter(Boolean);
    return `<div class="fs-stats">${stats.map(([label, value, unit]) => `
        <div class="fs-stat"><span>${label}</span><strong>${value}<small>${unit}</small></strong></div>
    `).join("")}</div>`;
}

function courseHTML(s) {
    const d = s.durationMin;
    const d0 = d;
    const bands = s.bottles.map(b => `
        <div class="fs-course-band fs-band-${(b.n - 1) % 3}" style="left:${pct(b.startMin, d)}%;width:${pct(b.endMin, d) - pct(b.startMin, d)}%">
            <span>B${b.n}</span>
        </div>`).join("");
    const sips = (s.sips || []).map(d => `
        <div class="fs-course-band fs-band-sip" style="left:${pct(d.startMin, d0)}%;width:${pct(d.endMin, d0) - pct(d.startMin, d0)}%">
            <span>D${d.n}</span>
        </div>`).join("");
    const gels = s.gels.map(g => `
        <div class="fs-course-gel${g.caffeine ? " is-caffeine" : ""}" style="left:${pct(g.min, d)}%" title="Gel ${g.n}${g.mile != null ? ` · mile ${mi(g.mile)}` : ""} · ${formatClock(g.min)}">
            <span>${g.n}</span>
        </div>`).join("");
    return `
        <div class="fs-course" aria-hidden="true">
            <div class="fs-course-track">${bands}${sips}${gels}</div>
            <div class="fs-course-labels">
                <span>Start</span>
                ${s.distanceMi ? `<span>Mile ${mi(s.distanceMi / 2)}</span>` : `<span>${formatClock(d / 2)}</span>`}
                <span>${s.distanceMi ? `${mi(s.distanceMi)} mi` : "Finish"} · ${formatClock(d)}</span>
            </div>
            <div class="fs-legend">
                ${s.gels.length ? `<span><i class="fs-dot fs-dot-gel"></i>Gel</span>` : ""}
                ${s.gels.some(g => g.caffeine) ? `<span><i class="fs-dot fs-dot-caffeine"></i>Caffeinated</span>` : ""}
                ${s.bottles.length ? `<span><i class="fs-dot fs-dot-bottle"></i>Bottle</span>` : ""}
                ${s.sips?.length ? `<span><i class="fs-dot fs-dot-sip"></i>Drink mix</span>` : ""}
            </div>
        </div>`;
}

function eventsHTML(s) {
    return `<ol class="fs-events">${s.events.map(e => {
        const where = e.mile != null ? `Mile ${mi(e.mile)}` : formatClock(e.min);
        const when = [e.mile != null ? formatClock(e.min) : "", e.tod].filter(Boolean).join(" · ");
        let title = esc(e.text);
        let meta = "";
        if (e.kind === "gel") {
            title = `Gel ${e.gel} <span class="fs-muted">·</span> ${esc(e.text)}`;
            meta = `${e.carbs} g carb · ${e.sodium} mg sodium · chase with a few sips`;
        } else if (e.kind === "sip") {
            title = `Drink ${e.sip} <span class="fs-muted">·</span> ${esc(e.text)}`;
            const until = e.endMile != null ? `mile ${mi(e.endMile)}` : formatClock(e.endMin);
            meta = `${e.fluid ? `${fl(e.fluid)} · ` : ""}${e.carbs} g carb · ${e.sodium} mg sodium · sip it steadily until ${until}`;
        } else if (e.kind === "bottle") {
            const b = s.bottles[e.bottle - 1];
            meta = b
                ? `${fl(b.oz)} · ${b.carbs} g carb · ${b.sodium} mg sodium${b.ozPerMile != null ? ` · sip ~${fl(b.ozPerMile)} each mile` : ` · sip ~${fl(b.ozPer10Min)} every 10 min`}`
                : "";
        }
        return `
            <li class="fs-event fs-event-${e.kind}${e.caffeine ? " is-caffeine" : ""}">
                <div class="fs-event-where"><strong>${where}</strong>${when ? `<span>${when}</span>` : ""}</div>
                <div class="fs-event-mark"></div>
                <div class="fs-event-body">
                    <div class="fs-event-title">${title}${caffeineTag(e)}</div>
                    ${meta ? `<div class="fs-event-meta">${meta}</div>` : ""}
                    ${nextHTML(e)}
                </div>
            </li>`;
    }).join("")}</ol>`;
}

// "Next: Gel 2 in 36 min · 4.2 mi (8:21 AM)"
function nextHTML(e) {
    const n = e.next;
    if (!n || e.kind === "finish") return "";
    const what = `${n.kind === "gel" ? "Gel" : "Drink"} ${n.n}`;
    const gap = n.inMin === 0 ? "right away" : `in ${n.inMin < 60 ? `${n.inMin} min` : formatClock(n.inMin)}`;
    const far = n.inMi ? ` · ${mi(n.inMi)} mi` : "";
    return `<div class="fs-event-next">${e.kind === "start" || (e.kind === "bottle" && e.bottle === 1) ? "First" : "Next"}: ${what} ${gap}${far}${n.tod ? ` (${n.tod})` : ""}</div>`;
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
                        ? `Sip <strong>~${fl(b.ozPerMile)}</strong> every mile <span class="fs-muted">(${b.gulpsPerMile} ${b.gulpsPerMile === 1 ? "gulp" : "gulps"})</span>`
                        : `Sip <strong>~${fl(b.ozPer10Min)}</strong> every 10 min`}
                </div>
                <div class="fs-bottle-macros">${fl(b.oz)} · ${b.carbs} g carb · ${b.sodium} mg sodium</div>
            </div>`).join("")}
        </div>
        ${m ? `
        <div class="fs-mix">
            <span class="fs-mix-label">Mix each bottle</span>
            <span>${fl(s.bottles[0].oz)} water + ${carbAmount} + ${sodiumAmount}</span>
            ${s.concentration != null ? `<span class="fs-muted">${s.concentration}% carb solution</span>` : ""}
        </div>` : ""}`;
}

function caffeineHTML(s) {
    const t = s.totals;
    if (!t.caffeineMg && !t.caffeineUnknown) return "";
    const parts = [];
    if (t.caffeineMg) parts.push(`<strong>${t.caffeineMg} mg</strong> in all`);
    if (t.caffeineUnknown) parts.push(`${t.caffeineUnknown} caffeinated ${t.caffeineUnknown === 1 ? "serving" : "servings"} with no mg on file (add it in the Fueling Library)`);
    return `<div class="fs-mix"><span class="fs-mix-label">Caffeine</span><span>${parts.join(" · ")}</span></div>`;
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
                <span>${fl(h.fluid)}<small>of ${fl(h.targetFluid)}</small></span>
                <span>${statusLabel[h.status] ? `<span class="fs-pill fs-pill-${h.status}">${statusLabel[h.status]}</span>` : ""}</span>
            </div>`).join("")}
            <div class="fs-hour fs-hour-total">
                <span><strong>Total</strong></span>
                <span>${s.totals.carbs} g<small>of ${s.targetTotals.carbs}</small></span>
                <span>${s.totals.sodium} mg<small>of ${s.targetTotals.sodium}</small></span>
                <span>${fl(s.totals.fluid)}<small>of ${fl(s.targetTotals.fluid)}</small></span>
                <span></span>
            </div>
        </div>`;
}

export function scheduleHTML(s, { preWorkoutFood = "", unit = "oz" } = {}) {
    U = unit === "ml" ? "ml" : "oz";
    if (!s.durationMin) {
        return `<p class="fuel-empty-state">Add a duration or distance to build the schedule.</p>`;
    }
    return `
        <div class="fs">
            ${statsHTML(s)}
            ${s.warnings.length ? `<ul class="fs-warnings">${s.warnings.map(w => `<li>${esc(fluidWords(w, U))}</li>`).join("")}</ul>` : ""}
            ${courseHTML(s)}
            ${preWorkoutFood ? `<div class="fs-mix"><span class="fs-mix-label">Before the run</span><span>${esc(preWorkoutFood)}</span></div>` : ""}
            <h4 class="fs-heading">Checkpoints</h4>
            ${eventsHTML(s)}
            ${bottlesHTML(s)}
            ${caffeineHTML(s)}
            ${hoursHTML(s)}
        </div>`;
}
