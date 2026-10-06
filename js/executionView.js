/* ==========================================
   Southbound — a reconstructed workout, drawn (pure: HTML strings)

   Structured workouts step 2 (docs/WORKOUT_EXECUTION_PLAN.md). Draws a
   WorkoutExecution (js/workoutExecution.js) in Southbound's own style:
     chips      completion · on target · how sure the matching is
     read       the plain lines
     strip      one segment per step, sized by its planned length,
                coloured by what happened (legend below it)
     rep by rep a table per set: Rep · Target · Actual · Δ · Result, the
                recovery after each rep under it; on phones each rep
                becomes a stacked card (css/trends.css "WORKOUT EXECUTION")
     warm-up / cool-down in one line (pace only, never judged)
   No DOM, no storage. Unit-tested in tests/executionView.test.mjs.
========================================== */

import { clockText } from "./workoutExecution.js";

const MILE = 1609.344;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paceText = sec => (sec ? `${clockText(sec)}/mi` : "–");
const miText = m => `${Math.round((m / MILE) * 100) / 100} mi`;

export const CONFIDENCE_WORDS = Object.freeze({
    exact: "Laps match the plan",
    approximate: "Matched approximately",
    low: "Rough match",
    unmatched: "Not matched"
});

/** "−0:04" / "+0:01" / "0:00" (Δ column; negative = faster). */
export function signedText(sec) {
    if (sec == null) return "–";
    const r = Math.round(sec);
    return r === 0 ? "0:00" : `${r < 0 ? "−" : "+"}${clockText(Math.abs(r))}`;
}

function resultText(s) {
    if (s.status === "missed") return "Missed";
    if (s.status === "partial") return "Cut short";
    if (s.status === "unobserved") return "Not in the laps";
    if (!s.verdict) return "Done";
    if (s.verdict === "within") return "Within target";
    const d = Math.abs(Math.round(s.deltaSec ?? s.deltaPace));
    return `${clockText(d)} ${s.verdict === "fast" ? "fast" : "slow"}${s.deltaSec == null ? "/mi" : ""}`;
}

const stateOf = s => (s.status === "done" ? s.verdict || "done" : s.status);

function targetCell(s) {
    if (s.repTime && s.distanceM) return s.repTime.lo === s.repTime.hi ? clockText(s.repTime.lo) : `${clockText(s.repTime.lo)}–${clockText(s.repTime.hi)}`;
    if (s.target) {
        if (s.distanceM && s.distanceM < MILE * 1.01 && s.distanceM > MILE * 0.99) return s.target.lo === s.target.hi ? clockText(s.target.lo) : `${clockText(s.target.lo)}–${clockText(s.target.hi)}`;
        return s.target.lo === s.target.hi ? paceText(s.target.lo) : `${clockText(s.target.lo)}–${paceText(s.target.hi)}`;
    }
    return esc(s.effort || "–");
}

function actualCell(s) {
    if (!s.actual) return "–";
    if (s.normalizedSec != null) return clockText(s.normalizedSec, { tenths: s.normalizedSec < 300 });
    if (s.durationSec) return paceText(s.actual.paceSec);
    return clockText(s.actual.seconds, { tenths: s.actual.seconds < 300 });
}

function deltaCell(s) {
    if (s.deltaSec != null) return signedText(s.deltaSec);
    if (s.deltaPace != null) return `${signedText(s.deltaPace)}/mi`;
    return "–";
}

function recoveryLine(rec) {
    if (!rec) return "";
    if (!rec.actual) return rec.optional ? "" : `<tr class="ex-rec"><td colspan="5">Recovery: not in the laps</td></tr>`;
    const bits = [`${clockText(rec.actual.seconds)} ${esc(rec.effort || "recovery")}`, miText(rec.actual.meters)];
    if (rec.actual.hr) bits.push(`${rec.actual.hr} bpm`);
    return `<tr class="ex-rec"><td colspan="5">then ${bits.join(" · ")}</td></tr>`;
}

