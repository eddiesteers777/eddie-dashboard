/* ==========================================
   Southbound — keeping the client profile current (pure)

   Answers go stale: weekly miles, a sore knee, the days that work, the
   race they were aiming for. This picks the ONE question worth asking
   now, as a small "Still right?" card (js/profileCheckCard.js, on Today
   and at the bottom of the weekly check-in):

     race     their target date has passed -> "How did it go? What's next?"
     pain     they flagged pain on a workout log or check-in since their
              limits were last confirmed
     then, when an answer is older than it should be:
     miles 4 weeks · limits 4 weeks · days 8 weeks · goal 12 weeks ·
     strength 6 months

   "When was this last confirmed" is clientRecords.confirmedAt
   ({ field: ms }), set when the person answers or taps "Yes, still
   right" (js/clientRecords.js). Older records without it use updatedAt.

   Cadence (the person's own cloud-synced "profile-checks"): at most one
   routine question a week; race and pain can come any time; "Not now"
   hides that question for a week. Unit-tested in
   tests/profileChecks.test.mjs.
========================================== */

import { NONE_EVENT, NONE_INJURIES, isNoneAnswer, realAnswer, asksMiles, allEssentialsDone } from "./intakeFlow.js";

export const DAY_MS = 86400000;
export const WEEK_MS = 7 * DAY_MS;

// Fields whose confirmation is tracked (also listed in firestore.rules).
export const TRACKED = ["primaryGoal", "targetEvent", "availabilityDays", "weeklyMileage", "strengthExperience", "injuries"];

// How long an answer stays fresh.
export const MAX_AGE_DAYS = { weeklyMileage: 28, injuries: 28, availabilityDays: 56, primaryGoal: 84, strengthExperience: 182 };

export const STATE_KEY = "profile-checks";
const URGENT = ["ask", "race", "pain"];

// Firestore Timestamp / { seconds } / ms / ISO -> ms (or 0).
export function toMs(value) {
    if (!value) return 0;
    if (typeof value === "number") return value;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
}

// When a field was last confirmed (answered, changed or "still right").
export function confirmedMs(record, key) {
    return toMs(record?.confirmedAt?.[key]) || toMs(record?.updatedAt) || toMs(record?.intakeCompletedAt);
}

export const ageDays = (record, key, now) => {
    const at = confirmedMs(record, key);
    return at ? Math.floor((now - at) / DAY_MS) : Infinity;
};

