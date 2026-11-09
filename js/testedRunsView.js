/* Southbound — Tested runs card on the Fueling page (step 1 of adaptive
   fueling). Lists logged runs; "Log a run" opens one card: what you took
   (filled from a saved plan if you pick one), then three questions.
   Nothing here changes a plan. Pure logic: js/testedRuns.js. */
import {
    TESTED_KEY, STOMACH, ENERGY, TOOK, TWEAKS, RATING_WORDS,
    buildRun, prefillFromPlan, upsertRun, removeRun, readRuns, runLine
} from "./testedRuns.js";
import { toast, sbConfirm } from "./ui.js";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TAG = { worked: "t-ok", mostly: "t-mid", didnt: "t-no" };

export function initTestedRuns({ load, save }) {
    const body = document.getElementById("fuelTested") && document.getElementById("fuelTestedBody");
    if (!body) return;
    let runs = readRuns(load(TESTED_KEY, []));
    let form = null;           // null = list view, else { values, editingId }
    let saved = null;          // the run just saved: shows a result card above the list

    const seg = (name, table, value) => `<div class="tr-seg" role="radiogroup" aria-label="${name}">${Object.entries(table).map(([k, w]) =>
        `<button type="button" role="radio" aria-checked="${value === k}" class="${value === k ? "on" : ""}" data-pick="${name}" data-v="${k}">${esc(w)}</button>`).join("")}</div>`;

    function resultHtml() {
        if (!saved) return "";
        const next = { worked: "Worked. That rate is logged as one you can build on.", mostly: "Mostly. Worth another try before you build on it.", didnt: "Didn't work. Take note of what to change next time." }[saved.rating];
        return `<div class="tr-result" role="status"><span class="tr-dot ${TAG[saved.rating]}" aria-hidden="true">${saved.rating === "didnt" ? "!" : "✓"}</span>
            <div><span class="tr-eyebrow">Saved</span><b>${esc(RATING_WORDS[saved.rating])}</b><small>${esc(saved.name)} · ${Math.round(saved.taken.carbs)} g/hr</small></div>
            <p>${esc(next)} Your plans don't use it yet.</p></div>`;
    }

    function listHtml() {
        if (!runs.length) return `<div class="tr-empty"><div class="tr-ic" aria-hidden="true">0</div><h3>No tested runs yet</h3>
            <p>After a long run or a race, log what you actually took and how it felt. Three quick questions. Nothing changes in your plans yet.</p>
            <button type="button" class="fuel-btn primary" data-act="new">Log a run</button></div>`;
        return `<p class="tr-lead">Your long runs and races, with what you took.</p>
            <ul class="tr-list">${runs.map(r => `<li><button type="button" class="tr-row" data-act="edit" data-id="${esc(r.id)}">
                <span class="tr-main"><b>${esc(r.name)}</b><small>${esc(runLine(r))}</small></span>
                <span class="tr-tag ${TAG[r.rating] || ""}">${esc(RATING_WORDS[r.rating] || "")}</span></button></li>`).join("")}</ul>
            <button type="button" class="fuel-btn secondary tr-wide" data-act="new">+ Log a run</button>`;
    }

    function formHtml() {
        const v = form.values;
        const plans = load("fueling-plans", []).filter(p => p && p.carbsPerHour);
        const field = (id, label, type, val, extra = "") => `<label class="fuel-field tr-f"><span>${label}</span>
            <input id="tr_${id}" name="${id}" type="${type}" ${type === "number" ? 'inputmode="decimal" step="any"' : ""} value="${esc(val ?? "")}" ${extra}></label>`;
        return `<form class="tr-form" novalidate>
            ${form.editingId ? "" : `<label class="fuel-field tr-f"><span>Start from a saved plan <em>(optional)</em></span>
                <select id="tr_plan"><option value="">Not from a plan</option>${plans.map(p => `<option value="${esc(p.id)}"${String(p.id) === String(v.planId) ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`}
            ${field("name", "Name", "text", v.name, 'placeholder="e.g. Rome 21-miler" maxlength="80" autocomplete="off"')}
            <div class="tr-two">${field("date", "Date", "date", v.date)}
            <div class="tr-f"><span class="tr-lab">Type</span>${seg("kind", { long: "Long run", race: "Race" }, v.kind)}</div></div>
            <div class="tr-two">${field("miles", "Miles", "number", v.miles)}${field("minutes", "Time (minutes)", "number", v.minutes)}</div>
            <p class="tr-sub">What you actually took, per hour</p>
            ${v.planned ? `<p class="tr-hint">The plan said ${Math.round(v.planned.carbs)} g/hr. Change anything that was different.</p>` : ""}
            <div class="tr-two">${field("carbs", "Carbs (g/hr)", "number", v.carbs)}${field("sodium", "Sodium (mg/hr)", "number", v.sodium)}</div>
            <div class="tr-two">${field("fluid", "Fluid (oz/hr)", "number", v.fluid)}${field("caffeine", "Caffeine (mg total)", "number", v.caffeine)}</div>
            ${field("tempF", "Temperature (°F, optional)", "number", v.tempF)}
            ${field("setup", "Your setup (optional)", "text", v.setup, 'placeholder="Bottles, handoff mile, mix" maxlength="300"')}
            <p class="tr-sub">How it went</p>
            <div class="tr-q"><b>Stomach</b>${seg("stomach", STOMACH, v.stomach)}</div>
            <div class="tr-q"><b>Energy late in the run</b>${seg("energy", ENERGY, v.energy)}</div>
            <div class="tr-q"><b>How much did you take?</b>${seg("took", TOOK, v.took)}</div>
            <div class="tr-q"><b>Anything to change? <small>(optional)</small></b><div class="tr-chips">${Object.entries(TWEAKS).map(([k, w]) =>
                `<button type="button" class="tr-chip${(v.tweaks || []).includes(k) ? " on" : ""}" aria-pressed="${(v.tweaks || []).includes(k)}" data-tweak="${k}">${esc(w)}</button>`).join("")}</div></div>
            ${field("note", "A line for yourself (optional)", "text", v.note, 'maxlength="300"')}
            <p class="tr-err" id="trErr" role="alert" hidden></p>
            <button type="submit" class="fuel-btn primary tr-wide">Save tested run</button>
            <button type="button" class="fuel-btn secondary tr-wide" data-act="cancel">Cancel</button>
            ${form.editingId ? `<button type="button" class="tr-del" data-act="delete">Delete this run</button>` : ""}
        </form>`;
    }

    function draw() {
        body.innerHTML = form ? formHtml() : resultHtml() + listHtml();
        if (form) body.querySelector("#tr_name")?.focus({ preventScroll: true });
    }

    function readForm() {
        const f = body.querySelector("form"), g = id => f.querySelector(`#tr_${id}`)?.value ?? "";
        const v = form.values;
        Object.assign(v, { name: g("name"), date: g("date"), miles: g("miles"), minutes: g("minutes"), carbs: g("carbs"), sodium: g("sodium"), fluid: g("fluid"), caffeine: g("caffeine"), tempF: g("tempF"), setup: g("setup"), note: g("note") });
    }

    body.addEventListener("click", async event => {
        const t = event.target.closest("[data-act],[data-pick],[data-tweak]");
        if (!t) return;
        if (t.dataset.act === "new") {
            saved = null;
            form = { editingId: null, values: { kind: "long", date: new Date().toLocaleDateString("en-CA"), tweaks: [] } };
            draw(); body.scrollIntoView({ block: "nearest" }); return;
        }
        if (t.dataset.act === "edit") {
            saved = null;
            const r = runs.find(x => String(x.id) === t.dataset.id); if (!r) return;
            form = { editingId: r.id, values: { ...r, carbs: r.taken.carbs, sodium: r.taken.sodium ?? "", fluid: r.taken.fluid ?? "", caffeine: r.taken.caffeine ?? "", tempF: r.tempF ?? "", tweaks: [...r.tweaks] } };
            draw(); return;
        }
        if (t.dataset.act === "cancel") { form = null; draw(); return; }
        if (t.dataset.act === "delete") {
            if (!await sbConfirm("Delete this tested run? It leaves your list on every device.", { title: "Delete run", confirmLabel: "Delete", danger: true })) return;
            runs = removeRun(runs, form.editingId); save(TESTED_KEY, runs); form = null; draw(); toast("Run deleted.", { type: "info" }); return;
        }
        if (t.dataset.pick) { readForm(); form.values[t.dataset.pick] = t.dataset.v; draw(); body.querySelector(`[data-pick="${t.dataset.pick}"].on`)?.focus({ preventScroll: true }); return; }
        if (t.dataset.tweak) {
            const list = form.values.tweaks || (form.values.tweaks = []), k = t.dataset.tweak, i = list.indexOf(k);
            if (i >= 0) list.splice(i, 1); else list.push(k);
            t.classList.toggle("on", i < 0); t.setAttribute("aria-pressed", String(i < 0));
        }
    });

    body.addEventListener("change", event => {
        if (event.target.id !== "tr_plan" || !form) return;
        readForm();
        const plan = load("fueling-plans", []).find(p => String(p.id) === event.target.value);
        if (plan) {
            const p = prefillFromPlan(plan), keep = form.values;
            delete p.date;                                  // the plan's date is when it was saved, not the run
            if (keep.name) delete p.name;
            for (const k of Object.keys(p)) if (p[k] === "" || p[k] == null) delete p[k];
            form.values = { ...keep, ...p };
        } else { form.values.planId = null; form.values.planned = null; }
        draw();
    });

    body.addEventListener("submit", event => {
        event.preventDefault();
        readForm();
        const old = form.editingId ? runs.find(r => String(r.id) === String(form.editingId)) : null;
        const res = buildRun({ ...form.values, planned: form.values.planned ?? old?.planned }, { id: form.editingId });
        const err = body.querySelector("#trErr");
        if (!res.ok) { err.textContent = res.problem; err.hidden = false; err.scrollIntoView({ block: "nearest" }); return; }
        runs = upsertRun(runs, res.run); save(TESTED_KEY, runs);
        form = null; saved = res.run; draw();
        toast(`Saved as ${RATING_WORDS[res.run.rating]}.`);
    });

    draw();
}
