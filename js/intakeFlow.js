/* ==========================================
   Southbound — the guided profile ("Get started"), pure

   The client profile (js/clientRecordSchema.js, clientRecords/{uid}) asked
   one question per screen, mostly with taps: six essentials first (about a
   minute), then optional ones. This file is the question list and the
   logic; js/intakeGuide.js draws it on profile.html. No DOM here, so it's
   unit-tested (tests/intakeFlow.test.mjs).

   Every essential can be answered, including "no": target event "Nothing
   planned yet" and injuries "None right now" are stored as those words
   (NONE_EVENT / NONE_INJURIES), so the record alone says what's done and
   the coach can tell "said none" from "didn't answer". isNoneAnswer()
   lets every page that shows them treat those as empty.
========================================== */

export const NONE_EVENT = "Nothing planned yet";
export const NONE_INJURIES = "None right now";

// "None", "nothing", "n/a", "no", "not yet"... (also the two above).
export function isNoneAnswer(value) {
    const text = String(value ?? "").trim().toLowerCase().replace(/[.!,]+$/, "").replace(/\s+/g, " ");
    if (!text) return true;
    return /^(none|nothing|no|nope|n\/?a|not (yet|really)|nothing (planned|big|major)|no (injuries|injury|limits|event|race|plans?))( (right now|at the moment|currently|yet|for now|thanks|planned( yet)?))?$/.test(text);
}

// What a page should show for a free-text answer that may be a "none".
export const realAnswer = value => (isNoneAnswer(value) ? "" : String(value).trim());

const filled = v => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);
const RUNNERS = ["running", "general", ""];

// Does this sport ask for weekly miles?
export const asksMiles = sport => RUNNERS.includes(sport || "");

// The six essentials, in order. done(record) reads only the record.
export const ESSENTIALS = [
    { id: "sport", title: "What are you training for mostly?", keys: ["primarySport"], done: r => filled(r.primarySport) },
    { id: "goal", title: "What's the main thing you want to achieve?", keys: ["primaryGoal"], done: r => filled(String(r.primaryGoal || "").trim()) },
    { id: "event", title: "Aiming for a race, tryout or season?", keys: ["targetEvent", "targetDate"], done: r => filled(String(r.targetEvent || "").trim()) || filled(r.targetDate) },
    { id: "days", title: "Which days can you usually train?", keys: ["availabilityDays"], done: r => filled(r.availabilityDays) },
    { id: "level", title: "Where are you starting from?", keys: ["weeklyMileage", "strengthExperience"], done: r => (asksMiles(r.primarySport) ? filled(r.weeklyMileage) : true) && filled(r.strengthExperience) },
    { id: "limits", title: "Anything that limits your training?", keys: ["injuries"], done: r => filled(String(r.injuries || "").trim()) }
];

// Optional questions, one per screen, after the essentials.
export const MORE = [
    { id: "birthYear", key: "birthYear" },
    { id: "phone", key: "phone" },
    { id: "teamOrLevel", key: "teamOrLevel" },
    { id: "currentTraining", key: "currentTraining" },
    { id: "availabilityNotes", key: "availabilityNotes" },
    { id: "secondaryGoals", key: "secondaryGoals" },
    { id: "coachingWants", key: "coachingWants" },
    { id: "workedBefore", key: "workedBefore" },
    { id: "notWorked", key: "notWorked" }
];

export function essentialsDone(record) {
    const r = record || {};
    return ESSENTIALS.filter(step => step.done(r)).length;
}

export const allEssentialsDone = record => essentialsDone(record) === ESSENTIALS.length;

// Where the guide opens: the welcome screen for someone new, else the first
// essential not answered yet, else the review.
export function startStep(record) {
    const r = record || {};
    if (!essentialsDone(r)) return "welcome";
    const open = ESSENTIALS.find(step => !step.done(r));
    return open ? open.id : "review";
}

// The screen after `id` (essentials, then the "tell Eddie more?" offer, then
// the optional ones, then the review).
export function nextStep(id) {
    const order = ["welcome", ...ESSENTIALS.map(s => s.id), "more", ...MORE.map(s => s.id), "review"];
    const i = order.indexOf(id);
    return i < 0 || i >= order.length - 1 ? "review" : order[i + 1];
}

export function prevStep(id) {
    const order = ["welcome", ...ESSENTIALS.map(s => s.id), "more", ...MORE.map(s => s.id)];
    const i = order.indexOf(id);
    return i <= 0 ? null : order[i - 1];
}

