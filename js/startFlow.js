/* ==========================================
   Southbound — "Get started" taps (pure)

   A few quick taps before anyone is asked to sign in (start.html). The
   answers wait on the device (sb-start-answers). At first sign-in they are
   written into the person's own client record, using fields the guided
   profile already has, and only where those fields are still empty.
   Nothing here talks to the network. Tested in tests/startFlow.test.mjs.
========================================== */

import { sanitizeClientRecord } from "./clientRecordSchema.js";

export const START_KEY = "sb-start-answers";
export const START_PENDING_KEY = "sb-start-pending";

export const SPORTS = [
    { value: "running", label: "Running", sub: "Road, trail, races" },
    { value: "strength", label: "Strength", sub: "Lifting and gym work" },
    { value: "soccer", label: "Soccer", sub: "1-on-1 or group" },
    { value: "general", label: "General fitness", sub: "Feel and move better" }
];

// Goal choices per sport. eventType maps to the profile's event list;
// goalText fills "primaryGoal" where there is no event to name.
export const GOALS = {
    running: [
        { value: "5k", label: "5K", sub: "First race or a faster one", eventType: "5k" },
        { value: "10k", label: "10K", sub: "Build speed and stamina", eventType: "10k" },
        { value: "half", label: "Half marathon", sub: "13.1 miles", eventType: "half" },
        { value: "marathon", label: "Marathon", sub: "26.2 miles", eventType: "marathon" },
        { value: "ultra", label: "Ultra", sub: "Longer than a marathon", eventType: "ultra" },
        { value: "fit", label: "Just fitter", sub: "No race, just better", goalText: "Get fitter" }
    ],
    strength: [
        { value: "stronger", label: "Get stronger", sub: "Add weight over time", goalText: "Get stronger" },
        { value: "muscle", label: "Build muscle", sub: "Size and shape", goalText: "Build muscle" },
        { value: "support", label: "Support my running", sub: "Stay strong, stay healthy", goalText: "Strength to support my running" },
        { value: "feel", label: "Feel better", sub: "Move well every day", goalText: "Move and feel better" }
    ],
    soccer: [
        { value: "tryout", label: "A tryout", sub: "Make the team", eventType: "tryout" },
        { value: "season", label: "A season", sub: "Be ready for games", eventType: "season" },
        { value: "tournament", label: "A tournament", sub: "Peak for a date", eventType: "tournament" },
        { value: "sharper", label: "Get sharper", sub: "Touch, speed, decisions", goalText: "Get sharper on the ball" }
    ],
    general: [
        { value: "energy", label: "More energy", sub: "Feel better day to day", goalText: "More energy" },
        { value: "lose", label: "Lose weight", sub: "Steady and sustainable", goalText: "Lose weight" },
        { value: "habit", label: "Build a habit", sub: "Show up every week", goalText: "Build a training habit" },
        { value: "fit", label: "Just fitter", sub: "No set goal yet", goalText: "Get fitter" }
    ]
};

// "Where are you now?" (step 4). General fitness skips it.
export const NOW = {
    running: {
        title: "How long can you run today?", sub: "Without stopping. Honest is better.", field: "runStart",
        options: [
            { value: "running", label: "30 minutes or more" }, { value: "run20", label: "About 20 minutes" },
            { value: "run10", label: "10–15 minutes" }, { value: "walk", label: "I walk, not run yet" }
        ]
    },
    strength: {
        title: "How much lifting have you done?", sub: "No wrong answer.", field: "strengthExperience",
        options: [
            { value: "none", label: "New to it" }, { value: "some", label: "Some experience" }, { value: "experienced", label: "Experienced" }
        ]
    },
    soccer: {
        title: "Where do you play?", sub: "Your highest level right now.", field: "soccerLevel",
        options: [
            { value: "rec", label: "Rec" }, { value: "school", label: "School team" },
            { value: "club", label: "Club" }, { value: "travel", label: "Travel / competitive" }
        ]
    }
};

