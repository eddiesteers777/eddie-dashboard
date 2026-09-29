/* ==========================================
   Southbound — Client summaries (pure)

   Turns the data the coach can already read about a client into the
   answers the Client Hub and client list need: which plan they're on
   and what week, what's today and next, how this week is going, their
   sessions, their check-ins, what needs the coach's attention, and a
   recent-activity timeline.

   No Firestore or DOM here, so it's unit-tested directly
   (tests/clientSummary.test.mjs). js/clientDirectory.js loads the data;
   js/clientHub.js and js/clients.js render it.

   Inputs (all already readable by a linked coach under firestore.rules):
     profile   userProfiles/{uid}
     link      coachLinks/{coach}_{client}
     shared    sharedPlans/{uid}  (runningPrograms / trainingPrograms,
               mirrored from the client's app, days carry `completed`)
     checkins  checkins where clientUid == uid
     requests  bookingRequests where clientUid == uid
     record    clientRecords/{uid} (the client profile; null = not filled
               in yet, undefined = couldn't be read)
     results   workoutResults (what they did on coach-plan days)
     changes   changeRequests (asks for a plan change; js/changeRequests.js)
========================================== */

import { isIntakeComplete, athleteDisplayName, healthYeses } from "./clientRecordSchema.js";
import { mergeRuntimeByDate } from "./coachingPlanModel.js";
import { awaitingView, noticeVersionOf } from "./planWindow.js";
import { checkinFlags, reasonLabel } from "./feedbackModel.js";
import { staleSummary, openAsks, ageText } from "./profileChecks.js";
import { answersDone } from "./intakeFlow.js";
import { sessionList, sessionsToLog, noShowStreak } from "./sessionModel.js";

export const SERVICE_LABELS = {
    online_coaching: "Online Coaching",
    running: "Running",
    strength: "Strength",
    soccer_1on1: "1-on-1 Soccer",
    soccer_group: "Group Soccer"
};

const TRAINING_SERVICES = ["online_coaching", "running", "strength"];
const SOCCER_SERVICES = ["soccer_1on1", "soccer_group"];

export function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    return isoDate(new Date(y, m - 1, d + days));
}

