// Unit tests for plan days as COROS workouts (js/corosWorkout.js). Run: npm run test:static
import { test } from "node:test";
import assert from "node:assert/strict";
import { courseFromDay, effortZone, paceRangePerKm, courseHash, sendableDate, idInPlanFrom } from "../js/corosWorkout.js";

const tempo = {
    type: "workout", miles: 6, session: "tempo",
    workout: {
        warmup: { amount: 1.5, unit: "mi", note: "easy" },
        sets: [{ repeat: 3, amount: 1, unit: "mi", pace: "", effort: "tempo", recovery: { amount: 2, unit: "min", note: "easy jog" } }],
        cooldown: { amount: 1.5, unit: "mi", note: "" },
        why: "Raises the pace you can hold.", cue: "Controlled."
    }
};

test("a structured tempo run becomes warm-up, an interval group and cool-down", () => {
    const c = courseFromDay(tempo, { title: "Tempo run", coachName: "Eddie" });
    assert.equal(c.sportType, 1);
    assert.equal(c.courseName, "Tempo run · 6 mi");
    assert.deepEqual(c.sections, [
        { sectionType: 1, targetType: 1, targetValue: 2414, intensityType: 1, sectionIntensity: 2 },
        { intervalGroup: true, repeats: 3, sets: [
            { sectionType: 2, targetType: 1, targetValue: 1609, intensityType: 2, sectionIntensity: 4 },
            { sectionType: 3, targetType: 2, targetValue: 120, intensityType: 1, sectionIntensity: 1 }
        ] },
        { sectionType: 4, targetType: 1, targetValue: 2414, intensityType: 1, sectionIntensity: 2 }
    ]);
    assert.match(c.courseDescription, /^Warm up 1\.5 mi, 3 × 1 mi @ tempo effort \(2 min easy jog\), Cool down 1\.5 mi/);
    assert.match(c.courseDescription, /Raises the pace you can hold\.\n\nCue: Controlled\./);
    assert.match(c.courseDescription, /Targets: easy parts by heart-rate zone, harder parts by pace zone, from your COROS zones\./);
    assert.match(c.courseDescription, /From Eddie · Southbound Coaching$/);
    // Interval containers carry no target or intensity of their own (COROS rule).
    assert.equal(c.sections[1].targetType, undefined);
    assert.equal(c.sections[1].intensityType, undefined);
});

test("exact paces go as pace ranges per km; more than 20 reps split", () => {
    const c = courseFromDay({ type: "workout", miles: 7, workout: { sets: [{ repeat: 24, amount: 400, unit: "m", pace: "6:00-6:10", recovery: null }] } }, { title: "Track" });
    assert.deepEqual(c.sections.map(s => s.repeats), [20, 4]);
    assert.deepEqual(c.sections[0].sets[0], { sectionType: 2, targetType: 1, targetValue: 400, intensityType: 2, intensityValueStart: 224, intensityValueEnd: 230 });
    assert.match(c.courseDescription, /the paces your coach set/);
    assert.deepEqual(paceRangePerKm("8:00"), { intensityType: 2, intensityValueStart: 298, intensityValueEnd: 298 });
    assert.equal(paceRangePerKm("fast"), null);
});

test("a plain day is one section zoned by its type; nothing to run -> null", () => {
    assert.deepEqual(courseFromDay({ type: "easy", miles: 5, session: "easy" }, { title: "Easy run" }).sections,
        [{ sectionType: 2, targetType: 1, targetValue: 8047, intensityType: 1, sectionIntensity: 2 }]);
    assert.equal(courseFromDay({ type: "long", miles: 12 }).sections[0].sectionIntensity, 2);
    assert.equal(courseFromDay({ type: "recovery", miles: 3 }).sections[0].sectionIntensity, 1);
    assert.equal(courseFromDay({ type: "strength", miles: 0, session: "Lower body" }), null);
    assert.equal(courseFromDay({ type: "rest", miles: 0 }), null);
    assert.equal(courseFromDay(null), null);
});

test("effort words map to COROS zones", () => {
    const z = t => { const x = effortZone(t, { intensityType: 2, sectionIntensity: 3 }); return `${x.intensityType === 1 ? "HR" : "pace"}${x.sectionIntensity}`; };
    assert.deepEqual(["easy", "recovery jog", "marathon", "half marathon", "tempo", "threshold", "5K", "hard uphill", "mile to 3K", "strides", "fast, relaxed", "race", "whatever"].map(z),
        ["HR2", "HR1", "pace3", "pace4", "pace4", "pace4", "pace5", "pace5", "pace6", "pace6", "pace6", "pace4", "pace3"]);
});

test("helpers: change fingerprint, COROS's date window, idInPlan from a reply", () => {
    const a = courseFromDay(tempo, { title: "Tempo run" });
    assert.equal(courseHash(a), courseHash(JSON.parse(JSON.stringify(a))));
    assert.notEqual(courseHash(a), courseHash({ ...a, courseName: "Tempo run · 7 mi" }));
    assert.ok(sendableDate("2026-09-26", "2026-09-26"));
    assert.ok(sendableDate("2026-12-25", "2026-09-26"), "90 days out");
    assert.ok(!sendableDate("2026-12-26", "2026-09-26"), "91 days out");
    assert.ok(!sendableDate("2026-09-25", "2026-09-26"), "yesterday");
    assert.equal(idInPlanFrom({ content: [{ type: "text", text: '{"idInPlan":"1234567890123","date":"20260927"}' }] }), "1234567890123");
    assert.equal(idInPlanFrom("Created. idInPlan: 987654321"), "987654321");
    assert.equal(idInPlanFrom({ content: [{ type: "text", text: "Created." }] }), null);
});
