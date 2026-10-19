// Unit tests for the Garmin workout file (js/fitWorkout.js). Run: npm run test:static
// Garmin's FIT SDK (@garmin/fitsdk) is a dev-only dependency used here as the
// reference decoder/encoder. It is never shipped with the site (its license
// doesn't allow publishing it), only installed by npm for these tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Decoder, Encoder, Profile, Stream } from "@garmin/fitsdk";
import { garminWorkout, workoutSteps, fitCrc, speedRange, ascii, fitFilename } from "../js/fitWorkout.js";
import { readFit } from "../js/fitParse.js";

const CREATED = Date.UTC(2026, 9, 19, 12) / 1000;

function decode(bytes) {
    const d = new Decoder(Stream.fromByteArray([...bytes]));
    assert.equal(d.isFIT(), true);
    assert.equal(d.checkIntegrity(), true, "header, size and CRC are valid");
    const { messages, errors } = d.read();
    assert.deepEqual(errors, []);
    return messages;
}

const intervals = {
    type: "workout", miles: 7,
    workout: {
        warmup: { amount: 1.5, unit: "mi", note: "easy" },
        sets: [
            { repeat: 4, amount: 1, unit: "mi", pace: "7:05-7:15", effort: "", recovery: { amount: 2, unit: "min", note: "easy jog" } },
            { repeat: 1, amount: 10, unit: "min", pace: "", effort: "tempo" }
        ],
        cooldown: { amount: 1, unit: "mi", note: "" }
    }
};

test("a structured workout decodes in Garmin's SDK, step by step", () => {
    const g = garminWorkout(intervals, { title: "Tempo run", createdSec: CREATED });
    const m = decode(g.bytes);
    assert.equal(m.fileIdMesgs[0].type, "workout");
    assert.equal(m.fileIdMesgs[0].timeCreated.toISOString(), "2026-10-19T12:00:00.000Z");
    assert.deepEqual(m.workoutMesgs[0], { sport: "running", numValidSteps: 6, wktName: "Tempo run 7 mi", subSport: "generic" });
    const s = m.workoutStepMesgs;
    assert.equal(s.length, 6);
    assert.deepEqual([s[0].wktStepName, s[0].intensity, s[0].durationDistance, s[0].targetType], ["Warm up", "warmup", 2414.02, "open"]);
    assert.deepEqual([s[1].wktStepName, s[1].intensity, s[1].durationDistance, s[1].targetType], ["Rep", "active", 1609.34, "speed"]);
    // 7:15/mi is the slow end, 7:05/mi the fast end, in m/s.
    assert.deepEqual([s[1].customTargetSpeedLow, s[1].customTargetSpeedHigh, s[1].notes], [3.7, 3.787, "@ 7:05-7:15/mi"]);
    assert.deepEqual([s[2].wktStepName, s[2].intensity, s[2].durationTime, s[2].notes], ["Recover", "recovery", 120, "easy jog"]);
    // The repeat goes back to step 1, four times.
    assert.deepEqual([s[3].durationType, s[3].durationStep, s[3].repeatSteps], ["repeatUntilStepsCmplt", 1, 4]);
    assert.deepEqual([s[4].wktStepName, s[4].durationTime, s[4].targetType, s[4].notes], ["Tempo", 600, "open", "tempo effort"]);
    assert.deepEqual([s[5].intensity, s[5].durationDistance], ["cooldown", 1609.34]);
});

test("a plain easy day is one distance step at heart-rate zone 2", () => {
    const g = garminWorkout({ type: "easy", miles: 6, session: "6 mi easy" }, { title: "Easy run", createdSec: CREATED });
    const [step] = decode(g.bytes).workoutStepMesgs;
    assert.deepEqual([step.wktStepName, step.durationDistance, step.targetType, step.targetHrZone], ["Easy run", 9656.06, "heartRate", 2]);
});

