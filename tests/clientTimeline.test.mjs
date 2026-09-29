import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "../js/clientSummary.js";
import {
    TIMELINE_GROUPS, filterTimeline, groupCounts, groupByMonth, historyStats, statsLine, eventDay
} from "../js/clientTimeline.js";

const at = (iso, time = "12:00") => new Date(`${iso}T${time}:00`).getTime();

// Pat: applied without an account, approved, a plan published twice and
// once opened by itself, workouts, a check-in, a session, notes.
function pat() {
    return buildTimeline({
        profile: { uid: "pat", approvedAt: at("2026-08-03") },
        link: { clientUid: "pat", linkedAt: at("2026-08-03", "12:01") },
        application: { createdAt: at("2026-08-01"), services: ["running", "strength"], goal: "First half marathon" },
        record: {
            intakeCompletedAt: at("2026-08-04"), updatedAt: at("2026-09-20"), updatedBy: "pat",
            healthCheckedAt: at("2026-08-04", "12:05"), healthFlags: ["heart"],
            askedAt: { goal: at("2026-09-25"), level: at("2026-09-25") }
        },
        coachingPlans: [{ id: "p1", name: "Fall Half", status: "active", publishedAt: at("2026-09-14"), ackVersion: 2, ackAt: at("2026-09-15") },
            { id: "p0", name: "Base block", status: "archived", publishedAt: at("2026-08-05"), updatedAt: at("2026-08-30") }],
        planVersions: {
            p1: [
                { version: 3, name: "Fall Half", auto: true, publishedAt: at("2026-09-21") },
                { version: 2, name: "Fall Half", auto: false, publishedAt: at("2026-09-14"), coachNote: "Easier week", changes: ["Sat: long run 10 → 8 mi", "Tue: tempo → easy"] },
                { version: 1, name: "Fall Half", auto: false, publishedAt: at("2026-09-07"), changes: [] }
            ]
        },
        results: [
            { createdAt: at("2026-09-16"), status: "completed", title: "Tempo", date: "2026-09-16", distance: 5, rpe: 7, pain: true, painNote: "Left knee", coachComment: "Ice it", coachCommentAt: at("2026-09-16", "18:00") },
            { createdAt: at("2026-09-18"), status: "skipped", title: "Easy run", date: "2026-09-18" }
        ],
        checkins: [{ submittedAt: at("2026-09-20", "09:00"), rating: 4, wentWell: "Long run felt smooth", status: "reviewed", reviewedAt: at("2026-09-21"), coachFeedback: "Great week" }],
        requests: [{ createdAt: at("2026-09-01"), status: "approved", respondedAt: at("2026-09-02"), dates: ["2026-09-10", "2026-10-08"], startTime: "17:30", sessionType: "running", clientNote: "Form check please", coachNote: "Work on arm swing" }],
        updates: [{ createdAt: at("2026-09-22"), text: "Race week plan is up", readAt: at("2026-09-22", "20:00") }],
        privateNotes: [{ createdAt: at("2026-09-23"), text: "Thinking about a spring marathon" }],
        today: "2026-09-29"
    });
}

test("the whole relationship, newest first, with who did it and where it links", () => {
    const t = pat();
    assert.deepEqual(t.map(e => e.kind), [
        "asked", "note", "update-read", "update", "feedback", "profile", "checkin", "workout-skipped",
        "workout-reply", "workout", "plan-ack", "plan-published", "session", "plan-published", "booked", "booking",
        "plan-archived", "plan-published", "health", "intake", "linked", "approved", "application"
    ]);
    // Order is strictly newest first.
    assert.ok(t.every((e, i) => !i || t[i - 1].at >= e.at));
    const first = t[t.length - 1];
    assert.equal(first.kind, "application");
    assert.equal(first.text, "Applied for running, strength");
    assert.equal(first.detail, "Goal: First half marathon");
    assert.equal(first.by, "client");
    const byKind = k => t.filter(e => e.kind === k);
    assert.equal(byKind("approved")[0].by, "coach");
    assert.equal(byKind("note")[0].tab, "notes");
    assert.equal(byKind("note")[0].group, "notes");
    assert.equal(byKind("workout")[0].detail, "Pain: Left knee");
    assert.equal(byKind("workout-reply")[0].detail, "Ice it");
    assert.equal(byKind("checkin")[0].detail, "Went well: Long run felt smooth");
    assert.equal(byKind("booking")[0].detail, "Form check please");
    assert.equal(byKind("booked")[0].text, "Session booked for Sep 10 (+1 more)");
});

