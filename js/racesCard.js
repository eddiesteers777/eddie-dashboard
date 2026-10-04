/* ==========================================
   Southbound — "Your races" on Analytics (coach's own data)

   Races are what every prediction the athlete model makes gets checked
   against (docs/PERFORMANCE_ENGINE_PLAN.md, Phase 4). Neither COROS nor
   Strava's archive marks races, so js/athleteLedger.js finds runs that
   look like one and this card asks: Race / Not a race. Confirmed races
   can be edited (distance, official time, "all-out effort"). Saved in
   "race-results" (js/athleteData.js), cloud-synced and private.
========================================== */

import { raceCandidates, confirmedRaces, raceRecord, notRaceRecord, RACE_DISTANCES, milesText, clockText, paceText, parseClock } from "./athleteLedger.js";
import { loadLedger, saveRace, clearRace } from "./athleteData.js";
import { toast } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const STEP = 5;

let sessions = [];
let shown = STEP;
let editing = null;
let showNot = false;

const byId = id => sessions.find(s => s.id === id);
const nameOf = s => [s.otherName, s.name].filter(n => n && n !== "Run").join(" · ") || "Run";
const secondsOf = s => s.elapsedSec || s.movingSec;

function candidateRow(c) {
    const s = c.session;
    return `<li class="ar-row" data-id="${esc(s.id)}">
        <div class="ar-main">
            <strong>${esc(nameOf(s))}</strong>
            <span>${esc(day(s.date))} · ${esc(milesText(s.distance))} · ${esc(clockText(secondsOf(s)))}${secondsOf(s) ? ` · ${esc(paceText(secondsOf(s), s.distance))}` : ""}</span>
            <small>${esc(c.reasons.join(" · "))}</small>
        </div>
        <div class="ar-actions">
            <button type="button" class="sb-btn sb-btn-primary" data-race="yes">Race</button>
            <button type="button" class="sb-btn sb-btn-tertiary" data-race="no">Not a race</button>
        </div>
    </li>`;
}

function editForm(s, race) {
    const options = RACE_DISTANCES.map(d => `<option value="${d.key}"${race.distanceKey === d.key ? " selected" : ""}>${esc(d.label)}</option>`).join("");
    return `<form class="ar-edit" data-edit="${esc(s.id)}">
        <label>Distance<select name="distance">${options}<option value=""${race.distanceKey ? "" : " selected"}>As measured (${esc(milesText(s.distance))})</option></select></label>
        <label>Official time <small>(optional)</small><input name="time" inputmode="numeric" placeholder="${esc(clockText(secondsOf(s)))}" value="${race.official ? esc(clockText(race.timeSec)) : ""}"></label>
        <label class="ar-check"><input type="checkbox" name="allOut"${race.allOut !== false ? " checked" : ""}> All-out race effort <small>(untick if you paced someone or ran it as a workout)</small></label>
        <p class="ar-error" data-error hidden></p>
        <div class="ar-actions">
            <button type="submit" class="sb-btn sb-btn-primary">Save</button>
            <button type="button" class="sb-btn sb-btn-tertiary" data-cancel>Cancel</button>
            <button type="button" class="sb-btn sb-btn-tertiary" data-unrace>Not a race</button>
        </div>
    </form>`;
}

function raceRow({ session: s, race }) {
    const label = RACE_DISTANCES.find(d => d.key === race.distanceKey)?.label || milesText(race.meters || s.distance);
    return `<li class="ar-row" data-id="${esc(s.id)}">
        <div class="ar-main">
            <strong>${esc(label)} · ${esc(clockText(race.timeSec))}${race.official ? " <em>official</em>" : ""}</strong>
            <span>${esc(day(s.date))} · ${esc(nameOf(s))}</span>
            ${race.allOut === false ? `<small>Not all-out: kept, but not used to tune predictions</small>` : ""}
        </div>
        <div class="ar-actions"><button type="button" class="sb-btn sb-btn-secondary" data-edit-open>Edit</button></div>
        ${editing === s.id ? editForm(s, race) : ""}
    </li>`;
}

