// Unit tests for the Client Hub summaries (js/clientSummary.js).
// Run with: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    planPosition, summarizePlans, summarizeSessions, summarizeCheckins,
    needsAttention, buildTimeline, summarizeClient, weekKey, buildCoachFeed
} from "../js/clientSummary.js";

// A 3-week plan starting Mon 2026-09-14 (weeks: 14-20, 21-27, 28-Oct 4).
function makePlan({ name = "Fall 10K", status = "active", start = "2026-09-14", weeks = 3, completedThrough = null } = {}) {
    const out = [];
    const [y, m, d] = start.split("-").map(Number);
    for (let w = 0; w < weeks; w++) {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const dt = new Date(y, m - 1, d + w * 7 + i);
            const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
            const type = i === 6 ? "rest" : i === 5 ? "long" : "easy";
            days.push({ date: iso, type, miles: type === "rest" ? 0 : type === "long" ? 8 : 4, session: type, completed: completedThrough ? iso <= completedThrough : false });
        }
        out.push({ week: w + 1, phase: "Base", startDate: days[0].date, days });
    }
    return { id: "p1", name, status, generatedPlan: { primaryGoal: "BASE_BUILD", raceDate: "2026-10-04", weeks: out } };
}

test("plan position: upcoming, current week, finished", () => {
    const plan = makePlan();
    assert.equal(planPosition(plan, "2026-09-10").state, "upcoming");
    const cur = planPosition(plan, "2026-09-23");
    assert.equal(cur.state, "current");
    assert.equal(cur.weekNumber, 2);
    assert.equal(cur.totalWeeks, 3);
    assert.equal(cur.endDate, "2026-10-04");
    assert.equal(planPosition(plan, "2026-10-05").state, "finished");
    assert.equal(planPosition({ generatedPlan: { weeks: [] } }, "2026-09-23"), null);
});

test("plans: primary active plan, today, next workout, this week's completion", () => {
    const shared = {
        runningPrograms: [makePlan({ completedThrough: "2026-09-22" })],
        trainingPrograms: [makePlan({ name: "Draft", status: "draft" })]
    };
    const s = summarizePlans(shared, "2026-09-23"); // Wednesday of week 2
    assert.equal(s.activeCount, 1);
    assert.equal(s.primary.name, "Fall 10K");
    assert.equal(s.primary.weekNumber, 2);
    assert.equal(s.today.length, 1);
    assert.equal(s.next.date, "2026-09-24");
    assert.equal(s.week.planned, 6);
    assert.equal(s.week.completed, 2); // Mon + Tue
    assert.equal(s.week.dueSoFar, 3);
    assert.equal(s.week.missed, 0); // today isn't missed yet
    assert.equal(s.week.completedMiles, 8);
});

test("plans: nothing active", () => {
    const s = summarizePlans({ runningPrograms: [makePlan({ status: "paused" })] }, "2026-09-23");
    assert.equal(s.primary, null);
    assert.equal(s.next, null);
    assert.equal(s.week.planned, 0);
});

test("sessions: upcoming soonest first, past latest first, waiting requests", () => {
    const requests = [
        { status: "approved", dates: ["2026-09-18", "2026-09-25", "2026-10-02"], startTime: "17:30" },
        { status: "requested", dates: ["2026-10-09"] },
        { status: "denied", dates: ["2026-09-30"] }
    ];
    const s = summarizeSessions(requests, "2026-09-25");
    assert.deepEqual(s.upcoming.map(o => o.date), ["2026-09-25", "2026-10-02"]);
    assert.deepEqual(s.past.map(o => o.date), ["2026-09-18"]);
    assert.equal(s.waiting.length, 1);
});

