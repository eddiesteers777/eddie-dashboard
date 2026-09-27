/* ==========================================
   Southbound — Generate / Regenerate dialogs for the coach plan workspace

   generateDialog({ firstName, record, onCreate })
     The settings form, filled in from the client's profile
     (settingsFromProfile), plus a plan name. Creates the plan with
     js/coachPlanGenerator.js and hands it to the editor.
   regenerateDialog({ firstName, record, plan, done, onApply })
     The same form with the plan's saved settings, plus what to redo
     (runs + strength / runs / strength), from which date to which, and
     whether days changed by hand are replaced too. Shows the change list
     first; Apply hands the new plan back (the workspace adds Undo).
========================================== */

import {
    CODES, RACES, TRAINING_GOALS, EXPERIENCE, EQUIPMENT, STRENGTH_LEVELS,
    settingsFromProfile, checkSettings, generateCoachPlan, regeneratePlan, nextMonday, normalGoal, compactChange
} from "./coachPlanGenerator.js";
import { shortDay, isoDate, planDateRange, addDays } from "./coachingPlanModel.js";
import { icon } from "./icons.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAY_LABEL = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const options = (list, value) => list.map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(label)}</option>`).join("");
const counts = (max, value, zero = "None") => Array.from({ length: max + 1 }, (_, n) => [n, n === 0 ? zero : String(n)]);

function dialog(html) {
    const d = document.createElement("dialog");
    d.className = "sb-dialog pw-dialog pw-gen";
    d.innerHTML = html;
    document.body.appendChild(d);
    d.addEventListener("close", () => d.remove());
    d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
    d.showModal();
    return d;
}

function dayChips(name, selected, label) {
    return `<fieldset class="pw-days"><legend class="pw-label">${esc(label)}</legend><div>${CODES.map(c => `
        <label><input type="checkbox" name="${name}" value="${c}"${selected.includes(c) ? " checked" : ""}><span>${DAY_LABEL[c]}</span></label>`).join("")}</div></fieldset>`;
}

// What the coach should keep in mind, straight from the profile.
function profileNotes(record, first) {
    const r = record || {};
    const notes = [];
    if (r.primaryGoal) notes.push(`<p><strong>Goal:</strong> ${esc(r.primaryGoal)}</p>`);
    if (r.targetEvent) notes.push(`<p><strong>Aiming for:</strong> ${esc(r.targetEvent)}${r.targetDate ? ` (${esc(shortDay(r.targetDate))})` : ""}</p>`);
    if (r.injuries) notes.push(`<p class="pw-gen-warn">${icon("alertTriangle")} <strong>Injuries / limits:</strong> ${esc(r.injuries)}</p>`);
    if (r.availabilityNotes) notes.push(`<p><strong>Schedule:</strong> ${esc(r.availabilityNotes)}</p>`);
    return notes.length ? `<div class="pw-gen-profile">${notes.join("")}</div>` : `<p class="sb-dialog-message">${esc(first)} hasn't filled in their profile yet, so these are starting guesses.</p>`;
}