// Firestore Timestamp, millis, ISO string or Date -> millis (or null).
export function toMillis(value) {
    if (!value) return null;
    if (typeof value === "number") return value;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

// Monday-start week key, same as js/checkins.js weekKeyFor.
export function weekKey(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return isoDate(d);
}

export function serviceLabels(services = []) {
    return services.map(s => SERVICE_LABELS[s] || s);
}

// ---------- Plans ----------

// published: coachingPlans headers, each with the whole published `plan`
// when known (the coach's master: the client's own copy holds only the
// weeks they can see). The prescription comes from it; the client's
// mirrored copy (shared.coachPlans) gives their "done" marks by date.
// Without it, the copy stands in.
function allPlans(shared, published = []) {
    const copies = (shared?.coachPlans || []).map(p => ({ ...p, planType: "coach" }));
    const coach = copies.filter(c => !published.some(h => h.id === c.coachPlanId && h.plan));
    for (const h of published) {
        const copy = copies.find(c => c.coachPlanId === h.id);
        if (!h.plan) continue;
        // Done marks: from their copy, or (first version, not synced yet)
        // from their own plan the coach took over.
        const adoptedOwn = h.adoptedFrom
            ? (shared?.[h.adoptedFrom.store === "training" ? "trainingPrograms" : "runningPrograms"] || []).find(p => p.id === h.adoptedFrom.id)
            : null;
        coach.push({
            id: `coach-${h.id}`, coachPlanId: h.id, coachVersion: h.version, name: h.name, planType: "coach",
            status: h.status, generatedPlan: mergeRuntimeByDate(copy?.generatedPlan || adoptedOwn?.generatedPlan, h.plan)
        });
    }
    // A plan the coach took over is retired on the client's device; until
    // that syncs, don't count it twice.
    const adopted = new Set(published.map(h => h.adoptedFrom?.id).filter(Boolean));
    const own = p => !adopted.has(p.id) && !p.replacedByCoachPlan;
    const race = (shared?.runningPrograms || []).filter(own).map(p => ({ ...p, planType: "running" }));
    const training = (shared?.trainingPrograms || []).filter(own).map(p => ({ ...p, planType: "training" }));
    return [...coach, ...race, ...training];
}

function weekEnd(week) {
    const days = (week.days || []).map(d => d.date).filter(Boolean).sort();
    return days.at(-1) || (week.startDate ? addDays(week.startDate, 6) : null);
}

// Where a generated plan stands on `today`:
// { state: "upcoming" | "current" | "finished", week, weekNumber, totalWeeks, startDate, endDate }
export function planPosition(program, today) {
    const weeks = program?.generatedPlan?.weeks || [];
    if (!weeks.length) return null;
    const startDate = weeks[0].startDate || weeks[0].days?.[0]?.date || null;
    // A coach plan shown two weeks at a time knows its real length.
    const endDate = program.generatedPlan.window?.endDate || weekEnd(weeks.at(-1));
    const totalWeeks = program.generatedPlan.window?.totalWeeks || weeks.length;
    if (startDate && today < startDate) return { state: "upcoming", week: weeks[0], weekNumber: 1, totalWeeks, startDate, endDate };
    if (endDate && today > endDate) return { state: "finished", week: weeks.at(-1), weekNumber: totalWeeks, totalWeeks, startDate, endDate };
    const index = weeks.findIndex(w => {
        const start = w.startDate || w.days?.[0]?.date;
        const end = weekEnd(w);
        return start && end && today >= start && today <= end;
    });
    const i = index >= 0 ? index : 0;
    return { state: "current", week: weeks[i], weekNumber: weeks[i].week ?? i + 1, totalWeeks, startDate, endDate };
}

function isWorkout(day) {
    return day && day.type && day.type !== "rest";
}

// The client's plan picture: the active plan (current one first), today,
// the next workout, and how this week is going.
// A logged workout result is the truth for that day of a coach plan,
// even before the client's mirrored copy has synced its done mark.
function applyResults(plans, results) {
    if (!results?.length) return plans;
    // A strength log only decides a strength-only day; an extra session
    // on a run day never marks the run.
    const byKey = new Map(results.map(r => [`${r.planId}|${r.date}|${r.kind === "strength" ? "strength" : "run"}`, r]));
    return plans.map(p => {
        if (!p.coachPlanId || !p.generatedPlan?.weeks) return p;
        const weeks = p.generatedPlan.weeks.map(w => ({
            ...w,
            days: (w.days || []).map(d => {
                const r = byKey.get(`${p.coachPlanId}|${d.date}|${d.type === "strength" && d.strength ? "strength" : "run"}`);
                return r ? { ...d, completed: r.status === "completed", skipped: r.status === "skipped" } : d;
            })
        }));
        return { ...p, generatedPlan: { ...p.generatedPlan, weeks } };
    });
}

export function summarizePlans(shared, today, published = [], results = []) {
    const plans = applyResults(allPlans(shared, published), results);
    const active = plans.filter(p => p.status === "active" && p.generatedPlan?.weeks?.length);
    const withPos = active
        .map(p => ({ program: p, position: planPosition(p, today) }))
        .filter(x => x.position);
    const rank = { current: 0, upcoming: 1, finished: 2 };
    withPos.sort((a, b) => rank[a.position.state] - rank[b.position.state]
        || String(a.position.startDate).localeCompare(String(b.position.startDate)));
    const primary = withPos[0] || null;

    const allDays = withPos.flatMap(x => (x.program.generatedPlan.weeks || [])
        .flatMap(w => (w.days || []).map(d => ({ ...d, planName: x.program.name, weekNumber: w.week }))));
    const todayWorkouts = allDays.filter(d => d.date === today && isWorkout(d));
    const next = allDays
        .filter(d => d.date > today && isWorkout(d))
        .sort((a, b) => a.date.localeCompare(b.date))[0] || null;

    // This week (Mon-Sun) across active plans, up to and including today.
    const monday = weekKey(new Date(`${today}T00:00:00`));
    const thisWeek = allDays.filter(d => d.date >= monday && d.date <= addDays(monday, 6) && isWorkout(d));
    const dueSoFar = thisWeek.filter(d => d.date <= today);
    const week = {
        planned: thisWeek.length,
        dueSoFar: dueSoFar.length,
        completed: thisWeek.filter(d => d.completed).length,
        missed: dueSoFar.filter(d => !d.completed && !d.skipped && d.date < today).length,
        skipped: dueSoFar.filter(d => d.skipped).length,
        plannedMiles: round1(thisWeek.reduce((s, d) => s + (Number(d.miles) || 0), 0)),
        completedMiles: round1(thisWeek.filter(d => d.completed).reduce((s, d) => s + (Number(d.miles) || 0), 0))
    };

    return {
        plans,
        activeCount: active.length,
        primary: primary ? {
            id: primary.program.id,
            name: primary.program.name || (primary.program.planType === "training" ? "Training Plan" : "Race Plan"),
            coachPlanId: primary.program.coachPlanId || null,
            planType: primary.program.planType,
            goal: primary.program.generatedPlan?.primaryGoal || primary.program.goal || "",
            raceDate: primary.program.generatedPlan?.raceDate || primary.program.raceDate || "",
            ...primary.position
        } : null,
        today: todayWorkouts,
        next,
        week
    };
}

function round1(n) {
    return Math.round(n * 10) / 10;
}

// ---------- Sessions ----------

export function summarizeSessions(requests, today) {
    const approved = (requests || []).filter(r => r.status === "approved");
    const occurrences = approved.flatMap(r => (r.dates || []).map(date => ({ ...r, date })));
    const byTime = (a, b) => a.date.localeCompare(b.date) || String(a.startTime).localeCompare(String(b.startTime));
    return {
        upcoming: occurrences.filter(o => o.date >= today).sort(byTime),
        past: occurrences.filter(o => o.date < today).sort((a, b) => byTime(b, a)),
        waiting: (requests || []).filter(r => r.status === "requested")
            .sort((a, b) => String(a.dates?.[0] || "").localeCompare(String(b.dates?.[0] || "")))
    };
}

// ---------- Check-ins ----------

export function summarizeCheckins(checkins, today) {
    const sorted = [...(checkins || [])].sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)));
    const thisWeekKey = weekKey(new Date(`${today}T00:00:00`));
    const ratings = sorted.filter(c => Number(c.rating) > 0).slice(0, 4).map(c => Number(c.rating));
    return {
        all: sorted,
        latest: sorted[0] || null,
        needsReview: sorted.filter(c => c.status === "submitted"),
        thisWeek: sorted.find(c => c.weekOf === thisWeekKey) || null,
        recentAverage: ratings.length ? round1(ratings.reduce((s, r) => s + r, 0) / ratings.length) : null
    };
}

