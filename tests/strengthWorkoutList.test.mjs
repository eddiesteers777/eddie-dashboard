import test from "node:test";
import assert from "node:assert/strict";
import { workoutCards, removeWorkout, restoreWorkout, dayWords } from "../js/strengthWorkoutList.js";

const set = (w, r) => ({ id: `s${w}${r}`, weight: w, reps: r });
const days = [
    { id: "a", name: "Leg Day", estimatedMinutes: 50, exercises: [
        { id: "e1", name: "Back Squat", sets: [set(185, 5), set(185, 5), set(185, 5)] },
        { id: "e2", name: "Romanian Deadlift", sets: [set(135, 8), set(135, 8)] },
        { id: "e3", name: "Walking Lunge", sets: [set(0, 10)] },
        { id: "e4", name: "Calf Raise", sets: [set(0, 15)] },
        { id: "e5", name: "Plank", mode: "time", sets: [{ id: "p", duration: 45 }] }
    ] },
    { id: "b", name: "  ", exercises: [] }
];

test("each card says what's in the workout, when it was done and what's next", () => {
    const sessions = [
        { id: "1", type: "strength", date: "2026-10-02", strength: { dayId: "a" } },
        { id: "2", type: "strength", date: "2026-10-09", strength: { dayId: "a" } },
        { id: "3", deleted: true, type: "strength", date: "2026-10-10", strength: { dayId: "a" } },
        { id: "4", type: "run", date: "2026-10-10", strength: { dayId: "a" } }
    ];
    const schedule = [
        { id: "x", workoutId: "plan-a", date: "2026-10-08", completed: false },
        { id: "y", workoutId: "plan-a", date: "2026-10-15", completed: false },
        { id: "z", workoutId: "plan-a", date: "2026-10-13", completed: true },
        { id: "w", workoutId: "plan-a", date: "2026-10-14", completed: false }
    ];
    const [leg, empty] = workoutCards(days, { sessions, schedule, today: "2026-10-11" });
    assert.equal(leg.name, "Leg Day");
    assert.equal(leg.exercises, 5);
    assert.equal(leg.sets, 8);
    assert.equal(leg.minutes, 50);
    assert.deepEqual(leg.preview, ["Back Squat", "Romanian Deadlift", "Walking Lunge"]);
    assert.equal(leg.more, 2);
    assert.equal(leg.lastDone, "2026-10-09");   // the deleted and the run don't count
    assert.equal(leg.timesDone, 2);
    assert.equal(leg.next, "2026-10-14");       // not the past one, not the done one
    assert.equal(empty.name, "My Workout");
    assert.equal(empty.exercises, 0);
    assert.equal(empty.minutes, 0);
    assert.equal(empty.lastDone, null);
    assert.equal(empty.next, null);
});

test("deleting drops the workout and its days to come; Undo puts both back exactly", () => {
    const items = [
        { id: "p1", workoutId: "plan-a", date: "2026-10-01", completed: false },
        { id: "o1", workoutId: "plan-b", date: "2026-10-12", completed: false },
        { id: "f1", workoutId: "plan-a", date: "2026-10-11", completed: false },
        { id: "d1", workoutId: "plan-a", date: "2026-10-12", completed: true },
        { id: "f2", workoutId: "plan-a", date: "2026-10-20", completed: false },
        { id: "l1", workoutId: "lib-x", date: "2026-10-20", completed: false }
    ];
    const r = removeWorkout(days, items, "a", "2026-10-11");
    assert.deepEqual(r.days.map(d => d.id), ["b"]);
    assert.equal(r.day.name, "Leg Day");
    assert.equal(r.index, 0);
    assert.deepEqual(r.items.map(i => i.id), ["p1", "o1", "d1", "l1"]);   // past and done stay as history
    assert.deepEqual(r.removedItems.map(x => x.item.id), ["f1", "f2"]);

    const back = restoreWorkout(r.days, r.items, r);
    assert.deepEqual(back.days.map(d => d.id), ["a", "b"]);
    assert.deepEqual(back.items.map(i => i.id), items.map(i => i.id));
    // Twice is harmless.
    const again = restoreWorkout(back.days, back.items, r);
    assert.deepEqual(again.days.map(d => d.id), ["a", "b"]);
    assert.equal(again.items.length, items.length);
    // An unknown id changes nothing.
    const none = removeWorkout(days, items, "zzz", "2026-10-11");
    assert.equal(none.days.length, 2);
    assert.equal(none.items.length, items.length);
    assert.equal(none.day, null);
});

test("dates read like a person would say them", () => {
    assert.equal(dayWords("2026-10-11", "2026-10-11"), "Today");
    assert.equal(dayWords("2026-10-10", "2026-10-11"), "Yesterday");
    assert.equal(dayWords("2026-10-12", "2026-10-11"), "Tomorrow");
    assert.equal(dayWords("2026-10-13", "2026-10-11"), "Tue, Oct 13");
    assert.equal(dayWords("2025-12-30", "2026-10-11"), "Dec 30, 2025");
    assert.equal(dayWords("", "2026-10-11"), "");
});