export const MARKS = [
    { value: "run", label: "Runner", path: '<path d="M4 17l3-4 3 2 3-5 4 3"/><circle cx="17" cy="6" r="1.6"/>' },
    { value: "ball", label: "Ball", path: '<circle cx="12" cy="12" r="8"/><path d="M12 8l3 2-1 4h-4l-1-4z"/>' },
    { value: "bell", label: "Kettlebell", path: '<path d="M7 9h10l1 10H6z"/><path d="M9 9a3 3 0 016 0"/>' },
    { value: "peak", label: "Peak", path: '<path d="M3 19l6-10 3 5 3-4 6 9z"/>' }
];

export const DAY_LABELS = [
    ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]
];

const ids = list => list.map(o => o.value);

// Clean whatever was saved (or tampered with) down to known values.
export function cleanStart(input = {}) {
    const a = input && typeof input === "object" ? input : {};
    const sport = ids(SPORTS).includes(a.sport) ? a.sport : "";
    const goal = sport && ids(GOALS[sport]).includes(a.goal) ? a.goal : "";
    const now = sport && NOW[sport] && ids(NOW[sport].options).includes(a.now) ? a.now : "";
    const days = DAY_LABELS.map(d => d[0]).filter(d => Array.isArray(a.days) && a.days.includes(d));
    const name = typeof a.name === "string" ? a.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
    const mark = ids(MARKS).includes(a.mark) ? a.mark : "";
    return { sport, goal, now, days, name, mark };
}

export const hasAnswers = a => { const c = cleanStart(a); return Boolean(c.sport || c.name || c.days.length); };

// The steps to show, in order, for the answers so far.
export function stepsFor(a) {
    const sport = cleanStart(a).sport;
    // Until a sport is picked, count the longest path so "of 5" doesn't change under the person's thumb.
    return ["train", "you", "goal", ...(NOW[sport] || !sport ? ["now"] : []), "days"];
}

// A sample week built from the taps. Illustration only: the real week is Eddie's.
export function exampleWeek(a) {
    const { sport, days } = cleanStart(a);
    const names = {
        running: ["Easy", "Steps", "Easy", "Long", "Easy"],
        strength: ["Lift A", "Lift B", "Lift C", "Lift A", "Lift B"],
        soccer: ["Skills", "Fitness", "Skills", "Match", "Skills"],
        general: ["Move", "Move", "Move", "Move", "Move"]
    }[sport || "running"];
    const mins = { Easy: 30, Steps: 35, Long: 60, "Lift A": 45, "Lift B": 45, "Lift C": 45, Skills: 45, Fitness: 40, Match: 60, Move: 30 };
    const plan = [];
    const last = days.length - 1;
    days.forEach((day, i) => {
        // The longest session lands on the last day picked, which is usually the weekend.
        const label = i === last && days.length > 2 ? names[3] : i === 1 && days.length > 3 ? names[1] : names[i % 5 === 3 ? 0 : i % 5];
        const kind = i === last && days.length > 2 ? names[3] : label;
        plan.push({ day, label: kind, minutes: mins[kind] || 30 });
    });
    return {
        plan,
        sessions: plan.length,
        minutes: plan.reduce((n, p) => n + p.minutes, 0),
        longest: plan.reduce((m, p) => Math.max(m, p.minutes), 0)
    };
}

// Fields to write into the client record: only where the person has no answer yet.
export function recordFromStart(a, existing = {}) {
    const c = cleanStart(a);
    const have = existing || {};
    const goal = c.sport && GOALS[c.sport]?.find(g => g.value === c.goal);
    const wanted = {
        primarySport: c.sport,
        preferredName: c.name,
        eventType: goal?.eventType || "",
        primaryGoal: goal?.goalText || "",
        availabilityDays: c.days
    };
    if (c.sport && NOW[c.sport] && c.now) wanted[NOW[c.sport].field] = c.now;
    const empty = v => v == null || v === "" || (Array.isArray(v) && !v.length);
    const out = {};
    for (const [key, value] of Object.entries(wanted)) {
        if (!empty(value) && empty(have[key])) out[key] = value;
    }
    return out;
}

