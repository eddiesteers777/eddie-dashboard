// Unit tests for the coaching feedback loop (js/feedbackModel.js + the new
// attention items in js/clientSummary.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    weekSnapshot, snapshotLines, cleanCheckinAnswers, checkinFlags, attentionQueue, reasonLabel, CHANGE_REASONS
} from "../js/feedbackModel.js";
import { needsAttention, summarizeSessions, summarizeCheckins, summarizePlans, buildTimeline, buildCoachFeed } from "../js/clientSummary.js";
import { buildWeek } from "../js/weekModel.js";
import { blankPlan } from "../js/coachingPlanModel.js";

// Week of Mon 2026-09-28, looked at on Sunday Oct 4.
function week() {
    const plan = blankPlan("2026-09-28", 1);
    const d = plan.weeks[0].days;
    Object.assign(d[0], { type: "easy", miles: 5, completed: true });
    Object.assign(d[1], { type: "workout", miles: 6, completed: true });
    Object.assign(d[2], { type: "strength", session: "Lower", completed: true });
    Object.assign(d[3], { type: "easy", miles: 4, skipped: true });
    Object.assign(d[5], { type: "long", miles: 12, completed: true });
    Object.assign(d[4], { type: "easy", miles: 3 });
    return buildWeek("2026-09-28", { plans: [{ id: "coach-p1", coachPlanId: "p1", source: "coach", name: "Build", generatedPlan: plan }], sessions: [{ date: "2026-10-03", startTime: "09:00", title: "1-on-1" }] }, "2026-10-04");
}
const results = [
    { date: "2026-09-29", rpe: 8, pain: false },
    { date: "2026-10-03", rpe: 6, pain: true },
    { date: "2026-10-03", rpe: 7, pain: false, kind: "strength" },
    { date: "2026-09-27", rpe: 2, pain: true }  // last week: not counted
];

test("the week a check-in is about, worked out for them", () => {
    const snap = weekSnapshot(week(), results);
    assert.deepEqual(snap, {
        planned: 6, done: 4, skipped: 1, missed: 1, miles: 30, milesDone: 23, loggedMiles: 0,
        strengthPlanned: 1, strengthDone: 1, longRun: "done", avgRpe: 7, painDays: 1, sessions: 1
    });
    assert.deepEqual(snapshotLines(snap), [
        "4 of 6 workouts done", "23 / 30 mi", "Strength 1 of 1", "Long run done", "1 skipped",
        "Average effort 7/10", "Pain flagged on 1 day", "1 session with the coach"
    ]);
    assert.ok(Object.keys(snap).length <= 16, "fits the rules' size check");
    // Logged on another phone: the result counts even without this device's mark.
    const fri = weekSnapshot(week(), [{ planId: "p1", date: "2026-10-02", status: "completed", rpe: 5 }]);
    assert.equal(fri.done, 5, "Friday's 3 mi logged elsewhere");
    assert.equal(fri.missed, 0);
    assert.equal(fri.milesDone, 26);
    assert.deepEqual(weekSnapshot({ summary: {}, days: [], monday: "2026-09-28", sunday: "2026-10-04" }), {
        planned: 0, done: 0, skipped: 0, missed: 0, miles: 0, milesDone: 0, loggedMiles: 0,
        strengthPlanned: 0, strengthDone: 0, longRun: "", avgRpe: null, painDays: 0, sessions: 0
    });
});

