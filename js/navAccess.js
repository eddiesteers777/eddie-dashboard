/* ==========================================
   Southbound — Nav Access

   What a signed-in account should SEE: the capabilities its profile
   gives it (js/services.js, Phase 11 step 2), used by js/loadHeader.js
   (desktop menus, phone tab bar, search, the page check) and every
   element marked data-requires (More's rows, Today's tiles, Settings).

   Important: this only controls what's shown. It is never the security
   boundary: Firestore rules decide what anyone can read or write.
   Hiding a link or sending someone back to Today from a page their
   services don't cover is a UX simplification, nothing more.

   data-requires="a,b" shows an element when ANY listed requirement is
   met; "a+b" needs ALL of its parts. Requirements are capability names
   (js/services.js CAPABILITIES: running, sessions, coach...) or
   "client" (any account that isn't the coach's). So
   data-requires="client+sessions" is a client who books sessions, and
   the coach (who reaches Schedule from the Coach section) doesn't see
   it twice.

   Fails OPEN, not closed: if the profile can't be read and this device
   remembers nothing, the whole client app shows (never the coach's) and
   no page sends anyone away.
========================================== */

import { capabilitiesFor, failOpenCapabilities, hasTrainingService, hasSoccerService } from "./services.js";

// The last access this device worked out (device-only, like
// sb-account-role in js/role.js, never synced): js/loadHeader.js draws
// the tab bar from it straight away, then redraws only if the fresh
// profile says otherwise. Offline, it's what the nav shows. Version 2
// carries capabilities; older copies are ignored (the next profile read
// replaces them).
const ACCESS_KEY = "sb-nav-access";
const VERSION = 2;

export function cachedNavAccess() {
    try {
        const access = JSON.parse(localStorage.getItem(ACCESS_KEY) || "null");
        return access && typeof access === "object" && access.v === VERSION && Array.isArray(access.caps)
            ? { ...access, source: "cache" }
            : null;
    } catch {
        return null;
    }
}
function rememberNavAccess(access) {
    try {
        if (access) localStorage.setItem(ACCESS_KEY, JSON.stringify({ ...access, source: undefined }));
        else localStorage.removeItem(ACCESS_KEY);
    } catch { /* storage unavailable: just not remembered */ }
    return access;
}

// An active plan from their coach on this device (js/coachPlanStore.js):
// what gives a soccer-only client My Plan and the weekly check-in.
function hasActiveCoachPlan() {
    try {
        const plans = JSON.parse(localStorage.getItem("coach-plans") || "[]");
        return Array.isArray(plans) && plans.some(p => p && p.status !== "archived");
    } catch {
        return false;
    }
}

// The access object every caller gets. Pure: tested in tests/navAccess.test.mjs.
export function accessFromProfile(profile, { hasCoachPlan = false } = {}) {
    if (!profile) {
        return { v: VERSION, isCoach: false, hasTrainingAccess: false, hasSoccerAccess: false, status: null, caps: [], source: "profile" };
    }
    const isCoach = profile.isCoachApproved === true;
    const services = Array.isArray(profile.services) ? profile.services : [];
    const caps = capabilitiesFor({ services, status: profile.status || null, isCoachApproved: isCoach, hasCoachPlan });
    return {
        v: VERSION,
        isCoach,
        // Kept for older callers; the capabilities are what decide.
        hasTrainingAccess: isCoach || hasTrainingService(services),
        hasSoccerAccess: isCoach || hasSoccerService(services),
        status: profile.status || null,
        caps: [...caps],
        source: "profile"
    };
}

export function fallbackAccess() {
    return { v: VERSION, isCoach: false, hasTrainingAccess: true, hasSoccerAccess: true, status: null, caps: [...failOpenCapabilities()], source: "fallback" };
}

export async function getNavAccess() {
    try {
        const { getMyProfile } = await import("./userProfile.js");
        const profile = await getMyProfile();
        const { setCachedRole } = await import("./role.js");
        const access = accessFromProfile(profile, { hasCoachPlan: hasActiveCoachPlan() });
        setCachedRole(profile ? (access.isCoach ? "coach" : "client") : null);
        rememberNavAccess(profile ? access : null);
        return access;
    } catch (error) {
        // Offline or unreachable: what this device last knew, else fail open.
        const known = cachedNavAccess();
        if (known) return known;
        console.warn("Southbound: nav access check failed — showing the client app rather than hiding it.", error);
        return fallbackAccess();
    }
}

// The same access, read without remembering anything (no role or access
// written to the device). Page code uses this; only js/loadHeader.js's
// getNavAccess() records the role, so its "the role changed, reload
// once" check still sees the change (a page that recorded it first made
// a coach's first visit stay on the client's Today).
export async function profileAccess() {
    try {
        const { getMyProfile } = await import("./userProfile.js");
        return accessFromProfile(await getMyProfile(), { hasCoachPlan: hasActiveCoachPlan() });
    } catch {
        return cachedNavAccess() || fallbackAccess();
    }
}

// Does `access` meet data-requires="a,b+c"?
export function meets(requires, access) {
    if (!requires || !String(requires).trim()) return true;
    const caps = new Set(access?.caps || []);
    const one = part => part === "client" ? !access?.isCoach : caps.has(part);
    return String(requires).split(",").map(s => s.trim()).filter(Boolean)
        .some(option => option.split("+").map(s => s.trim()).every(one));
}

// Short form for page code: can("sessions").
export function can(capability, access = cachedNavAccess()) {
    return meets(capability, access || fallbackAccess());
}

// Pages a client's services may not cover. A client who opens one by link
// goes back to Today (js/loadHeader.js). Pages not listed are for everyone
// signed in (Today, More, Settings, Get the App). The coach has every
// capability, so is never sent away.
export const PAGE_REQUIRES = Object.freeze({
    "running.html": "running",
    "strength.html": "strength",
    "cross-training.html": "crossTraining",
    "nutrition.html": "nutrition",
    "fueling.html": "fueling",
    "habits.html": "habits",
    "plan.html": "plan",
    "progress.html": "progress",
    "workout.html": "plan",
    "programs.html": "running,strength",
    "pace-calculator.html": "running",
    "schedule.html": "sessions",
    "checkin.html": "checkins",
    "updates.html": "updates",
    "profile.html": "profile",
    "clients.html": "coach,updates",
    // Eddie's own tools and the coach's pages.
    "coach.html": "coach",
    "client.html": "coach",
    "marathon.html": "coach",
    "75day.html": "coach",
    "planner.html": "coach",
    "analytics.html": "coach",
    "weekly-review.html": "coach",
    "gear.html": "coach"
});

export function pageAllowed(page, access) {
    if (!access || access.source === "fallback") return true;
    return meets(PAGE_REQUIRES[page] || "", access);
}

// Hides any element in `root` carrying data-requires unless it's met, then
// any .eos-dropdown left with zero visible links, so a dropdown never
// renders as an empty, clickable-but-useless button.
export function applyNavAccess(root, access) {
    root.querySelectorAll("[data-requires]").forEach(el => {
        el.hidden = !meets(el.dataset.requires, access);
    });

    root.querySelectorAll(".eos-dropdown").forEach(dropdown => {
        if (dropdown.hidden) return; // already hidden as a whole unit above
        const links = [...dropdown.querySelectorAll(".eos-dropdown-link")];
        dropdown.hidden = links.length > 0 && links.every(a => a.hidden);
    });
}