test("check-ins: latest, needs review, this week, average", () => {
    const c = summarizeCheckins([
        { weekOf: "2026-09-14", rating: 3, status: "reviewed" },
        { weekOf: "2026-09-21", rating: 5, status: "submitted" }
    ], "2026-09-25");
    assert.equal(c.latest.weekOf, "2026-09-21");
    assert.equal(c.needsReview.length, 1);
    assert.equal(c.thisWeek.weekOf, "2026-09-21");
    assert.equal(c.recentAverage, 4);
    assert.equal(weekKey(new Date("2026-09-27T00:00:00")), "2026-09-21", "Sunday belongs to the week before");
});

test("needs attention: check-in, bookings, no plan, no sessions for soccer", () => {
    const profile = { services: ["running", "soccer_1on1"] };
    const today = "2026-09-26"; // Saturday
    const plans = summarizePlans({}, today);
    const sessions = summarizeSessions([{ status: "requested", dates: ["2026-10-01"] }], today);
    const checkins = summarizeCheckins([{ weekOf: "2026-09-14", status: "submitted", rating: 4 }], today);
    const kinds = needsAttention({ profile, plans, sessions, checkins, today }).map(i => i.kind);
    assert.deepEqual(kinds, ["checkin", "booking", "plan", "no-checkin"]);

    const none = needsAttention({
        profile: { services: ["soccer_group"] },
        plans: summarizePlans({}, today),
        sessions: summarizeSessions([], today),
        checkins: summarizeCheckins([], today),
        today
    }).map(i => i.kind);
    assert.deepEqual(none, ["sessions"], "soccer-only: no plan or check-in nags, but flag no sessions");
});

test("needs attention: plan ending soon, missed workouts", () => {
    const today = "2026-09-30"; // Wed of the last week
    const plans = summarizePlans({ runningPrograms: [makePlan({ completedThrough: "2026-09-28" })] }, today);
    const items = needsAttention({
        profile: { services: ["running"] }, plans,
        sessions: summarizeSessions([], today), checkins: summarizeCheckins([], today), today
    });
    assert.ok(items.some(i => i.kind === "plan" && /ends/.test(i.text)));
    assert.ok(!items.some(i => i.kind === "missed"), "only 1 missed so far (Tue)");
});

test("timeline: newest first, from profile, link, check-ins and bookings", () => {
    const t = buildTimeline({
        profile: { applicationSubmittedAt: { seconds: Date.parse("2026-09-10T12:00:00Z") / 1000 }, approvedAt: Date.parse("2026-09-12T12:00:00Z") },
        link: { linkedAt: Date.parse("2026-09-12T12:05:00Z") },
        checkins: [{ submittedAt: Date.parse("2026-09-21T12:00:00Z"), rating: 4, status: "reviewed", reviewedAt: Date.parse("2026-09-22T12:00:00Z") }],
        requests: [{ createdAt: Date.parse("2026-09-24T12:00:00Z"), status: "approved", respondedAt: Date.parse("2026-09-24T15:00:00Z"), dates: ["2026-10-02"] }]
    });
    assert.deepEqual(t.map(e => e.kind), ["booked", "booking", "feedback", "checkin", "linked", "approved", "application"]);
    assert.match(t[3].text, /4\/5/);
});

test("summarizeClient: one row for the list", () => {
    const row = summarizeClient({
        profile: { uid: "u1", displayName: "Sam", email: "s@x.com", services: ["running"], status: "active" },
        link: { clientUid: "u1", clientName: "Old name" },
        shared: { runningPrograms: [makePlan({ completedThrough: "2026-09-22" })] },
        checkins: [], requests: []
    }, "2026-09-23");
    assert.equal(row.name, "Sam");
    assert.equal(row.plans.primary.weekNumber, 2);
    assert.deepEqual(row.attention, []);
});

