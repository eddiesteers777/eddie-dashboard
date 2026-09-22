/* ==========================================
   EddieOS — Nav Access

   Computes what a signed-in account should see in navigation, based
   on the account/role model from docs/PRODUCT_ARCHITECTURE.md
   (roadmap step 5: "service-driven client nav"). Used by
   js/loadHeader.js (desktop dropdowns + mobile bottom nav) and
   more.html (its own row list).

   Important: this only controls what's SHOWN. It does not block
   direct access to a page's URL -- that's a further hardening step,
   not part of this one. Treat hiding a nav link as a UX
   simplification for clients whose account doesn't cover that area,
   not as the actual security boundary (same posture this app
   already takes everywhere else: Firestore rules are the boundary,
   UI visibility is not).

   Fails OPEN, not closed: if the profile lookup itself fails (e.g.
   Firestore unreachable), this returns full content access rather
   than hiding everything -- the app's nav has always been fully
   open until this step existed, and a transient error here should
   degrade to that prior behavior, not lock someone out of their own
   dashboard.
========================================== */

const TRAINING_SERVICES = ["online_coaching", "running", "strength"];
const SOCCER_SERVICES = ["soccer_1on1", "soccer_group"];

export async function getNavAccess() {
    try {
        const { getMyProfile } = await import("./userProfile.js");
        const profile = await getMyProfile();

        if (!profile) {
            // Not signed in, or no profile yet -- narrowest view.
            return { isCoach: false, hasTrainingAccess: false, hasSoccerAccess: false };
        }

        const services = profile.services || [];
        const isCoach = Boolean(profile.isCoachApproved);
        return {
            isCoach,
            hasTrainingAccess: isCoach || services.some(s => TRAINING_SERVICES.includes(s)),
            hasSoccerAccess: isCoach || services.some(s => SOCCER_SERVICES.includes(s))
        };
    } catch (error) {
        console.warn("EddieOS: nav access check failed -- showing full nav rather than hiding it.", error);
        return { isCoach: false, hasTrainingAccess: true, hasSoccerAccess: true };
    }
}

// Hides any element in `root` carrying data-requires="a,b" unless at
// least one listed requirement is met (OR, not AND) -- e.g.
// data-requires="training,soccer" shows for either. Then hides any
// .eos-dropdown left with zero visible links, so a dropdown never
// renders as an empty, clickable-but-useless button.
export function applyNavAccess(root, access) {
    root.querySelectorAll("[data-requires]").forEach(el => {
        const reqs = el.dataset.requires.split(",").map(r => r.trim());
        const granted = reqs.some(r =>
            (r === "coach" && access.isCoach) ||
            (r === "training" && access.hasTrainingAccess) ||
            (r === "soccer" && access.hasSoccerAccess)
        );
        el.hidden = !granted;
    });

    root.querySelectorAll(".eos-dropdown").forEach(dropdown => {
        if (dropdown.hasAttribute("data-requires")) return; // already handled above as a whole unit
        const links = [...dropdown.querySelectorAll(".eos-dropdown-link")];
        if (links.length && links.every(a => a.hidden)) dropdown.hidden = true;
    });
}
