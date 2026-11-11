/* ==========================================
   Southbound — "My plan" tab on the Running page (coach only)

   Eddie's own race plan (5K to marathon), built by the same engine as a
   client's (js/marathonEngine.js) and kept on his own account
   (js/ownPlan.js). It is drawn by the plan screen (js/planScreen.js), the
   Marathon page's design. Nothing here reaches a client.
========================================== */

import { loadOwn, saveOwn, removeOwn, corosPrefill, prefillNote, applyPrefill, doneDates } from "./ownPlan.js";
import { mountPlanScreen } from "./planScreen.js";
import { marathonSetup } from "./marathonSetup.js";
import { marathonSettingsFromProfile, isoToday, clockText } from "./marathonProfile.js";
import { sbConfirm, toast } from "./ui.js";

const root = document.getElementById("myPlanRoot");

let record = null;

async function prefill(today) {
    try {
        const { loadLedger } = await import("./athleteData.js");
        const ledger = await loadLedger(today, { plan: false });
        return corosPrefill(ledger, today);
    } catch { return { runs: 0 }; }
}

async function profileRecord() {
    try { return await (await import("./userProfile.js")).getMyProfile(); } catch { return null; }
}

async function openSetup() {
    const today = isoToday();
    const pre = await prefill(today);
    const plan = record?.generatedPlan?.generator?.settings?.engine === "marathon" ? record.generatedPlan : null;
    const base = plan ? null : applyPrefill({ ...marathonSettingsFromProfile(await profileRecord(), today), strengthDays: 0 }, pre);
    marathonSetup({
        me: true, record: null, plan, settings: base, done: plan ? doneDates(plan) : new Set(),
        note: prefillNote(pre, clockText),
        onCreate: async ({ plan: made }) => { record = await saveOwn({ plan: made }); toast("Your plan is saved.", { type: "success" }); render(); },
        onApply: async ({ plan: next, message }) => { record = await saveOwn({ plan: next }); toast(message || "Your plan is updated.", { type: "success" }); render(); }
    });
}

function render() { screen.update(); }

async function removePlan() {
    if (!await sbConfirm("Remove your plan from the calendar? Days you ticked done stay in your run history.", { title: "Remove my plan?", confirmLabel: "Remove plan", danger: true })) return;
    await removeOwn(); record = null; render();
}

const screen = mountPlanScreen(root, {
    getRecord: () => record,
    onBuild: openSetup, onEdit: openSetup, onRemove: removePlan,
    onChange: async () => { record = await loadOwn(); render(); }
});

(async () => { record = await loadOwn(); render(); })();
window.addEventListener("storage", async () => { record = await loadOwn(); render(); });
