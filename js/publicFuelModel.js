/* ==========================================================
   publicFuelModel.js -- the free Fueling Calculator on the public
   site (fuel.html). Pure: no DOM, no storage, no network.

   It reads a few answers, runs the same fuel math the app uses for
   every planned run (js/workoutFuel.js -> js/fuelTargets.js), and
   turns the answer into something to draw. Whatever the visitor
   didn't say is a stated assumption, never a hidden one.
   Unit-tested in tests/publicFuel.test.mjs.
   ========================================================== */

import { fuelForRun } from "./workoutFuel.js";
import { formatDuration } from "./fuelTargets.js";
import { fluidText } from "./fluidUnits.js";

export const RUN_TYPES = Object.freeze([
    { value: "easy", label: "Easy run" },
    { value: "long", label: "Long run" },
    { value: "workout", label: "Workout (tempo or intervals)" },
    { value: "race", label: "Race" }
]);

export const DEFAULTS = Object.freeze({ weightLb: 165, temperature: 75, humidity: 55 });
const LB_PER_KG = 2.20462;

const num = v => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
};

/** "105" or "1:45" or "1:45:30" -> minutes (rounded), else null. */
export function parseMinutes(text) {
    const s = String(text ?? "").trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
    const m = s.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
    if (!m) return NaN;
    return Math.round(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 60 : 0));
}

const CHOICES = {
    tolerance: ["low", "moderate", "high"],
    stomach: ["sensitive", "normal", "iron"],
    sweat: ["low", "moderate", "high"]
};

/**
 * raw = { type, distance, time, weight, weightUnit, temperature, humidity,
 *         tolerance, stomach, sweat, caffeine, unit }   (all strings / booleans from the form)
 * -> { ok: true, run, profile, unit, assumptions[] } | { ok: false, error, field }
 */
export function readFuelForm(raw = {}) {
    const type = RUN_TYPES.find(t => t.value === raw.type)?.value;
    if (!type) return { ok: false, error: "Pick what kind of run it is.", field: "type" };

    const miles = num(raw.distance);
    const minutes = parseMinutes(raw.time);
    if (Number.isNaN(miles) || (miles !== null && (miles < 0.5 || miles > 150))) return { ok: false, error: "Distance should be between 0.5 and 150 miles.", field: "distance" };
    if (Number.isNaN(minutes) || (minutes !== null && (minutes < 10 || minutes > 1440))) return { ok: false, error: "Enter the time as minutes (105) or hours and minutes (1:45), between 10 minutes and 24 hours.", field: "time" };
    if (miles === null && minutes === null) return { ok: false, error: "Tell me how far or how long the run is.", field: "distance" };

    const assumptions = [];
    let weightLb = num(raw.weight);
    if (Number.isNaN(weightLb)) return { ok: false, error: "Enter your weight as a number, or leave it blank.", field: "weight" };
    if (weightLb !== null && raw.weightUnit === "kg") weightLb = Math.round(weightLb * LB_PER_KG * 10) / 10;
    if (weightLb !== null && (weightLb < 60 || weightLb > 400)) return { ok: false, error: "Weight should be between 60 and 400 lb (27 to 180 kg).", field: "weight" };
    if (weightLb === null) { weightLb = DEFAULTS.weightLb; assumptions.push(`No weight entered: using ${DEFAULTS.weightLb} lb for the meals before and after.`); }

    let temperature = num(raw.temperature);
    let humidity = num(raw.humidity);
    if (Number.isNaN(temperature) || (temperature !== null && (temperature < -20 || temperature > 120))) return { ok: false, error: "Temperature should be between -20 and 120 °F.", field: "temperature" };
    if (Number.isNaN(humidity) || (humidity !== null && (humidity < 0 || humidity > 100))) return { ok: false, error: "Humidity should be between 0 and 100%.", field: "humidity" };
    if (temperature === null || humidity === null) {
        assumptions.push(`${temperature === null && humidity === null ? "No weather entered" : temperature === null ? "No temperature entered" : "No humidity entered"}: using ${temperature === null ? DEFAULTS.temperature + " °F" : ""}${temperature === null && humidity === null ? " and " : ""}${humidity === null ? DEFAULTS.humidity + "% humidity" : ""}.`);
        temperature ??= DEFAULTS.temperature;
        humidity ??= DEFAULTS.humidity;
    }

    const pick = (key, fallback) => (CHOICES[key].includes(raw[key]) ? raw[key] : fallback);
    const tolerance = pick("tolerance", "moderate");
    const stomach = pick("stomach", "normal");
    const sweat = pick("sweat", "moderate");
    if (!CHOICES.tolerance.includes(raw.tolerance) && !CHOICES.stomach.includes(raw.stomach) && !CHOICES.sweat.includes(raw.sweat)) {
        assumptions.push("Gut tolerance, stomach and sweat rate are set to the middle: most people start there.");
    }
    if (minutes === null) assumptions.push("No time entered: the time is estimated from the distance at a typical pace for this kind of run. Enter your own time for a better fit.");

    return {
        ok: true,
        run: { type, miles: miles ?? 0, durationMin: minutes ?? undefined },
        profile: {
            bodyWeight: weightLb, tolerance, stomachSensitivity: stomach, temperature, humidity,
            sweatRate: sweat, sweatSodium: "unknown", caffeineWanted: Boolean(raw.caffeine)
        },
        unit: raw.unit === "ml" ? "ml" : "oz",
        assumptions
    };
}

