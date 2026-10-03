import { test } from "node:test";
import assert from "node:assert/strict";
import {
    TASK_GROUPS, itemKey, newPeopleItems, splitDone, pruneDone, groupByTask, groupByPerson,
    greeting, summaryLine, waitedText
} from "../js/coachToday.js";
import { attentionQueue } from "../js/feedbackModel.js";
import { needsAttention, summarizePlans, summarizeSessions, summarizeCheckins, clientStatusLines } from "../js/clientSummary.js";

const NOW = new Date("2026-09-29T09:00:00").getTime();
const H = 3600000, D = 24 * H;

test("new people: applications, questions and accounts, each once", () => {
    const apps = [
        { id: "a1", name: "Pat Parent", services: ["soccer_1on1"], createdAt: NOW - 2 * D, status: "new" },
        { id: "a2", name: "Lee", services: ["running", "strength"], createdAt: NOW - D, status: "new" },
        { id: "a3", name: "Old", services: [], createdAt: NOW - 9 * D, status: "handled" }
    ];
    const items = newPeopleItems({
        applications: apps,
        inquiries: [{ id: "q1", name: "Jo", topic: "1-on-1 Soccer", createdAt: NOW - 3 * H, status: "new" }, { id: "q2", name: "Done", status: "handled" }],
        pending: [{ uid: "u1", displayName: "Pat Parent", email: "pat@x.com" }, { uid: "u2", email: "sam@x.com", createdAt: NOW - 5 * H }],
        matchOf: p => (p.uid === "u1" ? apps[0] : null),
        serviceLabel: v => ({ running: "Running coaching", strength: "Strength coaching", soccer_1on1: "1-on-1 soccer" }[v] || v)
    });
    assert.deepEqual(items.map(i => [i.kind, i.name]), [
        ["pending", "Pat Parent"], ["pending", "sam@x.com"], ["application", "Lee"], ["question", "Jo"]
    ], "Pat's application shows once, as the account; handled ones are left out");
    assert.equal(items[0].text, "Applied and signed in. Approve them to start coaching");
    assert.equal(items[0].at, NOW - 2 * D, "waiting since they applied");
    assert.equal(items[0].href, "clients.html?tab=pending");
    assert.equal(items[1].text, "Signed in to the app and is waiting for you to approve them");
    assert.equal(items[2].text, "Applied for running coaching, strength coaching. Get in touch");
    assert.equal(items[2].href, "#applications");
    assert.equal(items[3].text, "Asked a question about 1-on-1 soccer on the website");
    assert.equal(items[3].href, "#inquiries");
    assert.equal(new Set(items.map(itemKey)).size, 4, "every item has its own key");
});

test("grouped by task, most pressing first; longest waiting first within a kind", () => {
    const items = [
        { uid: "a", name: "Alex", kind: "no-checkin", text: "No check-in yet this week" },
        { uid: "b", name: "Bea", kind: "checkin", text: "Check-in for week of Sep 21", at: NOW - H },
        { uid: "c", name: "Cy", kind: "checkin", text: "Check-in for week of Sep 21", at: NOW - 2 * D },
        { uid: "b", name: "Bea", kind: "pain", text: "Flagged pain" },
        { uid: "app:1", name: "Lee", kind: "application", text: "Applied" },
        { uid: "a", name: "Alex", kind: "change", text: "Asked for a change" },
        { uid: "a", name: "Alex", kind: "race", text: "Race in 7 days" },
        { uid: "x", name: "X", kind: "something-new", text: "?" }
    ];
    const groups = groupByTask(items);
    assert.deepEqual(groups.map(g => g.id), ["urgent", "reply", "new", "plans", "followup"]);
    assert.deepEqual(groups[1].items.map(i => `${i.kind}:${i.name}`), ["change:Alex", "checkin:Cy", "checkin:Bea"], "Cy has waited longer");
    assert.deepEqual(groups[4].items.map(i => i.kind), ["no-checkin", "something-new"], "unknown kinds are follow-ups");
    assert.equal(groups.reduce((n, g) => n + g.items.length, 0), items.length);
    // Every kind needsAttention makes has a group.
    const known = TASK_GROUPS.flatMap(g => g.kinds);
    for (const kind of ["pain", "health", "change", "checkin", "missed", "skipped", "booking", "plan-unseen", "race", "plan", "quiet", "no-checkin", "profile", "sessions", "intake", "session-log", "no-show", "package"]) {
        assert.ok(known.includes(kind), kind);
    }
    // By person keeps the order given.
    assert.deepEqual(groupByPerson(items).map(p => `${p.name} ${p.items.length}`), ["Alex 3", "Bea 2", "Cy 1", "Lee 1", "X 1"]);
});

