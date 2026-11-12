/* ==========================================
   Southbound — taking a coach's plan off this calendar by hand

   Pure helpers for the "Plans from a coach" card on Programs
   (js/coachPlansCard.js). Removing only changes this account's copy
   in coach-plans: the coach's published plan (coachingPlans) is left
   alone. A client can remove a plan only when the coach's plan no
   longer exists for them (orphaned, set by js/coachPlanSync.js); a
   coach account can always remove (its copy is never synced).
========================================== */

export function planRange(entry) {
    const dates = [];
    for (const week of entry?.generatedPlan?.weeks || []) {
        if (week.startDate) dates.push(week.startDate);
        if (week.endDate) dates.push(week.endDate);
        for (const day of week.days || []) if (day.date) dates.push(day.date);
    }
    dates.sort();
    return { start: dates[0] || "", end: dates[dates.length - 1] || "" };
}

export function canRemove(entry, role) {
    if (!entry || entry.source !== "coach") return false;
    return role === "coach" || entry.orphaned === true;
}

export function removeCoachPlan(plans, id, now = new Date().toISOString()) {
    return (plans || []).map(p => p.id === id
        ? { ...p, status: "archived", removedByClient: true, removedAt: now }
        : p);
}

export function restoreCoachPlan(plans, id) {
    return (plans || []).map(p => p.id === id
        ? { ...p, status: "active", removedByClient: false, removedAt: null }
        : p);
}

// The coach archived (unassigned) a plan: follow suit on this device.
export function archiveByCoachPlanId(plans, coachPlanId, archived = true) {
    return (plans || []).map(p => p.coachPlanId === coachPlanId
        ? { ...p, status: archived ? "archived" : "active" }
        : p);
}

// A coach plan this account published (it is in `headers`, the coach's own
// coachingPlans list) can be edited in the Client Hub Plan tab, even when it
// was addressed to this same account. Returns that link, or "".
export function editLinkFor(entry, headers) {
    const header = (headers || []).find(h => h.id === entry?.coachPlanId);
    if (!header?.clientUid) return "";
    return `client.html?uid=${encodeURIComponent(header.clientUid)}&tab=plan&plan=${encodeURIComponent(header.id)}`;
}