const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const STRENGTH = { none: "new to strength training", some: "some strength training experience", experienced: "experienced with strength training" };
const shortDate = iso => {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const quote = (text, max = 90) => {
    const t = String(text || "").trim();
    return t.length > max ? `${t.slice(0, max - 1).trim()}…` : t;
};

const noon = date => toMs(`${date}T12:00:00`);

// Pain they flagged lately: workout logs ({ date, pain, painNote }) and
// check-ins ({ weekOf, pain, painNote, submittedAt }). Newest first.
export function recentPain({ results = [], checkins = [] } = {}, today, days = 21) {
    const from = shiftDay(today, -days);
    const out = [];
    for (const r of results) {
        if (r?.pain && r.date >= from && r.date <= today) out.push({ date: r.date, at: toMs(r.updatedAt) || toMs(r.createdAt) || noon(r.date), note: String(r.painNote || "").trim(), where: r.title ? `your ${r.title}` : "a workout" });
    }
    for (const c of checkins) {
        const date = c?.weekOf;
        if (c?.pain && date && date >= from && date <= today) out.push({ date, at: toMs(c.submittedAt) || toMs(c.createdAt) || noon(date), note: String(c.painNote || "").trim(), where: "your check-in" });
    }
    return out.sort((a, b) => b.at - a.at);
}

// What the coach can ask a client to update (Client Hub → "Ask … to
// update"). Stored as clientRecords.askedAt { id: ms } (also in
// firestore.rules); an ask is answered once any of its answers is
// confirmed after it, and the client's app clears it when they answer.
export const ASKS = [
    { id: "goal", label: "Goal and target event", short: "goal", keys: ["primaryGoal", "targetEvent"], steps: ["goal", "event"] },
    { id: "days", label: "Days they can train", short: "training days", keys: ["availabilityDays"], steps: ["days"] },
    { id: "level", label: "Starting point (miles, strength)", short: "starting point", keys: ["weeklyMileage", "strengthExperience"], steps: ["level"] },
    { id: "limits", label: "Injuries and limits", short: "injuries and limits", keys: ["injuries"], steps: ["limits"] }
];
export const ASK_IDS = ASKS.map(a => a.id);
const askById = id => ASKS.find(a => a.id === id);

// Asks still waiting on the client, oldest first: [{ ...ask, at }].
export function openAsks(record) {
    const asked = record?.askedAt || {};
    return ASKS
        .map(a => ({ ...a, at: toMs(asked[a.id]) }))
        .filter(a => a.at && !a.keys.some(k => toMs(record?.confirmedAt?.[k]) >= a.at))
        .sort((a, b) => a.at - b.at);
}

// The asks a save or confirmation of these answers settles.
export const asksSettledBy = (record, keys = []) =>
    openAsks(record).filter(a => a.keys.some(k => keys.includes(k))).map(a => a.id);

// "today", "yesterday", "5 days", "3 weeks", "4 months".
export function ageText(days) {
    if (!Number.isFinite(days)) return "never";
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 14) return `${days} days ago`;
    if (days < 61) return `${Math.round(days / 7)} weeks ago`;
    return `${Math.round(days / 30.4)} months ago`;
}

const FRESH_LABELS = {
    primaryGoal: "Main goal", targetEvent: "Target event", availabilityDays: "Days they can train",
    weeklyMileage: "Miles per week", strengthExperience: "Strength experience", injuries: "Injuries / limits"
};

// How current each tracked answer is, for the coach:
// [{ key, label, days, stale, reason }] (answers that don't apply are left out).
export function answerFreshness(record, now, today) {
    const r = record || {};
    const out = [];
    for (const key of TRACKED) {
        if (key === "weeklyMileage" && !asksMiles(r.primarySport)) continue;
        const value = r[key];
        if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
        const days = ageDays(r, key, now);
        let stale = MAX_AGE_DAYS[key] !== undefined && days >= MAX_AGE_DAYS[key];
        let reason = stale ? "may be out of date" : "";
        if (key === "injuries" && isNoneAnswer(value)) { stale = false; reason = ""; }
        if (key === "targetEvent" && /^\d{4}-\d{2}-\d{2}$/.test(r.targetDate || "") && today && r.targetDate < today) {
            stale = true; reason = "the date has passed";
        }
        out.push({ key, label: FRESH_LABELS[key], days, stale, reason });
    }
    return out;
}

// "Miles per week (6 weeks ago), Target event (the date has passed)".
export function staleSummary(record, now, today) {
    return answerFreshness(record, now, today)
        .filter(f => f.stale)
        .map(f => `${f.label.toLowerCase()} (${f.reason === "the date has passed" ? "the date has passed" : `confirmed ${ageText(f.days)}`})`);
}

/**
 * Every question worth asking now, most important first.
 * ctx: { today: "yyyy-mm-dd", now: ms, pain: recentPain(...), suggestion: { miles, source } | null, child }
 * Each: { id, kind, title, detail, actions: [{ label, act, ... }] }
 *   act "confirm"  { keys }            -> mark those answers still right
 *   act "set"      { values }          -> save these values
 *   act "ask"      { steps }           -> open those guided questions
 */
