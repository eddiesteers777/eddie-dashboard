// Completed sessions: one record for runs, strength and cross-training (js/completedSessions.js),
// and the share cards drawn from them (js/executionShare.js sessionCardModel).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    strengthSession, strengthTotals, crossSession, crossTotals, runFromWatch, runFromLog, sessionFromResult,
    cleanStored, editSession, deletedMarker, resumableSession, recordShare, buildFeed, weekTotals, sessionLine,
    newSessionId, localDay, storageKey, MILE, RESUME_WINDOW_MS
} from "../js/completedSessions.js";
import { sessionCardModel, captionText, cardHeight, MIN_H, MAX_SET_ROWS, isAppleMobile, fileNameFor } from "../js/executionShare.js";

const T0 = new Date(2026, 9, 10, 18, 0).getTime();   // Sat Oct 10, 6 pm (local)
const MIN = 60000;

const day = (over = {}) => ({
    id: "d1", name: "Leg Day",
    exercises: [
        { name: "Back Squat", mode: "reps", sets: [
            { type: "warmup", weight: 95, reps: 8, done: true },
            { weight: 185, reps: 5, done: true }, { weight: 185, reps: 5, done: true }, { weight: 185, reps: 5, done: false }] },
        { name: "Pull-up", mode: "reps", load: "bw", sets: [{ weight: 0, reps: 10, done: true }, { weight: 25, reps: 6, done: true }] },
        { name: "Plank", mode: "time", sets: [{ duration: 60, done: true }] },
        { name: "Lunge", mode: "reps", sets: [{ weight: 40, reps: 10, done: false }] }
    ],
    ...over
});
const bw = ex => ex.load === "bw";

test("strength: only ticked sets, honest totals, duration only from a real timer", () => {
    const s = strengthSession(day(), { id: "st-1", startedAt: T0 - 52 * MIN, completedAt: T0, isBodyweight: bw });
    assert.equal(s.type, "strength");
    assert.equal(s.status, "completed");
    assert.equal(s.date, "2026-10-10");
    assert.equal(s.durationSec, 52 * 60);
    assert.deepEqual(s.strength.exercises.map(e => [e.name, e.sets.length]), [["Back Squat", 3], ["Pull-up", 2], ["Plank", 1]], "the unticked set and the untouched exercise are left out");
    const t = strengthTotals(s);
    assert.equal(t.sets, 5, "warm-ups aren't counted as sets");
    assert.equal(t.warmups, 1);
    assert.equal(t.volumeLb, 185 * 5 * 2, "volume = weighted working sets only: no warm-up, no bodyweight (even with added load), no plank");
    const noTimer = strengthSession(day(), { id: "st-2", startedAt: null, completedAt: T0, isBodyweight: bw });
    assert.equal(noTimer.durationSec, null, "no timer: no duration, never 0:00");
    assert.equal(strengthSession(day(), { startedAt: T0 - 5000, completedAt: T0 }).durationSec, null, "a few seconds isn't a workout's length");
    assert.equal(strengthSession({ name: "Empty", exercises: [{ name: "Row", sets: [{ weight: 50, reps: 10 }] }] }, { completedAt: T0 }), null, "nothing ticked: nothing saved unless asked");
    assert.equal(strengthSession({ name: "Untouched", exercises: [{ name: "Row", sets: [{ weight: 50, reps: 10 }] }] }, { completedAt: T0, includeAll: true }).strength.exercises[0].sets.length, 1, "includeAll keeps the old behaviour when the person says so");
});

test("cross-training: blocks done, minutes from the blocks unless typed, intensity only when known", () => {
    const workout = { id: "ct_a", name: "Zone 2 Ride", category: "cycling", blocks: [
        { id: "b1", label: "Warm-up", duration: 10, intensity: "easy" },
        { id: "b2", label: "Main Set", duration: 30, intensity: "moderate" },
        { id: "b3", label: "Cooldown", duration: 5, intensity: "easy" }] };
    const s = crossSession(workout, { date: "2026-10-09", done: ["b1", "b2"], completedAt: T0 });
    assert.equal(s.date, "2026-10-09");
    assert.equal(s.durationSec, 40 * 60);
    assert.equal(s.cross.activity, "cycling");
    assert.equal(s.cross.intensity, "moderate", "the done blocks' main intensity");
    assert.deepEqual(crossTotals(s), { blocks: 3, done: 2 });
    assert.equal(crossSession(workout, { minutes: 50, completedAt: T0 }).durationSec, 3000, "typed minutes win");
    const plain = crossSession(null, { activity: "swimming", minutes: 30, completedAt: T0 });
    assert.equal(plain.title, "Swimming");
    assert.equal(plain.cross.intensity, null, "no intensity nobody chose");
    assert.equal(plain.cross.blocks.length, 0);
    assert.equal(crossSession(null, { activity: "yoga", completedAt: T0 }), null, "no minutes and no blocks: nothing to save");
});

