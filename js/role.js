/* ==========================================
   Southbound — Account role on this device

   js/marathonData.js is Eddie's own race block (Indianapolis,
   3:05 goal). It's his personal plan, not a client's, so only a
   coach account should see it on Today, the Running calendar, etc.

   Those pages render synchronously, before the profile has loaded
   from Firestore, so the role is remembered per device here.
   js/navAccess.js writes it every time it reads the profile, and
   js/loadHeader.js reloads the page once if it changed (e.g. the very
   first visit on a new device), so the page is right from then on.
   Unknown (never signed in here) counts as "not a coach".
========================================== */

const KEY = "sb-account-role";

export function cachedRole() {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

export function setCachedRole(role) {
    try {
        if (role) localStorage.setItem(KEY, role);
        else localStorage.removeItem(KEY);
    } catch {
        // Storage blocked -- nothing to remember; pages treat it as a client.
    }
}

// Whether to show the coach's personal marathon plan (js/marathonData.js).
export function showsPersonalPlan() {
    return cachedRole() === "coach";
}
