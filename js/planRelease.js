/* ==========================================
   Southbound — open each client's next week (coach's app)

   A client sees this week and next of a coach plan (js/planWindow.js).
   There's no server to open the next week on a schedule, so the coach's
   app does it: on page load (js/loadHeader.js, coaches only), at most
   once a day per device, it looks at every plan this coach published
   and, where a new week is due, publishes it from the whole plan
   (coachingPlanMasters) as a quiet version: no email, no "updated"
   card. A missed week catches up the next time the app opens.
   Fires "sb:plans-released" with [{ id, clientUid, through }] when any opened.
========================================== */

import { listMyCoachPlans, getMaster, releasePlan } from "./coachingPlans.js";
import { mightNeedRelease, releaseDue } from "./planWindow.js";
import { isoDate } from "./coachingPlanModel.js";

const DAY_KEY = "sb-plan-release-day";

function lastRun() {
    try { return localStorage.getItem(DAY_KEY) || ""; } catch { return ""; }
}
function remember(day) {
    try { localStorage.setItem(DAY_KEY, day); } catch { /* private window: runs again next time */ }
}

export async function releaseDuePlans({ today = isoDate(new Date()), force = false } = {}) {
    if (!force && lastRun() === today) return { released: [], skipped: true };
    const released = [];
    try {
        const headers = await listMyCoachPlans();
        for (const header of headers.filter(h => mightNeedRelease(h, today))) {
            try {
                const master = await getMaster(header.id);
                if (!master?.plan) continue;
                const through = releaseDue(header, master.plan, today);
                if (!through) continue;
                await releasePlan(header, master.plan, through);
                released.push({ id: header.id, clientUid: header.clientUid, through });
            } catch (error) {
                // Another of the coach's devices got there first, or offline: next time.
                console.warn("Southbound: couldn't open the next week of a plan.", error?.code || error);
            }
        }
    } catch (error) {
        // Rules not published yet, offline, signed out.
        console.warn("Southbound: plan release check unavailable.", error?.code || error);
    }
    remember(today);
    if (released.length) window.dispatchEvent(new CustomEvent("sb:plans-released", { detail: released }));
    return { released, skipped: false };
}