export function profileChecks(record, { today, now, pain = [], suggestion = null } = {}) {
    const r = record || {};
    if (!allEssentialsDone(r)) return [];     // the "Finish your profile" prompt handles that
    const child = r.whoTrains === "child";
    const you = child ? "they" : "you";
    const your = child ? "their" : "your";
    const checks = [];

    // ---- the coach asked ----
    const asks = openAsks(r);
    if (asks.length) {
        const list = asks.map(a => a.short);
        const named = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
        checks.push({
            id: `ask:${asks.map(a => a.id).join(",")}:${Math.max(...asks.map(a => a.at))}`, kind: "ask",
            title: `Your coach asked you to check ${your} ${named}`,
            detail: `So ${your} plan fits where ${you} are now. It takes a few seconds.`,
            actions: [
                { label: "Update now", act: "ask", steps: [...new Set(asks.flatMap(a => a.steps))], primary: true },
                { label: "It's all still right", act: "confirm", keys: [...new Set(asks.flatMap(a => a.keys))] }
            ]
        });
    }

    // ---- the race date has passed ----
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.targetDate || "") && r.targetDate < today) {
        const event = realAnswer(r.targetEvent) || "your event";
        checks.push({
            id: `race:${r.targetDate}`, kind: "race",
            title: `How did ${event} go?`,
            detail: `It was ${shortDate(r.targetDate)}. What's ${your} next goal? Your coach will plan around it.`,
            actions: [
                { label: "Set my next goal", act: "ask", steps: ["goal", "event"], primary: true },
                { label: "Nothing planned yet", act: "set", values: { targetEvent: NONE_EVENT, targetDate: "" } }
            ]
        });
    }

    // ---- pain flagged since the limits were last confirmed ----
    const latest = pain[0];
    // Logged (saved) after their limits were last confirmed.
    if (latest && (latest.at || noon(latest.date)) > confirmedMs(r, "injuries")) {
        const limits = realAnswer(r.injuries);
        checks.push({
            id: `pain:${latest.date}`, kind: "pain",
            title: `You flagged pain on ${latest.where}`,
            detail: `${latest.note ? `“${quote(latest.note)}” · ` : ""}${shortDate(latest.date)}. ${limits
                ? `Your profile says: “${quote(limits)}”. Still the right note for your coach?`
                : "Add it to your profile so your coach plans around it?"}`,
            actions: limits
                ? [{ label: "Update it", act: "ask", steps: ["limits"], primary: true }, { label: "Still the same", act: "confirm", keys: ["injuries"] }, { label: "It's gone now", act: "set", values: { injuries: NONE_INJURIES } }]
                : [{ label: "Add it", act: "ask", steps: ["limits"], primary: true }, { label: "It's gone now", act: "confirm", keys: ["injuries"] }]
        });
    }

    // ---- stale answers ----
    const stale = key => ageDays(r, key, now) >= MAX_AGE_DAYS[key];

    if (asksMiles(r.primarySport) && r.weeklyMileage !== null && r.weeklyMileage !== undefined && r.weeklyMileage !== "" && stale("weeklyMileage")) {
        const miles = Number(r.weeklyMileage);
        const differs = suggestion && Math.abs(suggestion.miles - miles) >= Math.max(3, miles * 0.25);
        checks.push({
            id: "miles", kind: "miles",
            title: miles > 0 ? `Still running about ${miles} mi a week?` : `Still not running yet?`,
            detail: differs
                ? `${suggestion.source === "COROS" ? "COROS" : "Your running log"} says about ${suggestion.miles} mi a week over the last 4 weeks.`
                : `It helps your coach set the right starting point.`,
            actions: [
                ...(differs ? [{ label: `Use ${suggestion.miles} mi`, act: "set", values: { weeklyMileage: suggestion.miles }, primary: true }] : []),
                { label: "Yes, still right", act: "confirm", keys: ["weeklyMileage"], primary: !differs },
                { label: "Update", act: "ask", steps: ["level"] }
            ]
        });
    }

    const limits = realAnswer(r.injuries);
    if (limits && stale("injuries") && !checks.some(c => c.kind === "pain")) {
        checks.push({
            id: "limits", kind: "limits",
            title: `Still dealing with this?`,
            detail: `“${quote(limits)}”`,
            actions: [
                { label: "Still the same", act: "confirm", keys: ["injuries"], primary: true },
                { label: "It's better now", act: "set", values: { injuries: NONE_INJURIES } },
                { label: "Update", act: "ask", steps: ["limits"] }
            ]
        });
    }

    if ((r.availabilityDays || []).length && stale("availabilityDays")) {
        checks.push({
            id: "days", kind: "days",
            title: `Still training ${r.availabilityDays.map(d => DAY_NAMES[d] || d).join(", ")}?`,
            detail: `If ${your} schedule changed, your coach can move things around.`,
            actions: [
                { label: "Yes, still right", act: "confirm", keys: ["availabilityDays"], primary: true },
                { label: "Change days", act: "ask", steps: ["days"] }
            ]
        });
    }

    if (String(r.primaryGoal || "").trim() && stale("primaryGoal") && !checks.some(c => c.kind === "race")) {
        checks.push({
            id: "goal", kind: "goal",
            title: `Still working toward this?`,
            detail: `“${quote(r.primaryGoal)}”${realAnswer(r.targetEvent) ? ` · ${quote(r.targetEvent, 60)}` : ""}`,
            actions: [
                { label: "Yes, still right", act: "confirm", keys: ["primaryGoal", "targetEvent"], primary: true },
                { label: "Update my goal", act: "ask", steps: ["goal", "event"] }
            ]
        });
    }

    if (r.strengthExperience && stale("strengthExperience")) {
        checks.push({
            id: "strength", kind: "strength",
            title: `Still ${STRENGTH[r.strengthExperience] || "at the same strength level"}?`,
            detail: `${you === "you" ? "You" : "They"} may have come a long way.`,
            actions: [
                { label: "Yes, still right", act: "confirm", keys: ["strengthExperience"], primary: true },
                { label: "Update", act: "ask", steps: ["level"] }
            ]
        });
    }

    return checks;
}

