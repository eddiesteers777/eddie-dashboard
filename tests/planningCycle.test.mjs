// Unit tests for the planning cycle record (weekly planning P3).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    cycleId, newCycle, withContext, withProposal, withApproval, withUndo, withPublished,
    toDoc, fromDoc, cycleSummary, hashText, CAPS, REASONS
} from "../js/planningCycle.js";
import { parseReply, applyReply, dayLine } from "../js/planPrompt.js";

const day = (date, type, miles, session) => ({ date, type, miles, session });
const PLAN = { weeks: [{ days: [
    day("2026-10-12", "easy", 5, "Easy"), day("2026-10-13", "workout", 8, "Tempo 4 mi"), day("2026-10-14", "easy", 6, "Easy"),
    day("2026-10-15", "rest", 0, "Rest"), day("2026-10-16", "easy", 5, "Easy"), day("2026-10-17", "long", 14, "Long run"), day("2026-10-18", "easy", 4, "Easy")
] }] };
const CONTEXT = { version: "0.1.0", window: { from: "2026-10-12", to: "2026-10-18" }, athlete: { who: "client", firstName: "Sam", ageBand: "30s" }, sections: [{ key: "load", title: "Training load", facts: [{ path: "load.percentile", name: "Recent load", value: "higher than 84%", kind: "modeled", confidence: "moderate", basis: ["a", "b"] }] }], priorities: [], unknowns: [], plan: { lines: PLAN.weeks[0].days.map(dayLine) }, notes: "Travels Tue." };

// What the view does: read the answer, work out which days change.
function readAnswer(text) {
    const read = parseReply(text, { plan: PLAN, from: "2026-10-12", to: "2026-10-18", scope: "runs" });
    const before = new Map(PLAN.weeks[0].days.map(d => [d.date, d]));
    const after = new Map(applyReply(PLAN, read.days).weeks[0].days.map(d => [d.date, d]));
    read.changed = read.days.filter(d => JSON.stringify(before.get(d.date)) !== JSON.stringify(after.get(d.date))).map(d => ({ ...d, before: before.get(d.date), after: after.get(d.date) }));
    return read;
}
const lines = PLAN.weeks[0].days.map(dayLine);
const ANSWER = [
    lines[0],
    "2026-10-13 Tue | easy | 5 | Easy run | none | Travel day",
    lines[2], lines[3], lines[4],
    "2026-10-17 Sat | long | 12 | Long run | none | Shorter after travel",
    lines[6], "", "2026-10-13: travel, so the tempo moves out of this week."
].join("\n");

test("a cycle is one record per athlete and week, keyed coach_athlete_weekOf", () => {
    assert.equal(cycleId("coach", "sam", "2026-10-12"), "coach_sam_2026-10-12");
    const c = newCycle({ coachUid: "coach", athleteUid: "coach", from: "2026-10-12", to: "2026-10-18" });
    assert.equal(c.id, "coach_coach_2026-10-12", "Eddie's own week: the athlete is the coach");
    assert.equal(c.status, "open");
    assert.equal(hashText("abc"), hashText("abc"));
    assert.notEqual(hashText("abc"), hashText("abd"));
});

test("context, then the pasted answer, then the coach's call: accepted, kept with a reason", () => {
    let c = withContext(newCycle({ coachUid: "coach", athleteUid: "sam", from: "2026-10-12", to: "2026-10-18" }), CONTEXT, { at: 1 });
    assert.equal(c.context.athlete.firstName, "Sam");
    assert.ok(c.contextHash.length === 8);
    const read = readAnswer(ANSWER);
    assert.equal(read.changed.length, 2);
    const p = withProposal(c, read, { text: ANSWER, at: 1000 });
    c = p.cycle;
    assert.equal(c.proposals.length, 1);
    const prop = c.proposals[0];
    assert.equal(prop.contextHash, c.contextHash, "the answer is tied to the context it saw");
    assert.deepEqual(prop.days.map(d => d.date), ["2026-10-13", "2026-10-17"]);
    assert.match(prop.days[0].was, /workout \| 8 \| Tempo 4 mi/);
    assert.match(prop.days[0].line, /easy \| 5 \| Easy run/);
    assert.equal(prop.days[0].why, "travel, so the tempo moves out of this week.");
    assert.equal(prop.days[1].note, "Shorter after travel");
    assert.equal(prop.same, 5);
    // The coach takes Tuesday and keeps their own long run, because of the race.
    c = withApproval(c, { proposalId: p.proposalId, taken: new Set(["2026-10-13"]), reasons: { "2026-10-17": { key: "race" }, "2026-10-13": { key: "bogus" } }, planRef: { store: "coachingPlans", planId: "plan1", draft: true }, at: 2000 });
    assert.equal(c.status, "approved");
    assert.deepEqual(c.review.map(r => [r.date, r.action, r.reason || ""]), [["2026-10-13", "accepted", ""], ["2026-10-17", "kept-mine", "race"]], "unknown reasons are dropped");
    assert.deepEqual(c.approved.days.map(d => d.date), ["2026-10-13"]);
    const s = cycleSummary(c);
    assert.equal(s.state, "in a draft");
    assert.deepEqual([s.accepted, s.kept], [1, 1]);
    assert.deepEqual(s.reasons, ["race or event"]);
    // "Other" keeps its words.
    const o = withApproval(c, { proposalId: p.proposalId, taken: new Set(), reasons: { "2026-10-13": { key: "other", words: "Sam asked to keep it" } }, planRef: { store: "self", logId: "p1" } });
    assert.equal(o.review.find(r => r.date === "2026-10-13").words, "Sam asked to keep it");
    assert.equal(o.review.length, 2, "approving the same answer again replaces its review, it doesn't add to it");
});