// Tap-to-fill goals for the main sport (they can edit the text after).
export const GOAL_IDEAS = {
    running: ["Run my first 5K", "Run a faster race", "Train for a half marathon", "Train for a marathon", "Run consistently every week", "Stay injury-free"],
    soccer: ["Make the team", "Better first touch and footwork", "Get faster and fitter", "Get ready for the season", "More confidence on the ball"],
    strength: ["Get stronger", "Build muscle", "Lose body fat", "Move and feel better", "Lift with good form"],
    general: ["Get fit and feel better", "Lose weight", "Build a routine that sticks", "Start running", "Get stronger"],
    other: ["Get fitter for my sport", "Build a routine that sticks", "Get stronger", "Feel better day to day"]
};
export const goalIdeas = sport => GOAL_IDEAS[sport] || GOAL_IDEAS.general;

// Weekly-miles buttons: what they tap -> what's stored.
export const MILES_CHOICES = [
    { label: "None yet", value: 0 },
    { label: "1–5", value: 3 },
    { label: "6–15", value: 10 },
    { label: "16–25", value: 20 },
    { label: "26–40", value: 32 },
    { label: "40+", value: 45 }
];

// The button a stored mileage falls under (for showing it picked).
export function milesChoice(miles) {
    if (miles === null || miles === undefined || miles === "") return null;
    const n = Number(miles);
    if (n <= 0) return 0;
    if (n <= 5) return 3;
    if (n <= 15) return 10;
    if (n <= 25) return 20;
    if (n <= 40) return 32;
    return 45;
}

// "What do you want from a coach?" taps, joined into the text answer.
export const COACHING_WANTS = [
    "A plan built around my schedule",
    "Someone to keep me accountable",
    "Feedback on how I'm doing",
    "Technique and form help",
    "Help staying injury-free",
    "Motivation on the hard days"
];

// Adds or removes one tapped phrase from the text answer.
export function togglePhrase(text, phrase) {
    const parts = String(text || "").split(/\s*[;\n]\s*/).map(p => p.trim()).filter(Boolean);
    const has = parts.some(p => p.toLowerCase() === phrase.toLowerCase());
    const next = has ? parts.filter(p => p.toLowerCase() !== phrase.toLowerCase()) : [...parts, phrase];
    return next.join("; ");
}

export const hasPhrase = (text, phrase) =>
    String(text || "").split(/\s*[;\n]\s*/).some(p => p.trim().toLowerCase() === phrase.toLowerCase());

// Days-of-the-week shortcuts.
export const DAY_PRESETS = [
    { label: "Weekdays", days: ["mon", "tue", "wed", "thu", "fri"] },
    { label: "Weekends", days: ["sat", "sun"] },
    { label: "Every day", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] }
];

// About how many miles a week they've run lately, from what the app already
// has: COROS runs ({ date, distance meters }) and the Running Log
// ({ date, miles }). The last 28 days, the bigger of the two sources (a run
// logged in both would otherwise count twice). null without 2+ runs.
export function recentWeeklyMiles({ corosRuns = [], logEntries = [] } = {}, today) {
    const from = shiftDay(today, -27);
    const inRange = d => typeof d === "string" && d >= from && d <= today;
    const coros = corosRuns.filter(r => inRange(r.date) && Number(r.distance) > 0);
    const log = logEntries.filter(e => inRange(e.date) && Number(e.miles) > 0);
    const corosMiles = coros.reduce((sum, r) => sum + Number(r.distance) / 1609.344, 0);
    const logMiles = log.reduce((sum, e) => sum + Number(e.miles), 0);
    const pick = corosMiles >= logMiles
        ? { total: corosMiles, runs: coros.length, source: "COROS" }
        : { total: logMiles, runs: log.length, source: "your running log" };
    if (pick.runs < 2) return null;
    return { miles: Math.round(pick.total / 4), runs: pick.runs, source: pick.source };
}

function shiftDay(date, n) {
    const [y, m, d] = String(date).split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// A starting sport from the services they asked for or were given.
export function sportFromServices(services = []) {
    if (services.includes("running")) return "running";
    if (services.some(s => String(s).startsWith("soccer"))) return "soccer";
    if (services.includes("strength")) return "strength";
    if (services.includes("online_coaching")) return "general";
    return "";
}