test("check-in answers: cleaned, and what the coach should see first", () => {
    const a = cleanCheckinAnswers({ energy: "4", recovery: 2, motivation: 9, pain: true, painNote: "  left knee ", wentWell: "Long run felt great", change: "Tuesdays are hard with work", notes: "x".repeat(3000) });
    assert.deepEqual({ ...a, notes: a.notes.length }, { energy: 4, recovery: 2, motivation: null, pain: true, painNote: "left knee", wentWell: "Long run felt great", change: "Tuesdays are hard with work", notes: 2000 });
    assert.equal(cleanCheckinAnswers({ pain: false, painNote: "ignored" }).painNote, "");
    assert.deepEqual(checkinFlags(a), ["Pain: left knee", "Low recovery (2/5)", "Wants a change"]);
    assert.deepEqual(checkinFlags({ energy: 3, recovery: 3 }), []);
    assert.equal(reasonLabel("travel"), "Travel");
    assert.equal(reasonLabel("nope"), "Something else");
    assert.equal(CHANGE_REASONS.length, 6);
});

test("new alerts: change requests, rough check-in, race soon, gone quiet", () => {
    const today = "2026-10-04";
    const base = {
        profile: { services: ["running"], status: "active", lastSeenAt: new Date("2026-09-25T08:00:00").getTime() },
        plans: summarizePlans({}, today),
        sessions: summarizeSessions([], today),
        checkins: summarizeCheckins([{ id: "c1", status: "submitted", weekOf: "2026-09-28", rating: 3, recovery: 2, pain: true, painNote: "knee" }], today),
        today
    };
    const items = needsAttention({
        ...base,
        changes: [
            { status: "open", reason: "work", date: "2026-10-06", message: "Can we move Tuesday's workout to Wednesday?" },
            { status: "resolved", reason: "travel", message: "old" }
        ]
    });
    const kinds = items.map(i => i.kind);
    assert.ok(kinds.includes("change") && kinds.includes("checkin") && kinds.includes("quiet"), kinds.join(","));
    assert.equal(items.find(i => i.kind === "change").text, `Asked for a change for Oct 6 (work or life conflict): "Can we move Tuesday's workout to Wednesday?"`);
    assert.equal(items.find(i => i.kind === "checkin").text, "Check-in for week of Sep 28 needs your reply — pain: knee, low recovery (2/5)");
    assert.equal(items.find(i => i.kind === "quiet").text, "Hasn't opened the app in 9 days");
    assert.equal(items.filter(i => i.kind === "change").length, 1, "resolved requests don't count");
    // Race inside two weeks.
    const race = needsAttention({ ...base, profile: { services: ["running"] }, plans: { ...base.plans, primary: { state: "current", name: "10K", raceDate: "2026-10-11" }, week: base.plans.week } });
    assert.deepEqual(race.find(i => i.kind === "race"), { kind: "race", text: "Race in 7 days (Oct 11)", tab: "plan" });
    // Timeline + client feed.
    const changes = [{ status: "resolved", reason: "fatigue", createdAt: 1790000000000, resolvedAt: 1790003600000, coachReply: "Swapped Thursday for an easy day." }];
    const t = buildTimeline({ changes });
    assert.deepEqual(t.map(e => e.text), ["You answered their change request", "Asked for a change (feeling run down)"]);
    const feed = buildCoachFeed({ changes, today });
    assert.equal(feed[0].title, "Reply to your change request");
    assert.equal(feed[0].text, "Swapped Thursday for an easy day.");
});

test("the coach's queue: most urgent client first, links to the right tab", () => {
    const q = attentionQueue([
        { uid: "a", name: "Alex", attention: [{ kind: "no-checkin", text: "No check-in yet", tab: "checkins" }] },
        { uid: "s", name: "Sarah", attention: [{ kind: "checkin", text: "Check-in needs reply", tab: "checkins" }, { kind: "pain", text: "Flagged pain", tab: "workouts" }] },
        { uid: "j", name: "Josh", attention: [{ kind: "change", text: "Asked for a change", tab: "plan" }] },
        { uid: "m", name: "Mark", attention: [] }
    ]);
    assert.deepEqual(q.map(i => `${i.name}:${i.kind}`), ["Sarah:pain", "Sarah:checkin", "Josh:change", "Alex:no-checkin"]);
    assert.equal(q[0].href, "client.html?uid=s&tab=workouts");
    assert.deepEqual(attentionQueue([]), []);
});
