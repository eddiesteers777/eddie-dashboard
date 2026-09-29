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

// The seven essentials, in order. done(record) reads only the record. The
// health check (added 2026-09-29) is last: "None of these" is one tap.
export const ESSENTIALS = [
    { id: "sport", title: "What are you training for mostly?", keys: ["primarySport"], done: r => filled(r.primarySport) },
    { id: "goal", title: "What's the main thing you want to achieve?", keys: ["primaryGoal"], done: r => filled(String(r.primaryGoal || "").trim()) },
    { id: "event", title: "Aiming for a race, tryout or season?", keys: ["targetEvent", "targetDate"], done: r => filled(String(r.targetEvent || "").trim()) || filled(r.targetDate) },
    { id: "days", title: "Which days can you usually train?", keys: ["availabilityDays"], done: r => filled(r.availabilityDays) },
    { id: "level", title: "Where are you starting from?", keys: ["weeklyMileage", "strengthExperience"], done: r => (asksMiles(r.primarySport) ? filled(r.weeklyMileage) : true) && filled(r.strengthExperience) },
    { id: "limits", title: "Anything that limits your training?", keys: ["injuries", "injuryAreas", "injuryStatus"], done: r => filled(String(r.injuries || "").trim()) },
    { id: "health", title: "A quick health check", keys: ["healthFlags", "healthNote"], done: r => Number(r.healthCheckedAt) > 0 }
];

const isChild = r => r?.whoTrains === "child";
const underEighteen = (r, year = new Date().getFullYear()) => !r?.birthYear || year - Number(r.birthYear) < 18;

// Optional questions after the essentials: one field per screen (`key`), or
// a few taps together (`keys`, with a title). `show(record)` hides screens
// that don't apply (soccer questions for a runner...).
export const MORE = [
    { id: "birthYear", key: "birthYear" },
    { id: "phone", key: "phone" },
    { id: "contacts", keys: ["emergencyName", "emergencyPhone", "emergencyRelation", "guardianName", "guardianPhone"],
        title: "Who should your coach call in an emergency?", titleChild: "Who should your coach call in an emergency, besides you?" },
    { id: "running", keys: ["runsPerWeek", "longestRun", "yearsRunning", "runStart"], title: "About your running", titleChild: "About their running",
        show: r => asksMiles(r?.primarySport) },
    { id: "soccer", keys: ["soccerPosition", "soccerLevel", "strongFoot", "yearsPlaying"], title: "About your soccer", titleChild: "About their soccer",
        show: r => r?.primarySport === "soccer" },
    { id: "setup", keys: ["timeOfDay", "sessionLength", "trainWhere", "equipment"], title: "When and where you train", titleChild: "When and where they train" },
    { id: "teamOrLevel", key: "teamOrLevel", show: r => r?.primarySport !== "soccer" },
    { id: "currentTraining", key: "currentTraining" },
    { id: "availabilityNotes", key: "availabilityNotes" },
    { id: "secondaryGoals", key: "secondaryGoals" },
    { id: "coachingWants", key: "coachingWants" },
    { id: "style", keys: ["feedbackStyle", "obstacle"], title: "How you like to be coached", titleChild: "How they like to be coached" },
    { id: "workedBefore", key: "workedBefore" },
    { id: "notWorked", key: "notWorked" }
];

// Which keys a screen actually asks, for this record (the guardian only for
// someone training themselves who may be under 18; "how long can you run
// non-stop" only for low-mileage runners).
export function screenKeys(item, record = {}) {
    let keys = item.keys || [item.key];
    if (item.id === "contacts" && (isChild(record) || !underEighteen(record))) keys = keys.filter(k => !k.startsWith("guardian"));
    if (item.id === "running" && Number(record.weeklyMileage) > 10) keys = keys.filter(k => k !== "runStart");
    return keys;
}

const shows = (item, record) => !item.show || item.show(record || {});

export function essentialsDone(record) {
    const r = record || {};
    return ESSENTIALS.filter(step => step.done(r)).length;
}

export const allEssentialsDone = record => essentialsDone(record) === ESSENTIALS.length;

// The six training answers (every essential but the health check): what the
// "still right?" checks and the coach's freshness line work from, so an
// unanswered health check doesn't silence them.
export const answersDone = record => ESSENTIALS.filter(e => e.id !== "health").every(e => e.done(record || {}));

// Where the guide opens: the welcome screen for someone new, else the first
// essential not answered yet, else the review.
export function startStep(record) {
    const r = record || {};
    if (!essentialsDone(r)) return "welcome";
    const open = ESSENTIALS.find(step => !step.done(r));
    return open ? open.id : "review";
}

// The screen after `id` (essentials, then the "tell Eddie more?" offer, then
// the optional ones that apply, then the review).
function order(record) {
    return ["welcome", ...ESSENTIALS.map(s => s.id), "more", ...MORE.filter(m => shows(m, record)).map(s => s.id)];
}

export function nextStep(id, record) {
    const list = [...order(record), "review"];
    const i = list.indexOf(id);
    return i < 0 || i >= list.length - 1 ? "review" : list[i + 1];
}

export function prevStep(id, record) {
    const list = order(record);
    const i = list.indexOf(id);
    return i <= 0 ? null : list[i - 1];
}

// Optional screens that apply to this record (for "3 of 12").
export const moreFor = record => MORE.filter(m => shows(m, record));

// "Seven quick questions" for the welcome screen.
export const essentialsWord = () => ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"][ESSENTIALS.length] || String(ESSENTIALS.length);

// Event kinds to tap, by sport.
export function eventTypesFor(sport) {
    if (sport === "soccer") return ["tryout", "season", "tournament", "other"];
    if (sport === "strength") return ["season", "tournament", "5k", "other"];
    return ["5k", "10k", "half", "marathon", "ultra", "trail", "triathlon", "other"];
}

// Longest-run buttons: what they tap -> miles stored.
export const LONGEST_CHOICES = [
    { label: "Under 3 mi", value: 2 }, { label: "3–5", value: 4 }, { label: "6–9", value: 8 },
    { label: "10–13", value: 12 }, { label: "14–19", value: 16 }, { label: "20+", value: 20 }
];
export function longestChoice(miles) {
    if (miles === null || miles === undefined || miles === "") return null;
    const n = Number(miles);
    return n < 3 ? 2 : n <= 5 ? 4 : n <= 9 ? 8 : n <= 13 ? 12 : n <= 19 ? 16 : 20;
}

// Emergency contact relation, one tap (stored as the words).
export const RELATIONS = ["Parent", "Spouse / partner", "Sibling", "Friend", "Other family"];

// "Knee, ankle — getting better": the injury text when only taps were given.
export function injurySummary(areas = [], status = "", labels = {}) {
    const where = areas.map(a => labels.areas?.[a] || a).join(", ");
    const how = labels.status?.[status] || "";
    return [where, how.toLowerCase()].filter(Boolean).join(" — ");
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