test("runs read from where they live; ids match the athlete ledger; missing numbers stay missing", () => {
    const c = runFromWatch({ labelId: "4711", date: "2026-10-08", startTime: "2026-10-08T10:00:00Z", distance: 10000, duration: 2700, avgHr: 151.4, name: "Pelham Run" }, { category: "Speed Work" });
    assert.equal(c.id, "c:4711");
    assert.equal(c.run.paceSec, Math.round(2700 / (10000 / MILE)));
    assert.equal(c.run.avgHr, 151);
    assert.equal(c.run.category, "Speed Work");
    const st = runFromWatch({ source: "strava", key: "f123", date: "2026-10-07", distance: 8000, duration: null });
    assert.equal(st.id, "s:f123");
    assert.equal(st.durationSec, null);
    assert.equal(st.run.paceSec, null, "no time: no pace");
    const log = runFromLog({ id: "abc", date: "2026-10-06", miles: 4, type: "Easy", notes: "felt good" });
    assert.equal(log.id, "l:abc");
    assert.equal(log.durationSec, null, "the Running Log has no duration");
    assert.equal(sessionLine(log), "4.00 mi");
    assert.equal(runFromWatch({ date: "2026-10-01", distance: 0 }), null);
});

test("a client's plan logs become sessions; skipped ones don't", () => {
    const run = sessionFromResult({ id: "u_p_2026-10-05", status: "completed", date: "2026-10-05", title: "Tempo", distance: 6.2, durationSec: 2900, plannedMiles: 6 });
    assert.equal(run.type, "run");
    assert.equal(Math.round(run.run.meters), Math.round(6.2 * MILE));
    const lift = sessionFromResult({ id: "u_p_2026-10-05_strength", kind: "strength", status: "completed", date: "2026-10-05", title: "Runner Strength A", exercises: [{ name: "Goblet Squat", sets: [{ weight: 40, reps: 10 }, { weight: 0, reps: 0 }] }] });
    assert.equal(lift.type, "strength");
    assert.equal(lift.strength.exercises[0].sets.length, 1, "empty sets dropped");
    assert.equal(sessionFromResult({ status: "skipped", date: "2026-10-05" }), null);
});

test("the feed: newest first, each workout once, deleted ones gone, shares attached", () => {
    const watch = [runFromWatch({ labelId: "1", date: "2026-10-08", startTime: "2026-10-08T10:00:00Z", distance: 9656, duration: 2900 })];
    const logs = [
        runFromLog({ id: "dupe", date: "2026-10-08", miles: 6, corosActivityId: "1", source: "coros" }),
        runFromLog({ id: "typed", date: "2026-10-08", miles: 6.05 }),
        runFromLog({ id: "own", date: "2026-10-04", miles: 3 })
    ];
    const results = [sessionFromResult({ id: "r1", status: "completed", date: "2026-10-08", title: "6 x 800", distance: 6, durationSec: 2900, plannedMiles: 6 })];
    const lift = strengthSession(day(), { id: "st-a", startedAt: T0 - 40 * MIN, completedAt: T0, isBodyweight: bw });
    const older = { ...lift, id: "st-b", date: "2026-10-09", completedAt: T0 - 86400000, updatedAt: 1 };
    const stored = [lift, older, deletedMarker("st-b", T0 + 1), { ...lift, updatedAt: lift.updatedAt - 5, title: "Stale copy" }];
    const feed = buildFeed({ stored, watchRuns: watch, logRuns: logs, results, shares: { "c:1": { count: 1, lastAt: T0, via: "share" } } });
    assert.deepEqual(feed.map(s => s.id), ["st-a", "c:1", "l:own"], "COROS import, a hand copy of the same run and the plan log all fold into the watch run; the deleted session is gone");
    assert.equal(feed[0].title, "Leg Day", "the newer copy of a session wins");
    assert.equal(feed[1].title, "6 x 800", "the watch run takes the plan's title");
    assert.equal(feed[1].share.count, 1);
    assert.equal(buildFeed({}).length, 0, "nothing: an empty feed, no errors");
});