test("profile: flag it when not filled in, but not when it couldn't be read", () => {
    const today = "2026-09-23";
    const base = { profile: { services: ["soccer_1on1"] }, plans: summarizePlans({}, today),
        sessions: summarizeSessions([{ status: "approved", dates: ["2026-09-30"] }], today),
        checkins: summarizeCheckins([], today), today };
    assert.deepEqual(needsAttention({ ...base, record: null }).map(i => i.kind), ["intake"]);
    assert.deepEqual(needsAttention({ ...base, record: { primaryGoal: "Better first touch" } }).map(i => i.kind), ["intake"], "no sport yet");
    assert.deepEqual(needsAttention({ ...base, record: { primaryGoal: "Better first touch", primarySport: "soccer" } }), []);
    assert.deepEqual(needsAttention({ ...base, record: undefined }), []);
});

test("profile: names, search and timeline", () => {
    const row = summarizeClient({
        profile: { uid: "p1", displayName: "Jordan Parent", email: "jp@x.com", services: ["soccer_1on1"] },
        link: { clientUid: "p1" }, shared: {}, checkins: [], requests: [],
        record: { whoTrains: "child", athleteName: "Alex", primaryGoal: "Make the U12 team", primarySport: "soccer" }
    }, "2026-09-23");
    assert.equal(row.athlete, "Alex");
    assert.equal(row.goesBy, "Alex");
    assert.equal(row.goal, "Make the U12 team");
    assert.ok(row.searchText.includes("alex") && row.searchText.includes("jordan"));

    const t = buildTimeline({ profile: {}, link: {}, checkins: [], requests: [],
        record: { intakeCompletedAt: Date.parse("2026-09-24T12:00:00Z") } });
    assert.deepEqual(t.map(e => e.kind), ["intake"]);
});

test("timeline: updates sent and read", () => {
    const t = buildTimeline({ profile: {}, link: {}, checkins: [], requests: [],
        updates: [{ createdAt: Date.parse("2026-09-24T12:00:00Z"), readAt: Date.parse("2026-09-25T08:00:00Z") }, { createdAt: Date.parse("2026-09-25T12:00:00Z"), readAt: null }] });
    assert.deepEqual(t.map(e => e.kind), ["update", "update-read", "update"]);
});

test("coach feed: updates, check-in replies and past session notes, newest first", () => {
    const at = iso => ({ toMillis: () => new Date(`${iso}T12:00:00`).getTime() });
    const feed = buildCoachFeed({
        today: "2026-09-25",
        updates: [
            { id: "u1", text: "Great week!", coachName: "Eddie", createdAt: at("2026-09-24"), readAt: null },
            { id: "u2", text: "Older", createdAt: at("2026-09-10"), readAt: at("2026-09-11") }
        ],
        checkins: [
            { status: "reviewed", coachFeedback: "Nice work", weekOf: "2026-09-15", reviewedAt: at("2026-09-20") },
            { status: "submitted", notes: "tired", weekOf: "2026-09-22", submittedAt: at("2026-09-23") }
        ],
        requests: [
            { status: "approved", coachNote: "Work on first touch", dates: ["2026-09-18", "2026-10-02"], respondedAt: at("2026-09-18") },
            { status: "approved", coachNote: "Before it happens", dates: ["2026-10-01"], respondedAt: at("2026-09-22") },
            { status: "denied", coachNote: "nope", dates: ["2026-09-01"], respondedAt: at("2026-09-01") }
        ]
    });
    assert.deepEqual(feed.map(f => f.kind), ["update", "feedback", "session", "update"]);
    assert.equal(feed[0].title, "Update from Eddie");
    assert.equal(feed[0].unread, true);
    assert.equal(feed[3].unread, false);
    assert.equal(feed[3].title, "Update from your coach");
    assert.equal(feed[2].text, "Work on first touch");
});

// ---- Coach-published plans ----

function coachCopy(version, doneThrough) {
    return { id: "coach-p1", coachPlanId: "p1", coachVersion: version, name: "Fall 10K", status: "active", source: "coach",
        generatedPlan: { weeks: makePlan({ completedThrough: doneThrough }).generatedPlan.weeks } };
}

