/* ==========================================
   Southbound — "How hard was it?" after a watch run (Today)

   One tap per run: the effort (1-10) for each COROS / Strava run of the
   last 3 days that hasn't been answered. Effort is how the athlete model
   learns what a run cost compared with what it should have
   (docs/PERFORMANCE_ENGINE_PLAN.md 3.5). Saved in "session-rpe"
   (js/athleteData.js), private and cloud-synced. Skip saves "no answer"
   so the run isn't asked about again.

   Clients (athlete model step 7) see it too, but only while they share
   the athlete model with a coach (js/athleteShare.js), without the
   coach's own marathon plan, and never for a run whose effort they
   already gave when logging that day's plan workout. Each answer
   refreshes what the coach sees.
========================================== */

import { effortPrompts, effortRecord, milesText, clockText } from "./athleteLedger.js";
import { loadLedger, saveEffort } from "./athleteData.js";
import { isoDate, addDays } from "./corosHistory.js";
import { toast } from "./ui.js";

export const RPE_WORDS = { 1: "Very easy", 2: "Easy", 3: "Easy", 4: "Comfortable", 5: "Steady", 6: "Moderate", 7: "Hard", 8: "Very hard", 9: "Near max", 10: "All out" };

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let host = null;
let items = [];
let clientMode = false;
let shareTimer = null;

function when(date, today) {
    if (date === today) return "Today";
    if (date === addDays(today, -1)) return "Yesterday";
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

function render() {
    if (!host) return;
    if (!items.length) { host.hidden = true; host.innerHTML = ""; return; }
    const today = isoDate(new Date());
    host.hidden = false;
    host.innerHTML = `
        <p class="sb-effort-title">How hard was it?</p>
        <ul class="sb-effort-list">${items.map(s => `
            <li data-id="${esc(s.id)}">
                <span class="sb-effort-run"><strong>${esc(when(s.date, today))} · ${esc(milesText(s.distance))}</strong>${s.movingSec ? ` · ${esc(clockText(s.movingSec))}` : ""}${s.name && s.name !== "Run" ? ` · ${esc(s.name)}` : ""}</span>
                <span class="sb-effort-scale" role="group" aria-label="Effort for ${esc(when(s.date, today))}'s run, 1 to 10">
                    ${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button type="button" data-rpe="${n}" title="${RPE_WORDS[n]}" aria-label="${n}: ${RPE_WORDS[n]}">${n}</button>`).join("")}
                    <button type="button" class="sb-effort-skip" data-rpe="skip">Skip</button>
                </span>
            </li>`).join("")}
        </ul>
        <p class="sb-effort-hint">1 = very easy · 5 = steady · 7 = hard · 10 = all out</p>`;
}

async function refresh() {
    const today = isoDate(new Date());
    if (clientMode) {
        const share = await import("./athleteShare.js");
        if (!share.sharesAthleteModel()) { items = []; render(); return; }
        const { loadCoachPlans } = await import("./coachPlanStore.js");
        const sessions = share.fillPlanEfforts(await loadLedger(today, { plan: false }), share.effortsFromCoachPlans(loadCoachPlans()));
        items = effortPrompts(sessions, today);
    } else {
        items = effortPrompts(await loadLedger(), today);
    }
    render();
}

/** A client's answers reach their coach a few seconds after the last tap. */
function shareSoon() {
    if (!clientMode) return;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
        import("./athleteShare.js").then(m => m.syncSharedAthleteModel({ force: true })).catch(() => {});
    }, 4000);
}

/** Mounts the card into `el` (Today). client: true for a client's Today. */
export function mountEffortCard(el, { client = false } = {}) {
    if (!el || host) return;
    host = el;
    clientMode = client;
    el.addEventListener("click", event => {
        const btn = event.target.closest("[data-rpe]");
        const id = btn?.closest("[data-id]")?.dataset.id;
        const session = items.find(s => s.id === id);
        if (!session) return;
        const value = btn.dataset.rpe === "skip" ? null : Number(btn.dataset.rpe);
        saveEffort(session, effortRecord(value));
        items = items.filter(s => s !== session);
        render();
        shareSoon();
        toast(value ? `Effort ${value}: ${RPE_WORDS[value].toLowerCase()}` : "Skipped", {
            action: { label: "Undo", onClick: () => { saveEffort(session, null); shareSoon(); refresh(); } }
        });
    });
    window.addEventListener("eddieos:coros-history-updated", refresh);
    window.addEventListener("sb:athlete-share", refresh);
    refresh().catch(error => console.error("Southbound: effort card couldn't load.", error));
}
