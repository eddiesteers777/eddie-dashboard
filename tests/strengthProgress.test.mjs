import { test } from "node:test";
import assert from "node:assert/strict";
import { e1rm, sessionsOf, withRecords, trendOf, exerciseProgress, allProgress, weeklyVolume, titleCase } from "../js/strengthProgress.js";

test("estimated 1-rep max (Epley) only for 1–12 reps with a weight", () => {
    assert.equal(e1rm(225, 1), 225);
    assert.equal(e1rm(200, 5), 233.3);
    assert.equal(e1rm(100, 15), null);
    assert.equal(e1rm(0, 10), null);
});

test("sessions: same-day logs join, warm-ups don't count, top set by e1RM", () => {
    const s = sessionsOf([
        { date: "2026-10-08", mode: "reps", sets: [{ weight: 135, reps: 10, type: "warmup" }, { weight: 225, reps: 5 }, { weight: 245, reps: 2 }] },
        { date: "2026-10-08", mode: "reps", sets: [{ weight: 185, reps: 8 }] },
        { date: "2026-10-01", mode: "reps", sets: [{ weight: 215, reps: 5 }] }
    ]);
    assert.equal(s.length, 2);
    assert.equal(s[0].date, "2026-10-01");
    assert.deepEqual(s[1].top, { weight: 225, reps: 5 }, "225×5 (262.5) beats 245×2 (261.3)");
    assert.equal(s[1].sets, 3, "the warm-up isn't a work set");
    assert.equal(s[1].volume, 225 * 5 + 245 * 2 + 185 * 8);
});

test("records against everything before; bodyweight counts reps; timed counts seconds", () => {
    const r = withRecords(sessionsOf([
        { date: "2026-09-01", mode: "reps", sets: [{ weight: 200, reps: 5 }] },
        { date: "2026-09-08", mode: "reps", sets: [{ weight: 205, reps: 5 }] },
        { date: "2026-09-15", mode: "reps", sets: [{ weight: 195, reps: 5 }] }
    ]));
    assert.deepEqual(r[0].pr, [], "the first session isn't a record");
    assert.ok(r[1].pr.includes("e1rm") && r[1].pr.includes("weight"));
    assert.deepEqual(r[2].pr, []);
    const bw = withRecords(sessionsOf([{ date: "2026-09-01", sets: [{ weight: 0, reps: 8 }] }, { date: "2026-09-03", sets: [{ weight: 0, reps: 11 }] }]));
    assert.deepEqual(bw[1].pr, ["reps"]);
    const t = withRecords(sessionsOf([{ date: "2026-09-01", mode: "time", sets: [{ duration: 45 }] }, { date: "2026-09-03", mode: "time", sets: [{ duration: 60 }] }]));
    assert.deepEqual(t[1].pr, ["longest"]);
});

test("trend: last 6 weeks' best against the 6 before", () => {
    const sessions = sessionsOf([
        { date: "2026-08-10", sets: [{ weight: 200, reps: 5 }] },
        { date: "2026-10-01", sets: [{ weight: 215, reps: 5 }] }
    ]);
    const t = trendOf(sessions, "2026-10-10");
    assert.equal(t.word, "up");
    assert.equal(t.pct, 7.5);
    assert.equal(trendOf(sessions.slice(1), "2026-10-10"), null, "nothing in the 6 weeks before");
});

test("exercise progress and the list, newest first, names kept", () => {
    const history = {
        "barbell squat": [{ date: "2026-10-05", name: "Barbell Squat", sets: [{ weight: 275, reps: 3 }] }, { date: "2026-09-20", sets: [{ weight: 265, reps: 3 }] }],
        "pull-up": [{ date: "2026-10-08", sets: [{ weight: 0, reps: 10 }] }],
        "plank": [{ date: "2026-09-01", mode: "time", sets: [{ duration: 60 }] }]
    };
    const all = allProgress(history, "2026-10-10");
    assert.deepEqual(all.map(x => x.name), ["Pull-Up", "Barbell Squat", "Plank"]);
    const sq = all[1];
    assert.equal(sq.count, 2);
    assert.equal(sq.best.e1rm.value, 302.5);
    assert.equal(sq.prCount, 1);
    assert.equal(all[0].bw, true);
    assert.equal(all[2].best.duration.value, 60);
    assert.equal(exerciseProgress("x", [], "2026-10-10"), null);
    assert.equal(titleCase("dumbbell row (single arm)"), "Dumbbell Row (Single Arm)");
});