test("coach plans: the client's synced copy counts, with their done marks", () => {
    const s = summarizePlans({ coachPlans: [coachCopy(2, "2026-09-22")] }, "2026-09-23", [{ id: "p1", version: 2, name: "Fall 10K", status: "active" }]);
    assert.equal(s.primary.name, "Fall 10K");
    assert.equal(s.primary.coachPlanId, "p1");
    assert.equal(s.week.completed, 2);
});

test("coach plans: a newer published version stands in until the client syncs, keeping their marks", () => {
    const published = makePlan({ completedThrough: null }).generatedPlan;
    published.weeks[1].days[1] = { ...published.weeks[1].days[1], miles: 9 };
    const s = summarizePlans({ coachPlans: [coachCopy(1, "2026-09-22")] }, "2026-09-23",
        [{ id: "p1", version: 2, name: "Fall 10K v2", status: "active", plan: published }]);
    assert.equal(s.plans.filter(p => p.planType === "coach").length, 1, "one copy, not two");
    assert.equal(s.primary.name, "Fall 10K v2");
    assert.equal(s.week.completed, 2, "marks carried over by date");
    assert.equal(s.week.plannedMiles, 33, "the coach's new version: 5 x 4 mi easy + 8 mi long, one easy day now 9");
});

test("coach plans: logged results count before the client's copy syncs", () => {
    const results = [
        { planId: "p1", date: "2026-09-23", status: "completed" },
        { planId: "p1", date: "2026-09-22", status: "skipped" },
        { planId: "other", date: "2026-09-21", status: "completed" }
    ];
    const shared = { coachPlans: [coachCopy(2, "2026-09-22")] };
    const s = summarizePlans(shared, "2026-09-23", [{ id: "p1", version: 2, name: "Fall 10K", status: "active" }], results);
    assert.equal(s.week.completed, 2, "Mon done (mark), Tue skipped (log wins), Wed done (log)");
    assert.equal(s.week.skipped, 1);
    assert.equal(s.week.missed, 0);
    assert.equal(shared.coachPlans[0].generatedPlan.weeks[1].days[1].completed, true, "the shared mirror isn't mutated");
});

test("coach plans: a plan the coach took over isn't counted twice", () => {
    const own = { ...makePlan(), id: "rp1" };
    const s = summarizePlans({ runningPrograms: [own], coachPlans: [coachCopy(1, null)] }, "2026-09-23",
        [{ id: "p1", version: 1, name: "Fall 10K", status: "active", adoptedFrom: { store: "running", id: "rp1" } }]);
    assert.equal(s.activeCount, 1);
});

test("coach plans: before the client syncs a taken-over plan, its done marks still count", () => {
    const own = { ...makePlan({ completedThrough: "2026-09-22" }), id: "rp1" };
    const s = summarizePlans({ runningPrograms: [own] }, "2026-09-23",
        [{ id: "p1", version: 1, name: "Fall 10K", status: "active", adoptedFrom: { store: "running", id: "rp1" }, plan: makePlan().generatedPlan }]);
    assert.equal(s.activeCount, 1);
    assert.equal(s.week.completed, 2);
});

test("coach plans: an update not opened for two days needs attention; timeline shows publish and got-it", () => {
    const at = iso => ({ toMillis: () => new Date(`${iso}T12:00:00`).getTime() });
    const plans = summarizePlans({}, "2026-09-25");
    const base = { profile: { services: ["running"] }, plans, sessions: { waiting: [], upcoming: [] }, checkins: { needsReview: [], thisWeek: { status: "submitted" } }, today: "2026-09-25", record: undefined };
    const unseen = { id: "p1", name: "Fall 10K", version: 3, status: "active", viewedVersion: 2, publishedAt: at("2026-09-21") };
    assert.ok(needsAttention({ ...base, coachingPlans: [unseen] }).some(i => i.kind === "plan-unseen" && /update \(v3\)/.test(i.text)));
    assert.ok(!needsAttention({ ...base, coachingPlans: [{ ...unseen, publishedAt: at("2026-09-24") }] }).some(i => i.kind === "plan-unseen"), "not yet: only a day old");
    assert.ok(!needsAttention({ ...base, coachingPlans: [{ ...unseen, viewedVersion: 3 }] }).some(i => i.kind === "plan-unseen"));
    const tl = buildTimeline({ coachingPlans: [{ ...unseen, ackVersion: 2, ackAt: at("2026-09-22") }] });
    assert.deepEqual(tl.map(e => e.text), ["Got your plan update (v2)", "You published Fall 10K (v3)"]);
});