test("a mixed repeat and a run/walk session", () => {
    const mixed = { type: "workout", miles: 8, workout: { sets: [{ repeat: 4, parts: [{ amount: 1, unit: "mi", pace: "6:58-7:05" }, { amount: 1, unit: "mi", pace: "6:35-6:50" }] }] } };
    const s = decode(garminWorkout(mixed, { createdSec: CREATED }).bytes).workoutStepMesgs;
    assert.equal(s.length, 3);
    assert.deepEqual([s[2].durationStep, s[2].repeatSteps], [0, 4]);
    const runWalk = { type: "easy", miles: 0, workout: { sets: [{ repeat: 8, amount: 2, unit: "min", effort: "easy", recovery: { amount: 1, unit: "min", note: "walk" } }] } };
    const r = decode(garminWorkout(runWalk, { createdSec: CREATED }).bytes).workoutStepMesgs;
    assert.deepEqual(r.map(x => x.durationTime ?? x.repeatSteps), [120, 60, 8]);
    assert.deepEqual([r[0].targetType, r[0].targetHrZone], ["heartRate", 2]);
});

test("nothing to run: rest, strength-only, empty days", () => {
    assert.equal(garminWorkout({ type: "rest", miles: 0 }), null);
    assert.equal(garminWorkout({ type: "easy", miles: 0, session: "" }), null);
    assert.equal(garminWorkout(null), null);
    assert.deepEqual(workoutSteps({ type: "workout", miles: 0, workout: { why: "Just a note" } }), []);
});

test("watch-safe text, the file name, pace to speed", () => {
    assert.equal(ascii("8:05–8:15 × 3 · café"), "8:05-8:15 x 3 cafe");
    assert.equal(fitFilename("2026-10-21", "Tempo run"), "southbound-2026-10-21-tempo-run.fit");
    const r = speedRange("8:00");
    assert.equal(r.low, r.high);
    assert.equal(Math.round(r.low * 1000), 3353);
    // A long name is cut to fit, never past its field.
    const g = garminWorkout({ type: "easy", miles: 5, session: "x".repeat(200) }, { title: "A very long workout title that goes on and on", createdSec: CREATED });
    const m = decode(g.bytes);
    assert.ok(m.workoutMesgs[0].wktName.length <= 39);
    assert.ok(m.workoutStepMesgs[0].notes.length <= 47);
});

test("the CRC matches FIT's published check value", () => {
    // The 12-byte header from Garmin's own documentation example ends in CRC 0x8596.
    assert.equal(fitCrc([0x0E, 0x10, 0x43, 0x08, 0x78, 0x06, 0x09, 0x00, 0x2E, 0x46, 0x49, 0x54]), 0x8596);
});

test("Southbound's own .fit reader agrees with a run written by Garmin's SDK", () => {
    // Guards js/fitParse.js (Strava archive import) against real, CRC-valid FIT files.
    const start = new Date(Date.UTC(2026, 9, 18, 11, 0, 0));
    const at = s => new Date(start.getTime() + s * 1000);
    const e = new Encoder();
    e.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "garmin", product: 3113, timeCreated: start });
    for (let t = 0; t <= 1500; t += 5) e.onMesg(Profile.MesgNum.RECORD, { timestamp: at(t), distance: t * 10 / 3, heartRate: 150 });
    for (let k = 0; k < 5; k++) {
        e.onMesg(Profile.MesgNum.LAP, { timestamp: at((k + 1) * 300), startTime: at(k * 300), totalElapsedTime: 300, totalTimerTime: 300, totalDistance: 1000, avgHeartRate: 150, intensity: "active" });
    }
    e.onMesg(Profile.MesgNum.SESSION, { timestamp: at(1500), startTime: start, sport: "running", subSport: "generic", totalElapsedTime: 1500, totalTimerTime: 1500, totalDistance: 5000, avgHeartRate: 150, maxHeartRate: 165, totalAscent: 12, totalCalories: 320 });
    e.onMesg(Profile.MesgNum.ACTIVITY, { timestamp: at(1500), localTimestamp: Math.round((start.getTime() / 1000) - 631065600 + 1500 - 4 * 3600), numSessions: 1 });
    const a = readFit(e.close());
    assert.equal(a.start, "2026-10-18T11:00:00.000Z");
    assert.deepEqual([a.distance, a.duration, a.avgHr, a.maxHr, a.ascent, a.calories], [5000, 1500, 150, 165, 12, 320]);
    assert.equal(a.offsetMin, -240);
    assert.equal(a.localDate, "2026-10-18");
    assert.equal(a.laps.length, 5);
    assert.deepEqual(a.laps[0], { i: 1, m: 1000, s: 300, hr: 150, intensity: 0 });
    assert.equal(a.best.k5, 1500);
});