test("weekly volume, Monday to Sunday", () => {
    const w = weeklyVolume({ a: [{ date: "2026-10-06", sets: [{ weight: 100, reps: 10 }] }, { date: "2026-10-04", sets: [{ weight: 100, reps: 5 }] }] }, "2026-10-10", 3);
    assert.deepEqual(w.map(x => x.start), ["2026-09-21", "2026-09-28", "2026-10-05"]);
    assert.deepEqual(w.map(x => x.volume), [0, 500, 1000]);
    assert.deepEqual(w.map(x => x.sessions), [0, 1, 1]);
});

import { historyFromResults } from "../js/strengthProgress.js";
test("a client's coach-plan strength logs read as lift history", () => {
    const h = historyFromResults([
        { kind: "strength", status: "completed", date: "2026-10-01", exercises: [{ name: "Goblet Squat", sets: [{ weight: 50, reps: 10 }, { weight: 0, reps: 0 }] }, { name: "Plank", sets: [] }] },
        { kind: "strength", status: "completed", date: "2026-10-08", exercises: [{ name: "goblet squat", sets: [{ weight: 55, reps: 10 }] }] },
        { kind: "strength", status: "skipped", date: "2026-10-05", exercises: [{ name: "Goblet Squat", sets: [{ weight: 99, reps: 9 }] }] },
        { status: "completed", date: "2026-10-02", distance: 5 }
    ]);
    assert.deepEqual(Object.keys(h), ["goblet squat"]);
    assert.deepEqual(h["goblet squat"].map(e => e.date), ["2026-10-08", "2026-10-01"]);
    assert.equal(h["goblet squat"][1].sets.length, 1, "an empty set is left out");
    const p = allProgress(h, "2026-10-10")[0];
    assert.equal(p.count, 2);
    assert.ok(p.sessions[1].pr.includes("e1rm"));
});

test("mergeHistories adds plan logs without doubling a day already logged", async () => {
    const { mergeHistories, allProgress } = await import("../js/strengthProgress.js");
    const own = { "back squat": [{ date: "2026-10-05", mode: "reps", name: "Back Squat", sets: [{ weight: 185, reps: 5 }] }] };
    const extra = {
        "back squat": [
            { date: "2026-10-05", mode: "reps", name: "Back Squat", sets: [{ weight: 185, reps: 5 }] },
            { date: "2026-09-28", mode: "reps", name: "Back Squat", sets: [{ weight: 175, reps: 5 }] }
        ],
        "pull-up": [{ date: "2026-10-01", mode: "reps", name: "Pull-up", sets: [{ weight: 0, reps: 8 }] }]
    };
    const merged = mergeHistories(own, extra);
    assert.deepEqual(merged["back squat"].map(e => e.date), ["2026-10-05", "2026-09-28"]);
    assert.equal(merged["pull-up"].length, 1);
    assert.equal(own["back squat"].length, 1, "the device's history isn't changed");
    assert.equal(allProgress(merged, "2026-10-10").length, 2);
    assert.deepEqual(mergeHistories(null, null), {});
});