// ---- Workout results ----

test("workout results: pain first in attention, skips counted, timeline and client feed", () => {
    const at = iso => ({ toMillis: () => new Date(`${iso}T12:00:00`).getTime() });
    const results = [
        { date: "2026-09-29", title: "Workout", status: "completed", distance: 6.2, rpe: 8, pain: true, painNote: "left Achilles", coachComment: "", createdAt: at("2026-09-29") },
        { date: "2026-09-30", title: "Easy run", status: "skipped", pain: false, coachComment: "", createdAt: at("2026-09-30") },
        { date: "2026-10-01", title: "Easy run", status: "skipped", pain: false, coachComment: "Rest is fine.", coachCommentAt: at("2026-10-01"), planId: "p1", createdAt: at("2026-10-01") }
    ];
    const plans = summarizePlans({}, "2026-10-02");
    const base = { profile: { services: ["running"] }, plans, sessions: { waiting: [], upcoming: [] }, checkins: { needsReview: [], thisWeek: { status: "submitted" } }, today: "2026-10-02", record: undefined };
    const items = needsAttention({ ...base, results });
    assert.equal(items[0].kind, "pain");
    assert.match(items[0].text, /Flagged pain on Sep 29 \(Workout\): "left Achilles"/);
    assert.ok(items.some(i => i.kind === "skipped" && /Skipped 2 workouts/.test(i.text)));
    // Answered pain drops off.
    assert.ok(!needsAttention({ ...base, results: [{ ...results[0], coachComment: "Ice it." }] }).some(i => i.kind === "pain"));
    const tl = buildTimeline({ results }).map(e => e.text);
    assert.ok(tl.includes("Logged Workout — 6.2 mi, effort 8/10, pain flagged"));
    assert.ok(tl.includes("Skipped Easy run (Sep 30)"));
    assert.ok(tl.includes("You replied on Easy run (Oct 1)"));
    const feed = buildCoachFeed({ results, today: "2026-10-02" });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].title, "Reply on your easy run");
    assert.equal(feed[0].link, "workout.html?program=coach-p1&date=2026-10-01");
});

test("strength logs: decide a strength-only day, never the run next to them; timeline counts sets", () => {
    const copy = coachCopy(1, null);
    const days = copy.generatedPlan.weeks[1].days;
    days[0] = { ...days[0], strength: { title: "Core", exercises: [{ name: "Dead Bug", sets: 2, reps: "10" }] } };   // Mon run + core
    days[1] = { ...days[1], type: "strength", miles: 0, strength: { title: "Lower", exercises: [{ name: "Squat", sets: 3, reps: "5" }] } };
    const results = [
        { planId: "p1", date: "2026-09-21", status: "completed", kind: "strength" },
        { planId: "p1", date: "2026-09-22", status: "completed", kind: "strength", title: "Lower", exercises: [{ name: "Squat", sets: [{ weight: 135, reps: 5 }, { weight: 135, reps: 5 }] }], createdAt: 1790000000000 }
    ];
    const s = summarizePlans({ coachPlans: [copy] }, "2026-09-23", [{ id: "p1", version: 1, name: "Fall 10K", status: "active" }], results);
    assert.equal(s.week.completed, 1, "Tue strength day done; Mon's run isn't marked by the core log");
    const t = buildTimeline({ results });
    assert.ok(t.some(e => e.text === "Logged Lower — 2 sets"), JSON.stringify(t));
});
