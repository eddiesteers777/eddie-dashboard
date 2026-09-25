/* ==========================================
   Southbound — the coach's plans on the client's device

   localStorage "coach-plans": the client's copy of each plan their
   coach published (written only by js/coachPlanSync.js), plus what the
   client records on it ("completed" and the other RUNTIME_KEYS in
   js/coachingPlanModel.js). Kept apart from running-programs /
   training-programs on purpose: the client's Programs and Race Plans
   pages never list these, so a coach's plan can't be edited, regenerated
   or deleted from the client side. Firestore (coachingPlans) is the
   source of truth; this is the offline cache the calendar reads.

   Each entry: { id: "coach-<planId>", coachPlanId, coachVersion, name,
   kind, coachName, status, source: "coach", generatedPlan, updatedAt }
   -- the same shape js/activeProgramSources.js reads for any plan.
========================================== */

export const COACH_PLANS_KEY = "coach-plans";

export function loadCoachPlans() {
    try {
        const parsed = JSON.parse(localStorage.getItem(COACH_PLANS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("Southbound coach-plans storage could not be read:", error);
        return [];
    }
}

export async function saveCoachPlans(plans) {
    localStorage.setItem(COACH_PLANS_KEY, JSON.stringify(plans));
    try {
        const { pushToCloud } = await import("./cloudSync.js");
        await pushToCloud();
    } catch (error) {
        console.warn("Coach-plans cloud sync could not be completed:", error);
    }
}
