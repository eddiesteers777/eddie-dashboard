/* ==========================================
   Southbound — soccer homework, shared markup (client page + Client Hub tab)
========================================== */

import { thumbUrl, clockText, progress, standing, STANDING_LABEL, targetPerWeek, cadenceText } from "./homeworkModel.js";
import { icon } from "./icons.js";

export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function clipText(hw) {
    if (!hw.videoId) return "";
    if (hw.startSec != null && hw.endSec != null) return `${clockText(hw.startSec)} to ${clockText(hw.endSec)}`;
    if (hw.startSec != null) return `from ${clockText(hw.startSec)}`;
    return "";
}

// The video picture (YouTube's own thumbnail) with a play button, or a plain tile.
export function thumbHtml(hw, { small = false, label = true } = {}) {
    if (!hw.videoId) return `<span class="hw-thumb hw-nov${small ? " small" : ""}" aria-hidden="true">${icon("target")}</span>`;
    const clip = label && !small && clipText(hw);
    return `<span class="hw-thumb${small ? " small" : ""}" aria-hidden="true"><img src="${esc(thumbUrl(hw.videoId))}" alt="" loading="lazy"><span class="hw-play"><i></i></span>${clip ? `<span class="hw-clip">${esc(clip)}</span>` : ""}</span>`;
}

const TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>`;
export function ticksHtml(hw, today) {
    const p = progress(hw, today);
    if (p.kind !== "week") return "";
    const n = Math.min(p.target, 7);
    return `<div class="hw-ticks" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span class="hw-tick${i < p.done ? " done" : ""}">${i < p.done ? TICK : ""}</span>`).join("")}<span class="hw-sub" style="margin-left:4px">${esc(p.label)}</span></div>`;
}

export function metaLine(hw) {
    return [hw.skill, cadenceText(hw), hw.minutes ? `${hw.minutes} min` : ""].filter(Boolean).join(" · ");
}

export function standingPill(hw, today) {
    const s = standing(hw, today);
    const tone = { done: "sage", "on-track": "sage", behind: "amber", overdue: "red", archived: "" }[s];
    return `<span class="hw-pill ${tone}">${esc(STANDING_LABEL[s])}</span>`;
}

export function dueText(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