function settingsHtml(s) {
    return `
        <div class="pw-gen-kind" role="radiogroup" aria-label="Plan type">
            <label><input type="radio" name="mode" value="race"${s.mode === "race" ? " checked" : ""}><span>Race plan</span></label>
            <label><input type="radio" name="mode" value="training"${s.mode === "training" ? " checked" : ""}><span>General training</span></label>
        </div>
        <div class="pw-gen-grid" data-show="race"${s.mode === "race" ? "" : " hidden"}>
            <label class="pw-label">Race<select class="sb-dialog-input" name="raceType">${options(RACES, s.raceType)}</select></label>
            <label class="pw-label">Race date<input class="sb-dialog-input" type="date" name="raceDate" value="${esc(s.raceDate)}"></label>
            <label class="pw-label">Goal time (optional)<input class="sb-dialog-input" name="goalTime" value="${esc(s.goalTime)}" placeholder="1:45:00" inputmode="numeric"></label>
        </div>
        <div class="pw-gen-grid" data-show="training"${s.mode === "training" ? "" : " hidden"}>
            <label class="pw-label">Goal<select class="sb-dialog-input" name="trainingGoal">${options(TRAINING_GOALS, s.trainingGoal)}</select></label>
            <label class="pw-label">Ends<input class="sb-dialog-input" type="date" name="endDate" value="${esc(s.endDate)}"></label>
        </div>
        <div class="pw-gen-grid">
            <label class="pw-label">Starts<input class="sb-dialog-input" type="date" name="startDate" value="${esc(s.startDate)}"></label>
            <label class="pw-label">Running experience<select class="sb-dialog-input" name="experience">${options(EXPERIENCE, s.experience)}</select></label>
        </div>
        ${dayChips("trainDays", s.trainDays, "Days they can train")}
        ${dayChips("runDays", s.runDays, "Run days")}
        <div class="pw-gen-grid">
            <label class="pw-label">Long run day<select class="sb-dialog-input" name="longRunDay">${options(CODES.map(c => [c, DAY_LABEL[c]]), s.longRunDay)}</select></label>
            <label class="pw-label">Quality runs / week<select class="sb-dialog-input" name="speedDays">${options(counts(2), s.speedDays)}</select></label>
            <label class="pw-label">Miles / week now<input class="sb-dialog-input" type="number" min="0" max="150" step="1" name="currentMiles" value="${esc(s.currentMiles)}"></label>
            <label class="pw-label"><span data-show="race"${s.mode === "race" ? "" : " hidden"}>Peak miles / week</span><span data-show="training"${s.mode === "training" ? "" : " hidden"}>Build to miles / week</span><input class="sb-dialog-input" type="number" min="0" max="150" step="1" name="peakMiles" value="${esc(s.peakMiles)}"></label>
            <label class="pw-label">Longest recent run (mi)<input class="sb-dialog-input" type="number" min="1" max="30" step="0.5" name="longestRun" value="${esc(s.longestRun)}"></label>
            <label class="pw-label">Cross-training / week<select class="sb-dialog-input" name="crossDays">${options(counts(3), s.crossDays)}</select></label>
        </div>
        <div class="pw-gen-grid">
            <label class="pw-label">Strength / week<select class="sb-dialog-input" name="strengthDays">${options(counts(4), s.strengthDays)}</select></label>
            <label class="pw-label">Strength experience<select class="sb-dialog-input" name="strengthLevel">${options(STRENGTH_LEVELS, s.strengthLevel)}</select></label>
            <label class="pw-label">Equipment<select class="sb-dialog-input" name="equipment">${options(EQUIPMENT, s.equipment)}</select></label>
        </div>`;
}

function readSettings(form, base = {}) {
    const f = new FormData(form);
    const num = k => Number(f.get(k)) || 0;
    const mode = f.get("mode") === "race" ? "race" : "training";
    const raceType = String(f.get("raceType") || base.raceType || "HALF");
    return {
        ...base,
        mode, raceType,
        raceDate: String(f.get("raceDate") || ""),
        goalTime: normalGoal(String(f.get("goalTime") || ""), raceType) || "",
        trainingGoal: String(f.get("trainingGoal") || "BASE_BUILD"),
        endDate: String(f.get("endDate") || ""),
        startDate: String(f.get("startDate") || ""),
        experience: String(f.get("experience") || "RECREATIONAL"),
        trainDays: f.getAll("trainDays").map(String),
        runDays: f.getAll("runDays").map(String),
        longRunDay: String(f.get("longRunDay") || ""),
        speedDays: num("speedDays"),
        currentMiles: num("currentMiles"),
        peakMiles: num("peakMiles"),
        longestRun: num("longestRun") || 3,
        crossDays: num("crossDays"),
        strengthDays: num("strengthDays"),
        strengthLevel: String(f.get("strengthLevel") || "some"),
        equipment: String(f.get("equipment") || "gym")
    };
}

