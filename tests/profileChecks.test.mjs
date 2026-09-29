// Unit tests for keeping the client profile current (js/profileChecks.js).
// Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    profileChecks, pickCheck, afterAnswer, nextConfirmedAt, recentPain, confirmedMs, ageDays, toMs,
    TRACKED, MAX_AGE_DAYS, DAY_MS, WEEK_MS, ASKS, openAsks, asksSettledBy, answerFreshness, staleSummary, ageText
} from "../js/profileChecks.js";
import { NONE_EVENT, NONE_INJURIES } from "../js/intakeFlow.js";
import { META_KEYS } from "../js/clientRecordSchema.js";
import { readFileSync } from "node:fs";

const TODAY = "2026-09-30";
const NOW = new Date(`${TODAY}T09:00:00`).getTime();
const daysAgo = n => NOW - n * DAY_MS;
const fresh = Object.fromEntries(TRACKED.map(k => [k, daysAgo(1)]));
const RUNNER = {
    primarySport: "running", primaryGoal: "Break 1:48 in the half", targetEvent: "Indy Half", targetDate: "2027-04-10",
    availabilityDays: ["tue", "thu", "sat", "sun"], weeklyMileage: 20, strengthExperience: "some", injuries: NONE_INJURIES,
    updatedAt: daysAgo(1), confirmedAt: fresh
};
const ids = checks => checks.map(c => c.id);
const ctx = extra => ({ today: TODAY, now: NOW, ...extra });

test("nothing to ask about a fresh, complete profile, or an unfinished one", () => {
    assert.deepEqual(profileChecks(RUNNER, ctx()), []);
    assert.deepEqual(profileChecks({ ...RUNNER, injuries: "" }, ctx()), [], "the 'finish your profile' prompt covers that");
    assert.deepEqual(profileChecks(null, ctx()), []);
});

test("each answer goes stale on its own clock", () => {
    const aged = (key, days) => ({ ...RUNNER, confirmedAt: { ...fresh, [key]: daysAgo(days) } });
    assert.deepEqual(ids(profileChecks(aged("weeklyMileage", 27), ctx())), []);
    assert.deepEqual(ids(profileChecks(aged("weeklyMileage", 28), ctx())), ["miles"]);
    assert.deepEqual(ids(profileChecks(aged("availabilityDays", 55), ctx())), []);
    assert.deepEqual(ids(profileChecks(aged("availabilityDays", 56), ctx())), ["days"]);
    assert.deepEqual(ids(profileChecks(aged("primaryGoal", 84), ctx())), ["goal"]);
    assert.deepEqual(ids(profileChecks(aged("strengthExperience", 182), ctx())), ["strength"]);
    assert.deepEqual(ids(profileChecks(aged("injuries", 60), ctx())), [], "'None right now' isn't re-asked on a clock");
    const sore = { ...RUNNER, injuries: "Sore left knee", confirmedAt: { ...fresh, injuries: daysAgo(29) } };
    assert.deepEqual(ids(profileChecks(sore, ctx())), ["limits"]);
    assert.equal(MAX_AGE_DAYS.weeklyMileage, 28);
});

test("older records without confirmation times use when the profile was saved", () => {
    const old = { ...RUNNER, confirmedAt: undefined, updatedAt: { seconds: daysAgo(100) / 1000 } };
    assert.deepEqual(ids(profileChecks(old, ctx())), ["miles", "days", "goal"]);
    assert.equal(confirmedMs({ intakeCompletedAt: 5 }, "injuries"), 5);
    assert.equal(ageDays({}, "injuries", NOW), Infinity);
    assert.equal(toMs({ toMillis: () => 42 }), 42);
});

test("runners get miles questions; soccer players don't", () => {
    const soccer = { ...RUNNER, primarySport: "soccer", weeklyMileage: null, confirmedAt: { ...fresh, weeklyMileage: daysAgo(90) } };
    assert.deepEqual(ids(profileChecks(soccer, ctx())), []);
});

test("miles: when COROS disagrees, offer its number first", () => {
    const aged = { ...RUNNER, confirmedAt: { ...fresh, weeklyMileage: daysAgo(40) } };
    let [check] = profileChecks(aged, ctx({ suggestion: { miles: 28, source: "COROS" } }));
    assert.match(check.detail, /COROS says about 28 mi/);
    assert.deepEqual(check.actions[0], { label: "Use 28 mi", act: "set", values: { weeklyMileage: 28 }, primary: true });
    [check] = profileChecks(aged, ctx({ suggestion: { miles: 22, source: "COROS" } }));
    assert.equal(check.actions[0].act, "confirm", "close enough: just 'still right?'");
    assert.equal(check.title, "Still running about 20 mi a week?");
});