test("every publish from the versions, week openings left out; the archived plan", () => {
    const pubs = pat().filter(e => e.kind === "plan-published");
    assert.deepEqual(pubs.map(e => e.text), ["You updated Fall Half", "You published Fall Half", "You published Base block"]);
    assert.equal(pubs[0].detail, "Your note: Easier week · 2 changes: Sat: long run 10 → 8 mi; Tue: tempo → easy");
    const archived = pat().find(e => e.kind === "plan-archived");
    assert.equal(archived.text, "You archived Base block");
    // Without versions: the header's latest publish, as before.
    const t = buildTimeline({ coachingPlans: [{ id: "p1", name: "Fall Half", publishedAt: at("2026-09-14"), version: 2, noticeVersion: 2 }] });
    assert.deepEqual(t.map(e => e.text), ["You published an update to Fall Half"]);
});

test("sessions that happened, the application once, profile events", () => {
    const t = pat();
    const held = t.filter(e => e.kind === "session");
    assert.equal(held.length, 1, "Oct 8 hasn't happened yet");
    assert.equal(held[0].text, "Running session");
    assert.equal(held[0].date, "2026-09-10");
    assert.equal(new Date(held[0].at).getHours(), 17);
    assert.equal(held[0].detail, "Your notes: Work on arm swing");
    // No `today`: no held sessions.
    assert.equal(buildTimeline({ requests: [{ status: "approved", dates: ["2026-09-10"] }] }).length, 0);
    // Applied while signed in: the profile's copy isn't counted twice.
    const both = buildTimeline({ profile: { applicationSubmittedAt: at("2026-08-01", "12:02") }, application: { createdAt: at("2026-08-01"), services: [] } });
    assert.deepEqual(both.map(e => e.text), ["Applied"]);
    const old = buildTimeline({ profile: { applicationSubmittedAt: at("2026-08-01"), applicationMessage: "Help me run" } });
    assert.deepEqual(old.map(e => [e.text, e.detail]), [["Application submitted", "Help me run"]]);
    // Health, asks, latest change.
    const health = t.find(e => e.kind === "health");
    assert.match(health.detail, /^Said yes to: /);
    assert.equal(t.find(e => e.kind === "asked").text, "You asked them to check their goal and starting point");
    assert.equal(t.find(e => e.kind === "asked").detail, "Still waiting on their answer");
    const answered = buildTimeline({ record: { askedAt: { goal: at("2026-09-25") }, confirmedAt: { primaryGoal: at("2026-09-26") } } });
    assert.equal(answered[0].detail, "They've answered");
    assert.equal(t.find(e => e.kind === "profile").text, "Updated their profile (latest change)");
    const coachEdit = buildTimeline({ link: { clientUid: "pat" }, record: { updatedAt: at("2026-09-20"), updatedBy: "coach1" } });
    assert.equal(coachEdit[0].kind, "profile-coach");
    assert.equal(coachEdit[0].by, "coach");
    // Finishing the profile is one line, not two.
    const done = buildTimeline({ record: { intakeCompletedAt: at("2026-08-04"), updatedAt: at("2026-08-04") } });
    assert.deepEqual(done.map(e => e.kind), ["intake"]);
});

test("filters, search, counts", () => {
    const t = pat();
    const counts = groupCounts(t);
    assert.equal(counts.all, t.length);
    assert.equal(counts.plan, 5, "3 publishes, got it, archived");
    assert.equal(counts.workouts, 3);
    assert.equal(counts.sessions, 3);
    assert.equal(counts.profile, 7, "profile + account");
    assert.equal(TIMELINE_GROUPS.reduce((n, g) => n + counts[g.value], 0), t.length, "every event is in exactly one chip");
    assert.deepEqual(filterTimeline(t, { group: "notes" }).map(e => e.kind), ["note"]);
    assert.deepEqual(filterTimeline(t, { query: "KNEE" }).map(e => e.kind), ["workout"]);
    assert.deepEqual(filterTimeline(t, { group: "checkins", query: "great" }).map(e => e.kind), ["feedback"]);
    assert.deepEqual(filterTimeline(t, { query: "long run" }).map(e => e.kind), ["checkin", "plan-published"]);
    assert.equal(filterTimeline(t, { group: "all", query: "  " }).length, t.length);
});

test("months, stats, day labels", () => {
    const t = pat();
    const months = groupByMonth(t);
    assert.deepEqual(months.map(m => m.label), ["September 2026", "August 2026"]);
    assert.equal(months.reduce((n, m) => n + m.events.length, 0), t.length);
    const s = historyStats(t);
    assert.equal(s.since, "2026-08-01");
    assert.equal(statsLine(s), "1 workout logged · 1 skipped · 1 check-in · 1 session held · 3 plan publishes · 1 update from you");
    assert.equal(statsLine(historyStats([])), "");
    assert.equal(eventDay({ at: at("2026-09-29") }, 2026), "Tue, Sep 29");
    assert.equal(eventDay({ at: at("2025-09-29") }, 2026), "Mon, Sep 29, 2025");
});