// The full record to save: what is already there plus the new fields, cleaned by the profile's own rules.
export function mergedRecord(a, existing = null) {
    const add = recordFromStart(a, existing || {});
    if (!Object.keys(add).length) return null;
    return sanitizeClientRecord({ ...(existing || {}), ...add });
}

// What someone would lose by leaving now, by name (the "before you go" sheet). Empty when there is nothing yet.
export function leaveSummary(a) {
    const c = cleanStart(a);
    const items = [];
    const sport = SPORTS.find(s => s.value === c.sport);
    const goal = c.sport && GOALS[c.sport]?.find(g => g.value === c.goal);
    if (sport) items.push({ label: goal ? `${sport.label}, ${goal.label}` : sport.label, tag: goal ? "Goal" : "Sport" });
    if (c.days.length) {
        const names = DAY_LABELS.filter(([id]) => c.days.includes(id)).map(([, n]) => n);
        items.push({ label: names.join(", "), tag: `${names.length} day${names.length === 1 ? "" : "s"}` });
        items.push({ label: `Your week, ${exampleWeek(c).minutes} min`, tag: "Example" });
    }
    if (c.name || c.mark) items.push({ label: c.name && c.mark ? "Your name and mark" : c.name ? "Your name" : "Your mark", tag: "Profile" });
    return { name: c.name, items, any: items.length > 0 };
}

// The tint the flow takes once a sport is picked (subtle, muted; ice blue until then).
export const ACCENTS = {
    "": { ac: "#C7D6E4", glow: "#2B4256" },
    running: { ac: "#8FC3EE", glow: "#27445F" },
    strength: { ac: "#A9A7E3", glow: "#35335A" },
    soccer: { ac: "#9FD3E6", glow: "#23495B" },
    general: { ac: "#E3C3A0", glow: "#4A3F36" }
};
export const accentFor = a => ACCENTS[cleanStart(a).sport] || ACCENTS[""];

// ---- Personal invite links: start.html?for=Jake&sport=soccer ----
// The link carries a first name and a sport, nothing else. Nothing is stored on the server.
const INVITE_SPORTS = {
    soccer: "soccer", running: "running", run: "running", strength: "strength", lifting: "strength", lift: "strength",
    general: "general", fitness: "general"
};
// What each sport is called in a sentence ("your lifting week").
export const INVITE_WORDS = { running: "running", strength: "lifting", soccer: "soccer", general: "fitness" };
// The four buttons on the coach's link maker.
export const INVITE_CHOICES = [
    { value: "soccer", label: "Soccer" }, { value: "running", label: "Running" },
    { value: "strength", label: "Lifting" }, { value: "general", label: "General fitness" }
];

export function cleanInviteName(input) {
    return String(input ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

// null = not an invite. { bad: true } = it tried to be one and the sport didn't read. Otherwise { sport, name }.
export function parseInvite(search) {
    let p;
    try { p = new URLSearchParams(search || ""); } catch { return null; }
    if (!p.has("sport") && !p.has("for")) return null;
    const sport = INVITE_SPORTS[String(p.get("sport") || "").toLowerCase().trim()] || "";
    if (!sport) return { bad: true };
    return { sport, name: cleanInviteName(p.get("for")) };
}

export function inviteLink(name, sport, origin = "https://southboundcoaching.com") {
    const clean = cleanInviteName(name);
    if (!INVITE_WORDS[sport]) return "";
    const q = new URLSearchParams();
    if (clean) q.set("for", clean);
    q.set("sport", sport);
    return `${origin}/start.html?${q.toString().replace(/\+/g, "%20")}`;
}

// The text message Eddie can paste, in his voice.
export function inviteMessage(name, sport, origin) {
    const clean = cleanInviteName(name);
    return `${clean ? `Hey ${clean}, it's` : "Hey, it's"} Eddie. I set up a ${INVITE_WORDS[sport] || "training"} page for you. It takes about a minute: ${inviteLink(clean, sport, origin)}`;
}

// Steps for an invite: a welcome, then the usual ones minus "train" and "you".
export const inviteSteps = a => ["welcome", ...stepsFor(a).filter(s => s !== "train" && s !== "you")];
