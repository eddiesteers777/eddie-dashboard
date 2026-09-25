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
========================================== */

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

function allPlans(shared) {
    const race = (shared?.runningPrograms || []).map(p => ({ ...p, planType: "running" }));
    const training = (shared?.trainingPrograms || []).map(p => ({ ...p, planType: "training" }));
    return [...race, ...training];
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
export function summarizePlans(shared, today) {
    const plans = allPlans(shared);
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
        missed: dueSoFar.filter(d => !d.completed && d.date < today).length,
        plannedMiles: round1(thisWeek.reduce((s, d) => s + (Number(d.miles) || 0), 0)),
        completedMiles: round1(thisWeek.filter(d => d.completed).reduce((s, d) => s + (Number(d.miles) || 0), 0))
    };

    return {
        plans,
        activeCount: active.length,
        primary: primary ? {
            id: primary.program.id,
            name: primary.program.name || (primary.program.planType === "training" ? "Training Plan" : "Race Plan"),
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
export function needsAttention({ profile, plans, sessions, checkins, today }) {
    const items = [];
    const services = profile?.services || [];
    const trains = services.some(s => TRAINING_SERVICES.includes(s));
    const soccer = services.some(s => SOCCER_SERVICES.includes(s));

    for (const c of checkins.needsReview) {
        items.push({ kind: "checkin", text: `Check-in for week of ${shortDate(c.weekOf)} needs your reply`, tab: "checkins" });
    }
    if (sessions.waiting.length) {
        items.push({ kind: "booking", text: `${sessions.waiting.length} session request${sessions.waiting.length === 1 ? "" : "s"} waiting on you`, tab: "sessions" });
    }
    if (trains && !plans.primary) {
        items.push({ kind: "plan", text: "No active training plan", tab: "plan" });
    } else if (plans.primary?.state === "finished") {
        items.push({ kind: "plan", text: `${plans.primary.name} finished ${shortDate(plans.primary.endDate)} — time for what's next`, tab: "plan" });
    } else if (plans.primary?.state === "current" && plans.primary.endDate && plans.primary.endDate <= addDays(today, 7)) {
        items.push({ kind: "plan", text: `${plans.primary.name} ends ${shortDate(plans.primary.endDate)}`, tab: "plan" });
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
export function buildTimeline({ profile, link, checkins, requests }) {
    const events = [];
    const push = (at, kind, text) => { const ms = toMillis(at); if (ms) events.push({ at: ms, date: isoDate(new Date(ms)), kind, text }); };

    push(profile?.applicationSubmittedAt, "application", "Application submitted");
    push(profile?.approvedAt, "approved", "Account approved");
    push(link?.linkedAt, "linked", "Connected to you");
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

export function summarizeClient({ profile, link, shared, checkins, requests }, today) {
    const plans = summarizePlans(shared, today);
    const sessions = summarizeSessions(requests, today);
    const checkinSummary = summarizeCheckins(checkins, today);
    const attention = needsAttention({ profile, plans, sessions, checkins: checkinSummary, today });
    return {
        uid: link?.clientUid || profile?.uid,
        name: profile?.displayName || link?.clientName || "Client",
        email: profile?.email || link?.clientEmail || "",
        services: profile?.services || [],
        status: profile?.status || "active",
        plans,
        sessions,
        checkins: checkinSummary,
        attention
    };
}
