/* ==========================================
   Southbound — health checks the coach has looked at

   A client's "yes" on the profile health check (js/clientRecordSchema.js,
   HEALTH_QUESTIONS) shows in Who needs you today until the coach marks it
   reviewed. That mark is the coach's own, private data: a cloud-synced
   localStorage key ("coach-health-reviewed": { clientUid: healthCheckedAt
   they reviewed }), so nothing new is written where the client can see it.
   A new answer from the client (a later healthCheckedAt) shows again.
========================================== */

const KEY = "coach-health-reviewed";

export function healthReviewed() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}

export function markHealthReviewed(clientUid, checkedAt) {
    const all = healthReviewed();
    all[clientUid] = Number(checkedAt) || Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* fine */ }
}
