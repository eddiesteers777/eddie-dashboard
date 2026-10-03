/* ==========================================
   Southbound — the client's Today, by what they have

   Phase 11 step 3 (docs/PHASE_11_PLAN.md section 5). Pure: which
   sections of index.html a client sees, in what order, and the
   hero's one line, all from their capabilities (js/navAccess.js
   access). js/app.js applies it; the coach's own Today is not touched.

   A section a client isn't entitled to is switched off with the class
   `sb-off` (css/style.css), separate from `hidden`, which each
   section's own script keeps using for "nothing to show right now".
========================================== */

import { meets } from "./navAccess.js";

// Top to bottom. `requires` uses the data-requires syntax ("a,b" any).
// Phase 8: TODAY (with NEXT), then the coach, as the plan's mock has it;
// the readiness gauge and the week come after.
export const CLIENT_TODAY = Object.freeze([
    { id: "todayCard", requires: "plan,sessions" },           // today's workouts / sessions, then NEXT
    { id: "coachCardSection", requires: "updates,profile" },  // From Your Coach: check-in, updates, notes ("waiting for approval")
    { id: "profileCheck", requires: "profile" },              // one "still right?" question
    { id: "readinessCard", requires: "readiness" },           // HRV, sleep, check-in (only with COROS: js/readinessCard.js)
    { id: "weekSection", requires: "plan,sessions" },         // this week, one line a day (busy days only without a plan)
    { id: "clientPackageSection", requires: "package" },      // their package and credits
    { id: "todayStats", requires: "running,sessions,habits" },// a few numbers (Progress, step 4)
    { id: "nutritionSnap", requires: "nutrition" },           // today's food
    { id: "todayTools", requires: "" }                         // the tiles (each filtered by data-requires)
].map(Object.freeze));

// [{ id, on }] in display order.
export function clientTodaySections(access) {
    return CLIENT_TODAY.map(s => ({ id: s.id, on: meets(s.requires, access) }));
}

// The line under "Good morning, Sam".
export function clientHeroLine(access, planNames = []) {
    if (access?.status === "archived") return "Your account isn't active right now. If that's a mistake, get in touch with your coach through the Contact page.";
    if (access?.status === "pending") return "Your account is waiting for your coach's approval. Your plan and sessions show up here once you're in.";
    if (planNames.length && meets("plan", access)) return `Training: ${planNames.join(" + ")}`;
    const plan = meets("plan", access);
    const sessions = meets("sessions", access);
    if (plan && sessions) return "Here's your day. Your plan, sessions and check-ins all live here.";
    if (sessions) return "Here's your day. Your sessions and notes from your coach live here.";
    if (plan) return "Here's your day. Your plan and check-ins all live here.";
    return "Here's your day.";
}
