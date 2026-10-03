// Package reminders for the coach (js/clientPackageModel.js packageAttention, Phase 11 step 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { packageAttention } from "../js/clientPackageModel.js";
import { needsAttention, summarizeSessions, summarizeCheckins, summarizePlans } from "../js/clientSummary.js";
import { groupByTask } from "../js/coachToday.js";

const TODAY = "2026-10-03";
const NOW = new Date(2026, 9, 3, 12).getTime();
const D = 86400000;
const pack = (extra = {}) => ({ id: "p1", packageName: "1-on-1 Soccer — 5 Sessions", packageId: "soccer_1on1_5", billingModel: "session_pack", sessionAllowance: 5, status: "active", paymentStatus: "paid", createdAt: NOW - 30 * D, ...extra });
const done = n => Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(10 + i).padStart(2, "0")}`, log: { status: "completed", packageAssignmentId: "p1" } }));
const texts = list => list.map(i => i.text);

test("sessions running out", () => {
    assert.deepEqual(texts(packageAttention([pack()], done(3), TODAY, NOW)), []);
    assert.deepEqual(texts(packageAttention([pack()], done(4), TODAY, NOW)), ["1-on-1 Soccer — 5 Sessions: 1 session left"]);
    assert.deepEqual(texts(packageAttention([pack()], done(5), TODAY, NOW)), ["1-on-1 Soccer — 5 Sessions: all 5 sessions used. Renew it or mark it complete"]);
    // Only sessions logged against this package count.
    const other = done(5).map(s => ({ ...s, log: { ...s.log, packageAssignmentId: "p2" } }));
    assert.deepEqual(texts(packageAttention([pack()], other, TODAY, NOW)), []);
});

test("payment", () => {
    assert.deepEqual(texts(packageAttention([pack({ paymentStatus: "past_due" })], done(4), TODAY, NOW)), ["1-on-1 Soccer — 5 Sessions: payment past due"], "past due beats 1 left");
    assert.deepEqual(texts(packageAttention([pack({ paymentStatus: "pending", createdAt: NOW - 3 * D })], [], TODAY, NOW)), [], "pending under a week is fine");
    const pending = packageAttention([pack({ paymentStatus: "pending", createdAt: NOW - 9 * D })], [], TODAY, NOW);
    assert.deepEqual(texts(pending), ["1-on-1 Soccer — 5 Sessions: payment still pending (9 days)"]);
    assert.equal(pending[0].at, NOW - 9 * D);
    assert.deepEqual(texts(packageAttention([pack({ paymentStatus: "comped", createdAt: NOW - 90 * D })], [], TODAY, NOW)), []);
});

test("dates and statuses", () => {
    const monthly = { id: "m1", packageName: "Online Coaching", billingModel: "subscription", sessionAllowance: null, status: "active", paymentStatus: "paid" };
    assert.deepEqual(texts(packageAttention([{ ...monthly, endsAt: "2026-10-08" }], [], TODAY, NOW)), ["Online Coaching ends Oct 8"]);
    assert.deepEqual(texts(packageAttention([{ ...monthly, endsAt: "2026-10-20" }], [], TODAY, NOW)), []);
    assert.deepEqual(texts(packageAttention([{ ...monthly, endsAt: "2026-09-30" }], [], TODAY, NOW)), ["Online Coaching ended Sep 30. Renew it or mark it complete"]);
    assert.deepEqual(texts(packageAttention([pack({ status: "completed", paymentStatus: "past_due" }), pack({ status: "cancelled" })], done(5), TODAY, NOW)), [], "finished packages say nothing");
    assert.deepEqual(texts(packageAttention([pack({ status: "paused", paymentStatus: "past_due" })], done(5), TODAY, NOW)), ["1-on-1 Soccer — 5 Sessions: payment past due"], "paused: payment still matters");
});

test("they reach the coach's list, in their own group", () => {
    const requests = [{ id: "b1", status: "approved", clientUid: "c", sessionType: "soccer", dates: ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"],
        logs: Object.fromEntries(["10", "11", "12", "13", "14"].map(d => [`2026-09-${d}`, { status: "completed", packageAssignmentId: "p1" }])) }];
    const items = needsAttention({ profile: { services: ["soccer_1on1"] }, plans: summarizePlans({}, TODAY), sessions: summarizeSessions(requests, TODAY), checkins: summarizeCheckins([], TODAY), today: TODAY, record: undefined, requests, packages: [pack()], now: NOW });
    const pkg = items.find(i => i.kind === "package");
    assert.equal(pkg.text, "1-on-1 Soccer — 5 Sessions: all 5 sessions used. Renew it or mark it complete");
    assert.equal(pkg.tab, "overview");
    const groups = groupByTask([{ ...pkg, uid: "c", name: "Sol" }]);
    assert.deepEqual(groups.map(g => g.label), ["Packages and payments"]);
    // Most pressing first across clients, whatever has waited longest.
    const mixed = groupByTask([
        { kind: "package", uid: "h", name: "Hal", text: "pending", priority: 5, at: NOW - 10 * D },
        { kind: "package", uid: "p", name: "Pia", text: "past due", priority: 0 },
        { kind: "package", uid: "s", name: "Sol", text: "used up", priority: 1 }
    ]);
    assert.deepEqual(mixed[0].items.map(i => i.name), ["Pia", "Sol", "Hal"]);
});
