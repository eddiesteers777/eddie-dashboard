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
========================================== */

import { isIntakeComplete, athleteDisplayName } from "./clientRecordSchema.js";
import { mergeRuntimeByDate } from "./coachingPlanModel.js";

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

// published: coachingPlans headers, each with the current version's
// `plan` when known. The client's mirrored copy (shared.coachPlans) has
// their "done" marks; until their app has pulled the newest version,
// the published plan stands in (with whatever marks the copy has).
function allPlans(shared, published = []) {
    const copies = (shared?.coachPlans || []).map(p => ({ ...p, planType: "coach" }));
    const coach = copies.filter(c => !published.some(h => h.id === c.coachPlanId && h.plan && (c.coachVersion || 0) < h.version));
    for (const h of published) {
        const copy = copies.find(c => c.coachPlanId === h.id);
        if (copy && (copy.coachVersion || 0) >= h.version) continue;
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
    const endDate = weekEnd(weeks.at(-1));
    const totalWeeks = weeks.length;
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
export function needsAttention({ profile, plans, sessions, checkins, today, record, coachingPlans = [], results = [] }) {
    const items = [];
    // Pain flagged on a workout, not yet answered: first thing to see.
    for (const r of results.filter(x => x.pain && !x.coachComment && x.date >= addDays(today, -14))) {
        items.push({ kind: "pain", text: `Flagged pain on ${shortDate(r.date)} (${r.title || "workout"})${r.painNote ? `: "${r.painNote}"` : ""}`, tab: "workouts" });
    }
    const services = profile?.services || [];
    const trains = services.some(s => TRAINING_SERVICES.includes(s));
    const soccer = services.some(s => SOCCER_SERVICES.includes(s));

    for (const c of checkins.needsReview) {
        items.push({ kind: "checkin", text: `Check-in for week of ${shortDate(c.weekOf)} needs your reply`, tab: "checkins" });
    }
    if (sessions.waiting.length) {
        items.push({ kind: "booking", text: `${sessions.waiting.length} session request${sessions.waiting.length === 1 ? "" : "s"} waiting on you`, tab: "sessions" });
    }
    // Profile not filled in (only when we could actually read it).
    if (record !== undefined && !isIntakeComplete(record)) {
        items.push({ kind: "intake", text: "Hasn't filled in their profile yet", tab: "profile" });
    }
    if (trains && !plans.primary) {
        items.push({ kind: "plan", text: "No active training plan", tab: "plan" });
    } else if (plans.primary?.state === "finished") {
        items.push({ kind: "plan", text: `${plans.primary.name} finished ${shortDate(plans.primary.endDate)} — time for what's next`, tab: "plan" });
    } else if (plans.primary?.state === "current" && plans.primary.endDate && plans.primary.endDate <= addDays(today, 7)) {
        items.push({ kind: "plan", text: `${plans.primary.name} ends ${shortDate(plans.primary.endDate)}`, tab: "plan" });
    }
    // A plan update they haven't opened after two days.
    for (const h of coachingPlans) {
        const published = toMillis(h.publishedAt);
        if (h.status !== "active" || (h.viewedVersion || 0) >= h.version || !published) continue;
        if (published <= new Date(`${today}T00:00:00`).getTime() - 2 * 86400000) {
            items.push({
                kind: "plan-unseen",
                text: h.version > 1 ? `Hasn't opened your ${h.name} update (v${h.version})` : `Hasn't opened ${h.name} yet`,
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

// Recent activity derived from existing data (no timeline collection yet).
// Each: { at (millis), date (iso), kind, text }
export function buildTimeline({ profile, link, checkins, requests, record, updates, coachingPlans, results }) {
    const events = [];
    const push = (at, kind, text) => { const ms = toMillis(at); if (ms) events.push({ at: ms, date: isoDate(new Date(ms)), kind, text }); };

    push(profile?.applicationSubmittedAt, "application", "Application submitted");
    push(profile?.approvedAt, "approved", "Account approved");
    push(link?.linkedAt, "linked", "Connected to you");
    push(record?.intakeCompletedAt, "intake", "Filled in their profile");
    for (const r of results || []) {
        push(r.createdAt, r.status === "skipped" ? "workout-skipped" : "workout",
            r.status === "skipped" ? `Skipped ${r.title || "a workout"} (${shortDate(r.date)})`
                : `Logged ${r.title || "a workout"}${r.distance ? ` — ${r.distance} mi` : ""}${r.kind === "strength" && r.exercises?.length ? ` — ${r.exercises.reduce((n, e) => n + (e.sets?.length || 0), 0)} sets` : ""}${r.rpe ? `, effort ${r.rpe}/10` : ""}${r.pain ? ", pain flagged" : ""}`);
        if (r.coachComment) push(r.coachCommentAt, "workout-reply", `You replied on ${r.title || "their workout"} (${shortDate(r.date)})`);
    }
    for (const h of coachingPlans || []) {
        push(h.publishedAt, "plan-published", `You published ${h.name}${h.version > 1 ? ` (v${h.version})` : ""}`);
        if (h.ackVersion) push(h.ackAt, "plan-ack", `Got your plan${h.ackVersion > 1 ? ` update (v${h.ackVersion})` : ""}`);
    }
    for (const u of updates || []) {
        push(u.createdAt, "update", "You sent them an update");
        push(u.readAt, "update-read", "They read your update");
    }
    for (const c of checkins || []) {
        push(c.submittedAt, "checkin", `Weekly check-in sent${c.rating ? ` — ${c.rating}/5` : ""}`);
        if (c.status === "reviewed") push(c.reviewedAt, "feedback", "You replied to their check-in");
    }
    for (const r of requests || []) {
        const when = r.dates?.[0] ? ` for ${shortDate(r.dates[0])}` : "";
        push(r.createdAt, "booking", `Requested a session${when}`);
        if (r.status === "approved") push(r.respondedAt, "booked", `Session booked${when}`);
        if (r.status === "denied") push(r.respondedAt, "denied", `Session request declined${when}`);
        if (r.status === "cancelled") push(r.respondedAt, "cancelled", `Session cancelled${when}`);
    }
    return events.sort((a, b) => b.at - a.at);
}

export function shortDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || "";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------- One-line row for the client list ----------

export function summarizeClient({ profile, link, shared, checkins, requests, record, coachingPlans = [], results = [] }, today) {
    const plans = summarizePlans(shared, today, coachingPlans, results);
    const sessions = summarizeSessions(requests, today);
    const checkinSummary = summarizeCheckins(checkins, today);
    const attention = needsAttention({ profile, plans, sessions, checkins: checkinSummary, today, record, coachingPlans, results });
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
export function buildCoachFeed({ updates = [], checkins = [], requests = [], results = [], today }) {
    const feed = [];
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
        if (r.status !== "approved" || !r.coachNote) continue;
        const last = (r.dates || []).filter(d => d <= today).sort().pop();
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