// ---------- Needs attention ----------

// What the coach should act on for this client, most urgent first.
// Each: { kind, text, tab } -- tab is the Client Hub tab that handles it.
// { at } when an item has been waiting since a known moment (the coach
// dashboard shows "2 days ago"); nothing otherwise.
const since = value => { const ms = toMillis(value); return ms && Number.isFinite(ms) ? { at: ms } : {}; };

export function needsAttention({ profile, plans, sessions, checkins, today, record, coachingPlans = [], results = [], changes = [], now = Date.now(), healthReviewedAt = 0, requests = [] }) {
    const items = [];
    // A "yes" on their health check the coach hasn't marked reviewed.
    const yeses = healthYeses(record);
    if (yeses.length && !(Number(healthReviewedAt) >= Number(record.healthCheckedAt))) {
        items.push({ kind: "health", text: `Health check: said yes to ${yeses.join(", ").toLowerCase()}. Check with them before training gets harder`, tab: "overview" });
    }
    // Pain flagged on a workout, not yet answered: first thing to see.
    for (const r of results.filter(x => x.pain && !x.coachComment && x.date >= addDays(today, -14))) {
        items.push({ kind: "pain", text: `Flagged pain on ${shortDate(r.date)} (${r.title || "workout"})${r.painNote ? `: "${r.painNote}"` : ""}`, tab: "workouts", ...since(r.createdAt) });
    }
    const services = profile?.services || [];
    const trains = services.some(s => TRAINING_SERVICES.includes(s));
    const soccer = services.some(s => SOCCER_SERVICES.includes(s));

    // They asked for a change and you haven't answered.
    for (const c of changes.filter(x => x.status === "open")) {
        const message = String(c.message || "").trim();
        items.push({
            kind: "change",
            text: `Asked for a change${c.date ? ` for ${shortDate(c.date)}` : ""} (${reasonLabel(c.reason).toLowerCase()})${message ? `: "${message.length > 90 ? `${message.slice(0, 90)}…` : message}"` : ""}`,
            tab: "plan",
            ...since(c.createdAt)
        });
    }
    for (const c of checkins.needsReview) {
        const flags = checkinFlags(c);
        items.push({ kind: "checkin", text: `Check-in for week of ${shortDate(c.weekOf)} needs your reply${flags.length ? ` — ${flags.join(", ").toLowerCase()}` : ""}`, tab: "checkins", ...since(c.submittedAt) });
    }
    if (sessions.waiting.length) {
        const oldest = Math.min(...sessions.waiting.map(r => toMillis(r.createdAt) || Infinity));
        items.push({ kind: "booking", text: `${sessions.waiting.length} session request${sessions.waiting.length === 1 ? "" : "s"} waiting on you`, tab: "sessions", ...since(oldest) });
    }
    // Sessions that happened and aren't logged yet (js/sessionModel.js),
    // and a run of no-shows. Only when the logs could be read (`logs` is
    // attached to each request by js/scheduling.js).
    const withLogs = (requests || []).filter(r => r.logs);
    if (withLogs.length) {
        const all = sessionList(withLogs, today);
        const toLog = sessionsToLog(all, today);
        if (toLog.length) {
            const first = toLog[0];
            const [y, m, d] = first.date.split("-").map(Number);
            items.push({
                kind: "session-log",
                text: toLog.length === 1
                    ? `Log how their session on ${shortDate(first.date)} went`
                    : `Log ${toLog.length} sessions (${toLog.map(s => shortDate(s.date)).join(", ")})`,
                tab: "sessions",
                at: new Date(y, m - 1, d, 12).getTime()
            });
        }
        const streak = noShowStreak(all);
        if (streak >= 2) items.push({ kind: "no-show", text: `Missed their last ${streak} sessions (no-shows)`, tab: "sessions" });
    }
    // Profile not filled in (only when we could actually read it).
    if (record !== undefined && !isIntakeComplete(record)) {
        items.push({ kind: "intake", text: "Hasn't filled in their profile yet", tab: "profile" });
    }
    // Profile answers gone stale (js/profileChecks.js). Their app asks them
    // too; this is for the coach, and waits while an ask of theirs is open.
    if (record && answersDone(record)) {
        const asks = openAsks(record);
        const waited = asks.length ? Math.floor((now - asks[0].at) / 86400000) : 0;
        if (asks.length && waited >= 7) {
            items.push({ kind: "profile", text: `Hasn't answered your profile question (asked ${ageText(waited)})`, tab: "profile" });
        } else if (!asks.length) {
            const stale = staleSummary(record, now, today);
            if (stale.length) items.push({ kind: "profile", text: `Profile may be out of date: ${stale.join(", ")}`, tab: "profile" });
        }
    }
    if (trains && !plans.primary) {
        items.push({ kind: "plan", text: "No active training plan", tab: "plan" });
    } else if (plans.primary?.state === "finished") {
        items.push({ kind: "plan", text: `${plans.primary.name} finished ${shortDate(plans.primary.endDate)} — time for what's next`, tab: "plan" });
    } else if (plans.primary?.state === "current" && plans.primary.endDate && plans.primary.endDate <= addDays(today, 7)) {
        items.push({ kind: "plan", text: `${plans.primary.name} ends ${shortDate(plans.primary.endDate)}`, tab: "plan" });
    }
    // A race inside two weeks.
    const race = plans.primary?.raceDate;
    if (race && race >= today && race <= addDays(today, 14)) {
        const days = Math.round((new Date(`${race}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
        items.push({ kind: "race", text: days === 0 ? "Race day today" : `Race in ${days} day${days === 1 ? "" : "s"} (${shortDate(race)})`, tab: "plan" });
    }
    // Hasn't opened the app in a week (only known once their app has reported in).
    const seen = toMillis(profile?.lastSeenAt);
    if (seen && profile?.status !== "archived") {
        const days = Math.floor((new Date(`${today}T12:00:00`).getTime() - seen) / 86400000);
        if (days >= 7) items.push({ kind: "quiet", text: `Hasn't opened the app in ${days} days`, tab: "overview" });
    }
    // A plan update they haven't opened after two days.
    for (const h of coachingPlans) {
        const published = toMillis(h.publishedAt);
        if (!awaitingView(h) || !published) continue;
        if (published <= new Date(`${today}T00:00:00`).getTime() - 2 * 86400000) {
            items.push({
                kind: "plan-unseen",
                text: noticeVersionOf(h) > 1 ? `Hasn't opened your ${h.name} update` : `Hasn't opened ${h.name} yet`,
                tab: "plan"
            });
        }
    }
    const monday = weekKey(new Date(`${today}T00:00:00`));
    const skippedThisWeek = results.filter(r => r.status === "skipped" && r.date >= monday && r.date <= today).length;
    if (skippedThisWeek >= 2) {
        items.push({ kind: "skipped", text: `Skipped ${skippedThisWeek} workouts this week`, tab: "workouts" });
    }
    if (plans.week.missed >= 2) {
        items.push({ kind: "missed", text: `${plans.week.missed} workouts not marked done this week`, tab: "plan" });
    }
    if (soccer && !sessions.upcoming.length && !sessions.waiting.length) {
        items.push({ kind: "sessions", text: "No upcoming sessions booked", tab: "sessions" });
    }
    // Check-in nudge from Saturday on, once the week is mostly done.
    const dow = new Date(`${today}T00:00:00`).getDay();
    if (trains && !checkins.thisWeek && (dow === 6 || dow === 0)) {
        items.push({ kind: "no-checkin", text: "No check-in yet this week", tab: "checkins" });
    }
    return items;
}

// ---------- Timeline ----------

// The whole client relationship, derived from what's already stored (no
// timeline collection: every event below already has its own timestamp,
// and deriving means older history shows too, nothing can fall out of
// step, and no rules change). Newest first. Each:
//   { at (millis), date (iso), kind, group, by ("client" | "coach" | ""),
//     text, detail, tab }
// `group` feeds the History filters (TIMELINE_GROUPS in
// js/clientTimeline.js), `tab` is the hub tab it links to. Optional
// extras the hub loads after the page draws: `application` (their
// applications doc), `planVersions` ({ planId: versions }, every publish
// instead of only the latest) and `privateNotes`; `today` turns approved
// bookings whose dates have passed into "Session held".
const TIMELINE_KINDS = {
    application: ["account", "client", "overview"],
    approved: ["account", "coach", "profile"],
    linked: ["account", "", "profile"],
    intake: ["profile", "client", "profile"],
    profile: ["profile", "client", "profile"],
    "profile-coach": ["profile", "coach", "profile"],
    asked: ["profile", "coach", "profile"],
    health: ["profile", "client", "overview"],
    workout: ["workouts", "client", "workouts"],
    "workout-skipped": ["workouts", "client", "workouts"],
    "workout-reply": ["workouts", "coach", "workouts"],
    change: ["plan", "client", "plan"],
    "change-reply": ["plan", "coach", "plan"],
    "plan-published": ["plan", "coach", "plan"],
    "plan-ack": ["plan", "client", "plan"],
    "plan-archived": ["plan", "coach", "plan"],
    update: ["messages", "coach", "notes"],
    "update-read": ["messages", "client", "notes"],
    checkin: ["checkins", "client", "checkins"],
    feedback: ["checkins", "coach", "checkins"],
    booking: ["sessions", "client", "sessions"],
    booked: ["sessions", "coach", "sessions"],
    denied: ["sessions", "coach", "sessions"],
    cancelled: ["sessions", "client", "sessions"],
    session: ["sessions", "", "sessions"],
    note: ["notes", "coach", "notes"]
};

const clip = (text, n = 200) => {
    const s = String(text || "").replace(/\s+/g, " ").trim();
    return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

const ASK_WORDS = { goal: "goal", days: "training days", level: "starting point", limits: "injuries and limits" };
const SESSION_WORDS = { soccer: "Soccer session", running: "Running session", strength: "Strength session", general: "Session" };
const SESSION_STATUS_WORDS = { completed: "completed", "no-show": "no-show", "late-cancel": "cancelled late", cancelled: "cancelled" };

export function buildTimeline({ profile, link, checkins, requests, record, updates, coachingPlans, results, changes, application = null, planVersions = null, privateNotes = null, today = "" }) {
    const events = [];
    const push = (at, kind, text, detail = "") => {
        const ms = toMillis(at);
        if (!ms) return;
        const [group, by, tab] = TIMELINE_KINDS[kind] || ["account", "", "overview"];
        events.push({ at: ms, date: isoDate(new Date(ms)), kind, group, by, text, detail: clip(detail), tab });
    };
    const clientUid = link?.clientUid || profile?.uid || "";

    // Account: applied, approved, connected.
    const appAt = toMillis(application?.createdAt);
    if (appAt) {
        const services = serviceLabels(application.services || []);
        push(appAt, "application", `Applied${services.length ? ` for ${services.join(", ").toLowerCase()}` : ""}`, application.goal ? `Goal: ${application.goal}` : application.message);
    }
    // An application sent from a signed-in account is on the profile too: once.
    const profileApp = toMillis(profile?.applicationSubmittedAt);
    if (profileApp && !(appAt && Math.abs(profileApp - appAt) < 6 * 3600000)) {
        push(profileApp, "application", "Application submitted", profile?.applicationMessage);
    }
    push(profile?.approvedAt, "approved", "Account approved");
    push(link?.linkedAt, "linked", "Connected to you");

    // Profile.
    const intakeAt = toMillis(record?.intakeCompletedAt);
    push(intakeAt, "intake", "Filled in their profile");
    const profileAt = toMillis(record?.updatedAt);
    if (profileAt && (!intakeAt || Math.abs(profileAt - intakeAt) > 60000)) {
        const byCoach = record.updatedBy && clientUid && record.updatedBy !== clientUid;
        push(profileAt, byCoach ? "profile-coach" : "profile", byCoach ? "You edited their profile (latest change)" : "Updated their profile (latest change)");
    }
    if (record?.healthCheckedAt) {
        const yeses = healthYeses(record);
        push(record.healthCheckedAt, "health", "Answered the health check", yeses.length ? `Said yes to: ${yeses.join("; ")}` : "No to all of it");
    }
    const asks = Object.entries(record?.askedAt || {}).filter(([id]) => ASK_WORDS[id]);
    const askGroups = new Map();
    for (const [id, at] of asks) {
        const ms = toMillis(at);
        if (!ms) continue;
        const key = Math.round(ms / 60000);
        if (!askGroups.has(key)) askGroups.set(key, { ms, ids: [] });
        askGroups.get(key).ids.push(id);
    }
    const stillOpen = new Set(openAsks(record).map(a => a.id));
    for (const { ms, ids } of askGroups.values()) {
        push(ms, "asked", `You asked them to check their ${ids.map(id => ASK_WORDS[id]).join(" and ")}`,
            ids.some(id => stillOpen.has(id)) ? "Still waiting on their answer" : "They've answered");
    }

    // Workouts.
    for (const r of results || []) {
        push(r.createdAt, r.status === "skipped" ? "workout-skipped" : "workout",
            r.status === "skipped" ? `Skipped ${r.title || "a workout"} (${shortDate(r.date)})`
                : `Logged ${r.title || "a workout"}${r.distance ? ` — ${r.distance} mi` : ""}${r.kind === "strength" && r.exercises?.length ? ` — ${r.exercises.reduce((n, e) => n + (e.sets?.length || 0), 0)} sets` : ""}${r.rpe ? `, effort ${r.rpe}/10` : ""}${r.pain ? ", pain flagged" : ""}`,
            [r.pain && r.painNote ? `Pain: ${r.painNote}` : "", r.note].filter(Boolean).join(" · "));
        if (r.coachComment) push(r.coachCommentAt, "workout-reply", `You replied on ${r.title || "their workout"} (${shortDate(r.date)})`, r.coachComment);
    }

    // Plan: change requests, publishes, got it, archived.
    for (const c of changes || []) {
        push(c.createdAt, "change", `Asked for a change (${reasonLabel(c.reason).toLowerCase()})${c.date ? ` for ${shortDate(c.date)}` : ""}`, c.message);
        if (c.status === "resolved") push(c.resolvedAt, "change-reply", `You answered their change request`, c.coachReply);
    }
    for (const h of coachingPlans || []) {
        const versions = planVersions?.[h.id];
        if (Array.isArray(versions) && versions.length) {
            // Every publish; week openings (auto) are routine and left out.
            for (const v of versions) {
                if (v.auto) continue;
                const lines = Array.isArray(v.changes) ? v.changes : [];
                const detail = [v.coachNote ? `Your note: ${v.coachNote}` : "",
                    lines.length ? `${lines.length} change${lines.length === 1 ? "" : "s"}: ${lines.slice(0, 3).join("; ")}${lines.length > 3 ? "…" : ""}` : ""].filter(Boolean).join(" · ");
                push(v.publishedAt, "plan-published", v.version > 1 ? `You updated ${v.name || h.name}` : `You published ${v.name || h.name}`,
                    detail || (v.version > 1 ? "Nothing they can see changed" : ""));
            }
        } else {
            push(h.publishedAt, "plan-published", `You published ${noticeVersionOf(h) > 1 ? `an update to ${h.name}` : h.name}`, h.coachNote ? `Your note: ${h.coachNote}` : "");
        }
        if (h.ackVersion) push(h.ackAt, "plan-ack", `Got your plan${h.ackVersion > 1 ? " update" : ""}`, h.name);
        if (h.status === "archived") push(h.updatedAt, "plan-archived", `You archived ${h.name}`);
    }

    // Updates they see, and your private notes.
    for (const u of updates || []) {
        push(u.createdAt, "update", "You sent them an update", u.text);
        push(u.readAt, "update-read", "They read your update");
    }
    for (const n of privateNotes || []) push(n.createdAt, "note", "You wrote a private note", n.text);

    // Check-ins.
    for (const c of checkins || []) {
        push(c.submittedAt, "checkin", `Weekly check-in sent${c.rating ? ` — ${c.rating}/5` : ""}`,
            [c.pain ? `Pain${c.painNote ? `: ${c.painNote}` : ""}` : "", c.wentWell ? `Went well: ${c.wentWell}` : "", c.change ? `Would change: ${c.change}` : "", c.notes].filter(Boolean).join(" · "));
        if (c.status === "reviewed") push(c.reviewedAt, "feedback", "You replied to their check-in", c.coachFeedback);
    }

    // Sessions: requests, answers, and the ones that happened.
    for (const r of requests || []) {
        const when = r.dates?.[0] ? ` for ${shortDate(r.dates[0])}` : "";
        const more = (r.dates?.length || 0) > 1 ? ` (+${r.dates.length - 1} more)` : "";
        push(r.createdAt, "booking", `Requested a session${when}${more}`, r.clientNote);
        if (r.status === "approved") push(r.respondedAt, "booked", `Session booked${when}${more}`);
        if (r.status === "denied") push(r.respondedAt, "denied", `Session request declined${when}`);
        if (r.status === "cancelled") push(r.respondedAt, "cancelled", `Session cancelled${when}`);
        if (r.status === "approved" && today) {
            // Each date that has passed, with what the session log says
            // (js/sessionModel.js); an older booking's single note sits on
            // its last date when it has no logs.
            const logs = r.logs || {};
            const held = (r.allDates || r.dates || []).filter(d => d < today).sort();
            const name = `${SESSION_WORDS[r.sessionType] || "Session"}${r.label ? ` · ${r.label}` : ""}`;
            held.forEach((d, i) => {
                const [y, m, day] = d.split("-").map(Number);
                const [hh, mm] = String(r.startTime || "12:00").split(":").map(Number);
                const log = logs[d];
                const words = log ? [log.workedOn ? `Worked on: ${log.workedOn}` : "", log.nextTime ? `For next time: ${log.nextTime}` : ""].filter(Boolean).join(" · ") : "";
                push(new Date(y, m - 1, day, hh || 12, mm || 0).getTime(), "session",
                    log ? `${name}: ${SESSION_STATUS_WORDS[log.status] || "logged"}` : name,
                    log ? words : (!Object.keys(logs).length && i === held.length - 1 && r.coachNote ? `Your notes: ${r.coachNote}` : ""));
            });
        }
    }
    return events.sort((a, b) => b.at - a.at);
}

export function shortDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- One-line row for the client list ----------

// The status bits under a client's name in a list: plan week, next
// session, check-in (My Clients and the Coach Dashboard).
export function clientStatusLines(c) {
    const p = c.plans?.primary;
    const trains = (c.services || []).some(v => TRAINING_SERVICES.includes(v));
    const plan = !p ? (trains || !c.services?.length ? "No active plan" : "")
        : p.state === "upcoming" ? `${p.name} · starts ${shortDate(p.startDate)}`
        : p.state === "finished" ? `${p.name} · finished`
        : `${p.name} · Week ${p.weekNumber} of ${p.totalWeeks}`;
    const next = c.sessions?.upcoming?.[0];
    const latest = c.checkins?.latest;
    return [
        plan,
        next ? `Next session ${shortDate(next.date)}` : "",
        !latest ? "" : latest.status === "submitted" ? "Check-in needs reply" : `Check-in ${shortDate(latest.weekOf)} reviewed`
    ].filter(Boolean);
}

export function summarizeClient({ profile, link, shared, checkins, requests, record, coachingPlans = [], results = [], changes = [], healthReviewedAt = 0 }, today) {
    const plans = summarizePlans(shared, today, coachingPlans, results);
    const sessions = summarizeSessions(requests, today);
    const checkinSummary = summarizeCheckins(checkins, today);
    const attention = needsAttention({ profile, plans, sessions, checkins: checkinSummary, today, record, coachingPlans, results, changes, healthReviewedAt, requests });
    const name = profile?.displayName || link?.clientName || "Client";
    const athlete = record?.whoTrains === "child" ? (record.athleteName || "") : "";
    const goesBy = athleteDisplayName(record, "");
    return {
        uid: link?.clientUid || profile?.uid,
        name,
        athlete,
        goesBy: goesBy && goesBy !== name ? goesBy : "",
        goal: record?.primaryGoal || "",
        searchText: [name, goesBy, athlete, profile?.email, link?.clientEmail].filter(Boolean).join(" ").toLowerCase(),
        email: profile?.email || link?.clientEmail || "",
        services: profile?.services || [],
        status: profile?.status || "active",
        plans,
        sessions,
        checkins: checkinSummary,
        attention
    };
}

// ---------- Client side: everything their coach has told them ----------

// One newest-first feed for updates.html: updates the coach sent
// (clientUpdates), replies to check-ins, and notes on sessions that have
// happened. Each: { at, kind, title, detail, text, link, unread }.
// Private coach notes never reach the client, so they can't appear here.
export function buildCoachFeed({ updates = [], checkins = [], requests = [], results = [], changes = [], today }) {
    const feed = [];
    for (const c of changes) {
        if (c.status !== "resolved" || !c.coachReply) continue;
        feed.push({
            at: toMillis(c.resolvedAt) || toMillis(c.createdAt), kind: "change",
            title: "Reply to your change request", detail: c.date ? shortDate(c.date) : reasonLabel(c.reason),
            text: c.coachReply, link: "plan.html", unread: false
        });
    }
    for (const r of results) {
        if (!r.coachComment) continue;
        feed.push({
            at: toMillis(r.coachCommentAt) || toMillis(r.updatedAt), kind: "workout",
            title: `Reply on your ${String(r.title || "workout").toLowerCase()}`, detail: shortDate(r.date),
            text: r.coachComment, link: `workout.html?program=coach-${encodeURIComponent(r.planId)}&date=${r.date}${r.kind === "strength" ? "&kind=strength" : ""}`, unread: false
        });
    }
    for (const u of updates) {
        if (!u.text) continue;
        feed.push({
            at: toMillis(u.createdAt), kind: "update", id: u.id,
            title: `Update from ${u.coachName || "your coach"}`,
            detail: "", text: u.text, link: "", unread: !u.readAt
        });
    }
    for (const c of checkins) {
        if (c.status !== "reviewed" || !c.coachFeedback) continue;
        feed.push({
            at: toMillis(c.reviewedAt) || toMillis(c.submittedAt), kind: "feedback",
            title: "Reply to your check-in", detail: `Week of ${shortDate(c.weekOf)}`,
            text: c.coachFeedback, link: "checkin.html", unread: false
        });
    }
    for (const r of requests) {
        if (r.status !== "approved") continue;
        // Session logs (js/sessionModel.js): one item per session with notes.
        const logs = Object.values(r.logs || {});
        for (const l of logs) {
            if (l.status !== "completed" || l.date > today || !(l.workedOn || l.nextTime)) continue;
            const [ly, lm, ld] = l.date.split("-").map(Number);
            feed.push({
                at: toMillis(l.updatedAt) || new Date(ly, lm - 1, ld, 12).getTime(), kind: "session",
                title: "Notes from your session", detail: shortDate(l.date),
                text: [l.workedOn ? `Worked on: ${l.workedOn}` : "", l.nextTime ? `For next time: ${l.nextTime}` : ""].filter(Boolean).join("\n"),
                link: "schedule.html", unread: false
            });
        }
        if (logs.length || !r.coachNote) continue;
        const last = (r.allDates || r.dates || []).filter(d => d <= today).sort().pop();
        if (!last) continue;
        const [y, m, d] = last.split("-").map(Number);
        feed.push({
            at: toMillis(r.respondedAt) || new Date(y, m - 1, d, 12).getTime(), kind: "session",
            title: "Notes from your session", detail: shortDate(last),
            text: r.coachNote, link: "schedule.html", unread: false
        });
    }
    return feed.filter(f => f.at).sort((a, b) => b.at - a.at);
}

/* ---------- Progress summary (coach-visible data only) ---------- */

/**
 * One descriptive progress snapshot for the Client Hub.
 *
 * This derives only from data the coach can already read:
 * the current plan summary, coach-plan workout results, logged coach
 * sessions, and weekly check-ins. It does not read or create a second
 * source of truth.
 */
export function summarizeProgress({ plans = {}, results = [], sessions = [], checkins = [], today = "" } = {}) {
    if (!today) return emptyProgress();

    const inWindow = (date, from, to = today) => String(date || "") >= from && String(date || "") <= to;
    const recentFrom = addDays(today, -27);
    const priorFrom = addDays(today, -55);
    const priorTo = addDays(today, -28);
    const recent14From = addDays(today, -13);
    const prior14From = addDays(today, -27);
    const prior14To = addDays(today, -14);

    const recentResults = results.filter(r => inWindow(r.date, recentFrom));
    const priorResults = results.filter(r => inWindow(r.date, priorFrom, priorTo));
    const recentTrendResults = results.filter(r => inWindow(r.date, recent14From));
    const priorTrendResults = results.filter(r => inWindow(r.date, prior14From, prior14To));

    const isStrength = r => r?.kind === "strength";
    const completed = r => r?.status === "completed";
    const run = r => !isStrength(r);
    const sumMiles = list => round1(list.filter(r => completed(r) && run(r)).reduce((sum, r) => sum + (Number(r.distance) || 0), 0));
    const strengthSets = list => list
        .filter(r => completed(r) && isStrength(r))
        .reduce((sum, r) => sum + (r.exercises || []).reduce((n, e) => n + (Array.isArray(e.sets) ? e.sets.length : 0), 0), 0);

    const recentCompleted = recentResults.filter(completed);
    const priorCompleted = priorResults.filter(completed);
    const recentRuns = recentCompleted.filter(run);
    const recentStrength = recentCompleted.filter(isStrength);
    const recentPain = recentResults.filter(r => r.pain).length;

    const recentSessions = sessions.filter(s => inWindow(s.date, recentFrom) && s.date <= today && s.log);
    const recentSoccer = recentSessions.filter(s => String(s.sessionType || "").toLowerCase().includes("soccer"));
    const soccerCompleted = recentSoccer.filter(s => s.log?.status === "completed").length;
    const soccerNoShows = recentSoccer.filter(s => s.log?.status === "no-show").length;
    const soccerLateCancels = recentSoccer.filter(s => s.log?.status === "late-cancel").length;
    const soccerCounted = soccerCompleted + soccerNoShows + soccerLateCancels;

    const recentCheckins = checkins
        .filter(c => c.weekOf && inWindow(c.weekOf, recentFrom))
        .sort((a, b) => String(b.weekOf).localeCompare(String(a.weekOf)));
    const rated = recentCheckins.filter(c => Number.isFinite(Number(c.rating)) && Number(c.rating) > 0);

    const recentMiles = sumMiles(recentResults);
    const priorMiles = sumMiles(priorResults);
    const recentTrendMiles = sumMiles(recentTrendResults);
    const priorTrendMiles = sumMiles(priorTrendResults);
    const recentTrendCompleted = recentTrendResults.filter(completed).length;
    const priorTrendCompleted = priorTrendResults.filter(completed).length;
    const percentChange = (recent, prior) => prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;

    return {
        window: { from: recentFrom, to: today, days: 28 },
        plan: {
            name: plans.primary?.name || "",
            weekNumber: plans.primary?.weekNumber ?? null,
            totalWeeks: plans.primary?.totalWeeks ?? null,
            state: plans.primary?.state || null,
            week: plans.week ? {
                planned: plans.week.planned || 0,
                due: plans.week.dueSoFar || 0,
                completed: plans.week.completed || 0,
                missed: plans.week.missed || 0,
                skipped: plans.week.skipped || 0,
                plannedMiles: plans.week.plannedMiles || 0,
                completedMiles: plans.week.completedMiles || 0
            } : null
        },
        activity: {
            completedWorkouts: recentCompleted.length,
            skippedWorkouts: recentResults.filter(r => r?.status === "skipped").length,
            runSessions: recentRuns.length,
            runMiles: recentMiles,
            strengthSessions: recentStrength.length,
            strengthSets: strengthSets(recentResults),
            soccerSessions: recentSoccer.length,
            soccerCompleted,
            soccerNoShows,
            soccerLateCancels,
            soccerCounted
        },
        trend: {
            recentMiles: recentTrendMiles,
            priorMiles: priorTrendMiles,
            recentCompleted: recentTrendCompleted,
            priorCompleted: priorTrendCompleted,
            milesChangePct: percentChange(recentTrendMiles, priorTrendMiles),
            completedChangePct: percentChange(recentTrendCompleted, priorTrendCompleted)
        },
        checkins: {
            count: recentCheckins.length,
            rated: rated.length,
            average: rated.length ? Math.round((rated.reduce((sum, c) => sum + Number(c.rating), 0) / rated.length) * 10) / 10 : null,
            latestRating: rated[0] ? Number(rated[0].rating) : null
        },
        painFlags: recentPain,
        hasActivity: recentResults.length > 0 || recentSessions.length > 0 || recentCheckins.length > 0
    };
}

function emptyProgress() {
    return {
        window: { from: "", to: "", days: 28 },
        plan: { name: "", weekNumber: null, totalWeeks: null, state: null, week: null },
        activity: {
            completedWorkouts: 0, skippedWorkouts: 0, runSessions: 0, runMiles: 0,
            strengthSessions: 0, strengthSets: 0, soccerSessions: 0, soccerCompleted: 0,
            soccerNoShows: 0, soccerLateCancels: 0, soccerCounted: 0
        },
        trend: { recentMiles: 0, priorMiles: 0, recentCompleted: 0, priorCompleted: 0, milesChangePct: null, completedChangePct: null },
        checkins: { count: 0, rated: 0, average: null, latestRating: null },
        painFlags: 0,
        hasActivity: false
    };
}