const typeLabel = type => RUN_TYPES.find(t => t.value === type)?.label.replace(/ \(.*\)$/, "").toLowerCase() || "run";

/** Everything the page draws, from fuelForRun()'s answer. */
export function fuelPlanView(fuel, { run, unit = "oz", assumptions = [] } = {}) {
    const t = fuel.targets;
    const miles = Number(run?.miles) || 0;
    const what = `${miles ? `${Math.round(miles * 10) / 10}-mile ` : ""}${typeLabel(run?.type)}`;
    const none = fuel.level === "none";
    const tiles = none ? [] : [
        { key: "carbs", label: "Carbs", value: String(t.carbsPerHour), unit: "g an hour" },
        { key: "fluid", label: "Fluid", value: fluidText(t.fluidPerHour, unit).replace(/\s*(oz|ml)$/, ""), unit: `${unit} an hour` },
        { key: "sodium", label: "Sodium", value: String(t.sodiumPerHour), unit: "mg an hour" }
    ];
    return {
        title: `Fueling for your ${what}`,
        time: formatDuration(fuel.durationMin),
        estimated: !run?.durationMin,
        level: fuel.level,
        none,
        tiles,
        gels: fuel.gels.map(g => ({ n: g.n, clock: g.clock, mile: g.mile > 0 ? g.mile : null, name: g.name, carbs: g.carbs })),
        before: fuel.before,
        during: fuel.during,
        after: fuel.after,
        why: [...(t.why || []), ...(t.fluidWhy || []).map(w => ({ label: w.label, value: w.value, unit: "fluid" })), ...(t.sodiumWhy || []).map(w => ({ label: w.label, value: w.value, unit: "mg" }))],
        assumptions,
        summary: fuel.summary
    };
}

/** The whole answer for a form: { ok, view } or { ok: false, error, field }. */
export function planFromForm(raw) {
    const read = readFuelForm(raw);
    if (!read.ok) return read;
    const fuel = fuelForRun(read.run, { profile: read.profile, library: [], unit: read.unit });
    return { ok: true, view: fuelPlanView(fuel, { run: read.run, unit: read.unit, assumptions: read.assumptions }) };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** The result card's HTML. */
export function fuelPlanHtml(view) {
    const tiles = view.tiles.map(t => `
        <div class="pf-tile pf-tile-${esc(t.key)}"><span class="pf-tile-label">${esc(t.label)}</span><strong>${esc(t.value)}</strong><span class="pf-tile-unit">${esc(t.unit)}</span></div>`).join("");
    const gels = view.gels.length ? `
        <h3>When to take it</h3>
        <ol class="pf-gels">${view.gels.map(g => `<li><span class="pf-gel-time">${esc(g.clock)}</span><span>${esc(g.name)}${g.carbs ? ` (${esc(g.carbs)} g carbs)` : ""}${g.mile ? ` <small>around mile ${esc(g.mile)}</small>` : ""}</span></li>`).join("")}</ol>
        <p class="pf-note">Sip fluid steadily between these. Times are from the start of the run.</p>` : "";
    const during = view.none
        ? `<p>${esc(view.during[0])}</p>`
        : `<ul>${view.during.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
    const before = `<ul>${view.before.map(b => `<li>${b.when === "Before" ? "" : `<strong>${esc(b.when)}:</strong> `}${esc(b.text)}</li>`).join("")}</ul>`;
    const after = `<ul>${view.after.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
    const why = view.why.length ? `
        <details class="pf-why"><summary>How these numbers were set</summary>
            <ul>${view.why.map(w => `<li>${esc(w.label)}: <strong>${esc(w.value)}${w.unit === "mg" ? " mg" : w.unit === "fluid" ? "" : " g/hr"}</strong></li>`).join("")}</ul>
        </details>` : "";
    const assumed = view.assumptions.length ? `
        <div class="pf-assumed"><strong>What I assumed</strong><ul>${view.assumptions.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : "";
    return `
        <h2 class="pf-title" tabindex="-1">${esc(view.title)}</h2>
        <p class="pf-time">About ${esc(view.time)} on your feet${view.estimated ? " (estimated from the distance)" : ""}</p>
        ${view.none ? `<p class="pf-none">A run this short usually doesn't need fuel during it. Eat normally and drink to thirst.</p>` : `<div class="pf-tiles">${tiles}</div>`}
        ${gels}
        <h3>During</h3>${during}
        <h3>Before</h3>${before}
        <h3>After</h3>${after}
        ${assumed}
        ${why}
        <p class="pf-fine">General guidance for a healthy adult, not medical advice. People differ, so practice what you plan to use on training runs, never for the first time on race day.</p>`;
}
