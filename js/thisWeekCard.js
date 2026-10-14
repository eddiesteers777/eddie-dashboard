/* ==========================================
   Southbound — "This week" on the coach's Today (athlete model step 6)

   The weekly decision for his own marathon plan (js/weeklyDecision.js):
   the level (Proceed / Absorb / Ease / Recover / Check in), why in one
   paragraph, each concern domain, the suggested changes to the next 7
   days, and Apply to plan (writes them into the plan, Undo in the toast
   and on the card) or Not this week (with a reason). Coach only; clients
   come with step 7. Data: js/weeklyDecisionData.js. Also on Weekly Review
   (data-mode="review", audit Phase D): the changes are listed in its Next
   week section instead, and the decision goes out as sb:week-decision.
========================================== */

import { LEVEL_WORDS } from "./weeklyDecision.js";
import { currentDecision, decisionFor, applyDecision, undoDecision, declineDecision, reopenDecision } from "./weeklyDecisionData.js";
import { resetAthleteInputs } from "./readinessV2Data.js";
import { cachedRole } from "./role.js";
import { toast, sbChoose } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const WHEN = at => new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const LEVEL_HINT = {
    proceed: "Train as planned.",
    absorb: "A small trim: easy runs a little shorter, quality at the slow end of the range.",
    ease: "Ease off: shorter easy runs and long run, one quality session with fewer reps.",
    recover: "A few easy days, then back to the plan.",
    checkin: "Something needs a look before the plan changes. Nothing is changed automatically."
};
const REASONS = [
    { label: "I feel fine", value: "I feel fine" },
    { label: "Race or event coming", value: "Race or event coming" },
    { label: "Life / schedule", value: "Life / schedule" },
    { label: "The numbers look wrong", value: "The numbers look wrong" }
];

let current = null;
let detailsExpanded = false;
const groupNote = `<p class="tw-groupnote">Load and how runs are going count once each; HRV, sleep and how you feel move together, so they count at most twice.</p>`;

function choiceHtml(d, entry) {
    if (entry?.choice === "applied") return `<div class="tw-done"><span>Applied ${esc(WHEN(entry.at))}.</span><button type="button" class="sb-btn sb-btn-tertiary" data-tw="undo">Undo</button></div>`;
    if (entry?.choice === "declined") return `<div class="tw-done"><span>Not this week${entry.reason ? ` (${esc(entry.reason)})` : ""}.</span><button type="button" class="sb-btn sb-btn-tertiary" data-tw="reopen">Change my mind</button></div>`;
    if (!d.changes.length) return "";
    return `<div class="tw-actions">
        <button type="button" class="sb-btn sb-btn-primary" data-tw="apply">Apply to plan</button>
        <button type="button" class="sb-btn sb-btn-secondary" data-tw="decline">Not this week</button>
    </div>`;
}