// Race / training fields, and run days always being days they can train.
function wireForm(d) {
    const form = d.querySelector("form");
    form.addEventListener("change", ev => {
        const mode = form.querySelector('[name="mode"]:checked')?.value;
        if (ev.target.name === "mode") d.querySelectorAll("[data-show]").forEach(el => { el.hidden = el.dataset.show !== mode; });
        if (ev.target.name === "runDays" && ev.target.checked) {
            const train = form.querySelector(`[name="trainDays"][value="${ev.target.value}"]`);
            if (train) train.checked = true;
        }
        if (ev.target.name === "trainDays" && !ev.target.checked) {
            const run = form.querySelector(`[name="runDays"][value="${ev.target.value}"]`);
            if (run) run.checked = false;
        }
    });
}

function showError(d, text) {
    const el = d.querySelector('[data-el="error"]');
    el.textContent = text;
    el.hidden = !text;
    if (text) el.scrollIntoView({ block: "nearest" });
}

/** New plan -> Generate. onCreate({ name, kind, plan, warnings, summary }). */
export function generateDialog({ firstName, record, onCreate }) {
    const today = isoDate(new Date());
    const s = settingsFromProfile(record, today);
    const d = dialog(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">Generate a plan for ${esc(firstName)}</h2>
            ${profileNotes(record, firstName)}
            <label class="pw-label">Plan name<input class="sb-dialog-input" name="name" maxlength="120" required value="${esc(s.mode === "race" ? `${RACES.find(r => r[0] === s.raceType)?.[1] || "Race"} plan` : "Training plan")}"></label>
            ${settingsHtml(s)}
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <p class="sb-dialog-message">You'll see every day in the editor next and can change anything. Nothing is sent to ${esc(firstName)} until you publish.</p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">${icon("bolt")} Generate</button>
            </div>
        </form>`);
    wireForm(d);
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", ev => {
        ev.preventDefault();
        const settings = readSettings(ev.target, s);
        const name = String(new FormData(ev.target).get("name") || "").trim();
        const problems = [...(name ? [] : ["Give the plan a name."]), ...checkSettings(settings)];
        if (problems.length) return showError(d, problems[0]);
        try {
            const result = generateCoachPlan(settings);
            d.close();
            onCreate({ name, kind: settings.mode === "race" ? "race" : "training", ...result });
        } catch (error) {
            showError(d, error.message || "Couldn't build that plan. Check the settings.");
        }
    });
}

/**
 * Editor -> Regenerate. done: Set of dates the client marked done.
 * onApply({ plan, kind, message }).
 */
export function regenerateDialog({ firstName, record, plan, done, onApply }) {
    const today = isoDate(new Date());
    const { startDate, endDate } = planDateRange(plan);
    const saved = plan.generator?.settings;
    const s = saved ? { ...saved } : { ...settingsFromProfile(record, today), startDate: startDate || nextMonday(today), endDate: endDate || addDays(nextMonday(today), 83), mode: plan.raceDate ? "race" : "training", raceDate: plan.raceDate || "" };
    const from = today > startDate ? today : startDate;
    const weekEnds = (plan.weeks || []).map(w => w.days?.at(-1)?.date).filter(x => x && x >= from);
    const d = dialog(`
        <form class="sb-dialog-form" novalidate>
            <h2 class="sb-dialog-title">${saved ? "Regenerate" : "Generate into this plan"}</h2>
            <p class="sb-dialog-message">${saved ? "Change any setting, pick what to redo, and preview it before anything changes." : "This plan wasn't generated. Days you already filled in are kept; empty days get filled."} Days ${esc(firstName)} marked done and days before today never change.</p>
            <fieldset class="pw-gen-what">
                <legend class="pw-label">What to redo</legend>
                <label><input type="radio" name="scope" value="all" checked><span>Runs and strength</span></label>
                <label><input type="radio" name="scope" value="runs"><span>Runs only</span></label>
                <label><input type="radio" name="scope" value="strength"><span>Strength only</span></label>
            </fieldset>
            <div class="pw-gen-grid">
                <label class="pw-label">From<input class="sb-dialog-input" type="date" name="from" min="${today}" value="${esc(from)}"></label>
                <label class="pw-label">Through<select class="sb-dialog-input" name="to">
                    <option value="">The end of the plan</option>
                    ${weekEnds.map(dt => `<option value="${dt}">${esc(shortDay(dt))}</option>`).join("")}
                </select></label>
            </div>
            <label class="pw-check"><input type="checkbox" name="replaceEdits"><span>Also replace days I changed by hand</span></label>
            <details class="pw-gen-settings"${saved ? "" : " open"}><summary>Settings</summary>
                ${profileNotes(record, firstName)}
                ${settingsHtml(s)}
            </details>
            <p class="pw-gen-error" data-el="error" role="alert" hidden></p>
            <div class="sb-dialog-actions">
                <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Cancel</button>
                <button type="submit" class="sb-btn sb-btn-primary">Preview changes</button>
            </div>
        </form>`);
    wireForm(d);
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close());
    d.querySelector("form").addEventListener("submit", ev => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        const settings = readSettings(ev.target, s);
        const problems = checkSettings(settings);
        if (problems.length) { d.querySelector(".pw-gen-settings").open = true; return showError(d, problems[0]); }
        const opts = {
            from: String(f.get("from") || from) < today ? today : String(f.get("from") || from),
            to: String(f.get("to") || "") || null,
            scope: String(f.get("scope") || "all"),
            replaceEdits: f.get("replaceEdits") === "on",
            today, done
        };
        let result;
        try { result = regeneratePlan(plan, settings, opts); }
        catch (error) { return showError(d, error.message || "Couldn't build that plan. Check the settings."); }
        d.close();
        preview(result, settings, opts);
    });

    function preview(result, settings, opts) {
        const what = { all: "runs and strength", runs: "runs", strength: "strength" }[opts.scope];
        // One short line a day: what changed, not the whole workout twice.
        const byDate = p => new Map((p.weeks || []).flatMap(w => (w.days || []).map(x => [x.date, x])));
        const was = byDate(plan), now = byDate(result.plan);
        const dates = [...new Set(result.changes.flatMap(c => [c.date, c.from].filter(Boolean)))].sort();
        const lines = dates.slice(0, 40).map(date => `${shortDay(date)} · ${compactChange(was.get(date), now.get(date))}`);
        if (dates.length > 40) lines.push(`…and ${dates.length - 40} more`);
        const p = dialog(`
            <form class="sb-dialog-form">
                <h2 class="sb-dialog-title">${dates.length ? `${dates.length} day${dates.length === 1 ? "" : "s"} change` : "Nothing changes"}</h2>
                <p class="sb-dialog-message">Regenerating ${esc(what)} from ${esc(shortDay(opts.from))}${opts.to ? ` through ${esc(shortDay(opts.to))}` : ""}.</p>
                ${result.keptEdited.length ? `<p class="pw-gen-kept">${icon("lock")} Kept ${result.keptEdited.length} day${result.keptEdited.length === 1 ? "" : "s"} you changed by hand: ${esc(result.keptEdited.slice(0, 6).map(shortDay).join(", "))}${result.keptEdited.length > 6 ? "…" : ""}</p>` : ""}
                ${result.keptDone.length ? `<p class="pw-gen-kept">${icon("check")} Kept ${result.keptDone.length} day${result.keptDone.length === 1 ? "" : "s"} ${esc(firstName)} already did.</p>` : ""}
                ${lines.length ? `<div class="pw-changes"><ul>${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}
                <p class="sb-dialog-message">It goes into your editor (you can undo). ${esc(firstName)} sees it when you publish.</p>
                <div class="sb-dialog-actions">
                    <button type="button" class="sb-btn sb-btn-secondary" data-cancel>Back</button>
                    <button type="submit" class="sb-btn sb-btn-primary"${dates.length ? "" : " disabled"}>Apply</button>
                </div>
            </form>`);
        p.querySelector("[data-cancel]").addEventListener("click", () => p.close());
        p.querySelector("form").addEventListener("submit", ev => {
            ev.preventDefault();
            p.close();
            onApply({ plan: result.plan, kind: settings.mode === "race" ? "race" : "training", message: `Regenerated ${what}: ${dates.length} day${dates.length === 1 ? "" : "s"} changed.` });
        });
    }
}
