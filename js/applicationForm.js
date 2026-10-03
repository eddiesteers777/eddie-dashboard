/* ==========================================
   Southbound — the Apply form, pure

   Potential clients apply WITHOUT an account (apply.html): one question
   per screen, answered with taps. Saved to applications/{id}, which
   anyone may create and only approved coaches may read (firestore.rules,
   validApplication: keep the choices below and the rules' lists in step;
   tests/applicationForm.test.mjs checks they match).

   When someone who applied later signs in with Google, the coach's
   Pending list finds their application by email (matchApplication), and
   approving copies the answers into their profile (recordFromApplication),
   so they never answer the same thing twice.
========================================== */

import { goalIdeas, sportFromServices } from "./intakeFlow.js";
import { SERVICES } from "./services.js";

// The services from js/services.js, as the Apply form's choices.
export const SERVICE_OPTIONS = SERVICES.map(({ value, label }) => ({ value, label }));

export const WHO = [
    { value: "self", label: "Me" },
    { value: "child", label: "My child" },
    { value: "other", label: "Someone else" }
];

export const AGE_RANGES = [
    { value: "u10", label: "Under 10" },
    { value: "10-13", label: "10–13" },
    { value: "14-18", label: "14–18" },
    { value: "19-29", label: "19–29" },
    { value: "30-39", label: "30–39" },
    { value: "40-49", label: "40–49" },
    { value: "50+", label: "50+" }
];

export const START_WHEN = [
    { value: "now", label: "This week" },
    { value: "month", label: "Within a month" },
    { value: "later", label: "In 1–3 months" },
    { value: "looking", label: "Just looking for now" }
];

export const COACHED_BEFORE = [
    { value: "never", label: "Never" },
    { value: "past", label: "Yes, in the past" },
    { value: "now", label: "Yes, right now" }
];

export const HEARD_FROM = [
    { value: "instagram", label: "Instagram" },
    { value: "facebook", label: "Facebook" },
    { value: "tiktok", label: "TikTok" },
    { value: "google", label: "Google search" },
    { value: "friend", label: "A friend or family member", ask: "Who can I thank?" },
    { value: "client", label: "A current client", ask: "Who can I thank?" },
    { value: "team", label: "My team or club", ask: "Which team or club?" },
    { value: "event", label: "A race or event", ask: "Which one?" },
    { value: "other", label: "Somewhere else", ask: "Where?" }
];

export const CONTACT_BY = [
    { value: "text", label: "Text" },
    { value: "call", label: "Call" },
    { value: "email", label: "Email" }
];

export const CONTACT_TIME = [
    { value: "morning", label: "Morning" },
    { value: "afternoon", label: "Afternoon" },
    { value: "evening", label: "Evening" }
];

// Sizes match firestore.rules.
export const LIMITS = { name: 100, athleteName: 60, email: 200, phone: 40, goal: 300, heardDetail: 100, message: 1000 };

const labelOf = (list, value) => list.find(o => o.value === value)?.label || "";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const validEmail = email => EMAIL_RE.test(String(email || "").trim());

// The screens, in order.
export const STEPS = ["who", "age", "services", "goal", "start", "coached", "heard", "contact", "extra"];

// Goal ideas for what they picked (the first training service they chose).
export function applyGoalIdeas(services = []) {
    return goalIdeas(sportFromServices(services) || "general");
}

// Can they move on from this screen? Returns "" or the reason.
export function screenProblem(step, a = {}) {
    switch (step) {
        case "who":
            if (!a.who) return "Pick who's training.";
            if (!String(a.name || "").trim()) return "Add your name.";
            if (a.who !== "self" && !String(a.athleteName || "").trim()) return "Add their first name.";
            return "";
        case "age": return a.ageRange ? "" : "Pick an age range.";
        case "services": return (a.services || []).length ? "" : "Pick at least one.";
        case "goal": return String(a.goal || "").trim() ? "" : "Pick a goal or type your own.";
        case "start": return a.startWhen ? "" : "Pick one.";
        case "coached": return a.coachedBefore ? "" : "Pick one.";
        case "heard": return a.heardFrom ? "" : "Pick one.";
        case "contact": {
            const email = String(a.email || "").trim();
            const phone = String(a.phone || "").trim();
            if (!email && !phone) return "Add an email or a phone number so I can reach you.";
            if (email && !validEmail(email)) return "That email address doesn't look right.";
            if ((a.contactBy || []).some(v => v !== "email") && !phone) return "Add a phone number for texts or calls.";
            if ((a.contactBy || []).includes("email") && !email) return "Add an email address.";
            return "";
        }
        default: return "";
    }
}

const pick = (list, value) => (list.some(o => o.value === value) ? value : "");
const pickMany = (list, values) => list.map(o => o.value).filter(v => (values || []).includes(v));
const text = (value, max) => String(value ?? "").trim().slice(0, max);

