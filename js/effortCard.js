/* ==========================================
   Southbound — "How hard was it?" after a watch run (Today)

   One tap per run: the effort (1-10, CR-10 words, js/effortScale.js) for
   each COROS / Strava run of the last 3 days that hasn't been answered,
   from 15 minutes after it ended (the card comes back by itself then).
   Each answer keeps its scale and how long after the run it came. Effort is how the athlete model
   learns what a run cost compared with what it should have
   (docs/PERFORMANCE_ENGINE_PLAN.md 3.5). Saved in "session-rpe"
   (js/athleteData.js), private and cloud-synced. Skip saves "no answer"
   so the run isn't asked about again.

   Clients (athlete model step 7) see it too, but only while they share
   the athlete model with a coach (js/athleteShare.js), without the
   coach's own marathon plan, and never for a run whose effort they
   already gave when logging that day's plan workout. Each answer
   refreshes what the coach sees.

   Each card is its own (Today and Weekly Review can both have one, and a
   page that redraws gets a fresh one). Mounting also asks COROS for runs
   newer than the saved history (js/corosRuns.js), so the run you just
   finished shows up without opening Analytics first. askRunEffort() is
   the same question for one day's run as a dialog (Mark Done on Today).
========================================== */

import { effortPrompts, effortRecord, nextPromptAt, milesText, clockText, planEffortKey } from "./athleteLedger.js";
import { EFFORT_WORDS, EFFORT_HINT, sessionEndMs, toCr10, scaleOf, LATE_MIN } from "./effortScale.js";
import { loadLedger, saveEffort, loadRpe } from "./athleteData.js";
import { isoDate, addDays } from "./corosHistory.js";
import { toast, sbScale } from "./ui.js";

// CR-10 (js/effortScale.js, audit B5). RPE_WORDS stays exported for older callers.
export const RPE_WORDS = EFFORT_WORDS;
const HINT = EFFORT_HINT;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const mounted = new WeakSet();
let shareTimer = null;
let clientSharing = false;

function when(date, today) {
    if (date === today) return "Today";
    if (date === addDays(today, -1)) return "Yesterday";
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

/** A client's answers reach their coach a few seconds after the last tap. */
function shareSoon() {
    if (!clientSharing) return;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
        import("./athleteShare.js").then(m => m.syncSharedAthleteModel({ force: true })).catch(() => {});
    }, 4000);
}

async function ledgerFor(client, today) {
    if (!client) return loadLedger(today);
    const share = await import("./athleteShare.js");
    if (!share.sharesAthleteModel()) return null;
    const { loadCoachPlans } = await import("./coachPlanStore.js");
    return share.fillPlanEfforts(await loadLedger(today, { plan: false }), share.effortsFromCoachPlans(loadCoachPlans()));
}

/**
 * Mounts the card into `el` (Today: the last 3 days; Weekly Review asks
 * about the whole week). client: true for a client's Today.
 */
export function mountEffortCard(el, { client = false, days = 3, max = 4 } = {}) {
    if (!el || mounted.has(el)) return;
    mounted.add(el);
    if (client) clientSharing = true;
    let items = [];

    const render = () => {
        if (!el.isConnected) return;
        if (!items.length) { el.hidden = true; el.innerHTML = ""; return; }
        const today = isoDate(new Date());
        el.hidden = false;
        el.innerHTML = `
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
            <p class="sb-effort-hint">${HINT}</p>
            ${items.some(s => Date.now() - (sessionEndMs(s) || Date.now()) > LATE_MIN * 60000) ? `<p class="sb-effort-hint">Runs from more than a day ago count half: effort is remembered best soon after.</p>` : ""}`;
    };

    let pending = null;
    let waitTimer = null;
    const refresh = () => {
        if (pending) return pending;
        pending = (async () => {
            try {
                const today = isoDate(new Date());
                const sessions = await ledgerFor(client, today);
                const now = Date.now();
                items = sessions ? effortPrompts(sessions, today, { days, max, now }) : [];
                render();
                // A run that just ended is asked about 15 minutes later (audit B5): come back then.
                clearTimeout(waitTimer);
                const due = sessions ? nextPromptAt(sessions, today, now, { days }) : null;
                if (due) waitTimer = setTimeout(refresh, Math.min(due - now + 1000, 30 * 60000));
            } catch (error) {
                console.error("Southbound: effort card couldn't load.", error);
            } finally {
                pending = null;
            }
        })();
        return pending;
    };

    el.addEventListener("click", event => {
        const btn = event.target.closest("[data-rpe]");
        const id = btn?.closest("[data-id]")?.dataset.id;
        const session = items.find(s => s.id === id);
        if (!session) return;
        const value = btn.dataset.rpe === "skip" ? null : Number(btn.dataset.rpe);
        items = items.filter(s => s !== session);
        render();
        saveEffort(session, effortRecord(value, Date.now(), { endMs: sessionEndMs(session) }));
        shareSoon();
        toast(value ? `Effort ${value}: ${RPE_WORDS[value].toLowerCase()}` : "Skipped", {
            action: { label: "Undo", onClick: () => { saveEffort(session, null); shareSoon(); } }
        });
    });
    // Any answer (here, in another card, or from Mark Done), new watch runs, sharing switched on.
    let timer = null;
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
    for (const name of ["sb:athlete-answers", "eddieos:coros-history-updated", "sb:athlete-share"]) window.addEventListener(name, soon);
    refresh();
    // A run finished since COROS was last asked shows up here without a trip to Analytics.
    import("./corosRuns.js").then(m => m.refreshRecentRuns()).catch(() => {});
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && el.isConnected) import("./corosRuns.js").then(m => m.refreshRecentRuns()).catch(() => {});
    });
}

/**
 * "How hard was today's run?" as a dialog, for one plan day (`date`).
 * The answer goes on that day's watch run when it's already here, else it
 * waits under the day ("plan:<date>") and attaches when COROS sends the run.
 * Resolves to the number, "skip", or null when closed.
 */
export async function askRunEffort(date, { title = "How hard was today's run?" } = {}) {
    const sessions = (await loadLedger(date)).filter(s => s.date === date);
    const run = sessions.find(s => s.planned) || sessions.slice().sort((a, b) => b.distance - a.distance)[0] || null;
    // An earlier answer, shown on CR-10 (one on the first words reads as its equivalent).
    const waiting = loadRpe()[planEffortKey(date)];
    const current = run?.rpe ?? (waiting?.rpe ? toCr10(waiting.rpe, scaleOf(waiting)) : null);
    const message = run
        ? `${milesText(run.distance)}${run.movingSec ? ` · ${clockText(run.movingSec)}` : ""}. Tap a number.`
        : "Tap a number. It's matched to your watch run once COROS sends it.";
    const value = await sbScale(message, { title, words: RPE_WORDS, current, hint: HINT, skipLabel: "Not now" });
    if (value === null || value === "skip") return value;
    const target = run ? { ...run, aliases: [...(run.aliases || []), planEffortKey(date)] } : { id: planEffortKey(date), aliases: [] };
    saveEffort(target, effortRecord(value, Date.now(), { endMs: run ? sessionEndMs(run) : null }));
    toast(`Effort ${value}: ${RPE_WORDS[value].toLowerCase()}`, {
        action: { label: "Undo", onClick: () => saveEffort(target, null) }
    });
    return value;
}
