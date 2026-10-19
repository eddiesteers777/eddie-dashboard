/* ==========================================
   Southbound — the Heart Rate tab of the pace calculator
   (pace.html and pace-calculator.html). Logic in js/heartZones.js.
   Stores and sends nothing.
========================================== */

import { heartRateZones, zoneInputError, estimateMaxHr } from "./heartZones.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function showError(message) {
    const el = $("hr-error");
    el.textContent = message;
    el.style.display = "block";
    $("hr-result-card").style.display = "none";
}

function calculate() {
    $("hr-error").style.display = "none";
    let maxHr = $("hr-max").value.trim();
    const restHr = $("hr-rest").value.trim();
    let estimated = false;
    if (!maxHr && $("hr-age").value.trim()) {
        const guess = estimateMaxHr($("hr-age").value);
        if (!guess) return showError("Enter an age between 10 and 100.");
        maxHr = String(guess);
        estimated = true;
    }
    const problem = zoneInputError({ maxHr, restHr });
    if (problem) return showError(problem);

    const result = heartRateZones({ maxHr, restHr });
    $("hr-method-label").textContent = result.method === "reserve" ? "Heart rate reserve" : "% of max";
    $("hr-zones-table").innerHTML = result.zones.map(z => `<div class="pc-zones-row">
            <span class="pc-zones-name">Z${z.zone} ${esc(z.name)}<small class="pc-hr-feel">${esc(z.feel)}</small></span>
            <span class="pc-zones-range">${z.low}–${z.high} bpm</span>
        </div>`).join("");
    const how = result.method === "reserve"
        ? `Worked out from your heart rate reserve (max ${result.maxHr} − resting ${result.restHr}), which suits runners with a low resting heart rate.`
        : `Worked out as a share of your max heart rate (${result.maxHr}). Add your resting heart rate for zones that fit you more closely.`;
    const guess = estimated ? ` Your max of ${result.maxHr} is an estimate from your age; a hard race or hill test gives a truer number.` : "";
    $("hr-note").textContent = how + guess + " Heart rate lags on short intervals and drifts up in heat, so use effort too.";
    $("hr-result-card").style.display = "block";
}

function init() {
    const btn = $("hr-calc-btn");
    if (!btn) return;
    btn.addEventListener("click", calculate);
    ["hr-max", "hr-rest", "hr-age"].forEach(id => $(id).addEventListener("keydown", e => {
        if (e.key === "Enter") calculate();
    }));
}

init();
