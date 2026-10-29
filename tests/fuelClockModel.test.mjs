// Unit tests for the Fuel Clock strip on the Fueling page (js/fuelClockModel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule } from "../js/fuelSchedule.js";
import { clockItems, clockState, countdownText, atText, itemLabel, freshState, dayKey, marathonDayFor, weekHasWorkouts } from "../js/fuelClockModel.js";

const marathon = buildSchedule({
    durationMin: 185,
    distanceMi: 26.2,
    items: [
        { name: "Hammer Gel", carbs: 22, sodium: 60, qty: 4 },
        { name: "Caffeine Gel", carbs: 25, sodium: 60, caffeine: true, qty: 2 }
    ],
    drink: { bottleCount: 3, bottleSize: 20, carbs: 120, sodium: 900, carbSource: "table-sugar", sodiumSource: "table-salt" },
    targets: { carbsPerHour: 75, fluidPerHour: 22, sodiumPerHour: 500 },
    firstGelMin: 30
});

test("the items are the plan's own gels and bottles, in time order, with the plan's amounts", () => {
    const items = clockItems(marathon);
    assert.equal(items.filter(i => i.kind === "gel").length, 6);
    assert.equal(items.filter(i => i.kind === "bottle").length, 3);
    assert.deepEqual(items.map(i => i.at), [...items.map(i => i.at)].sort((a, b) => a - b));
    assert.equal(items[0].id, "g1", "the first gel comes first; bottles are due when they should be empty");
    const b1 = items.find(i => i.id === "b1");
    assert.equal(b1.from, 0);
    assert.equal(b1.at, marathon.bottles[0].endMin);
    assert.equal(items.find(i => i.id === "g1").carbs, 22);
    assert.equal(items.find(i => i.id === "g6").name, "Caffeine Gel", "caffeine goes last, as the schedule says");
    assert.equal(items.reduce((s, i) => s + i.carbs, 0), marathon.totals.carbs);
    assert.equal(items.reduce((s, i) => s + i.fluid, 0), marathon.totals.fluid);
});

test("no plan, or a plan with nothing to take, gives nothing to show", () => {
    assert.deepEqual(clockItems(null), []);
    const none = buildSchedule({ durationMin: 60, distanceMi: 7, items: [], drink: null, targets: {}, firstGelMin: 30 });
    assert.deepEqual(clockItems(none), []);
    const s = clockState([]);
    assert.equal(s.next, null);
    assert.equal(s.allDone, false, "an empty plan is not a finished one");
    assert.equal(s.fill, 0);
});

test("next is the first thing not taken; the fill rises with carbs taken; fluid left falls with bottles", () => {
    const items = clockItems(marathon);
    const start = clockState(items);
    assert.equal(start.next.id, "g1");
    assert.equal(start.fill, 0);
    assert.equal(start.fluidLeft, 60);
    assert.equal(start.dueInSec, null, "no countdown before the clock starts");

    const after = clockState(items, { done: ["g1", "b1"], elapsedSec: 20 * 60 });
    assert.equal(after.next.id, items.find(i => !["g1", "b1"].includes(i.id)).id);
    assert.equal(after.carbsTaken, 40 + 22);
    assert.equal(after.fluidLeft, 40);
    assert.ok(after.fill > 0 && after.fill < 1);
    assert.equal(after.dueInSec, after.next.at * 60 - 20 * 60);

    const all = clockState(items, { done: items.map(i => i.id) });
    assert.equal(all.allDone, true);
    assert.equal(all.fill, 1);
    assert.equal(all.fluidLeft, 0);
});

test("a late item is overdue, not a negative countdown", () => {
    const items = clockItems(marathon);
    const s = clockState(items, { done: [], elapsedSec: 90 * 60 });
    assert.equal(s.overdue, true);
    assert.equal(countdownText(s.dueInSec), "0:00");
});

test("a water-only plan fills by fluid", () => {
    const water = buildSchedule({ durationMin: 60, distanceMi: 7, items: [], drink: { bottleCount: 1, bottleSize: 16, carbs: 0, sodium: 0 }, targets: {}, firstGelMin: 30 });
    const items = clockItems(water);
    assert.equal(clockState(items, { done: ["b1"] }).fill, 1);
});

test("words and times", () => {
    assert.equal(countdownText(754), "12:34");
    assert.equal(countdownText(3725), "1:02:05");
    assert.equal(countdownText(-5), "0:00");
    assert.equal(atText(0), "at the start");
    assert.equal(atText(30), "30 min in");
    assert.equal(atText(95), "1 h 35 min in");
    assert.equal(atText(120), "2 h in");
    assert.equal(itemLabel({ kind: "gel", n: 2, name: "Maurten 100" }), "Gel 2 · Maurten 100");
    assert.equal(itemLabel({ kind: "bottle", n: 1, name: "Bottle 1" }), "Finish bottle 1");
    assert.equal(itemLabel({ kind: "drink", n: 1, name: "Tailwind" }), "Finish Tailwind");
    assert.ok(![countdownText(10), atText(10)].some(t => / -- /.test(t)));
});

test("saved marks only count for the same plan on the same day", () => {
    const saved = { planKey: "p1", day: "2026-10-29", startedAt: 1000, done: ["g1", 4] };
    assert.deepEqual(freshState(saved, "p1", "2026-10-29"), { planKey: "p1", day: "2026-10-29", startedAt: 1000, done: ["g1"] });
    assert.deepEqual(freshState(saved, "p2", "2026-10-29").done, []);
    assert.equal(freshState(saved, "p1", "2026-10-30").startedAt, null);
    assert.deepEqual(freshState(null, "p1", "2026-10-29").done, []);
    assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("today's marathon day comes from the plan's own week starts; a week of rest is a gap", () => {
    const weekStart = w => new Date(2026, 6, 20 + (w - 1) * 7);   // Mondays
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    assert.deepEqual(marathonDayFor(new Date(2026, 6, 29, 8), { weeks: 3, weekStart, days }), { week: 2, dayKey: "Wed", index: 2 });
    assert.equal(marathonDayFor(new Date(2026, 9, 1), { weeks: 3, weekStart, days }), null, "after the plan, no day");
    assert.equal(weekHasWorkouts([{ miles: 0 }, { miles: 0 }]), false);
    assert.equal(weekHasWorkouts([]), false);
    assert.equal(weekHasWorkouts([{ miles: 0 }, { miles: 5 }]), true);
});