test("a passed race date asks how it went and what's next", () => {
    const raced = { ...RUNNER, targetDate: "2026-09-27" };
    const [check] = profileChecks(raced, ctx());
    assert.equal(check.id, "race:2026-09-27");
    assert.equal(check.title, "How did Indy Half go?");
    assert.deepEqual(check.actions.map(a => a.act), ["ask", "set"]);
    assert.deepEqual(check.actions[0].steps, ["goal", "event"]);
    assert.deepEqual(check.actions[1].values, { targetEvent: NONE_EVENT, targetDate: "" });
    assert.deepEqual(ids(profileChecks({ ...raced, confirmedAt: { ...fresh, primaryGoal: daysAgo(100) } }, ctx())), ["race:2026-09-27"], "no separate goal question on top");
    assert.equal(profileChecks({ ...raced, targetEvent: NONE_EVENT }, ctx())[0].title, "How did your event go?");
});

test("pain logged since the limits were confirmed", () => {
    const pain = recentPain({
        results: [{ date: "2026-09-28", pain: true, painNote: "Left knee on the downhills", title: "Long run" }, { date: "2026-09-20", pain: false }],
        checkins: [{ weekOf: "2026-09-21", pain: true, painNote: "calf" }, { weekOf: "2026-08-01", pain: true }]
    }, TODAY);
    assert.deepEqual(pain.map(p => p.date), ["2026-09-28", "2026-09-21"]);
    let [check] = profileChecks({ ...RUNNER, confirmedAt: { ...fresh, injuries: daysAgo(5) } }, ctx({ pain }));
    assert.equal(check.id, "pain:2026-09-28");
    assert.match(check.title, /your Long run/);
    assert.match(check.detail, /Left knee on the downhills/);
    assert.deepEqual(check.actions.map(a => a.label), ["Add it", "It's gone now"]);
    // Already confirmed after that log: no question.
    assert.deepEqual(profileChecks({ ...RUNNER, confirmedAt: { ...fresh, injuries: NOW } }, ctx({ pain })), []);
    // With a real injury on file it asks if the note is still right, and the stale-limits question steps aside.
    [check] = profileChecks({ ...RUNNER, injuries: "Sore knee", confirmedAt: { ...fresh, injuries: daysAgo(40) } }, ctx({ pain }));
    assert.deepEqual(check.actions.map(a => a.label), ["Update it", "Still the same", "It's gone now"]);
    assert.deepEqual(ids(profileChecks({ ...RUNNER, injuries: "Sore knee", confirmedAt: { ...fresh, injuries: daysAgo(40) } }, ctx({ pain }))), ["pain:2026-09-28"]);
});

test("a parent's questions talk about their child", () => {
    const [check] = profileChecks({ ...RUNNER, whoTrains: "child", targetDate: "2026-09-20" }, ctx());
    assert.match(check.detail, /their next goal/);
});

test("one routine question a week; race and pain any time; 'Not now' hides one for a week", () => {
    const miles = { id: "miles", kind: "miles" }, days = { id: "days", kind: "days" }, race = { id: "race:x", kind: "race" };
    assert.equal(pickCheck([miles, days], {}, NOW), miles);
    const answered = afterAnswer({}, miles, NOW);
    assert.equal(pickCheck([days], answered, NOW + DAY_MS), null, "not two in a week");
    assert.equal(pickCheck([days], answered, NOW + WEEK_MS), days);
    assert.equal(pickCheck([race, days], answered, NOW + DAY_MS), race, "urgent ones don't wait");
    assert.equal(pickCheck([days], answered, NOW + DAY_MS, { anyTime: true }), days, "the weekly check-in can always ask");
    const snoozed = afterAnswer({}, days, NOW, { snooze: true });
    assert.equal(pickCheck([days, miles], snoozed, NOW + WEEK_MS - 1, { anyTime: true }), miles);
    assert.equal(pickCheck([days], snoozed, NOW + WEEK_MS + 1), days);
    assert.deepEqual(Object.keys(afterAnswer(snoozed, null, NOW + 2 * WEEK_MS).snoozed), [], "old snoozes are dropped");
});

test("saving stamps what they confirmed and what changed, nothing else", () => {
    const before = { weeklyMileage: 20, injuries: NONE_INJURIES, primaryGoal: "A" };
    const after = { weeklyMileage: 24, injuries: NONE_INJURIES, primaryGoal: "A", availabilityDays: [] };
    const out = nextConfirmedAt({ primaryGoal: 1 }, before, after, [], NOW);
    assert.deepEqual(out, { primaryGoal: 1, weeklyMileage: NOW });
    assert.deepEqual(nextConfirmedAt({}, before, after, ["injuries"], NOW), { weeklyMileage: NOW, injuries: NOW });
    assert.deepEqual(nextConfirmedAt(undefined, null, {}, [], NOW), {}, "empty answers aren't confirmations");
});