function render() {
    const el = $("thisWeekCard");
    if (!el || !current) return;
    const d = current;
    const entry = decisionFor(d.weekOf);
    const undone = entry?.choice === "undone";
    // Weekly Review remains expanded; Today uses the compact disclosure.
    const review = el.dataset.mode === "review";
    el.className = `tw-card is-${d.level}`;
    el.dataset.version = d.version;

    const domains = d.domains.length
        ? `<ul class="tw-domains">${d.domains.map(x => `<li class="sev-${x.severity}" title="${esc(x.text)}"><span>${esc(x.label)}</span><b>${esc(x.word)}</b></li>`).join("")}</ul>`
        : "";
    const why = review
        ? `<p class="tw-summary">${esc(d.summary)}</p>${d.domains.length ? groupNote : ""}`
        : `<details class="tw-why"><summary>Why</summary><p class="tw-summary">${esc(d.summary)}</p>${d.domains.length ? groupNote : ""}</details>`;
    const changes = !d.changes.length ? "" : review
        ? `<p class="tw-pointer">${d.changes.length} ${d.changes.length === 1 ? "day changes" : "days change"} in the next 7: see <a href="#wrNext">Next week</a> below.</p>`
        : `<p class="tw-sub">Suggested for the next 7 days</p><ul class="tw-changes">${d.changes.map(c => `<li><span>${esc(dayLabel(c.date))}</span>${esc(c.text)}</li>`).join("")}</ul>`;
    const notes = d.notes.length ? `<ul class="tw-notes">${d.notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : "";
    const undoneNote = undone ? `<p class="tw-notes">You undid this week's changes.</p>` : "";
    const actions = choiceHtml(d, undone ? null : entry);
    const link = `<a class="tw-link" href="analytics.html#decisionPanel">Your log and the numbers →</a>`;

    if (review) {
        el.innerHTML = `
            <div class="tw-head">
                <div><div class="sb-eyebrow">This week</div><h2 class="tw-level">${esc(LEVEL_WORDS[d.level])}</h2></div>
                <p class="tw-hint">${esc(LEVEL_HINT[d.level])}</p>
            </div>
            ${domains}
            ${why}
            ${changes}
            ${notes}
            ${undoneNote}
            ${actions}
            ${link}`;
        return;
    }

    el.innerHTML = `
        <div class="tw-compact-head">
            <div class="tw-compact-title">
                <div class="sb-eyebrow">This week</div>
                <h2 class="tw-level">${esc(LEVEL_WORDS[d.level])}</h2>
            </div>
            <p class="tw-hint">${esc(LEVEL_HINT[d.level])}</p>
            <button type="button" class="tw-disclosure" data-tw="toggle"
                aria-expanded="${detailsExpanded ? "true" : "false"}" aria-controls="twDetails">
                <span>${detailsExpanded ? "Hide details" : "Show details"}</span>
                <span class="tw-disclosure-chevron" aria-hidden="true">${detailsExpanded ? "−" : "+"}</span>
            </button>
        </div>
        <div class="tw-details" id="twDetails" ${detailsExpanded ? "" : "hidden"}>
            ${domains}
            ${why}
            ${changes}
            ${notes}
            ${undoneNote}
            ${actions}
            ${link}
        </div>`;
}
async function refresh() {
    const r = await currentDecision(isoToday());
    current = r.decision;
    render();
    // Weekly Review's story reads the same decision and its evidence (js/weeklyStory.js).
    window.dispatchEvent(new CustomEvent("sb:week-decision", { detail: { decision: r.decision, data: r.data } }));
}

async function onClick(event) {
    const act = event.target.closest("[data-tw]")?.dataset.tw;
    if (!act || !current) return;
    if (act === "toggle") {
        detailsExpanded = !detailsExpanded;
        render();
        return;
    }
    if (act === "apply") {
        const undo = await applyDecision(current);
        render();
        toast(`${LEVEL_WORDS[current.level]} applied: ${current.changes.length} ${current.changes.length === 1 ? "day" : "days"} changed.`, { action: { label: "Undo", onClick: async () => { await undo(); render(); } } });
    }
    if (act === "undo") { await undoDecision(current.weekOf); render(); toast("Your plan is back as it was."); }
    if (act === "decline") {
        const reason = await sbChoose("Why not this week? It's saved in your log, so later you can see whether skipping it was right.", { title: "Not this week", choices: REASONS });
        if (reason == null) return;
        declineDecision(current, reason);
        render();
    }
    if (act === "reopen") { reopenDecision(current.weekOf); render(); }
}

function mount() {
    const el = $("thisWeekCard");
    if (!el || cachedRole() !== "coach") return;
    el.addEventListener("click", onClick);
    window.addEventListener("sb:athlete-answers", () => { resetAthleteInputs(); refresh().catch(() => {}); });
    window.addEventListener("sb:readiness-updated", () => { resetAthleteInputs(); refresh().catch(() => {}); });
    refresh().catch(error => console.error("Southbound: this week's decision couldn't load.", error));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