function render() {
    const el = $("racesPanel");
    if (!el) return;
    const candidates = raceCandidates(sessions);
    const races = confirmedRaces(sessions);
    const notRaces = sessions.filter(s => s.race?.status === "not");
    const body = !sessions.length
        ? `<p class="ar-empty">No runs saved yet. Connect COROS or import your Strava archive below, and the races in them show up here.</p>`
        : `${candidates.length ? `
            <h3 class="ar-h">Is this a race? <span>${candidates.length}</span></h3>
            <ul class="ar-list">${candidates.slice(0, shown).map(candidateRow).join("")}</ul>
            ${candidates.length > shown ? `<button type="button" class="sb-btn sb-btn-tertiary ar-more" data-more>Show ${Math.min(STEP, candidates.length - shown)} more (${candidates.length - shown} left)</button>` : ""}`
            : `<p class="ar-empty">${races.length ? "Nothing new to check. " : ""}No other runs look like races.</p>`}
            <h3 class="ar-h">Confirmed races <span>${races.length}</span></h3>
            ${races.length ? `<ul class="ar-list">${races.map(raceRow).join("")}</ul>` : `<p class="ar-empty">None yet. Tap Race on the runs above that were races.</p>`}
            ${notRaces.length ? `<button type="button" class="sb-btn sb-btn-tertiary ar-more" data-show-not>${showNot ? "Hide" : "Show"} the ${notRaces.length} ${notRaces.length === 1 ? "run" : "runs"} you said weren't races</button>
            ${showNot ? `<ul class="ar-list">${notRaces.map(s => `<li class="ar-row" data-id="${esc(s.id)}"><div class="ar-main"><strong>${esc(nameOf(s))}</strong><span>${esc(day(s.date))} · ${esc(milesText(s.distance))}</span></div><div class="ar-actions"><button type="button" class="sb-btn sb-btn-tertiary" data-undo-not>Undo</button></div></li>`).join("")}</ul>` : ""}` : ""}`;
    el.innerHTML = `
        <div class="panel-header"><div>
            <h2>Your races</h2>
            <p>Every prediction Southbound makes is checked against your real races. Neither COROS nor Strava marks races, so confirm the ones it found.</p>
        </div></div>
        ${body}`;
}

async function refresh() {
    sessions = await loadLedger();
    render();
}

function undoable(message, undo) {
    toast(message, { action: { label: "Undo", onClick: async () => { undo(); await refresh(); } } });
}

function bind() {
    const el = $("racesPanel");
    el.addEventListener("click", async event => {
        const row = event.target.closest("[data-id]");
        const s = row ? byId(row.dataset.id) : null;
        if (event.target.closest("[data-more]")) { shown += STEP; render(); return; }
        if (event.target.closest("[data-show-not]")) { showNot = !showNot; render(); return; }
        if (!s) return;
        const answer = event.target.closest("[data-race]")?.dataset.race;
        if (answer === "yes") {
            saveRace(s, raceRecord(s));
            await refresh();
            undoable(`Saved as a race: ${nameOf(s)}`, () => clearRace(s));
        } else if (answer === "no") {
            saveRace(s, notRaceRecord());
            await refresh();
            undoable("Marked as not a race", () => clearRace(s));
        } else if (event.target.closest("[data-edit-open]")) {
            editing = editing === s.id ? null : s.id;
            render();
            el.querySelector(`[data-edit="${CSS.escape(s.id)}"] select`)?.focus();
        } else if (event.target.closest("[data-cancel]")) {
            editing = null;
            render();
        } else if (event.target.closest("[data-unrace]")) {
            const before = s.race;
            saveRace(s, notRaceRecord());
            editing = null;
            await refresh();
            undoable("Marked as not a race", () => saveRace(s, before));
        } else if (event.target.closest("[data-undo-not]")) {
            clearRace(s);
            await refresh();
        }
    });
    el.addEventListener("submit", async event => {
        const form = event.target.closest("[data-edit]");
        if (!form) return;
        event.preventDefault();
        const s = byId(form.dataset.edit);
        if (!s) return;
        const timeText = form.time.value.trim();
        const officialSec = timeText ? parseClock(timeText) : null;
        if (timeText && !officialSec) {
            const err = form.querySelector("[data-error]");
            err.textContent = "Enter the time like 1:24:10 or 24:37.";
            err.hidden = false;
            form.time.focus();
            return;
        }
        saveRace(s, raceRecord(s, { distanceKey: form.distance.value, officialSec, allOut: form.allOut.checked }));
        editing = null;
        await refresh();
        toast("Race saved");
    });
    // Runs or answers that change elsewhere (a COROS refresh, a Strava import, another device).
    window.addEventListener("sb:strava-updated", refresh);
    window.addEventListener("eddieos:coros-history-updated", refresh);
    window.addEventListener("eddieos:coros-data-updated", refresh);
}

export function mountRacesCard() {
    if (!$("racesPanel")) return;
    bind();
    refresh().catch(error => console.error("Southbound: races couldn't load.", error));
}

mountRacesCard();