function setTable(set, steps) {
    const work = steps.filter(s => s.kind === "work" && s.set === set.set);
    const recs = new Map(steps.filter(s => s.kind === "recovery" && s.set === set.set && !s.part).map(s => [`${s.rep}`, s]));
    const head = `${esc(set.label)}${set.target ? ` @ ${esc(set.target)}` : ""}`;
    const many = work.length > 1;
    const rows = work.map(s => {
        const name = many ? `${s.part ? `${s.rep}.${s.part}` : s.rep}` : "1";
        const title = s.notes?.length ? ` title="${esc(s.notes.join("; "))}"` : "";
        return `<tr class="ex-row ex-${stateOf(s)}"${title}>
            <td data-label="Rep">${name}${s.part ? ` <small>${esc(s.amount)}</small>` : ""}</td>
            <td data-label="Target">${targetCell(s)}</td>
            <td data-label="Actual">${actualCell(s)}${s.actual?.hr ? ` <small>${s.actual.hr} bpm</small>` : ""}</td>
            <td data-label="Δ">${deltaCell(s)}</td>
            <td data-label="Result" class="ex-result">${resultText(s)}${s.status === "partial" && s.notes[0] ? ` <small>${esc(s.notes[0])}</small>` : ""}</td>
        </tr>${s.part ? "" : recoveryLine(recs.get(`${s.rep}`))}`;
    }).join("");
    const facts = [];
    if (many && set.avgSec != null) facts.push(`avg ${clockText(set.avgSec, { tenths: set.avgSec < 300 })}`);
    else if (many && set.avgPace) facts.push(`avg ${paceText(set.avgPace)}`);
    if (many && set.spreadSec != null) facts.push(`spread ${Math.round(set.spreadSec * 10) / 10} s`);
    if (set.avgHr) facts.push(`${set.avgHr} bpm`);
    return `<div class="ex-set"><div class="ex-set-head"><strong>${head}</strong>${facts.length ? `<span>${facts.join(" · ")}</span>` : ""}</div>
        <table class="ex-table"><thead><tr><th>Rep</th><th>Target</th><th>Actual</th><th>Δ</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// How long a step was planned to be, in meters, for the strip (timed steps at their pace or 8:00/mi).
function plannedMeters(s) {
    if (s.distanceM) return s.distanceM;
    const pace = s.target ? (s.target.lo + s.target.hi) / 2 : 480;
    return (s.durationSec / pace) * MILE;
}

export function stripHtml(x) {
    const shown = x.steps.filter(s => !(s.optional && !s.actual));
    const total = shown.reduce((t, s) => t + plannedMeters(s), 0) || 1;
    const segs = shown.map(s => {
        const cls = s.kind === "work" ? stateOf(s) : s.kind === "recovery" ? "rec" : "easy";
        const w = Math.max(0.6, (plannedMeters(s) / total) * 100).toFixed(2);
        return `<span class="ex-seg ex-${cls}" style="flex-grow:${w}" title="${esc(`${s.label}: ${resultText(s)}`)}"></span>`;
    }).join("");
    const label = `${x.completion?.text || ""}${x.targetCompliance ? `; ${x.targetCompliance.within} of ${x.targetCompliance.judged} on target` : ""}`;
    const used = new Set(shown.filter(s => s.kind === "work").map(stateOf));
    const KEYS = [["within", "within target"], ["fast", "fast"], ["slow", "slow"], ["done", "done (no pace target)"], ["partial", "cut short"], ["missed", "missed"], ["unobserved", "not in the laps"]];
    const legend = KEYS.filter(([k]) => used.has(k)).map(([k, t]) => `<span><i class="ex-key ex-${k}"></i>${t}</span>`).join("");
    return `<div class="ex-strip" role="img" aria-label="${esc(label)}">${segs}</div><div class="ex-legend">${legend}<span><i class="ex-key ex-easy"></i>warm-up / easy</span></div>`;
}

function easyLine(x) {
    const parts = x.steps.filter(s => (s.kind === "warmup" || s.kind === "cooldown") && s.actual)
        .map(s => `${s.kind === "warmup" ? "Warm-up" : "Cool-down"} ${miText(s.actual.meters)} in ${clockText(s.actual.seconds)} (${paceText(s.actual.paceSec)}${s.actual.hr ? `, ${s.actual.hr} bpm` : ""})`);
    return parts.length ? `<p class="ex-easyline">${parts.join(" · ")}</p>` : "";
}

/** Completion · on target · confidence. */
export function chipsHtml(x) {
    const c = x.completion, t = x.targetCompliance;
    const chips = [];
    if (c) chips.push(`<span class="ex-chip ${x.overallStatus === "completed" ? "good" : x.overallStatus === "unknown" ? "" : "warn"}">${esc(c.pct == null ? "Reps not in the laps" : `${c.pct}% done`)}</span>`);
    if (t) chips.push(`<span class="ex-chip ${t.pct >= 80 ? "good" : t.pct >= 50 ? "" : "warn"}">${t.within} of ${t.judged} on target</span>`);
    chips.push(`<span class="ex-chip conf ex-conf-${x.matchConfidence}">${CONFIDENCE_WORDS[x.matchConfidence]}</span>`);
    return `<div class="ex-chips">${chips.join("")}</div>`;
}

/** The whole card body for one reconstructed workout. */
export function executionHtml(x, { open = false } = {}) {
    const read = x.read.length ? `<ul class="ex-read">${x.read.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
    if (!x.source.laps || (x.source.kind === "auto" && x.completion?.pct == null)) return `${chipsHtml(x)}${read}`;
    const tables = x.sets.map(s => setTable(s, x.steps)).join("");
    return `${chipsHtml(x)}${read}${stripHtml(x)}
        <details class="ex-detail"${open ? " open" : ""}><summary>Rep by rep</summary>${tables}${easyLine(x)}</details>`;
}

/** The left-border class of a row: good / ok / off, from the share on target (completion shown apart). */
export function executionClass(x) {
    const t = x.targetCompliance;
    if (!t) return x.overallStatus === "completed" ? "good" : "";
    return t.pct >= 80 ? "good" : t.pct >= 50 ? "ok" : "off";
}