test("the tracked answers match firestore.rules and the stored keys", () => {
    const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
    const listed = rules.match(/m\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/)[1].match(/"([a-zA-Z]+)"/g).map(s => s.slice(1, -1));
    assert.deepEqual([...listed].sort(), [...TRACKED].sort());
    assert.ok(META_KEYS.includes("confirmedAt"));
});

test("the coach's asks: open until any of their answers is confirmed after the ask", () => {
    const rec = { ...RUNNER, askedAt: { level: daysAgo(2), limits: daysAgo(3), days: daysAgo(5) },
        confirmedAt: { ...fresh, injuries: daysAgo(10), weeklyMileage: daysAgo(10), strengthExperience: daysAgo(10), availabilityDays: daysAgo(1) } };
    assert.deepEqual(openAsks(rec).map(a => a.id), ["limits", "level"], "days was confirmed after it was asked; oldest first");
    assert.deepEqual(asksSettledBy(rec, ["weeklyMileage"]), ["level"]);
    assert.deepEqual(asksSettledBy(rec, ["primaryGoal"]), []);
    const [check] = profileChecks(rec, ctx());
    assert.equal(check.kind, "ask");
    assert.equal(check.title, "Your coach asked you to check your injuries and limits and starting point");
    assert.deepEqual(check.actions[0].steps, ["limits", "level"]);
    assert.deepEqual(check.actions[1].keys, ["injuries", "weeklyMileage", "strengthExperience"]);
    assert.equal(pickCheck([check], afterAnswer({}, { id: "x", kind: "days" }, NOW), NOW + DAY_MS), check, "asks don't wait for the weekly slot");
    assert.equal(afterAnswer({}, check, NOW, { snooze: true }).snoozed[check.id], NOW + DAY_MS, "'Not now' on an ask: a day");
    assert.deepEqual(ASKS.flatMap(a => a.keys).filter(k => !TRACKED.includes(k)), [], "every ask is about tracked answers");
    assert.equal(profileChecks({ ...RUNNER, whoTrains: "child", askedAt: { goal: daysAgo(1) }, confirmedAt: { ...fresh, primaryGoal: daysAgo(3), targetEvent: daysAgo(3) } }, ctx())[0].title,
        "Your coach asked you to check their goal");
});

test("the coach's view: how current each answer is", () => {
    const rec = { ...RUNNER, targetDate: "2026-09-01", confirmedAt: { ...fresh, weeklyMileage: daysAgo(42) } };
    const fresh1 = answerFreshness(rec, NOW, TODAY);
    assert.deepEqual(fresh1.map(f => f.key), TRACKED);
    assert.deepEqual(fresh1.filter(f => f.stale).map(f => [f.key, f.reason]), [["targetEvent", "the date has passed"], ["weeklyMileage", "may be out of date"]]);
    assert.deepEqual(staleSummary(rec, NOW, TODAY), ["target event (the date has passed)", "miles per week (confirmed 6 weeks ago)"]);
    assert.ok(!answerFreshness({ ...rec, primarySport: "soccer" }, NOW, TODAY).some(f => f.key === "weeklyMileage"), "no miles row for soccer");
    assert.ok(!answerFreshness({ ...rec, injuries: NONE_INJURIES, confirmedAt: { ...fresh, injuries: daysAgo(300) } }, NOW, TODAY).find(f => f.key === "injuries").stale);
    assert.deepEqual([0, 1, 5, 20, 90, Infinity].map(ageText), ["today", "yesterday", "5 days ago", "3 weeks ago", "3 months ago", "never"]);
});

test("unfinished profiles: the coach can still ask, and sees what's missing", () => {
    const old = { primarySport: "running", primaryGoal: "Get faster", updatedAt: daysAgo(30) };   // the old form: goal + sport
    const rows = answerFreshness(old, NOW, TODAY);
    assert.deepEqual(rows.filter(f => f.missing).map(f => f.key), ["targetEvent", "availabilityDays", "weeklyMileage", "strengthExperience", "injuries"]);
    assert.deepEqual(staleSummary(old, NOW, TODAY), [], "missing isn't 'out of date'");
    assert.deepEqual(profileChecks(old, ctx()), [], "no routine questions until the essentials are done");
    const asked = { ...old, askedAt: { days: daysAgo(1), limits: daysAgo(1) } };
    const [check] = profileChecks(asked, ctx());
    assert.equal(check.title, "Your coach asked you to fill in your training days and injuries and limits");
    assert.deepEqual(check.actions.map(a => a.label), ["Fill it in"], "nothing to confirm on blank answers");
    const blankRecord = { askedAt: { goal: daysAgo(1) } };                  // a profile the coach's ask created
    assert.equal(profileChecks(blankRecord, ctx())[0].title, "Your coach asked you to fill in your goal");
    assert.deepEqual(profileChecks({ ...old, askedAt: { goal: daysAgo(1) } }, ctx())[0].actions.map(a => a.label), ["Update now", "It's all still right"]);
});
