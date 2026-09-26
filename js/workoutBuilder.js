/* ==========================================
   Southbound — the coach's run workout builder

   The "Workout details" panel under a run day in the plan editor
   (js/planWorkspace.js): warm-up, main sets (reps x distance or time,
   target pace range or effort, recovery between reps), cool-down, why
   this workout, coach cue. The raw form values are read back with
   readBuilder() and turned into the stored shape by sanitizeWorkout()
   (js/runWorkout.js).
========================================== */

import { UNITS, sanitizeWorkout, workoutSummary, plannedMiles } from "./runWorkout.js";
import { icon } from "./icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function blankSet() {
    return { repeat: 1, amount: "", unit: "mi", pace: "", effort: "", recovery: { amount: "", unit: "min", note: "easy jog" } };
}

export function startingWorkout(day) {
    if (day?.workout) return JSON.parse(JSON.stringify(day.workout));
    return {
        warmup: { amount: "", unit: "mi", note: "easy" },
        sets: [blankSet()],
        cooldown: { amount: "", unit: "mi", note: "easy" },
        why: "",
        cue: "",
        fuel: ""
    };
}

function unitSelect(name, value, label) {
    return `<select data-wb="${name}" aria-label="${esc(label)}">${UNITS.map(u => `<option value="${u}"${u === (value || "mi") ? " selected" : ""}>${u}</option>`).join("")}</select>`;
}

function stepRow(key, step, label) {
    const s = step || {};
    return `
        <div class="wb-row" data-wb-part="${key}">
            <span class="wb-label">${esc(label)}</span>
            <input data-wb="${key}.amount" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(s.amount ?? "")}" placeholder="0" aria-label="${esc(label)} amount">
            ${unitSelect(`${key}.unit`, s.unit, `${label} unit`)}
            <input data-wb="${key}.note" type="text" maxlength="60" value="${esc(s.note ?? "")}" placeholder="easy" aria-label="${esc(label)} note">
        </div>`;
}

function setHtml(set, i, count) {
    const r = set.recovery || {};
    return `
        <div class="wb-set" data-wb-set="${i}">
            <div class="wb-row">
                <span class="wb-label">Set ${i + 1}</span>
                <input data-wb="sets.${i}.repeat" type="number" min="1" max="50" value="${esc(set.repeat ?? 1)}" aria-label="Set ${i + 1} reps" class="wb-reps">
                <span class="wb-x">×</span>
                <input data-wb="sets.${i}.amount" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(set.amount ?? "")}" placeholder="0" aria-label="Set ${i + 1} distance or time">
                ${unitSelect(`sets.${i}.unit`, set.unit, `Set ${i + 1} unit`)}
                ${count > 1 ? `<button type="button" class="sb-btn sb-btn-icon wb-remove" data-act="wb-remove-set" data-set="${i}" aria-label="Remove set ${i + 1}">${icon("trash")}</button>` : ""}
            </div>
            <div class="wb-row">
                <span class="wb-label">Target</span>
                <input data-wb="sets.${i}.pace" type="text" maxlength="20" value="${esc(set.pace ?? "")}" placeholder="8:05-8:15 (per mile)" aria-label="Set ${i + 1} pace range">
                <input data-wb="sets.${i}.effort" type="text" maxlength="40" value="${esc(set.effort ?? "")}" placeholder="or effort: tempo, 5K..." aria-label="Set ${i + 1} effort">
            </div>
            <div class="wb-row">
                <span class="wb-label">Recover</span>
                <input data-wb="sets.${i}.recovery.amount" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(r.amount ?? "")}" placeholder="0" aria-label="Set ${i + 1} recovery amount">
                ${unitSelect(`sets.${i}.recovery.unit`, r.unit || "min", `Set ${i + 1} recovery unit`)}
                <input data-wb="sets.${i}.recovery.note" type="text" maxlength="60" value="${esc(r.note ?? "")}" placeholder="easy jog" aria-label="Set ${i + 1} recovery note">
            </div>
        </div>`;
}

export function builderHtml(raw) {
    const clean = sanitizeWorkout(raw);
    const { miles, exact } = plannedMiles(clean);
    return `
        <div class="pw-builder">
            ${stepRow("warmup", raw.warmup, "Warm-up")}
            ${(raw.sets || []).map((set, i) => setHtml(set, i, raw.sets.length)).join("")}
            ${(raw.sets || []).length < 8 ? `<button type="button" class="sb-btn sb-btn-tertiary wb-add" data-act="wb-add-set">${icon("plus")} Add a set</button>` : ""}
            ${stepRow("cooldown", raw.cooldown, "Cool-down")}
            <label class="wb-field">Why this workout
                <textarea data-wb="why" rows="2" maxlength="300" placeholder="Builds your ability to hold a hard effort without tying up.">${esc(raw.why || "")}</textarea>
            </label>
            <label class="wb-field">Coach cue
                <input data-wb="cue" type="text" maxlength="200" value="${esc(raw.cue || "")}" placeholder="Relax your shoulders; the last rep should look like the first.">
            </label>
            <label class="wb-field">Fueling note
                <input data-wb="fuel" type="text" maxlength="200" value="${esc(raw.fuel || "")}" placeholder="Practice race-day fueling: gel every 30 min, caffeinated one last.">
            </label>
            <div class="wb-summary" data-wb-summary>${summaryHtml(clean, miles, exact)}</div>
            <button type="button" class="sb-btn sb-btn-tertiary wb-clear" data-act="wb-clear">Remove workout details</button>
        </div>`;
}

export function summaryHtml(clean, miles, exact) {
    if (!clean) return `<span class="wb-hint">Fill in the parts you want. Paces are per mile, like 8:05-8:15.</span>`;
    return `<strong>${esc(workoutSummary(clean) || "Details only")}</strong>${miles ? `<span>${exact ? "" : "about "}${miles} mi${exact ? "" : " plus timed parts"}</span>` : ""}`;
}

// The form's current values as a raw workout.
export function readBuilder(root) {
    const raw = { warmup: {}, sets: [], cooldown: {}, why: "", cue: "", fuel: "" };
    root.querySelectorAll("[data-wb]").forEach(el => {
        const path = el.dataset.wb.split(".");
        let node = raw;
        for (let i = 0; i < path.length - 1; i++) {
            const key = /^\d+$/.test(path[i]) ? Number(path[i]) : path[i];
            if (node[key] === undefined) node[key] = /^\d+$/.test(path[i + 1]) ? [] : {};
            node = node[key];
        }
        node[path[path.length - 1]] = el.value;
    });
    raw.sets = (raw.sets || []).filter(Boolean);
    return raw;
}