test("Done for today: hidden today, back tomorrow, old marks pruned", () => {
    const items = [{ uid: "a", kind: "race", text: "Race in 7 days" }, { uid: "b", kind: "checkin", text: "Check-in" }];
    const done = { [itemKey(items[0])]: "2026-09-29", "old|x|y": "2026-09-27" };
    const today = splitDone(items, done, "2026-09-29");
    assert.deepEqual(today.shown.map(i => i.uid), ["b"]);
    assert.deepEqual(today.hidden.map(i => i.uid), ["a"]);
    assert.equal(splitDone(items, done, "2026-09-30").shown.length, 2, "tomorrow it's back");
    assert.deepEqual(Object.keys(pruneDone(done, "2026-09-29")), [itemKey(items[0])]);
    // Tomorrow's text differs ("6 days"), so it's a new item anyway.
    assert.notEqual(itemKey(items[0]), itemKey({ ...items[0], text: "Race in 6 days" }));
});

test("greeting, summary, waited", () => {
    assert.equal(greeting(new Date("2026-09-29T07:00:00"), "Eddie Steers"), "Good morning, Eddie");
    assert.equal(greeting(new Date("2026-09-29T13:00:00"), "Eddie"), "Good afternoon, Eddie");
    assert.equal(greeting(new Date("2026-09-29T19:30:00"), ""), "Good evening");
    const groups = groupByTask([
        { uid: "a", kind: "pain", text: "p" }, { uid: "a", kind: "checkin", text: "c" }, { uid: "b", kind: "checkin", text: "c" },
        { uid: "app:1", kind: "application", text: "a" }
    ]);
    assert.deepEqual(summaryLine(groups, 0), { headline: "4 things need you today", detail: "1 urgent · 2 waiting on your reply · 1 new person." });
    assert.deepEqual(summaryLine(groupByTask([{ uid: "a", kind: "quiet", text: "q" }]), 2), { headline: "1 thing needs you today", detail: "1 follow-up. 2 marked done for today." });
    assert.deepEqual(summaryLine([], 3), { headline: "That's everything for today", detail: "3 marked done for today." });
    assert.deepEqual(summaryLine([], 0), { headline: "Nothing needs you right now", detail: "" });
    assert.equal(waitedText(NOW - 30000, NOW), "just now");
    assert.equal(waitedText(NOW - 20 * 60000, NOW), "20 min ago");
    assert.equal(waitedText(NOW - 3 * H, NOW), "3 hours ago");
    assert.equal(waitedText(NOW - 30 * H, NOW), "yesterday");
    assert.equal(waitedText(NOW - 4 * D, NOW), "4 days ago");
    assert.equal(waitedText(NOW - 22 * D, NOW), "3 weeks ago");
    assert.equal(waitedText(undefined, NOW), "");
});

test("attention items carry how long they've waited; the queue keeps it", () => {
    const today = "2026-09-29";
    const items = needsAttention({
        profile: { services: ["running"] }, today,
        plans: summarizePlans({}, today),
        sessions: summarizeSessions([{ status: "requested", dates: ["2026-10-02"], createdAt: NOW - 3 * D }, { status: "requested", dates: ["2026-10-03"], createdAt: NOW - D }], today),
        checkins: summarizeCheckins([{ weekOf: "2026-09-21", status: "submitted", submittedAt: NOW - 2 * D }], today),
        results: [{ date: "2026-09-28", pain: true, title: "Tempo", createdAt: NOW - 5 * H }],
        changes: [{ status: "open", reason: "travel", createdAt: NOW - 6 * H }],
        record: undefined
    });
    const at = kind => items.find(i => i.kind === kind)?.at;
    assert.equal(at("pain"), NOW - 5 * H);
    assert.equal(at("change"), NOW - 6 * H);
    assert.equal(at("checkin"), NOW - 2 * D);
    assert.equal(at("booking"), NOW - 3 * D, "the oldest request");
    assert.equal(at("plan"), undefined, "nothing to date it by");
    const q = attentionQueue([{ uid: "u", name: "Sam", attention: items }]);
    assert.equal(q.find(i => i.kind === "checkin").at, NOW - 2 * D);
});

test("a client's status lines (My Clients and the dashboard)", () => {
    assert.deepEqual(clientStatusLines({ plans: {}, sessions: { upcoming: [] }, checkins: {} }), ["No active plan"]);
    assert.deepEqual(clientStatusLines({ services: ["soccer_1on1"], plans: {}, sessions: { upcoming: [{ date: "2026-10-02" }] }, checkins: {} }), ["Next session Oct 2"], "soccer-only: no plan line");
    assert.deepEqual(clientStatusLines({
        plans: { primary: { name: "Fall Half", state: "current", weekNumber: 3, totalWeeks: 12 } },
        sessions: { upcoming: [{ date: "2026-10-02" }] },
        checkins: { latest: { status: "submitted", weekOf: "2026-09-21" } }
    }), ["Fall Half · Week 3 of 12", "Next session Oct 2", "Check-in needs reply"]);
});