test("editing changes only the session: same id and done time, totals follow, bad input ignored", () => {
    const s = strengthSession(day(), { id: "st-e", startedAt: T0 - 50 * MIN, completedAt: T0, isBodyweight: bw });
    const ex = JSON.parse(JSON.stringify(s.strength.exercises));
    ex[0].sets[1].w = 195;
    const e = editSession(s, { title: "  Heavy legs ", durationSec: 3300, exercises: ex, date: "2099-01-01", type: "run", id: "hacked" }, T0 + MIN);
    assert.equal(e.id, "st-e");
    assert.equal(e.type, "strength");
    assert.equal(e.completedAt, s.completedAt);
    assert.equal(e.title, "Heavy legs");
    assert.equal(e.durationSec, 3300);
    assert.equal(e.edited, true);
    assert.ok(e.updatedAt > s.updatedAt);
    assert.equal(strengthTotals(e).volumeLb, 195 * 5 + 185 * 5);
    assert.equal(editSession(s, { durationSec: null }).durationSec, null, "a duration can be cleared");
    const c = crossSession({ blocks: [{ id: "a", label: "A", duration: 10 }, { id: "b", label: "B", duration: 10 }] }, { completedAt: T0 });
    const ce = editSession(c, { blocksDone: [1], intensity: "extreme" });
    assert.deepEqual(ce.cross.blocks.map(b => b.done), [false, true]);
    assert.equal(ce.cross.intensity, null, "an unknown intensity isn't kept");
});

test("stored records from sync are checked; markers survive; ids are stable keys", () => {
    assert.equal(cleanStored("not json"), null);
    assert.equal(cleanStored({ id: "x", type: "run", date: "2026-10-01" }), null, "runs are never stored, so a stored 'run' is junk");
    assert.deepEqual(cleanStored(JSON.stringify(deletedMarker("st-z", 5))), { id: "st-z", deleted: true, updatedAt: 5 });
    const id = newSessionId("strength", T0, () => 0.123456789);
    assert.match(id, /^st-[0-9a-z]+-[0-9a-z]{5}$/);
    assert.equal(storageKey(id), `workout-session-${id}`);
    assert.equal(localDay(T0), "2026-10-10");
});

test("finishing the same workout again today updates it instead of adding another", () => {
    const s = strengthSession(day(), { id: "st-r", startedAt: T0 - 50 * MIN, completedAt: T0, isBodyweight: bw });
    assert.equal(resumableSession([s], "d1", T0 + 30 * MIN)?.id, "st-r");
    assert.equal(resumableSession([s], "d1", T0 + RESUME_WINDOW_MS + MIN), null, "hours later it's a new workout");
    assert.equal(resumableSession([s], "other", T0 + MIN), null);
    assert.equal(resumableSession([deletedMarker("st-r")], "d1", T0), null);
});

test("share history counts shares and saves", () => {
    let shares = recordShare({}, "c:1", "share", 10);
    shares = recordShare(shares, "c:1", "save", 20);
    assert.deepEqual(shares["c:1"], { count: 2, lastAt: 20, via: "save" });
});

test("this week's totals by type only add what was measured", () => {
    const today = "2026-10-10";
    const feed = [
        runFromWatch({ labelId: "1", date: "2026-10-06", distance: 16093, duration: 5000 }),
        runFromLog({ id: "x", date: "2026-10-04", miles: 9 }),
        strengthSession(day(), { id: "st", startedAt: T0 - 40 * MIN, completedAt: T0, isBodyweight: bw }),
        crossSession(null, { activity: "rowing", minutes: 25, date: "2026-10-07", completedAt: T0 })
    ];
    const w = weekTotals(feed, today);
    assert.equal(w.from, "2026-10-05");
    assert.equal(w.run.count, 1, "Sunday before isn't this week");
    assert.equal(Math.round(w.run.meters), 16093);
    assert.equal(w.strength.sets, 5);
    assert.equal(w.cross.minutes, 25);
});

/* ---------- share cards ---------- */

test("run card: distance, time, pace (no target invented); a log run shows only its miles", () => {
    const m = sessionCardModel(runFromWatch({ labelId: "9", date: "2026-10-08", distance: 10000, duration: 2700, avgHr: 150, name: "Morning run" }, { category: "Long Run" }));
    assert.equal(m.kind, "run");
    assert.equal(m.title, "Long Run");
    assert.deepEqual(m.stats.map(s => s.label), ["Distance", "Time", "Avg pace", "Avg HR"]);
    const plain = sessionCardModel(runFromLog({ id: "l", date: "2026-10-06", miles: 4, type: "Easy" }));
    assert.equal(plain.title, "Easy run");
    assert.deepEqual(plain.stats, [{ label: "Distance", value: "4.00 mi" }]);
    assert.equal(plain.summary, "", "no filler line when there's nothing more to say");
});

