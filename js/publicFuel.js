/* ==========================================================
   publicFuel.js -- page glue for the free Fueling Calculator
   (fuel.html). Reads the form, asks js/publicFuelModel.js for the
   plan and draws it. Nothing is stored, sent or signed in.
   ========================================================== */

import { planFromForm, fuelPlanHtml } from "./publicFuelModel.js";

const form = document.getElementById("pfForm");
const errorEl = document.getElementById("pfError");
const resultEl = document.getElementById("pfResult");

const read = () => {
    const value = id => document.getElementById(id)?.value ?? "";
    return {
        type: value("pfType"), distance: value("pfDistance"), time: value("pfTime"),
        weight: value("pfWeight"), weightUnit: value("pfWeightUnit"),
        temperature: value("pfTemperature"), humidity: value("pfHumidity"),
        tolerance: value("pfTolerance"), stomach: value("pfStomach"), sweat: value("pfSweat"),
        caffeine: document.getElementById("pfCaffeine")?.checked || false,
        unit: document.querySelector('input[name="pfUnit"]:checked')?.value || "oz"
    };
};

const FIELD_IDS = { type: "pfType", distance: "pfDistance", time: "pfTime", weight: "pfWeight", temperature: "pfTemperature", humidity: "pfHumidity" };

form?.addEventListener("submit", event => {
    event.preventDefault();
    const out = planFromForm(read());
    if (!out.ok) {
        errorEl.textContent = out.error;
        errorEl.hidden = false;
        resultEl.hidden = true;
        document.getElementById(FIELD_IDS[out.field])?.focus();
        return;
    }
    errorEl.hidden = true;
    resultEl.innerHTML = fuelPlanHtml(out.view);
    resultEl.hidden = false;
    // The details are optional: keep the page where it is unless the answer is off screen.
    resultEl.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    resultEl.querySelector(".pf-title")?.focus({ preventScroll: true });
});

// Changing an answer after a result: the plan on screen is now out of date, so say so instead of leaving it looking current.
form?.addEventListener("input", () => {
    if (resultEl.hidden || resultEl.querySelector(".pf-stale")) return;
    resultEl.insertAdjacentHTML("afterbegin", `<p class="pf-stale" role="status">You changed an answer. Press Calculate to update this plan.</p>`);
});