// Form answers -> the saved fields (everything the rules allow except
// status / createdAt / uid, which the data module adds).
export function cleanApplication(a = {}) {
    const who = pick(WHO, a.who) || "self";
    return {
        name: text(a.name, LIMITS.name),
        email: text(a.email, LIMITS.email),
        phone: text(a.phone, LIMITS.phone),
        who,
        athleteName: who === "self" ? "" : text(a.athleteName, LIMITS.athleteName),
        ageRange: pick(AGE_RANGES, a.ageRange),
        services: pickMany(SERVICE_OPTIONS, a.services),
        goal: text(a.goal, LIMITS.goal),
        startWhen: pick(START_WHEN, a.startWhen),
        coachedBefore: pick(COACHED_BEFORE, a.coachedBefore),
        heardFrom: pick(HEARD_FROM, a.heardFrom),
        heardDetail: HEARD_FROM.find(o => o.value === a.heardFrom)?.ask ? text(a.heardDetail, LIMITS.heardDetail) : "",
        contactBy: pickMany(CONTACT_BY, a.contactBy),
        contactTime: pickMany(CONTACT_TIME, a.contactTime),
        message: text(a.message, LIMITS.message)
    };
}

// Every screen answered?
export const applicationProblem = a => STEPS.map(s => screenProblem(s, a)).find(Boolean) || "";

// The application a pending account belongs to, or null: linked by uid
// (they applied while signed in, or the coach matched it), else the
// newest unmatched one with the same email.
export function matchApplication(profile, applications = []) {
    if (!profile) return null;
    const byUid = applications.find(a => a.uid === profile.uid || a.matchedUid === profile.uid);
    if (byUid) return byUid;
    const email = String(profile.email || "").trim().toLowerCase();
    if (!email) return null;
    return applications
        .filter(a => !a.matchedUid && String(a.email || "").trim().toLowerCase() === email)
        .sort((x, y) => ms(y.createdAt) - ms(x.createdAt))[0] || null;
}

const ms = v => (typeof v === "number" ? v : v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Date.parse(v) || 0);

// Applications not tied to any account yet (for "Match to an application").
export const unmatchedApplications = (applications = []) =>
    applications.filter(a => !a.uid && !a.matchedUid).sort((x, y) => ms(y.createdAt) - ms(x.createdAt));

// Starting answers for their profile (clientRecords), from the application.
export function recordFromApplication(app) {
    if (!app) return {};
    const first = String(app.name || "").trim().split(/\s+/)[0] || "";
    const child = app.who && app.who !== "self";
    return {
        whoTrains: child ? "child" : "self",
        preferredName: child ? "" : first,
        athleteName: child ? String(app.athleteName || "").trim() : "",
        phone: String(app.phone || "").trim(),
        primarySport: sportFromServices(app.services || []),
        primaryGoal: String(app.goal || "").trim()
    };
}

// "Instagram 4 · A friend 2 · …" for the coach dashboard, most first.
export function heardTally(applications = []) {
    const counts = new Map();
    for (const a of applications) if (a.heardFrom) counts.set(a.heardFrom, (counts.get(a.heardFrom) || 0) + 1);
    return HEARD_FROM
        .filter(o => counts.has(o.value))
        .map(o => ({ value: o.value, label: o.label, count: counts.get(o.value) }))
        .sort((x, y) => y.count - x.count);
}

// Plain lines for the coach (the alert email, the dashboard row).
export function applicationLines(app) {
    const who = app.who === "self" ? "For themselves" : `For ${app.who === "child" ? "their child" : "someone else"}${app.athleteName ? `, ${app.athleteName}` : ""}`;
    return [
        `${who}${app.ageRange ? ` · age ${labelOf(AGE_RANGES, app.ageRange)}` : ""}`,
        app.services?.length ? `Interested in: ${app.services.map(v => labelOf(SERVICE_OPTIONS, v)).join(", ")}` : "",
        app.goal ? `Goal: ${app.goal}` : "",
        [app.startWhen ? `Start: ${labelOf(START_WHEN, app.startWhen)}` : "", app.coachedBefore ? `Coached before: ${labelOf(COACHED_BEFORE, app.coachedBefore)}` : ""].filter(Boolean).join(" · "),
        app.heardFrom ? `Heard about you: ${labelOf(HEARD_FROM, app.heardFrom)}${app.heardDetail ? ` (${app.heardDetail})` : ""}` : "",
        [app.contactBy?.length ? `Reach by ${app.contactBy.map(v => labelOf(CONTACT_BY, v).toLowerCase()).join(" or ")}` : "",
            app.contactTime?.length ? `best in the ${app.contactTime.map(v => labelOf(CONTACT_TIME, v).toLowerCase()).join(" or ")}` : ""].filter(Boolean).join(", "),
        app.message ? `Also: ${app.message}` : ""
    ].filter(Boolean);
}

export { labelOf };