test("strength card: duration, exercises, completed sets, volume in the person's unit; sets row by row", () => {
    const s = strengthSession(day(), { id: "st-c", startedAt: T0 - 52 * MIN, completedAt: T0, isBodyweight: bw });
    const m = sessionCardModel(s, { unit: "lb" });
    assert.equal(m.kind, "strength");
    assert.equal(m.title, "Leg Day");
    assert.deepEqual(m.stats, [
        { label: "Duration", value: "52:00" }, { label: "Exercises", value: "3" }, { label: "Sets", value: "5" }, { label: "Volume (lb)", value: "1,850" }]);
    assert.deepEqual(m.sets[0].rows.map(r => [r.label, r.actual]), [["Warm-up", "95 × 8"], ["Set 1", "185 × 5"], ["Set 2", "185 × 5"]]);
    assert.equal(m.sets[0].summary, "1,850 lb");
    assert.deepEqual(m.sets[1].rows.map(r => r.actual), ["BW × 10", "BW+25 × 6"]);
    assert.equal(m.sets[1].summary, "Bodyweight");
    assert.equal(m.sets[2].rows[0].actual, "1:00");
    const kg = sessionCardModel(s, { unit: "kg" });
    assert.equal(kg.stats[3].label, "Volume (kg)");
    assert.equal(kg.sets[0].rows[1].actual, "83.9 × 5");
    const noTimer = sessionCardModel({ ...s, durationSec: null });
    assert.ok(!noTimer.stats.some(st => st.label === "Duration"), "no timer: no duration on the card");
    const bwOnly = sessionCardModel(strengthSession({ name: "Calisthenics", exercises: [{ name: "Push-up", load: "bw", sets: [{ reps: 20, done: true }] }] }, { completedAt: T0, isBodyweight: bw }));
    assert.ok(!bwOnly.stats.some(st => st.label.startsWith("Volume")), "bodyweight only: no made-up volume");
    assert.ok(cardHeight(m) >= MIN_H);
    assert.match(captionText(m), /Leg Day[\s\S]*Back Squat \(2 sets\): 95 × 8, 185 × 5, 185 × 5/);
});

test("a long strength workout folds to one line per exercise instead of a giant image", () => {
    const many = { name: "Volume Day", exercises: Array.from({ length: 8 }, (_, i) => ({ name: `Lift ${i + 1}`, mode: "reps", sets: Array.from({ length: 4 }, () => ({ weight: 100, reps: 10, done: true })) })) };
    const m = sessionCardModel(strengthSession(many, { completedAt: T0 }));
    assert.ok(32 > MAX_SET_ROWS);
    assert.ok(m.sets.every(set => set.rows.length === 0 && /Top 100 × 10/.test(set.summary)));
    assert.ok(cardHeight(m) < 2400);
});

test("cross-training card: activity, duration, intensity, blocks done", () => {
    const s = crossSession({ id: "w", name: "Hill Ride", category: "cycling", blocks: [{ id: "a", label: "Warm-up", duration: 10, intensity: "easy" }, { id: "b", label: "Climbs", duration: 30, intensity: "hard" }] }, { done: ["a", "b"], completedAt: T0 });
    const m = sessionCardModel(s);
    assert.equal(m.kind, "cross");
    assert.equal(m.title, "Hill Ride");
    assert.equal(m.name, "Cycling");
    assert.deepEqual(m.stats, [{ label: "Duration", value: "40 min" }, { label: "Intensity", value: "Hard" }, { label: "Blocks", value: "2/2" }]);
    assert.deepEqual(m.sets[0].rows.map(r => [r.label, r.actual, r.result]), [["Warm-up", "10 min", "Done"], ["Climbs", "30 min", "Done"]]);
    const bare = sessionCardModel(crossSession(null, { activity: "yoga", minutes: 45, completedAt: T0 }));
    assert.deepEqual(bare.stats, [{ label: "Duration", value: "45 min" }], "no intensity, no blocks: not shown");
    assert.equal(bare.sets.length, 0);
});

test("share helpers: iPhone / iPad detection and file names", () => {
    assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }), true);
    assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }), true, "iPadOS says it's a Mac");
    assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }), false);
    assert.equal(isAppleMobile({ userAgent: "Mozilla/5.0 (Linux; Android 14)" }), false);
    assert.equal(fileNameFor({ kind: "strength" }, "2026-10-10"), "southbound-strength-2026-10-10.png");
    assert.equal(fileNameFor({ kind: "run" }, "2026-10-10"), "southbound-workout-2026-10-10.png");
});
