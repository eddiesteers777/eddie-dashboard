/* ==========================================
   Southbound — Services and what they unlock

   The one list of services a client can have (`userProfiles.services`)
   and the capabilities each one gives them in the app. Pure: no
   Firebase, no DOM, so the nav, Today, the coach pages, emails and the
   tests all read the same thing (tests/services.test.mjs also checks
   the lists in firestore.rules against it).

   Capabilities decide what the app SHOWS. They are never the security
   boundary: Firestore rules still decide what anyone can read or
   write (own data, coach links, coach approval, wearable consent).

   Eddie's decisions (2026-10-03, docs/PHASE_11_PLAN.md):
   - Online Coaching, Running and Strength all get the same training
     pages (Running, Strength, Cross-Training, Fueling, Nutrition).
   - Soccer gets sessions, Habits and Progress; no Nutrition or
     Fueling. The weekly check-in and a Plan only while Eddie has given
     them a plan (work outside sessions).
   - Pending accounts get their profile and nothing else.
   - Only soccer clients book in-person sessions.

   The service ids never change: they're stored on every profile,
   application and package.
========================================== */

export const SERVICES = Object.freeze([
    { value: "online_coaching", label: "Online Coaching", short: "Online", family: "training" },
    { value: "running", label: "Running Coaching", short: "Running", family: "training" },
    { value: "strength", label: "Strength Coaching", short: "Strength", family: "training" },
    { value: "soccer_1on1", label: "1-on-1 Soccer", short: "1-on-1 Soccer", family: "soccer", inPerson: true },
    { value: "soccer_group", label: "Group Soccer", short: "Group Soccer", family: "soccer", inPerson: true }
].map(Object.freeze));

export const SERVICE_IDS = Object.freeze(SERVICES.map(s => s.value));
export const TRAINING_SERVICES = Object.freeze(SERVICES.filter(s => s.family === "training").map(s => s.value));
export const SOCCER_SERVICES = Object.freeze(SERVICES.filter(s => s.family === "soccer").map(s => s.value));

const BY_ID = new Map(SERVICES.map(s => [s.value, s]));

export const isService = id => BY_ID.has(id);
export const hasTrainingService = (services = []) => (services || []).some(s => TRAINING_SERVICES.includes(s));
export const hasSoccerService = (services = []) => (services || []).some(s => SOCCER_SERVICES.includes(s));

// "Running Coaching" (dialogs, emails, the Apply form) or, with
// { short: true }, "Running" (chips and list rows). Unknown ids pass
// through unchanged so old or hand-edited data still shows something.
export function serviceLabel(id, { short = false } = {}) {
    const s = BY_ID.get(id);
    return s ? (short ? s.short : s.label) : String(id ?? "");
}

export function serviceLabels(services = [], { short = true } = {}) {
    return (services || []).map(id => serviceLabel(id, { short }));
}

// Known ids only, each once, in the registry's order.
export function cleanServices(services = []) {
    const given = new Set(services || []);
    return SERVICE_IDS.filter(id => given.has(id));
}

// ---- Capabilities ----

export const CAPABILITIES = Object.freeze([
    "plan",          // My Plan, workout pages, Today's workouts, Send to COROS
    "running",       // Running, Pace Calculator
    "strength",      // Strength page and library
    "crossTraining", // Cross-Training
    "fueling",       // Fueling, fuel cards on runs
    "nutrition",     // Nutrition
    "readiness",     // the Readiness card (still needs their own COROS)
    "sessions",      // book in-person sessions, sessions on Today, session notes
    "checkins",      // the weekly check-in
    "progress",      // Progress
    "habits",        // Habits
    "package",       // their package card
    "profile",       // My Profile (the guided profile)
    "updates",       // From Your Coach, Connect with Coach
    "coach"          // the Coach section and Eddie's own tools
]);

const TRAINING_CAPS = ["plan", "running", "strength", "crossTraining", "fueling", "nutrition", "readiness", "checkins"];
const ACTIVE_CAPS = ["progress", "habits", "package"];
const ACCOUNT_CAPS = ["profile", "updates"];

// What an account sees, from its profile.
//   services        the profile's services (unknown ids are ignored)
//   status          "active" / "pending" / "archived"
//   isCoachApproved the coach flag (only the coach gets "coach")
//   hasCoachPlan    the client has an active plan from their coach
//                   (gives a soccer-only client Plan + check-in)
export function capabilitiesFor({ services = [], status = null, isCoachApproved = false, hasCoachPlan = false } = {}) {
    if (isCoachApproved === true) return new Set(CAPABILITIES);
    if (status === "pending") return new Set(["profile"]);
    if (status !== "active") return new Set();

    const caps = new Set(ACCOUNT_CAPS);
    const training = hasTrainingService(services);
    const soccer = hasSoccerService(services);
    if (training) TRAINING_CAPS.forEach(c => caps.add(c));
    if (soccer) {
        caps.add("sessions");
        if (hasCoachPlan) { caps.add("plan"); caps.add("checkins"); }
    }
    if (training || soccer) ACTIVE_CAPS.forEach(c => caps.add(c));
    return caps;
}

// When the profile can't be read and the device remembers nothing: the
// whole client app (the nav has always failed open), never the coach's.
export function failOpenCapabilities() {
    return new Set(CAPABILITIES.filter(c => c !== "coach"));
}