/**
 * The one check to show, or null. state = { answeredAt, snoozed: { id: untilMs } }.
 * Race and pain come any time; the rest at most once a week, unless
 * `anyTime` (the weekly check-in is its own weekly moment).
 */
export function pickCheck(checks, state = {}, now, { anyTime = false } = {}) {
    const snoozed = state?.snoozed || {};
    const weekOk = anyTime || !state?.answeredAt || now - state.answeredAt >= WEEK_MS;
    return checks.find(c => !(snoozed[c.id] > now) && (URGENT.includes(c.kind) || weekOk)) || null;
}

// The cadence state after they answer (or tap "Not now" on) a check.
// "Not now" on the coach's own question hides it for a day, others a week.
export function afterAnswer(state = {}, check, now, { snooze = false } = {}) {
    const snoozed = Object.fromEntries(Object.entries(state?.snoozed || {}).filter(([, until]) => until > now));
    if (snooze && check) snoozed[check.id] = now + (check.kind === "ask" ? DAY_MS : WEEK_MS);
    return { answeredAt: now, snoozed };
}

// confirmedAt after a save: the keys they confirmed, plus any tracked
// answer that changed, get `now`.
export function nextConfirmedAt(existing = {}, before = {}, after = {}, confirm = [], now) {
    const out = { ...(existing || {}) };
    for (const key of TRACKED) {
        const value = after?.[key];
        const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length);
        const changed = JSON.stringify(before?.[key] ?? null) !== JSON.stringify(value ?? null);
        if (confirm.includes(key) || (changed && !empty)) out[key] = now;
    }
    return out;
}

// A none-answer isn't "an injury on file" but is a confirmed answer.
export const hasLimits = record => !isNoneAnswer(record?.injuries);

function shiftDay(date, n) {
    const [y, m, d] = String(date).split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