test("lastLifts: each lift's latest session, top set and best estimate", async () => {
    const { lastLifts } = await import("../js/strengthProgress.js");
    const lifts = lastLifts({
        "back squat": [
            { date: "2026-10-06", mode: "reps", name: "Back Squat", sets: [{ weight: 175, reps: 5 }, { weight: 175, reps: 5 }] },
            { date: "2026-09-01", mode: "reps", name: "Back Squat", sets: [{ weight: 190, reps: 5 }] }
        ],
        "pull-up": [{ date: "2026-10-01", mode: "reps", name: "Pull-up", bw: true, sets: [{ weight: 0, reps: 9 }] }]
    });
    assert.equal(lifts["back squat"].date, "2026-10-06");
    assert.deepEqual(lifts["back squat"].top, { weight: 175, reps: 5 });
    assert.equal(lifts["back squat"].sets, 2);
    assert.ok(lifts["back squat"].best > lifts["back squat"].e1rm, "the best estimate is the September one");
    assert.equal(lifts["pull-up"].top.reps, 9);
    assert.equal(lifts["pull-up"].bw, true);
    assert.deepEqual(lastLifts(null), {});
});

test("lastLifts before a date, and the words for a lift", async () => {
    const { lastLifts, lastLiftWords } = await import("../js/strengthProgress.js");
    const h = { "back squat": [
        { date: "2026-10-13", mode: "reps", sets: [{ weight: 185, reps: 5 }] },
        { date: "2026-10-06", mode: "reps", sets: [{ weight: 175, reps: 5 }, { weight: 175, reps: 5 }] }
    ], "plank": [{ date: "2026-10-20", mode: "time", sets: [{ duration: 60 }] }] };
    const before = lastLifts(h, { before: "2026-10-13" });
    assert.equal(before["back squat"].date, "2026-10-06", "the session's own day is left out");
    assert.equal(before.plank, undefined, "nothing before the date = no entry");
    assert.deepEqual(lastLiftWords(before["back squat"]), { when: "Oct 6", what: "175 × 5", sets: 2 });
    assert.equal(lastLiftWords(lastLifts(h).plank).what, "60 sec");
    assert.equal(lastLiftWords(null), null);
});

test("recordsOn: what a day beat, one line per lift", async () => {
    const { recordsOn } = await import("../js/strengthProgress.js");
    const h = {
        "back squat": [
            { date: "2026-10-13", name: "Back Squat", mode: "reps", sets: [{ weight: 185, reps: 5 }] },
            { date: "2026-10-06", name: "Back Squat", mode: "reps", sets: [{ weight: 175, reps: 5 }] }
        ],
        "pull-up": [
            { date: "2026-10-13", name: "Pull-up", mode: "reps", bw: true, sets: [{ weight: 0, reps: 10 }] },
            { date: "2026-10-06", name: "Pull-up", mode: "reps", bw: true, sets: [{ weight: 0, reps: 8 }] }
        ],
        "deadlift": [
            { date: "2026-10-13", name: "Deadlift", mode: "reps", sets: [{ weight: 200, reps: 5 }] },
            { date: "2026-10-01", name: "Deadlift", mode: "reps", sets: [{ weight: 250, reps: 5 }] }
        ],
        "plank": [{ date: "2026-10-13", name: "Plank", mode: "time", sets: [{ duration: 60 }] }]
    };
    const recs = recordsOn(h, "2026-10-13");
    assert.deepEqual(recs.map(r => r.name), ["Back Squat", "Pull-up"], "a lower deadlift and a first plank aren't records");
    assert.match(recs[0].line, /^est\. 1RM 216 lb \(best was 204\)$/);
    assert.equal(recs[1].line, "most reps: 10 (was 8)");
    assert.deepEqual(recordsOn(h, "2026-10-06").map(r => r.name), [], "first sessions set no records");
    assert.deepEqual(recordsOn({}, "2026-10-13"), []);
});

test("recordsOn shows weights in kg when asked", async () => {
    const { recordsOn } = await import("../js/strengthProgress.js");
    const h = { "back squat": [
        { date: "2026-10-13", name: "Back Squat", mode: "reps", sets: [{ weight: 185, reps: 5 }] },
        { date: "2026-10-06", name: "Back Squat", mode: "reps", sets: [{ weight: 175, reps: 5 }] }
    ] };
    assert.equal(recordsOn(h, "2026-10-13", { unit: "kg" })[0].line, "est. 1RM 98 kg (best was 93)");
});