test("published: what actually went out on the approved days, and how many the coach edited after", () => {
    const read = readAnswer(ANSWER);
    let c = withContext(newCycle({ coachUid: "coach", athleteUid: "sam", from: "2026-10-12", to: "2026-10-18" }), CONTEXT);
    const p = withProposal(c, read, { text: ANSWER });
    c = withApproval(p.cycle, { proposalId: p.proposalId, taken: new Set(["2026-10-13", "2026-10-17"]), planRef: { store: "coachingPlans", planId: "plan1", draft: true } });
    const applied = applyReply(PLAN, read.days);
    applied.weeks[0].days[5].miles = 13;   // the coach changed Saturday again in the editor
    const pub = withPublished(c, { planId: "plan1", version: 4, plan: applied, at: 3000 });
    assert.equal(pub.approved.published.version, 4);
    assert.equal(pub.approved.published.edited, 1);
    assert.equal(cycleSummary(pub).state, "published");
    assert.equal(withPublished(c, { planId: "other", version: 4, plan: applied }), c, "another plan's publish doesn't touch it");
    assert.equal(withPublished(pub, { planId: "plan1", version: 5, plan: applied }), pub, "only the first publish after approving counts");
});

test("Eddie's Undo keeps the record and says undone", () => {
    const p = withProposal(newCycle({ coachUid: "coach", athleteUid: "coach", from: "2026-10-12", to: "2026-10-18" }), readAnswer(ANSWER));
    const c = withApproval(p.cycle, { proposalId: p.proposalId, taken: new Set(["2026-10-13"]), planRef: { store: "self", logId: "pabc" } });
    assert.equal(cycleSummary(c).state, "applied");
    const u = withUndo(c, { at: 5 });
    assert.equal(u.status, "undone");
    assert.equal(u.approved.undoneAt, 5);
    assert.equal(u.approved.days.length, 1);
});

test("stored as capped JSON strings; reads back the same; the newest 3 answers kept", () => {
    let c = withContext(newCycle({ coachUid: "coach", athleteUid: "sam", from: "2026-10-12", to: "2026-10-18" }), CONTEXT);
    for (let i = 0; i < 5; i++) c = withProposal(c, readAnswer(ANSWER), { text: ANSWER, at: 1000 + i }).cycle;
    assert.equal(c.proposals.length, 3);
    const doc = toDoc(c);
    for (const [k, cap] of Object.entries(CAPS)) assert.ok(typeof doc[k] === "string" && doc[k].length <= cap, k);
    assert.deepEqual(Object.keys(doc).sort(), ["approved", "athleteUid", "coachUid", "context", "contextHash", "outcome", "proposals", "review", "status", "version", "weekOf", "weekTo"]);
    const back = fromDoc(c.id, doc);
    assert.deepEqual(back.proposals, c.proposals);
    assert.deepEqual(back.context, c.context);
    assert.equal(back.approved, null);
    // A huge answer and a huge context still fit.
    const big = withProposal(c, readAnswer(ANSWER), { text: "x".repeat(50000) }).cycle;
    assert.ok(toDoc(big).proposals.length <= CAPS.proposals);
    const huge = { ...CONTEXT, sections: [{ ...CONTEXT.sections[0], facts: Array.from({ length: 400 }, () => ({ ...CONTEXT.sections[0].facts[0], basis: ["b".repeat(200)] })) }] };
    const hc = withContext(c, huge);
    assert.ok(toDoc(hc).context.length > 0 && toDoc(hc).context.length <= CAPS.context, "basis lines go first, so the facts stay");
    assert.equal(REASONS.length, 7);
});
