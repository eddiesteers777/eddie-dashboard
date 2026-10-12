// Changing your own week: move, skip, "Not feeling 100%" (js/weekChanges.js)
// and the writes behind them (js/weekChangeData.js) on a stand-in localStorage.
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
};
globalThis.window = globalThis.window || { dispatchEvent() {} };

const { buildDay, buildWeek } = await import("../js/weekModel.js");
const W = await import("../js/weekChanges.js");
const D = await import("../js/weekChangeData.js");

const MON = "2026-10-12";
const TODAY = "2026-10-14"; // Wednesday
const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${String(12 + i).padStart(2, "0")}`);

function selfPlan(id = "rp1", overrides = {}) {
    const days = [
        { type: "easy", miles: 4, completed: true },
        { type: "workout", miles: 6, session: "6 x 800" },
        { type: "rest", miles: 0 },
        { type: "easy", miles: 5 },
        { type: "easy", miles: 3, skipped: true },
        { type: "long", miles: 10 },
        { type: "recovery", miles: 3 }
    ].map((d, i) => ({ date: dates[i], ...d, ...(overrides[i] || {}) }));
    return { id, name: "Fall 10K", status: "active", generatedPlan: { weeks: [{ week: 1, startDate: MON, days, supplemental: [{ day: "THU", type: "strength", session: "Core 20" }] }] } };
}

function coachPlan() {
    const days = dates.map(date => ({ date, type: "rest", miles: 0 }));
    days[3] = { date: dates[3], type: "workout", miles: 7, session: "Tempo" };
    days[4] = { date: dates[4], type: "strength", miles: 0, strength: { title: "Lift A", exercises: [{ name: "Squat", sets: 3, reps: 5 }] } };
    return { id: "coach-c1", coachPlanId: "c1", coachUid: "coach", coachName: "Eddie Steers", coachVersion: 2, name: "Coach plan", status: "active", source: "coach", generatedPlan: { weeks: [{ week: 1, startDate: MON, days }] } };
}

function seed({ running = [selfPlan()], training = [], schedule = [], coach = [] } = {}) {
    store.clear();
    store.set("running-programs", JSON.stringify(running));
    store.set("training-programs", JSON.stringify(training));
    store.set("strength-schedule", JSON.stringify({ version: 1, items: schedule }));
    store.set("coach-plans", JSON.stringify(coach));
}

const inputsFromStore = () => ({
    plans: [
        ...JSON.parse(store.get("coach-plans")).map(p => ({ ...p, source: "coach" })),
        ...JSON.parse(store.get("running-programs")).map(p => ({ ...p, source: "race-plan" })),
        ...JSON.parse(store.get("training-programs")).map(p => ({ ...p, source: "training-plan" }))
    ],
    strength: JSON.parse(store.get("strength-schedule")).items,
    sessions: [{ date: dates[3], startTime: "17:00", title: "Soccer" }],
    runLog: []
});
const weekNow = () => buildWeek(MON, inputsFromStore(), TODAY);
const itemOn = (week, date, pred = () => true) => week.days.find(d => d.date === date).items.find(pred);

test("who can change what", () => {
    seed({ schedule: [{ id: "s1", date: dates[3], workoutName: "Upper A" }], coach: [coachPlan()] });
    const week = weekNow();
    const selfRun = itemOn(week, dates[1], i => i.kind === "run" && !i.fromCoach);
    const coachRun = itemOn(week, dates[3], i => i.kind === "run" && i.fromCoach);
    const scheduled = itemOn(week, dates[3], i => i.source.type === "strength");
    const session = itemOn(week, dates[3], i => i.kind === "session");
    const extra = itemOn(week, dates[3], i => i.source.type === "extra");
    assert.equal(W.changeMode(selfRun), "self");
    assert.equal(W.changeMode(coachRun), "coach");
    assert.equal(W.changeMode(scheduled), "self");
    assert.equal(W.changeMode(extra), "self");
    assert.equal(W.changeMode(session), null);
    assert.equal(W.changeMode({ kind: "run", source: { type: "log" } }), null);
    assert.equal(W.changeMode({ kind: "cross", source: { type: "plan" } }), null);
    assert.deepEqual(W.itemActions(selfRun), ["move", "skip"]);
    assert.deepEqual(W.itemActions(itemOn(week, dates[0], i => i.kind === "run")), [], "done: nothing");
    assert.deepEqual(W.itemActions(itemOn(week, dates[4], i => !i.fromCoach && i.kind === "run")), ["unskip"]);
    assert.deepEqual(W.itemActions({ ...coachRun, state: "skipped" }), [], "a coach skip is a log: edit it there");
    assert.deepEqual(W.itemActions({ ...coachRun, source: { ...coachRun.source, type: "extra" } }), ["move"]);
    assert.deepEqual(W.itemActions({ ...selfRun, adjusted: "10 mi Long run" }), ["move", "skip", "restore"]);
});

test("move targets: today on, swaps, blocked days", () => {
    seed();
    const week = weekNow();
    const tue = itemOn(week, dates[1], i => i.kind === "run");
    const targets = W.moveTargets(week, tue, TODAY);
    assert.deepEqual(targets.map(t => t.date), dates.slice(2), "Wed to Sun, not Tue or Mon");
    assert.equal(targets[0].there, "Rest");
    assert.equal(targets[0].swap, "");
    assert.match(targets[1].blocked, /can only go to a free day/, "a missed workout won't push Thu's run back onto Tue");
    assert.match(targets[2].blocked, /skipped/, "Fri's skipped run blocks a swap there");
    // From today on, a busy day swaps.
    const sat = itemOn(week, dates[5], i => i.kind === "run");
    const satTargets = W.moveTargets(week, sat, TODAY);
    assert.equal(satTargets.find(t => t.date === dates[3]).swap, "5 mi Easy run");
    assert.equal(W.moveTargets({ days: week.days.slice(0, 2) }, tue, TODAY).length, 0);
});

test("move warnings: two hard days in a row", () => {
    seed();
    const week = weekNow();
    const tue = itemOn(week, dates[1], i => i.kind === "run");
    assert.equal(W.moveWarnings(week, tue, dates[2]).length, 0);
    const friday = W.moveWarnings(week, tue, dates[4]);
    assert.equal(friday.length, 1);
    assert.match(friday[0], /next to Sat's 10 mi long run/);
    // The long run moving next to nothing hard: fine.
    const sat = itemOn(week, dates[5], i => i.kind === "run");
    assert.equal(W.moveWarnings(week, sat, dates[6]).length, 0);
});

test("what a run becomes when you're not feeling 100%", () => {
    const run = (dayType, miles) => ({ kind: "run", dayType, miles, title: "x" });
    assert.deepEqual(W.adjustRun(run("long", 10), "easy"), { action: "easy", miles: 7.5, after: "7.5 mi Easy run" });
    assert.deepEqual(W.adjustRun(run("workout", 6), "easy"), { action: "easy", miles: 6, after: "6 mi Easy run" });
    assert.equal(W.adjustRun(run("easy", 5), "easy"), null, "already easy");
    assert.equal(W.adjustRun(run("easy", 5), "shorter").miles, 3);
    assert.equal(W.adjustRun(run("easy", 3), "shorter").miles, 2);
    assert.equal(W.adjustRun(run("easy", 2), "shorter"), null, "2 mi stays 2 mi");
    assert.equal(W.adjustRun(run("easy", 1.5), "shorter"), null, "never longer than it was");
    assert.equal(W.adjustRun(run("long", 3), "easy").miles, 2.5);
    assert.equal(W.adjustRun(run("race", 6.2), "rest").action, "keep", "race day is never changed");
    assert.equal(W.adjustRun(run("easy", 4), "rest").action, "skip");
    assert.equal(W.adjustRun({ kind: "strength" }, "rest"), null);
});

test("feel changes over the next days, self and coach apart", () => {
    seed({ schedule: [{ id: "s1", date: dates[3], workoutName: "Upper A" }], coach: [coachPlan()] });
    const inputs = inputsFromStore();
    const days = [dates[2], dates[3], dates[4]].map(d => buildDay(d, inputs, TODAY));
    const keep = W.feelChanges(days, { mode: "easy", strength: "keep" });
    assert.deepEqual(keep.map(c => [c.date, c.mode, c.action]), [[dates[3], "coach", "easy"]], "Thu's coach tempo; Thu's easy run and Fri's skipped run untouched");
    const rest = W.feelChanges(days, { mode: "rest", strength: "skip" });
    const kinds = rest.map(c => `${c.date.slice(-2)} ${c.mode} ${c.kind} ${c.action}`).sort();
    assert.deepEqual(kinds, [
        "15 coach run skip", "15 self run skip", "15 self strength skip", "15 self strength skip",
        "16 coach strength skip"
    ].sort());
    const message = W.coachFeelMessage(rest, { from: dates[2], to: dates[4], mode: "rest" });
    assert.match(message, /^I'm not feeling 100% \(Wed, Oct 14 – Fri, Oct 16\)\. Could we switch to full rest\?/);
    assert.match(message, /Thu, Oct 15: 7 mi Workout → rest/);
    assert.ok(!/Upper A/.test(message), "only the coach's sessions go in the message");
    assert.ok(message.length <= 1000);
    assert.equal(W.coachMoveMessage({ kind: "run", miles: 7, title: "Workout", source: { date: dates[3] } }, dates[5]), "Could Thu's 7 mi workout move to Sat, Oct 17?");
    assert.equal(W.coachSkipNote("busy", "  work trip "), "Skipped: Too busy — work trip");
});

test("moving a plan run swaps days; a strength workout just moves; undo puts it back", async () => {
    seed({ schedule: [{ id: "s1", date: dates[3], workoutName: "Upper A", completed: false }] });
    const before = store.get("running-programs");
    let week = weekNow();
    const undo = await D.moveItem(itemOn(week, dates[1], i => i.kind === "run"), dates[3]);
    week = weekNow();
    assert.equal(itemOn(week, dates[3], i => i.kind === "run").title, "Workout");
    assert.equal(itemOn(week, dates[3], i => i.kind === "run").miles, 6);
    assert.equal(itemOn(week, dates[1], i => i.kind === "run").miles, 5, "Thu's easy run went to Tue");
    assert.ok(itemOn(week, dates[0], i => i.kind === "run").done, "Mon's done mark stays with Mon");
    await undo();
    assert.equal(store.get("running-programs"), before);

    const s = itemOn(weekNow(), dates[3], i => i.source.type === "strength");
    await D.moveItem(s, dates[6]);
    assert.equal(itemOn(weekNow(), dates[6], i => i.source.type === "strength").title, "Upper A");

    // An older Undo won't wipe a newer change.
    const undoOld = await D.moveItem(itemOn(weekNow(), dates[6], i => i.source.type === "strength"), dates[5]);
    await D.moveItem(itemOn(weekNow(), dates[5], i => i.source.type === "strength"), dates[4]);
    await assert.rejects(() => undoOld(), err => err.code === "stale-undo");
    assert.equal(itemOn(weekNow(), dates[4], i => i.source.type === "strength").title, "Upper A", "the newer move stays");

    const extra = itemOn(weekNow(), dates[3], i => i.source.type === "extra");
    await D.moveItem(extra, dates[5]);
    assert.equal(itemOn(weekNow(), dates[5], i => i.source.type === "extra").title, "Core 20");
});

test("skip with a reason, then undo skip", async () => {
    seed({ schedule: [{ id: "s1", date: dates[3], workoutName: "Upper A" }] });
    const run = itemOn(weekNow(), dates[3], i => i.kind === "run");
    const { undo } = await D.skipItem(run, { reason: "busy", note: "late meeting" });
    let skipped = itemOn(weekNow(), dates[3], i => i.kind === "run");
    assert.equal(skipped.state, "skipped");
    assert.equal(skipped.skipReason, "Too busy — late meeting");
    assert.deepEqual(W.itemActions(skipped), ["unskip"]);
    await D.unskipItem(skipped);
    assert.equal(itemOn(weekNow(), dates[3], i => i.kind === "run").state, "upcoming");
    await assert.rejects(() => undo(), err => err.code === "stale-undo", "the skip's Undo is out of date once it's been undone another way");

    const lift = itemOn(weekNow(), dates[3], i => i.source.type === "strength");
    await D.skipItem(lift, { reason: "sore" });
    skipped = itemOn(weekNow(), dates[3], i => i.source.type === "strength");
    assert.equal(skipped.state, "skipped");
    assert.equal(skipped.skipReason, "Sore or hurting");
});

test("not feeling 100%: eases runs, skips strength, two plans in one store, restore + undo", async () => {
    seed({ running: [selfPlan("rp1"), selfPlan("rp2", { 5: { type: "rest", miles: 0 }, 3: { type: "workout", miles: 8 } })], schedule: [{ id: "s1", date: dates[3], workoutName: "Upper A" }] });
    const inputs = inputsFromStore();
    const days = [dates[3], dates[4], dates[5]].map(d => buildDay(d, inputs, TODAY));
    const items = new Map(days.flatMap(d => d.items).map(i => [i.id, i]));
    const changes = W.feelChanges(days, { mode: "easy", strength: "skip" });
    const before = Object.fromEntries(["running-programs", "strength-schedule"].map(k => [k, store.get(k)]));
    const { undo, applied } = await D.applyFeelChanges(changes, items);
    assert.equal(applied, changes.length);
    const week = weekNow();
    const sat = itemOn(week, dates[5], i => i.kind === "run" && i.source.programId === "rp1");
    assert.equal(sat.miles, 7.5);
    assert.equal(sat.title, "Easy run");
    assert.equal(sat.adjusted, "10 mi Long run");
    const thu2 = itemOn(week, dates[3], i => i.kind === "run" && i.source.programId === "rp2");
    assert.equal(thu2.title, "Easy run", "the second plan in the same store changed too");
    assert.equal(itemOn(week, dates[3], i => i.source.type === "strength").state, "skipped");
    const plans = JSON.parse(store.get("running-programs"));
    assert.equal(plans[0].generatedPlan.weeks[0].plannedMiles, 4 + 6 + 5 + 3 + 7.5 + 3, "week total follows");

    await undo();
    for (const [k, v] of Object.entries(before)) assert.equal(store.get(k), v, `${k} exactly as before`);

    // Again, then put one day back by hand.
    await D.applyFeelChanges(changes, items);
    await D.restoreItem(itemOn(weekNow(), dates[5], i => i.kind === "run" && i.source.programId === "rp1"));
    const back = itemOn(weekNow(), dates[5], i => i.kind === "run" && i.source.programId === "rp1");
    assert.equal(back.title, "Long run");
    assert.equal(back.miles, 10);
    assert.equal(back.adjusted, "");
});

test("a coach plan's workout is never edited on the phone", async () => {
    seed({ coach: [coachPlan()] });
    const coachRun = itemOn(weekNow(), dates[3], i => i.fromCoach);
    await assert.rejects(() => D.moveItem(coachRun, dates[5]));
    const days = [buildDay(dates[3], inputsFromStore(), TODAY)];
    const changes = W.feelChanges(days, { mode: "rest" });
    const before = store.get("coach-plans");
    const { applied } = await D.applyFeelChanges(changes, new Map(days[0].items.map(i => [i.id, i])));
    assert.equal(applied, changes.filter(c => c.mode === "self").length, "only their own plan's run");
    assert.ok(changes.some(c => c.mode === "coach"));
    assert.equal(store.get("coach-plans"), before);
    assert.deepEqual(D.coachFor(coachRun), { coachUid: "coach", coachName: "Eddie Steers", coachPlanId: "c1", coachVersion: 2 });
});
