// Unit tests for the Client Hub summaries (js/clientSummary.js).
// Run with: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    planPosition, summarizePlans, summarizeSessions, summarizeCheckins,
    needsAttention, buildTimeline, summarizeClient, weekKey
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
